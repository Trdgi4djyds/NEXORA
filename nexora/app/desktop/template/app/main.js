'use strict';
/*
 * Processus principal de cette application de bureau, générée par NEXORA (Desktop Builder).
 * Les réglages sont dans config.json, réécrit par NEXORA à chaque construction.
 *
 * Bonnes pratiques appliquées (guide de sécurité d'Electron et retours d'expérience des applications publiées) :
 *  - pages en bac à sable, isolation du contexte, aucune API Node.js ni script de préchargement exposé au site ;
 *  - navigation et nouvelles fenêtres limitées aux domaines de l'application ; les autres liens s'ouvrent dans le
 *    navigateur par défaut (http, https, mailto, tel seulement) ; balises <webview> refusées ;
 *  - autorisations (caméra, micro, notifications…) accordées selon les réglages, jamais aux sites tiers ;
 *  - fichiers locaux servis par un protocole privé (app://) plutôt que file:// ;
 *  - instance unique, état de la fenêtre mémorisé (écran débranché compris), page hors connexion avec reconnexion
 *    automatique, reprise après un plantage de la page ou de la carte graphique ;
 *  - journal local (logs/main.log) pour l'assistance.
 */
const {
  app, BrowserWindow, Menu, Tray, Notification, dialog, shell, session, nativeTheme, protocol, net, screen, desktopCapturer, globalShortcut, nativeImage,
} = require('electron');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

// ---------------------------------------------------------------- réglages
const DEFAULTS = {
  name: 'Application', appId: 'com.nexora.app', version: '1.0.0', publisher: '', homepage: '', lang: 'auto', kind: 'url',
  startUrl: 'https://example.com/', internal: [], httpsOnly: true,
  window: {
    width: 1280, height: 800, minWidth: 640, minHeight: 480, start: 'normal', remember: true, resizable: true, menu: 'auto', theme: 'system', background: '#ffffff', title: 'page',
  },
  behavior: {
    singleInstance: true, external: 'browser', offline: true, tray: false, closeToTray: false, autostartOption: true, downloads: 'ask', spellcheck: ['fr', 'en-US'], contextMenu: true, userAgent: 'chrome', customUserAgent: '', zoom: true, protocol: '',
    badge: false, jumpList: [], shortcut: '', fileTypes: [],
  },
  permissions: {
    notifications: 'allow', camera: 'ask', microphone: 'ask', display: 'ask', geolocation: 'ask', clipboard: 'ask', localNetwork: 'deny', midi: 'deny',
  },
  security: { devtools: false },
  updates: { mode: 'none', checkOnStart: true, channel: 'latest' },
  insights: null,
};
function loadConfig() {
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')); } catch { raw = {}; }
  return {
    ...DEFAULTS,
    ...raw,
    window: { ...DEFAULTS.window, ...(raw.window || {}) },
    behavior: { ...DEFAULTS.behavior, ...(raw.behavior || {}) },
    permissions: { ...DEFAULTS.permissions, ...(raw.permissions || {}) },
    security: { ...DEFAULTS.security, ...(raw.security || {}) },
    updates: { ...DEFAULTS.updates, ...(raw.updates || {}) },
  };
}
const CFG = loadConfig();
const IS_WIN = process.platform === 'win32';
// Dossier des données propre à l'application (nom du paquet, tiré de son identifiant) : deux logiciels au même nom
// affiché ne partagent jamais leurs cookies ni leurs réglages, et un changement de nom ne perd rien. C'est aussi le
// dossier effacé par la désinstallation quand l'option est choisie.
if (CFG.dataFolder) { try { app.setPath('userData', path.join(app.getPath('appData'), CFG.dataFolder)); } catch { /* dossier par défaut */ } }
const IS_MAC = process.platform === 'darwin';
const PORTABLE = Boolean(process.env.PORTABLE_EXECUTABLE_DIR);

