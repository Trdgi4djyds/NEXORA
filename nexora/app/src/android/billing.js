'use strict';
/* NEXORA #019 : achats intégrés avec Google Play Billing.
 *
 * Le « kit » est préparé une fois sur le PC, comme celui des notifications (push.js) : bibliothèque officielle
 * com.android.billingclient:billing et ses dépendances, lues dans les dépôts Maven, ressources compilées
 * (aapt2), pont VtBilling compilé (javac). Chaque bibliothèque est convertie à part (d8) : à la construction,
 * celles que le kit de notifications fournit déjà sont écartées, puis le reste est fusionné en un seul code.
 * L'application et le kit de notifications ne contiennent donc jamais deux fois la même classe.
 *
 * Côté Play Console (compte de service de la publication) : liste des produits et vérification d'un achat. */
const { LIB_MSG } = require('../plain');
const fs = require('fs');
const path = require('path');
const { run } = require('./toolchain');
const { extract } = require('./zip');
const fsx = require('../fsx');
const {
  PushKit, mergeManifests, accessToken, parseServiceAccount, cmpVer,
} = require('./push');
const { call } = require('./play');

// Miroir de Maven Central chez Google en dernier recours (réseaux qui bloquent repo1.maven.org).
const REPOS = ['https://dl.google.com/dl/android/maven2/', 'https://repo1.maven.org/maven2/', 'https://maven-central.storage-download.googleapis.com/maven2/'];
const ROOT = ['com.android.billingclient', 'billing'];
const FALLBACK_VERSION = '9.1.0';
const FORMAT = 1;
const MIN_SDK = 24;
const SHIM = path.join(__dirname, '..', '..', 'android', 'shell', 'billing', 'app', 'vitrine', 'shell', 'VtBilling.java');
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const EXE = process.platform === 'win32' ? '.exe' : '';

class BillingKit extends PushKit {
  constructor(opts) {
    super({
      ...opts, name: 'billing', root: ROOT, repos: REPOS, fallbackVersion: FALLBACK_VERSION, format: FORMAT,
    });
  }

