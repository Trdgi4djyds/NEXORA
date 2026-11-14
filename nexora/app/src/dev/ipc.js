'use strict';
/* Canaux IPC du Dev Lab (dev:*), de Git/GitHub (git:*) et du partage (tunnel:*). */
const fs = require('fs');
const os = require('os');
const path = require('path');
const fsops = require('./fsops');
const { Terminals } = require('./terminal');
const gitops = require('./git');
const { Share } = require('./share');
const { analyzeProject, commandPreview } = require('../frameworks');
const { StaticServer } = require('../static-server');
const { VsCode } = require('./vscode');
const { Extensions } = require('./extensions');
// NEXORA #016 : isolation des projets et détection des outils indispensables.
const isolation = require('../isolation');
const tools = require('../tools');

// Modèles de workflows GitHub Actions prêts à l'emploi (déploiement Pages, intégration continue Node).
function workflowTemplate(kind) {
  if (kind === 'pages') {
    return `# Déploie le site sur GitHub Pages à chaque envoi sur la branche principale.
name: Déploiement GitHub Pages
on:
  push:
    branches: [ "main" ]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: "pages"
  cancel-in-progress: true
jobs:
  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: "."
      - id: deployment
        uses: actions/deploy-pages@v4
`;
  }
  if (kind === 'node') {
    return `# Installe les dépendances, construit le projet et lance les tests à chaque envoi et pull request.
name: Intégration continue (Node.js)
on:
  push:
    branches: [ "main" ]
  pull_request:
jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [ 20.x ]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
          cache: npm
      - run: npm ci
      - run: npm run build --if-present
      - run: npm test --if-present
`;
  }
  return `# Workflow minimal : vérifiez que le dépôt se récupère correctement.
name: Vérification
on: [ push, pull_request ]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo "Dépôt récupéré."
`;
}

const TEMPLATES = {
  html: { label: 'Site HTML, CSS et JavaScript' },
  vite_react: { label: 'React (Vite)', cmd: (n) => `npm create vite@latest "${n}" -- --template react && cd "${n}" && npm install` },
  vite_react_ts: { label: 'React + TypeScript (Vite)', cmd: (n) => `npm create vite@latest "${n}" -- --template react-ts && cd "${n}" && npm install` },
  vite_vue: { label: 'Vue (Vite)', cmd: (n) => `npm create vite@latest "${n}" -- --template vue && cd "${n}" && npm install` },
  vite_svelte: { label: 'Svelte (Vite)', cmd: (n) => `npm create vite@latest "${n}" -- --template svelte && cd "${n}" && npm install` },
  next: { label: 'Next.js', cmd: (n) => `npx --yes create-next-app@latest "${n}" --ts --eslint --app --src-dir --tailwind --use-npm --no-import-alias --turbopack` },
  astro: { label: 'Astro', cmd: (n) => `npm create astro@latest "${n}" -- --template minimal --install --no-git --yes` },
  pwa: { label: 'Application web installable (PWA)' },
  landing: { label: 'Page de présentation (landing page)' },
  php: { label: 'Site PHP' },
  express: { label: 'Serveur Node.js (Express)' },
  vite_vanilla: { label: 'JavaScript (Vite)', cmd: (n) => `npm create vite@latest "${n}" -- --template vanilla && cd "${n}" && npm install` },
  vite_ts: { label: 'TypeScript (Vite)', cmd: (n) => `npm create vite@latest "${n}" -- --template vanilla-ts && cd "${n}" && npm install` },
  expo: { label: 'Application mobile React Native (Expo)', cmd: (n) => `npx --yes create-expo-app@latest "${n}" --template blank` },
  flutter: { label: 'Application Flutter', cmd: (n) => `flutter create "${n.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}"` },
};

// NEXORA #005 : dossier réellement créé par le modèle (Flutter impose minuscules et soulignés),
// et dossier « pris » s'il existe et n'est pas un dossier vide. Aucun projet existant n'est écrasé.
function projectFolder(template, clean) {
  return template === 'flutter' ? clean.replace(/[^a-z0-9_]/gi, '_').toLowerCase() : clean;
}

function folderTaken(dir) {
  if (!fs.existsSync(dir)) return false;
  return !fs.statSync(dir).isDirectory() || fs.readdirSync(dir).length > 0;
}

