'use strict';
/* Maintenance : mises à jour de NEXORA, journaux d'assistance.
 * Mises à jour : NEXORA lit la dernière version publiée sur un dépôt GitHub (Releases) choisi dans les
 * réglages, télécharge l'installateur (avec reprise), vérifie son empreinte quand GitHub la fournit, puis le lance. */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { resumableDownload } = require('./download');
const { logDir } = require('./plain');

const cmp = (a, b) => {
  const pa = String(a).replace(/^v/i, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).replace(/^v/i, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); }
  return 0;
};

function register({
  ipcMain, app, shell, net, send,
}) {
  const fetchImpl = (u, o) => (net && net.fetch ? net.fetch(u, o) : fetch(u, o));
  let latest = null;
  ipcMain.handle('update:check', async (_e, { repo } = {}) => {
    const current = app.getVersion();
    if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return { current, configured: false };
    const r = await fetchImpl(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'NEXORA' } });
    if (r.status === 404) throw new Error('Aucune version publiée sur ce dépôt (ou dépôt privé).');
    if (!r.ok) throw new Error('Impossible de vérifier les mises à jour pour le moment.');
    const j = await r.json();
    const asset = (j.assets || []).find((a) => /\.exe$/i.test(a.name) && /install|setup/i.test(a.name)) || (j.assets || []).find((a) => /\.exe$/i.test(a.name));
    const version = String(j.tag_name || j.name || '').replace(/^v/i, '');
    latest = asset ? {
      version, url: asset.browser_download_url, size: asset.size, name: asset.name, sha256: /^sha256:/.test(asset.digest || '') ? asset.digest.slice(7) : undefined, notes: String(j.body || '').slice(0, 2000),
    } : null;
    return {
      current, configured: true, version, available: Boolean(latest && cmp(version, current) > 0), notes: latest ? latest.notes : '', size: latest ? latest.size : 0,
    };
  });
  ipcMain.handle('update:install', async () => {
    if (!latest) throw new Error('Vérifie d’abord les mises à jour.');
    const file = path.join(app.getPath('temp'), 'nexora-maj', latest.name);
    await resumableDownload(fetchImpl, latest.url, file, {
      sha256: latest.sha256, onProgress: (p) => send('update:progress', { progress: p }),
    });
    // L'installateur remplace NEXORA puis la relance ; les réglages et projets sont conservés.
    spawn(file, [], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => app.quit(), 600);
    return true;
  });
  ipcMain.handle('support:open-logs', async () => {
    const d = logDir();
    fs.mkdirSync(d, { recursive: true });
    await shell.openPath(d);
    return d;
  });
}

module.exports = { register, cmp };
