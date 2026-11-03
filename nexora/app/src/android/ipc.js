'use strict';
/* Canaux IPC de l'App Builder (android:*). */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Toolchain, run, SDK_LICENSE_URL, TARGET_API } = require('./toolchain');
const { Keystores } = require('./keystore');
const { build, badging, PERMISSIONS, assetLinksJson } = require('./builder');
const pwa = require('./pwa');
const { techLog } = require('../plain');
const {
  PushKit, parseGoogleServices, parseServiceAccount, sendTest,
} = require('./push');

function register({
  ipcMain, app, dialog, shell, safeStorage, net, send, getWin,
}) {
  const home = process.env.VITRINE_ANDROID_HOME || path.join(app.getPath('userData'), 'android');
  const fetchImpl = (url, opts) => (net && net.fetch ? net.fetch(url, opts) : fetch(url, opts));
  const toolchain = new Toolchain({ home, fetch: fetchImpl, log: (l) => send('android:log', l) });
  // Mots de passe des clés protégés par le trousseau du système (DPAPI, Trousseau macOS, libsecret).
  const crypt = {
    available: false,
    encrypt: (v) => safeStorage.encryptString(String(v)).toString('base64'),
    decrypt: (b) => safeStorage.decryptString(Buffer.from(b, 'base64')),
  };
  const keystores = new Keystores({ dir: path.join(home, 'keys'), crypt: null });
  const cryptReady = !safeStorage ? Promise.resolve() : Promise.resolve(safeStorage.isAsyncEncryptionAvailable ? safeStorage.isAsyncEncryptionAvailable() : safeStorage.isEncryptionAvailable())
    .then((ok) => { if (ok) keystores.crypt = crypt; }).catch(() => {});
  const pushKit = new PushKit({
    home, fetch: fetchImpl, log: (l) => send('android:log', l),
    // Emplacement de repli trouvé automatiquement : retenu pour les prochaines fois.
    onBaseChanged: (d) => { try { fs.writeFileSync(pushLocFile, JSON.stringify({ dir: d, auto: true })); } catch { /* ignore */ } },
  });
  // Emplacement du kit choisi par l'utilisateur (conservé d'une session à l'autre).
  const pushLocFile = path.join(home, 'push-location.json');
  try { const j = JSON.parse(fs.readFileSync(pushLocFile, 'utf8')); if (j.dir && fs.existsSync(j.dir)) pushKit.setBase(j.dir); } catch { /* emplacement par défaut */ }
  let tools = null;
  let busy = false;
  const detect = async () => { tools = await toolchain.detect(); return tools; };

  ipcMain.handle('android:tools', async () => {
    const t = await detect();
    return {
      ...t, home, licenseUrl: SDK_LICENSE_URL, targetApi: TARGET_API, permissions: PERMISSIONS,
    };
  });

  // ---------------------------------------------------------------- notifications push
  const saDir = path.join(home, 'push', 'comptes');
  const saFile = (appId) => path.join(saDir, `${String(appId).replace(/[^\w.-]/g, '_')}.bin`);
  ipcMain.handle('android:push-status', async (_e, appId) => {
    const st = pushKit.status();
    return {
      ...st, serviceAccount: appId ? fs.existsSync(saFile(appId)) : false, dir: pushKit.base, customDir: pushKit.base !== pushKit.defaultBase,
    };
  });
  // Choisir où installer les composants du kit (dossier court, hors OneDrive / dossiers protégés).
  ipcMain.handle('android:push-kit-dir-pick', async () => {
    const r = await dialog.showOpenDialog(getWin(), { title: 'Dossier où installer le kit de notifications', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    let dir = r.filePaths[0];
    try { if (fs.readdirSync(dir).length) dir = path.join(dir, 'nexora-push'); } catch { /* dossier neuf */ }
    const w = await pushKit.checkWritable(dir);
    if (!w.ok) throw new Error(`Impossible d’écrire dans ce dossier (${w.code || w.error}). Choisis-en un autre, par exemple C:\\NEXORA-kit.`);
    pushKit.setBase(dir);
    fs.writeFileSync(pushLocFile, JSON.stringify({ dir }));
    return { ...pushKit.status(), dir, customDir: true };
  });
  ipcMain.handle('android:push-kit-dir-reset', () => {
    pushKit.setBase(null);
    try { fs.rmSync(pushLocFile, { force: true }); } catch { /* absent */ }
    return { ...pushKit.status(), dir: pushKit.base, customDir: false };
  });
  ipcMain.handle('android:push-install', async () => {
    if (busy) throw new Error('Une opération Android est déjà en cours.');
    busy = true;
    try {
      if (!tools || !tools.ready) await detect();
      return await pushKit.install(tools, (p) => send('android:progress', { part: 'push', label: p.label, progress: p.progress }));
    } finally { busy = false; }
  });
  ipcMain.handle('android:push-latest', async () => ({ latest: await pushKit.latestVersion(), ...pushKit.status() }));
  ipcMain.handle('android:push-parse', (_e, { text, appId }) => parseGoogleServices(text, appId));
  ipcMain.handle('android:push-sa-save', async (_e, { appId, text }) => {
    const sa = parseServiceAccount(text);
    if (!sa.ok) return sa;
    await cryptReady;
    fs.mkdirSync(saDir, { recursive: true });
    // La clé privée du compte de service est chiffrée par le trousseau du système quand il est disponible.
    const data = keystores.crypt ? `enc:${crypt.encrypt(JSON.stringify(sa.json))}` : `b64:${Buffer.from(JSON.stringify(sa.json)).toString('base64')}`;
    fs.writeFileSync(saFile(appId), data, { mode: 0o600 });
    return { ok: true, projectId: sa.projectId, email: sa.email };
  });
  ipcMain.handle('android:push-sa-remove', (_e, appId) => { fs.rmSync(saFile(appId), { force: true }); return true; });
  // ---------------------------------------------------------------- Google Play (publication)
  const play = require('./play');
  const playDir = path.join(home, 'play', 'comptes');
  const playFile = (appId) => path.join(playDir, `${String(appId).replace(/[^\w.-]/g, '_')}.bin`);
  const readSa = (file) => { const raw = fs.readFileSync(file, 'utf8'); return raw.startsWith('enc:') ? crypt.decrypt(raw.slice(4)) : Buffer.from(raw.slice(4), 'base64').toString('utf8'); };
  ipcMain.handle('android:play-status', (_e, appId) => ({ serviceAccount: fs.existsSync(playFile(appId)) }));
  ipcMain.handle('android:play-sa-save', async (_e, { appId, text }) => {
    const sa = parseServiceAccount(text);
    if (!sa.ok) return { ok: false, error: 'Ce fichier n’est pas une clé de compte de service Google Cloud (JSON).' };
    await cryptReady;
    fs.mkdirSync(playDir, { recursive: true });
    fs.writeFileSync(playFile(appId), keystores.crypt ? `enc:${crypt.encrypt(JSON.stringify(sa.json))}` : `b64:${Buffer.from(JSON.stringify(sa.json)).toString('base64')}`, { mode: 0o600 });
    return { ok: true };
  });
  ipcMain.handle('android:play-sa-remove', (_e, appId) => { fs.rmSync(playFile(appId), { force: true }); return true; });
  ipcMain.handle('android:play-check', async (_e, { appId }) => {
    if (!fs.existsSync(playFile(appId))) throw new Error('Importe d’abord la clé du compte de service Google Play.');
    return play.check({ serviceAccount: readSa(playFile(appId)), appId }, fetchImpl);
  });
  ipcMain.handle('android:play-publish', async (_e, opts) => {
    if (!fs.existsSync(playFile(opts.appId))) throw new Error('Importe d’abord la clé du compte de service Google Play.');
    return play.publish({ ...opts, serviceAccount: readSa(playFile(opts.appId)) }, fetchImpl, (label, progress) => send('android:step', { label, progress }));
  });

  // ---------------------------------------------------------------- centre de notifications : historique et envois programmés
  const notifDir = path.join(home, 'push', 'envois');
  const histFile = (appId) => path.join(notifDir, `${String(appId).replace(/[^\w.-]/g, '_')}.json`);
  const readHist = (appId) => { try { return JSON.parse(fs.readFileSync(histFile(appId), 'utf8')); } catch { return { sent: [], scheduled: [] }; } };
  const writeHist = (appId, h) => { fs.mkdirSync(notifDir, { recursive: true }); fs.writeFileSync(histFile(appId), JSON.stringify(h, null, 1)); };
  const sendNow = async (appId, msg) => {
    const raw = fs.readFileSync(saFile(appId), 'utf8');
    const json = raw.startsWith('enc:') ? crypt.decrypt(raw.slice(4)) : Buffer.from(raw.slice(4), 'base64').toString('utf8');
    return sendTest({ ...msg, appId, serviceAccount: json }, fetchImpl);
  };
  ipcMain.handle('android:notif-list', (_e, appId) => readHist(appId));
  ipcMain.handle('android:notif-schedule', (_e, { appId, msg, at }) => {
    const h = readHist(appId);
    h.scheduled.push({ id: Math.random().toString(36).slice(2, 10), msg, at: Number(at) });
    h.scheduled.sort((a, b) => a.at - b.at);
    writeHist(appId, h);
    return h;
  });
  ipcMain.handle('android:notif-cancel', (_e, { appId, id }) => { const h = readHist(appId); h.scheduled = h.scheduled.filter((x) => x.id !== id); writeHist(appId, h); return h; });
  // Les envois programmés partent tant que NEXORA est ouverte (vérification toutes les 30 s).
  setInterval(async () => {
    if (!fs.existsSync(notifDir)) return;
    for (const f of fs.readdirSync(notifDir).filter((x) => x.endsWith('.json'))) {
      const appId = f.slice(0, -5);
      const h = readHist(appId);
      const due = h.scheduled.filter((x) => x.at <= Date.now());
      if (!due.length) continue;
      h.scheduled = h.scheduled.filter((x) => x.at > Date.now());
      for (const d of due) {
        // eslint-disable-next-line no-await-in-loop
        const r = await sendNow(appId, d.msg).catch((e) => ({ ok: false, error: e.message }));
        h.sent.unshift({ ...d.msg, at: Date.now(), scheduled: d.at, ok: r.ok, error: r.ok ? undefined : r.error, topic: r.topic });
      }
      h.sent = h.sent.slice(0, 200);
      writeHist(appId, h);
      send('android:notif-changed', { appId });
    }
  }, 30000).unref();

  ipcMain.handle('android:push-test', async (_e, { appId, ...msg }) => {
    try {
      const raw = fs.readFileSync(saFile(appId), 'utf8');
      const json = raw.startsWith('enc:') ? crypt.decrypt(raw.slice(4)) : Buffer.from(raw.slice(4), 'base64').toString('utf8');
      const r = await sendTest({ ...msg, appId, serviceAccount: json }, fetchImpl);
      try { const h = readHist(appId); h.sent.unshift({ ...msg, at: Date.now(), ok: true, topic: r.topic }); h.sent = h.sent.slice(0, 200); writeHist(appId, h); } catch { /* historique facultatif */ }
      return r;
    } catch (e) { return { ok: false, error: e.code === 'ENOENT' ? 'Ajoute d’abord la clé du compte de service (étape « Envoyer un test »).' : e.message }; }
  });

  ipcMain.handle('android:install', async (_e, parts) => {
    if (busy) throw new Error('Une opération Android est déjà en cours.');
    busy = true;
    try {
      tools = await toolchain.install(parts, (p) => send('android:progress', p));
      return tools;
    } finally { busy = false; }
  });

  ipcMain.handle('android:build', async (_e, spec) => {
    if (busy) throw new Error('Une construction est déjà en cours.');
    await cryptReady;
    busy = true;
    try {
      if (!tools || !tools.ready) await detect();
      const outDir = spec.outDir || path.join(app.getPath('documents'), 'NEXORA', 'Applications', String(spec.appName || 'application').replace(/[<>:"/\\|?*]+/g, '-'));
      const images = {};
      for (const [k, v] of Object.entries(spec.images || {})) images[k] = Buffer.from(v);
      const sounds = {};
      for (const [k, v] of Object.entries(spec.sounds || {})) sounds[k] = Buffer.from(v);
      const r = await build({ ...spec, images, sounds, outDir }, {
        tools, keystores, fetch: fetchImpl, owner: spec.owner, pushKit,
        log: (l) => send('android:log', l),
        step: (label, progress) => send('android:step', { label, progress }),
      });
      if (r.apk) {
        try { r.badging = (await badging(tools, r.apk)).split('\n').slice(0, 3).join('\n'); } catch { /* résumé facultatif */ }
      }
      return r;
    } finally { busy = false; }
  });

  // ------------------------------------------------------------- clés de signature
  ipcMain.handle('android:key-info', async (_e, appId) => {
    await cryptReady;
    const k = keystores.info(appId);
    return k ? { file: k.file, alias: k.alias, sha256: k.sha256, sha1: k.sha1, created: k.created, imported: k.imported, validUntil: k.validUntil } : null;
  });
  ipcMain.handle('android:key-create', async (_e, { appId, owner }) => {
    await cryptReady;
    if (!tools || !tools.java) await detect();
    if (!tools.java) throw new Error('Java est nécessaire pour créer une clé (installe les outils Android).');
    if (keystores.info(appId)) throw new Error('Une clé existe déjà pour cette application.');
    const k = await keystores.create(appId, tools.java, owner);
    return { file: k.file, alias: k.alias, sha256: k.sha256, sha1: k.sha1 };
  });
  ipcMain.handle('android:key-import', async (_e, {
    appId, source, alias, storePass, keyPass,
  }) => {
    await cryptReady;
    if (!tools || !tools.java) await detect();
    if (!tools.java) throw new Error('Java est nécessaire pour importer une clé.');
    const k = await keystores.import(appId, tools.java, {
      source, alias, storePass, keyPass,
    });
    return { file: k.file, alias: k.alias, sha256: k.sha256, sha1: k.sha1 };
  });
  ipcMain.handle('android:key-export', async (_e, appId) => {
    await cryptReady;
    const k = keystores.info(appId);
    if (!k) throw new Error('Aucune clé pour cette application.');
    const r = await dialog.showSaveDialog(getWin(), {
      title: 'Exporter la clé de signature', defaultPath: path.join(app.getPath('documents'), path.basename(k.file)),
      filters: [{ name: 'Clé de signature', extensions: [path.extname(k.file).slice(1) || 'jks'] }],
    });
    if (r.canceled || !r.filePath) return null;
    fs.copyFileSync(k.file, r.filePath);
    const pass = keystores.password(k);
    const keyPass = keystores.keyPassword(k);
    const note = `Clé de signature de ${appId}\n\nFichier : ${path.basename(r.filePath)}\nAlias : ${k.alias}\nMot de passe du fichier : ${pass}\nMot de passe de la clé : ${keyPass}\nSHA-256 : ${k.sha256}\nSHA-1 : ${k.sha1}\n\nConserve ce fichier et ces mots de passe en lieu sûr : sans eux, tu ne pourras plus publier de mise à jour de l'application.\n`;
    fs.writeFileSync(`${r.filePath}.txt`, note);
    return { file: r.filePath };
  });

  // ------------------------------------------------------------- appareils (adb)
  const adb = () => (tools && tools.platformTools && tools.platformTools.adb) || null;
  ipcMain.handle('android:devices', async () => {
    if (!tools) await detect();
    if (!adb()) return { adb: false, devices: [] };
    const r = await run(adb(), ['devices', '-l']);
    const devices = r.stdout.split('\n').slice(1).map((l) => l.trim()).filter(Boolean).map((l) => {
      const [serial, state, ...rest] = l.split(/\s+/);
      const model = (rest.find((x) => x.startsWith('model:')) || '').slice(6).replace(/_/g, ' ');
      return { serial, state, model: model || serial };
    });
    return { adb: true, devices };
  });
  ipcMain.handle('android:install-apk', async (_e, { serial, apk, appId, launch }) => {
    if (!adb()) throw new Error("L'installation sur téléphone n'est pas encore prête : installe les outils Android.");
    const r = await run(adb(), ['-s', serial, 'install', '-r', '-d', apk]);
    if (r.code || !/Success/.test(r.stdout)) throw new Error((r.stdout + r.stderr).trim().split('\n').slice(-3).join(' ') || "L'installation a échoué.");
    if (launch && appId) await run(adb(), ['-s', serial, 'shell', 'monkey', '-p', appId, '-c', 'android.intent.category.LAUNCHER', '1']);
    return true;
  });

  // Test réel sur un téléphone branché en USB : installation, ouverture, surveillance pendant quelques secondes,
  // puis lecture du journal d'Android pour expliquer un éventuel plantage.
  ipcMain.handle('android:test-run', async (_e, { serial, apk, appId, seconds = 15 }) => {
    if (!adb()) throw new Error("L'installation sur téléphone n'est pas encore prête : installe les outils Android.");
    const A = (args, o) => run(adb(), ['-s', serial, ...args], o);
    const prop = async (k) => ((await A(['shell', 'getprop', k])).stdout || '').trim();
    const device = { model: await prop('ro.product.model'), brand: await prop('ro.product.brand'), release: await prop('ro.build.version.release'), sdk: Number(await prop('ro.build.version.sdk')) || 0 };
    await A(['logcat', '-c']);
    const inst = await A(['install', '-r', '-d', apk]);
    if (inst.code || !/Success/.test(inst.stdout)) {
      const out = `${inst.stdout}${inst.stderr}`;
      techLog('telephone', out);
      const why = /INSTALL_FAILED_UPDATE_INCOMPATIBLE|signatures do not match/i.test(out) ? "Une version signée avec une autre clé est déjà installée : désinstalle l'ancienne application du téléphone, puis recommence."
        : /INSTALL_FAILED_OLDER_SDK/i.test(out) ? `Ce téléphone (Android ${device.release}) est trop ancien : il faut Android 7 ou plus.`
          : /INSUFFICIENT_STORAGE/i.test(out) ? "Pas assez d'espace libre sur le téléphone."
            : /INSTALL_FAILED_VERSION_DOWNGRADE/i.test(out) ? 'Une version plus récente est installée : augmente le numéro de version ou désinstalle-la.'
              : /USER_RESTRICTED|INSTALL_CANCELED_BY_USER/i.test(out) ? "Le téléphone a refusé l'installation : autorise « Installer via USB » dans les options pour les développeurs."
                : "L'installation a été refusée par le téléphone.";
      return { ok: false, stage: 'install', device, message: why };
    }
    await A(['shell', 'monkey', '-p', appId, '-c', 'android.intent.category.LAUNCHER', '1']);
    let alive = false; let died = false; let firstPid = '';
    const t0 = Date.now();
    while (Date.now() - t0 < seconds * 1000) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 1000));
      // eslint-disable-next-line no-await-in-loop
      const pid = ((await A(['shell', 'pidof', appId])).stdout || '').trim();
      if (pid) { alive = true; if (!firstPid) firstPid = pid; else if (pid !== firstPid) died = true; } else if (alive) died = true;
    }
    const running = Boolean(((await A(['shell', 'pidof', appId])).stdout || '').trim());
    const log = (await A(['logcat', '-d', '-v', 'brief'], { maxBuffer: 32e6 })).stdout || '';
    const lines = log.split('\n');
    const fatal = [];
    for (let i = 0; i < lines.length; i++) {
      if (/FATAL EXCEPTION|AndroidRuntime.*Process: /.test(lines[i]) || (/E\/AndroidRuntime/.test(lines[i]) && fatal.length)) fatal.push(lines[i].replace(/^E\/AndroidRuntime\(\s*\d+\):\s?/, ''));
    }
    const appLines = lines.filter((l) => l.includes(appId) || /NEXORA|Vitrine|chromium|WebView|AndroidRuntime/.test(l)).filter((l) => /^[EWF]\//.test(l)).slice(-60);
    techLog('telephone', `${device.brand} ${device.model} Android ${device.release}\n${fatal.join('\n')}\n---\n${appLines.join('\n')}`);
    const crash = fatal.join('\n');
    const exc = (/([\w.$]+(?:Exception|Error))(?::\s*([^\n]*))?/.exec(crash) || []);
    const known = [
      [/Canvas: trying to draw too large/i, 'Une image (logo, écran de démarrage ou d’accueil) est trop grande pour ce téléphone : réduis-la et reconstruis.'],
      [/OutOfMemoryError/i, 'Le téléphone manque de mémoire : réduis la taille des images intégrées et ferme d’autres applications.'],
      [/MissingWebViewPackage|No WebView installed|WebView.*not installed/i, 'Le composant « Android System WebView » est absent ou désactivé sur ce téléphone : active-le ou mets-le à jour depuis le Play Store.'],
      [/SecurityException.*RECEIVER_(NOT_)?EXPORTED/i, 'Fonction incompatible avec Android 14 : mets NEXORA à jour puis reconstruis l’application.'],
      [/ClassNotFoundException|NoClassDefFoundError/i, 'Une partie du code de l’application est manquante : reconstruis l’application (si les notifications push sont activées, prépare à nouveau leur kit).'],
      [/FirebaseApp|google_app_id|Firebase/i, 'Configuration des notifications push incorrecte : vérifie le fichier google-services.json (il doit correspondre à l’identifiant de l’application).'],
      [/Resources\$NotFoundException/i, 'Une ressource (image, icône) est introuvable : reconstruis l’application.'],
      [/NetworkOnMainThread/i, 'Opération réseau bloquante au démarrage.'],
    ];
    const cause = (known.find(([re]) => re.test(crash)) || [])[1] || '';
    const crashed = Boolean(crash) || (died && !running) || !alive;
    return {
      ok: !crashed, stage: 'run', device, running, crashed, seconds,
      message: crashed ? (cause || (alive ? "L'application s'est fermée pendant le test." : "L'application ne s'est pas ouverte.")) : `L'application tourne normalement depuis ${seconds} s.`,
      exception: exc[1] || '', detail: crash ? crash.split('\n').slice(0, 25).join('\n') : appLines.slice(-15).join('\n'),
    };
  });

  // ------------------------------------------------------------- sauvegarde / restauration
  // Un seul fichier protégé par mot de passe : réglages de NEXORA (applications, scènes, présentations…)
  // et clés de signature des applications avec leurs mots de passe (indispensables pour publier les mises à jour).
  // Les clés d'IA, jetons GitHub et clés de comptes de service ne sont pas inclus : on les saisit à nouveau.
  const zlib = require('zlib');
  const nodeCrypto = require('crypto');
  const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
  const seal = (obj, password) => {
    const salt = nodeCrypto.randomBytes(16); const iv = nodeCrypto.randomBytes(12);
    const key = nodeCrypto.scryptSync(String(password), salt, 32, { N: 16384 });
    const c = nodeCrypto.createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([c.update(zlib.gzipSync(Buffer.from(JSON.stringify(obj)))), c.final()]);
    return Buffer.concat([Buffer.from('VTBK1'), salt, iv, c.getAuthTag(), body]);
  };
  const unseal = (buf, password) => {
    if (buf.slice(0, 5).toString() !== 'VTBK1') throw new Error("Ce fichier n'est pas une sauvegarde de NEXORA.");
    const salt = buf.slice(5, 21); const iv = buf.slice(21, 33); const tag = buf.slice(33, 49);
    const key = nodeCrypto.scryptSync(String(password), salt, 32, { N: 16384 });
    const d = nodeCrypto.createDecipheriv('aes-256-gcm', key, iv);
    d.setAuthTag(tag);
    try { return JSON.parse(zlib.gunzipSync(Buffer.concat([d.update(buf.slice(49)), d.final()])).toString('utf8')); } catch { throw new Error('Mot de passe incorrect, ou fichier abîmé.'); }
  };
  ipcMain.handle('backup:create', async (_e, { password }) => {
    if (!password || String(password).length < 6) throw new Error('Choisis un mot de passe d’au moins 6 caractères.');
    const r = await dialog.showSaveDialog(getWin(), { title: 'Enregistrer la sauvegarde de NEXORA', defaultPath: path.join(app.getPath('documents'), `Sauvegarde NEXORA ${new Date().toISOString().slice(0, 10)}.nexora-backup`), filters: [{ name: 'Sauvegarde NEXORA', extensions: ['nexora-backup'] }] });
    if (r.canceled || !r.filePath) return null;
    let settings = {};
    try { settings = JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); } catch { /* aucun réglage */ }
    const keys = [];
    const kdir = path.join(home, 'keys');
    for (const f of fs.existsSync(kdir) ? fs.readdirSync(kdir) : []) {
      if (!f.endsWith('.json')) continue;
      const appId = f.slice(0, -5);
      const m = keystores.info(appId);
      if (!m) continue;
      let pass = '';
      try { pass = keystores.password(m); } catch { continue; }
      let keyPass = '';
      if (m.keyPassSeparate) { try { keyPass = keystores.keyPassword(m); } catch { /* illisible */ } }
      const meta = { ...m }; delete meta.file; delete meta.passEnc; delete meta.pass; delete meta.keyPassEnc; delete meta.keyPass;
      keys.push({ appId, meta, pass, keyPass, ext: path.extname(m.file) || '.p12', p12: fs.readFileSync(m.file).toString('base64') });
    }
    fs.writeFileSync(r.filePath, seal({ v: 1, created: new Date().toISOString(), settings, keys }, password));
    return { file: r.filePath, apps: (settings.android && settings.android.apps || []).length, keys: keys.length };
  });
  ipcMain.handle('backup:restore', async (_e, { password }) => {
    const r = await dialog.showOpenDialog(getWin(), { title: 'Restaurer une sauvegarde de NEXORA', filters: [{ name: 'Sauvegarde NEXORA', extensions: ['nexora-backup', 'vitrine-backup'] }], properties: ['openFile'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const data = unseal(fs.readFileSync(r.filePaths[0]), password);
    // Réglages actuels gardés à côté, au cas où.
    try { fs.copyFileSync(settingsPath(), `${settingsPath()}.avant-restauration`); } catch { /* premier lancement */ }
    if (data.settings) fs.writeFileSync(settingsPath(), JSON.stringify(data.settings));
    let n = 0;
    for (const k of data.keys || []) {
      if (keystores.info(k.appId)) continue; // une clé existante n'est jamais écrasée
      const file = k.ext === '.p12' && !k.meta.imported ? keystores.file(k.appId) : path.join(keystores.dir, `${k.appId}-importee${k.ext}`);
      fs.writeFileSync(file, Buffer.from(k.p12, 'base64'));
      keystores.save(k.appId, { ...k.meta, file }, k.pass);
      if (k.keyPass) keystores.saveKeyPassword(k.appId, k.keyPass);
      n += 1;
    }
    return { ok: true, keys: n };
  });

  // ------------------------------------------------------------- source de l'application
  ipcMain.handle('android:pick-dir', async (_e, title) => {
    const r = await dialog.showOpenDialog(getWin(), { title: title || 'Choisir un dossier', properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('android:pick-out', async (_e, def) => {
    const r = await dialog.showOpenDialog(getWin(), { title: "Dossier d'enregistrement", defaultPath: def, properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('android:inspect-dir', (_e, dir) => inspectDir(dir));
  ipcMain.handle('android:build-web', async (_e, dir) => buildWeb(dir, (l) => send('android:log', l)));
  ipcMain.handle('android:default-out', (_e, name) => path.join(app.getPath('documents'), 'NEXORA', 'Applications', String(name || 'application').replace(/[<>:"/\\|?*]+/g, '-')));
  ipcMain.handle('android:reveal', (_e, file) => shell.showItemInFolder(file));
  // Inspection PWA (comme PWABuilder) et génération des fichiers manquants.
  ipcMain.handle('android:pwa-inspect', (_e, url) => pwa.inspect(url));
  ipcMain.handle('android:pwa-sw', (_e, { strategy, version, precache }) => ({ sw: pwa.serviceWorker(strategy, { version, precache }), strategies: pwa.SW_STRATEGIES }));
  ipcMain.handle('android:pwa-pack', async (_e, opts) => {
    const r = await dialog.showOpenDialog(getWin(), { title: 'Dossier où enregistrer les fichiers PWA', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const dir = path.join(r.filePaths[0], 'pwa');
    let assetlinks = null;
    if (opts.appId) {
      const k = keystores.info(opts.appId);
      if (k && k.sha256) assetlinks = assetLinksJson(opts.appId, [k.sha256]);
    }
    pwa.writePack(dir, {
      manifest: opts.manifest, sw: pwa.serviceWorker(opts.strategy, { version: opts.version }), offline: pwa.offlinePage(opts.offline || {}), icons: Object.fromEntries(Object.entries(opts.icons || {}).map(([k, v]) => [k, Uint8Array.from(v)])), assetlinks, theme: opts.manifest && opts.manifest.theme_color,
    });
    shell.showItemInFolder(path.join(dir, 'manifest.json'));
    return dir;
  });
  // Génère les fichiers PWA dans une COPIE du projet (l'original n'est pas touché), balises injectées dans les pages.
  ipcMain.handle('android:pwa-inject', async (_e, opts) => {
    const src = opts.dir;
    if (!src || !fs.existsSync(src)) throw new Error('Dossier du projet introuvable.');
    const base = `${path.basename(src)} (PWA)`;
    let dest = path.join(path.dirname(src), base);
    let n = 2;
    while (fs.existsSync(dest)) { dest = path.join(path.dirname(src), `${base} ${n}`); n += 1; }
    let assetlinks = null;
    if (opts.appId) { const k = keystores.info(opts.appId); if (k && k.sha256) assetlinks = assetLinksJson(opts.appId, [k.sha256]); }
    const pack = {
      manifest: opts.manifest, sw: pwa.serviceWorker(opts.strategy, { version: opts.version }), offline: pwa.offlinePage(opts.offline || {}),
      icons: Object.fromEntries(Object.entries(opts.icons || {}).map(([k, v]) => [k, Uint8Array.from(v)])), assetlinks, theme: opts.manifest && opts.manifest.theme_color,
    };
    const r = pwa.injectProject(src, dest, pack);
    return r;
  });
  // Image distante (icône d'un manifest) en data URL.
  ipcMain.handle('android:fetch-image', async (_e, url) => {
    const r = await fetchImpl(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 8e6) throw new Error('Image trop lourde');
    const type = r.headers.get('content-type') || (/\.svg$/i.test(url) ? 'image/svg+xml' : 'image/png');
    return `data:${type.split(';')[0]};base64,${buf.toString('base64')}`;
  });
  // Icônes des onglets (mêmes tracés que dans l'application) pour l'aperçu et le choix d'icône.
  ipcMain.handle('android:tab-icons', () => {
    const dir = path.join(__dirname, '..', '..', 'android', 'templates', 'drawable');
    const out = {};
    for (const f of fs.readdirSync(dir)) {
      const m = /^vt_tab_([a-z]+)\.xml$/.exec(f);
      if (!m) continue;
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      out[m[1]] = [...src.matchAll(/<path([^>]*)\/>/g)].map((p) => {
        const attr = (n) => (new RegExp(`android:${n}="([^"]*)"`).exec(p[1]) || [])[1];
        const fill = attr('fillColor');
        return { d: attr('pathData'), fill: Boolean(fill && !/^#00/.test(fill)), stroke: Boolean(attr('strokeColor')), width: Number(attr('strokeWidth')) || 1.8 };
      });
    }
    return out;
  });
}

const BUILD_DIRS = ['dist', 'build', 'out', 'www', 'public', 'docs', '.output/public', 'build/web', 'dist/browser'];

/** Dossier web construit : index.html à la racine ou dans un sous-dossier habituel. */
function inspectDir(dir) {
  if (!dir || !fs.existsSync(dir)) return { ok: false };
  const has = (d) => fs.existsSync(path.join(d, 'index.html'));
  let pkg = null;
  try { pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch { /* pas de projet Node */ }
  const flutter = fs.existsSync(path.join(dir, 'pubspec.yaml'));
  const candidates = BUILD_DIRS.map((d) => path.join(dir, d)).filter(has);
  const www = candidates[0] || (has(dir) && !pkg ? dir : null);
  return {
    ok: true, dir, www, candidates, canBuild: Boolean((pkg && pkg.scripts && pkg.scripts.build) || flutter), flutter, name: (pkg && (pkg.productName || pkg.name)) || path.basename(dir),
  };
}

function buildWeb(dir, log) {
  const flutter = fs.existsSync(path.join(dir, 'pubspec.yaml'));
  const cmd = flutter ? 'flutter' : (fs.existsSync(path.join(dir, 'pnpm-lock.yaml')) ? 'pnpm' : fs.existsSync(path.join(dir, 'yarn.lock')) ? 'yarn' : 'npm');
  const args = flutter ? ['build', 'web', '--release'] : ['run', 'build'];
  log(`> ${cmd} ${args.join(' ')}`);
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: dir, shell: process.platform === 'win32', env: { ...process.env, BROWSER: 'none', CI: '1' } });
    const out = (d) => String(d).split('\n').filter(Boolean).forEach((l) => log(l));
    p.stdout.on('data', out);
    p.stderr.on('data', out);
    p.on('error', (e) => reject(new Error(`${cmd} introuvable : ${e.message}`)));
    p.on('close', (code) => {
      if (code) reject(new Error(`La construction du projet a échoué (code ${code}).`));
      else resolve(inspectDir(dir));
    });
  });
}

module.exports = { register, inspectDir };
