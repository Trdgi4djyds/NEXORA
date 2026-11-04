'use strict';
/* NEXORA #023 : canaux IPC du Desktop Builder (desktop:*), l'espace qui transforme un site en ligne, un dossier de
 * site ou un projet Electron en logiciel de bureau installable (installateur Windows, version portable, ZIP, MSI). */
const fs = require('fs');
const path = require('path');
const { DesktopBuilder, defaultHome } = require('./builder');
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
