'use strict';
const {
  app, BrowserWindow, ipcMain, dialog, shell, webContents, Menu, clipboard, nativeTheme, protocol, safeStorage, net, session, screen,
} = require('electron');

// Erreurs renvoyées à l'interface : message clair, détail technique gardé dans le journal local.
const { plain, library, techLog } = require('./src/plain');
{
  const handle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, fn) => handle(channel, async (...args) => {
    try { return await fn(...args); } catch (err) {
      techLog('erreurs', `${channel}\n${err && err.stack ? err.stack : err}`);
      const e = new Error(plain(err && err.message ? err.message : String(err)));
      throw e;
    }
  });
}
// NEXORA #037 : offres Gratuit, Standard et Pro : les canaux réservés à une offre ou soumis à un quota
// demandent l'accord des serveurs NEXORA avant de s'exécuter (src/plan.js). Posé avant tout enregistrement.
// NEXORA #076 : deux offres (Gratuit, Pro) et verrou de licence sur tous les canaux des espaces (src/license.js).
require('./src/plan').guardIpc(ipcMain);
// NEXORA #076 : NEXORA Devs Toolbox (le lanceur) est le seul point d'entrée : ouvert directement, NEXORA relance le
// lanceur (vérification des fichiers, mise à jour) ; une seule fenêtre (les liens nexora:// arrivent dans celle-ci).
const license = require('./src/license');
if (license.viaLauncher(app) || !app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

// Une seule boîte de dialogue système à la fois : un double-clic (ou deux actions rapprochées) ouvrait
// plusieurs fenêtres Importer / Exporter l'une derrière l'autre. Les demandes faites pendant qu'une boîte
// est ouverte sont ignorées (réponse « annulé »).
{
  let open = false;
  for (const k of ['showOpenDialog', 'showSaveDialog']) {
    const f = dialog[k].bind(dialog);
    dialog[k] = async (...args) => {
      if (open) return { canceled: true, filePaths: [], filePath: undefined, busy: true };
      open = true;
      try { return await f(...args); } finally { setTimeout(() => { open = false; }, 250); }
    };
  }
}
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { ProjectRunner, probe } = require('./src/runner');
const { StaticServer } = require('./src/static-server');
const { analyzeProject, commandPreview } = require('./src/frameworks');
const { checkSdks, describe } = require('./src/sdk');

// Nom du produit : NEXORA (anciennement Vitrine). On conserve le dossier de données « Vitrine »
// pour ne pas perdre les projets et réglages déjà enregistrés après le changement de nom.
app.setName('NEXORA');
if (process.env.VITRINE_USER_DATA) app.setPath('userData', process.env.VITRINE_USER_DATA);
else { try { app.setPath('userData', path.join(app.getPath('appData'), 'Vitrine')); } catch { /* chemin par défaut */ } }
// NEXORA #016 : isolation des projets (session web et environnement propres à chaque projet) et outils de
// développement installés par NEXORA (placés dans le PATH dès le démarrage).
const isolation = require('./src/isolation');
const toolsMod = require('./src/tools');
const tools = toolsMod.setShared(new toolsMod.Tools({
  home: toolsMod.defaultHome(app.getPath('userData')),
  fetchImpl: (u, o) => (net && net.fetch && app.isReady() ? net.fetch(u, o) : fetch(u, o)),
}));
// Studio 3D : la 3D reste disponible sur les cartes graphiques anciennes mises en liste noire par Chromium.
app.commandLine.appendSwitch('ignore-gpu-blocklist');
const WEBVIEW_PRELOAD = path.join(__dirname, 'webview-preload.js');
const RENDERER = path.join(__dirname, 'renderer');

// L'interface est servie par un protocole app:// sécurisé : modules ES, chargement à la demande et WebCodecs.
protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: {
    standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, codeCache: true, stream: true,
  },
}]);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.hdr': 'application/octet-stream', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/mp4', '.mkv': 'video/x-matroska', '.ogv': 'video/ogg', '.gif': 'image/gif', '.avif': 'image/avif', '.bmp': 'image/bmp',
};
const mimeFor = (file) => MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
// Fichiers médias ouverts dans le Studio : jeton → chemin (le même fichier garde le même jeton).
const MEDIA = new Map();
function mediaToken(file) {
  const t = require('crypto').createHash('sha1').update(path.resolve(file)).digest('hex').slice(0, 20);
  MEDIA.set(t, path.resolve(file));
  return t;
}
function registerAppProtocol() {
  protocol.handle('app', async (req) => {
    let rel;
    try { rel = decodeURIComponent(new URL(req.url).pathname); } catch { return new Response('bad request', { status: 400 }); }
    // Cadres d'appareils importés par l'utilisateur (même origine que l'interface : images utilisables
    // dans les exports sans « canvas » contaminé).
    let base = RENDERER;
    // Médias importés dans le Studio (vidéos, séquences d'images) : seulement les fichiers choisis par l'utilisateur,
    // avec les plages d'octets (lecture et déplacement dans une vidéo).
    if (rel.startsWith('/user-media/')) {
      const f = MEDIA.get(rel.slice('/user-media/'.length).split('/')[0]);
      if (!f) return new Response('not found', { status: 404 });
      try {
        const st = await fs.promises.stat(f);
        const type = mimeFor(f);
        const range = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
        if (range) {
          const start = range[1] ? Number(range[1]) : 0;
          const end = range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
          if (start >= st.size) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${st.size}` } });
          const { Readable } = require('stream');
          return new Response(Readable.toWeb(fs.createReadStream(f, { start, end })), {
            status: 206, headers: { 'content-type': type, 'content-length': String(end - start + 1), 'content-range': `bytes ${start}-${end}/${st.size}`, 'accept-ranges': 'bytes' },
          });
        }
        const { Readable } = require('stream');
        return new Response(Readable.toWeb(fs.createReadStream(f)), { headers: { 'content-type': type, 'content-length': String(st.size), 'accept-ranges': 'bytes' } });
      } catch { return new Response('not found', { status: 404 }); }
    }
    if (rel.startsWith('/user-skins/')) {
      base = path.join(app.getPath('userData'), 'skins');
      rel = rel.slice('/user-skins'.length);
    }
    const file = path.normalize(path.join(base, rel));
    if (file !== base && !file.startsWith(base + path.sep)) return new Response('forbidden', { status: 403 });
    try {
      const data = await fs.promises.readFile(file);
      return new Response(data, { headers: { 'content-type': mimeFor(file), 'cache-control': 'no-cache' } });
    } catch { return new Response('not found', { status: 404 }); }
  });
}
const runner = new ProjectRunner();
let staticServer = null;
let win = null;

// ---------------------------------------------------------------- réglages
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() { try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; } }
function saveSettings(data) {
  try { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(data, null, 2)); } catch { /* ignore */ }
}

// ---------------------------------------------------------------- fenêtre
// Textes envoyés à l'interface (journal de construction, étapes, progression) : sans détails internes.
const PLAIN_CHANNELS = new Set(['android:log', 'android:step', 'android:progress', 'setup:progress', 'dev:vscode-progress', 'tunnel:progress', 'tools:progress', 'desktop:progress', 'desktop:log']);
// NEXORA #076 : textes susceptibles de nommer une bibliothèque chargée en coulisse.
const PLAIN_FIELDS = ['label', 'message', 'line', 'detail', 'text'];
function send(channel, payload) {
  if (!win || win.isDestroyed()) return;
  if (PLAIN_CHANNELS.has(channel)) {
    if (typeof payload === 'string') payload = library(payload);
    else if (payload && typeof payload === 'object') {
      payload = { ...payload };
      for (const k of PLAIN_FIELDS) if (typeof payload[k] === 'string') payload[k] = library(payload[k]);
      if (channel === 'tools:progress') { payload.label = 'Bibliothèque NEXORA'; delete payload.version; }
    }
  }
  win.webContents.send(channel, payload);
}

const SHORTCUTS = {
  // NEXORA #023 : Ctrl+8 ouvre le Desktop Builder (huitième espace du rail après l'Accueil).
  1: 'space-1', 2: 'space-2', 3: 'space-3', 4: 'space-4', 5: 'space-5', 6: 'space-6', 7: 'space-7', 8: 'space-8', r: 'reload', o: 'open', n: 'new', '=': 'zoom-in', '+': 'zoom-in', '-': 'zoom-out', '0': 'fit', l: 'focus-address', k: 'focus-search', j: 'console', i: 'inspector', b: 'sidebar',
};
const SHIFT_SHORTCUTS = { s: 'photo', r: 'record', f: 'present', t: 'rotate', p: 'fold', a: 'ai' };
function handleShortcut(event, input) {
  if (input.type !== 'keyDown') return;
  const mod = input.control || input.meta;
  if (input.key === 'F5') { event.preventDefault(); send('shortcut', 'refresh'); return; }
  if (input.key === 'F11') { event.preventDefault(); send('shortcut', 'present'); return; }
  if (input.key === 'Escape' && win && win.isFullScreen()) { send('shortcut', 'exit-present'); return; }
  if (!mod) return;
  const key = input.key.toLowerCase();
  // Ctrl+Alt : panneaux gauche/droite et taille de l'interface (le reste de Ctrl+Alt est laissé aux éditeurs).
  if (input.alt) {
    const ALT = { arrowleft: 'panel-left', arrowright: 'panel-right', '=': 'ui-zoom-in', '+': 'ui-zoom-in', '-': 'ui-zoom-out', 0: 'ui-zoom-reset' };
    if (ALT[key]) { event.preventDefault(); send('shortcut', ALT[key]); }
    return;
  }
  if (input.shift && key === 'i' && win) { event.preventDefault(); win.webContents.openDevTools({ mode: 'detach' }); return; }
  if (input.shift && SHIFT_SHORTCUTS[key]) { event.preventDefault(); send('shortcut', SHIFT_SHORTCUTS[key]); return; }
  if (!input.shift && SHORTCUTS[key]) { event.preventDefault(); send('shortcut', SHORTCUTS[key]); }
}

function createWindow() {
  const isMac = process.platform === 'darwin';
  const settings = loadSettings();
  const dark = settings.appTheme === 'dark' || (settings.appTheme === 'system' && nativeTheme.shouldUseDarkColors);
  // Taille de départ adaptée à l'écran (petits portables compris) ; tailles minimales basses, l'interface s'adapte.
  let size = [1520, 940];
  try { const wa = screen.getPrimaryDisplay().workAreaSize; size = [Math.min(1520, wa.width), Math.min(940, wa.height)]; } catch { /* écran inconnu */ }
  try { const t = JSON.parse(process.env.VITRINE_AUTOTEST || '{}'); if (Array.isArray(t.win)) size = t.win; } catch { /* */ }
  win = new BrowserWindow({
    width: size[0],
    height: size[1],
    minWidth: 760,
    minHeight: 520,
    show: false,
    title: 'NEXORA',
    backgroundColor: dark ? '#0d0e11' : '#e9ebf2',
    icon: path.join(__dirname, 'build', 'icon.png'),
    // NEXORA #046 : sous Windows et Linux, la barre native garde réduire, agrandir et fermer hors
    // du contenu. L'ancienne superposition masquait la barre d'outils, surtout sur les petits écrans.
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 18, y: 18 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, webviewTag: true, spellcheck: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.loadURL('app://vitrine/index.html');
  win.webContents.on('before-input-event', handleShortcut);
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  if (process.env.VITRINE_AUTOTEST) {
    win.webContents.on('console-message', (e) => {
      const msg = e.message;
      const lvl = e.level;
      if (lvl === 'error' || lvl === 'warning' || lvl >= 2) process.stdout.write(`[console ${lvl}] ${msg} ${e.sourceId || ''}:${e.lineNumber || ''}\n`);
    });
  }
  win.webContents.on('render-process-gone', (_e, d) => process.stdout.write(`[nexora] interface arrêtée : ${d.reason}\n`));
  win.on('enter-full-screen', () => send('window:fullscreen', true));
  win.on('leave-full-screen', () => send('window:fullscreen', false));
  win.on('closed', () => { win = null; });
}

app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (_ev, webPreferences, params) => {
    // NEXORA #016 : session propre à un projet (proxy du partage appliqué à chaque nouvelle session).
    const part = (params && params.partition) || webPreferences.partition || '';
    if (/^persist:nx-/.test(part) && isolation.valid(part)) isolation.register(part);
    // VS Code (Dev Lab) : pas de script d'émulation d'appareil dans son interface.
    if (params && params.partition === 'persist:vscode') {
      delete webPreferences.preload;
      webPreferences.nodeIntegration = false;
      webPreferences.contextIsolation = true;
      webPreferences.sandbox = true;
      return;
    }
    webPreferences.preload = WEBVIEW_PRELOAD;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
  });
  if (contents.getType() === 'webview' && contents.session === session.fromPartition('persist:vscode')) {
    // Les liens ouverts par VS Code (documentation, connexion à un compte) vont dans le navigateur.
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url) && !/^https?:\/\/127\.0\.0\.1[:/]/.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    return;
  }
  if (contents.getType() === 'webview') {
    contents.on('before-input-event', handleShortcut);
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) contents.loadURL(url);
      return { action: 'deny' };
    });
  }
});

// Conservé pour la compatibilité du pont : la barre native se dessine désormais hors de l'interface.
ipcMain.handle('window:titlebar', () => false);
ipcMain.handle('window:fullscreen', (_e, on) => { if (win) win.setFullScreen(Boolean(on)); });
ipcMain.handle('window:zoom', (_e, f) => { if (win) win.webContents.setZoomFactor(Math.max(0.7, Math.min(1.5, Number(f) || 1))); });

// Audit de sécurité défensif d'un site (en lecture seule).
const security = require('./src/security');
// NEXORA #048 : l'audit est aussi lancé par les audits programmés (src/securite/) ; chaque audit est gardé dans
// l'historique et comparé au précédent.
let securite = null;
async function runScan(url) {
  const fetchImpl = (u, o) => (net && net.fetch ? net.fetch(u, { ...o, useSessionCookies: false }) : fetch(u, o));
  let probe = null;
  try {
    // Fenêtre hors écran pour analyser le contenu rendu de la page (ressources, formulaires, SRI).
    probe = new BrowserWindow({ show: false, width: 1280, height: 860, webPreferences: { offscreen: true, sandbox: true, partition: isolation.partition() } });
    probe.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    await probe.webContents.loadURL(url).catch(() => {});
    await new Promise((r) => setTimeout(r, 1200));
  } catch { probe = null; }
  try {
    return await security.scan(url, { fetchImpl, page: probe ? probe.webContents : null, onStep: (p) => send('sec:progress', p) });
  } finally { if (probe && !probe.isDestroyed()) probe.destroy(); }
}
ipcMain.handle('sec:scan', async (_e, { url }) => {
  const r = await runScan(url);
  return securite ? securite.store.record({ ...r, kind: 'site', target: r.host }) : r;
});
// NEXORA #048 : page chargée dans une fenêtre cachée (session du projet ouvert), pour l'assistant CSP.
async function withPage(url, fn) {
  const w = new BrowserWindow({ show: false, width: 1280, height: 860, webPreferences: { offscreen: true, sandbox: true, partition: isolation.partition() } });
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.webContents.setAudioMuted(true);
  try {
    await Promise.race([w.loadURL(url).catch(() => {}), new Promise((r) => setTimeout(r, 25000))]);
    return await fn(w.webContents);
  } finally { if (!w.isDestroyed()) w.destroy(); }
}

// NEXORA #048 : parcours de la supervision (clics, saisies, vérifications) rejoués dans une fenêtre cachée,
// avec une session à part par parcours. Les valeurs secrètes (mots de passe) sont chiffrées par safeStorage.
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
function seal(v) {
  try { return safeStorage.isEncryptionAvailable() ? `enc:${safeStorage.encryptString(String(v || '')).toString('base64')}` : String(v || ''); } catch { return String(v || ''); }
}
function unseal(v) {
  const s = String(v == null ? '' : v);
  if (!s.startsWith('enc:')) return s;
  try { return safeStorage.decryptString(Buffer.from(s.slice(4), 'base64')); } catch { return ''; }
}
const stepLabel = (s) => ({ goto: `Ouvrir ${s.url || ''}`, click: `Cliquer sur ${s.text || s.sel || ''}`, fill: `Remplir ${s.sel || ''}`, press: 'Valider le formulaire', wait: `Attendre ${Math.round((Number(s.ms) || 1000) / 100) / 10} s`, expect: `Vérifier le texte « ${s.text || ''} »`, expectUrl: `Vérifier l’adresse « ${s.text || ''} »` }[s.do] || s.do || 'Étape').slice(0, 80);
async function runJourney(e) {
  const steps = Array.isArray(e.steps) ? e.steps.slice(0, 40) : [];
  const t0 = Date.now();
  const out = [];
  const part = `nexora-parcours-${String(e.id || 'essai').replace(/[^\w-]/g, '').slice(0, 30)}`;
  const w = new BrowserWindow({ show: false, width: 1280, height: 860, webPreferences: { offscreen: true, sandbox: true, partition: part } });
  const wc = w.webContents;
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.setAudioMuted(true);
  const js = (code) => wc.executeJavaScript(code, true);
  const settle = async () => { await pause(300); const end = Date.now() + 15000; while (wc.isLoading() && Date.now() < end) await pause(200); await pause(200); };
  const waitSel = async (sel) => { const end = Date.now() + 10000; while (Date.now() < end) { if (await js(`!!document.querySelector(${JSON.stringify(sel)})`).catch(() => false)) return true; await pause(250); } return false; };
  let error = '';
  let shot = '';
  try {
    await Promise.race([w.loadURL(e.url).catch(() => {}), pause(25000)]);
    await settle();
    for (const s of steps) {
      const st = Date.now();
      const label = stepLabel(s);
      let err = '';
      try {
        const sel = JSON.stringify(String(s.sel || ''));
        if (s.do === 'goto') { await Promise.race([w.loadURL(new URL(s.url, wc.getURL() || e.url).href).catch(() => {}), pause(25000)]); await settle(); }
        else if (s.do === 'click') { if (!(await waitSel(s.sel))) throw new Error(`élément introuvable (${s.sel})`); await js(`document.querySelector(${sel}).click()`); await settle(); }
        else if (s.do === 'fill') {
          if (!(await waitSel(s.sel))) throw new Error(`champ introuvable (${s.sel})`);
          await js(`(() => { const el = document.querySelector(${sel}); el.focus(); const p = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p, 'value').set.call(el, ${JSON.stringify(unseal(s.value))}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
        } else if (s.do === 'press') { await js(`(() => { const el = document.querySelector(${sel}) || document.activeElement; const f = el && el.closest ? el.closest('form') : null; if (f && f.requestSubmit) f.requestSubmit(); else if (el) el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`); await settle(); }
        else if (s.do === 'wait') await pause(Math.min(15000, Number(s.ms) || 1000));
        else if (s.do === 'expect') {
          const end = Date.now() + 10000;
          let found = false;
          while (!found && Date.now() < end) { found = await js(`!!document.body && document.body.innerText.includes(${JSON.stringify(String(s.text || ''))})`).catch(() => false); if (!found) await pause(300); }
          if (!found) throw new Error(`texte absent : « ${s.text} »`);
        } else if (s.do === 'expectUrl') { if (!wc.getURL().includes(String(s.text || ''))) throw new Error(`adresse actuelle : ${wc.getURL()}`); }
      } catch (x) { err = String((x && x.message) || x); }
      out.push({ label, ms: Date.now() - st, ok: !err, error: err });
      if (err) { error = `${label} : ${err}`; break; }
    }
    if (error) {
      try {
        const img = await wc.capturePage();
        const dir = path.join(app.getPath('userData'), 'supervision', 'parcours');
        fs.mkdirSync(dir, { recursive: true });
        shot = path.join(dir, `${part}.png`);
        fs.writeFileSync(shot, img.resize({ width: 640 }).toPNG());
      } catch { shot = ''; }
    }
  } finally {
    if (!w.isDestroyed()) w.destroy();
    session.fromPartition(part).clearStorageData().catch(() => {});
  }
  return { ok: !error, ms: Date.now() - t0, steps: out, error, shot };
}
ipcMain.handle('mon:seal', (_e, v) => seal(v));
ipcMain.handle('mon:journey-run', (_e, e) => runJourney({ ...(e || {}), id: 'essai' }));
// Enregistreur : fenêtre visible ; chaque clic et chaque saisie devient une étape. Fermer la fenêtre termine.
const REC_SCRIPT = `(() => { if (window.__nxRec) return; window.__nxRec = 1;
  const sel = (el) => { if (el.id && /^[A-Za-z][\\w-]*$/.test(el.id)) return '#' + el.id; for (const a of ['data-testid', 'data-test', 'name', 'aria-label']) { const v = el.getAttribute && el.getAttribute(a); if (v) return el.tagName.toLowerCase() + '[' + a + '=' + JSON.stringify(v) + ']'; } const parts = []; let n = el; while (n && n.nodeType === 1 && parts.length < 5 && n !== document.body) { if (n.id && /^[A-Za-z][\\w-]*$/.test(n.id)) { parts.unshift('#' + n.id); break; } let p = n.tagName.toLowerCase(); const sib = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName) : []; if (sib.length > 1) p += ':nth-of-type(' + (sib.indexOf(n) + 1) + ')'; parts.unshift(p); n = n.parentElement; } return parts.join(' > '); };
  const txt = (el) => (el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim().replace(/\\s+/g, ' ').slice(0, 40);
  const emit = (o) => console.log('__NXREC__' + JSON.stringify(o));
  document.addEventListener('click', (e) => { const el = e.target.closest('a,button,input[type=submit],input[type=button],[role=button],summary,label') || e.target; if (el.matches && el.matches('input:not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]),textarea,select')) return; emit({ do: 'click', sel: sel(el), text: txt(el) }); }, true);
  document.addEventListener('change', (e) => { const el = e.target; if (!el.matches || !el.matches('input,textarea,select')) return; if (el.type === 'checkbox' || el.type === 'radio') return; emit({ do: 'fill', sel: sel(el), value: el.value, secret: el.type === 'password' }); }, true);
})()`;
ipcMain.handle('mon:journey-record', (_e, { url } = {}) => new Promise((resolve) => {
  const steps = [];
  let last = String(url || '');
  const w = new BrowserWindow({ width: 1200, height: 820, title: 'Enregistrement du parcours : fais tes clics, puis ferme cette fenêtre', autoHideMenuBar: true, webPreferences: { sandbox: true, partition: 'nexora-parcours-enregistrement' } });
  const wc = w.webContents;
  wc.setWindowOpenHandler(({ url: u }) => { wc.loadURL(u).catch(() => {}); return { action: 'deny' }; });
  wc.on('dom-ready', () => { wc.executeJavaScript(REC_SCRIPT).catch(() => {}); });
  wc.on('did-navigate', (_ev, u) => { last = u; });
  wc.on('console-message', (ev, _level, message) => {
    const msg = String(ev && ev.message != null ? ev.message : message || '');
    if (!msg.startsWith('__NXREC__')) return;
    try {
      const s = JSON.parse(msg.slice(9));
      if (s.secret) s.value = seal(s.value);
      const prev = steps[steps.length - 1];
      if (prev && s.do === 'fill' && prev.do === 'fill' && prev.sel === s.sel) prev.value = s.value; else steps.push(s);
    } catch { /* message illisible */ }
  });
  w.on('closed', () => {
    session.fromPartition('nexora-parcours-enregistrement').clearStorageData().catch(() => {});
    resolve({ steps: steps.slice(0, 40), lastUrl: last });
  });
  w.loadURL(String(url || 'about:blank')).catch(() => {});
}));
// Surveillance des erreurs d'une page (ton site) : charge la page dans une fenêtre cachée, avec une session
// isolée en mémoire, et relève les erreurs JavaScript, les exceptions non rattrapées, les ressources en échec
// (4xx/5xx, réseau) et les plantages. Les vérifications passent une par une (un seul écouteur réseau par session).
let pageErrQueue = Promise.resolve();
function pageErrors(url, { settleMs = 2500, timeoutMs = 25000 } = {}) {
  const job = pageErrQueue.then(() => new Promise((resolve) => {
    const ses = require('electron').session.fromPartition('nexora-errcheck');
    const errors = new Map();
    const failed = new Map();
    let mainFail = null;
    let crashed = false;
    const t0 = Date.now();
    const w = new BrowserWindow({ show: false, width: 1280, height: 860, webPreferences: { offscreen: true, sandbox: true, partition: 'nexora-errcheck' } });
    const wid = w.webContents.id;
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    w.webContents.setAudioMuted(true);
    ses.webRequest.onCompleted((d) => { if (d.webContentsId === wid && d.statusCode >= 400 && !failed.has(d.url)) failed.set(d.url, { url: d.url, status: d.statusCode, type: d.resourceType }); });
    ses.webRequest.onErrorOccurred((d) => { if (d.webContentsId === wid && !/ERR_ABORTED|ERR_BLOCKED_BY_CLIENT/.test(d.error) && !failed.has(d.url)) failed.set(d.url, { url: d.url, status: 0, error: d.error, type: d.resourceType }); });
    w.webContents.on('console-message', (e, level, message, line, sourceId) => {
      const lv = e && e.level != null ? e.level : level; // Electron récent : objet ; ancien : arguments
      const msg = String(e && e.message != null ? e.message : message || '');
      const isErr = lv === 'error' || lv === 3;
      const isWarn = lv === 'warning' || lv === 2;
      if (!isErr && !isWarn) return;
      const key = msg.slice(0, 200);
      const prev = errors.get(key);
      if (prev) prev.count += 1;
      else errors.set(key, { level: isErr ? 'error' : 'warning', message: msg.slice(0, 500), source: (e && e.sourceId) || sourceId || '', line: (e && e.lineNumber) || line || 0, count: 1 });
    });
    w.webContents.on('did-fail-load', (_ev, code, desc, vurl, isMain) => { if (isMain && code !== -3) mainFail = `${desc} (${code})`; });
    w.webContents.on('render-process-gone', (_ev, d) => { crashed = d && d.reason; });
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      ses.webRequest.onCompleted(null);
      ses.webRequest.onErrorOccurred(null);
      if (!w.isDestroyed()) w.destroy();
      ses.clearStorageData().catch(() => {});
      const list = [...errors.values()];
      resolve({
        url, at: Date.now(), loadMs: Date.now() - t0, mainFail, crashed,
        errors: list.filter((x) => x.level === 'error'), warnings: list.filter((x) => x.level === 'warning'),
        failed: [...failed.values()].slice(0, 50),
      });
    };
    const hard = setTimeout(finish, timeoutMs);
    w.webContents.once('did-finish-load', () => setTimeout(() => { clearTimeout(hard); finish(); }, settleMs));
    w.webContents.once('did-fail-load', (_ev, code, _d, _u, isMain) => { if (isMain && code !== -3) setTimeout(() => { clearTimeout(hard); finish(); }, 300); });
    w.loadURL(url).catch(() => {});
  }));
  pageErrQueue = job.catch(() => {});
  return job;
}
ipcMain.handle('sec:page-errors', (_e, { url }) => pageErrors(url));
ipcMain.handle('system:dark', () => nativeTheme.shouldUseDarkColors);
nativeTheme.on('updated', () => send('system:theme', nativeTheme.shouldUseDarkColors));

// ---------------------------------------------------------------- projets
runner.on('log', (entry) => send('runner:log', entry));
runner.on('status', (s) => send('runner:status', s));
runner.on('hot-reload', () => send('runner:hot-reload'));

function closeStatic() { if (staticServer) { staticServer.close(); staticServer = null; } }

async function analyze(dir) {
  try {
    if (!dir || !fs.existsSync(dir)) return null;
    const real = fs.statSync(dir).isDirectory() ? dir : path.dirname(dir);
    const a = analyzeProject(real);
    a.command = commandPreview(a);
    tools.announce(a, 'responsive'); // NEXORA #016 : détection des outils indispensables au projet
    return a;
  } catch { return null; }
}

ipcMain.handle('project:pick', async () => {
  const res = await dialog.showOpenDialog(win, { title: 'Ouvrir un projet', properties: ['openDirectory'] });
  if (res.canceled || !res.filePaths[0]) return null;
  return analyze(res.filePaths[0]);
});
ipcMain.handle('project:analyze', (_e, dir) => analyze(dir));

async function serveStatic(dir) {
  await runner.stop(true);
  closeStatic();
  staticServer = new StaticServer(dir);
  const url = await staticServer.start();
  staticServer.on('change', () => send('static:change'));
  send('runner:log', { stream: 'cmd', text: `> serveur statique : ${dir}\n  ${url}\n` });
  send('runner:status', { status: 'running', url, message: url, mode: 'static' });
  return url;
}

ipcMain.handle('project:start', async (_e, { dir, script, staticDir }) => {
  closeStatic();
  if (staticDir) return serveStatic(staticDir === '.' ? dir : path.join(dir, staticDir));
  const a = analyzeProject(dir);
  if (a.kind === 'static' && !a.unsupported) {
    return serveStatic(a.staticDirs.length && !a.hasIndexHtml ? path.join(dir, a.staticDirs[0]) : dir);
  }
  runner.start({ dir, script });
  return true;
});
ipcMain.handle('project:stop', async () => { closeStatic(); await runner.stop(); return true; });
ipcMain.handle('project:flutter-web', async (_e, dir) => {
  send('runner:status', { status: 'installing', message: 'Ajout de la version web au projet Flutter' });
  const ok = await runner.runOnce('flutter create --platforms web .', dir);
  if (!ok) { send('runner:status', { status: 'error', message: 'L\'ajout de la version web a échoué. Consulte la console du serveur.' }); return false; }
  runner.start({ dir });
  return true;
});
ipcMain.handle('sdk:check', (_e, ids) => checkSdks(ids, { fresh: true }));
ipcMain.handle('sdk:describe', (_e, ids) => ids.map(describe).filter(Boolean));
ipcMain.handle('url:check', (_e, url) => probe(url, 4000));

// NEXORA #016 : outils de développement (détection, installation, retrait) et isolation des projets.
tools.on('progress', (p) => send('tools:progress', p));
tools.on('detected', (d) => send('tools:detected', d));
ipcMain.handle('tools:status', () => tools.status());
ipcMain.handle('tools:detect', async (_e, { dir } = {}) => {
  if (!dir || !fs.existsSync(dir)) return null;
  return tools.detect(analyzeProject(fs.statSync(dir).isDirectory() ? dir : path.dirname(dir)));
});
ipcMain.handle('tools:install', (_e, { ids, userPath } = {}) => tools.installMany(Array.isArray(ids) ? ids : [], { userPath }));
ipcMain.handle('tools:cancel', () => tools.cancel());
ipcMain.handle('tools:remove', (_e, id) => tools.remove(String(id || '')));
ipcMain.handle('tools:open-dir', () => { fs.mkdirSync(tools.home, { recursive: true }); return shell.openPath(tools.home); });
ipcMain.handle('project:isolate', (_e, { part } = {}) => isolation.activate(part));
ipcMain.handle('project:isolation-drop', (_e, { part } = {}) => isolation.drop(part, session));

// ---------------------------------------------------------------- fichiers du projet
const IGNORED = new Set(['node_modules', '.git', '.next', '.nuxt', '.svelte-kit', '.astro', '.dart_tool', '.idea', '.gradle', 'vendor', '__pycache__', '.venv', 'venv', 'env', '.turbo', '.cache', '.expo', 'coverage', 'Pods', 'bin', 'obj', '.vs', '.parcel-cache', 'storage', '.output', 'target']);
const BUILD_DIRS = new Set(['dist', 'build', 'out', '_site', 'public/build']);

ipcMain.handle('fs:tree', (_e, root) => {
  let count = 0;
  const walk = (dir, depth) => {
    if (depth > 9 || count > 4000) return [];
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
    entries.sort((x, y) => (x.isDirectory() === y.isDirectory() ? x.name.localeCompare(y.name) : x.isDirectory() ? -1 : 1));
    const out = [];
    for (const ent of entries) {
      if (ent.name === '.DS_Store' || IGNORED.has(ent.name) || (depth === 0 && BUILD_DIRS.has(ent.name))) continue;
      const full = path.join(dir, ent.name);
      count++;
      if (ent.isDirectory()) out.push({ name: ent.name, path: full, dir: true, children: walk(full, depth + 1) });
      else out.push({ name: ent.name, path: full });
      if (count > 4000) break;
    }
    return out;
  };
  return walk(root, 0);
});

ipcMain.handle('fs:read', (_e, file) => {
  try {
    const st = fs.statSync(file);
    const ext = path.extname(file).toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.avif'].includes(ext) && st.size < 8e6) {
      const mime = ext === '.svg' ? 'image/svg+xml' : `image/${ext.slice(1).replace('jpg', 'jpeg').replace('ico', 'x-icon')}`;
      return { image: `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`, size: st.size };
    }
    if (st.size > 2e6) return { error: 'Fichier trop volumineux pour l\'aperçu (plus de 2 Mo).', size: st.size };
    const buf = fs.readFileSync(file);
    if (buf.includes(0)) return { error: 'Fichier binaire : aperçu impossible.', size: st.size };
    return { text: buf.toString('utf8'), size: st.size };
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle('fs:exists', (_e, files) => files.map((f) => { try { return fs.statSync(f).isFile(); } catch { return false; } }));

ipcMain.handle('editor:open', (_e, { file, line }) => new Promise((resolve) => {
  const target = line ? `"${file}:${line}"` : `"${file}"`;
  const p = spawn(`code -g ${target}`, { shell: true, windowsHide: true });
  let done = false;
  p.on('exit', (code) => {
    if (done) return;
    done = true;
    if (code === 0) resolve('vscode');
    else shell.openPath(file).then(() => resolve('default'));
  });
  p.on('error', () => { if (!done) { done = true; shell.openPath(file).then(() => resolve('default')); } });
}));

// ---------------------------------------------------------------- émulation (protocole DevTools)
const attached = new Set();
const scrollbarsHidden = new Map();
const requests = new Map();
async function cdp(wc, method, params = {}) { return wc.debugger.sendCommand(method, params); }

function ensureDebugger(wc) {
  if (wc.debugger.isAttached()) return true;
  try {
    wc.debugger.attach('1.3');
    attached.add(wc.id);
    wc.debugger.on('message', (_ev, method, params) => onCdpEvent(wc, method, params));
    wc.once('destroyed', () => attached.delete(wc.id));
    return true;
  } catch { return false; }
}

function onCdpEvent(wc, method, params) {
  if (method === 'Page.screencastFrame') {
    send('screencast:frame', { wcId: wc.id, data: params.data, metadata: params.metadata });
    cdp(wc, 'Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => {});
    return;
  }
  if (method === 'Network.requestWillBeSent') {
    requests.set(params.requestId, { url: params.request.url, type: params.type });
    if (requests.size > 3000) requests.delete(requests.keys().next().value);
    return;
  }
  if (method === 'Network.responseReceived') {
    const r = params.response;
    if (r.status >= 400) send('device:net', { wcId: wc.id, url: r.url, status: r.status, statusText: r.statusText, type: params.type });
    return;
  }
  if (method === 'Network.loadingFailed' && !params.canceled) {
    const req = requests.get(params.requestId) || {};
    send('device:net', { wcId: wc.id, url: req.url || '', error: params.errorText, type: params.type || req.type, blocked: params.blockedReason });
  }
}

const NETWORK = {
  none: { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
  '4g': { offline: false, latency: 165, downloadThroughput: 1012500, uploadThroughput: 168750 },
  '3g': { offline: false, latency: 562.5, downloadThroughput: 180000, uploadThroughput: 84375 },
  '3g-slow': { offline: false, latency: 2000, downloadThroughput: 50000, uploadThroughput: 50000 },
  offline: { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 },
};

async function applyEnv(wc, env = {}) {
  const features = [];
  if (env.pageTheme === 'dark' || env.pageTheme === 'light') features.push({ name: 'prefers-color-scheme', value: env.pageTheme });
  if (env.reducedMotion) features.push({ name: 'prefers-reduced-motion', value: 'reduce' });
  try { await cdp(wc, 'Emulation.setEmulatedMedia', { media: '', features }); } catch { /* ignore */ }
  try {
    await cdp(wc, 'Network.enable');
    await cdp(wc, 'Network.emulateNetworkConditions', NETWORK[env.network] || NETWORK.none);
  } catch { /* ignore */ }
  try { await cdp(wc, 'Emulation.setCPUThrottlingRate', { rate: Number(env.cpu) || 1 }); } catch { /* ignore */ }
}

ipcMain.handle('device:emulate', async (_e, { wcId, emu, env }) => {
  const wc = webContents.fromId(wcId);
  if (!wc || wc.isDestroyed() || !ensureDebugger(wc)) return { ok: false };
  const {
    width, height, screenWidth, screenHeight, dpr, mobile, touch, ua, uaMeta, landscape, hinge, scale,
  } = emu;
  try {
    // scale : la page est dessinée à la définition réelle de l'appareil (la webview est agrandie d'autant).
    await cdp(wc, 'Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: dpr,
      scale: scale > 0 ? scale : 1,
      mobile: Boolean(mobile),
      screenWidth: screenWidth || width,
      screenHeight: screenHeight || height,
      screenOrientation: { type: landscape ? 'landscapePrimary' : 'portraitPrimary', angle: landscape ? 90 : 0 },
    });
  } catch (err) { return { ok: false, error: err.message }; }
  try { await cdp(wc, 'Emulation.setTouchEmulationEnabled', { enabled: Boolean(touch), maxTouchPoints: touch ? 5 : 1 }); } catch { /* ignore */ }
  // La conversion souris → toucher de Chrome ne transmet pas les mouvements dans une webview (seul le
  // premier contact arrive) : la souris reste une souris et le script de la page gère le glissement.
  try { await cdp(wc, 'Emulation.setEmitTouchEventsForMouse', { enabled: false }); } catch { /* ignore */ }
  // Sur téléphones et tablettes, les barres de défilement sont superposées et invisibles au repos.
  try { await cdp(wc, 'Emulation.setScrollbarsHidden', { hidden: Boolean(mobile) }); } catch { /* ignore */ }
  scrollbarsHidden.set(wc.id, Boolean(mobile));
  if (ua) {
    try {
      await cdp(wc, 'Emulation.setUserAgentOverride', { userAgent: ua, platform: uaMeta ? uaMeta.navigatorPlatform : undefined, userAgentMetadata: uaMeta ? uaMeta.meta : undefined });
    } catch {
      try { await cdp(wc, 'Emulation.setUserAgentOverride', { userAgent: ua }); } catch { /* ignore */ }
    }
  }
  try {
    if (hinge) await cdp(wc, 'Emulation.setDisplayFeaturesOverride', { features: [{ orientation: hinge.orientation, offset: hinge.offset, maskLength: hinge.mask }] });
    else await cdp(wc, 'Emulation.clearDisplayFeaturesOverride');
  } catch { /* fonction expérimentale */ }
  await applyEnv(wc, env);
  return { ok: true };
});

// Zoom de la page (émulation mobile) : Chrome garde la largeur visible quand l'écran change de taille.
ipcMain.handle('device:set-scale', async (_e, { wcId, scale }) => {
  const wc = webContents.fromId(wcId);
  if (!wc || wc.isDestroyed() || !ensureDebugger(wc)) return false;
  try { await cdp(wc, 'Emulation.setPageScaleFactor', { pageScaleFactor: scale }); return true; } catch { return false; }
});

ipcMain.handle('device:env', async (_e, { wcId, env }) => {
  const wc = webContents.fromId(wcId);
  if (wc && !wc.isDestroyed() && ensureDebugger(wc)) await applyEnv(wc, env);
  return true;
});

ipcMain.handle('device:devtools', (_e, { wcId, title }) => {
  const wc = webContents.fromId(wcId);
  if (wc && !wc.isDestroyed()) wc.openDevTools({ mode: 'detach', title });
});

// ---------------------------------------------------------------- captures photo et vidéo
function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;
}
function safeName(s) {
  // eslint-disable-next-line no-control-regex
  return String(s || 'capture').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 90);
}
function captureDir(kind, project) {
  const base = process.env.VITRINE_CAPTURE_DIR || app.getPath(kind === 'video' ? 'videos' : 'pictures');
  const dir = path.join(base, 'NEXORA', safeName(project || 'Sans projet'));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Photo de la page à la densité de l'appareil. Chrome rend la capture dans un tampon de la taille réelle
// de la webview : au-delà, l'image se répète (constaté en rendu logiciel). On capture donc la zone par
// tuiles qui tiennent dans ce tampon ; l'interface les assemble.
// La page doit avoir produit une image à jour : juste après un changement d'appareil (émulation), Chrome peut
// ne rien redessiner tant que rien ne bouge, et la capture attend alors indéfiniment ou renvoie l'ancienne mise
// en page. On force un redessin complet et on attend deux images avant de capturer.
async function settlePaint(wc) {
  try { wc.invalidate(); } catch { /* ignore */ }
  try {
    await Promise.race([
      wc.executeJavaScript('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))', true),
      new Promise((r) => setTimeout(r, 1200)),
    ]);
  } catch { /* page occupée */ }
}

async function captureClip(wc, clip, beyond) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const shot = cdp(wc, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: beyond, clip, fromSurface: true });
    // La capture attend une nouvelle image de la page : sur une page immobile, on la provoque.
    const nudge = setInterval(() => { try { wc.invalidate(); } catch { /* fermée */ } }, 120);
    const timeout = new Promise((_r, reject) => setTimeout(() => reject(new Error('timeout')), attempt ? 8000 : 5000));
    try {
      // eslint-disable-next-line no-await-in-loop
      const { data } = await Promise.race([shot, timeout]);
      return data;
    } catch (e) {
      if (attempt === 2) throw e;
      // eslint-disable-next-line no-await-in-loop
      await settlePaint(wc);
    } finally { clearInterval(nudge); }
  }
  return null;
}

function splitAxis(length, perCss, budget) {
  let n = Math.max(1, Math.ceil((length * perCss) / budget));
  while (Math.ceil(length / n) * perCss > budget && n < 400) n += 1;
  const step = Math.ceil(length / n);
  const parts = [];
  for (let at = 0; at < length; at += step) parts.push([at, Math.min(step, length - at)]);
  return parts;
}

// Page entière : on parcourt la page pour déclencher les images et contenus chargés au défilement,
// puis on revient en haut avant la capture.
const PREPARE_FULL = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const sc = document.scrollingElement || document.documentElement;
  const vv = window.visualViewport;
  const start = { x: vv ? vv.pageLeft : scrollX, y: vv ? vv.pageTop : scrollY };
  for (const img of document.querySelectorAll('img[loading="lazy"]')) img.loading = 'eager';
  for (const el of document.querySelectorAll('[data-src]:not([src]), img[data-src]')) { if (el.tagName === 'IMG' && !el.getAttribute('src')) el.src = el.dataset.src; }
  const height = () => Math.max(sc.scrollHeight, document.body ? document.body.scrollHeight : 0);
  const step = Math.max(240, innerHeight * 0.85);
  const t0 = Date.now();
  for (let y = 0; y < Math.min(height(), 24000) && Date.now() - t0 < 9000; y += step) { scrollTo(0, y); await wait(90); }
  scrollTo(0, height()); await wait(250);
  scrollTo(0, 0); await wait(120);
  const pending = [...document.images].filter((i) => !i.complete);
  await Promise.race([Promise.all(pending.map((i) => new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); }))), wait(3500)]);
  try { await document.fonts.ready; } catch (e) { /* polices */ }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return { ...start, cw: document.documentElement.clientWidth };
})()`;

ipcMain.handle('capture:shot', async (_e, {
  wcId, fullPage, dpr = 1, budget, maxSide = 30000, mobile,
}) => {
  const wc = webContents.fromId(wcId);
  if (!wc || wc.isDestroyed() || !ensureDebugger(wc)) return null;
  let start = null;
  if (fullPage) {
    try { start = await Promise.race([wc.executeJavaScript(PREPARE_FULL, true), new Promise((r) => setTimeout(() => r(null), 16000))]); } catch { start = null; }
  }
  const hid = scrollbarsHidden.get(wc.id);
  if (!hid) { try { await cdp(wc, 'Emulation.setScrollbarsHidden', { hidden: true }); } catch { /* ignore */ } }
  await settlePaint(wc);
  try {
    const m = await cdp(wc, 'Page.getLayoutMetrics');
    const vv = m.cssVisualViewport || m.visualViewport;
    if (process.env.NEXORA_DEBUG_CAPTURE) process.stdout.write(`[capture] vv=${JSON.stringify(vv)} layout=${JSON.stringify(m.cssLayoutViewport)}\n`);
    const content = m.cssContentSize || m.contentSize;
    let region;
    let scale = 1;
    if (fullPage) {
      // Largeur de la page telle qu'affichée (un élément qui déborde n'élargit pas l'image).
      const cw = Math.max(1, Math.min(Math.ceil(content.width), start && start.cw > 0 ? Math.ceil(start.cw) : Infinity));
      const ch = Math.max(1, Math.min(Math.ceil(content.height), 24000));
      region = {
        x: 0, y: 0, w: cw, h: ch,
      };
      // Pleine définition de l'appareil, dans la limite de ce qu'un PNG et un canvas peuvent contenir.
      scale = Math.min(1, maxSide / (ch * dpr), maxSide / (cw * dpr), Math.sqrt(160e6 / (cw * ch * dpr * dpr)));
    } else {
      region = {
        x: vv.pageX, y: vv.pageY, w: Math.round(vv.clientWidth), h: Math.round(vv.clientHeight),
      };
    }
    const perCss = dpr * scale;
    const tiles = [];
    // Zone visible : une seule capture, exactement la surface affichée (le découpage en morceaux, inutile ici,
    // produisait des morceaux hors surface répétés, décalés ou qui bloquaient la capture).
    if (!fullPage) {
      const data = await captureClip(wc, {
        x: region.x, y: region.y, width: region.w, height: region.h, scale: 1,
      }, false);
      return {
        width: Math.round(region.w * perCss), height: Math.round(region.h * perCss), tiles: [{ dx: 0, dy: 0, data }], cssWidth: region.w, cssHeight: region.h, scale: perCss,
      };
    }
    // Page entière : morceaux qui tiennent dans la surface réelle de la page (arrondis tolérés).
    const bw = Math.max(64, Math.ceil((budget && budget.w) || 800) + 1);
    const bh = Math.max(64, Math.ceil((budget && budget.h) || 800) + 1);
    for (const [cy, th] of splitAxis(region.h, perCss, bh)) {
      for (const [cx, tw] of splitAxis(region.w, perCss, bw)) {
        // eslint-disable-next-line no-await-in-loop
        const data = await captureClip(wc, {
          x: region.x + cx, y: region.y + cy, width: tw, height: th, scale,
        }, Boolean(fullPage));
        tiles.push({ dx: Math.round(cx * perCss), dy: Math.round(cy * perCss), data });
      }
    }
    return {
      width: Math.round(region.w * perCss), height: Math.round(region.h * perCss), tiles, cssWidth: region.w, cssHeight: region.h, scale: perCss,
    };
  } catch (err) {
    return { error: err.message };
  } finally {
    if (!hid) { try { await cdp(wc, 'Emulation.setScrollbarsHidden', { hidden: false }); } catch { /* ignore */ } }
    if (start) { try { await wc.executeJavaScript(`scrollTo(${Number(start.x) || 0}, ${Number(start.y) || 0})`); } catch { /* ignore */ } }
  }
});

const FILTER_NAMES = {
  png: 'Image PNG', jpg: 'Image JPEG', webp: 'Image WebP', pdf: 'Document PDF', mp4: 'Vidéo MP4', webm: 'Vidéo WebM', glb: 'Modèle 3D', json: 'Projet', svg: 'Image SVG', nexd: 'Document NEX-DESIGN',
};
ipcMain.handle('capture:save', async (_e, {
  kind, project, name, ext, data, saveAs,
}) => {
  const dir = captureDir(kind, project);
  let file = path.join(dir, `${safeName(name)} ${stamp()}.${ext}`);
  if (saveAs) {
    const res = await dialog.showSaveDialog(win, {
      title: kind === 'video' ? 'Enregistrer la vidéo' : "Enregistrer l'image", defaultPath: file, filters: [{ name: FILTER_NAMES[ext] || ext.toUpperCase(), extensions: [ext] }],
    });
    if (res.canceled || !res.filePath) return null;
    file = res.filePath;
  }
  const buf = typeof data === 'string' ? Buffer.from(data, 'base64') : Buffer.from(data.buffer ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : data);
  fs.writeFileSync(file, buf);
  return file;
});

ipcMain.handle('dialog:open-file', async (_e, {
  title, filters, asDataUrl, asBytes, asText, maxBytes = 300e6,
} = {}) => {
  const res = await dialog.showOpenDialog(win, { title, filters, properties: ['openFile'] });
  if (res.canceled || !res.filePaths[0]) return null;
  const file = res.filePaths[0];
  const st = fs.statSync(file);
  const out = { path: file, name: path.basename(file), size: st.size };
  if (st.size > maxBytes) return { ...out, error: 'too-big' };
  if (asDataUrl || asBytes) {
    const buf = fs.readFileSync(file);
    if (asDataUrl) out.dataUrl = `data:${mimeFor(file)};base64,${buf.toString('base64')}`;
    if (asBytes) out.data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }
  if (asText) out.text = st.size < 5e6 ? fs.readFileSync(file, 'utf8') : '';
  return out;
});

// Médias du Studio : choix de fichiers (vidéo ou suite d'images) et adresses de lecture.
ipcMain.handle('media:pick', async (_e, { kind = 'video' } = {}) => {
  const video = kind === 'video';
  const res = await dialog.showOpenDialog(win, {
    title: video ? 'Importer une vidéo' : 'Importer une séquence d’images (toutes les images, dans l’ordre)',
    filters: video ? [{ name: 'Vidéos', extensions: ['mp4', 'webm', 'mov', 'm4v', 'mkv', 'ogv'] }] : [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'bmp', 'gif'] }],
    properties: video ? ['openFile'] : ['openFile', 'multiSelections'],
  });
  if (res.canceled || !res.filePaths.length) return null;
  const files = res.filePaths.slice().sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return files.map((f) => ({ path: f, name: path.basename(f), url: `app://vitrine/user-media/${mediaToken(f)}/${encodeURIComponent(path.basename(f))}` }));
});
ipcMain.handle('media:url', (_e, file) => {
  if (!file || !fs.existsSync(file)) return null;
  return `app://vitrine/user-media/${mediaToken(file)}/${encodeURIComponent(path.basename(file))}`;
});