// Variantes du modèle HTML : PWA (manifeste + service worker), landing page, PHP.
function extraTemplate(kind, dir, name) {
  htmlTemplate(dir, name);
  if (kind === 'pwa') {
    fs.writeFileSync(path.join(dir, 'manifest.webmanifest'), JSON.stringify({
      name, short_name: name.slice(0, 12), start_url: '/', scope: '/', display: 'standalone', background_color: '#ffffff', theme_color: '#0071e3', icons: [{ src: 'images/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
    }, null, 2));
    fs.writeFileSync(path.join(dir, 'images', 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#0071e3"/><text x="256" y="330" font-size="260" text-anchor="middle" fill="#fff" font-family="Arial, sans-serif" font-weight="700">${(name[0] || 'A').toUpperCase()}</text></svg>`);
    fs.writeFileSync(path.join(dir, 'sw.js'), `const CACHE = '${name}-v1';
const ASSETS = ['/', '/index.html', '/css/style.css', '/js/main.js', '/manifest.webmanifest', '/images/icon.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html'))));
});
`);
    let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    html = html.replace('<link rel="stylesheet" href="css/style.css">', '<link rel="manifest" href="manifest.webmanifest">\n  <link rel="icon" href="images/icon.svg">\n  <link rel="apple-touch-icon" href="images/icon.svg">\n  <link rel="stylesheet" href="css/style.css">');
    fs.writeFileSync(path.join(dir, 'index.html'), html);
    fs.appendFileSync(path.join(dir, 'js', 'main.js'), "if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');\n");
  }
  if (kind === 'landing') {
    let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    html = html.replace('</main>', `  <section class="cta">
      <h2>Prêt à commencer ?</h2>
      <p>Inscrivez-vous en quelques secondes. Sans engagement.</p>
      <form class="signup" onsubmit="event.preventDefault(); this.innerHTML='<p>Merci ! À très vite.</p>';">
        <input type="email" required placeholder="Votre adresse e-mail">
        <button class="btn" type="submit">Je m'inscris</button>
      </form>
    </section>
    <section class="faq">
      <h2>Questions fréquentes</h2>
      <details><summary>Combien ça coûte ?</summary><p>Répondez ici à la question la plus posée.</p></details>
      <details><summary>Comment ça marche ?</summary><p>Expliquez les étapes en deux phrases.</p></details>
    </section>
  </main>`);
    fs.writeFileSync(path.join(dir, 'index.html'), html);
    fs.appendFileSync(path.join(dir, 'css', 'style.css'), `.cta { text-align: center; padding: 64px 16px; background: #f5f5f7; }
.signup { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
.signup input { padding: 12px 16px; border-radius: 999px; border: 1px solid #d2d2d7; min-width: 260px; font: inherit; }
.faq { max-width: 760px; margin: 0 auto; padding: 48px 16px; }
.faq details { border-bottom: 1px solid #e5e5ea; padding: 14px 0; }
.faq summary { font-weight: 600; cursor: pointer; }
`);
  }
  if (kind === 'php') {
    const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8').replace('<span id="year"></span>', '<?= date(\'Y\') ?>');
    fs.writeFileSync(path.join(dir, 'index.php'), `<?php $titre = '${name.replace(/'/g, "\\'")}'; ?>\n${html}`);
    fs.rmSync(path.join(dir, 'index.html'));
  }
}

function htmlTemplate(dir, name) {
  fs.mkdirSync(path.join(dir, 'css'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'js'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'images'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${name}</title>
  <meta name="description" content="${name}">
  <meta name="theme-color" content="#ffffff">
  <link rel="stylesheet" href="css/style.css">
  <script src="js/main.js" defer></script>
</head>
<body>
  <header class="top">
    <a class="logo" href="/">${name}</a>
    <nav><a href="#services">Services</a><a href="#contact">Contact</a></nav>
  </header>
  <main>
    <section class="hero">
      <h1>${name}</h1>
      <p>Un site rapide, responsive et prêt à être publié.</p>
      <a class="btn" href="#contact">Nous contacter</a>
    </section>
    <section id="services" class="grid">
      <article><h2>Rapide</h2><p>Aucune dépendance : la page s’affiche instantanément.</p></article>
      <article><h2>Responsive</h2><p>Parfait sur téléphone, tablette et ordinateur.</p></article>
      <article><h2>Simple</h2><p>HTML, CSS et JavaScript, faciles à modifier.</p></article>
    </section>
  </main>
  <footer id="contact"><p>© <span id="year"></span> ${name}</p></footer>
</body>
</html>
`);
  fs.writeFileSync(path.join(dir, 'css', 'style.css'), `:root {
  --bg: #ffffff;
  --text: #1d1d1f;
  --muted: #6e6e73;
  --accent: #0071e3;
  --radius: 16px;
  font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  color: var(--text);
  background: var(--bg);
}
* { box-sizing: border-box; }
body { margin: 0; line-height: 1.5; }
.top { display: flex; justify-content: space-between; align-items: center; padding: 16px clamp(16px, 4vw, 48px); position: sticky; top: 0; background: color-mix(in srgb, var(--bg) 85%, transparent); backdrop-filter: blur(12px); }
.logo { font-weight: 700; color: inherit; text-decoration: none; }
nav { display: flex; gap: 20px; }
nav a { color: var(--muted); text-decoration: none; }
.hero { padding: clamp(48px, 10vw, 140px) clamp(16px, 4vw, 48px); text-align: center; }
.hero h1 { font-size: clamp(36px, 7vw, 72px); line-height: 1.05; margin: 0 0 16px; letter-spacing: -0.02em; }
.hero p { color: var(--muted); font-size: clamp(17px, 2.2vw, 21px); margin: 0 0 28px; }
.btn { display: inline-block; background: var(--accent); color: #fff; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: 600; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; padding: 0 clamp(16px, 4vw, 48px) 64px; max-width: 1200px; margin: 0 auto; }
.grid article { background: #f5f5f7; border-radius: var(--radius); padding: 24px; }
footer { text-align: center; color: var(--muted); padding: 32px; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #000; --text: #f5f5f7; --muted: #a1a1a6; }
  .grid article { background: #1c1c1e; }
}
`);
  fs.writeFileSync(path.join(dir, 'js', 'main.js'), "document.getElementById('year').textContent = new Date().getFullYear();\n");
  fs.writeFileSync(path.join(dir, '.gitignore'), gitops.DEFAULT_IGNORE);
}

function register({
  ipcMain, app, dialog, shell, send, getWin, safeStorage, net, session,
}) {
  const fetchImpl = (u, o) => (net && net.fetch ? net.fetch(u, o) : fetch(u, o));
  let cryptOk = false;
  Promise.resolve(safeStorage.isAsyncEncryptionAvailable ? safeStorage.isAsyncEncryptionAvailable() : safeStorage.isEncryptionAvailable()).then((ok) => { cryptOk = Boolean(ok); }).catch(() => {});
  const safe = {
    isEncryptionAvailable: () => cryptOk,
    encryptString: (s) => safeStorage.encryptString(s),
    decryptString: (b) => safeStorage.decryptString(b),
  };
  const gh = new gitops.GitHub({ store: path.join(app.getPath('userData'), 'github.json'), safeStorage: safe, fetchImpl });
  const terms = new Terminals((m) => send('dev:term', m));
  const share = new Share({
    binDir: path.join(app.getPath('userData'), 'bin'), fetchImpl, emit: (m) => send('tunnel:state', m), sessions: ['persist:vitrine', 'persist:vitrine-scrape'].map((p) => session.fromPartition(p)),
  });
  // NEXORA #016 : les noms locaux du partage (monsite.nexora) marchent aussi dans la session de chaque projet.
  isolation.onPartition((p) => {
    const s = session.fromPartition(p);
    if (share.sessions.includes(s)) return;
    share.sessions.push(s);
    if (share.names && share.names.size) share.applyPac().catch(() => {});
  });
  const vscode = new VsCode({ dataDir: app.getPath('userData'), fetchImpl, emit: (m) => send('dev:vscode', m) });
  const exts = new Extensions({ dataDir: app.getPath('userData'), fetchImpl });
  app.on('before-quit', () => vscode.stop());
  ipcMain.handle('dev:vscode-status', () => vscode.status());
  ipcMain.handle('dev:vscode-accept', () => vscode.acceptLicense());
  ipcMain.handle('dev:vscode-download', async () => { try { return await vscode.download(); } catch (e) { return { error: e.message }; } });
  ipcMain.handle('dev:vscode-start', async (_e, { dir, prefer } = {}) => {
    try { await vscode.start({ prefer }); return { url: vscode.folderUrl(dir || root) }; } catch (e) { return { error: e.message }; }
  });
  ipcMain.handle('dev:vscode-stop', () => { vscode.stop(); return true; });
  // NEXORA #120 : démarrage anticipé de Code Editor au lancement de NEXORA (s'il était ouvert la dernière fois).
  ipcMain.handle('dev:vscode-warm', () => vscode.warm());
  ipcMain.handle('dev:ext-search', async (_e, q) => { try { return await exts.search(q); } catch (e) { return { error: e.message }; } });
  ipcMain.handle('dev:ext-install', async (_e, q) => { try { return await exts.install(q); } catch (e) { return { error: e.message }; } });
  ipcMain.handle('dev:ext-uninstall', (_e, id) => exts.uninstall(id));
  ipcMain.handle('dev:ext-list', () => exts.list());
  ipcMain.handle('dev:ext-contrib', () => exts.contributions());
  const watchers = new Map();
  const statics = new Map();
  let root = null; // projet ouvert : les opérations sur les fichiers y sont limitées

  // ------------------------------------------------------------- fichiers
  ipcMain.handle('dev:pick-folder', async (_e, { title, create } = {}) => {
    const r = await dialog.showOpenDialog(getWin(), { title: title || 'Ouvrir un dossier', properties: ['openDirectory', ...(create ? ['createDirectory'] : [])] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('dev:open', (_e, dir) => {
    if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error('Dossier introuvable.');
    root = path.resolve(dir);
    return { root, name: path.basename(root) };
  });
  ipcMain.handle('dev:list', (_e, { dir }) => fsops.list(root, dir));
  ipcMain.handle('dev:read', (_e, { file }) => fsops.read(root, file));
  ipcMain.handle('dev:write', (_e, { file, text, eol, bom }) => fsops.write(root, file, text, { eol, bom }));
  ipcMain.handle('dev:create', (_e, { file, dir }) => fsops.create(root, file, Boolean(dir)));
  ipcMain.handle('dev:rename', (_e, { from, to }) => fsops.rename(root, from, to));
  ipcMain.handle('dev:trash', async (_e, { file }) => {
    if (!fsops.inside(root, file) || path.resolve(file) === root) throw new Error('Suppression refusée.');
    await shell.trashItem(file);
    return true;
  });
  ipcMain.handle('dev:copy-in', (_e, { sources, dest }) => fsops.copyIn(root, sources, dest));
  ipcMain.handle('dev:search', (_e, { query, opts }) => fsops.search(root, query, opts));
  ipcMain.handle('dev:all-files', () => (root ? fsops.allFiles(root) : []));
  ipcMain.handle('dev:image', (_e, { file }) => {
    if (!fsops.inside(root, file)) throw new Error('Chemin en dehors du projet.');
    const st = fs.statSync(file);
    if (st.size > 25e6) return '';
    const ext = path.extname(file).slice(1).toLowerCase();
    const mime = { svg: 'image/svg+xml', jpg: 'image/jpeg', jpeg: 'image/jpeg', ico: 'image/x-icon' }[ext] || `image/${ext}`;
    return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
  });
  ipcMain.handle('dev:reveal', (_e, p) => shell.showItemInFolder(p));
  ipcMain.handle('dev:open-external', (_e, p) => shell.openPath(p));
  ipcMain.handle('dev:watch', (_e, { dir }) => {
    if (watchers.has(dir)) return true;
    watchers.set(dir, fsops.watch(dir, (files) => send('dev:fs', { root: dir, files })));
    return true;
  });
  ipcMain.handle('dev:unwatch', (_e, { dir }) => { const w = watchers.get(dir); if (w) { w(); watchers.delete(dir); } return true; });
  ipcMain.handle('dev:templates', () => Object.entries(TEMPLATES).map(([id, t]) => ({ id, label: t.label })));
  // NEXORA #005 : premier nom libre dans le dossier parent (mon-site, mon-site-2…), proposé dans « Nouveau projet ».
  ipcMain.handle('dev:free-name', (_e, { parent, name, template } = {}) => {
    const base = String(name || '').trim().replace(/[<>:"/\\|?*]+/g, '-') || 'mon-site';
    if (!parent) return base;
    let n = base;
    for (let i = 2; folderTaken(path.join(parent, projectFolder(template, n))) && i < 1000; i += 1) n = `${base}-${i}`;
    return n;
  });
  ipcMain.handle('dev:new-project', (_e, { parent, name, template }) => {
    const clean = String(name || '').trim().replace(/[<>:"/\\|?*]+/g, '-');
    if (!clean) throw new Error('Donnez un nom au projet.');
    // NEXORA #005 : on vérifie le dossier que le modèle créera vraiment (Flutter : minuscules et soulignés).
    const dir = path.join(parent, projectFolder(template, clean));
    if (folderTaken(dir)) throw new Error('Un dossier non vide porte déjà ce nom.');
    const t = TEMPLATES[template] || TEMPLATES.html;
    if (!t.cmd) {
      fs.mkdirSync(dir, { recursive: true });
      if (template === 'express') {
        fs.mkdirSync(path.join(dir, 'public'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
          name: clean.toLowerCase().replace(/[^a-z0-9-]+/g, '-'), version: '1.0.0', private: true, scripts: { start: 'node server.js', dev: 'node --watch server.js' }, dependencies: { express: '^4.21.2' },
        }, null, 2));
        fs.writeFileSync(path.join(dir, 'server.js'), `const express = require('express');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

app.get('/api/bonjour', (req, res) => res.json({ message: 'Bonjour depuis ${clean} !' }));

app.listen(port, () => console.log(\`Serveur prêt sur http://localhost:\${port}\`));
`);
        fs.writeFileSync(path.join(dir, 'public', 'index.html'), `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${clean}</title></head>
<body style="font-family: system-ui, sans-serif; padding: 40px">
  <h1>${clean}</h1>
  <p id="msg">Chargement…</p>
  <script>fetch('/api/bonjour').then((r) => r.json()).then((d) => { document.getElementById('msg').textContent = d.message; });</script>
</body>
</html>
`);
        fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n.env\n');
        return { dir, command: 'npm install', cwd: dir };
      }
      if (['pwa', 'landing', 'php'].includes(template)) extraTemplate(template, dir, clean);
      else htmlTemplate(dir, clean);
      return { dir };
    }
    return { dir, command: t.cmd(clean), cwd: parent };
  });

  // ------------------------------------------------------------- lancement
  ipcMain.handle('dev:analyze', (_e, dir) => {
    const a = analyzeProject(dir);
    if (tools.shared()) tools.shared().announce(a, 'dev'); // NEXORA #016 : détection des outils du projet
    let command = commandPreview(a);
    if (a.kind === 'node' && a.run) command = a.run.replace('{script}', a.script || 'dev').replace(' -- --port {port}', '').replace('{port}', String(a.defaultPort));
    const install = (a.install || []).filter((s) => s.cmd).map((s) => s.cmd.replace('{pysys}', process.platform === 'win32' ? 'python' : 'python3').replace('{py}', 'python'));
    return {
      kind: a.kind, label: a.label, name: a.name, command: a.kind === 'static' ? null : command.replace('{py}', 'python'), install: a.installNeeded ? install : [], static: a.kind === 'static', unsupported: a.unsupported || null, notes: a.notes || [], scripts: a.scripts || null, staticDir: (a.staticDirs && a.staticDirs[0]) || null,
    };
  });
  ipcMain.handle('dev:static-start', async (_e, { dir }) => {
    const prev = statics.get(dir);
    if (prev) return prev.url;
    const s = new StaticServer(dir);
    const url = await s.start();
    s.on('change', () => send('dev:reload', { dir }));
    statics.set(dir, s);
    return url;
  });
  ipcMain.handle('dev:static-stop', (_e, { dir }) => { const s = statics.get(dir); if (s) { s.close(); statics.delete(dir); } return true; });

  // ------------------------------------------------------------- terminaux
  // NEXORA #016 : chaque terminal utilise d'abord les outils et dépendances du projet (environnement isolé).
  ipcMain.handle('dev:term-open', (_e, { cwd }) => terms.open(cwd, isolation.projectVars(cwd)));
  ipcMain.handle('dev:term-write', (_e, { id, line }) => { terms.get(id).write(line); return true; });
  ipcMain.handle('dev:term-input', (_e, { id, text }) => { terms.get(id).input(text); return true; });
  ipcMain.handle('dev:term-stop', (_e, { id }) => terms.get(id).interrupt());
  ipcMain.handle('dev:term-close', (_e, { id }) => terms.close(id));

  // ------------------------------------------------------------- Git et GitHub
  const progress = (label) => (p) => send('git:progress', { label, phase: p.phase, loaded: p.loaded, total: p.total });
  ipcMain.handle('git:me', async () => { try { return await gh.me(); } catch (e) { return { error: e.message }; } });
  ipcMain.handle('git:connect', (_e, { token }) => gh.connect(String(token || '').trim()));
  ipcMain.handle('git:forget', () => { gh.forget(); return true; });
  ipcMain.handle('git:repos', () => gh.repos());
  ipcMain.handle('git:status', (_e, { dir }) => gitops.status(dir));
  ipcMain.handle('git:log', (_e, { dir }) => gitops.log(dir));
  ipcMain.handle('git:head', (_e, { dir, file }) => gitops.headContent(dir, path.relative(dir, file)));
  ipcMain.handle('git:init', (_e, { dir }) => gitops.init(dir));
  ipcMain.handle('git:commit', async (_e, { dir, message, files }) => {
    if (gh.token() && !gh.user) await gh.me().catch(() => null);
    const oid = await gitops.commit(dir, message, gh.author(), files);
    return { oid };
  });
  ipcMain.handle('git:push', async (_e, { dir }) => {
    if (!gh.token()) throw new Error('Connectez d’abord votre compte GitHub.');
    return gitops.push(dir, gh, progress('Envoi'));
  });
  ipcMain.handle('git:pull', async (_e, { dir }) => gitops.pull(dir, gh, progress('Récupération')));
  ipcMain.handle('git:checkout', (_e, { dir, branch, create }) => gitops.checkout(dir, branch, create));
  ipcMain.handle('git:discard', (_e, { dir, file }) => gitops.discard(dir, file));
  ipcMain.handle('git:fetch', (_e, { dir }) => gitops.fetchRemote(dir, gh, progress('Synchronisation')));
  ipcMain.handle('git:diff', (_e, { dir, file }) => gitops.diffFile(dir, path.isAbsolute(file) ? path.relative(dir, file) : file));
  // --- GitHub : dépôt, pull requests, issues, Actions, versions -------------
  ipcMain.handle('gh:repo', (_e, { full }) => gh.repoInfo(full));
  ipcMain.handle('gh:update-repo', (_e, { full, body }) => gh.updateRepo(full, body));
  ipcMain.handle('gh:set-topics', (_e, { full, names }) => gh.setTopics(full, names));
  ipcMain.handle('gh:pulls', (_e, { full, state }) => gh.pulls(full, state));
  ipcMain.handle('gh:create-pull', (_e, { full, ...body }) => gh.createPull(full, body));
  ipcMain.handle('gh:issues', (_e, { full, state }) => gh.issues(full, state));
  ipcMain.handle('gh:create-issue', (_e, { full, ...body }) => gh.createIssue(full, body));
  ipcMain.handle('gh:close-issue', (_e, { full, number }) => gh.closeIssue(full, number));
  ipcMain.handle('gh:runs', (_e, { full }) => gh.workflowRuns(full));
  ipcMain.handle('gh:releases', (_e, { full }) => gh.releases(full));
  ipcMain.handle('gh:create-release', (_e, { full, ...body }) => gh.createRelease(full, body));
  // Ajoute un workflow GitHub Actions prêt à l'emploi dans le dépôt local, puis valide.
  ipcMain.handle('gh:add-workflow', async (_e, { dir, kind }) => {
    const wfDir = path.join(dir, '.github', 'workflows');
    fs.mkdirSync(wfDir, { recursive: true });
    const name = kind === 'pages' ? 'deploy-pages.yml' : kind === 'node' ? 'ci-node.yml' : 'ci.yml';
    const file = path.join(wfDir, name);
    if (fs.existsSync(file)) throw new Error(`Le workflow ${name} existe déjà.`);
    fs.writeFileSync(file, workflowTemplate(kind));
    await gitops.commit(dir, `Ajout du workflow ${name}`, gh.author());
    return { file: path.join('.github', 'workflows', name) };
  });
  ipcMain.handle('git:clone', async (_e, { url, parent, name }) => {
    const clean = String(name || path.basename(new URL(url).pathname).replace(/\.git$/, '')).replace(/[<>:"/\\|?*]+/g, '-');
    const dir = path.join(parent, clean);
    if (fs.existsSync(dir) && fs.readdirSync(dir).length) throw new Error(`Le dossier ${clean} existe déjà et n’est pas vide.`);
    if (gh.token() && !gh.user) await gh.me().catch(() => null);
    await gitops.clone(url, dir, gh, progress('Téléchargement'));
    return { dir };
  });
  ipcMain.handle('git:download-zip', async (_e, { full, ref, parent }) => {
    const { extract } = require('../android/zip');
    const tmp = path.join(os.tmpdir(), `nexora-gh-${Date.now()}.zip`);
    const t = gh.token();
    const r = await fetchImpl(`https://api.github.com/repos/${full}/zipball/${ref || ''}`, { headers: { 'User-Agent': 'NEXORA', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, redirect: 'follow' });
    if (!r.ok) throw new Error(`Téléchargement impossible (HTTP ${r.status}).`);
    fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
    const dir = path.join(parent, full.split('/')[1]);
    if (fs.existsSync(dir) && fs.readdirSync(dir).length) throw new Error(`Le dossier ${path.basename(dir)} existe déjà.`);
    await extract(tmp, dir, { strip: 1 });
    fs.rmSync(tmp, { force: true });
    return { dir };
  });
  // Publication complète : dépôt local, premier commit, dépôt GitHub, envoi, GitHub Pages en option.
  ipcMain.handle('git:publish', async (_e, {
    dir, name, isPrivate, description, pages, message,
  }) => {
    if (!gh.token()) throw new Error('Connectez d’abord votre compte GitHub.');
    const me = await gh.me();
    send('git:progress', { label: 'Préparation du dépôt local' });
    let st = await gitops.status(dir);
    if (!st.repo) st = await gitops.init(dir);
    if (st.files.length || !(await gitops.log(dir, 1)).length) await gitops.commit(dir, message || 'Première version', gh.author());
    let full = st.remote && /github\.com[/:]([^/]+\/[^/.]+)/.exec(st.remote) ? /github\.com[/:]([^/]+\/[^/.]+)/.exec(st.remote)[1] : null;
    if (!full) {
      send('git:progress', { label: 'Création du dépôt sur GitHub' });
      const repo = await gh.createRepo({ name, description, isPrivate });
      full = repo.full_name;
      await gitops.setRemote(dir, repo.clone_url);
    }
    send('git:progress', { label: 'Envoi du code' });
    const { branch } = await gitops.push(dir, gh, progress('Envoi'));
    let pagesUrl = null;
    if (pages) {
      send('git:progress', { label: 'Activation de GitHub Pages' });
      try { pagesUrl = await gh.enablePages(full, branch, '/'); } catch (e) { pagesUrl = { error: e.message }; }
    }
    return {
      url: `https://github.com/${full}`, full, branch, pages: pagesUrl, login: me && me.login,
    };
  });

  // ------------------------------------------------------------- partage
  ipcMain.handle('tunnel:list', () => share.list());
  ipcMain.handle('tunnel:install', () => share.installCloudflared((p) => send('tunnel:progress', { progress: p })));
  ipcMain.handle('tunnel:start', (_e, { id, target }) => share.startTunnel(id, target));
  ipcMain.handle('tunnel:stop', (_e, { id }) => { share.stopTunnel(id); return true; });
  ipcMain.handle('tunnel:name-set', (_e, { host, target }) => share.setName(host, target));
  ipcMain.handle('tunnel:name-remove', (_e, { host }) => share.removeName(host));
  ipcMain.handle('tunnel:system', (_e, { hosts }) => share.systemWide(hosts));

  app.on('before-quit', () => {
    terms.closeAllSync();
    share.stopAll();
    for (const s of statics.values()) { try { s.close(); } catch { /* ignore */ } }
    for (const w of watchers.values()) { try { w(); } catch { /* ignore */ } }
  });
}

module.exports = { register, TEMPLATES };
