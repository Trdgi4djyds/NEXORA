'use strict';
/* NEXORA #115 : modules de l'App Builder : OneSignal (notifications push), Google AdMob (publicités), Google
 * Analytics pour Firebase (audience) et Meta (événements d'application pour les campagnes Facebook et Instagram).
 *
 * Chaque module a son « kit », préparé une fois sur le PC comme celui des achats intégrés (billing.js) : SDK
 * officiel et ses dépendances lus dans les dépôts Maven, ressources compilées (aapt2), pont Vt… compilé (javac),
 * chaque bibliothèque convertie à part (d8). À la construction, les bibliothèques déjà fournies par un autre kit
 * (notifications, achats, module précédent) sont écartées : l'application ne contient jamais deux fois la même
 * classe. MainActivity attache le pont par réflexion quand le module est activé dans la configuration. */
const { LIB_MSG } = require('../plain');
const fs = require('fs');
const path = require('path');
const { run } = require('./toolchain');
const { extract } = require('./zip');
const fsx = require('../fsx');
const { PushKit, mergeManifests, cmpVer } = require('./push');

const GOOGLE = 'https://dl.google.com/dl/android/maven2/';
// Maven Central : miroir de Google d'abord (réseaux qui bloquent repo1.maven.org), puis le dépôt officiel.
const CENTRAL = ['https://maven-central.storage-download.googleapis.com/maven2/', 'https://repo1.maven.org/maven2/'];
const FORMAT = 1;
const MIN_SDK = 24;
const EXE = process.platform === 'win32' ? '.exe' : '';
const SHIMS = path.join(__dirname, '..', '..', 'android', 'shell', 'modules', 'app', 'vitrine', 'shell');
// Versions minimales communes à tous les kits (mêmes que celles du kit de notifications).
const FLOORS = [['androidx.core', 'core', '1.13.1'], ['androidx.activity', 'activity', '1.9.3']];

const MODULES = {
  onesignal: {
    label: 'OneSignal', root: ['com.onesignal', 'OneSignal'], repos: [...CENTRAL, GOOGLE], fallbackVersion: '5.11.0', shim: 'VtOneSignal', size: '≈ 6 Mo',
  },
  admob: {
    label: 'Google AdMob', root: ['com.google.android.gms', 'play-services-ads'], repos: [GOOGLE, ...CENTRAL], fallbackVersion: '25.5.0', shim: 'VtAdMob', size: '≈ 8 Mo',
    floors: [['com.google.android.ump', 'user-messaging-platform', '4.0.0']],
  },
  analytics: {
    label: 'Google Analytics', root: ['com.google.firebase', 'firebase-analytics'], repos: [GOOGLE, ...CENTRAL], fallbackVersion: '24.0.0', shim: 'VtAnalytics', size: '≈ 3 Mo',
  },
  meta: {
    label: 'Meta', root: ['com.facebook.android', 'facebook-core'], repos: [...CENTRAL, GOOGLE], fallbackVersion: '19.0.1', shim: 'VtMeta', size: '≈ 2 Mo',
  },
};
const MODULE_IDS = Object.keys(MODULES);

// Identifiants de test publiés par Google pour AdMob : annonces factices, jamais de compte suspendu pendant les essais.
const ADMOB_TEST = {
  appId: 'ca-app-pub-3940256099942544~3347511713',
  banner: 'ca-app-pub-3940256099942544/9214589741',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
};
const RE = {
  oneSignalApp: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  admobApp: /^ca-app-pub-\d{16}~\d{10}$/,
  admobUnit: /^ca-app-pub-\d{16}\/\d{10}$/,
  metaApp: /^\d{6,20}$/,
  metaToken: /^[0-9a-f]{32}$/i,
};

class ModuleKit extends PushKit {
  constructor(id, opts) {
    const m = MODULES[id];
    if (!m) throw new Error(`Module inconnu : ${id}`);
    super({
      ...opts, name: `module-${id}`, root: m.root, repos: m.repos, fallbackVersion: m.fallbackVersion, floors: [...FLOORS, ...(m.floors || [])], format: FORMAT,
    });
    this.id = id;
    this.def = m;
  }