// ---------------------------------------------------------------- textes (français ou anglais)
const TEXTS = {
  fr: {
    file: 'Fichier', edit: 'Édition', view: 'Affichage', go: 'Navigation', help: 'Aide', window: 'Fenêtre',
    print: 'Imprimer…', closeWin: 'Fermer la fenêtre', quit: 'Quitter', undo: 'Annuler', redo: 'Rétablir', cut: 'Couper', copy: 'Copier', paste: 'Coller',
    pastePlain: 'Coller sans la mise en forme', selectAll: 'Tout sélectionner', reload: 'Recharger', hardReload: 'Recharger sans le cache',
    zoomIn: 'Zoom avant', zoomOut: 'Zoom arrière', zoomReset: 'Taille réelle', fullscreen: 'Plein écran', onTop: 'Toujours au premier plan',
    devtools: 'Outils de développement', back: 'Page précédente', forward: 'Page suivante', home: 'Page d’accueil',
    about: (n) => `À propos de ${n}`, website: 'Site web', autostart: 'Lancer au démarrage de l’ordinateur', gpu: 'Mode de compatibilité graphique',
    logs: 'Ouvrir le dossier des journaux', updates: 'Rechercher des mises à jour…', open: (n) => `Ouvrir ${n}`, minimize: 'Réduire',
    openLink: 'Ouvrir le lien dans le navigateur', copyLink: 'Copier l’adresse du lien', saveImage: 'Enregistrer l’image sous…', copyImage: 'Copier l’image',
    addWord: 'Ajouter au dictionnaire', inspect: 'Inspecter', allow: 'Autoriser', deny: 'Refuser', cancel: 'Annuler', ok: 'OK', remember: 'Retenir mon choix',
    perm: (n, what) => `${n} veut utiliser ${what}.`,
    what: {
      camera: 'ta caméra', microphone: 'ton micro', 'camera+microphone': 'ta caméra et ton micro', geolocation: 'ta position', clipboard: 'le contenu de ton presse-papiers',
      localNetwork: 'les appareils de ton réseau local', midi: 'tes appareils MIDI', display: 'le partage de ton écran',
    },
    shareTitle: 'Que veux-tu partager ?', screen: (i, w, h) => `Écran ${i} (${w} × ${h})`, appWindow: (t) => `Fenêtre : ${t}`,
    external: 'Ouvrir ce lien dans une autre application ?', unresponsive: (n) => `${n} ne répond plus.`, unresponsiveDetail: 'Tu peux attendre ou recharger la page.',
    wait: 'Attendre', reloadNow: 'Recharger', gpuAsk: 'Un problème d’affichage s’est répété. Redémarrer en mode de compatibilité graphique (sans accélération) ?',
    restart: 'Redémarrer', later: 'Plus tard', restartNeeded: 'Le changement s’appliquera au prochain démarrage.', restartNow: 'Redémarrer maintenant',
    downloaded: (f) => `Téléchargement terminé : ${f}`, downloadFailed: (f) => `Le téléchargement a échoué : ${f}`,
    trayKeep: (n) => `${n} reste ouvert dans la zone de notification. Clique sur son icône pour le retrouver.`,
    updateReady: (v) => `La version ${v} est prête. Redémarrer pour l’installer ?`, updateMandatory: (v) => `La version ${v} corrige un problème important : le logiciel va redémarrer pour l’installer.`, badge: (n) => `${n} non lu${n > 1 ? 's' : ''}`, updateNone: 'Tu as déjà la dernière version.', updateError: 'Impossible de vérifier les mises à jour pour le moment.',
    builtWith: 'Créé avec NEXORA',
  },
  en: {
    file: 'File', edit: 'Edit', view: 'View', go: 'Go', help: 'Help', window: 'Window',
    print: 'Print…', closeWin: 'Close window', quit: 'Quit', undo: 'Undo', redo: 'Redo', cut: 'Cut', copy: 'Copy', paste: 'Paste',
    pastePlain: 'Paste and match style', selectAll: 'Select all', reload: 'Reload', hardReload: 'Reload without cache',
    zoomIn: 'Zoom in', zoomOut: 'Zoom out', zoomReset: 'Actual size', fullscreen: 'Full screen', onTop: 'Always on top',
    devtools: 'Developer tools', back: 'Back', forward: 'Forward', home: 'Home page',
    about: (n) => `About ${n}`, website: 'Website', autostart: 'Start when the computer starts', gpu: 'Graphics compatibility mode',
    logs: 'Open the logs folder', updates: 'Check for updates…', open: (n) => `Open ${n}`, minimize: 'Minimize',
    openLink: 'Open link in browser', copyLink: 'Copy link address', saveImage: 'Save image as…', copyImage: 'Copy image',
    addWord: 'Add to dictionary', inspect: 'Inspect', allow: 'Allow', deny: 'Deny', cancel: 'Cancel', ok: 'OK', remember: 'Remember my choice',
    perm: (n, what) => `${n} wants to use ${what}.`,
    what: {
      camera: 'your camera', microphone: 'your microphone', 'camera+microphone': 'your camera and microphone', geolocation: 'your location', clipboard: 'your clipboard',
      localNetwork: 'devices on your local network', midi: 'your MIDI devices', display: 'screen sharing',
    },
    shareTitle: 'What do you want to share?', screen: (i, w, h) => `Screen ${i} (${w} × ${h})`, appWindow: (t) => `Window: ${t}`,
    external: 'Open this link in another application?', unresponsive: (n) => `${n} is not responding.`, unresponsiveDetail: 'You can wait or reload the page.',
    wait: 'Wait', reloadNow: 'Reload', gpuAsk: 'A display problem happened again. Restart in graphics compatibility mode (no acceleration)?',
    restart: 'Restart', later: 'Later', restartNeeded: 'The change will apply next time the app starts.', restartNow: 'Restart now',
    downloaded: (f) => `Download complete: ${f}`, downloadFailed: (f) => `Download failed: ${f}`,
    trayKeep: (n) => `${n} keeps running in the notification area. Click its icon to bring it back.`,
    updateReady: (v) => `Version ${v} is ready. Restart to install it?`, updateMandatory: (v) => `Version ${v} fixes an important problem: the app will restart to install it.`, badge: (n) => `${n} unread`, updateNone: 'You already have the latest version.', updateError: 'Updates cannot be checked right now.',
    builtWith: 'Made with NEXORA',
  },
};
let T = TEXTS.fr;
function pickLanguage() {
  const want = CFG.lang === 'auto' ? String(app.getLocale() || 'fr').slice(0, 2).toLowerCase() : CFG.lang;
  T = TEXTS[want] || (want === 'fr' ? TEXTS.fr : TEXTS.en);
  return TEXTS[want] ? want : 'en';
}
let LANG = 'fr';

// ---------------------------------------------------------------- journal local
let logFile = null;
function log(...parts) {
  try {
    if (!logFile) {
      const dir = path.join(app.getPath('userData'), 'logs');
      fs.mkdirSync(dir, { recursive: true });
      logFile = path.join(dir, 'main.log');
      try { if (fs.statSync(logFile).size > 1024 * 1024) fs.renameSync(logFile, path.join(dir, 'main.old.log')); } catch { /* premier journal */ }
    }
    const line = parts.map((p) => (p instanceof Error ? (p.stack || p.message) : typeof p === 'string' ? p : JSON.stringify(p))).join(' ');
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${line}\n`);
  } catch { /* journal impossible : sans conséquence */ }
}
process.on('uncaughtException', (err) => log('Erreur non interceptée :', err));
process.on('unhandledRejection', (err) => log('Promesse rejetée :', err));

// ---------------------------------------------------------------- mémoire locale (fenêtre, zoom, choix)
const store = {
  data: null,
  file() { return path.join(app.getPath('userData'), 'app-state.json'); },
  load() {
    if (this.data) return this.data;
    try { this.data = JSON.parse(fs.readFileSync(this.file(), 'utf8')) || {}; } catch { this.data = {}; }
    return this.data;
  },
  get(key, def) { const d = this.load(); return d[key] === undefined ? def : d[key]; },
  set(key, value) { this.load()[key] = value; this.save(); },
  timer: null,
  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 400);
  },
  flush() {
    clearTimeout(this.timer);
    if (!this.data) return;
    // Écriture atomique : un arrêt brutal ne laisse jamais un fichier à moitié écrit.
    try {
      const tmp = `${this.file()}.tmp`;
      fs.mkdirSync(path.dirname(tmp), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file());
    } catch (err) { log('Mémoire locale non enregistrée :', err); }
  },
};

// ---------------------------------------------------------------- statistiques et plantages (NEXORA #058)
// Envoyés au compte NEXORA du propriétaire (fonction app_track, clé du logiciel) : identifiant d'installation tiré
// au hasard, version, Windows, langue et, pour un plantage, sa cause. Rien n'est envoyé hors version installée.
const INS = CFG.insights && /^https:\/\//.test(CFG.insights.url || '') && CFG.insights.key ? CFG.insights : null;
const insQueue = [];
let insTimer = null;
function installId() {
  let id = store.get('installId', '');
  if (!id) { id = require('node:crypto').randomUUID(); store.set('installId', id); }
  return id;
}
function versionCode(v) { const n = String(v || '').split(/[.-]/).map(Number); return (n[0] || 0) * 1000000 + (n[1] || 0) * 1000 + (n[2] || 0); }
function track(kind, signature = '', detail = null) {
  if (!INS || !app.isPackaged) return;
  insQueue.push({
    kind, at: Date.now(), install: installId(), version: app.getVersion(), version_code: String(versionCode(app.getVersion())), os: `Windows ${os.release()}`, model: `PC ${os.arch()}`, locale: app.isReady() ? app.getLocale() : '', signature: String(signature).slice(0, 300), detail,
  });
  clearTimeout(insTimer);
  insTimer = setTimeout(flushInsights, kind === 'launch' ? 8000 : 500);
}
async function flushInsights() {
  const batch = insQueue.splice(0, 50);
  if (!batch.length || !app.isReady()) return;
  try {
    await net.fetch(`${INS.url}/rest/v1/rpc/app_track`, {
      method: 'POST', headers: { apikey: INS.anon, Authorization: `Bearer ${INS.anon}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_key: INS.key, p_events: batch }),
    });
  } catch (err) { log('Statistiques non envoyées :', err.message); }
}
process.on('uncaughtException', (err) => track('crash', `main:${String((err && err.message) || err).split('\n')[0]}`, { message: String((err && err.message) || err).slice(0, 500), stack: String((err && err.stack) || '').slice(0, 6000) }));

