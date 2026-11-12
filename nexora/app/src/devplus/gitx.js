'use strict';
/* NEXORA #052 : Git avancé avec l'outil Git du PC (installé par NEXORA au besoin, #016) : branches, fusion et
 * conflits, mise de côté (stash), auteur de chaque ligne (blame), graphe ; demandes de fusion GitHub. */
const fs = require('fs');
const path = require('path');
const { run, which, inside, envFor } = require('./util');

const SEP = '\x1f';
function gitBin(root) {
  const g = which('git', envFor(root));
  if (!g) { const e = new Error('Git n’est pas installé sur ce PC. Ouvrez « Outils » dans le Dev Lab pour l’installer en un clic.'); e.tool = 'git'; throw e; }
  return g;
}
// Identité de repli pour les fusions et mises de côté quand Git n'en a aucune sur ce PC (sinon celle de l'utilisateur).
const identities = new Map();
async function identity(root) {
  if (!identities.has(root)) {
    const r = await run(gitBin(root), ['config', 'user.email'], { cwd: root, env: envFor(root) }).catch(() => ({ stdout: '' }));
    identities.set(root, r.stdout.trim() ? {} : { GIT_AUTHOR_NAME: 'NEXORA', GIT_AUTHOR_EMAIL: 'nexora@users.noreply.github.com', GIT_COMMITTER_NAME: 'NEXORA', GIT_COMMITTER_EMAIL: 'nexora@users.noreply.github.com' });
  }
  return identities.get(root);
}
async function git(root, args, { ok = [0], input } = {}) {
  const who = ['merge', 'commit', 'stash'].includes(args[0]) ? await identity(root) : {};
  const r = await run(gitBin(root), args, { cwd: root, env: { ...envFor(root), ...who, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' }, input, timeout: 3 * 60 * 1000 });
  if (!ok.includes(r.code)) throw new Error((r.stderr || r.stdout || `git ${args[0]} a échoué`).trim().split('\n').slice(-3).join(' '));
  return r;
}

async function branches(root) {
  const r = await git(root, ['for-each-ref', `--format=%(refname)${SEP}%(refname:short)${SEP}%(objectname:short)${SEP}%(upstream:short)${SEP}%(upstream:track)${SEP}%(HEAD)${SEP}%(committerdate:relative)${SEP}%(contents:subject)`, 'refs/heads', 'refs/remotes']);
  const list = r.stdout.split('\n').filter(Boolean).map((l) => {
    const [ref, name, hash, upstream, track, head, when, subject] = l.split(SEP);
    return { name, hash, upstream, track: track.replace(/[[\]]/g, ''), current: head === '*', remote: ref.startsWith('refs/remotes/'), when, subject };
  }).filter((b) => !b.name.endsWith('/HEAD'));
  return { branches: list, current: (list.find((b) => b.current) || {}).name || null, merging: fs.existsSync(path.join(root, '.git', 'MERGE_HEAD')) };
}
const branchCreate = async (root, { name, from, checkout = true }) => {
  if (!/^[\w./-]+$/.test(name || '') || name.includes('..')) throw new Error('Nom de branche invalide.');
  await git(root, checkout ? ['checkout', '-b', name, ...(from ? [from] : [])] : ['branch', name, ...(from ? [from] : [])]);
  return branches(root);
};
const branchDelete = async (root, { name, force }) => { await git(root, ['branch', force ? '-D' : '-d', name]); return branches(root); };
const switchTo = async (root, { name }) => { await git(root, ['switch', name.replace(/^origin\//, '')]); return branches(root); };

async function conflicts(root) {
  const r = await git(root, ['diff', '--name-only', '--diff-filter=U']);
  return r.stdout.split('\n').filter(Boolean);
}
async function merge(root, { branch }) {
  const r = await git(root, ['merge', '--no-edit', branch], { ok: [0, 1] });
  const files = await conflicts(root);
  return { ok: r.code === 0 && !files.length, conflicts: files, output: (r.stdout + r.stderr).trim().slice(-2000) };
}
async function show(root, spec) { const r = await git(root, ['show', spec], { ok: [0, 128] }); return r.code === 0 ? r.stdout : null; }
async function conflictFile(root, { file }) {
  const abs = inside(root, file);
  const [base, ours, theirs] = await Promise.all([show(root, `:1:${file}`), show(root, `:2:${file}`), show(root, `:3:${file}`)]);
  return { file, base, ours, theirs, merged: fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '' };
}
async function resolve(root, { file, content }) {
  if (/^(<{7}|={7}|>{7})( |$)/m.test(content)) throw new Error('Il reste des marques de conflit (<<<<<<<, =======, >>>>>>>) dans le fichier.');
  fs.writeFileSync(inside(root, file), content);
  await git(root, ['add', '--', file]);
  return { conflicts: await conflicts(root) };
}
const mergeAbort = async (root) => { await git(root, ['merge', '--abort']); return branches(root); };
async function mergeContinue(root) {
  const left = await conflicts(root);
  if (left.length) throw new Error(`Il reste ${left.length} fichier(s) en conflit.`);
  await git(root, ['commit', '--no-edit']);
  return branches(root);
}

async function stashList(root) {
  const r = await git(root, ['stash', 'list', `--format=%gd${SEP}%s${SEP}%cr`]);
  return r.stdout.split('\n').filter(Boolean).map((l) => { const [ref, message, when] = l.split(SEP); return { ref, message, when }; });
}
async function stashPush(root, { message, untracked = true }) {
  await git(root, ['stash', 'push', ...(untracked ? ['--include-untracked'] : []), ...(message ? ['-m', message] : [])]);
  return stashList(root);
}
const stashRef = (ref) => { if (!/^stash@\{\d+\}$/.test(ref || '')) throw new Error('Mise de côté inconnue.'); return ref; };
async function stashApply(root, { ref, pop }) {
  const r = await git(root, ['stash', pop ? 'pop' : 'apply', stashRef(ref)], { ok: [0, 1] });
  return { list: await stashList(root), conflicts: await conflicts(root), output: (r.stdout + r.stderr).trim().slice(-1000) };
}
const stashDrop = async (root, { ref }) => { await git(root, ['stash', 'drop', stashRef(ref)]); return stashList(root); };
const stashShow = async (root, { ref }) => (await git(root, ['stash', 'show', '-p', '--include-untracked', stashRef(ref)], { ok: [0, 128] })).stdout.slice(0, 400000);

async function blame(root, { file }) {
  inside(root, file);
  const r = await git(root, ['blame', '--porcelain', '--', file], { ok: [0, 128] });
  if (r.code) return { lines: [], error: 'Fichier pas encore enregistré dans le dépôt.' };
  const commits = {};
  const lines = [];
  let cur = null;
  for (const l of r.stdout.split('\n')) {
    const h = /^([0-9a-f]{40}) (\d+) (\d+)/.exec(l);
    if (h) { cur = commits[h[1]] || (commits[h[1]] = { hash: h[1].slice(0, 8) }); cur.final = +h[3]; continue; }
    if (!cur) continue;
    if (l.startsWith('author ')) cur.author = l.slice(7);
    else if (l.startsWith('author-time ')) cur.time = +l.slice(12) * 1000;
    else if (l.startsWith('summary ')) cur.summary = l.slice(8);
    else if (l.startsWith('\t')) lines.push({ line: cur.final, hash: cur.hash, author: cur.hash === '00000000' ? 'Pas encore enregistré' : cur.author, time: cur.time, summary: cur.summary });
  }
  return { lines };
}

async function graph(root, { limit = 200 } = {}) {
  const r = await git(root, ['log', '--graph', '--branches', '--remotes', '--tags', '--date-order', `-n${Math.min(1000, limit)}`, `--format=${SEP}%h${SEP}%p${SEP}%an${SEP}%cr${SEP}%D${SEP}%s`], { ok: [0, 128] });
  if (r.code) return { rows: [] };
  return {
    rows: r.stdout.split('\n').filter(Boolean).map((l) => {
      const i = l.indexOf(SEP);
      if (i < 0) return { graph: l };
      const [hash, parents, author, when, refs, subject] = l.slice(i + 1).split(SEP);
      return { graph: l.slice(0, i), hash, parents: parents ? parents.split(' ') : [], author, when, refs: refs ? refs.split(', ') : [], subject };
    }),
  };
}

// ---------- Demandes de fusion (pull requests) GitHub ----------
async function repoOf(root) {
  const r = await git(root, ['remote', 'get-url', 'origin'], { ok: [0, 2, 128] });
  const m = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(r.stdout.trim());
  if (!m) throw new Error('Ce projet n’est pas relié à un dépôt GitHub : utilisez « Publier le dépôt » d’abord.');
  return { owner: m[1], repo: m[2] };
}
class PullRequests {
  constructor(gh) { this.gh = gh; }
  async api(root, p, opts) {
    if (!this.gh.token()) throw new Error('Connectez votre compte GitHub dans le panneau « Dépôt distant » du Dev Lab.');
    const { owner, repo } = await repoOf(root);
    return this.gh.api(`/repos/${owner}/${repo}${p}`, opts);
  }
  async list(root, { state = 'open' } = {}) {
    const rows = await this.api(root, `/pulls?state=${state}&per_page=50`);
    return rows.map((p) => ({ number: p.number, title: p.title, state: p.merged_at ? 'merged' : p.state, draft: p.draft, user: p.user && p.user.login, head: p.head && p.head.ref, base: p.base && p.base.ref, updated: p.updated_at, url: p.html_url }));
  }
  async create(root, { title, body, head, base, draft }) {
    if (!title) throw new Error('Donnez un titre à la demande de fusion.');
    const p = await this.api(root, '/pulls', { method: 'POST', body: { title, body: body || '', head, base, draft: Boolean(draft) } });
    return { number: p.number, url: p.html_url };
  }
  async get(root, { number }) {
    const [p, files, reviews, comments] = await Promise.all([
      this.api(root, `/pulls/${number}`), this.api(root, `/pulls/${number}/files?per_page=100`),
      this.api(root, `/pulls/${number}/reviews`), this.api(root, `/issues/${number}/comments`),
    ]);
    return {
      number: p.number, title: p.title, body: p.body || '', state: p.merged ? 'merged' : p.state, draft: p.draft, mergeable: p.mergeable, user: p.user && p.user.login, head: p.head.ref, base: p.base.ref, url: p.html_url, additions: p.additions, deletions: p.deletions,
      files: files.map((f) => ({ file: f.filename, status: f.status, additions: f.additions, deletions: f.deletions, patch: f.patch || '' })),
      reviews: reviews.map((r) => ({ user: r.user && r.user.login, state: r.state, body: r.body, at: r.submitted_at })),
      comments: comments.map((c) => ({ user: c.user && c.user.login, body: c.body, at: c.created_at })),
    };
  }
  async review(root, { number, event = 'COMMENT', body = '', comments = [] }) {
    if (!['APPROVE', 'REQUEST_CHANGES', 'COMMENT'].includes(event)) throw new Error('Avis inconnu.');
    await this.api(root, `/pulls/${number}/reviews`, { method: 'POST', body: { event, body, comments: comments.filter((c) => c.body && c.path).map((c) => ({ path: c.path, line: Number(c.line), side: 'RIGHT', body: c.body })) } });
    return this.get(root, { number });
  }
  async merge(root, { number, method = 'squash' }) {
    await this.api(root, `/pulls/${number}/merge`, { method: 'PUT', body: { merge_method: method } });
    return this.get(root, { number });
  }
}

module.exports = { gitBin, branches, branchCreate, branchDelete, switchTo, merge, conflicts, conflictFile, resolve, mergeAbort, mergeContinue, stashList, stashPush, stashApply, stashDrop, stashShow, blame, graph, PullRequests, repoOf };
