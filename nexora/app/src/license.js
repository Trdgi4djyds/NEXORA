'use strict';
/* NEXORA #076 : licence obligatoire, intégrité des fichiers et passage par le lanceur.
 *  - Le logiciel ne s'ouvre pas sans un contrôle de licence réussi : le Worker de NEXORA relaie la fonction
 *    nx_license_check de la base (compte, clé, appareil, adresse IP, 3 comptes gratuits au plus par appareil,
 *    essai d'un jour) et SIGNE sa réponse (Ed25519) ; une réponse non signée, modifiée, rejouée (nonce) ou destinée
 *    à un autre appareil est refusée. Sans Internet, sans compte ou sans serveur : logiciel verrouillé.
 *  - Verrou réel : tant que la licence n'est pas validée, les canaux des espaces (Dev Lab, App Builder, Desktop
 *    Builder, Browser Lab, Sécurité, NEX-DESIGN, IA, outils…) sont refusés par le processus principal, même si
 *    l'écran de verrouillage de l'interface était retiré.
 *  - Contrôle toutes les 10 minutes ; signal de vie de la session et journaux (événements, erreurs) toutes les
 *    5 minutes (nx_session_ping).
 *  - Intégrité : resources/nexora.manifest.json, signé par la clé de publication de NEXORA, donne l'empreinte
 *    SHA-256 de app.asar et des fichiers du logiciel ; une différence verrouille le logiciel (le lanceur répare).
 *    NEXORA #077 : au démarrage, TOUS les fichiers du manifeste sont contrôlés (lecture en flux), puis NEXORA.exe et
 *    app.asar à chaque contrôle périodique ; manifeste expiré, incohérent ou plus ancien que le dernier accepté sur
 *    ce PC (retour en arrière) refusé ; le résultat est envoyé au serveur, qui le consigne et refuse aussi une
 *    version trop ancienne (politique réglée dans le back office). États distincts : « Connexion perdue » (réseau),
 *    « Échec du contrôle d'intégrité — Installation non authentifiée » (fichiers), « Version non autorisée ».
 *  - Lanceur : NEXORA Devs Toolbox est le seul point d'entrée (raccourcis, liens nexora://) ; NEXORA ouvert
 *    directement relance le lanceur s'il est installé.
 * Rien de tout cela ne s'applique hors de l'application empaquetée (développement, essais) : voir ACTIVE. */
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { techLog } = require('./plain');
// Sous Electron, fs voit app.asar comme un dossier : original-fs lit le fichier lui-même (empreinte).
const ofs = (() => { try { return require('original-fs'); } catch { return fs; } })();

// Clés publiques (les clés privées ne sont jamais dans le dépôt : Worker et poste de publication).
let LICENSE_KEY = 'MCowBQYDK2VwAyEA5qntAYP+NTzIAelhd3Sm2lUpg2Wi5b+TL0LM8np5sN8=';
let RELEASE_KEY = 'MCowBQYDK2VwAyEAuylEQNJveeY4JGMR7lmlzN/tsqE/DWeWntYU7n1OxNc=';
// NEXORA #096 : domaine principal (l'adresse workers.dev d'origine est désactivée dans Cloudflare).
const SERVER = 'https://nexoradevs.online';
const SITE_LICENCE = `${SERVER}/licence`;
const CHECK_EVERY = 10 * 60 * 1000;
const PING_EVERY = 5 * 60 * 1000;
const pub = (b64) => crypto.createPublicKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'spki' });

// Canaux libres même sans licence validée : démarrage de l'interface, réglages, compte, licence, fenêtre.
const LOCKED_PREFIXES = ['android:', 'lab:', 'dev:', 'git:', 'gh:', 'tunnel:', 'skins:', 'ai:', 'media:', 'backup:', 'mon:', 'project:', 'tts:', 'sec:', 'tools:', 'desktop:', 'devx:', 'dzx:', 'novx:', 'capture:', 'screencast:', 'device:', 'fs:', 'editor:'];
const OPEN_CHANNELS = new Set(['mon:cloud-session']);

