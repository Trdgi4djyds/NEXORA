'use strict';
/* NEXORA #048 — Audit des applications créées avec NEXORA (ou ailleurs) :
 *  - APK Android : manifeste binaire décodé (débogable, trafic en clair, sauvegarde, composants exportés,
 *    permissions sensibles, versions d'Android), signature (schéma v1/v2, clé de débogage) ;
 *  - projet Electron (Desktop Builder ou autre) : isolation du contexte, intégration de Node, bac à sable,
 *    webSecurity, ouverture de liens, navigation, CSP, version d'Electron, signature, fusibles, archive asar.
 * Lecture seule. */
const fs = require('fs');
const path = require('path');
const { collector, finish } = require('./util');
const { walk } = require('./lockfiles');

// ---------- Manifeste Android binaire (AXML) ----------
const ATTR_IDS = {
  0x01010003: 'name', 0x01010006: 'permission', 0x0101000f: 'debuggable', 0x01010010: 'exported', 0x01010280: 'allowBackup',
  0x010104ec: 'usesCleartextTraffic', 0x0101020c: 'minSdkVersion', 0x01010270: 'targetSdkVersion', 0x01010527: 'networkSecurityConfig',
  0x0101021b: 'versionCode', 0x0101021c: 'versionName', 0x01010018: 'authorities', 0x0101001b: 'grantUriPermissions',
};

function readStringPool(buf, off) {
  const count = buf.readUInt32LE(off + 8);
  const flags = buf.readUInt32LE(off + 16);
  const stringsStart = buf.readUInt32LE(off + 20);
  const utf8 = (flags & 0x100) !== 0;
  const headerSize = buf.readUInt16LE(off + 2);
  const strings = [];
  for (let i = 0; i < count; i++) {
    let p = off + stringsStart + buf.readUInt32LE(off + headerSize + i * 4);
    if (utf8) {
      let n = buf[p++]; if (n & 0x80) p++;
      let len = buf[p++]; if (len & 0x80) { len = ((len & 0x7f) << 8) | buf[p++]; }
      strings.push(buf.toString('utf8', p, p + len));
    } else {
      let len = buf.readUInt16LE(p); p += 2;
      if (len & 0x8000) { len = ((len & 0x7fff) << 16) | buf.readUInt16LE(p); p += 2; }
      strings.push(buf.toString('utf16le', p, p + len * 2));
    }
  }
  return strings;
}

function parseAxml(buf) {
  if (buf.readUInt16LE(0) !== 0x0003) throw new Error('Manifeste Android illisible.');
  let strings = [];
  let resIds = [];
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  let off = buf.readUInt16LE(2);
  while (off + 8 <= buf.length) {
    const type = buf.readUInt16LE(off);
    const size = buf.readUInt32LE(off + 4);
    if (!size) break;
    if (type === 0x0001) strings = readStringPool(buf, off);
    else if (type === 0x0180) { resIds = []; for (let p = off + 8; p < off + size; p += 4) resIds.push(buf.readUInt32LE(p)); }
    else if (type === 0x0102) {
      const nameIdx = buf.readUInt32LE(off + 20);
      const attrStart = buf.readUInt16LE(off + 24);
      const attrSize = buf.readUInt16LE(off + 26);
      const attrCount = buf.readUInt16LE(off + 28);
      const el = { tag: strings[nameIdx], attrs: {}, children: [] };
      for (let i = 0; i < attrCount; i++) {
        const a = off + 16 + attrStart + i * attrSize;
        const n = buf.readUInt32LE(a + 4);
        const raw = buf.readInt32LE(a + 8);
        const dataType = buf[a + 15];
        const data = buf.readUInt32LE(a + 16);
        const name = ATTR_IDS[resIds[n]] || strings[n] || `attr${n}`;
        let value;
        if (raw >= 0 && strings[raw] != null) value = strings[raw];
        else if (dataType === 0x12) value = data !== 0;
        else if (dataType === 0x10 || dataType === 0x11) value = data | 0;
        else if (dataType === 0x03) value = strings[data];
        else if (dataType === 0x01) value = `@0x${data.toString(16)}`;
        else value = data;
        el.attrs[name] = value;
      }
      stack[stack.length - 1].children.push(el);
      stack.push(el);
    } else if (type === 0x0103) { if (stack.length > 1) stack.pop(); }
    off += size;
  }
  return root.children[0] || root;
}