ipcMain.handle('screencast:start', async (_e, {
  wcId, maxWidth, maxHeight, quality = 90,
}) => {
  const wc = webContents.fromId(wcId);
  if (!wc || wc.isDestroyed() || !ensureDebugger(wc)) return false;
  // Pendant l'enregistrement, la page continue de se dessiner même si la fenêtre passe derrière une autre.
  try { wc.setBackgroundThrottling(false); } catch { /* ignore */ }
  await cdp(wc, 'Page.startScreencast', {
    format: 'jpeg', quality: Math.max(40, Math.min(100, Math.round(quality))), maxWidth, maxHeight, everyNthFrame: 1,
  });
  return true;
});
ipcMain.handle('screencast:stop', async (_e, { wcId }) => {
  const wc = webContents.fromId(wcId);
  if (wc && !wc.isDestroyed() && wc.debugger.isAttached()) { try { await cdp(wc, 'Page.stopScreencast'); } catch { /* ignore */ } }
  if (wc && !wc.isDestroyed()) { try { wc.setBackgroundThrottling(true); } catch { /* ignore */ } }
  return true;
});

ipcMain.handle('shell:open', (_e, target) => shell.openPath(target));
ipcMain.handle('shell:reveal', (_e, target) => shell.showItemInFolder(target));
ipcMain.handle('shell:external', (_e, url) => { if (/^https?:/i.test(url)) shell.openExternal(url); });
ipcMain.handle('clipboard:read', () => clipboard.readText());
ipcMain.handle('clipboard:write', (_e, text) => { clipboard.writeText(String(text)); return true; });

