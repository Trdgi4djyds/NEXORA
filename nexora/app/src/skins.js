'use strict';
/* Cadres officiels d'appareils au format « skin » de l'émulateur Android (fichier layout + images).
 *  - Fournis avec NEXORA : Pixel, Wear OS, Android Automotive, Google TV (Android Studio, licence Apache 2.0).
 *  - Importés par l'utilisateur : cadres Samsung Galaxy (téléchargés depuis Samsung Developers avec son
 *    compte Samsung), ou n'importe quel cadre d'émulateur (.zip ou dossier). */
const fs = require('fs');
const os = require('os');
const path = require('path');

function parseLayout(text) {
  const tokens = String(text).replace(/#[^\n]*/g, '').match(/\{|\}|[^\s{}]+/g) || [];
  let i = 0;
  const block = () => {
    const o = {};
    while (i < tokens.length) {
      const t = tokens[i++];
      if (t === '}') return o;
      if (tokens[i] === '{') { i += 1; o[t] = block(); } else { o[t] = tokens[i++]; }
    }
    return o;
  };
  return block();
}

function skinInfo(layout) {
  const parts = layout.parts || {};
  const lay = (layout.layouts && (layout.layouts.portrait || Object.values(layout.layouts)[0])) || {};
  const disp = (parts.device && parts.device.display) || {};
  const refs = Object.values(lay).filter((v) => v && typeof v === 'object' && v.name);
  const devRef = refs.find((p) => p.name === 'device') || { x: 0, y: 0 };
  const bgRef = refs.find((p) => p.name !== 'device' && parts[p.name] && parts[p.name].background) || refs.find((p) => p.name !== 'device') || { x: 0, y: 0, name: 'portrait' };
  const part = parts[bgRef.name] || parts.portrait || parts.landscape || {};
  const n = (v) => Number(v) || 0;
  return {
    canvas: [n(lay.width), n(lay.height)],
    display: {
      w: n(disp.width), h: n(disp.height), x: n(devRef.x) + n(disp.x), y: n(devRef.y) + n(disp.y), r: n(disp.corner_radius),
    },
    bg: { x: n(bgRef.x), y: n(bgRef.y) },
    back: part.background && part.background.image ? part.background.image : null,
    fore: part.foreground && part.foreground.image ? part.foreground.image : null,
    mask: part.foreground && part.foreground.mask ? part.foreground.mask : null,
    cutout: part.foreground && part.foreground.cutout ? part.foreground.cutout : null,
  };
}

class UserSkins {
  constructor(dir) {
    this.dir = dir;
    this.indexFile = path.join(dir, 'index.json');
  }

  list() {
    try { return JSON.parse(fs.readFileSync(this.indexFile, 'utf8')); } catch { return {}; }
  }

  saveIndex(idx) {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.indexFile, JSON.stringify(idx, null, 1));
  }

  /** Importe un cadre (.zip ou dossier) : chaque dossier contenant un fichier « layout » devient une variante. */
  async importPath(src, { vendor = 'samsung', name } = {}) {
    let folder = src;
    let tmp = null;
    if (/\.zip$/i.test(src)) {
      const { extract } = require('./android/zip');
      tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexora-skin-'));
      await extract(src, tmp, {});
      folder = tmp;
    }
    const label = name || path.basename(src).replace(/\.zip$/i, '').replace(/[_-]+/g, ' ').trim();
    const id = `${vendor}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`.slice(0, 80);
    const target = path.join(this.dir, id);
    fs.rmSync(target, { recursive: true, force: true });
    const variants = {};
    const walk = (d, rel) => {
      let ents;
      try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
      const layout = ents.find((e) => e.isFile() && e.name === 'layout');
      if (layout) {
        const info = skinInfo(parseLayout(fs.readFileSync(path.join(d, 'layout'), 'utf8')));
        if (info.display.w && info.display.h && info.canvas[0]) {
          const out = path.join(target, rel);
          fs.mkdirSync(out, { recursive: true });
          for (const e of ents) if (e.isFile() && /\.(png|webp|jpe?g)$|^layout$/i.test(e.name)) fs.copyFileSync(path.join(d, e.name), path.join(out, e.name));
          variants[rel || 'default'] = { path: `${id}${rel ? `/${rel}` : ''}`, folder: rel || label, ...info };
        }
      }
      for (const e of ents) if (e.isDirectory() && !e.name.startsWith('__MACOSX')) walk(path.join(d, e.name), rel ? `${rel}/${e.name}` : e.name);
    };
    walk(folder, '');
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
    if (!Object.keys(variants).length) throw new Error('Aucun cadre trouvé : le dossier ne contient pas de fichier « layout » de cadre d’émulateur Android.');
    const idx = this.list();
    idx[id] = {
      id, name: label, vendor, variants, imported: new Date().toISOString(),
    };
    this.saveIndex(idx);
    return idx[id];
  }

  remove(id) {
    const idx = this.list();
    delete idx[id];
    this.saveIndex(idx);
    fs.rmSync(path.join(this.dir, id), { recursive: true, force: true });
  }
}