// ---------------------------------------------------------------- adresses
const START = new URL(CFG.startUrl);
const LOCAL_ORIGIN = 'app://local';
const PAGES_ORIGIN = 'app://pages';
function parse(url) { try { return new URL(url); } catch { return null; } }
function hostMatches(host, pattern) {
  const h = String(host || '').toLowerCase();
  const p = String(pattern || '').toLowerCase().trim();
  if (!h || !p) return false;
  if (p.startsWith('*.')) { const base = p.slice(2); return h === base || h.endsWith(`.${base}`); }
  return h === p;
}
/** Adresse de l'application : ses pages locales, son site et les domaines ajoutés dans NEXORA. */
function isInternal(url) {
  const u = typeof url === 'string' ? parse(url) : url;
  if (!u) return false;
  if (u.protocol === 'app:') return u.host === 'local' || u.host === 'pages';
  if (u.protocol === 'https:' || (u.protocol === 'http:' && !CFG.httpsOnly)) {
    if (u.origin === START.origin) return true;
    return CFG.internal.some((p) => hostMatches(u.hostname, p));
  }
  return false;
}
const SAFE_EXTERNAL = new Set(['https:', 'http:', 'mailto:', 'tel:', 'sms:']);
/** Ouvre un lien dans le navigateur ou l'application par défaut, seulement pour des protocoles sûrs. */
function openExternal(url) {
  const u = parse(url);
  if (!u || !SAFE_EXTERNAL.has(u.protocol)) { log('Lien externe refusé :', String(url).slice(0, 200)); return false; }
  shell.openExternal(u.href).catch((err) => log('Ouverture externe impossible :', err));
  return true;
}
function pageUrl(kind, extra = {}) {
  const q = new URLSearchParams({
    k: kind, lang: LANG, n: CFG.name, c: CFG.window.accent || '#2563eb', bg: CFG.window.background || '#ffffff', ...extra,
  });
  return `${PAGES_ORIGIN}/status.html?${q.toString()}`;
}

// ---------------------------------------------------------------- avant le démarrage
protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: {
    standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true,
  },
}]);
app.enableSandbox();
if (IS_WIN) app.setAppUserModelId(CFG.appId);
// Mode de compatibilité graphique : choisi dans le menu Aide, ou proposé après des plantages répétés de la carte graphique.
if (store.get('gpuOff', false)) app.disableHardwareAcceleration();
// Navigateur standard : sans « Electron » ni le nom de l'application dans l'agent utilisateur, les sites qui
// refusent les navigateurs intégrés (connexions Google, messageries) fonctionnent comme dans Chrome.
if (CFG.behavior.userAgent === 'custom' && CFG.behavior.customUserAgent) app.userAgentFallback = CFG.behavior.customUserAgent;
else if (CFG.behavior.userAgent === 'chrome') {
  const appToken = String(app.getName() || '').replace(/[^\w.-]/g, '');
  let ua = app.userAgentFallback.replace(/\sElectron\/\S+/i, '');
  if (appToken) ua = ua.replace(new RegExp(`\\s${appToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\/\\S+`, 'i'), '');
  app.userAgentFallback = ua;
}
nativeTheme.themeSource = ['light', 'dark'].includes(CFG.window.theme) ? CFG.window.theme : 'system';

const gotLock = !CFG.behavior.singleInstance || app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let win = null;
let tray = null;
let quitting = false;
let pendingDeepLink = null;

// ---------------------------------------------------------------- liens d'ouverture (monapp://…)
function deepLinkTarget(arg) {
  const scheme = String(CFG.behavior.protocol || '').toLowerCase();
  if (!scheme || typeof arg !== 'string' || !arg.toLowerCase().startsWith(`${scheme}:`)) return null;
  const u = parse(arg);
  if (!u) return null;
  // Seuls le chemin, les paramètres et l'ancre sont repris : le domaine reste toujours celui de l'application.
  const rest = `${u.host ? `/${u.host}` : ''}${u.pathname === '/' && u.host ? '' : u.pathname}`.replace(/\/{2,}/g, '/');
  const target = new URL(rest || '/', CFG.kind === 'local' ? `${LOCAL_ORIGIN}/` : START.href);
  target.search = u.search;
  target.hash = u.hash;
  return isInternal(target) ? target.href : null;
}
function findDeepLink(argv) {
  for (const a of argv || []) {
    const t = deepLinkTarget(a) || taskTarget(a);
    if (t) return t;
  }
  return null;
}
// NEXORA #058 : actions de la liste de raccourcis (clic droit sur l'icône de la barre des tâches) : --nx-open=/chemin.
function taskTarget(arg) {
  if (typeof arg !== 'string' || !arg.startsWith('--nx-open=')) return null;
  const p = arg.slice(10);
  if (!/^\/[^\s]*$/.test(p) || !(CFG.behavior.jumpList || []).some((j) => j.path === p)) return null;
  const target = new URL(p, CFG.kind === 'local' ? `${LOCAL_ORIGIN}/` : START.href);
  return isInternal(target) ? target.href : null;
}
// Fichier ouvert avec le logiciel (double-clic, « Ouvrir avec ») : transmis à la page par l'événement
// « nexora-open-file » (nom, type, taille et contenu en data: URL ; jamais le chemin du PC).
function findFileArg(argv) {
  const exts = (CFG.behavior.fileTypes || []).map((f) => `.${f.ext}`);
  if (!exts.length) return null;
  for (const a of (argv || []).slice(1)) {
    if (typeof a !== 'string' || a.startsWith('-') || !exts.includes(path.extname(a).toLowerCase())) continue;
    try { if (fs.statSync(a).isFile()) return a; } catch { /* argument qui n'est pas un fichier */ }
  }
  return null;
}
function deliverFile(file) {
  if (!file || !win || win.isDestroyed()) return;
  let size = 0;
  try { size = fs.statSync(file).size; } catch { return; }
  if (size > 25 * 1048576) { box(win, { type: 'warning', message: `${path.basename(file)} : fichier trop gros (25 Mo au plus).`, buttons: [T.ok] }); return; }
  const send = () => {
    const detail = { name: path.basename(file), size, type: 'application/octet-stream', dataUrl: `data:application/octet-stream;base64,${fs.readFileSync(file).toString('base64')}` };
    win.webContents.executeJavaScript(`window.dispatchEvent(new CustomEvent('nexora-open-file', { detail: ${JSON.stringify(detail)} }))`).catch((err) => log('Fichier non transmis :', err.message));
  };
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send); else send();
}
// Pastille de la barre des tâches : nombre au début du titre de la page, « (3) Messages ».
let badgeShown = -1;
function setBadge(n) {
  if (!IS_WIN || !CFG.behavior.badge || !win || win.isDestroyed() || n === badgeShown) return;
  badgeShown = n;
  if (n <= 0) { win.setOverlayIcon(null, ''); return; }
  const img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'badges', n > 9 ? '9plus.png' : `${n}.png`));
  win.setOverlayIcon(img.isEmpty() ? null : img, T.badge(n));
}