function find(el, tag, out = []) {
  for (const c of el.children || []) { if (c.tag === tag) out.push(c); find(c, tag, out); }
  return out;
}

function readZip(file) {
  const yauzl = require('yauzl');
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, autoClose: true }, (err, zip) => {
      if (err) { reject(new Error('Fichier APK illisible (archive invalide).')); return; }
      const entries = {};
      const names = [];
      zip.on('entry', (e) => {
        names.push(e.fileName);
        const want = e.fileName === 'AndroidManifest.xml' || /^META-INF\/[^/]+\.(RSA|DSA|EC)$/i.test(e.fileName);
        if (!want) { zip.readEntry(); return; }
        zip.openReadStream(e, (er, st) => {
          if (er) { zip.readEntry(); return; }
          const parts = [];
          st.on('data', (d) => parts.push(d));
          st.on('end', () => { entries[e.fileName] = Buffer.concat(parts); zip.readEntry(); });
          st.on('error', () => zip.readEntry());
        });
      });
      zip.on('end', () => resolve({ entries, names }));
      zip.on('error', () => reject(new Error('Fichier APK illisible.')));
      zip.readEntry();
    });
  });
}

function hasV2Block(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const magic = Buffer.from('APK Sig Block 42');
    const chunk = 1 << 20;
    for (let pos = Math.max(0, size - 64 * chunk); pos < size; pos += chunk - magic.length) {
      const b = Buffer.alloc(Math.min(chunk, size - pos));
      fs.readSync(fd, b, 0, b.length, pos);
      if (b.includes(magic)) return true;
    }
    return false;
  } finally { fs.closeSync(fd); }
}

const DANGEROUS = {
  READ_SMS: 'lire vos SMS', SEND_SMS: 'envoyer des SMS', RECEIVE_SMS: 'recevoir les SMS', READ_CONTACTS: 'lire les contacts', WRITE_CONTACTS: 'modifier les contacts',
  RECORD_AUDIO: 'enregistrer le micro', CAMERA: 'utiliser l’appareil photo', ACCESS_FINE_LOCATION: 'position précise', ACCESS_BACKGROUND_LOCATION: 'position en arrière-plan',
  READ_CALL_LOG: 'journal d’appels', READ_PHONE_STATE: 'état du téléphone', READ_EXTERNAL_STORAGE: 'lire les fichiers', WRITE_EXTERNAL_STORAGE: 'écrire les fichiers',
  MANAGE_EXTERNAL_STORAGE: 'accès à tous les fichiers', REQUEST_INSTALL_PACKAGES: 'installer des applications', SYSTEM_ALERT_WINDOW: 's’afficher par-dessus les autres applications',
  QUERY_ALL_PACKAGES: 'voir toutes les applications installées', READ_MEDIA_IMAGES: 'lire les photos', BODY_SENSORS: 'capteurs corporels',
};