let opts = null;
let state = { status: 'checking', message: 'Vérification de votre licence…', at: 0 };
let session = null; // { token, email } transmis par l'interface (canal mon:cloud-session)
let timer = null;
let pingTimer = null;
let fails = 0;
const queue = [];
let device = null;

const ACTIVE = () => Boolean(opts && (opts.app.isPackaged || process.env.NEXORA_LICENCE_FORCE === '1')) && process.env.NEXORA_LICENCE_OFF !== '1';

function emit() {
  if (!opts) return;
  try { opts.send('license:changed', publicState()); } catch { /* fenêtre fermée */ }
}
function publicState() {
  const { session_id: _s, ...rest } = state; void _s;
  return { ...rest, active: ACTIVE(), site: SITE_LICENCE };
}
function set(next) { state = { ...state, ...next, at: Date.now() }; emit(); }

// ---------- Appareil ----------
function machineGuid() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      try { resolve(fs.readFileSync('/etc/machine-id', 'utf8').trim()); } catch { resolve(''); }
      return;
    }
    execFile('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { windowsHide: true }, (err, out) => {
      const m = /MachineGuid\s+REG_SZ\s+([0-9a-f-]+)/i.exec(String(out || ''));
      resolve(err || !m ? '' : m[1]);
    });
  });
}
async function deviceInfo() {
  if (device) return device;
  const guid = await machineGuid();
  // Empreinte seulement : l'identifiant de Windows ne quitte jamais le PC.
  const hash = crypto.createHash('sha256').update(`nexora-device:${guid || `${os.hostname()}|${os.userInfo().username}`}`).digest('hex');
  device = { hash, name: os.hostname().slice(0, 80), os: `${os.type()} ${os.release()} ${process.arch}` };
  return device;
}

// ---------- Clé saisie (facultative : la licence suit le compte) ----------
const keyFile = () => path.join(opts.app.getPath('userData'), 'licence.json');
function storedKey() { try { return JSON.parse(fs.readFileSync(keyFile(), 'utf8')).key || ''; } catch { return ''; } }
function storeKey(key) {
  const k = String(key || '').trim().toUpperCase();
  if (k && !/^NXDT(-[2-9A-HJKMNP-Z]{4}){4}$/.test(k)) throw new Error('Clé de licence invalide : elle a la forme NXDT-XXXX-XXXX-XXXX-XXXX.');
  fs.writeFileSync(keyFile(), JSON.stringify({ key: k, at: new Date().toISOString() }));
  return k;
}
// Clé reçue par un lien nexora://licence?key=… (site vitrine) ou par l'argument --nx-license=.
function keyFromArgs(argv) {
  for (const a of argv || []) {
    const s = String(a);
    let m = /^--nx-license=(.+)$/.exec(s);
    if (!m) { const u = /^nexora:\/\/licen[cs]e\/?\?(.*)$/i.exec(s); if (u) m = [null, new URLSearchParams(u[1]).get('key')]; }
    if (m && m[1]) return m[1];
  }
  return '';
}

// ---------- Réponse signée ----------
function verifySigned(res, nonce, dev) {
  if (!res || typeof res.payload !== 'string' || typeof res.sig !== 'string') return null;
  const ok = crypto.verify(null, Buffer.from(res.payload, 'utf8'), pub(LICENSE_KEY), Buffer.from(res.sig, 'base64'));
  if (!ok) return null;
  const p = JSON.parse(res.payload);
  if (p.nonce !== nonce || p.device !== dev) return null;
  return p;
}

