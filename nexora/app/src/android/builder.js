'use strict';
/* Construction d'une application Android (APK et AAB) à partir d'un site ou d'une application web,
 * sans Gradle : ressources générées, aapt2, code natif précompilé (classes.dex), zipalign, apksigner,
 * bundletool et jarsigner. */
const fs = require('fs');
const { plain, techLog } = require('../plain');
const fsx = require('../fsx');
const os = require('os');
const path = require('path');
const { run, TARGET_API } = require('./toolchain');
const { rewrite, list } = require('./zip');
const { optimizeWww } = require('./optimize');
const { parseGoogleServices, firebaseValuesXml } = require('./push');

const ROOT = path.join(__dirname, '..', '..', 'android');
const MIN_SDK = 24;

const PERMISSIONS = {
  camera: { label: 'Appareil photo', manifest: ['android.permission.CAMERA'], features: ['android.hardware.camera', 'android.hardware.camera.autofocus'] },
  microphone: { label: 'Micro', manifest: ['android.permission.RECORD_AUDIO', 'android.permission.MODIFY_AUDIO_SETTINGS'], features: ['android.hardware.microphone'] },
  location: { label: 'Localisation', manifest: ['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION'], features: ['android.hardware.location', 'android.hardware.location.gps'] },
  notifications: { label: 'Notifications', manifest: ['android.permission.POST_NOTIFICATIONS'] },
  vibrate: { label: 'Vibration', manifest: ['android.permission.VIBRATE'] },
  biometric: { label: 'Empreinte et visage', manifest: ['android.permission.USE_BIOMETRIC'] },
  contacts: { label: 'Contacts', manifest: ['android.permission.READ_CONTACTS'] },
  nfc: { label: 'NFC', manifest: ['android.permission.NFC'], features: ['android.hardware.nfc'] },
};

const JAVA_KEYWORDS = new Set(['abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'false', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new', 'null', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'true', 'try', 'void', 'volatile', 'while']);

function validAppId(id) {
  if (!/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(String(id || ''))) return false;
  return String(id).split('.').every((p) => !JAVA_KEYWORDS.has(p));
}

const xml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Texte d'une ressource <string> Android : apostrophes, guillemets et @ ? en tête doivent être échappés.
const resString = (s) => xml(String(s ?? '')).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/&quot;/g, '\\"').replace(/^([@?])/, '\\$1').replace(/\n/g, '\\n');