// ---------------------------------------------------------------- fenêtre principale
function visibleOnSomeScreen(b) {
  return screen.getAllDisplays().some(({ workArea: a }) => b.x < a.x + a.width - 60 && b.x + b.width > a.x + 60 && b.y < a.y + a.height - 40 && b.y + 30 > a.y);
}
function initialBounds() {
  const w = CFG.window;
  const area = screen.getPrimaryDisplay().workAreaSize;
  const def = { width: Math.min(w.width, area.width), height: Math.min(w.height, area.height) };
  if (!w.remember) return { bounds: def, maximized: w.start === 'maximized', fullscreen: w.start === 'fullscreen' };
  const saved = store.get('window', null);
  if (saved && saved.bounds && visibleOnSomeScreen(saved.bounds)) return saved;
  return { bounds: def, maximized: w.start === 'maximized', fullscreen: w.start === 'fullscreen' };
}
function saveWindowState() {
  if (!win || win.isDestroyed() || !CFG.window.remember) return;
  store.set('window', { bounds: win.getNormalBounds(), maximized: win.isMaximized(), fullscreen: win.isFullScreen() });
}
const WEB_PREFS = {
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInSubFrames: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
  navigateOnDragDrop: false,
  safeDialogs: true,
  spellcheck: Array.isArray(CFG.behavior.spellcheck) && CFG.behavior.spellcheck.length > 0,
  devTools: Boolean(CFG.security.devtools),
};
function iconPath() { return path.join(__dirname, 'assets', IS_WIN ? 'icon.ico' : 'icon.png'); }

function createWindow({ hidden = false } = {}) {
  const st = initialBounds();
  const w = CFG.window;
  win = new BrowserWindow({
    ...st.bounds,
    minWidth: Math.max(320, w.minWidth || 0),
    minHeight: Math.max(240, w.minHeight || 0),
    show: false,
    title: CFG.name,
    icon: iconPath(),
    backgroundColor: w.background || '#ffffff',
    resizable: w.resizable !== false,
    autoHideMenuBar: w.menu !== 'visible',
    webPreferences: { ...WEB_PREFS },
  });
  if (w.menu === 'hidden') win.setMenuBarVisibility(false);
  if (st.maximized) win.maximize();
  if (st.fullscreen) win.setFullScreen(true);
  if (store.get('onTop', false)) win.setAlwaysOnTop(true);
  let shown = false;
  const show = () => { if (shown || hidden || !win || win.isDestroyed()) return; shown = true; win.show(); };
  win.once('ready-to-show', show);
  // Site lent : la fenêtre (à la couleur de fond choisie) s'affiche sans attendre la première image.
  setTimeout(show, 2500);
  if (CFG.behavior.badge) win.on('page-title-updated', (_e, title) => { const m = /^\s*\((\d{1,4})\+?\)/.exec(String(title || '')); setBadge(m ? Number(m[1]) : 0); });
  if (w.title === 'fixed') win.on('page-title-updated', (e) => e.preventDefault());
  let saveTimer = null;
  const later = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveWindowState, 800); };
  win.on('resize', later);
  win.on('move', later);
  win.on('close', (e) => {
    saveWindowState();
    if (!quitting && tray && CFG.behavior.closeToTray) {
      e.preventDefault();
      win.hide();
      if (!store.get('trayNotice', false)) {
        store.set('trayNotice', true);
        notify(CFG.name, T.trayKeep(CFG.name));
      }
    }
  });
  // Fermeture de session Windows : la croix ne doit plus réduire dans la zone de notification.
  win.on('session-end', () => { quitting = true; });
  win.on('closed', () => { win = null; });
  // Boutons « précédent / suivant » des souris sous Windows.
  win.on('app-command', (_e, cmd) => {
    const h = win && win.webContents.navigationHistory;
    if (!h) return;
    if (cmd === 'browser-backward' && h.canGoBack()) h.goBack();
    if (cmd === 'browser-forward' && h.canGoForward()) h.goForward();
  });
  const first = pendingDeepLink || CFG.startUrl;
  pendingDeepLink = null;
  // Une page remplacée par la page d'état (hors connexion…) rejette ce chargement avec ERR_ABORTED : sans importance.
  win.loadURL(first).catch((err) => { if (!/ERR_ABORTED|\(-3\)/.test(err.message)) log('Chargement initial :', err.message); });
  return win;
}
function showWindow() {
  if (!win || win.isDestroyed()) { createWindow(); return; }
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
}

// Boîte de dialogue rattachée à une fenêtre quand il y en a une (sinon, boîte indépendante).
function box(parent, opts) {
  const w = parent && !parent.isDestroyed() ? parent : (win && !win.isDestroyed() ? win : null);
  return w ? dialog.showMessageBox(w, opts) : dialog.showMessageBox(opts);
}

// ---------------------------------------------------------------- notifications système
function notify(title, body, onClick) {
  try {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title, body, icon: iconPath(), silent: false });
    if (onClick) n.on('click', onClick);
    n.show();
  } catch (err) { log('Notification impossible :', err); }
}

// ---------------------------------------------------------------- pages et fenêtres : règles de sécurité
const NET_ERRORS_IGNORED = new Set([-3]); // ERR_ABORTED : navigation remplacée par une autre, pas une panne.
const crashTimes = [];
let unresponsiveDialog = false;