const OFFLINE = 'Connexion perdue : NEXORA ne peut pas joindre son serveur de sécurité. Vérifiez votre connexion à Internet ; NEXORA se rouvre dès que la connexion est rétablie et le contrôle validé.';
let checking = null;
function check(reason = 'contrôle') {
  if (!checking) checking = runCheck(reason).finally(() => { checking = null; });
  return checking;
}
async function runCheck(reason) {
  if (!ACTIVE()) { set({ status: 'ok', plan: null, message: '', dev: true }); return publicState(); }
  const full = ['démarrage', 'connexion', 'demande'].includes(reason) || !integrityCache;
  if (state.status !== 'ok' && full) set({ status: 'checking', message: 'Contrôle d’intégrité de NEXORA…' });
  const integ = await integrity(full);
  if (!integ.ok) {
    techLog('securite', `Contrôle d'intégrité refusé (${integ.reason}) ${integ.file || ''}`);
    log('error', 'integrite', { reason: integ.reason, file: integ.file || '' });
  }
  const lockIntegrity = () => set({ status: integrityStatus(integ), reason: integ.reason, message: integ.message, file: integ.file || '' });
  if (!session || !session.token) {
    if (!integ.ok) { lockIntegrity(); return publicState(); }
    set({ status: 'auth', reason: 'auth', message: 'Connectez-vous à votre compte NEXORA pour ouvrir le logiciel.' });
    return publicState();
  }
  const dev = await deviceInfo();
  const nonce = crypto.randomBytes(16).toString('hex');
  const report = integ.ok ? { ok: true, manifest_version: integ.manifest_version || 0, files: integ.files || 0 } : { ok: false, reason: integ.reason, file: integ.file || '' };
  let res;
  try {
    const r = await opts.fetch(`${SERVER}/license/check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ device: dev.hash, key: storedKey() || null, version: opts.app.getVersion(), os: dev.os, name: dev.name, nonce, integrity: report }),
      signal: AbortSignal.timeout(15000),
    });
    if (r.status === 503) {
      const j = await r.json().catch(() => ({}));
      fails += 1;
      if (!integ.ok) { lockIntegrity(); return publicState(); }
      set({ status: 'server', reason: 'not_configured', message: j.message || 'Le serveur de sécurité de NEXORA est indisponible. Réessayez dans quelques minutes.' });
      return publicState();
    }
    res = await r.json();
  } catch {
    fails += 1;
    if (!integ.ok) { lockIntegrity(); return publicState(); }
    // Internet obligatoire : au démarrage tout de suite, en cours d'utilisation après deux échecs (environ 1 min).
    if (state.status !== 'ok' || fails >= 2) set({ status: 'offline', reason: 'offline', message: OFFLINE });
    return publicState();
  }
  const p = verifySigned(res, nonce, dev.hash);
  if (!p) {
    fails += 1;
    techLog('securite', 'Réponse du serveur de sécurité non authentique');
    set({ status: 'blocked', reason: 'signature', message: 'La réponse du serveur de sécurité n’est pas authentique. Vérifiez votre connexion (proxy, pare-feu), puis réessayez.' });
    return publicState();
  }
  fails = 0;
  if (!integ.ok) { lockIntegrity(); return publicState(); }
  if (p.check_minutes) schedule(p.check_minutes);
  if (!p.ok) {
    const status = p.reason === 'auth' ? 'auth' : p.reason === 'outdated' ? 'outdated' : p.reason === 'integrity' ? 'integrity' : 'blocked';
    set({ status, reason: p.reason, message: p.message, license_key: p.license_key || '', email: p.email || '' });
    return publicState();
  }
  saveManifest(integ.manifest_version || 0);
  const first = state.status !== 'ok';
  const latest = p.publication && p.publication.version;
  set({
    // NEXORA #084 : un administrateur de NEXORA a un accès total (toutes les fonctions, quelle que soit son offre).
    status: 'ok', reason: '', message: '', plan: p.admin ? 'pro' : p.plan, plan_name: p.admin ? 'Pro' : p.plan_name, paid_plan: p.paid_plan, trial: Boolean(p.trial) && !p.admin,
    trial_ends_at: p.trial_ends_at, trial_refused: Boolean(p.trial_refused), license_key: p.license_key, email: p.email, admin: Boolean(p.admin),
    granted: Boolean(p.granted), granted_until: p.granted_until || null,
    session_id: p.session_id, perms: p.admin ? Object.fromEntries(Object.keys(p.perms || {}).map((k) => [k, true])) : p.perms, ip: p.ip, checked: reason,
    update_available: latest && newer(latest, opts.app.getVersion()) ? latest : '',
  });
  if (first) log('info', 'licence_ok', { plan: p.plan, trial: Boolean(p.trial), version: opts.app.getVersion(), files: integ.files || 0 });
  return publicState();
}
function newer(a, b) {
  const n = (v) => String(v || '').replace(/^v/, '').split(/[.-]/).slice(0, 3).map((x) => Number(x) || 0);
  const [x, y] = [n(a), n(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

// ---------- Session et journaux ----------
function log(level, event, detail = {}) {
  queue.push({ level, event: String(event).slice(0, 80), detail: detail && typeof detail === 'object' ? detail : { value: String(detail) }, at: new Date().toISOString() });
  if (queue.length > 200) queue.splice(0, queue.length - 200);
}
async function ping(end = false) {
  if (!ACTIVE() || !session || !state.session_id) return;
  const events = queue.splice(0, 50);
  try {
    const r = await opts.fetch(`${session.url}/rest/v1/rpc/nx_session_ping`, {
      method: 'POST',
      headers: { apikey: session.key, authorization: `Bearer ${session.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_session: state.session_id, p_events: events, p_end: end }),
      signal: AbortSignal.timeout(10000),
    });
    const j = await r.json().catch(() => null);
    if (j && (j.revoked || j.blocked)) check('révocation');
    else if (j && j.ok && j.plan && j.plan !== state.plan) check('offre');
  } catch { queue.unshift(...events); }
}

