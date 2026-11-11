'use strict';
/* Git et GitHub pour le Dev Lab, sans installer Git : isomorphic-git (clone, état, commit, push, pull,
 * branches, historique) et l'API GitHub (compte, dépôts, création, GitHub Pages, archive ZIP).
 * Le jeton d'accès est chiffré par le trousseau du système (safeStorage). */
const fs = require('fs');
const path = require('path');
const git = require('isomorphic-git');
const http = require('isomorphic-git/http/node');

const API = 'https://api.github.com';
const DEFAULT_IGNORE = `# Dépendances et fichiers générés
node_modules/
dist/
build/
.next/
.nuxt/
.svelte-kit/
.output/
.cache/
coverage/
.dart_tool/
.flutter-plugins*
# Environnement et secrets
.env
.env.*
!.env.example
*.keystore
*.jks
*.p12
# Système
.DS_Store
Thumbs.db
`;

class GitHub {
  constructor({ store, safeStorage, fetchImpl }) {
    this.store = store; // fichier JSON du jeton chiffré
    this.safe = safeStorage;
    this.fetch = fetchImpl || fetch;
    this.user = null;
  }

  token() {
    try {
      const j = JSON.parse(fs.readFileSync(this.store, 'utf8'));
      if (j.enc && this.safe && this.safe.isEncryptionAvailable()) return this.safe.decryptString(Buffer.from(j.enc, 'base64'));
      return j.plain || null;
    } catch { return null; }
  }

  saveToken(t) {
    fs.mkdirSync(path.dirname(this.store), { recursive: true });
    const data = this.safe && this.safe.isEncryptionAvailable() ? { enc: this.safe.encryptString(t).toString('base64') } : { plain: t };
    fs.writeFileSync(this.store, JSON.stringify(data), { mode: 0o600 });
  }

  forget() {
    try { fs.rmSync(this.store, { force: true }); } catch { /* absent */ }
    this.user = null;
  }