function guardContents(contents) {
  // Les outils de développement (activés dans NEXORA) gardent leur propre fonctionnement.
  if (contents.getType() === 'devtools') return;
  // Aucune balise <webview> : elle permettrait d'ouvrir une page avec d'autres réglages de sécurité.
  contents.on('will-attach-webview', (e) => e.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    if (isInternal(url) && !String(url).startsWith(PAGES_ORIGIN)) {
      // Fenêtres du site lui-même (connexion par un service tiers autorisé, aperçu…) : mêmes protections.
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1000, height: 760, autoHideMenuBar: true, icon: iconPath(), backgroundColor: CFG.window.background || '#ffffff', webPreferences: { ...WEB_PREFS },
        },
      };
    }
    if (CFG.behavior.external === 'app' && /^https?:/i.test(String(url))) {
      const child = new BrowserWindow({
        width: 1000, height: 760, autoHideMenuBar: true, icon: iconPath(), webPreferences: { ...WEB_PREFS },
      });
      child.loadURL(url).catch(() => {});
      return { action: 'deny' };
    }
    openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event) => {
    const url = event.url;
    if (isInternal(url) || url === 'about:blank') return;
    event.preventDefault();
    const u = parse(url);
    // Fenêtre secondaire ouverte pour un site externe (réglage « dans l'application ») : elle navigue librement en http(s).
    if (CFG.behavior.external === 'app' && u && /^https?:$/.test(u.protocol) && contents !== (win && win.webContents)) { contents.loadURL(url).catch(() => {}); return; }
    if (u && /^(https?|mailto|tel|sms):$/.test(u.protocol)) openExternal(url);
  });
  contents.on('before-input-event', (event, input) => onShortcut(event, input, contents));
  if (CFG.behavior.contextMenu) contents.on('context-menu', (_e, params) => contextMenu(contents, params));
  if (CFG.behavior.zoom) {
    contents.on('zoom-changed', (_e, dir) => setZoom(contents, contents.getZoomLevel() + (dir === 'in' ? 0.5 : -0.5)));
    contents.on('did-navigate', () => { const z = store.get('zoom', 0); if (z) contents.setZoomLevel(z); });
  }
  contents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || NET_ERRORS_IGNORED.has(code) || String(url).startsWith(PAGES_ORIGIN)) return;
    log(`Échec de chargement ${code} (${desc}) : ${url}`);
    if (!isInternal(url)) return;
    if (code <= -200 && code > -300) { contents.loadURL(pageUrl('cert', { u: url, code: String(code) })).catch(() => {}); return; }
    if (CFG.behavior.offline) contents.loadURL(pageUrl('offline', { u: url, code: String(code) })).catch(() => {});
  });
  contents.on('render-process-gone', (_e, details) => {
    log('Page arrêtée :', details.reason, details.exitCode);
    if (details.reason === 'clean-exit') return;
    track('crash', `page:${details.reason}`, { message: `Page arrêtée (${details.reason}, code ${details.exitCode})` });
    const now = Date.now();
    crashTimes.push(now);
    while (crashTimes.length && now - crashTimes[0] > 60000) crashTimes.shift();
    if (contents.isDestroyed()) return;
    if (crashTimes.length < 3) contents.reload();
    else contents.loadURL(pageUrl('crash', { u: CFG.startUrl })).catch(() => {});
  });
  contents.on('unresponsive', async () => {
    if (unresponsiveDialog || !win || contents !== win.webContents) return;
    unresponsiveDialog = true;
    const r = await box(win, {
      type: 'warning', buttons: [T.wait, T.reloadNow], defaultId: 0, cancelId: 0, message: T.unresponsive(CFG.name), detail: T.unresponsiveDetail,
    });
    unresponsiveDialog = false;
    if (r.response === 1 && !contents.isDestroyed()) { contents.forcefullyCrashRenderer(); contents.reload(); }
  });
}

// ---------------------------------------------------------------- raccourcis clavier (même sans barre de menus)
function setZoom(contents, level) {
  const z = Math.max(-3, Math.min(5, Math.round(level * 2) / 2));
  contents.setZoomLevel(z);
  if (CFG.behavior.zoom) store.set('zoom', z);
}
function goHome(contents) { contents.loadURL(CFG.startUrl).catch(() => {}); }
function onShortcut(event, input, contents) {
  if (input.type !== 'keyDown') return;
  const mod = IS_MAC ? input.meta : input.control;
  const key = String(input.key || '').toLowerCase();
  const code = input.code || '';
  let handled = true;
  if (key === 'f5' && !mod) contents.reload();
  else if ((key === 'f5' && mod) || (mod && input.shift && key === 'r')) contents.reloadIgnoringCache();
  else if (mod && !input.shift && key === 'r') contents.reload();
  else if (input.alt && key === 'arrowleft') { const h = contents.navigationHistory; if (h.canGoBack()) h.goBack(); }
  else if (input.alt && key === 'arrowright') { const h = contents.navigationHistory; if (h.canGoForward()) h.goForward(); }
  else if (input.alt && key === 'home') goHome(contents);
  else if (mod && (key === '=' || key === '+' || code === 'NumpadAdd')) setZoom(contents, contents.getZoomLevel() + 0.5);
  else if (mod && (key === '-' || code === 'NumpadSubtract')) setZoom(contents, contents.getZoomLevel() - 0.5);
  else if (mod && (key === '0' || code === 'Numpad0')) setZoom(contents, 0);
  else if (key === 'f11' && !IS_MAC) { const w = BrowserWindow.fromWebContents(contents); if (w) w.setFullScreen(!w.isFullScreen()); }
  else if (mod && key === 'p') contents.print({}, () => {});
  else if (CFG.security.devtools && (key === 'f12' || (mod && input.shift && key === 'i'))) contents.toggleDevTools();
  else handled = false;
  if (handled) event.preventDefault();
}

// ---------------------------------------------------------------- menu contextuel (clic droit)
function contextMenu(contents, p) {
  const items = [];
  if (p.misspelledWord) {
    for (const s of (p.dictionarySuggestions || []).slice(0, 5)) items.push({ label: s, click: () => contents.replaceMisspelling(s) });
    items.push({ label: T.addWord, click: () => contents.session.addWordToSpellCheckerDictionary(p.misspelledWord) });
    items.push({ type: 'separator' });
  }
  if (p.linkURL && /^(https?|mailto|tel):/i.test(p.linkURL)) {
    items.push({ label: T.openLink, click: () => openExternal(p.linkURL) });
    items.push({ label: T.copyLink, click: () => require('electron').clipboard.writeText(p.linkURL) });
    items.push({ type: 'separator' });
  }
  if (p.mediaType === 'image' && p.srcURL) {
    items.push({ label: T.saveImage, click: () => contents.downloadURL(p.srcURL) });
    items.push({ label: T.copyImage, click: () => contents.copyImageAt(p.x, p.y) });
    items.push({ type: 'separator' });
  }
  const f = p.editFlags || {};
  if (p.isEditable) {
    items.push({ label: T.undo, role: 'undo', enabled: f.canUndo }, { label: T.redo, role: 'redo', enabled: f.canRedo }, { type: 'separator' });
    items.push({ label: T.cut, role: 'cut', enabled: f.canCut }, { label: T.copy, role: 'copy', enabled: f.canCopy }, { label: T.paste, role: 'paste', enabled: f.canPaste });
    items.push({ label: T.selectAll, role: 'selectAll' });
  } else if (p.selectionText && p.selectionText.trim()) {
    items.push({ label: T.copy, role: 'copy' });
  }
  if (CFG.security.devtools) items.push({ type: 'separator' }, { label: T.inspect, click: () => contents.inspectElement(p.x, p.y) });
  while (items.length && items[items.length - 1].type === 'separator') items.pop();
  if (items.length) Menu.buildFromTemplate(items).popup({ window: BrowserWindow.fromWebContents(contents) || undefined });
}