// ---------- Intégrité des fichiers ----------
const secFile = () => path.join(opts.app.getPath('userData'), 'securite.json');
function lastManifest() { try { return Number(JSON.parse(fs.readFileSync(secFile(), 'utf8')).manifest_version) || 0; } catch { return 0; } }
function saveManifest(v) {
  if (!(v > lastManifest())) return;
  try { fs.writeFileSync(secFile(), JSON.stringify({ manifest_version: v, at: new Date().toISOString() })); } catch { /* disque en lecture seule */ }
}
function hashFile(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    ofs.createReadStream(file).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}
const INTEGRITY_TEXT = {
  manifest_missing: () => 'Le manifeste de sécurité de cette installation est introuvable.',
  signature: () => 'Le manifeste de sécurité de cette installation n’est pas signé par NEXORA.',
  missing: (f) => `Le fichier « ${f} » de NEXORA est absent.`,
  modified: (f) => `Le fichier « ${f} » ne correspond pas à son empreinte officielle.`,
  expired: () => 'Le manifeste de sécurité de cette installation a expiré.',
  inconsistent: () => 'Le manifeste de sécurité ne correspond pas à cette version de NEXORA.',
  rollback: () => 'Cette installation est plus ancienne que la dernière version validée sur ce PC : retour en arrière refusé.',
};
let integrityCache = null; // dernier contrôle complet réussi : { ok, version, manifest_version, at }
// full : tous les fichiers du manifeste (démarrage, nouvelle session) ; sinon NEXORA.exe et app.asar.
async function integrity(full = true) {
  if (!opts.app.isPackaged) return { ok: true, dev: true };
  if (!full && !integrityCache) full = true;
  const res = process.resourcesPath;
  const bad = (reason, file = '') => ({ ok: false, reason, file, message: INTEGRITY_TEXT[reason](file) });
  let man;
  let sig;
  try {
    man = ofs.readFileSync(path.join(res, 'nexora.manifest.json'));
    sig = ofs.readFileSync(path.join(res, 'nexora.manifest.sig'), 'utf8').trim();
  } catch { return bad('manifest_missing'); }
  let ok = false;
  try { ok = crypto.verify(null, man, pub(RELEASE_KEY), Buffer.from(sig, 'base64')); } catch { ok = false; }
  if (!ok) return bad('signature');
  let m;
  try { m = JSON.parse(man.toString('utf8')); } catch { return bad('inconsistent'); }
  if (!m || !m.files || typeof m.files !== 'object' || (m.version && m.version !== opts.app.getVersion())) return bad('inconsistent');
  if (m.expires_at && Date.parse(m.expires_at) < Date.now()) return bad('expired');
  const mv = Number(m.manifest_version) || 0;
  if (mv < lastManifest()) return bad('rollback');
  const root = path.dirname(res);
  const exe = m.exe || 'NEXORA.exe';
  const list = full ? Object.keys(m.files) : ['resources/app.asar', exe];
  for (const rel of list) {
    const want = m.files[rel];
    if (!want || !want.sha256) return bad('inconsistent', rel);
    const file = path.join(root, ...rel.split('/'));
    let st;
    try { st = ofs.statSync(file); } catch { return bad('missing', rel); }
    if (st.size !== want.size) return bad('modified', rel);
    let got;
    try { got = await hashFile(file); } catch { return bad('missing', rel); }
    if (got !== want.sha256) return bad('modified', rel);
  }
  const r = { ok: true, version: m.version, manifest_version: mv, files: list.length, full };
  if (full) integrityCache = { ...r, at: Date.now() };
  return r;
}
const integrityStatus = (r) => (['expired', 'inconsistent'].includes(r.reason) ? 'manifest' : r.reason === 'rollback' ? 'outdated' : 'integrity');

