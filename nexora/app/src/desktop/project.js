'use strict';
/* NEXORA #023 : projet d'une application de bureau (Desktop Builder).
 *
 * À partir des réglages choisis dans l'espace, écrit un projet Electron standard et lisible, construit ensuite par
 * electron-builder : structure à deux package.json (app/ ne contient que le logiciel), réglages de construction dans
 * electron-builder.json, icônes et image de l'installateur dans build/. Le processus principal du logiciel vient du
 * modèle desktop/template/app/main.js ; ses réglages sont écrits dans app/config.json.
 *
 * Les réglages reçus de l'interface sont toujours revérifiés ici (sanitize) : noms de fichiers, identifiant,
 * version, adresses et domaines. */
const fs = require('fs');
const path = require('path');

const TEMPLATE = path.join(__dirname, '..', '..', 'desktop', 'template');
// Versions vérifiées avec NEXORA (construction complète d'un installateur, de la version portable et du ZIP).
const BUILDER_VERSION = '26.18.1';
const UPDATER_VERSION = '6.8.12';

const APP_ID_RE = /^[a-zA-Z][a-zA-Z0-9_-]*(\.[a-zA-Z0-9][a-zA-Z0-9_-]*)+$/;
const VERSION_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const DOMAIN_RE = /^(\*\.)?([a-z0-9-]+\.)*[a-z0-9-]+$/;
const HEX_RE = /^#[0-9a-f]{6}$/i;
const SCHEME_RE = /^[a-z][a-z0-9+.-]{1,30}$/;
const GH_RE = /^[A-Za-z0-9_.-]{1,100}$/;
const ACCEL_RE = /^((CommandOrControl|Ctrl|Alt|Shift|Super)\+){1,3}([A-Z0-9]|F([1-9]|1[0-2]))$/;
// Extensions qu'un logiciel ne doit jamais s'approprier (programmes, scripts, raccourcis, documents du système).
const RESERVED_EXT = new Set(['exe', 'com', 'bat', 'cmd', 'msi', 'msix', 'appx', 'ps1', 'vbs', 'js', 'jse', 'wsf', 'lnk', 'url', 'scr', 'dll', 'sys', 'reg', 'html', 'htm', 'zip']);
const AZURE_RE = /^https:\/\/[a-z0-9]+\.codesigning\.azure\.net\/?$/;
const SPELL = ['fr', 'en-US', 'en-GB', 'de', 'es', 'it', 'pt-BR', 'pt-PT', 'nl', 'pl', 'ar', 'tr', 'ru', 'uk', 'ja', 'zh-CN'];

const pick = (v, allowed, def) => (allowed.includes(v) ? v : def);
const bool = (v, def) => (typeof v === 'boolean' ? v : def);
const int = (v, min, max, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? Math.max(min, Math.min(max, n)) : def; };
// eslint-disable-next-line no-control-regex
const text = (v, max = 200) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