const SAMSUNG_PAGES = {
  z: 'https://developer.samsung.com/galaxy-emulator-skin/galaxy-z.html',
  s: 'https://developer.samsung.com/galaxy-emulator-skin/galaxy-s.html',
  a: 'https://developer.samsung.com/galaxy-emulator-skin/galaxy-a.html',
  tab: 'https://developer.samsung.com/galaxy-emulator-skin/galaxy-tab.html',
  watch: 'https://developer.samsung.com/galaxy-emulator-skin/galaxy-watch.html',
};

function register({
  ipcMain, app, dialog, BrowserWindow, send, getWin,
}) {
  const store = new UserSkins(path.join(app.getPath('userData'), 'skins'));
  ipcMain.handle('skins:list', () => store.list());
  ipcMain.handle('skins:remove', (_e, id) => { store.remove(id); send('skins:changed', store.list()); return true; });
  ipcMain.handle('skins:import', async () => {
    const r = await dialog.showOpenDialog(getWin(), { title: 'Importer un cadre d’appareil (cadre d’émulateur Android)', filters: [{ name: 'Cadre (.zip)', extensions: ['zip'] }], properties: ['openFile', 'multiSelections'] });
    if (r.canceled) return null;
    const out = [];
    for (const f of r.filePaths) out.push(await store.importPath(f, { vendor: /galaxy|samsung/i.test(f) ? 'samsung' : 'other' }));
    send('skins:changed', store.list());
    return out;
  });
  // Page Samsung Developers dans une fenêtre : l'utilisateur se connecte et télécharge ; chaque cadre
  // téléchargé est importé aussitôt.
  ipcMain.handle('skins:samsung', (_e, { page = 'z' } = {}) => {
    const w = new BrowserWindow({
      width: 1200, height: 860, parent: getWin(), title: 'Cadres officiels Samsung Galaxy', autoHideMenuBar: true, webPreferences: { partition: 'persist:samsung-dev', sandbox: true, contextIsolation: true },
    });
    const ses = w.webContents.session;
    const onDownload = (_ev, item) => {
      const name = item.getFilename();
      const file = path.join(os.tmpdir(), `nexora-${Date.now()}-${name}`);
      item.setSavePath(file);
      send('skins:progress', { name, state: 'start' });
      item.once('done', async (_e2, state) => {
        if (state !== 'completed') { send('skins:progress', { name, state: 'failed' }); return; }
        try {
          const s = await store.importPath(file, { vendor: 'samsung', name: name.replace(/\.zip$/i, '').replace(/[_-]+/g, ' ') });
          send('skins:progress', { name: s.name, state: 'imported', id: s.id, variants: Object.keys(s.variants).length });
          send('skins:changed', store.list());
        } catch (err) {
          send('skins:progress', { name, state: 'failed', error: err.message });
        } finally { fs.rmSync(file, { force: true }); }
      });
    };
    ses.on('will-download', onDownload);
    w.on('closed', () => ses.removeListener('will-download', onDownload));
    w.webContents.setWindowOpenHandler(({ url }) => { w.loadURL(url); return { action: 'deny' }; });
    w.loadURL(SAMSUNG_PAGES[page] || SAMSUNG_PAGES.z);
    return true;
  });
  return store;
}

module.exports = {
  parseLayout, skinInfo, UserSkins, register,
};