// ---------- Lanceur ----------
function launcherPath() {
  if (process.env.NEXORA_LAUNCHER_PATH && fs.existsSync(process.env.NEXORA_LAUNCHER_PATH)) return process.env.NEXORA_LAUNCHER_PATH;
  const base = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'NEXORA Devs Toolbox', 'NEXORA Devs Toolbox.exe') : '';
  return base && fs.existsSync(base) ? base : '';
}
// NEXORA ouvert sans le lanceur (double-clic sur NEXORA.exe) : le lanceur vérifie, met à jour, puis relance.
function viaLauncher(app) {
  if (!app.isPackaged || process.platform !== 'win32' || process.env.NEXORA_LAUNCHED_BY === 'nexora-devs-toolbox' || process.env.NEXORA_LICENCE_OFF === '1') return false;
  const l = launcherPath();
  if (!l) return false;
  spawn(l, process.argv.slice(1), { detached: true, stdio: 'ignore' }).unref();
  return true;
}
// Mise à jour : le lanceur télécharge, vérifie la signature et les empreintes, remplace, puis relance NEXORA.
function updateViaLauncher(app) {
  const l = launcherPath();
  if (!l) return false;
  spawn(l, ['--update'], { detached: true, stdio: 'ignore' }).unref();
  setTimeout(() => app.quit(), 400);
  return true;
}

function allowed(channel) {
  if (!ACTIVE() || state.status === 'ok' || OPEN_CHANNELS.has(channel)) return true;
  return !LOCKED_PREFIXES.some((p) => channel.startsWith(p));
}
function lockedError() {
  return new Error(state.status === 'offline' ? 'Connexion perdue : NEXORA a besoin d’Internet pour vérifier votre licence.' : ['integrity', 'manifest'].includes(state.status) ? 'Échec du contrôle d’intégrité — Installation non authentifiée.' : state.status === 'outdated' ? 'Version non autorisée : mettez NEXORA à jour.' : state.status === 'auth' ? 'Connectez-vous à votre compte NEXORA pour utiliser le logiciel.' : 'NEXORA est verrouillé tant que votre licence n’est pas validée.');
}