ipcMain.handle('settings:load', () => loadSettings());
ipcMain.handle('settings:save', (_e, data) => { saveSettings(data); return true; });
ipcMain.handle('app:info', () => ({
  version: app.getVersion(), platform: process.platform, autotest: process.env.VITRINE_AUTOTEST || null,
}));

// Tests automatiques (développement uniquement).
ipcMain.handle('autotest:resize', (_e, { w, h }) => { if (win && process.env.VITRINE_AUTOTEST) { win.setContentSize(w, h); } return true; });
ipcMain.handle('autotest:snap', async (_e, file) => {
  const img = await win.webContents.capturePage();
  fs.writeFileSync(file, img.toPNG());
  return file;
});
ipcMain.handle('autotest:log', (_e, line) => { process.stdout.write(`[autotest] ${line}\n`); });
ipcMain.handle('autotest:quit', () => { app.quit(); });

// ---------------------------------------------------------------- cycle de vie
// Windows garde en cache l'icône d'un exécutable : à la première ouverture d'une nouvelle version (y compris la
// version portable), le cache d'icônes est rafraîchi pour que le logo NEXORA remplace partout l'ancien.
function refreshIconCacheOnce() {
  if (process.platform !== 'win32') return;
  try {
    const mark = path.join(app.getPath('userData'), `icon-cache-${app.getVersion()}-2`);
    if (fs.existsSync(mark)) return;
    const exe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'ie4uinit.exe');
    if (fs.existsSync(exe)) require('child_process').spawn(exe, ['-show'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    fs.writeFileSync(mark, new Date().toISOString());
  } catch { /* sans conséquence */ }
}

app.whenReady().then(() => {
  refreshIconCacheOnce();
  registerAppProtocol();
  // NEXORA #076 : contrôle de licence signé, intégrité des fichiers, sessions et journaux.
  license.register({ ipcMain, app, shell, net, send });
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  // NEXORA #076 : projets en fichiers .novx (export, import, ouverture par double-clic, Google Drive).
  require('./src/novx').register({ ipcMain, app, dialog, send, getWin: () => win });
  require('./src/android/ipc').register({
    ipcMain, app, dialog, shell, safeStorage, net, send, getWin: () => win,
  });
  require('./src/lab/ipc').register({
    ipcMain, app, dialog, shell, send, getWin: () => win,
  });
  require('./src/skins').register({
    ipcMain, app, dialog, BrowserWindow, send, getWin: () => win,
  });
  require('./src/ai').register({
    ipcMain, app, safeStorage, net, send,
  });
  require('./src/tts').register({ ipcMain });
  require('./src/maint').register({
    ipcMain, app, shell, net, send,
  });
  const plan = require('./src/plan');
  const mon = require('./src/monitor').register({
    ipcMain, app, net, send, pageErrors, journey: runJourney, planCheck: (f, n) => plan.check(f, n),
  });
  // NEXORA #048 : centre de sécurité (historique, audits programmés, domaine, pages, code, applications, CSP).
  securite = require('./src/securite').register({
    ipcMain, app, net, send, dialog, shell, getWin: () => win, BrowserWindow, runScan, withPage,
    notify: (n) => mon.notify(n), planCheck: (f, n) => plan.check(f, n),
  });
  require('./src/loadtest').register({
    ipcMain, app, net, send, dialog, shell, getWin: () => win,
  });
  // NEXORA #015 : santé de NEXORA (processus, erreurs, plantages, services en ligne), gardée sur ce PC.
  require('./src/telemetry').register({
    ipcMain, app, net, getWin: () => win, webContents,
  });
  // NEXORA #048 : un envoi Git réussi ou la construction d'un logiciel pose un repère de déploiement sur les
  // graphiques de la supervision et relance les audits programmés « après chaque déploiement ».
  const DEPLOY = { 'git:push': 'Envoi Git', 'git:publish': 'Publication sur GitHub', 'desktop:build': 'Construction du logiciel' };
  const baseHandle = ipcMain.handle;
  ipcMain.handle = (ch, fn) => baseHandle.call(ipcMain, ch, DEPLOY[ch] ? async (e, ...a) => {
    const r = await fn(e, ...a);
    if (!(r && r.ok === false)) {
      try {
        const arg = a[0] || {};
        const where = arg.dir || arg.source || arg.projectDir || '';
        mon.addMark({ label: `${DEPLOY[ch]}${where ? ` : ${path.basename(String(where))}` : ''}`, source: ch.split(':')[0] });
        securite.onDeploy();
      } catch { /* repère facultatif */ }
    }
    return r;
  } : fn);
  require('./src/dev/ipc').register({
    ipcMain, app, dialog, shell, send, getWin: () => win, safeStorage, net, session,
  });
  // NEXORA #023 : Desktop Builder (logiciels de bureau installables à partir d'un site, d'un dossier ou d'un projet Electron).
  require('./src/desktop/ipc').register({
    ipcMain, app, dialog, shell, safeStorage, net, send, getWin: () => win,
  });
  // NEXORA #052 : outils du Dev Lab (Problèmes, scripts, variables protégées, Git avancé, débogueur, API, tests,
  // dépendances, mise en ligne, contrôles, bases de données, assistant IA du projet).
  require('./src/devplus/ipc').register({
    ipcMain, app, safeStorage, send, BrowserWindow, partition: () => isolation.partition(),
  });
  // NEXORA #053 : NEX-DESIGN (polices libres, import de fichiers Figma).
  require('./src/designplus/ipc').register({ ipcMain, app, safeStorage });
  ipcMain.handle = baseHandle;
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('before-quit', () => { runner.stopSync(); closeStatic(); });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { runner.stopSync(); closeStatic(); app.quit(); });
app.on('window-all-closed', () => { runner.stopSync(); closeStatic(); app.quit(); });