  async installInner(tools, onStep = () => {}) {
    if (!tools || !tools.buildTools || !tools.platform || !tools.java) throw new Error('Installe d’abord les outils Android (bouton « Installer » de l’App Builder).');
    const javac = path.join(tools.java.home, 'bin', `javac${EXE}`);
    if (!fs.existsSync(javac)) throw new Error('Le Java installé ne contient pas le compilateur (javac) : installe le JDK proposé par l’App Builder.');
    onStep({ label: 'Vérification de l’emplacement du kit', progress: 0.01 });
    const w = await this.checkWritable();
    if (!w.ok) { const e = new Error(w.error); e.code = w.code || 'EPERM'; throw e; }
    onStep({ label: 'Recherche de la dernière version de Google Play Billing', progress: 0.02 });
    const version = await this.latestVersion();
    const dir = path.join(this.base, version);
    const libs = path.join(dir, 'libs');
    await fsx.mkdirp(libs);
    const arts = await this.resolve(version, onStep);
    this.log(`Google Play Billing ${version} : ${arts.length} bibliothèques.`);
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
          if (fs.existsSync(vx)) { const m = /<integer name="google_play_services_version">(\d+)<\/integer>/.exec(fs.readFileSync(vx, 'utf8')); if (m) it.gms = m[1]; }
        }
      }
      items.push(it);
    }
    const allJars = items.flatMap((it) => it.jars);
    // Pont entre la page et Google Play Billing.
    onStep({ label: 'Compilation du pont des achats', progress: 0.58 });
    const cls = path.join(work, 'classes');
    await fsx.mkdirp(cls);
    const src = path.join(work, 'src', 'app', 'vitrine', 'shell', 'VtBilling.java');
    await fsx.mkdirp(path.dirname(src));
    await fsx.writeFile(src, fs.readFileSync(SHIM));
    let r = await run(javac, ['--release', '11', '-nowarn', '-encoding', 'UTF-8', '-cp', [tools.platform.jar, ...allJars].join(path.delimiter), '-d', cls, src]);
    if (r.code) throw new Error(`Compilation du pont des achats impossible : ${(r.stderr || r.stdout).slice(-1200)}`);
    const shimJar = path.join(work, 'vtbilling.jar');
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
      onStep({ label: `Conversion au format Android (d8) : ${u.it ? u.it.ga.split(':')[1] : 'pont des achats'} (${n}/${units.length})`, progress: 0.6 + 0.35 * (n / units.length) });
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
    // Fusion d'essai : deux bibliothèques qui contiennent les mêmes classes (ancien kotlin-stdlib-jdk8 et
    // kotlin-stdlib récent, collection et collection-jvm…) : la plus ancienne est écartée, puis on recommence.
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
      format: FORMAT, version, built: new Date().toISOString(), dexDir: dexName,
      // dex : liste complète (vérification du kit par PushKit.status) ; détail par bibliothèque dans items.
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
    onStep({ label: 'Kit d’achats intégrés prêt', progress: 1 });
    return this.status();
  }

  /* Éléments de construction : bibliothèques absentes du kit de notifications (s'il est utilisé), fusionnées
   * avec le pont en un seul code (d8). pushArtifacts : « groupe:nom:version » du kit de notifications. */
  async forBuild(spec, { tools, work, pushArtifacts = [], log = () => {} }) {
    const k = this.kit();
    const have = new Map(pushArtifacts.map((s) => { const p = s.split(':'); return [`${p[0]}:${p[1]}`, p[2]]; }));
    const chosen = [];
    for (const it of k.items) {
      if (have.has(it.ga)) {
        if (cmpVer(have.get(it.ga), it.v) < 0) log(`Achats intégrés : ${it.ga} ${have.get(it.ga)} vient du kit de notifications (le kit d’achats attend ${it.v}). Mets à jour le kit de notifications si un achat échoue.`);
        continue;
      }
      chosen.push(it);
    }
    const out = path.join(work, 'billing-dex');
    fs.mkdirSync(out, { recursive: true });
    const inputs = [...chosen.flatMap((it) => it.dex), ...k.shim].map((f) => path.join(k.dir, k.dexDir, f));
    const r = await run(tools.java.java, ['-Xmx2g', '-cp', path.join(tools.buildTools.dir, 'lib', 'd8.jar'), 'com.android.tools.r8.D8', '--release', '--min-api', String(MIN_SDK), '--lib', tools.platform.jar, '--output', out, ...inputs], { timeout: 10 * 60 * 1000 });
    if (r.code) throw new Error(`Achats intégrés : fusion du code impossible : ${(r.stderr || r.stdout).slice(-1000)}`);
    const sub = (s) => s.replace(/\$\{applicationId\}/g, spec.appId);
    const merged = mergeManifests(chosen.map((it) => it.manifest).filter(Boolean));
    const gms = (k.items.find((it) => it.gms) || {}).gms;
    const application = merged.application.map(sub);
    if (gms && !pushArtifacts.length && !application.some((x) => x.includes('com.google.android.gms.version'))) application.push(`<meta-data android:name="com.google.android.gms.version" android:value="${gms}"/>`);
    return {
      resZips: chosen.filter((it) => it.res).map((it) => path.join(k.dir, it.res)),
      packages: [...new Set(chosen.map((it) => it.pkg).filter(Boolean))],
      application,
      permissions: [...new Set([...merged.permissions.map(sub), 'com.android.vending.BILLING', 'android.permission.INTERNET'])],
      permissionDecl: merged.permissionDecl.map(sub),
      queries: merged.queries,
      dex: fs.readdirSync(out).filter((f) => /^classes\d*\.dex$/.test(f)).sort((a, b) => (Number(a.slice(7, -4)) || 1) - (Number(b.slice(7, -4)) || 1)).map((f) => fs.readFileSync(path.join(out, f))),
      libraries: chosen.length,
    };
  }
}

/* Réunit deux ensembles de construction (notifications et achats) : un composant déclaré des deux côtés
 * (même balise, même android:name) n'apparaît qu'une fois dans le manifeste. */
