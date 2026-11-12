'use strict';
/* Maintenance : mises à jour de NEXORA, journaux d'assistance.
 * Mises à jour : NEXORA lit la dernière version publiée sur son dépôt de distribution (NEXORA #115 : fixé ici,
 * jamais choisi ni affiché dans l'interface), télécharge l'installateur (avec reprise), vérifie son empreinte quand
 * elle est fournie, puis le lance.
 * NEXORA #059 : sans installateur dans la version publiée, la version portable (.zip) est prise : elle est
 * téléchargée dans le dossier Téléchargements (empreinte vérifiée), montrée dans l'Explorateur, et une fenêtre
 * explique comment remplacer le dossier. Rien n'est remplacé pendant que NEXORA tourne ; les réglages, projets et
 * le compte sont dans le profil Windows (userData), pas dans le dossier de NEXORA. */
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

// Fichier à télécharger dans une version publiée : installateur d'abord, puis n'importe quel .exe, puis la version
// portable (.zip, de préférence nommée « portable »).
function pickAsset(assets) {
  // NEXORA #076 : le paquet signé et le manifeste ne sont jamais pris pour un installateur.
  const list = (Array.isArray(assets) ? assets : []).filter((a) => !/\.(nxpack|sig)$|manifest/i.test(a.name || ''));
  const exe = list.find((a) => /\.exe$/i.test(a.name) && /install|setup/i.test(a.name)) || list.find((a) => /\.exe$/i.test(a.name));
  if (exe) return { ...exe, kind: 'exe' };
  const zip = list.find((a) => /\.zip$/i.test(a.name) && /portable/i.test(a.name)) || list.find((a) => /\.zip$/i.test(a.name));
  return zip ? { ...zip, kind: 'zip' } : null;
}

const DEFAULT_REPO = 'Trdgi4djyds/NEXORA-portable';

function register({
  ipcMain, app, shell, net, send,
}) {
  const fetchImpl = (u, o) => (net && net.fetch ? net.fetch(u, o) : fetch(u, o));
  let latest = null;
  ipcMain.handle('update:check', async () => {
    const current = app.getVersion();
    // NEXORA #076 : dépôt public de distribution (lanceur et paquets signés). NEXORA #115 : un dépôt envoyé par
    // l'interface (ancien réglage « Dépôt des versions ») n'est plus suivi.
    const repo = DEFAULT_REPO;
    const r = await fetchImpl(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'NEXORA' } });
    if (r.status === 404) throw new Error('Aucune nouvelle version n’est disponible pour le moment.');
    if (!r.ok) throw new Error('Impossible de vérifier les mises à jour pour le moment.');
    const j = await r.json();
    const asset = pickAsset(j.assets);
    const version = String(j.tag_name || j.name || '').replace(/^v/i, '');
    latest = asset ? {
      version, kind: asset.kind, url: asset.browser_download_url, size: asset.size, name: asset.name, sha256: /^sha256:/.test(asset.digest || '') ? asset.digest.slice(7) : undefined, notes: String(j.body || '').slice(0, 2000),
    } : null;
    return {
      current, configured: true, version, available: Boolean(latest && cmp(version, current) > 0), notes: latest ? latest.notes : '', size: latest ? latest.size : 0, kind: latest ? latest.kind : null,
    };
  });
  ipcMain.handle('update:install', async () => {
    // NEXORA #076 : NEXORA Devs Toolbox télécharge, vérifie la signature et les empreintes, remplace puis relance.
    if (require('./license').updateViaLauncher(app)) return { kind: 'launcher' };
    if (!latest) throw new Error('Vérifiez d’abord les mises à jour.');
    if (latest.kind === 'zip') return installPortable(latest);
    const file = path.join(app.getPath('temp'), 'nexora-maj', latest.name);
    await resumableDownload(fetchImpl, latest.url, file, {
      sha256: latest.sha256, onProgress: (p) => send('update:progress', { progress: p }),
    });
    // L'installateur remplace NEXORA puis la relance ; les réglages et projets sont conservés.
    spawn(file, [], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => app.quit(), 600);
    return true;
  });
  async function installPortable(rel) {
    const safe = `NEXORA-${rel.version.replace(/[^\w.-]/g, '')}-portable.zip`;
    const file = path.join(app.getPath('downloads'), safe);
    await resumableDownload(fetchImpl, rel.url, file, {
      sha256: rel.sha256, onProgress: (p) => send('update:progress', { progress: p }),
    });
    shell.showItemInFolder(file);
    const { dialog, BrowserWindow } = require('electron');
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'Mise à jour de NEXORA',
      message: `NEXORA ${rel.version} est téléchargée`,
      detail: `Le fichier ${safe} est dans votre dossier Téléchargements${rel.sha256 ? ' (empreinte vérifiée)' : ''}.\n\n`
        + '1. Fermez NEXORA.\n2. Décompressez le fichier, puis remplacez l’ancien dossier de NEXORA par le nouveau (ou gardez les deux).\n3. Lancez NEXORA.exe depuis le nouveau dossier.\n\n'
        + 'Vos réglages, vos projets et votre compte sont gardés : ils sont rangés dans votre profil Windows, pas dans le dossier de NEXORA.',
      buttons: ['Fermer NEXORA', 'Plus tard'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (response === 0) setTimeout(() => app.quit(), 300);
    return { kind: 'zip', file };
  }
  ipcMain.handle('support:open-logs', async () => {
    const d = logDir();
    fs.mkdirSync(d, { recursive: true });
    await shell.openPath(d);
    return d;
  });
}

module.exports = { register, cmp, pickAsset, DEFAULT_REPO };