function setSession(c) {
  const next = c && c.token ? { token: c.token, url: String(c.url || '').replace(/\/+$/, ''), key: c.key, email: c.email || '' } : null;
  const changed = (next && next.token) !== (session && session.token);
  const user = (t) => { try { return JSON.parse(Buffer.from(String(t).split('.')[1], 'base64url').toString('utf8')).sub; } catch { return null; } };
  const otherUser = !next || !session || user(next.token) !== user(session.token);
  session = next;
  if (!opts) return;
  if (!next) { if (state.session_id) ping(true); set({ status: 'auth', reason: 'auth', message: 'Connectez-vous à votre compte NEXORA pour ouvrir le logiciel.', session_id: null, plan: null }); return; }
  if (changed && (otherUser || state.status !== 'ok')) check('connexion');
}

// Contrôle périodique : intervalle réglé dans le back office (politique des licences), 10 minutes par défaut.
function schedule(minutes) {
  const ms = Math.max(2, Math.min(120, Number(minutes) || 10)) * 60000;
  if (timer && timer.ms === ms) return;
  if (timer) clearInterval(timer.id);
  timer = { ms, id: setInterval(() => { if (state.status === 'ok' || session) check('périodique'); }, ms) };
}

function register(o) {
  opts = { ...o, fetch: o.fetch || ((u, x) => (o.net && o.net.fetch ? o.net.fetch(u, x) : fetch(u, x))) };
  const { ipcMain, app, shell } = opts;
  const k = keyFromArgs(process.argv);
  if (k) { try { storeKey(k); } catch { /* clé invalide : ignorée */ } }
  ipcMain.handle('license:state', () => publicState());
  ipcMain.handle('license:check', () => check('demande'));
  ipcMain.handle('license:key', (_e, key) => { const s = storeKey(key); check('clé'); return s; });
  ipcMain.handle('license:log', (_e, ev) => { if (ev && ev.event) log(ev.level || 'info', ev.event, ev.detail || {}); return true; });
  ipcMain.handle('license:open-site', (_e, hash = '') => shell.openExternal(hash ? `${SERVER}/${String(hash).replace(/^#?\/?/, '')}` : SITE_LICENCE));
  ipcMain.handle('license:repair', () => updateViaLauncher(app) || shell.openExternal(`${SERVER}/telecharger`));
  ipcMain.handle('license:quit', () => { app.quit(); return true; });
  // Lien nexora://licence?key=… reçu pendant que NEXORA est ouvert.
  app.on('second-instance', (_e, argv) => { const key = keyFromArgs(argv); if (key) { try { storeKey(key); check('lien'); } catch { /* */ } } });
  process.on('uncaughtException', (err) => log('error', 'erreur', { message: String(err && err.message || err).slice(0, 300) }));
  schedule(CHECK_EVERY / 60000);
  pingTimer = setInterval(() => ping(false), PING_EVERY);
  // Hors ligne : nouvel essai toutes les 30 secondes.
  setInterval(() => { if (['offline', 'server'].includes(state.status) && session) check('reprise'); }, 30000);
  app.on('before-quit', () => { log('info', 'fermeture'); ping(true); });
  // Premier contrôle dès que l'interface a transmis la session du compte (ou son absence), au plus tard après 6 s.
  setTimeout(() => { if (state.status === 'checking') check('démarrage'); }, 6000);
  void timer; void pingTimer;
}

module.exports = { register, setSession, allowed, lockedError, check, log, viaLauncher, updateViaLauncher, launcherPath, keyFromArgs, verifySigned, integrity, LOCKED_PREFIXES, SERVER, SITE_LICENCE, _state: () => state, _opts: (o) => { opts = o; },
  // Essais seulement (scripts/test-securite.mjs) : clés publiques d'essai, cache d'intégrité vidé.
  _keys: (k) => { LICENSE_KEY = k.license || LICENSE_KEY; RELEASE_KEY = k.release || RELEASE_KEY; integrityCache = null; } };