// ---------------------------------------------------------------- autorisations
const ALWAYS = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'keyboardLock', 'screen-wake-lock', 'persistent-storage', 'background-sync', 'speaker-selection', 'storage-access']);
function permKey(permission, details = {}) {
  if (permission === 'media') {
    const types = details.mediaTypes || (details.mediaType ? [details.mediaType] : []);
    const v = types.includes('video');
    const a = types.includes('audio');
    if (v && a) return 'camera+microphone';
    return v ? 'camera' : 'microphone';
  }
  if (permission === 'display-capture') return 'display';
  if (permission === 'notifications') return 'notifications';
  if (permission === 'geolocation' || permission === 'geolocation-approximate') return 'geolocation';
  if (permission === 'clipboard-read') return 'clipboard';
  if (['local-network', 'local-network-access', 'loopback-network'].includes(permission)) return 'localNetwork';
  if (permission === 'midi' || permission === 'midiSysex') return 'midi';
  return null;
}
function ruleFor(key) {
  if (key === 'camera+microphone') {
    const a = CFG.permissions.camera; const b = CFG.permissions.microphone;
    if (a === 'deny' || b === 'deny') return 'deny';
    return a === 'allow' && b === 'allow' ? 'allow' : 'ask';
  }
  return CFG.permissions[key] || 'deny';
}
// Node.js ne donne pas d'origine aux protocoles personnalisés (« null ») : app://local et app://pages sont reconstruits.
function originOf(url) { const u = parse(url); if (!u) return ''; return u.protocol === 'app:' ? `app://${u.host}` : u.origin; }
function remembered(origin, key) {
  const all = store.get('permissions', {});
  if (key === 'camera+microphone') {
    const c = all[`${origin}|camera`]; const m = all[`${origin}|microphone`];
    return c === undefined || m === undefined ? undefined : c && m;
  }
  return all[`${origin}|${key}`];
}
function remember(origin, key, value) {
  const all = { ...store.get('permissions', {}) };
  for (const k of key === 'camera+microphone' ? ['camera', 'microphone'] : [key]) all[`${origin}|${k}`] = value;
  store.set('permissions', all);
}
async function askPermission(contents, origin, key) {
  const parent = BrowserWindow.fromWebContents(contents) || win;
  const r = await box(parent, {
    type: 'question', buttons: [T.allow, T.deny], defaultId: 0, cancelId: 1, noLink: true,
    message: T.perm(CFG.name, T.what[key] || key), detail: origin, checkboxLabel: T.remember, checkboxChecked: true,
  });
  const ok = r.response === 0;
  if (r.checkboxChecked) remember(origin, key, ok);
  return ok;
}
function setupPermissions(ses) {
  ses.setPermissionRequestHandler((contents, permission, callback, details = {}) => {
    const origin = originOf(details.requestingUrl || (contents && contents.getURL()) || '');
    if (permission === 'openExternal') {
      const target = parse(details.externalURL || '');
      if (target && ['mailto:', 'tel:', 'sms:'].includes(target.protocol)) { callback(true); return; }
      if (!target || !isInternal(origin)) { callback(false); return; }
      box(BrowserWindow.fromWebContents(contents), {
        type: 'question', buttons: [T.allow, T.deny], defaultId: 1, cancelId: 1, noLink: true, message: T.external, detail: String(details.externalURL).slice(0, 300),
      }).then((r) => callback(r.response === 0)).catch(() => callback(false));
      return;
    }
    if (!isInternal(origin)) { callback(false); return; }
    if (ALWAYS.has(permission)) { callback(true); return; }
    const key = permKey(permission, details);
    const rule = key ? ruleFor(key) : 'deny';
    if (rule === 'allow' || (key === 'display' && rule === 'ask')) { callback(true); return; }
    if (rule === 'deny') { callback(false); return; }
    const known = remembered(origin, key);
    if (known !== undefined) { callback(Boolean(known)); return; }
    askPermission(contents, origin, key).then(callback).catch(() => callback(false));
  });
  ses.setPermissionCheckHandler((_contents, permission, requestingOrigin, details = {}) => {
    const origin = requestingOrigin || originOf(details.requestingUrl || '');
    if (!isInternal(origin)) return false;
    if (ALWAYS.has(permission)) return true;
    const key = permKey(permission, details);
    if (!key) return false;
    const rule = ruleFor(key);
    if (rule === 'allow') return true;
    if (rule === 'deny') return false;
    // « Demander » : le site peut faire sa demande (la fenêtre de choix s'ouvre alors), sauf refus déjà retenu.
    return remembered(origin, key) !== false;
  });
  // Partage d'écran (visioconférence) : choix de l'écran ou d'une fenêtre, ou refus.
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      if (ruleFor('display') === 'deny' || !isInternal(request.securityOrigin)) { callback(null); return; }
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } });
      const screens = sources.filter((s) => s.id.startsWith('screen:'));
      const windows = sources.filter((s) => s.id.startsWith('window:') && s.name && s.name !== CFG.name).slice(0, 5);
      const displays = screen.getAllDisplays();
      const choices = [
        ...screens.map((s, i) => ({ s, label: T.screen(i + 1, (displays[i] || {}).size ? displays[i].size.width : 0, (displays[i] || {}).size ? displays[i].size.height : 0) })),
        ...windows.map((s) => ({ s, label: T.appWindow(s.name.slice(0, 40)) })),
      ];
      if (!choices.length) { callback(null); return; }
      const r = await box(win, {
        type: 'question', buttons: [...choices.map((c) => c.label), T.cancel], cancelId: choices.length, noLink: true, message: T.shareTitle,
      });
      const pick = choices[r.response];
      callback(pick ? { video: pick.s, audio: request.audioRequested && IS_WIN ? 'loopback' : undefined } : null);
    } catch (err) { log('Partage d’écran :', err); callback(null); }
  });
}

// ---------------------------------------------------------------- téléchargements
const downloads = new Set();
function refreshProgress() {
  if (!win || win.isDestroyed()) return;
  let got = 0; let total = 0;
  for (const it of downloads) { got += it.getReceivedBytes(); total += it.getTotalBytes(); }
  win.setProgressBar(downloads.size ? (total > 0 ? got / total : 2) : -1);
}
function freePath(dir, name) {
  const ext = path.extname(name);
  const base = path.basename(name, ext) || 'fichier';
  let file = path.join(dir, name || 'fichier');
  for (let n = 2; fs.existsSync(file) && n < 1000; n++) file = path.join(dir, `${base} (${n})${ext}`);
  return file;
}
function setupDownloads(ses) {
  ses.on('will-download', (_e, item) => {
    const name = item.getFilename();
    if (CFG.behavior.downloads === 'auto') item.setSavePath(freePath(app.getPath('downloads'), name));
    else item.setSaveDialogOptions({ defaultPath: path.join(app.getPath('downloads'), name) });
    downloads.add(item);
    item.on('updated', refreshProgress);
    item.once('done', (_ev, state) => {
      downloads.delete(item);
      refreshProgress();
      if (state === 'completed') notify(CFG.name, T.downloaded(path.basename(item.getSavePath())), () => shell.showItemInFolder(item.getSavePath()));
      else if (state === 'interrupted') notify(CFG.name, T.downloadFailed(name));
    });
  });
}