  async installInner(tools, onStep = () => {}) {
    const m = this.def;
    if (!tools || !tools.buildTools || !tools.platform || !tools.java) throw new Error('Installez d’abord les outils Android (bouton « Installer » de l’App Builder).');
    const javac = path.join(tools.java.home, 'bin', `javac${EXE}`);
    if (!fs.existsSync(javac)) throw new Error('Le Java installé ne contient pas le compilateur (javac) : installez le JDK proposé par l’App Builder.');
    onStep({ label: 'Vérification de l’emplacement du kit', progress: 0.01 });
    const w = await this.checkWritable();
    if (!w.ok) { const e = new Error(w.error); e.code = w.code || 'EPERM'; throw e; }
    onStep({ label: `Recherche de la dernière version de ${m.label}`, progress: 0.02 });
    const version = await this.latestVersion();
    const dir = path.join(this.base, version);
    const libs = path.join(dir, 'libs');
    await fsx.mkdirp(libs);
    const arts = await this.resolve(version, onStep);
    this.log(`${m.label} ${version} : ${arts.length} bibliothèques.`);
    for (const old of fs.readdirSync(dir).filter((n) => /^x\d*$/.test(n))) await fsx.rmrf(path.join(dir, old)).catch(() => {});
    const work = path.join(dir, `x${Date.now() % 1e6}`);
    await fsx.mkdirp(work);
    const items = [];
    let size = 0;
    let i = 0;
    for (const art of arts) {
      i += 1;
      onStep({ label: LIB_MSG, progress: 0.25 + 0.3 * (i / arts.length) });
      // eslint-disable-next-line no-await-in-loop
      const got = await this.downloadArtifact(art, libs);
      if (!got) continue;
      size += fs.statSync(got.file).size;
      const it = {
        ga: `${art.g}:${art.a}`, v: art.v, jars: [], manifest: null, res: null, pkg: null,
      };
      if (got.ext === 'jar') it.jars.push(got.file);
      else {
        const x = path.join(work, String(i));
        // eslint-disable-next-line no-await-in-loop
        await extract(got.file, x);
        const cj = path.join(x, 'classes.jar');
        if (fs.existsSync(cj)) it.jars.push(cj);
        const ld = path.join(x, 'libs');
        if (fs.existsSync(ld)) for (const f of fs.readdirSync(ld)) if (f.endsWith('.jar')) it.jars.push(path.join(ld, f));
        const mf = path.join(x, 'AndroidManifest.xml');
        if (fs.existsSync(mf)) {
          it.manifest = fs.readFileSync(mf, 'utf8');
          const pkg = /package="([^"]+)"/.exec(it.manifest);
          const res = path.join(x, 'res');
          const hasRes = fs.existsSync(res) && fs.readdirSync(res).some((d) => fs.readdirSync(path.join(res, d)).length);
          const rtxt = path.join(x, 'R.txt');
          if (pkg && (hasRes || (fs.existsSync(rtxt) && fs.statSync(rtxt).size > 0))) it.pkg = pkg[1];
          if (hasRes) {
            const flat = path.join(dir, 'res', `r${i}.zip`);
            // eslint-disable-next-line no-await-in-loop
            await fsx.mkdirp(path.dirname(flat));
            // eslint-disable-next-line no-await-in-loop
            await fsx.rmrf(flat).catch(() => {});
            // eslint-disable-next-line no-await-in-loop
            const r = await run(tools.buildTools.aapt2, ['compile', '--no-crunch', '--dir', res, '-o', flat]);
            if (r.code) throw new Error(`Compilation des ressources de ${art.a} impossible : ${(r.stderr || r.stdout).slice(-800)}`);
            it.res = path.relative(dir, flat);
          }
          const vx = path.join(res, 'values', 'values.xml');
          if (fs.existsSync(vx)) { const g = /<integer name="google_play_services_version">(\d+)<\/integer>/.exec(fs.readFileSync(vx, 'utf8')); if (g) it.gms = g[1]; }
        }
      }
      items.push(it);
    }
    const allJars = items.flatMap((it) => it.jars);
    // Pont entre la page et le SDK.
    onStep({ label: `Compilation du pont ${m.label}`, progress: 0.58 });
    const cls = path.join(work, 'classes');
    await fsx.mkdirp(cls);
    const src = path.join(work, 'src', 'app', 'vitrine', 'shell', `${m.shim}.java`);
    await fsx.mkdirp(path.dirname(src));
    await fsx.writeFile(src, fs.readFileSync(path.join(SHIMS, `${m.shim}.java`)));
    let r = await run(javac, ['--release', '11', '-nowarn', '-encoding', 'UTF-8', '-cp', [tools.platform.jar, ...allJars].join(path.delimiter), '-d', cls, src]);
    if (r.code) throw new Error(`Compilation du pont ${m.label} impossible : ${(r.stderr || r.stdout).slice(-1200)}`);
    const shimJar = path.join(work, `${m.shim.toLowerCase()}.jar`);
    r = await run(path.join(tools.java.home, 'bin', `jar${EXE}`), ['cf', shimJar, '-C', cls, '.']);
    if (r.code) throw new Error(`Assemblage du pont impossible : ${r.stderr}`);
    // Conversion au format Android, bibliothèque par bibliothèque (choix à la construction).
    const oldDex = fs.readdirSync(dir).filter((n) => /^dex\d*$/.test(n));
    const dexName = `dex${Date.now() % 1e6}`;
    const dexDir = path.join(dir, dexName);
    await fsx.mkdirp(dexDir);
    const d8 = path.join(tools.buildTools.dir, 'lib', 'd8.jar');
    const units = [...items.filter((it) => it.jars.length).map((it, n) => ({ it, name: String(n + 1), jars: it.jars })), { it: null, name: 'pont', jars: [shimJar] }];
    let n = 0;
    for (const u of units) {
      n += 1;
      onStep({ label: `Conversion au format Android (${n}/${units.length})`, progress: 0.6 + 0.35 * (n / units.length) });
      const out = path.join(dexDir, u.name);
      // eslint-disable-next-line no-await-in-loop
      await fsx.mkdirp(out);
      const cp = allJars.filter((j) => !u.jars.includes(j)).flatMap((j) => ['--classpath', j]);
      // eslint-disable-next-line no-await-in-loop
      r = await run(tools.java.java, ['-Xmx2g', '-cp', d8, 'com.android.tools.r8.D8', '--release', '--min-api', String(MIN_SDK), '--lib', tools.platform.jar, ...cp, '--output', out, ...u.jars], { timeout: 15 * 60 * 1000 });
      if (r.code) throw new Error(`Conversion d8 impossible (${u.it ? u.it.ga : 'pont'}) : ${`${r.stderr}\n${r.stdout}`.split('\n').filter((l) => /error/i.test(l)).slice(0, 6).join('\n') || r.stderr.slice(0, 1200)}`);
      const files = fs.readdirSync(out).filter((f) => /^classes\d*\.dex$/.test(f)).map((f) => `${u.name}/${f}`);
      if (u.it) u.it.dex = files; else units.shim = files;
    }
    // Fusion d'essai : deux bibliothèques qui contiennent les mêmes classes : la plus ancienne est écartée.
    const live = () => items.filter((it) => it.dex && it.dex.length && !it.dropped);
    for (let attempt = 0; attempt < 25; attempt++) {
      onStep({ label: 'Vérification de l’assemblage du code', progress: 0.96 });
      const test = path.join(work, `merge${attempt}`);
      // eslint-disable-next-line no-await-in-loop
      await fsx.mkdirp(test);
      const inputs = [...live().flatMap((it) => it.dex), ...units.shim].map((f) => path.join(dexDir, f));
      // eslint-disable-next-line no-await-in-loop
      r = await run(tools.java.java, ['-Xmx2g', '-cp', d8, 'com.android.tools.r8.D8', '--release', '--min-api', String(MIN_SDK), '--lib', tools.platform.jar, '--output', test, ...inputs], { timeout: 15 * 60 * 1000 });
      // eslint-disable-next-line no-await-in-loop
      await fsx.rmrf(test).catch(() => {});
      if (!r.code) break;
      const dup = /is defined multiple times: (.+?classes\d*\.dex), (.+?classes\d*\.dex)/.exec(`${r.stderr}\n${r.stdout}`);
      if (!dup) throw new Error(`Assemblage du code impossible : ${`${r.stderr}\n${r.stdout}`.split('\n').filter((l) => /error|defined/i.test(l)).slice(0, 4).join('\n') || r.stderr.slice(0, 800)}`);
      const owner = (f) => items.find((it) => (it.dex || []).some((d) => path.resolve(path.join(dexDir, d)) === path.resolve(f)));
      const a = owner(dup[1]); const b = owner(dup[2]);
      if (!a || !b || a === b) throw new Error(`Assemblage du code impossible : classe en double (${path.basename(dup[1])}).`);
      const drop = cmpVer(a.v, b.v) < 0 ? a : b;
      drop.dropped = true;
      this.log(`Doublon écarté : ${drop.ga} ${drop.v} (classes déjà dans ${(drop === a ? b : a).ga})`);
    }
    if (r.code) throw new Error('Assemblage du code impossible : trop de bibliothèques en double.');
    const kit = {
      format: FORMAT, module: this.id, version, built: new Date().toISOString(), dexDir: dexName,
      dex: [...live().flatMap((it) => it.dex), ...units.shim],
      shim: units.shim,
      items: items.filter((it) => !it.dropped).map((it) => ({
        ga: it.ga, v: it.v, dex: it.dex || [], manifest: it.manifest, res: it.res, pkg: it.pkg, gms: it.gms || null,
      })),
      artifacts: items.filter((it) => !it.dropped).map((it) => `${it.ga}:${it.v}`),
      size,
    };
    await fsx.writeFile(path.join(dir, 'kit.json'), JSON.stringify(kit, null, 1));
    await fsx.writeFile(this.kitFile(), JSON.stringify(kit, null, 1));
    await fsx.rmrf(work).catch((e) => this.log(`Nettoyage reporté : ${e.code || e.message}`));
    for (const old of oldDex) await fsx.rmrf(path.join(dir, old)).catch(() => {});
    onStep({ label: `Kit ${m.label} prêt`, progress: 1 });
    return this.status();
  }

  /* Éléments de construction : bibliothèques absentes des kits déjà retenus (have : « groupe:nom » → version),
   * fusionnées avec le pont en un seul code (d8), plus les déclarations propres au module. */
  async forBuild(spec, {
    tools, work, have = new Map(), log = () => {},
  }) {
    const k = this.kit();
    const m = this.def;
    const chosen = [];
    for (const it of k.items) {
      if (have.has(it.ga)) {
        if (cmpVer(have.get(it.ga), it.v) < 0) log(`${m.label} : ${it.ga} ${have.get(it.ga)} vient d’un autre kit (le kit ${m.label} attend ${it.v}).`);
        continue;
      }
      chosen.push(it);
    }
    const out = path.join(work, `module-${this.id}-dex`);
    fs.mkdirSync(out, { recursive: true });
    const inputs = [...chosen.flatMap((it) => it.dex), ...k.shim].map((f) => path.join(k.dir, k.dexDir, f));
    const r = await run(tools.java.java, ['-Xmx2g', '-cp', path.join(tools.buildTools.dir, 'lib', 'd8.jar'), 'com.android.tools.r8.D8', '--release', '--min-api', String(MIN_SDK), '--lib', tools.platform.jar, '--output', out, ...inputs], { timeout: 10 * 60 * 1000 });
    if (r.code) throw new Error(`${m.label} : fusion du code impossible : ${(r.stderr || r.stdout).slice(-1000)}`);
    const sub = (s) => s.replace(/\$\{applicationId\}/g, spec.appId);
    const merged = mergeManifests(chosen.map((it) => it.manifest).filter(Boolean));
    const gms = (k.items.find((it) => it.gms) || {}).gms;
    const application = [...merged.application.map(sub), ...moduleManifest(this.id, spec)];
    if (gms && !application.some((x) => x.includes('"com.google.android.gms.version"'))) application.push(`<meta-data android:name="com.google.android.gms.version" android:value="${gms}"/>`);
    return {
      resZips: chosen.filter((it) => it.res).map((it) => path.join(k.dir, it.res)),
      packages: [...new Set(chosen.map((it) => it.pkg).filter(Boolean))],
      application,
      permissions: [...new Set([...merged.permissions.map(sub), 'android.permission.INTERNET', ...(this.id === 'onesignal' ? ['android.permission.POST_NOTIFICATIONS'] : [])])],
      permissionDecl: merged.permissionDecl.map(sub),
      queries: merged.queries,
      dex: fs.readdirSync(out).filter((f) => /^classes\d*\.dex$/.test(f)).sort((a, b) => (Number(a.slice(7, -4)) || 1) - (Number(b.slice(7, -4)) || 1)).map((f) => fs.readFileSync(path.join(out, f))),
      libraries: chosen.length,
      artifacts: chosen.map((it) => `${it.ga}:${it.v}`),
    };
  }
}