async function auditApk(file) {
  const { findings, add } = collector();
  const { entries, names } = await readZip(file);
  if (!entries['AndroidManifest.xml']) throw new Error('Ce fichier n’est pas une application Android (manifeste absent).');
  const m = parseAxml(entries['AndroidManifest.xml']);
  const app = find(m, 'application')[0] || { attrs: {}, children: [] };
  const sdk = find(m, 'uses-sdk')[0] || { attrs: {} };
  const minSdk = Number(sdk.attrs.minSdkVersion) || 0;
  const targetSdk = Number(sdk.attrs.targetSdkVersion) || minSdk;
  const info = { package: m.attrs.package || '', versionName: m.attrs.versionName || '', versionCode: m.attrs.versionCode || '', minSdk, targetSdk, permissions: [], components: 0, abis: [...new Set(names.filter((n) => n.startsWith('lib/')).map((n) => n.split('/')[1]))] };
  if (app.attrs.debuggable === true) add('critical', 'Configuration', 'Application débogable', 'N’importe qui peut brancher un débogueur, lire les données de l’application et exécuter du code dans son contexte. Le Play Store refuse ces APK.', 'Construisez une version « release » (android:debuggable absent ou false).', { who: 'vous' });
  if (app.attrs.usesCleartextTraffic === true) add(app.attrs.networkSecurityConfig ? 'medium' : 'high', 'Réseau', 'Trafic non chiffré autorisé (HTTP)', 'L’application peut échanger des données en clair, lisibles et modifiables sur un Wi-Fi public.', 'Passez toutes les adresses en HTTPS et retirez usesCleartextTraffic (ou limitez-le à des domaines précis dans network_security_config).', { who: 'vous' });
  else if (targetSdk && targetSdk < 28 && !app.attrs.networkSecurityConfig) add('medium', 'Réseau', 'Trafic en clair permis par défaut', `Avec une version cible d’Android ${targetSdk} (< 28), le HTTP non chiffré reste autorisé.`, 'Monte targetSdkVersion à 34 ou plus (exigence du Play Store).', { who: 'vous' });
  if (app.attrs.allowBackup === true || (app.attrs.allowBackup === undefined && targetSdk < 31)) add('low', 'Données', 'Sauvegarde des données autorisée', 'Les données de l’application (jetons de connexion…) peuvent être copiées par une sauvegarde ADB.', 'Mettez android:allowBackup="false", ou exclus les fichiers sensibles (dataExtractionRules).', { who: 'vous' });
  if (targetSdk && targetSdk < 34) add('medium', 'Configuration', `Version cible d’Android ancienne (${targetSdk})`, 'Le Play Store exige une version cible récente pour les nouvelles applications et les mises à jour ; les protections récentes d’Android ne s’appliquent pas.', 'Monte targetSdkVersion à 34 ou plus et reconstruis.', { who: 'vous' });
  if (minSdk && minSdk < 23) add('low', 'Configuration', `Android ${minSdk} encore accepté`, 'Les versions d’Android antérieures à 6.0 ne reçoivent plus de correctifs de sécurité.', 'Montez minSdkVersion à 23 ou plus si vos utilisateurs le permettent.', { who: 'vous' });
  for (const p of find(m, 'uses-permission')) {
    const name = String(p.attrs.name || '');
    info.permissions.push(name);
    const short = name.replace(/^android\.permission\./, '');
    if (DANGEROUS[short]) add(/SMS|CALL_LOG|MANAGE_EXTERNAL|INSTALL_PACKAGES|BACKGROUND_LOCATION|QUERY_ALL/.test(short) ? 'medium' : 'info', 'Permissions', `Permission sensible : ${short}`, `Elle permet de ${DANGEROUS[short]}. Le Play Store demande une justification pour certaines, et les utilisateurs s’en méfient.`, 'Retirez-la si l’application n’en a pas un besoin essentiel.', { who: 'vous' });
  }
  for (const tag of ['activity', 'activity-alias', 'service', 'receiver', 'provider']) {
    for (const c of find(app, tag)) {
      info.components += 1;
      const filters = find(c, 'intent-filter');
      const launcher = filters.some((f) => find(f, 'category').some((x) => /LAUNCHER/.test(String(x.attrs.name))));
      const exported = c.attrs.exported === true || (c.attrs.exported === undefined && filters.length > 0 && targetSdk < 31);
      if (!exported || launcher || c.attrs.permission) continue;
      const nm = String(c.attrs.name || tag).replace(/^.*\./, '');
      if (tag === 'provider') add('high', 'Composants', `Fournisseur de contenu exporté : ${nm}`, 'D’autres applications du téléphone peuvent lire ou modifier ses données.', 'Mettez android:exported="false" ou protège-le par une permission.', { who: 'vous' });
      else if (filters.some((f) => find(f, 'data').some((d) => /^https?$/.test(String(d.attrs.scheme || ''))))) continue; // lien profond web : attendu
      else add('low', 'Composants', `Composant exporté sans permission : ${nm} (${tag})`, 'D’autres applications peuvent le lancer : vérifiez qu’il ne fait rien de sensible sans contrôle.', 'Mettez android:exported="false" s’il n’a pas à être appelé de l’extérieur.', { who: 'vous' });
    }
  }
  const certs = Object.keys(entries).filter((n) => /^META-INF\//.test(n));
  const v2 = hasV2Block(file);
  info.signature = { v1: certs.length > 0, v2 };
  if (!certs.length && !v2) add('high', 'Signature', 'Application non signée', 'Android refuse d’installer une application non signée.', 'Signez l’APK avec votre clé de publication (App Builder → Construire).', { who: 'vous' });
  else {
    if (!v2) add('medium', 'Signature', 'Signature ancienne seulement (schéma v1)', 'Le schéma v1 protège moins bien l’intégrité du fichier ; Android 11+ demande le schéma v2 pour cibler les versions récentes.', 'Signe avec apksigner (schémas v2 et v3).', { who: 'vous' });
    if (certs.some((n) => entries[n].includes(Buffer.from('Android Debug')))) add('high', 'Signature', 'Signée avec la clé de débogage', 'Cette clé est la même sur tous les ordinateurs de développement : le Play Store refuse l’application et n’importe qui peut publier une fausse mise à jour.', 'Signe avec votre propre clé de publication et gardez-la en lieu sûr.', { who: 'vous' });
  }
  return finish(findings, { kind: 'app', target: file, file, name: path.basename(file), app: 'android', info });
}

// ---------- Projet Electron ----------
const ELECTRON_MIN = 43; // les trois dernières versions majeures reçoivent les correctifs (NEXORA utilise Electron 45)

async function auditElectron(dir) {
  const { findings, add } = collector();
  let pkg = {};
  try { pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch { throw new Error('package.json introuvable : choisissez le dossier d’un projet Electron.'); }
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  if (!deps.electron && !fs.existsSync(path.join(dir, 'node_modules', 'electron'))) throw new Error('Ce projet n’utilise pas Electron.');
  const range = String(deps.electron || '');
  const major = Number((/(\d+)/.exec(range) || [])[1] || 0);
  const info = { name: pkg.productName || pkg.name || path.basename(dir), version: pkg.version || '', electron: range, files: 0 };
  if (major && major < ELECTRON_MIN) add('high', 'Electron', `Electron ${major} n’est plus mis à jour`, 'Seules les trois dernières versions majeures d’Electron reçoivent les correctifs de sécurité de Chromium.', `Passez à Electron ${ELECTRON_MIN} ou plus (npm install electron@latest), puis reteste.`, { who: 'vous' });
  const files = walk(dir, { max: 6000 }).filter((f) => /\.(c|m)?(j|t)sx?$/.test(f) && !/\.min\.js$|(^|\/)(node_modules|dist|out|release|build)\//.test(f));
  info.files = files.length;
  const html = walk(dir, { max: 6000 }).filter((f) => /\.html?$/.test(f) && !/(^|\/)(node_modules|dist|out|release)\//.test(f));
  const all = [];
  for (const f of files.slice(0, 3000)) { try { const t = fs.readFileSync(path.join(dir, f), 'utf8'); if (t.length < 2000000) all.push([f, t]); } catch { /* */ } }
  const where = (re) => all.filter(([, t]) => re.test(t)).map(([f]) => f);
  const flag = (re, sev, title, detail, fix) => { const w = where(re); if (w.length) add(sev, 'Fenêtres', title, `${detail} Fichier(s) : ${w.slice(0, 4).join(', ')}.`, fix, { who: 'vous', file: w[0] }); };
  const usesBW = where(/new\s+BrowserWindow\s*\(|new\s+BaseWindow\s*\(/).length > 0;
  flag(/nodeIntegration\s*:\s*true/, 'high', 'Intégration de Node.js activée', 'Une page piégée ou un script injecté peut lire vos fichiers et lancer des programmes sur le PC de l’utilisateur.', 'Mettez nodeIntegration: false et passez par un preload avec contextBridge.');
  flag(/contextIsolation\s*:\s*false/, 'high', 'Isolation du contexte désactivée', 'La page peut modifier le code du preload et atteindre les fonctions d’Electron.', 'Mettez contextIsolation: true (valeur par défaut).');
  flag(/webSecurity\s*:\s*false/, 'critical', 'webSecurity désactivé', 'La politique de même origine est coupée : n’importe quel site peut lire les données des autres.', 'Retire webSecurity: false.');
  flag(/allowRunningInsecureContent\s*:\s*true/, 'high', 'Contenu non sécurisé autorisé', 'Des scripts HTTP peuvent s’exécuter dans une page HTTPS.', 'Retire allowRunningInsecureContent.');
  flag(/sandbox\s*:\s*false/, 'medium', 'Bac à sable désactivé', 'Le processus de la page n’est plus isolé par Chromium.', 'Mettez sandbox: true (valeur par défaut depuis Electron 20).');
  flag(/enableRemoteModule\s*:\s*true|@electron\/remote/, 'medium', 'Module « remote » utilisé', 'Il donne à la page un accès direct au processus principal.', 'Remplacez-le par des canaux ipcMain.handle / ipcRenderer.invoke limités.');
  flag(/nodeIntegrationIn(SubFrames|Worker)\s*:\s*true/, 'medium', 'Node.js dans les cadres ou les workers', 'Les sous-cadres ou workers ont accès à Node.js.', 'Retire nodeIntegrationInSubFrames / nodeIntegrationInWorker.');
  flag(/experimentalFeatures\s*:\s*true/, 'low', 'Fonctions expérimentales de Chromium activées', 'Elles sont moins testées, y compris côté sécurité.', 'Retire experimentalFeatures.');
  flag(/loadURL\(\s*['"`]http:\/\//, 'high', 'Contenu distant chargé en HTTP', 'La page peut être remplacée en route par un attaquant, avec l’accès de votre application.', 'Chargez le contenu en HTTPS ou depuis les fichiers de l’application.');
  flag(/exposeInMainWorld\([^)]*\bipcRenderer\b\s*[,)]|exposeInMainWorld\([\s\S]{0,200}?:\s*ipcRenderer\s*[,}]/, 'high', 'Pont trop large vers le processus principal', 'Le preload expose ipcRenderer tel quel : la page peut appeler n’importe quel canal.', 'Exposez seulement des fonctions précises (invoke d’une liste de canaux autorisés).');
  const opens = where(/shell\.openExternal\(\s*(?!['"`]https:)/);
  if (opens.length) add('medium', 'Navigation', 'Liens externes ouverts sans contrôle', `shell.openExternal reçoit une adresse variable : une page piégée peut faire ouvrir un programme ou un protocole dangereux. Fichier(s) : ${opens.slice(0, 3).join(', ')}.`, 'Vérifiez que l’adresse commence par https:// avant de l’ouvrir.', { who: 'vous', file: opens[0] });
  if (usesBW && !where(/setWindowOpenHandler/).length) add('medium', 'Navigation', 'Ouverture de nouvelles fenêtres non contrôlée', 'Une page peut ouvrir des fenêtres avec les mêmes droits que l’application.', 'Ajoute webContents.setWindowOpenHandler(() => ({ action: \'deny\' })) et ouvre les liens dans le navigateur.', { who: 'vous' });
  if (usesBW && !where(/will-navigate/).length) add('low', 'Navigation', 'Navigation de la fenêtre non limitée', 'Un lien ou une redirection peut emmener la fenêtre principale sur un site quelconque.', 'Interceptez « will-navigate » et refusez les adresses hors de votre application.', { who: 'vous' });
  if (usesBW && !where(/setPermissionRequestHandler/).length) add('low', 'Navigation', 'Permissions accordées sans contrôle', 'Micro, caméra, notifications… sont accordés par défaut aux pages chargées.', 'Ajoutez session.setPermissionRequestHandler pour n’accepter que ce qui sert.', { who: 'vous' });
  const noCsp = html.filter((f) => { try { return !/Content-Security-Policy/i.test(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return false; } });
  if (html.length && noCsp.length) add('medium', 'Contenu', 'Pages sans politique de sécurité (CSP)', `Electron affiche un avertissement et un script injecté peut s’exécuter. Pages : ${noCsp.slice(0, 3).join(', ')}.`, 'Ajoute <meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'"> dans chaque page.', { who: 'vous', file: noCsp[0] });
  let builder = pkg.build || null;
  for (const n of ['electron-builder.json', 'electron-builder.yml', 'electron-builder.yaml']) if (!builder && fs.existsSync(path.join(dir, n))) builder = { raw: fs.readFileSync(path.join(dir, n), 'utf8') };
  const bText = JSON.stringify(builder || {});
  if (/"asar"\s*:\s*false|asar:\s*false/.test(bText)) add('medium', 'Construction', 'Archive asar désactivée', 'Le code de l’application est livré en fichiers libres, faciles à modifier après installation.', 'Garde asar activé (valeur par défaut d’electron-builder).', { who: 'vous' });
  if (!/certificateFile|certificateSubjectName|signtoolOptions|azureSignOptions|sign["']?\s*:/.test(bText) && !process.env.CSC_LINK) add('medium', 'Construction', 'Logiciel non signé', 'Windows SmartScreen affiche un avertissement « éditeur inconnu » et les antivirus se méfient du logiciel.', 'Configurez un certificat de signature de code (Desktop Builder → Signature, ou win.signtoolOptions).', { who: 'vous' });
  if (!deps['@electron/fuses'] && !/electronFuses/.test(bText)) add('low', 'Construction', 'Fusibles d’Electron non configurés', 'Les options RunAsNode, NODE_OPTIONS et l’inspecteur restent activables sur le logiciel installé.', 'Ajoutez @electron/fuses (ou electronFuses dans electron-builder) : RunAsNode, EnableNodeOptionsEnvironmentVariable et EnableNodeCliInspectArguments à false.', { who: 'vous' });
  if (/"provider"\s*:\s*"generic"[^}]*"url"\s*:\s*"http:/.test(bText)) add('high', 'Mises à jour', 'Mises à jour téléchargées en HTTP', 'Un attaquant peut remplacer la mise à jour par un programme malveillant.', 'Publiez les mises à jour sur une adresse HTTPS.', { who: 'vous' });
  return finish(findings, { kind: 'app', target: dir, dir, name: info.name, app: 'electron', info });
}

async function audit(target) {
  if (!target || !fs.existsSync(target)) throw new Error('Fichier ou dossier introuvable.');
  if (fs.statSync(target).isDirectory()) return auditElectron(target);
  if (/\.(apk)$/i.test(target)) return auditApk(target);
  throw new Error('Choisissez un fichier .apk ou le dossier d’un projet Electron.');
}

module.exports = { audit, auditApk, auditElectron, parseAxml };