// ---------------------------------------------------------------- fichiers locaux (protocole app://)
function serveFrom(root, rel, { spa = false } = {}) {
  let file = path.normalize(path.join(root, rel));
  if (file !== root && !file.startsWith(root + path.sep)) return new Response('Accès refusé', { status: 403 });
  try {
    let st = fs.statSync(file);
    if (st.isDirectory()) { file = path.join(file, 'index.html'); st = fs.statSync(file); }
  } catch {
    // Application d'une seule page (React, Vue…) : une adresse sans extension affiche index.html.
    if (spa && !path.extname(rel)) file = path.join(root, 'index.html');
    else return new Response('Introuvable', { status: 404 });
  }
  return net.fetch(pathToFileURL(file).toString());
}
function setupProtocol() {
  const web = path.join(__dirname, 'web');
  const pages = path.join(__dirname, 'pages');
  protocol.handle('app', (req) => {
    const u = parse(req.url);
    if (!u) return new Response('Adresse invalide', { status: 400 });
    let rel = '/';
    try { rel = decodeURIComponent(u.pathname); } catch { return new Response('Adresse invalide', { status: 400 }); }
    if (u.host === 'pages') return serveFrom(pages, rel);
    if (u.host === 'local' && CFG.kind === 'local') return serveFrom(web, rel, { spa: true });
    return new Response('Introuvable', { status: 404 });
  });
}

// ---------------------------------------------------------------- menu de l'application
function toggleAutostart(item) {
  const opts = { openAtLogin: item.checked, args: ['--hidden'] };
  // Version portable : le démarrage lance l'exécutable portable lui-même, pas sa copie temporaire.
  if (process.env.PORTABLE_EXECUTABLE_FILE) opts.path = process.env.PORTABLE_EXECUTABLE_FILE;
  app.setLoginItemSettings(opts);
}
function autostartEnabled() {
  try {
    const opts = process.env.PORTABLE_EXECUTABLE_FILE ? { path: process.env.PORTABLE_EXECUTABLE_FILE, args: ['--hidden'] } : { args: ['--hidden'] };
    return app.getLoginItemSettings(opts).openAtLogin;
  } catch { return false; }
}
async function toggleGpu(item) {
  store.set('gpuOff', item.checked);
  store.flush();
  const r = await box(win, { type: 'info', buttons: [T.restartNow, T.later], defaultId: 0, cancelId: 1, message: T.restartNeeded });
  if (r.response === 0) { app.relaunch(); app.exit(0); }
}
function aboutBox() {
  const lines = [CFG.publisher, CFG.copyright, '', `Electron ${process.versions.electron} · Chromium ${process.versions.chrome}`, T.builtWith].filter((l, i) => l !== undefined && (l || i === 2));
  box(win, {
    type: 'info', title: T.about(CFG.name), message: `${CFG.name} ${app.getVersion()}`, detail: lines.join('\n'), icon: path.join(__dirname, 'assets', 'icon.png'), buttons: [T.ok],
  });
}
function current() { return (BrowserWindow.getFocusedWindow() || win || {}).webContents; }
function buildMenu() {
  const shortcut = (accel) => ({ accelerator: accel, registerAccelerator: false });
  const view = [
    { label: T.reload, ...shortcut('CmdOrCtrl+R'), click: () => current() && current().reload() },
    { label: T.hardReload, ...shortcut('CmdOrCtrl+Shift+R'), click: () => current() && current().reloadIgnoringCache() },
    { type: 'separator' },
    { label: T.zoomIn, ...shortcut('CmdOrCtrl+='), click: () => current() && setZoom(current(), current().getZoomLevel() + 0.5) },
    { label: T.zoomOut, ...shortcut('CmdOrCtrl+-'), click: () => current() && setZoom(current(), current().getZoomLevel() - 0.5) },
    { label: T.zoomReset, ...shortcut('CmdOrCtrl+0'), click: () => current() && setZoom(current(), 0) },
    { type: 'separator' },
    { label: T.fullscreen, ...shortcut(IS_MAC ? 'Ctrl+Cmd+F' : 'F11'), click: () => win && win.setFullScreen(!win.isFullScreen()) },
    {
      label: T.onTop, type: 'checkbox', checked: store.get('onTop', false), click: (it) => { store.set('onTop', it.checked); if (win) win.setAlwaysOnTop(it.checked); },
    },
  ];
  if (CFG.security.devtools) view.push({ type: 'separator' }, { label: T.devtools, ...shortcut(IS_MAC ? 'Alt+Cmd+I' : 'F12'), click: () => current() && current().toggleDevTools() });
  const help = [
    { label: T.about(CFG.name), click: aboutBox },
  ];
  if (CFG.homepage) help.push({ label: T.website, click: () => openExternal(CFG.homepage) });
  if (CFG.updates.mode !== 'none' && !PORTABLE) help.push({ label: T.updates, click: () => checkUpdates(true) });
  help.push({ type: 'separator' });
  if (CFG.behavior.autostartOption && (IS_WIN || IS_MAC)) help.push({ label: T.autostart, type: 'checkbox', checked: autostartEnabled(), click: toggleAutostart });
  help.push({ label: T.gpu, type: 'checkbox', checked: store.get('gpuOff', false), click: toggleGpu });
  help.push({ label: T.logs, click: () => shell.openPath(path.join(app.getPath('userData'), 'logs')) });
  const template = [
    ...(IS_MAC ? [{ role: 'appMenu' }] : []),
    {
      label: T.file,
      submenu: [
        { label: T.print, ...shortcut('CmdOrCtrl+P'), click: () => current() && current().print({}, () => {}) },
        { type: 'separator' },
        { label: T.closeWin, role: 'close' },
        ...(IS_MAC ? [] : [{ label: T.quit, click: () => { quitting = true; app.quit(); } }]),
      ],
    },
    {
      label: T.edit,
      submenu: [
        { label: T.undo, role: 'undo' }, { label: T.redo, role: 'redo' }, { type: 'separator' },
        { label: T.cut, role: 'cut' }, { label: T.copy, role: 'copy' }, { label: T.paste, role: 'paste' }, { label: T.pastePlain, role: 'pasteAndMatchStyle' },
        { type: 'separator' }, { label: T.selectAll, role: 'selectAll' },
      ],
    },
    { label: T.view, submenu: view },
    {
      label: T.go,
      submenu: [
        { label: T.back, ...shortcut('Alt+Left'), click: () => { const c = current(); if (c && c.navigationHistory.canGoBack()) c.navigationHistory.goBack(); } },
        { label: T.forward, ...shortcut('Alt+Right'), click: () => { const c = current(); if (c && c.navigationHistory.canGoForward()) c.navigationHistory.goForward(); } },
        { label: T.home, ...shortcut('Alt+Home'), click: () => current() && goHome(current()) },
      ],
    },
    ...(IS_MAC ? [{ role: 'windowMenu' }] : []),
    { label: T.help, role: 'help', submenu: help },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------- zone de notification
function setupTray() {
  if (!CFG.behavior.tray || tray) return;
  try {
    tray = new Tray(iconPath());
    tray.setToolTip(CFG.name);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: T.open(CFG.name), click: showWindow },
      { type: 'separator' },
      { label: T.quit, click: () => { quitting = true; app.quit(); } },
    ]));
    tray.on('click', showWindow);
  } catch (err) { log('Zone de notification indisponible :', err); tray = null; }
}