// Déclarations du manifeste propres à chaque module (dans <application>).
function moduleManifest(id, spec) {
  const c = spec[id] || {};
  if (id === 'onesignal') return ['<meta-data android:name="com.onesignal.suppressLaunchURLs" android:value="true"/>'];
  if (id === 'admob') return [`<meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="${c.test || !RE.admobApp.test(c.appId || '') ? ADMOB_TEST.appId : c.appId}"/>`];
  if (id === 'meta') {
    return [
      '<meta-data android:name="com.facebook.sdk.ApplicationId" android:value="@string/vt_facebook_app_id"/>',
      '<meta-data android:name="com.facebook.sdk.ClientToken" android:value="@string/vt_facebook_client_token"/>',
      `<meta-data android:name="com.facebook.sdk.AutoLogAppEventsEnabled" android:value="${c.autoEvents !== false}"/>`,
      `<meta-data android:name="com.facebook.sdk.AdvertiserIDCollectionEnabled" android:value="${c.advertiserId !== false}"/>`,
    ];
  }
  return [];
}

// Ressources propres au module (fichiers values écrits dans res/ de l'application).
function moduleValues(id, spec) {
  const c = spec[id] || {};
  const x = (s) => String(s || '').replace(/[^0-9a-zA-Z]/g, '');
  if (id === 'meta') return { 'vt_meta.xml': `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <string name="vt_facebook_app_id" translatable="false">${x(c.appId)}</string>\n  <string name="vt_facebook_client_token" translatable="false">${x(c.clientToken)}</string>\n</resources>\n` };
  return {};
}