/** Nom de fichier lisible et sûr pour les fichiers produits : « Mon logiciel » → « Mon-logiciel ». */
function slug(name) {
  const s = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s.slice(0, 60) || 'Logiciel';
}
/** Nom du paquet (et du dossier des données) : l'identifiant en minuscules, unique pour chaque logiciel. */
function packageName(appId) {
  return String(appId || '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[._-]+/, '').slice(0, 200) || 'nexora-app';
}
function webUrl(v) {
  const s = text(v, 2000);
  if (!s) return '';
  try { const u = new URL(s); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch { return ''; }
}
function domains(list) {
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const d = String(raw || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/:?#].*$/, '');
    if (d && DOMAIN_RE.test(d) && d.length <= 253 && !out.includes(d)) out.push(d);
  }
  return out.slice(0, 60);
}
// Domaines de connexion des services les plus courants (connexion par Google, Microsoft… dans la fenêtre de l'app).
const LOGINS = {
  google: ['accounts.google.com', 'accounts.youtube.com', '*.googleusercontent.com'],
  microsoft: ['login.microsoftonline.com', 'login.live.com', 'account.live.com', 'login.microsoft.com'],
  apple: ['appleid.apple.com', 'idmsa.apple.com'],
  facebook: ['www.facebook.com', 'm.facebook.com'],
  github: ['github.com'],
  auth0: ['*.auth0.com'],
  okta: ['*.okta.com'],
  stripe: ['checkout.stripe.com', '*.stripe.com'],
  paypal: ['www.paypal.com', '*.paypal.com'],
};

/** Vérifie et complète les réglages reçus de l'interface. Lève une erreur en français si un réglage indispensable manque. */
function sanitize(raw = {}) {
  const name = text(raw.name, 80);
  if (!name) throw new Error('Donnez un nom à votre logiciel (section Identité).');
  if (/[<>:"/\\|?*]/.test(name)) throw new Error('Le nom ne doit pas contenir ces caractères : < > : " / \\ | ? *');
  const appId = text(raw.appId, 120);
  if (!APP_ID_RE.test(appId)) throw new Error('Identifiant invalide : utilisez la forme com.monentreprise.monlogiciel (lettres, chiffres et points).');
  const version = text(raw.version, 40) || '1.0.0';
  if (!VERSION_RE.test(version)) throw new Error('Version invalide : utilisez la forme 1.0.0.');
  const s = raw.source || {};
  const kind = pick(s.kind, ['url', 'folder', 'electron'], 'url');
  const source = {
    kind, url: '', dir: '', buildCmd: '', webDir: '', build: false, useProjectConfig: true, prepareCmd: '',
  };
  if (kind === 'url') {
    source.url = webUrl(s.url);
    if (!source.url) throw new Error('Indiquez l’adresse complète du site, par exemple https://monsite.com (section Source).');
  } else {
    source.dir = text(s.dir, 1000);
    if (!source.dir || !path.isAbsolute(source.dir)) throw new Error('Choisissez le dossier du projet (section Source).');
    source.buildCmd = text(s.buildCmd, 300);
    source.prepareCmd = text(s.prepareCmd, 300);
    source.build = bool(s.build, false);
    source.useProjectConfig = bool(s.useProjectConfig, true);
    const wd = text(s.webDir, 300).replace(/\\/g, '/').replace(/^\.?\/+|\/+$/g, '');
    if (wd.split('/').some((p) => p === '..')) throw new Error('Le dossier du site doit se trouver dans le projet.');
    source.webDir = wd;
  }
  const publisher = text(raw.publisher, 100);
  const year = new Date().getFullYear();
  const w = raw.window || {};
  const width = int(w.width, 400, 7680, 1280);
  const height = int(w.height, 300, 4320, 800);
  const b = raw.behavior || {};
  const p = raw.permissions || {};
  const sec = raw.security || {};
  const inst = raw.install || {};
  const formats = {
    nsis: bool((inst.formats || {}).nsis, true), portable: bool((inst.formats || {}).portable, false), zip: bool((inst.formats || {}).zip, false), msi: bool((inst.formats || {}).msi, false), appx: bool((inst.formats || {}).appx, false),
  };
  if (!Object.values(formats).some(Boolean)) formats.nsis = true;
  const archs = { x64: bool((inst.archs || {}).x64, true), arm64: bool((inst.archs || {}).arm64, false) };
  if (!archs.x64 && !archs.arm64) archs.x64 = true;
  const up = raw.updates || {};
  const updates = {
    mode: pick(up.mode, ['none', 'generic', 'github'], 'none'), url: '', owner: '', repo: '', checkOnStart: bool(up.checkOnStart, true), channel: pick(up.channel, ['latest', 'beta'], 'latest'),
  };
  if (updates.mode === 'generic') {
    updates.url = webUrl(up.url);
    if (!/^https:/i.test(updates.url)) throw new Error('Indiquez l’adresse https du dossier de mise à jour (section Mises à jour).');
  }
  if (updates.mode === 'github') {
    updates.owner = text(up.owner, 100);
    updates.repo = text(up.repo, 100);
    if (!GH_RE.test(updates.owner) || !GH_RE.test(updates.repo)) throw new Error('Indiquez le propriétaire et le nom du dépôt GitHub (section Mises à jour).');
  }
  const httpSource = kind === 'url' && /^http:/i.test(source.url);
  const scheme = text(b.protocol, 31).toLowerCase();
  const perm = (k, def, allowed = ['allow', 'ask', 'deny']) => pick(p[k], allowed, def);
  // NEXORA #058 : paquet MSIX pour le Microsoft Store (identité réservée dans l'Espace partenaires).
  const st = raw.store || {};
  const store = { identityName: text(st.identityName, 50), publisher: text(st.publisher, 300), publisherDisplayName: text(st.publisherDisplayName, 100) };
  if (formats.appx) {
    if (!/^[A-Za-z0-9.-]{3,50}$/.test(store.identityName)) throw new Error('Paquet Microsoft Store : indiquez le nom d’identité du paquet (Espace partenaires › Identité du produit).');
    if (!/^CN=.+/.test(store.publisher)) throw new Error('Paquet Microsoft Store : indiquez l’éditeur, de la forme CN=… (Espace partenaires › Identité du produit).');
    if (!store.publisherDisplayName) store.publisherDisplayName = publisher || name;
  }
  // Signature : certificat .pfx enregistré sur le PC, ou signature Microsoft dans le cloud (Azure Trusted Signing).
  const sg = raw.signing || {};
  const az = sg.azure || {};
  const signing = {
    enabled: bool(sg.enabled, false),
    mode: pick(sg.mode, ['pfx', 'azure'], 'pfx'),
    azure: { endpoint: text(az.endpoint, 120).replace(/\/?$/, '/'), account: text(az.account, 64), profile: text(az.profile, 64), publisherName: text(az.publisherName, 200) },
  };
  if (signing.enabled && signing.mode === 'azure') {
    if (!AZURE_RE.test(signing.azure.endpoint)) throw new Error('Signature dans le cloud : choisissez la région de votre compte de signature (adresse https://….codesigning.azure.net/).');
    if (!/^[A-Za-z0-9-]{3,64}$/.test(signing.azure.account) || !/^[A-Za-z0-9-]{3,64}$/.test(signing.azure.profile)) throw new Error('Signature dans le cloud : indiquez le compte de signature et le profil de certificat (lettres, chiffres, tirets).');
    if (!signing.azure.publisherName) throw new Error('Signature dans le cloud : indiquez le nom de l’éditeur tel qu’il figure sur le certificat.');
  }
  const jumpList = (Array.isArray(b.jumpList) ? b.jumpList : []).map((j) => ({ label: text(j && j.label, 40), path: text(j && j.path, 200) }))
    .filter((j) => j.label && /^\/[^\s]*$/.test(j.path)).slice(0, 5);
  const fileTypes = [];
  for (const f of Array.isArray(b.fileTypes) ? b.fileTypes : []) {
    const ext = text(f && f.ext, 12).toLowerCase().replace(/^\./, '');
    if (/^[a-z0-9]{1,12}$/.test(ext) && !RESERVED_EXT.has(ext) && !fileTypes.some((x) => x.ext === ext)) fileTypes.push({ ext, name: text(f && f.name, 40) || ext.toUpperCase() });
  }
  const shortcut = ACCEL_RE.test(text(b.shortcut, 60)) ? text(b.shortcut, 60) : '';
  const ins = raw.insights || {};
  const insights = /^https:\/\/[a-z0-9.-]+$/i.test(text(ins.url, 200)) && text(ins.key, 200) && text(ins.anon, 2000) ? { url: text(ins.url, 200), anon: text(ins.anon, 2000), key: text(ins.key, 200) } : null;
  let internal = domains(raw.internal);
  for (const id of Array.isArray(raw.logins) ? raw.logins : []) if (LOGINS[id]) internal = domains([...internal, ...LOGINS[id]]);
  return {
    name,
    appId,
    version,
    publisher,
    email: /^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(text(raw.email, 120)) ? text(raw.email, 120) : '',
    description: text(raw.description, 300),
    homepage: webUrl(raw.homepage) || (kind === 'url' ? new URL(source.url).origin : ''),
    copyright: text(raw.copyright, 200) || `Copyright © ${year} ${publisher || name}`,
    lang: pick(raw.lang, ['auto', 'fr', 'en'], 'auto'),
    pkgName: packageName(appId),
    slug: slug(name),
    source,
    internal,
    window: {
      width,
      height,
      minWidth: Math.min(width, int(w.minWidth, 320, 7680, 640)),
      minHeight: Math.min(height, int(w.minHeight, 240, 4320, 480)),
      start: pick(w.start, ['normal', 'maximized', 'fullscreen'], 'normal'),
      remember: bool(w.remember, true),
      resizable: bool(w.resizable, true),
      menu: pick(w.menu, ['auto', 'visible', 'hidden'], 'auto'),
      theme: pick(w.theme, ['system', 'light', 'dark'], 'system'),
      background: HEX_RE.test(w.background || '') ? w.background : '#ffffff',
      accent: HEX_RE.test(w.accent || '') ? w.accent : '#2563eb',
      title: pick(w.title, ['page', 'fixed'], 'page'),
    },
    behavior: {
      singleInstance: bool(b.singleInstance, true),
      external: pick(b.external, ['browser', 'app'], 'browser'),
      offline: bool(b.offline, true),
      tray: bool(b.tray, false),
      closeToTray: bool(b.tray, false) && bool(b.closeToTray, false),
      autostartOption: bool(b.autostartOption, true),
      downloads: pick(b.downloads, ['ask', 'auto'], 'ask'),
      spellcheck: (Array.isArray(b.spellcheck) ? b.spellcheck : ['fr', 'en-US']).filter((l) => SPELL.includes(l)).slice(0, 4),
      contextMenu: bool(b.contextMenu, true),
      userAgent: pick(b.userAgent, ['chrome', 'electron', 'custom'], 'chrome'),
      customUserAgent: text(b.customUserAgent, 400),
      zoom: bool(b.zoom, true),
      protocol: SCHEME_RE.test(scheme) && !['http', 'https', 'file', 'app', 'javascript', 'data', 'mailto', 'tel'].includes(scheme) ? scheme : '',
      badge: bool(b.badge, false),
      jumpList,
      shortcut,
      fileTypes: fileTypes.slice(0, 5),
    },
    permissions: {
      notifications: perm('notifications', 'allow', ['allow', 'deny']),
      camera: perm('camera', 'ask'),
      microphone: perm('microphone', 'ask'),
      display: perm('display', 'ask'),
      geolocation: perm('geolocation', 'ask'),
      clipboard: perm('clipboard', 'ask'),
      localNetwork: perm('localNetwork', kind === 'url' ? 'deny' : 'allow'),
      midi: perm('midi', 'deny'),
    },
    security: {
      devtools: bool(sec.devtools, false),
      httpsOnly: httpSource ? false : bool(sec.httpsOnly, true),
      fuses: bool(sec.fuses, true),
      integrity: bool(sec.integrity, true),
      cookieEncryption: bool(sec.cookieEncryption, true),
    },
    install: {
      mode: pick(inst.mode, ['assisted', 'oneclick'], 'assisted'),
      scope: pick(inst.scope, ['user', 'machine'], 'user'),
      changeDir: bool(inst.changeDir, true),
      desktop: bool(inst.desktop, true),
      startMenu: bool(inst.startMenu, true),
      runAfter: bool(inst.runAfter, true),
      deleteData: bool(inst.deleteData, false),
      license: String(inst.license || '').slice(0, 20000).trim(),
      formats,
      archs,
      electron: pick(inst.electron, ['latest', 'nexora'], 'latest'),
      compression: pick(inst.compression, ['normal', 'maximum', 'store'], 'normal'),
      ci: bool(inst.ci, false),
    },
    updates,
    signing,
    store,
    insights,
  };
}

/** Réglages de construction (electron-builder.json), identiques pour NEXORA et pour une construction à la main. */
function builderConfig(c, { electronVersion }) {
  const archs = Object.keys(c.install.archs).filter((a) => c.install.archs[a]);
  const winTargets = ['nsis', 'portable', 'zip', 'msi', 'appx'].filter((t) => c.install.formats[t]).map((target) => ({ target, arch: target === 'msi' ? ['x64'] : archs }));
  const publish = c.updates.mode === 'generic' ? { provider: 'generic', url: c.updates.url }
    : c.updates.mode === 'github' ? { provider: 'github', owner: c.updates.owner, repo: c.updates.repo, releaseType: c.updates.channel === 'beta' ? 'prerelease' : 'release' } : null;
  if (publish && c.updates.channel === 'beta') publish.channel = 'beta';
  const signing = c.signing || { enabled: false };
  const azure = signing.enabled && signing.mode === 'azure';
  const cfg = {
    $schema: 'https://raw.githubusercontent.com/electron-userland/electron-builder/master/packages/app-builder-lib/scheme.json',
    appId: c.appId,
    productName: c.name,
    copyright: c.copyright,
    electronVersion,
    directories: { app: 'app', buildResources: 'build', output: 'dist' },
    asar: true,
    compression: c.install.compression,
    // Aucun module natif dans le logiciel : pas de recompilation (construction plus rapide et plus sûre).
    npmRebuild: false,
    // Sans service de mise à jour, aucun fichier de publication n'est produit (electron-builder 26 échoue sinon
    // quand il ne trouve pas de dépôt Git).
    publish,
    win: {
      target: winTargets,
      icon: 'build/icon.ico',
      requestedExecutionLevel: 'asInvoker',
      // Nom des archives ZIP (les autres formats ont leur propre nom ci-dessous).
      artifactName: `${c.slug}-\${version}-win-\${arch}.\${ext}`,
      ...(signing.enabled && !azure ? { signtoolOptions: { rfc3161TimeStampServer: 'http://timestamp.digicert.com' } } : {}),
      // NEXORA #058 : signature Microsoft dans le cloud ; identifiants Azure passés par l'environnement de construction.
      ...(azure ? {
        azureSignOptions: {
          publisherName: signing.azure.publisherName, endpoint: signing.azure.endpoint, codeSigningAccountName: signing.azure.account, certificateProfileName: signing.azure.profile,
        },
      } : {}),
    },
    mac: {
      target: ['dmg', 'zip'], category: 'public.app-category.productivity', icon: 'build/icon.png', hardenedRuntime: true,
    },
    linux: {
      target: c.email ? ['AppImage', 'deb'] : ['AppImage'], category: 'Utility', icon: 'build/icon.png', synopsis: c.description || c.name, ...(c.email ? { maintainer: `${c.publisher || c.name} <${c.email}>` } : {}),
    },
  };
  if (c.security.fuses) {
    // Verrouillage de l'exécutable (fusibles Electron) : recommandations du guide de sécurité d'Electron.
    cfg.electronFuses = {
      runAsNode: false,
      enableCookieEncryption: c.security.cookieEncryption,
      enableNodeOptionsEnvironmentVariable: false,
      enableNodeCliInspectArguments: false,
      enableEmbeddedAsarIntegrityValidation: c.security.integrity,
      onlyLoadAppFromAsar: c.security.integrity,
      loadBrowserProcessSpecificV8Snapshot: false,
      grantFileProtocolExtraPrivileges: false,
    };
  }
  if (c.install.formats.nsis) {
    const oneClick = c.install.mode === 'oneclick';
    cfg.nsis = {
      oneClick,
      perMachine: c.install.scope === 'machine',
      allowElevation: true,
      ...(oneClick ? { deleteAppDataOnUninstall: c.install.deleteData } : { allowToChangeInstallationDirectory: c.install.changeDir, installerSidebar: 'build/installerSidebar.bmp', uninstallerSidebar: 'build/installerSidebar.bmp' }),
      createDesktopShortcut: c.install.desktop,
      createStartMenuShortcut: c.install.startMenu,
      shortcutName: c.name,
      runAfterFinish: c.install.runAfter,
      uninstallDisplayName: '${productName}',
      artifactName: `${c.slug}-Setup-\${version}.\${ext}`,
      ...(c.install.license && !oneClick ? { license: 'build/license.txt' } : {}),
    };
  }
  if (c.install.formats.portable) cfg.portable = { artifactName: `${c.slug}-Portable-\${version}.\${ext}` };
  if (c.install.formats.msi) {
    cfg.msi = {
      oneClick: true, perMachine: c.install.scope === 'machine', createDesktopShortcut: c.install.desktop, runAfterFinish: false, shortcutName: c.name, artifactName: `${c.slug}-\${version}-\${arch}.\${ext}`,
    };
  }
  if (c.behavior.protocol) cfg.protocols = [{ name: c.name, schemes: [c.behavior.protocol] }];
  if (c.behavior.fileTypes && c.behavior.fileTypes.length) cfg.fileAssociations = c.behavior.fileTypes.map((f) => ({ ext: f.ext, name: f.name, description: `${f.name} (${c.name})`, role: 'Editor' }));
  if (c.install.formats.appx && c.store) {
    // Paquet pour le Microsoft Store : non signé ici, le Store le signe à la publication.
    cfg.appx = {
      identityName: c.store.identityName, publisher: c.store.publisher, publisherDisplayName: c.store.publisherDisplayName, displayName: c.name,
      applicationId: (c.slug.replace(/[^A-Za-z0-9]/g, '') || 'App').replace(/^\d/, 'A$&').slice(0, 64), backgroundColor: 'transparent', languages: ['fr-FR', 'en-US'], artifactName: `${c.slug}-\${version}-\${arch}.\${ext}`,
    };
  }
  return cfg;
}

/** Réglages lus par le logiciel au démarrage (app/config.json). */
function appConfig(c, { nexoraVersion = '', entry = 'index.html' } = {}) {
  const local = c.source.kind !== 'url';
  return {
    schema: 1,
    name: c.name,
    appId: c.appId,
    version: c.version,
    publisher: c.publisher,
    homepage: c.homepage,
    copyright: c.copyright,
    lang: c.lang,
    dataFolder: c.pkgName,
    kind: local ? 'local' : 'url',
    startUrl: local ? `app://local/${entry}` : c.source.url,
    internal: c.internal,
    httpsOnly: c.security.httpsOnly,
    window: c.window,
    behavior: c.behavior,
    permissions: c.permissions,
    security: { devtools: c.security.devtools },
    updates: { mode: c.updates.mode, checkOnStart: c.updates.checkOnStart, channel: c.updates.channel || 'latest' },
    insights: c.insights || null,
    builtWith: `NEXORA ${nexoraVersion}`.trim(),
  };
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}
function writeBytes(file, bytes) {
  if (!bytes || !bytes.length) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(bytes.buffer ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : bytes));
  return true;
}
function copyTemplate(rel, dest, replace = null) {
  let data = fs.readFileSync(path.join(TEMPLATE, rel));
  if (replace) {
    let s = data.toString('utf8');
    for (const [k, v] of Object.entries(replace)) s = s.split(`{{${k}}}`).join(v);
    data = Buffer.from(s, 'utf8');
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, data);
}
/** Texte de la licence pour NSIS (Unicode) : UTF-8 avec marque d'ordre des octets, fins de ligne Windows. */
function licenseText(license) {
  return `\ufeff${String(license || '').replace(/\r?\n/g, '\r\n')}\r\n`;
}
const SKIP_WEB = new Set(['node_modules', '.git', '.svn', '.hg', '.DS_Store', 'Thumbs.db', 'desktop.ini', '.nexora-desktop.json']);
/** Copie le site construit dans app/web : sans dépendances, dépôt Git ni cartes de code source (.map). */
function copyWeb(src, dest) {
  let files = 0;
  let bytes = 0;
  const walk = (from, to) => {
    fs.mkdirSync(to, { recursive: true });
    for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
      if (SKIP_WEB.has(ent.name) || ent.name.endsWith('.map')) continue;
      const a = path.join(from, ent.name);
      const b = path.join(to, ent.name);
      if (ent.isDirectory()) walk(a, b);
      else if (ent.isFile()) {
        fs.copyFileSync(a, b);
        files += 1;
        bytes += fs.statSync(b).size;
        if (files > 60000) throw new Error('Le dossier du site contient plus de 60 000 fichiers : choisissez le dossier de build (dist, build…).');
      }
    }
  };
  walk(src, dest);
  return { files, bytes };
}

/**
 * Écrit (ou réécrit) le projet dans projectDir. assets : { ico, png, png256, sidebar } (octets produits par
 * l'interface). webDir : dossier du site à intégrer (logiciel à partir d'un dossier). Le dossier app/node_modules
 * est gardé d'une construction à l'autre.
 */
function writeProject(projectDir, c, assets = {}, { electronVersion, nexoraVersion = '', webDir = null } = {}) {
  if (c.source.kind === 'electron') throw new Error('Un projet Electron existant se construit tel quel, sans projet généré.');
  fs.mkdirSync(projectDir, { recursive: true });
  const app = path.join(projectDir, 'app');
  for (const rel of ['app/web', 'app/pages', 'app/assets', 'build', '.github']) fs.rmSync(path.join(projectDir, rel), { recursive: true, force: true });
  const deps = c.updates.mode !== 'none' ? { 'electron-updater': UPDATER_VERSION } : undefined;
  const author = { name: c.publisher || c.name, ...(c.email ? { email: c.email } : {}) };
  writeJson(path.join(projectDir, 'package.json'), {
    name: `${c.pkgName}-projet`,
    productName: c.name,
    version: c.version,
    description: c.description || c.name,
    author,
    private: true,
    scripts: {
      start: 'electron app',
      build: 'electron-builder --win --publish never',
      'build:mac': 'electron-builder --mac --publish never',
      'build:linux': 'electron-builder --linux --publish never',
      ...(deps ? { postinstall: 'electron-builder install-app-deps' } : {}),
    },
    devDependencies: { electron: electronVersion, 'electron-builder': BUILDER_VERSION },
  });
  writeJson(path.join(app, 'package.json'), {
    name: c.pkgName,
    productName: c.name,
    version: c.version,
    description: c.description || c.name,
    author,
    ...(c.homepage ? { homepage: c.homepage } : {}),
    main: 'main.js',
    private: true,
    ...(deps ? { dependencies: deps } : {}),
  });
  if (!deps) { fs.rmSync(path.join(app, 'node_modules'), { recursive: true, force: true }); fs.rmSync(path.join(app, 'package-lock.json'), { force: true }); }
  copyTemplate('app/main.js', path.join(app, 'main.js'));
  for (const f of ['status.html', 'status.css', 'status.js']) copyTemplate(`app/pages/${f}`, path.join(app, 'pages', f));
  let web = null;
  if (c.source.kind === 'folder') {
    if (!webDir || !fs.existsSync(path.join(webDir, 'index.html'))) throw new Error(`Aucun fichier index.html dans ${webDir || 'le dossier du site'} : choisissez le dossier qui contient la page d'accueil du site.`);
    web = copyWeb(webDir, path.join(app, 'web'));
  }
  writeJson(path.join(app, 'config.json'), appConfig(c, { nexoraVersion }));
  const png256 = assets.png256 || assets.png;
  if (!assets.ico || !assets.png) throw new Error('L’icône du logiciel n’a pas pu être préparée. Rouvrez la section Icône, puis réessayez.');
  writeBytes(path.join(projectDir, 'build', 'icon.ico'), assets.ico);
  writeBytes(path.join(projectDir, 'build', 'icon.png'), assets.png);
  writeBytes(path.join(app, 'assets', 'icon.ico'), assets.ico);
  writeBytes(path.join(app, 'assets', 'icon.png'), png256);
  writeBytes(path.join(app, 'pages', 'icon.png'), png256);
  // NEXORA #058 : pastilles de la barre des tâches (1 à 9 et 9+), dessinées par l'interface.
  if (c.behavior.badge && assets.badges) for (const [k, bytes] of Object.entries(assets.badges)) if (/^(\d|9plus)$/.test(k)) writeBytes(path.join(app, 'assets', 'badges', `${k}.png`), bytes);
  if (c.install.mode === 'assisted') writeBytes(path.join(projectDir, 'build', 'installerSidebar.bmp'), assets.sidebar);
  if (c.install.license) fs.writeFileSync(path.join(projectDir, 'build', 'license.txt'), licenseText(c.install.license));
  const builder = builderConfig(c, { electronVersion });
  if (c.install.mode !== 'assisted' && builder.nsis) { delete builder.nsis.installerSidebar; delete builder.nsis.uninstallerSidebar; }
  if (c.install.mode === 'assisted' && builder.nsis && !assets.sidebar) { delete builder.nsis.installerSidebar; delete builder.nsis.uninstallerSidebar; }
  writeJson(path.join(projectDir, 'electron-builder.json'), builder);
  copyTemplate('gitignore', path.join(projectDir, '.gitignore'));
  if (c.install.ci) copyTemplate('workflow.yml', path.join(projectDir, '.github', 'workflows', 'build.yml'));
  const src = c.source.kind === 'url' ? `du site ${c.source.url}` : `du dossier ${c.source.dir}`;
  copyTemplate('README.md', path.join(projectDir, 'README.md'), {
    NAME: c.name,
    SOURCE: src,
    VERSION: c.version,
    APP_ID: c.appId,
    ELECTRON: electronVersion,
    BUILDER: BUILDER_VERSION,
    WEB_LINE: c.source.kind === 'folder' ? ', `web/` (le site intégré, servi à l’adresse app://local)' : '',
    CI_LINE: c.install.ci ? '- `.github/workflows/build.yml` : construction automatique pour Windows, macOS et Linux sur GitHub Actions.\n' : '',
  });
  return { projectDir, web, builder };
}

module.exports = {
  sanitize, builderConfig, appConfig, writeProject, licenseText, slug, packageName, LOGINS, BUILDER_VERSION, UPDATER_VERSION, TEMPLATE,
};