function mergeKits(a, b) {
  if (!a || !b) return a || b;
  const key = (el) => { const m = /^<([\w-]+)\b[^>]*?android:name="([^"]+)"/.exec(el); return m ? `${m[1]}:${m[2]}` : el; };
  const seen = new Set(a.application.map(key));
  return {
    resZips: [...a.resZips, ...b.resZips.filter((z) => !a.resZips.includes(z))],
    packages: [...new Set([...a.packages, ...b.packages])],
    application: [...a.application, ...b.application.filter((el) => !seen.has(key(el)))],
    permissions: [...new Set([...a.permissions, ...b.permissions])],
    permissionDecl: [...new Set([...(a.permissionDecl || []), ...(b.permissionDecl || [])])],
    queries: [...new Set([...(a.queries || []), ...(b.queries || [])])],
    dex: [...a.dex, ...b.dex],
  };
}

// ---------------------------------------------------------------- Play Console : produits et achats
async function session(serviceAccount, fetchImpl) {
  const sa = parseServiceAccount(serviceAccount);
  if (!sa.ok) throw new Error(sa.error.replace('Firebase', 'Google Cloud'));
  return accessToken(sa.json, fetchImpl, SCOPE);
}

const lang = (listings, prefer = 'fr-FR') => {
  if (!listings) return {};
  if (Array.isArray(listings)) return listings.find((l) => l.languageCode === prefer) || listings[0] || {};
  return listings[prefer] || Object.values(listings)[0] || {};
};

/* Produits créés dans la Play Console : achats uniques (API récente, puis ancienne API en repli) et abonnements. */
async function products({ serviceAccount, appId }, fetchImpl) {
  const tok = await session(serviceAccount, fetchImpl);
  const id = encodeURIComponent(appId);
  const out = [];
  let one = null;
  try {
    one = await call(fetchImpl, tok, 'GET', `${API}/${id}/oneTimeProducts?pageSize=100`);
    for (const p of one.oneTimeProducts || []) {
      const l = lang(p.listings);
      out.push({ productId: p.productId, type: 'inapp', title: l.title || p.productId, status: (p.purchaseOptions || []).some((o) => o.state === 'ACTIVE') ? 'active' : 'inactive' });
    }
  } catch { one = null; }
  if (!one) {
    const legacy = await call(fetchImpl, tok, 'GET', `${API}/${id}/inappproducts`).catch(() => ({ inappproduct: [] }));
    for (const p of legacy.inappproduct || []) {
      if (p.purchaseType === 'subscription') continue;
      const l = lang(p.listings);
      out.push({ productId: p.sku, type: 'inapp', title: l.title || p.sku, status: p.status === 'active' ? 'active' : 'inactive' });
    }
  }
  const subs = await call(fetchImpl, tok, 'GET', `${API}/${id}/subscriptions?pageSize=100`).catch(() => ({ subscriptions: [] }));
  for (const s of subs.subscriptions || []) {
    const l = lang(s.listings);
    out.push({ productId: s.productId, type: 'subs', title: l.title || s.productId, status: (s.basePlans || []).some((b) => b.state === 'ACTIVE') ? 'active' : 'inactive', basePlans: (s.basePlans || []).map((b) => b.basePlanId) });
  }
  return out;
}

/* Vérifie un achat auprès de Google (ce que ton serveur doit faire avant de livrer le produit). */
async function verify({
  serviceAccount, appId, productId, token, type = 'inapp',
}, fetchImpl) {
  const tok = await session(serviceAccount, fetchImpl);
  const id = encodeURIComponent(appId);
  if (type === 'subs') {
    const s = await call(fetchImpl, tok, 'GET', `${API}/${id}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`);
    const item = (s.lineItems || [])[0] || {};
    return {
      type: 'subs', state: s.subscriptionState, acknowledged: s.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED', expiry: item.expiryTime || null, productId: item.productId || productId, test: Boolean(s.testPurchase), orderId: s.latestOrderId || null,
    };
  }
  const p = await call(fetchImpl, tok, 'GET', `${API}/${id}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`);
  return {
    type: 'inapp', state: ['PURCHASED', 'CANCELED', 'PENDING'][p.purchaseState] || String(p.purchaseState), consumed: p.consumptionState === 1, acknowledged: p.acknowledgementState === 1, orderId: p.orderId || null, time: p.purchaseTimeMillis ? Number(p.purchaseTimeMillis) : null, test: p.purchaseType === 0, productId,
  };
}

module.exports = {
  BillingKit, mergeKits, products, verify,
};
