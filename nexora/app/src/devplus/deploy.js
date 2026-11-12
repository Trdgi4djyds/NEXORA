'use strict';
/* NEXORA #052 : mise en ligne en un clic (Cloudflare Pages, Vercel, Netlify, GitHub Pages) avec une adresse
 * d'aperçu par branche. Jetons des hébergeurs chiffrés (safeStorage), jamais écrits dans le projet. */
const fs = require('fs');
const path = require('path');
const { run, readJson, packageManager, envFor, tmpFile, which } = require('./util');

const PROVIDERS = {
  cloudflare: { name: 'Cloudflare Pages', fields: [['token', 'Jeton d’API (droit « Pages : modifier »)', true], ['account', 'Identifiant du compte', false]] },
  vercel: { name: 'Vercel', fields: [['token', 'Jeton d’accès', true]] },
  netlify: { name: 'Netlify', fields: [['token', 'Jeton d’accès personnel', true]] },
  github: { name: 'GitHub Pages', fields: [] },
};
const URL_RE = /https:\/\/[\w.-]+\.(?:pages\.dev|vercel\.app|netlify\.app|github\.io)(?:\/[^\s'"]*)?/g;
const OUT_DIRS = ['dist', 'build', 'out', '.output/public', 'public', '_site', 'www'];
const slug = (s) => String(s || 'site').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'site';

class Deployer {
  constructor({ store, safeStorage, gh, emit }) { this.store = store; this.safe = safeStorage; this.gh = gh; this.emit = emit; }
  creds() { return this.store.get(null, 'deploy-tokens', {}); }
  enc(v) { return this.safe && this.safe.isEncryptionAvailable() ? { enc: this.safe.encryptString(v).toString('base64') } : { plain: Buffer.from(v).toString('base64') }; }
  dec(e) { if (!e) return ''; return e.enc ? this.safe.decryptString(Buffer.from(e.enc, 'base64')) : Buffer.from(e.plain || '', 'base64').toString(); }
  providers() {
    const c = this.creds();
    return Object.entries(PROVIDERS).map(([id, p]) => ({ id, name: p.name, fields: p.fields.map(([k, label, secret]) => ({ key: k, label, secret, set: Boolean(c[id] && c[id][k]) })), ready: id === 'github' ? Boolean(this.gh && this.gh.token()) : p.fields.filter((f) => f[2]).every(([k]) => c[id] && c[id][k]) }));
  }
  setCreds(id, values) {
    if (!PROVIDERS[id]) throw new Error('Hébergeur inconnu.');
    const c = this.creds();
    c[id] = c[id] || {};
    for (const [k, v] of Object.entries(values || {})) if (v) c[id][k] = this.enc(String(v)); else delete c[id][k];
    this.store.set(null, 'deploy-tokens', c);
    return this.providers();
  }
  cred(id, k) { const c = this.creds(); return c[id] && c[id][k] ? this.dec(c[id][k]) : ''; }
  config(root) {
    const pkg = readJson(path.join(root, 'package.json')) || {};
    const saved = this.store.get(root, 'deploy', {});
    // Avec un script de construction, « public » contient les fichiers sources : le dossier produit est ailleurs.
    const build = Boolean(pkg.scripts && pkg.scripts.build);
    const outDir = saved.outDir || OUT_DIRS.filter((d) => !build || d !== 'public').find((d) => fs.existsSync(path.join(root, d, 'index.html'))) || (build ? 'dist' : '.');
    return { provider: saved.provider || 'cloudflare', project: saved.project || slug(pkg.name || path.basename(root)), outDir, build: saved.build !== undefined ? saved.build : Boolean(pkg.scripts && pkg.scripts.build), checks: saved.checks !== false, history: saved.history || [] };
  }
  saveConfig(root, cfg) { const cur = this.store.get(root, 'deploy', {}); return this.store.set(root, 'deploy', { ...cur, ...cfg, history: cur.history || [] }); }
  async branch(root) {
    try { const h = fs.readFileSync(path.join(root, '.git', 'HEAD'), 'utf8'); const m = /ref: refs\/heads\/(.+)/.exec(h); return m ? m[1].trim() : 'main'; } catch { return 'main'; }
  }
  log(id, text) { this.emit({ id, type: 'log', text }); }
  async deploy(root, { production = false } = {}) {
    const cfg = this.config(root);
    const id = `deploy${Date.now().toString(36)}`;
    const branch = await this.branch(root);
    const prod = Boolean(production);
    const env = envFor(root);
    const onData = (d) => this.log(id, d);
    this.emit({ id, type: 'start', provider: cfg.provider, branch });
    if (cfg.build) {
      const pm = packageManager(root);
      this.log(id, `> ${pm} run build\n`);
      const b = await run(pm, ['run', 'build'], { cwd: root, env, onData, timeout: 20 * 60 * 1000 });
      if (b.code) throw new Error('La construction du site a échoué : corrigez l’erreur affichée dans le journal, puis relancez.');
    }
    const dir = path.resolve(root, cfg.outDir || '.');
    if (!fs.existsSync(path.join(dir, 'index.html'))) throw new Error(`Aucun index.html dans « ${cfg.outDir} » : indiquez le dossier produit par la construction.`);
    let url = '';
    let out = '';
    const capture = (d) => { out += d; onData(d); };
    const p = cfg.provider;
    if (p === 'cloudflare') {
      const token = this.cred('cloudflare', 'token');
      if (!token) throw new Error('Ajoutez votre jeton Cloudflare dans les réglages de mise en ligne.');
      const e = { ...env, CLOUDFLARE_API_TOKEN: token, ...(this.cred('cloudflare', 'account') ? { CLOUDFLARE_ACCOUNT_ID: this.cred('cloudflare', 'account') } : {}) };
      await run('npx', ['--yes', 'wrangler@3', 'pages', 'project', 'create', cfg.project, '--production-branch', 'main'], { cwd: root, env: e, onData: capture }).catch(() => null);
      const r = await run('npx', ['--yes', 'wrangler@3', 'pages', 'deploy', dir, '--project-name', cfg.project, '--branch', prod ? 'main' : branch, '--commit-dirty=true'], { cwd: root, env: e, onData: capture, timeout: 20 * 60 * 1000 });
      if (r.code) throw new Error('Cloudflare a refusé la mise en ligne : vérifiez le jeton et l’identifiant du compte (journal ci-dessous).');
    } else if (p === 'vercel') {
      const token = this.cred('vercel', 'token');
      if (!token) throw new Error('Ajoutez votre jeton Vercel dans les réglages de mise en ligne.');
      const r = await run('npx', ['--yes', 'vercel@latest', 'deploy', dir, '--yes', '--token', token, '--name', cfg.project, ...(prod ? ['--prod'] : [])], { cwd: root, env, onData: capture, timeout: 20 * 60 * 1000 });
      if (r.code) throw new Error('Vercel a refusé la mise en ligne (journal ci-dessous).');
    } else if (p === 'netlify') {
      const token = this.cred('netlify', 'token');
      if (!token) throw new Error('Ajoutez votre jeton Netlify dans les réglages de mise en ligne.');
      const saved = this.store.get(root, 'deploy', {});
      let site = saved.netlifySite;
      if (!site) {
        const c = await run('npx', ['--yes', 'netlify-cli@17', 'sites:create', '--name', `${cfg.project}-${Date.now().toString(36).slice(-4)}`, '--auth', token, '--disable-linking'], { cwd: root, env, onData: capture });
        const m = /Site ID:\s*([0-9a-f-]{36})/i.exec(c.stdout) || /"id":\s*"([0-9a-f-]{36})"/.exec(c.stdout);
        if (!m) throw new Error('Création du site Netlify impossible (journal ci-dessous).');
        site = m[1];
        this.store.set(root, 'deploy', { ...saved, netlifySite: site });
      }
      const r = await run('npx', ['--yes', 'netlify-cli@17', 'deploy', '--dir', dir, '--site', site, '--auth', token, '--json', ...(prod ? ['--prod'] : ['--alias', branch.replace(/[^\w-]/g, '-')])], { cwd: root, env, onData: capture, timeout: 20 * 60 * 1000 });
      if (r.code) throw new Error('Netlify a refusé la mise en ligne (journal ci-dessous).');
      try { const j = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))); url = prod ? j.url : j.deploy_url; } catch { /* adresse lue plus bas */ }
    } else if (p === 'github') {
      url = await this.githubPages(root, dir, onData);
    } else throw new Error('Choisissez un hébergeur.');
    if (!url) { const all = out.match(URL_RE) || []; url = all[all.length - 1] || ''; }
    const entry = { at: Date.now(), provider: p, branch, production: prod, url };
    const saved = this.store.get(root, 'deploy', {});
    this.store.set(root, 'deploy', { ...saved, history: [entry, ...(saved.history || [])].slice(0, 30) });
    this.emit({ id, type: 'done', ...entry });
    return entry;
  }
  // GitHub Pages : contenu du dossier produit envoyé sur la branche gh-pages du dépôt du projet.
  async githubPages(root, dir, onData) {
    const token = this.gh && this.gh.token();
    if (!token) throw new Error('Connectez votre compte GitHub dans le panneau « Dépôt distant ».');
    const { repoOf } = require('./gitx');
    const { owner, repo } = await repoOf(root);
    const git = which('git', envFor(root));
    if (!git) throw new Error('Git n’est pas installé : ouvrez « Outils » dans le Dev Lab.');
    const tmp = tmpFile('pages');
    fs.cpSync(dir, tmp, { recursive: true });
    fs.writeFileSync(path.join(tmp, '.nojekyll'), '');
    const g = (args) => run(git, args, { cwd: tmp, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, onData });
    await g(['init', '-q', '-b', 'gh-pages']);
    await g(['add', '-A']);
    await g(['-c', 'user.name=NEXORA', '-c', 'user.email=nexora@users.noreply.github.com', 'commit', '-qm', 'Mise en ligne par NEXORA']);
    const r = await run(git, ['push', '--force', `https://x-access-token:${token}@github.com/${owner}/${repo}.git`, 'gh-pages'], { cwd: tmp, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    fs.rmSync(tmp, { recursive: true, force: true });
    if (r.code) throw new Error('Envoi vers GitHub Pages refusé : vérifiez les droits de votre compte sur le dépôt.');
    await this.gh.api(`/repos/${owner}/${repo}/pages`, { method: 'POST', body: { source: { branch: 'gh-pages', path: '/' } } }).catch(() => null);
    return `https://${owner.toLowerCase()}.github.io/${repo}/`;
  }
}

module.exports = { Deployer, PROVIDERS };
