'use strict';
/* NEXORA #023 : canaux IPC du Desktop Builder (desktop:*), l'espace qui transforme un site en ligne, un dossier de
 * site ou un projet Electron en logiciel de bureau installable (installateur Windows, version portable, ZIP, MSI). */
const fs = require('fs');
const path = require('path');
const { DesktopBuilder, defaultHome, OWNER_FILE } = require('./builder');
const distrib = require('./distrib');
const { analyzeDesktopSource } = require('./analyze');

function register({
  ipcMain, app, dialog, shell, safeStorage, net, send, getWin,
}) {
  const fetchImpl = (url, opts) => (net && net.fetch ? net.fetch(url, opts) : fetch(url, opts));
  // Mot de passe des certificats protégé par le trousseau du système (DPAPI sous Windows) ; méthodes asynchrones
  // d'Electron quand elles existent (les méthodes synchrones sont dépréciées depuis Electron 45).
  const crypt = !safeStorage ? null : {
    async available() {
      try { return safeStorage.isAsyncEncryptionAvailable ? await safeStorage.isAsyncEncryptionAvailable() : safeStorage.isEncryptionAvailable(); } catch { return false; }
    },
    async encrypt(v) {
      if (!(await this.available())) throw new Error('Le trousseau sécurisé du système n’est pas disponible : le mot de passe du certificat ne peut pas être protégé.');
      const buf = safeStorage.encryptStringAsync ? await safeStorage.encryptStringAsync(String(v)) : safeStorage.encryptString(String(v));
      return Buffer.from(buf).toString('base64');
    },
    async decrypt(b) {
      const buf = Buffer.from(String(b), 'base64');
      const r = safeStorage.decryptStringAsync ? await safeStorage.decryptStringAsync(buf) : safeStorage.decryptString(buf);
      return typeof r === 'string' ? r : (r && r.result) || '';
    },
  };
  const builder = new DesktopBuilder({
    home: defaultHome(app.getPath('userData')), fetchImpl, nexoraVersion: app.getVersion(), documents: app.getPath('documents'), crypt,
  });
  builder.on('progress', (p) => send('desktop:progress', p));
  builder.on('log', (l) => send('desktop:log', l));

  ipcMain.handle('desktop:status', () => builder.status());

  // ---------------------------------------------------------------- NEXORA #058 : distribution
  // Fichier produit par NEXORA : dans un dossier de logiciel marqué par NEXORA, avec une extension attendue.
  const owned = (file, exts = /\.(exe|msi|zip|appx|msix|blockmap|yml)$/i) => {
    const f = path.resolve(String(file || ''));
    try { return exts.test(f) && fs.statSync(f).isFile() && Boolean(JSON.parse(fs.readFileSync(path.join(path.dirname(f), OWNER_FILE), 'utf8')).appId); } catch { return false; }
  };
  ipcMain.handle('desktop:azure-info', (_e, { appId } = {}) => builder.azureInfo(String(appId || '')));
  ipcMain.handle('desktop:azure-save', (_e, { appId, tenant, client, secret } = {}) => builder.saveAzure(String(appId || ''), { tenant, client, secret }));
  ipcMain.handle('desktop:azure-remove', (_e, { appId } = {}) => builder.removeAzure(String(appId || '')));
  // Jeton GitHub (publication des mises à jour) : chiffré par le trousseau de Windows, jamais renvoyé à l'interface.
  const ghFile = path.join(builder.home, 'github.json');
  const ghRead = () => { try { return JSON.parse(fs.readFileSync(ghFile, 'utf8')); } catch { return null; } };
  ipcMain.handle('desktop:gh-token-info', () => { const m = ghRead(); return m && m.token ? { ok: true, at: m.at, hint: m.hint } : { ok: false }; });
  ipcMain.handle('desktop:gh-token-save', async (_e, { token } = {}) => {
    const t = String(token || '').trim();
    if (!/^(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,})$/.test(t)) throw new Error('Ce n’est pas un jeton GitHub (il commence par github_pat_ ou ghp_).');
    if (!crypt) throw new Error('Le trousseau sécurisé de Windows n’est pas disponible : le jeton ne peut pas être protégé.');
    fs.mkdirSync(builder.home, { recursive: true });
    fs.writeFileSync(ghFile, JSON.stringify({ token: await crypt.encrypt(t), hint: `${t.slice(0, 11)}…${t.slice(-4)}`, at: new Date().toISOString() }), { mode: 0o600 });
    return { ok: true, hint: `${t.slice(0, 11)}…${t.slice(-4)}` };
  });
  ipcMain.handle('desktop:gh-token-remove', () => { fs.rmSync(ghFile, { force: true }); return { ok: false }; });
  // Publication d'une version : latest.yml complété (déploiement progressif, mise à jour obligatoire, nouveautés),
  // puis envoi sur GitHub, ou dossier prêt à déposer sur le serveur web.
  ipcMain.handle('desktop:publish', async (_e, {
    mode, owner, repo, version, files, notes = '', staging = 100, mandatory = false, beta = false,
  } = {}) => {
    const list = (Array.isArray(files) ? files : []).map(String).filter((f) => owned(f));
    if (!list.length) throw new Error('Aucun fichier de cette construction n’a été retrouvé : reconstruis le logiciel.');
    for (const f of list.filter((x) => /\.yml$/i.test(x))) fs.writeFileSync(f, distrib.patchUpdateYml(fs.readFileSync(f, 'utf8'), { staging, mandatory, notes }));
    if (mode === 'generic') return { ok: true, dir: path.dirname(list[0]), files: list.map((f) => path.basename(f)) };
    const m = ghRead();
    if (!m || !m.token) throw new Error('Ajoute d’abord un jeton GitHub (section Distribution).');
    const token = await crypt.decrypt(m.token);
    return distrib.publishGithub({
      owner, repo, token, version: String(version || ''), files: list.map((f) => ({ path: f })), notes, prerelease: Boolean(beta),
    }, fetchImpl, (label, progress) => send('desktop:progress', { step: 'publish', label, progress }));
  });
  // Versions d'Electron encore suivies (calendrier public, gardé 12 heures).
  let cycles = null;
  ipcMain.handle('desktop:electron-support', async (_e, { versions = [] } = {}) => {
    if (!cycles || Date.now() - cycles.at > 12 * 3600e3) cycles = { at: Date.now(), list: await distrib.electronCycles(fetchImpl) };
    const out = {};
    for (const v of (Array.isArray(versions) ? versions : []).slice(0, 20)) out[v] = distrib.supportOf(v, cycles.list);
    return { newest: cycles.list[0] ? cycles.list[0].latest : '', versions: out };
  });
  // Essai dans le Bac à sable Windows : dossier des fichiers en lecture seule, installateur lancé à l'ouverture.
  ipcMain.handle('desktop:sandbox', async (_e, { file } = {}) => {
    const f = String(file || '');
    if (!owned(f, /\.(exe|msi|zip)$/i)) throw new Error('Ce fichier n’a pas été produit par NEXORA ou n’existe plus.');
    if (process.platform !== 'win32') throw new Error('Le Bac à sable Windows n’existe que sous Windows 10 et 11 (éditions Professionnel et Entreprise).');
    const dir = path.dirname(f);
    const wsb = path.join(dir, `Essai - ${path.basename(f).replace(/\.[^.]+$/, '')}.wsb`);
    fs.writeFileSync(wsb, distrib.sandboxConfig({ hostDir: dir, file: f, folder: path.basename(dir) }));
    const err = await shell.openPath(wsb);
    if (err) throw new Error('Le Bac à sable Windows n’est pas activé sur ce PC : Paramètres › Système › Fonctionnalités facultatives › Plus de fonctionnalités Windows › « Bac à sable Windows », puis redémarre (éditions Professionnel et Entreprise).');
    return { ok: true, wsb };
  });
  // Fiches winget : empreinte de l'installateur, trois fichiers YAML rangés comme dans le dépôt microsoft/winget-pkgs.
  ipcMain.handle('desktop:winget', async (_e, { file, url, app: a = {} } = {}) => {
    const f = String(file || '');
    if (!owned(f, /\.(exe|msi|zip)$/i)) throw new Error('Ce fichier n’a pas été produit par NEXORA ou n’existe plus.');
    const id = String(a.id || '') || distrib.wingetId(a.publisher, a.name);
    const kind = /\.msi$/i.test(f) ? 'msi' : /\.zip$/i.test(f) ? 'zip' : /-portable-/i.test(f) ? 'portable' : 'nsis';
    const manifests = distrib.wingetManifests({
      id, name: String(a.name || ''), publisher: String(a.publisher || ''), version: String(a.version || ''), url: String(url || ''), sha256: await distrib.sha256File(f), kind, scope: a.scope, arch: /arm64/i.test(f) ? 'arm64' : 'x64', description: a.description, homepage: a.homepage, license: a.license, copyright: a.copyright,
    });
    const dir = path.join(path.dirname(f), 'winget', distrib.wingetDir(id, a.version));
    fs.mkdirSync(dir, { recursive: true });
    for (const m of manifests) fs.writeFileSync(path.join(dir, m.name), m.text);
    return { ok: true, id, dir, files: manifests.map((m) => m.name) };
  });
  ipcMain.handle('desktop:pick-source', async (_e, { kind } = {}) => {
    const r = await dialog.showOpenDialog(getWin(), { title: kind === 'electron' ? 'Dossier du projet Electron' : 'Dossier du site ou du projet', properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    return analyzeDesktopSource(r.filePaths[0]);
  });
  ipcMain.handle('desktop:analyze', (_e, { dir } = {}) => analyzeDesktopSource(String(dir || '')));
  // Logo trouvé sur le site (icône du logiciel) : récupéré ici, car la page de NEXORA n'a pas le droit de charger
  // des images d'autres sites (politique de sécurité) ni de les lire dans un canvas.
  ipcMain.handle('desktop:fetch-image', async (_e, { url } = {}) => {
    let u;
    try { u = new URL(String(url || '')); } catch { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    const res = await fetchImpl(u.href, { headers: { 'User-Agent': 'NEXORA', Accept: 'image/*' } });
    if (!res.ok) return null;
    const type = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!/^image\/(png|jpeg|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon|avif)$/.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 5e6) return null;
    return `data:${type};base64,${buf.toString('base64')}`;
  });
  ipcMain.handle('desktop:pick-out', async () => {
    const r = await dialog.showOpenDialog(getWin(), { title: 'Dossier où ranger tes logiciels', properties: ['openDirectory', 'createDirectory'] });
    return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
  });
  ipcMain.handle('desktop:pick-cert', async () => {
    const r = await dialog.showOpenDialog(getWin(), { title: 'Certificat de signature de code', filters: [{ name: 'Certificat (PFX, P12)', extensions: ['pfx', 'p12'] }], properties: ['openFile'] });
    return r.canceled || !r.filePaths[0] ? null : { path: r.filePaths[0], name: path.basename(r.filePaths[0]) };
  });
  ipcMain.handle('desktop:cert-info', (_e, { appId } = {}) => builder.certInfo(String(appId || '')));
  ipcMain.handle('desktop:cert-save', (_e, { appId, file, password } = {}) => builder.saveCert(String(appId || ''), String(file || ''), password));
  ipcMain.handle('desktop:cert-remove', (_e, { appId } = {}) => builder.removeCert(String(appId || '')));
  ipcMain.handle('desktop:build', (_e, payload) => builder.build(payload || {}));
  ipcMain.handle('desktop:cancel', () => builder.cancel());
  ipcMain.handle('desktop:clear-cache', () => builder.clearCache());
  ipcMain.handle('desktop:log-open', () => (builder.lastLog && fs.existsSync(builder.lastLog) ? shell.openPath(builder.lastLog) : false));
  ipcMain.handle('desktop:export', async (_e, payload) => {
    const r = await dialog.showOpenDialog(getWin(), { title: 'Dossier où écrire le code source du logiciel', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    return builder.exportProject(payload || {}, r.filePaths[0]);
  });
  // Ouvrir un fichier produit : installer, tester la version non installée, afficher dans l'explorateur.
  ipcMain.handle('desktop:open', async (_e, { file, action } = {}) => {
    const f = String(file || '');
    if (action === 'reveal') { if (fs.existsSync(f)) shell.showItemInFolder(f); return true; }
    if (action === 'folder') { if (fs.existsSync(f) && fs.statSync(f).isDirectory()) return shell.openPath(f); return false; }
    if (action === 'install') {
      if (!builder.produced(f)) throw new Error('Ce fichier n’a pas été produit par NEXORA ou n’existe plus.');
      const err = await shell.openPath(f);
      if (err) throw new Error(err);
      return true;
    }
    if (action === 'run') {
      if (!builder.produced(f, { test: true })) throw new Error('La version de test n’existe plus : relance la construction.');
      const child = require('child_process').spawn(f, [], { detached: true, stdio: 'ignore', cwd: path.dirname(f) });
      child.on('error', () => {});
      child.unref();
      return true;
    }
    return false;
  });
}

module.exports = { register };