  async api(p, { method = 'GET', body, token } = {}) {
    const t = token || this.token();
    const r = await this.fetch(p.startsWith('http') ? p : `${API}${p}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'NEXORA', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (!r.ok) {
      const msg = json && json.message ? json.message : `HTTP ${r.status}`;
      const err = new Error(r.status === 401 ? 'Jeton GitHub refusé ou expiré.' : r.status === 403 && /rate limit/i.test(msg) ? 'Limite de requêtes GitHub atteinte, réessaie plus tard.' : r.status === 422 && json && json.errors ? `${msg} : ${json.errors.map((e) => e.message || e.code).join(', ')}` : msg);
      err.status = r.status;
      throw err;
    }
    return json;
  }

  async connect(token) {
    const u = await this.api('/user', { token });
    this.saveToken(token);
    this.user = u;
    return this.profile(u);
  }

  profile(u) {
    return {
      login: u.login, name: u.name || u.login, avatar: u.avatar_url, url: u.html_url, id: u.id, email: `${u.id}+${u.login}@users.noreply.github.com`,
    };
  }

  async me() {
    if (!this.token()) return null;
    if (!this.user) this.user = await this.api('/user');
    return this.profile(this.user);
  }

  async repos() {
    const out = [];
    for (let page = 1; page <= 5; page += 1) {
      const list = await this.api(`/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`);
      out.push(...list);
      if (list.length < 100) break;
    }
    return out.map((r) => ({
      name: r.name, full: r.full_name, private: r.private, url: r.html_url, clone: r.clone_url, branch: r.default_branch, updated: r.pushed_at || r.updated_at, description: r.description || '', language: r.language || '', pages: r.has_pages,
    }));
  }

  createRepo({ name, description, isPrivate }) {
    return this.api('/user/repos', { method: 'POST', body: { name, description: description || '', private: Boolean(isPrivate), auto_init: false } });
  }

  // --- Détails et réglages d'un dépôt --------------------------------------
  async repoInfo(full) {
    const r = await this.api(`/repos/${full}`);
    let topics = r.topics || [];
    if (!topics.length) { try { topics = (await this.api(`/repos/${full}/topics`)).names || []; } catch { topics = []; } }
    return {
      full: r.full_name, name: r.name, description: r.description || '', private: r.private, url: r.html_url, homepage: r.homepage || '',
      branch: r.default_branch, stars: r.stargazers_count, forks: r.forks_count, issues: r.open_issues_count, watchers: r.subscribers_count,
      language: r.language || '', license: r.license ? r.license.spdx_id : '', pushed: r.pushed_at, size: r.size, pages: r.has_pages, topics,
      permissions: r.permissions || {},
    };
  }

  updateRepo(full, body) { return this.api(`/repos/${full}`, { method: 'PATCH', body }); }

  setTopics(full, names) {
    return this.api(`/repos/${full}/topics`, { method: 'PUT', body: { names: (names || []).map((n) => String(n).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)).filter(Boolean).slice(0, 20) } });
  }

  // --- Pull requests --------------------------------------------------------
  async pulls(full, state = 'open') {
    const list = await this.api(`/repos/${full}/pulls?state=${state}&per_page=30&sort=updated&direction=desc`);
    return list.map((p) => ({ number: p.number, title: p.title, state: p.state, draft: p.draft, url: p.html_url, head: p.head.ref, base: p.base.ref, author: p.user ? p.user.login : '', updated: p.updated_at, comments: p.comments }));
  }

  createPull(full, { title, head, base, body, draft }) {
    return this.api(`/repos/${full}/pulls`, { method: 'POST', body: { title, head, base, body: body || '', draft: Boolean(draft) } });
  }

  // --- Issues (exclut les pull requests) ------------------------------------
  async issues(full, state = 'open') {
    const list = await this.api(`/repos/${full}/issues?state=${state}&per_page=30&sort=updated&direction=desc`);
    return list.filter((i) => !i.pull_request).map((i) => ({ number: i.number, title: i.title, state: i.state, url: i.html_url, author: i.user ? i.user.login : '', updated: i.updated_at, comments: i.comments, labels: (i.labels || []).map((l) => (typeof l === 'string' ? l : l.name)) }));
  }

  createIssue(full, { title, body, labels }) {
    return this.api(`/repos/${full}/issues`, { method: 'POST', body: { title, body: body || '', ...(labels && labels.length ? { labels } : {}) } });
  }

  closeIssue(full, number) { return this.api(`/repos/${full}/issues/${number}`, { method: 'PATCH', body: { state: 'closed' } }); }

  // --- GitHub Actions -------------------------------------------------------
  async workflowRuns(full) {
    const r = await this.api(`/repos/${full}/actions/runs?per_page=12`);
    return (r.workflow_runs || []).map((w) => ({
      id: w.id, name: w.name || w.display_title, title: w.display_title, status: w.status, conclusion: w.conclusion, branch: w.head_branch,
      event: w.event, url: w.html_url, number: w.run_number, created: w.created_at, actor: w.actor ? w.actor.login : '',
    }));
  }

  // --- Versions (releases / tags) ------------------------------------------
  async releases(full) {
    const list = await this.api(`/repos/${full}/releases?per_page=20`);
    return list.map((r) => ({ id: r.id, tag: r.tag_name, name: r.name || r.tag_name, draft: r.draft, prerelease: r.prerelease, url: r.html_url, published: r.published_at, author: r.author ? r.author.login : '' }));
  }

  createRelease(full, { tag, target, name, body, prerelease }) {
    return this.api(`/repos/${full}/releases`, { method: 'POST', body: { tag_name: tag, target_commitish: target || undefined, name: name || tag, body: body || '', prerelease: Boolean(prerelease), draft: false } });
  }

  async enablePages(full, branch = 'main', dir = '/') {
    try {
      await this.api(`/repos/${full}/pages`, { method: 'POST', body: { source: { branch, path: dir } } });
    } catch (e) {
      if (e.status !== 409) throw e; // déjà activé
      await this.api(`/repos/${full}/pages`, { method: 'PUT', body: { source: { branch, path: dir } } }).catch(() => {});
    }
    const p = await this.api(`/repos/${full}/pages`);
    return p.html_url;
  }

  onAuth() {
    const t = this.token();
    return t ? () => ({ username: 'x-access-token', password: t }) : undefined;
  }

  author() {
    const p = this.user ? this.profile(this.user) : null;
    return p ? { name: p.name, email: p.email } : { name: 'NEXORA', email: 'nexora@users.noreply.github.com' };
  }
}

// ------------------------------------------------------------------ dépôt local
async function isRepo(dir) {
  try { await git.findRoot({ fs, filepath: dir }); return fs.existsSync(path.join(dir, '.git')); } catch { return false; }
}

async function status(dir) {
  const root = path.join(dir, '.git');
  if (!fs.existsSync(root)) return { repo: false };
  const branch = await git.currentBranch({ fs, dir, fullname: false }).catch(() => null);
  const remotes = await git.listRemotes({ fs, dir }).catch(() => []);
  const matrix = await git.statusMatrix({ fs, dir });
  const files = [];
  for (const [file, head, work, stage] of matrix) {
    if (head === 1 && work === 1 && stage === 1) continue;
    let st = 'modifié';
    if (head === 0 && work === 2) st = 'nouveau';
    else if (head === 1 && work === 0) st = 'supprimé';
    files.push({
      file, status: st, staged: stage !== 1 && stage === work, head, work, stage,
    });
  }
  let ahead = null;
  let behind = null;
  const origin = remotes.find((r) => r.remote === 'origin');
  if (origin && branch) {
    try {
      const local = await git.resolveRef({ fs, dir, ref: branch });
      const remote = await git.resolveRef({ fs, dir, ref: `refs/remotes/origin/${branch}` });
      if (local === remote) { ahead = 0; behind = 0; } else {
        const localLog = await git.log({ fs, dir, ref: branch, depth: 500 });
        const aIdx = localLog.findIndex((c) => c.oid === remote);
        ahead = aIdx < 0 ? localLog.length : aIdx;
        const remoteLog = await git.log({ fs, dir, ref: `refs/remotes/origin/${branch}`, depth: 500 }).catch(() => []);
        const bIdx = remoteLog.findIndex((c) => c.oid === local);
        behind = bIdx < 0 ? remoteLog.length : bIdx;
      }
    } catch { ahead = null; behind = null; }
  }
  const branches = await git.listBranches({ fs, dir }).catch(() => []);
  const remoteBranches = await git.listBranches({ fs, dir, remote: 'origin' }).catch(() => []);
  return {
    repo: true, branch, branches, remoteBranches: remoteBranches.filter((b) => b !== 'HEAD'), remote: origin ? origin.url : null, full: remoteFull(origin ? origin.url : ''), files, ahead, behind,
  };
}

// Détermine « utilisateur/dépôt » à partir de l'URL du dépôt distant GitHub.
function remoteFull(url) {
  const m = /github\.com[/:]([^/]+\/[^/.]+)/.exec(url || '');
  return m ? m[1].replace(/\.git$/, '') : null;
}

// Met à jour les références distantes (sans fusion) pour connaître les commits en retard.
async function fetchRemote(dir, gh, onProgress) {
  const branch = (await git.currentBranch({ fs, dir })) || 'main';
  await git.fetch({
    fs, http, dir, remote: 'origin', ref: branch, singleBranch: true, tags: false, onAuth: gh.onAuth(), onProgress,
  });
  return status(dir);
}

// Différence ligne à ligne entre la version validée (HEAD) et le fichier actuel : pour relire avant de valider.
async function diffFile(dir, file) {
  const rel = file.split(path.sep).join('/');
  const head = await headContent(dir, rel);
  let work = null;
  try { work = fs.readFileSync(path.join(dir, rel), 'utf8'); } catch { work = null; }
  if (work != null && /\u0000/.test(work.slice(0, 8000))) return { binary: true };
  const a = head == null ? [] : head.split('\n');
  const b = work == null ? [] : work.split('\n');
  return { added: head == null, removed: work == null, hunks: lineDiff(a, b) };
}

// Diff simple basé sur la plus longue sous-séquence commune (suffisant pour relire des fichiers texte).
function lineDiff(a, b) {
  const n = a.length; const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) for (let j = m - 1; j >= 0; j -= 1) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0; let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ t: ' ', s: a[i] }); i += 1; j += 1; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: '-', s: a[i] }); i += 1; }
    else { out.push({ t: '+', s: b[j] }); j += 1; }
  }
  while (i < n) { out.push({ t: '-', s: a[i] }); i += 1; }
  while (j < m) { out.push({ t: '+', s: b[j] }); j += 1; }
  return out;
}

async function log(dir, depth = 50) {
  try {
    const l = await git.log({ fs, dir, depth });
    return l.map((c) => ({
      oid: c.oid, message: c.commit.message.trim(), author: c.commit.author.name, date: c.commit.author.timestamp * 1000,
    }));
  } catch { return []; }
}

async function headContent(dir, file) {
  try {
    const oid = await git.resolveRef({ fs, dir, ref: 'HEAD' });
    const { blob } = await git.readBlob({
      fs, dir, oid, filepath: file.split(path.sep).join('/'),
    });
    return Buffer.from(blob).toString('utf8');
  } catch { return null; }
}

async function init(dir) {
  await git.init({ fs, dir, defaultBranch: 'main' });
  if (!fs.existsSync(path.join(dir, '.gitignore'))) fs.writeFileSync(path.join(dir, '.gitignore'), DEFAULT_IGNORE);
  return status(dir);
}

async function stageAll(dir, files) {
  const matrix = await git.statusMatrix({ fs, dir });
  const want = files ? new Set(files) : null;
  for (const [file, head, work, stage] of matrix) {
    if (want && !want.has(file)) continue;
    if (work === 0 && head === 1) await git.remove({ fs, dir, filepath: file });
    else if (work !== stage || head !== work) await git.add({ fs, dir, filepath: file });
  }
}

async function commit(dir, message, author, files) {
  await stageAll(dir, files);
  const st = await status(dir);
  if (!st.files.some((f) => f.staged) && st.files.length && files) return null;
  return git.commit({ fs, dir, message: message || 'Mise à jour', author });
}

async function setRemote(dir, url) {
  const remotes = await git.listRemotes({ fs, dir });
  if (remotes.some((r) => r.remote === 'origin')) await git.deleteRemote({ fs, dir, remote: 'origin' });
  await git.addRemote({ fs, dir, remote: 'origin', url });
}

async function push(dir, gh, onProgress) {
  const branch = (await git.currentBranch({ fs, dir })) || 'main';
  const r = await git.push({
    fs, http, dir, remote: 'origin', ref: branch, onAuth: gh.onAuth(), onProgress,
  });
  if (!r.ok) throw new Error(`Envoi refusé : ${JSON.stringify(r.refs || r.error || {})}`);
  return { branch };
}

async function pull(dir, gh, onProgress) {
  const branch = (await git.currentBranch({ fs, dir })) || 'main';
  await git.pull({
    fs, http, dir, remote: 'origin', ref: branch, singleBranch: true, author: gh.author(), onAuth: gh.onAuth(), onProgress, fastForward: true,
  });
  return { branch };
}

async function clone(url, dir, gh, onProgress) {
  fs.mkdirSync(dir, { recursive: true });
  await git.clone({
    fs, http, dir, url, singleBranch: true, depth: 50, onAuth: gh.onAuth(), onProgress,
  });
  return dir;
}

async function checkout(dir, branch, create) {
  if (create) await git.branch({ fs, dir, ref: branch, checkout: true });
  else await git.checkout({ fs, dir, ref: branch });
  return status(dir);
}

async function discard(dir, file) {
  await git.checkout({
    fs, dir, force: true, filepaths: [file],
  });
}

module.exports = {
  GitHub, isRepo, status, log, headContent, init, commit, setRemote, push, pull, clone, checkout, discard, fetchRemote, diffFile, remoteFull, DEFAULT_IGNORE,
};