// ---------------------------------------------------------------- mises à jour du logiciel (electron-updater)
let updater = null;
function setupUpdates() {
  if (CFG.updates.mode === 'none' || PORTABLE || !app.isPackaged) return;
  try { ({ autoUpdater: updater } = require('electron-updater')); } catch (err) { log('Module de mise à jour absent :', err.message); return; }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.logger = { info: (m) => log('[maj]', m), warn: (m) => log('[maj]', m), error: (m) => log('[maj]', m), debug: () => {} };
  // NEXORA #058 : canal bêta (versions de test) et mise à jour obligatoire (nxMandatory dans latest.yml).
  if (CFG.updates.channel === 'beta') { updater.channel = 'beta'; updater.allowPrerelease = true; }
  updater.on('update-downloaded', async (info) => {
    if (info && info.nxMandatory) {
      await box(win, { type: 'warning', buttons: [T.restartNow], defaultId: 0, cancelId: 0, message: T.updateMandatory(info.version) });
      quitting = true; updater.quitAndInstall();
      return;
    }
    const r = await box(win, { type: 'info', buttons: [T.restartNow, T.later], defaultId: 0, cancelId: 1, message: T.updateReady(info.version) });
    if (r.response === 0) { quitting = true; updater.quitAndInstall(); }
  });
  updater.on('error', (err) => log('[maj] erreur :', err));
  if (CFG.updates.checkOnStart) setTimeout(() => checkUpdates(false), 15000);
  setInterval(() => checkUpdates(false), 6 * 3600 * 1000).unref();
}
async function checkUpdates(manual) {
  if (!updater) { if (manual) box(win, { type: 'info', message: T.updateError, buttons: [T.ok] }); return; }
  try {
    const r = await updater.checkForUpdates();
    if (manual && (!r || !r.isUpdateAvailable)) box(win, { type: 'info', message: T.updateNone, buttons: [T.ok] });
  } catch (err) {
    log('[maj] vérification :', err);
    if (manual) box(win, { type: 'warning', message: T.updateError, buttons: [T.ok] });
  }
}

// ---------------------------------------------------------------- intégration à Windows (NEXORA #058)
function setupWindowsIntegration() {
  const b = CFG.behavior;
  if (IS_WIN && (b.jumpList || []).length && !PORTABLE) {
    try {
      app.setUserTasks(b.jumpList.map((j) => ({
        program: process.execPath, arguments: `--nx-open=${j.path}`, iconPath: process.execPath, iconIndex: 0, title: j.label, description: j.label,
      })));
    } catch (err) { log('Liste de raccourcis :', err.message); }
  }
  if (b.shortcut) {
    // Raccourci global : ouvre le logiciel, ou le réduit s'il est déjà au premier plan.
    const ok = globalShortcut.register(b.shortcut, () => {
      if (win && !win.isDestroyed() && win.isVisible() && win.isFocused()) win.minimize(); else showWindow();
    });
    if (!ok) log(`Raccourci ${b.shortcut} déjà utilisé par un autre programme.`);
  }
}

// ---------------------------------------------------------------- démarrage
let gpuCrashes = 0;
if (gotLock) {
  app.on('second-instance', (_e, argv) => {
    const link = findDeepLink(argv);
    showWindow();
    if (link && win) win.loadURL(link).catch(() => {});
    deliverFile(findFileArg(argv));
  });
  app.on('open-url', (e, url) => {
    e.preventDefault();
    const link = deepLinkTarget(url);
    if (!link) return;
    if (win) { showWindow(); win.loadURL(link).catch(() => {}); } else pendingDeepLink = link;
  });
  app.on('web-contents-created', (_e, contents) => guardContents(contents));
  app.on('child-process-gone', (_e, details) => {
    if (details.type !== 'GPU' || details.reason === 'clean-exit') return;
    log('Processus graphique arrêté :', details.reason);
    track('error', `gpu:${details.reason}`, { message: `Processus graphique arrêté (${details.reason})` });
    gpuCrashes += 1;
    if (gpuCrashes === 2 && !store.get('gpuOff', false)) {
      box(win, { type: 'warning', buttons: [T.restart, T.later], defaultId: 0, cancelId: 1, message: T.gpuAsk }).then((r) => {
        if (r.response !== 0) return;
        store.set('gpuOff', true);
        store.flush();
        app.relaunch();
        app.exit(0);
      }).catch(() => {});
    }
  });
  app.whenReady().then(() => {
    LANG = pickLanguage();
    log(`Démarrage de ${CFG.name} ${app.getVersion()} (Electron ${process.versions.electron}, ${process.platform} ${process.arch})`);
    const ses = session.defaultSession;
    setupProtocol();
    setupPermissions(ses);
    setupDownloads(ses);
    if (WEB_PREFS.spellcheck && !IS_MAC) {
      try {
        const available = ses.availableSpellCheckerLanguages || [];
        const langs = CFG.behavior.spellcheck.filter((l) => !available.length || available.includes(l));
        if (langs.length) ses.setSpellCheckerLanguages(langs);
      } catch (err) { log('Correcteur orthographique :', err.message); }
    }
    buildMenu();
    setupTray();
    pendingDeepLink = pendingDeepLink || findDeepLink(process.argv);
    createWindow({ hidden: process.argv.includes('--hidden') && Boolean(tray) });
    deliverFile(findFileArg(process.argv));
    setupWindowsIntegration();
    setupUpdates();
    track('launch');
    app.on('activate', () => showWindow());
  });
  app.on('before-quit', () => { quitting = true; saveWindowState(); store.flush(); });
  app.on('will-quit', () => { try { globalShortcut.unregisterAll(); } catch { /* rien à retirer */ } });
  app.on('window-all-closed', () => { if (!IS_MAC) app.quit(); });
}