function hexColor(c, fallback = '#FFFFFF') {
  const s = String(c || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toUpperCase();
  return fallback;
}
function luminance(hex) {
  const n = parseInt(hexColor(hex).slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function hostsFor(spec) {
  const out = new Set((spec.hosts || []).map((h) => String(h).trim().toLowerCase()).filter(Boolean));
  for (const u of [spec.startUrl, spec.publicUrl]) {
    try { const h = new URL(u).host.toLowerCase(); if (h && h !== 'appassets.androidplatform.net') out.add(h.replace(/:\d+$/, '')); } catch { /* adresse vide */ }
  }
  return [...out];
}

function manifest(spec, extra = null) {
  const perms = new Set(['android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE']);
  if (extra) for (const p of extra.permissions || []) perms.add(p);
  const features = new Set();
  for (const p of spec.permissions || []) {
    const d = PERMISSIONS[p];
    if (!d) continue;
    d.manifest.forEach((x) => perms.add(x));
    (d.features || []).forEach((x) => features.add(x));
  }
  const orientation = androidOrientation(spec.orientation, spec.orientFlip);
  const cleartext = /^http:/i.test(spec.startUrl || '');
  const tv = Boolean(spec.tv);
  if (tv) {
    features.add('android.software.leanback');
    features.add('android.hardware.touchscreen');
  }
  const shortcuts = shortcutsFor(spec);
  const twa = spec.mode === 'twa';
  const t = spec.twa || {};
  if (twa && t.notifications) perms.add('android.permission.POST_NOTIFICATIONS');
  if (twa && t.chromeOsOnly) features.add('org.chromium.arc');
  const deep = [];
  for (const h of spec.deepLinks && spec.deepLinks.hosts ? spec.deepLinks.hosts : []) {
    deep.push(`      <intent-filter android:autoVerify="true">
        <action android:name="android.intent.action.VIEW"/>
        <category android:name="android.intent.category.DEFAULT"/>
        <category android:name="android.intent.category.BROWSABLE"/>
        <data android:scheme="https" android:host="${xml(h)}"/>
      </intent-filter>`);
  }
  if (spec.deepLinks && spec.deepLinks.scheme) {
    deep.push(`      <intent-filter>
        <action android:name="android.intent.action.VIEW"/>
        <category android:name="android.intent.category.DEFAULT"/>
        <category android:name="android.intent.category.BROWSABLE"/>
        <data android:scheme="${xml(spec.deepLinks.scheme)}"/>
      </intent-filter>`);
  }
  // Partage vers l'application (share_target du manifest web).
  const share = twa && t.shareTarget ? (() => {
    const files = ((t.shareTarget.params || {}).files || []).flatMap((f) => [].concat(f.accept || []));
    const mimes = [...new Set(['text/plain', ...files.filter((m) => /^[a-z*]+\/[a-z0-9*.+-]+$/i.test(m))])];
    return `      <intent-filter>
        <action android:name="android.intent.action.SEND"/>${files.length ? '\n        <action android:name="android.intent.action.SEND_MULTIPLE"/>' : ''}
        <category android:name="android.intent.category.DEFAULT"/>
${mimes.map((m) => `        <data android:mimeType="${xml(m)}"/>`).join('\n')}
      </intent-filter>`;
  })() : '';
  const launcher = `      <intent-filter>
        <action android:name="android.intent.action.MAIN"/>
        <category android:name="android.intent.category.LAUNCHER"/>${tv ? '\n        <category android:name="android.intent.category.LEANBACK_LAUNCHER"/>' : ''}
      </intent-filter>
${deep.join('\n')}${shortcuts.length ? '\n      <meta-data android:name="android.app.shortcuts" android:resource="@xml/vt_shortcuts"/>' : ''}`;
  const twaBlock = twa ? `
    <activity
      android:name="app.vitrine.shell.TwaActivity"
      android:exported="true"
      android:theme="@style/VitrineTheme"
      android:screenOrientation="${orientation}"
      android:configChanges="orientation|screenSize|screenLayout|smallestScreenSize|uiMode|density|keyboardHidden">
${launcher}
${share}
    </activity>${t.notifications ? `
    <service android:name="app.vitrine.shell.TwaService" android:exported="true">
      <intent-filter>
        <action android:name="android.support.customtabs.trusted.TRUSTED_WEB_ACTIVITY_SERVICE"/>
        <category android:name="android.intent.category.DEFAULT"/>
      </intent-filter>
      <meta-data android:name="android.support.customtabs.trusted.SMALL_ICON" android:resource="@drawable/vt_notification"/>
    </service>` : ''}
    <meta-data android:name="asset_statements" android:resource="@string/vt_asset_statements"/>` : '';
  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools"
  package="${xml(spec.appId)}" android:versionCode="${Number(spec.versionCode) || 1}" android:versionName="${xml(spec.versionName || '1.0.0')}">
${[...perms].map((p) => `  <uses-permission android:name="${p}"/>`).join('\n')}
${spec.downloads !== false ? '  <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28"/>' : ''}
${[...features].map((f) => `  <uses-feature android:name="${f}" android:required="false"/>`).join('\n')}
${extra && extra.permissionDecl ? extra.permissionDecl.map((x) => `  ${x}`).join('\n') : ''}
  <queries>${extra && extra.queries && extra.queries.length ? `\n    ${extra.queries.join('\n    ')}` : ''}
    <intent><action android:name="android.speech.action.RECOGNIZE_SPEECH"/></intent>
    <intent><action android:name="android.intent.action.VIEW"/><data android:mimeType="application/pdf"/></intent>
    <intent><action android:name="android.intent.action.DIAL"/></intent>
    <intent><action android:name="android.intent.action.SENDTO"/><data android:scheme="mailto"/></intent>
    <intent><action android:name="android.media.action.IMAGE_CAPTURE"/></intent>
    <intent><action android:name="android.media.action.VIDEO_CAPTURE"/></intent>
    <intent><action android:name="android.intent.action.VIEW"/><data android:scheme="https"/></intent>
    <intent><action android:name="android.intent.action.SEND"/><data android:mimeType="*/*"/></intent>
    <intent><action android:name="android.support.customtabs.action.CustomTabsService"/></intent>
  </queries>
  <application
    android:label="@string/app_name"
    android:icon="@mipmap/ic_launcher"
    android:roundIcon="@mipmap/ic_launcher_round"
${tv ? '    android:banner="@drawable/vt_banner"\n' : ''}    android:theme="@style/VitrineTheme"
    android:allowBackup="true"
    android:supportsRtl="true"
    android:hardwareAccelerated="true"
    android:largeHeap="true"
    android:usesCleartextTraffic="${cleartext}"
    android:networkSecurityConfig="@xml/vt_network"
    android:enableOnBackInvokedCallback="true">
    <activity
      android:name="app.vitrine.shell.MainActivity"
      android:exported="${!twa}"
      android:launchMode="singleTask"
      android:screenOrientation="${orientation}"
      android:windowSoftInputMode="adjustResize"
      android:configChanges="orientation|screenSize|screenLayout|smallestScreenSize|keyboard|keyboardHidden|navigation|uiMode|density|fontScale|layoutDirection|locale">
${twa ? '' : launcher}
    </activity>${twaBlock}
    <provider
      android:name="app.vitrine.shell.FilesProvider"
      android:authorities="${xml(spec.appId)}.files"
      android:exported="false"
      android:grantUriPermissions="true"/>${extra && extra.application ? `\n    ${extra.application.join('\n    ')}` : ''}
  </application>
</manifest>
`;
}

function shortcutsFor(spec) {
  const list = (spec.shortcuts || []).filter((x) => x && x.url && x.label).slice(0, spec.mode === 'twa' && spec.twa && spec.twa.siteSettings ? 3 : 4);
  if (spec.mode === 'twa' && spec.twa && spec.twa.siteSettings) list.push({ label: 'Réglages du site', icon: 'settings', manage: true, url: spec.startUrl });
  return list;
}

function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // Réessaie en cas de verrouillage antivirus momentané (EPERM/EBUSY) sous Windows.
  for (let i = 0; ; i++) {
    try { fs.writeFileSync(file, data); return; } catch (e) {
      if (i >= 6 || !fsx.RETRY.has(e.code)) throw e;
      const end = Date.now() + 50 * (i + 1); while (Date.now() < end) { /* courte attente */ }
    }
  }
}

function resources(dir, spec) {
  const c = spec.colors || {};
  const splashBg = hexColor(c.splashBg, '#FFFFFF');
  const iconBg = hexColor(c.iconBg, splashBg);
  const accent = hexColor(c.accent, '#007AFF');
  const lightSplash = luminance(splashBg) > 0.55;
  const shortcuts = shortcutsFor(spec);
  const target = spec.mode === 'twa' ? 'app.vitrine.shell.TwaActivity' : 'app.vitrine.shell.MainActivity';
  const statements = (() => {
    try { return JSON.stringify([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'web', site: new URL(spec.startUrl).origin } }]); } catch { return '[]'; }
  })();
  write(path.join(dir, 'values', 'strings.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <string name="app_name">${resString(spec.appName)}</string>\n${shortcuts.map((x, i) => `  <string name="vt_sc_${i}">${resString(String(x.label).slice(0, 25))}</string>\n`).join('')}  <string name="vt_asset_statements" translatable="false">${resString(statements)}</string>\n</resources>\n`);
  if (shortcuts.length) {
    write(path.join(dir, 'xml', 'vt_shortcuts.xml'), `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
${shortcuts.map((x, i) => `  <shortcut android:shortcutId="vt_sc_${i}" android:enabled="true" android:icon="@drawable/vt_sc_icon_${i}" android:shortcutShortLabel="@string/vt_sc_${i}">
    <intent android:action="android.intent.action.VIEW" android:targetPackage="${xml(spec.appId)}" android:targetClass="${target}">
      <extra android:name="vitrine_url" android:value="${xml(x.url)}"/>${x.manage ? '\n      <extra android:name="vitrine_manage" android:value="true"/>' : ''}
    </intent>
  </shortcut>`).join('\n')}
</shortcuts>
`);
  }
  write(path.join(dir, 'values', 'colors.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <color name="vt_splash_bg">${splashBg}</color>\n  <color name="vt_icon_bg">${iconBg}</color>\n  <color name="vt_accent">${accent}</color>\n</resources>\n`);
  const base = `    <item name="android:windowBackground">@drawable/vt_launch</item>
    <item name="android:statusBarColor">@android:color/transparent</item>
    <item name="android:navigationBarColor">@android:color/transparent</item>
    <item name="android:windowLightStatusBar">${lightSplash}</item>
    <item name="android:colorAccent">@color/vt_accent</item>
    <item name="android:colorPrimary">@color/vt_accent</item>`;
  write(path.join(dir, 'values', 'themes.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <style name="VitrineTheme" parent="android:Theme.Material.Light.NoActionBar">
${base}
  </style>
</resources>
`);
  write(path.join(dir, 'values-v27', 'themes.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <style name="VitrineTheme" parent="android:Theme.Material.Light.NoActionBar">
${base}
    <item name="android:windowLightNavigationBar">${lightSplash}</item>
  </style>
</resources>
`);
  write(path.join(dir, 'values-v31', 'themes.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <style name="VitrineTheme" parent="android:Theme.Material.Light.NoActionBar">
${base}
    <item name="android:windowLightNavigationBar">${lightSplash}</item>
    <item name="android:windowSplashScreenBackground">@color/vt_splash_bg</item>
    <item name="android:windowSplashScreenAnimatedIcon">@drawable/vt_splash_icon</item>
    <item name="android:windowSplashScreenIconBackgroundColor">@color/vt_splash_bg</item>
  </style>
</resources>
`);
  write(path.join(dir, 'drawable', 'vt_launch.xml'), `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item android:drawable="@color/vt_splash_bg"/>
  <item android:gravity="center" android:width="150dp" android:height="150dp" android:drawable="@drawable/vt_splash_logo"/>
</layer-list>
`);
  const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/vt_icon_bg"/>
  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
  <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`;
  write(path.join(dir, 'mipmap-anydpi-v26', 'ic_launcher.xml'), adaptive);
  write(path.join(dir, 'mipmap-anydpi-v26', 'ic_launcher_round.xml'), adaptive);
  const cleartext = /^http:/i.test(spec.startUrl || '');
  write(path.join(dir, 'xml', 'vt_network.xml'), `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="${cleartext}">
    <trust-anchors>
      <certificates src="system"/>${spec.config && spec.config.debug ? '\n      <certificates src="user"/>' : ''}
    </trust-anchors>
  </base-config>
</network-security-config>
`);
  // Icônes vectorielles des onglets, de la page hors ligne et des notifications.
  const tpl = path.join(ROOT, 'templates', 'drawable');
  for (const f of fs.readdirSync(tpl)) fs.copyFileSync(path.join(tpl, f), path.join(dir, 'drawable', f));
  // Raccourcis (appui long sur l'icône) : icône d'onglet teintée dans un rond de la couleur d'accent.
  shortcuts.forEach((x, i) => {
    const icon = fs.existsSync(path.join(tpl, `vt_tab_${x.icon}.xml`)) ? x.icon : 'star';
    const src = fs.readFileSync(path.join(tpl, `vt_tab_${icon}.xml`), 'utf8');
    const inner = src.replace(/^[\s\S]*?<vector[^>]*>/, '').replace(/<\/vector>[\s\S]*$/, '')
      .replace(/android:strokeColor="[^"]*"/g, 'android:strokeColor="#FFFFFF"').replace(/android:fillColor="(?!#00)[^"]*"/g, 'android:fillColor="#FFFFFF"');
    write(path.join(dir, 'drawable', `vt_sc_icon_${i}.xml`), `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="48dp" android:height="48dp" android:viewportWidth="48" android:viewportHeight="48">
  <path android:fillColor="${accent}" android:pathData="M24,0a24,24 0 1,0 0.01,0z"/>
  <group android:translateX="12" android:translateY="12">${inner}</group>
</vector>
`);
  });
  // Images générées par l'interface (icônes, écran de démarrage).
  for (const [rel, data] of Object.entries(spec.images || {})) {
    if (!/^(mipmap|drawable)-[a-z]+dpi\/[a-z0-9_]+\.(png|webp)$/.test(rel)) continue;
    write(path.join(dir, ...rel.split('/')), Buffer.from(data));
  }
}

/* Orientation Android : verrouillée (avec retournement à 180° si demandé), automatique ou capteur. */
function androidOrientation(o, flip) {
  if (o === 'portrait') return flip ? 'sensorPortrait' : 'portrait';
  if (o === 'landscape') return flip ? 'sensorLandscape' : 'landscape';
  if (o === 'sensor') return 'fullSensor';
  return 'unspecified';
}

function shellConfig(spec) {
  const c = spec.config || {};
  const colors = spec.colors || {};
  const pu = spec.push || {};
  return {
    push: pu.enabled && spec.mode !== 'twa' ? {
      enabled: true, ask: pu.ask !== false, channel: pu.channel || 'Notifications', registerUrl: pu.registerUrl || '', topics: (pu.topics || ['all']).filter(Boolean),
    } : { enabled: false },
    appName: spec.appName,
    startUrl: spec.startUrl,
    mode: spec.mode === 'local' ? 'local' : 'remote',
    splashIntro: c.splashIntro || 'none',
    splashName: Boolean(c.splashName),
    splashTagline: c.splashTagline || '',
    splashTextColor: c.splashTextColor || '',
    splashLogoSize: Number(c.splashLogoSize) || 150,
    publicUrl: spec.publicUrl || '',
    hosts: hostsFor(spec),
    externalLinks: c.externalLinks || 'browser',
    uaSuffix: c.uaSuffix || '',
    statusMode: c.statusMode || 'auto',
    statusColor: hexColor(c.statusColor || colors.splashBg, '#FFFFFF'),
    navMode: c.navMode || 'auto',
    navColor: hexColor(c.navColor || colors.splashBg, '#FFFFFF'),
    bgColor: hexColor(c.bgColor || colors.splashBg, '#FFFFFF'),
    accent: hexColor(colors.accent, '#007AFF'),
    splashBg: hexColor(colors.splashBg, '#FFFFFF'),
    splashMin: Number(c.splashMin) || 400,
    splashMax: Number(c.splashMax) || 6000,
    pullToRefresh: c.pullToRefresh !== false,
    zoom: Boolean(c.zoom),
    debug: Boolean(c.debug),
    secure: Boolean(c.secure),
    keepAwake: Boolean(c.keepAwake),
    fullscreen: Boolean(c.fullscreen),
    progressBar: c.progressBar !== false,
    back: c.back || 'history',
    cache: c.cache || 'default',
    injectCss: c.injectCss || '',
    injectJs: c.injectJs || '',
    askAtStart: Boolean(c.askAtStart),
    permissions: (spec.permissions || []).filter((p) => PERMISSIONS[p]),
    downloads: spec.downloads !== false,
    orientation: {
      phone: androidOrientation(spec.orientation, spec.orientFlip),
      tablet: spec.orientTablet ? androidOrientation(spec.orientTablet, true) : '',
      js: spec.orientJs !== false,
    },
    events: c.events && c.events.enabled !== false ? {
      network: Boolean(c.events.network),
      download: c.events.download !== false,
      update: c.events.update !== false,
      channel: c.events.channel || 'Activité',
    } : { network: false, download: spec.downloads !== false, update: true, channel: 'Activité' },
    fileUpload: c.fileUpload !== false,
    offlinePage: c.offlinePage !== false,
    offlineTitle: c.offlineTitle || 'Pas de connexion',
    offlineText: c.offlineText || 'Vérifie ta connexion Internet, puis réessaie.',
    offlineButton: c.offlineButton || 'Réessayer',
    tabs: (c.tabs || []).filter((t) => t && t.url).slice(0, 5),
    tabBg: hexColor(c.tabBg, '#FFFFFF'),
    tabActive: hexColor(c.tabActive || colors.accent, '#007AFF'),
    tabInactive: hexColor(c.tabInactive, '#8E8E93'),
    loader: ['bar', 'spinner', 'none'].includes(c.loader) ? c.loader : 'bar',
    splashAnim: ['fade', 'zoom', 'slideUp', 'shrink', 'reveal', 'blur', 'none'].includes(c.splashAnim) ? c.splashAnim : 'fade',
    splashHideOn: c.splashHideOn === 'js' ? 'js' : 'load',
    clipboard: c.clipboard !== false,
    inAppBrowser: c.inAppBrowser !== false,
    linkRules: (c.linkRules || []).filter((r) => r && r.pattern && ['app', 'browser', 'inapp', 'block'].includes(r.action)).slice(0, 50),
    ...(c.fab && c.fab.enabled !== false ? { fab: c.fab } : {}),
    ...(c.menu && Array.isArray(c.menu.items) && c.menu.items.length ? { menu: c.menu } : {}),
    ...(c.onboarding && Array.isArray(c.onboarding.slides) && c.onboarding.slides.length ? { onboarding: c.onboarding } : {}),
    ...(c.modal && c.modal.enabled !== false && (c.modal.title || c.modal.text) ? { modal: c.modal } : {}),
    ...(spec.remote && spec.remote.enabled && /^https:\/\//.test(spec.remote.url || '') ? { remoteUrl: spec.remote.url } : {}),
    ...(c.passcode && c.passcode.enabled ? { passcode: c.passcode } : {}),
    scanner: Boolean(c.scanner),
  };
}

// Réglages du mode Trusted Web Activity (lus par TwaActivity).
function twaConfig(spec) {
  const t = spec.twa || {};
  const colors = spec.colors || {};
  const out = {
    url: spec.startUrl,
    appName: spec.appName,
    themeColor: hexColor(t.themeColor || colors.splashBg, '#FFFFFF'),
    navColor: hexColor(t.navColor || t.themeColor || colors.splashBg, '#FFFFFF'),
    bgColor: hexColor(t.bgColor || colors.splashBg, '#FFFFFF'),
    display: ['standalone', 'fullscreen', 'fullscreen-sticky'].includes(t.display) ? t.display : 'standalone',
    orientation: t.orientation || 'default',
    fallback: t.fallback === 'customtabs' ? 'customtabs' : 'webview',
    splashFade: Math.max(0, Math.min(3000, Number(t.splashFade) || 300)),
    trustedOrigins: (t.trustedOrigins || []).filter((o) => /^https:\/\/[^/]+$/i.test(String(o).replace(/\/$/, ''))).map((o) => String(o).replace(/\/$/, '')),
    notifications: Boolean(t.notifications),
  };
  if (t.themeColorDark) out.themeColorDark = hexColor(t.themeColorDark, '#000000');
  if (t.navColorDark) out.navColorDark = hexColor(t.navColorDark, '#000000');
  if (t.navDivider) out.navDivider = hexColor(t.navDivider, '#000000');
  if (t.navDividerDark) out.navDividerDark = hexColor(t.navDividerDark, '#000000');
  if (t.shareTarget && t.shareTarget.action) out.shareTarget = t.shareTarget;
  return out;
}

function assetLinksJson(appId, fingerprints) {
  return `${JSON.stringify([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: appId, sha256_cert_fingerprints: fingerprints.filter(Boolean) } }], null, 2)}\n`;
}

function copyDir(src, dest, filter = () => true) {
  let count = 0;
  let bytes = 0;
  const walk = (s, d) => {
    fs.mkdirSync(d, { recursive: true });
    for (const ent of fs.readdirSync(s, { withFileTypes: true })) {
      const sp = path.join(s, ent.name);
      const dp = path.join(d, ent.name);
      if (!filter(sp, ent)) continue;
      if (ent.isDirectory()) walk(sp, dp);
      else if (ent.isFile()) { fs.copyFileSync(sp, dp); count += 1; bytes += fs.statSync(sp).size; }
    }
  };
  walk(src, dest);
  return { count, bytes };
}

const safeName = (s) => String(s || 'application').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 60) || 'application';

/* spec : { appName, appId, versionName, versionCode, mode, startUrl, publicUrl, wwwDir, hosts, permissions,
 *          orientation, downloads, deepLinks, colors, config, images, outputs: { apk, aab }, outDir }
 * ctx  : { tools (Toolchain.detect()), keystores (Keystores), owner, log(line), step(label, progress) } */
async function build(spec, ctx) {
  const { tools, keystores } = ctx;
  const log = ctx.log || (() => {});
  const step0 = ctx.step || (() => {});
  let pmax = 0;
  // Étapes en parallèle : la barre de progression ne recule jamais.
  const step = (label, p) => { pmax = Math.max(pmax, p || 0); step0(label, pmax); };
  if (!validAppId(spec.appId)) throw new Error("Identifiant d'application invalide. Exemple : com.monentreprise.monapp (lettres, chiffres, points ; pas de mot réservé Java comme « new » ou « class »).");
  if (!spec.appName || !String(spec.appName).trim()) throw new Error("Donne un nom à l'application.");
  if (!tools || !tools.ready) throw new Error('Les outils Android ne sont pas installés.');
  if (spec.mode === 'twa' && !/^https:\/\/[^/]+/i.test(spec.startUrl || '')) throw new Error('Le mode plein écran navigateur demande un site en https.');
  if (spec.mode === 'local' && (!spec.wwwDir || !fs.existsSync(path.join(spec.wwwDir, 'index.html')))) throw new Error("Le dossier de l'application web ne contient pas de index.html (lance d'abord la construction du projet).");
  const outputs = spec.outputs || { apk: true };
  if (outputs.aab && !tools.bundletool) throw new Error("Le format Play Store (AAB) n'est pas encore prêt : installe les outils Android (bandeau en haut).");
  const t0 = Date.now();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'nexora-android-'));
  const exe = async (file, args, label, opts = {}) => {
    // Les commandes et leurs sorties restent dans le journal technique local (assistance), pas à l'écran.
    const r = await run(file, args, opts);
    const out = `${r.stdout}${r.stderr}`.trim();
    techLog('android', `> ${path.basename(file)} ${args.filter((a) => !/^(pass|env):/.test(String(a))).join(' ')}\n${out.split('\n').slice(-80).join('\n')}`);
    if (r.code) {
      const last = out.split('\n').map((x) => x.trim()).filter((x) => x && !/^\s*at |^>|exception in thread/i.test(x)).slice(-1)[0] || '';
      throw new Error(`${label} n’a pas abouti.${last ? ` ${plain(last).slice(0, 180)}` : ''} Le détail technique est enregistré dans le journal de NEXORA.`);
    }
    return r;
  };
  const bt = tools.buildTools;
  const java = tools.java;
  const result0 = {};
  if (spec.config && spec.config.scanner && !(spec.permissions || []).includes('camera')) spec = { ...spec, permissions: [...(spec.permissions || []), 'camera'] };
  if (spec.tv && !(spec.images && Object.keys(spec.images).some((k) => /vt_banner\.png$/.test(k)))) throw new Error("Pour Android TV, ajoute une bannière (320 × 180) dans l'onglet Icône.");
  try {
    step('Préparation des ressources', 0.05);
    const resDir = path.join(work, 'res');
    resources(resDir, spec);
    // Notifications push (Firebase Cloud Messaging) : kit préparé une fois, configuration du projet Firebase.
    let pk = null;
    const usePush = spec.push && spec.push.enabled && spec.mode !== 'twa';
    if (usePush) {
      const gs = parseGoogleServices(spec.push.googleServices || '', spec.appId);
      if (!gs.ok) throw new Error(`Notifications push : ${gs.error || 'ajoute le fichier google-services.json de ton projet Firebase.'}`);
      if (!ctx.pushKit) throw new Error('Notifications push : kit indisponible.');
      if (!ctx.pushKit.status().installed) {
        step('Notifications push : préparation du kit Firebase (une seule fois)', 0.06);
        await ctx.pushKit.install(tools, (p) => step(`Kit de notifications : ${p.label}`, 0.06 + (p.progress || 0) * 0.1));
      }
      pk = ctx.pushKit.forBuild(spec);
      write(path.join(resDir, 'values', 'vt_firebase.xml'), firebaseValuesXml(gs.strings));
      write(path.join(resDir, 'values', 'vt_push.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <color name="vt_push_color">${hexColor((spec.colors || {}).accent, '#007AFF')}</color>\n</resources>\n`);
      log(`Notifications push : projet Firebase « ${gs.projectId} ».`);
    }
    write(path.join(work, 'AndroidManifest.xml'), manifest(spec, pk));
    const assets = path.join(work, 'assets');
    write(path.join(assets, 'vitrine', 'config.json'), JSON.stringify(shellConfig(spec), null, 2));
    fs.copyFileSync(path.join(ROOT, 'templates', 'bridge.js'), path.join(assets, 'vitrine', 'bridge.js'));
    if (spec.mode === 'twa') write(path.join(assets, 'vitrine', 'twa.json'), JSON.stringify(twaConfig(spec), null, 2));
    if (spec.config && spec.config.scanner) {
      // Lecteur de codes-barres et QR codes (page locale + ZXing, licence Apache 2.0).
      fs.copyFileSync(path.join(ROOT, 'templates', 'scanner.html'), path.join(assets, 'vitrine', 'scanner.html'));
      fs.copyFileSync(require.resolve('@zxing/library/umd/index.min.js'), path.join(assets, 'vitrine', 'zxing.min.js'));
    }
    for (const [name, data] of Object.entries(spec.sounds || {})) {
      if (/^[a-z0-9_-]+\.(mp3|ogg|wav|m4a)$/i.test(name)) write(path.join(assets, 'vitrine', 'sounds', name), Buffer.from(data));
    }
    if (spec.mode === 'local') {
      step("Intégration de l'application web", 0.12);
      const st = copyDir(spec.wwwDir, path.join(assets, 'www'), (p, ent) => !(ent.isDirectory() && /^(node_modules|\.git)$/.test(ent.name)) && !/\.map$/.test(ent.name));
      log(`${st.count} fichiers intégrés (${(st.bytes / 1e6).toFixed(1)} Mo)`);
      const o = spec.optimize || {};
      if (o.enabled !== false) {
        step('Optimisation (proportions, polices, images)', 0.16);
        const r = await optimizeWww(path.join(assets, 'www'), { ...o, fetch: ctx.fetch, log });
        if (r.viewport.length) log(`Balise viewport ${r.viewport.length > 1 ? `corrigée dans ${r.viewport.length} pages` : r.viewport[0]}`);
        if (r.fonts) log(`${r.fonts} feuille(s) de polices Google intégrée(s) à l'application`);
        if (r.images) log(`${r.images} image(s) réduite(s) : ${(r.imageBytes / 1e6).toFixed(1)} Mo gagnés`);
        result0.optimize = r;
      }
    }

    step('Compilation des ressources (aapt2)', 0.2);
    // Images déjà optimisées par NEXORA : pas de recompression PNG (de loin l'étape la plus lente d'aapt2).
    await exe(bt.aapt2, ['compile', '--no-crunch', '--dir', resDir, '-o', path.join(work, 'res.zip')], 'La compilation des ressources');
    const linkArgs = (out, proto) => [
      'link', '-o', out, '-I', tools.platform.jar, '--manifest', path.join(work, 'AndroidManifest.xml'), '-A', assets,
      '--min-sdk-version', String(MIN_SDK), '--target-sdk-version', String(Math.min(TARGET_API, tools.platform.api)),
      '--version-code', String(Number(spec.versionCode) || 1), '--version-name', String(spec.versionName || '1.0.0'),
      '--auto-add-overlay', '--no-version-vectors', '-0', 'json', ...(proto ? ['--proto-format'] : []), path.join(work, 'res.zip'),
      ...(pk ? pk.resZips.flatMap((z) => ['-R', z]) : []),
      ...(pk && !proto ? ['--java', path.join(work, 'gen'), ...(pk.packages.length ? ['--extra-packages', pk.packages.join(':')] : [])] : []),
    ];
    step('Assemblage (aapt2 link)', 0.32);
    await exe(bt.aapt2, linkArgs(path.join(work, 'base.apk'), false), "L'assemblage de l'application");
    const dex = fs.readFileSync(path.join(ROOT, 'shell', 'classes.dex'));
    // Mode Trusted Web Activity : second fichier de code (androidx.browser réduit).
    const dexExtra = spec.mode === 'twa' ? [{ name: 'classes2.dex', data: fs.readFileSync(path.join(ROOT, 'shell', 'twa.dex')) }] : [];
    if (pk) {
      step('Notifications push : identifiants des ressources', 0.36);
      const rdex = await ctx.pushKit.compileR(path.join(work, 'gen'), work, tools);
      for (const d of [...pk.dex, ...rdex]) dexExtra.push({ name: `classes${dexExtra.length + 2}.dex`, data: d });
    }
    const result = {
      ...result0, dir: spec.outDir, files: [], appId: spec.appId, versionName: spec.versionName, versionCode: Number(spec.versionCode) || 1,
    };
    fs.mkdirSync(spec.outDir, { recursive: true });
    const baseName = `${safeName(spec.appName)} ${spec.versionName || '1.0.0'}`;

    // Clé de signature.
    let key = keystores.info(spec.appId);
    if (!key) {
      step('Création de la clé de signature', 0.38);
      key = await keystores.create(spec.appId, java, ctx.owner || { name: spec.appName });
      log('Nouvelle clé de signature créée et conservée sur ce PC (pense à la sauvegarder).');
    }
    const storePass = keystores.password(key);
    const keyPass = keystores.keyPassword(key);
    const env = { ...process.env, VITRINE_KS_PASS: storePass, VITRINE_KEY_PASS: keyPass };

    // L'APK et le paquet AAB sont produits en parallèle ; les outils Java démarrent en mode rapide.
    const J = ['-XX:TieredStopAtLevel=1', '-XX:+UseSerialGC', '-Xshare:auto'];
    const JS = J.map((o) => `-J${o}`);
    const ksType = key.storeType ? ['--ks-type', key.storeType] : ['--ks-type', key.file.endsWith('.p12') ? 'PKCS12' : 'JKS'];
    const makeApk = async () => {
      step('APK : ajout du code natif', 0.45);
      const unsigned = path.join(work, 'unsigned.apk');
      await rewrite(path.join(work, 'base.apk'), unsigned, { store: (n) => n === 'resources.arsc', add: [{ name: 'classes.dex', data: dex }, ...dexExtra] });
      step('APK : alignement (zipalign)', 0.52);
      const aligned = path.join(work, 'aligned.apk');
      await exe(bt.zipalign, ['-p', '-f', '4', unsigned, aligned], "L'alignement");
      step('APK : signature (apksigner)', 0.6);
      const apk = path.join(spec.outDir, `${baseName}.apk`);
      await exe(java.java, [...J, '-jar', bt.apksigner, 'sign', '--ks', key.file, ...ksType, '--ks-key-alias', key.alias, '--ks-pass', 'env:VITRINE_KS_PASS', '--key-pass', 'env:VITRINE_KEY_PASS', '--min-sdk-version', String(MIN_SDK), '--out', apk, aligned], 'La signature', { env });
      step('APK : vérification de la signature', 0.68);
      const v = await exe(java.java, [...J, '-jar', bt.apksigner, 'verify', '--verbose', '--print-certs', apk], 'La vérification');
      result.apk = apk;
      result.apkSize = fs.statSync(apk).size;
      result.schemes = (v.stdout.match(/Verified using v\d+(?:\.\d+)? scheme \(APK Signature Scheme v\d+(?:\.\d+)?\): true/g) || []).map((x) => x.replace(/^Verified using (v[\d.]+).*$/, '$1'));
      fs.rmSync(`${apk}.idsig`, { force: true });
    };
    const makeAab = async () => {
      step('AAB : format Play Store', 0.74);
      const proto = path.join(work, 'proto.apk');
      await exe(bt.aapt2, linkArgs(proto, true), "L'assemblage du paquet Play Store");
      const moduleZip = path.join(work, 'base.zip');
      await rewrite(proto, moduleZip, {
        map: (n) => {
          if (n === 'AndroidManifest.xml') return 'manifest/AndroidManifest.xml';
          if (n === 'resources.pb' || n.startsWith('res/') || n.startsWith('assets/')) return n;
          return `root/${n}`;
        },
        add: [{ name: 'dex/classes.dex', data: dex }, ...dexExtra.map((d) => ({ name: `dex/${d.name}`, data: d.data }))],
      });
      const aab = path.join(spec.outDir, `${baseName}.aab`);
      fs.rmSync(aab, { force: true });
      await exe(java.java, [...J, '-jar', tools.bundletool.jar, 'build-bundle', `--modules=${moduleZip}`, `--output=${aab}`], 'La création du paquet AAB');
      step('AAB : signature (jarsigner)', 0.88);
      await exe(java.jarsigner, [...JS, '-J-Duser.language=en', '-keystore', key.file, ...(key.file.endsWith('.p12') || key.storeType === 'PKCS12' ? ['-storetype', 'PKCS12'] : []), '-storepass:env', 'VITRINE_KS_PASS', '-keypass:env', 'VITRINE_KEY_PASS', '-sigalg', 'SHA256withRSA', '-digestalg', 'SHA-256', aab, key.alias], 'La signature du paquet AAB', { env });
      await exe(java.jarsigner, [...JS, '-J-Duser.language=en', '-verify', aab], 'La vérification du paquet AAB');
      result.aab = aab;
      result.aabSize = fs.statSync(aab).size;
    };
    const t1 = Date.now();
    await Promise.all([outputs.apk !== false ? makeApk() : null, outputs.aab ? makeAab() : null]);
    if (result.apk) result.files.push(result.apk);
    if (result.aab) result.files.push(result.aab);
    result.timings = { total: Date.now() - t0, packaging: Date.now() - t1 };

    // Icône du Play Store (512 × 512) à côté des fichiers.
    if (spec.images && spec.images['play-512.png']) {
      const f = path.join(spec.outDir, `${safeName(spec.appName)} icône Play Store 512.png`);
      fs.writeFileSync(f, Buffer.from(spec.images['play-512.png']));
      result.files.push(f);
    }
    result.key = { file: key.file, alias: key.alias, sha256: key.sha256, sha1: key.sha1, imported: key.imported };
    // Liens d'application vérifiés (Trusted Web Activity, liens profonds) : fichier à publier sur le site.
    if (spec.mode === 'twa' || (spec.deepLinks && spec.deepLinks.hosts && spec.deepLinks.hosts.length)) {
      const al = path.join(spec.outDir, 'assetlinks.json');
      fs.writeFileSync(al, assetLinksJson(spec.appId, [key.sha256, ...(spec.extraFingerprints || [])]));
      result.files.push(al);
      result.assetLinks = al;
      let origin = '';
      try { origin = new URL(spec.startUrl).origin; } catch { /* adresse locale */ }
      const steps = path.join(spec.outDir, 'Prochaines étapes.txt');
      fs.writeFileSync(steps, [
        `${spec.appName} ${spec.versionName || '1.0.0'} — ${spec.appId}`, '',
        spec.mode === 'twa' ? 'Mode : Trusted Web Activity (le site s’ouvre en plein écran dans le navigateur du téléphone).' : 'Mode : application NEX-WEBVIEW.', '',
        '1. Publie le fichier assetlinks.json sur ton site :',
        `   ${origin || 'https://ton-site'}/.well-known/assetlinks.json`,
        '   Sans ce fichier, une barre d’adresse s’affiche en haut de l’application (mode TWA).', '',
        '2. Sur le Play Store, Google signe l’application avec sa propre clé : copie l’empreinte SHA-256 de',
        '   « Play Console > Configuration > Intégrité de l’application » et ajoute-la dans sha256_cert_fingerprints.', '',
        `3. Empreinte SHA-256 de ta clé de signature : ${key.sha256}`,
        `   Fichier de la clé : ${key.file} (à sauvegarder : sans elle, aucune mise à jour ne pourra être publiée).`, '',
      ].join('\r\n'));
      result.files.push(steps);
    }
    step('Terminé', 1);
    return result;
  } finally {
    if (!ctx.keepWork) await fsx.rmrf(work).catch(() => {});
    else techLog('android', `Dossier de travail conservé : ${work}`);
  }
}

// Résumé d'un APK pour l'affichage (aapt2 dump badging).
async function badging(tools, apk) {
  const r = await run(tools.buildTools.aapt2, ['dump', 'badging', apk]);
  return r.stdout;
}

module.exports = {
  build, badging, manifest, shellConfig, twaConfig, assetLinksJson, validAppId, PERMISSIONS, MIN_SDK, list, hostsFor,
};