/* Configuration lue par le pont du module dans l'application (assets/vitrine/config.json). AdMob : en mode test,
 * les identifiants de test de Google remplacent ceux du compte. */
function moduleConfig(id, spec) {
  const c = spec[id];
  if (!c || !c.enabled || spec.mode === 'twa') return null;
  if (id === 'onesignal') return { enabled: true, appId: String(c.appId || '').trim(), ask: c.ask !== false, debug: Boolean(c.debug) };
  if (id === 'admob') {
    const test = Boolean(c.test);
    const unit = (k) => { const v = String((c[k] && c[k].unit) || '').trim(); if (!v) return ''; return test ? ADMOB_TEST[k] : v; };
    return {
      enabled: true, test, consent: c.consent !== false, webview: Boolean(c.webview),
      banner: { unit: unit('banner'), position: (c.banner && c.banner.position) === 'top' ? 'top' : 'bottom', auto: !(c.banner && c.banner.auto === false) },
      interstitial: { unit: unit('interstitial') },
      rewarded: { unit: unit('rewarded') },
    };
  }
  if (id === 'analytics') return { enabled: true, collect: c.collect !== false, autoScreens: c.autoScreens !== false };
  if (id === 'meta') return { enabled: true, autoEvents: c.autoEvents !== false, advertiserId: c.advertiserId !== false };
  return null;
}

/* Contrôles avant construction (mêmes règles que l'interface de l'App Builder). */
function validate(spec) {
  const out = [];
  for (const id of MODULE_IDS) {
    const c = spec[id];
    if (!c || !c.enabled) continue;
    const m = MODULES[id];
    if (spec.mode === 'twa') { out.push(`${m.label} : choisissez le moteur NEX-WEBVIEW (section Source), le mode Trusted Web Activity n’est pas pris en charge.`); continue; }
    if (id === 'onesignal') {
      if (!RE.oneSignalApp.test(String(c.appId || '').trim())) out.push('OneSignal : indiquez l’identifiant de l’application OneSignal (Settings › Keys & IDs, format 8-4-4-4-12).');
      if (spec.push && spec.push.enabled) out.push('OneSignal : désactivez les notifications push Firebase de NEXORA, une application ne peut recevoir ses notifications que par un seul service.');
    }
    if (id === 'admob' && !c.test) {
      if (!RE.admobApp.test(String(c.appId || '').trim())) out.push('AdMob : indiquez l’identifiant de l’application AdMob (ca-app-pub-…~…), ou gardez le mode test.');
      for (const k of ['banner', 'interstitial', 'rewarded']) {
        const v = String((c[k] && c[k].unit) || '').trim();
        if (v && !RE.admobUnit.test(v)) out.push(`AdMob : identifiant de bloc d’annonces invalide (${v}), format ca-app-pub-…/….`);
      }
    }
    if (id === 'analytics' && !(spec.push && spec.push.enabled) && !String(c.googleServices || '').trim()) out.push('Google Analytics : importez le fichier google-services.json de votre projet Firebase.');
    if (id === 'meta') {
      if (!RE.metaApp.test(String(c.appId || '').trim())) out.push('Meta : indiquez l’identifiant de l’application Meta (Meta for Developers › Paramètres › Général).');
      if (!RE.metaToken.test(String(c.clientToken || '').trim())) out.push('Meta : indiquez le jeton client (Paramètres › Avancé › Jeton client, 32 caractères).');
    }
  }
  return out;
}

module.exports = {
  MODULES, MODULE_IDS, ModuleKit, ADMOB_TEST, RE, moduleConfig, moduleValues, moduleManifest, validate,
};
