'use strict';
/* Notifications push (Firebase Cloud Messaging) pour les applications de l'App Builder.
 *
 * Le « kit » est préparé une fois sur le PC : les bibliothèques officielles de Firebase Messaging sont lues
 * dans les dépôts Maven de Google et de Maven Central (avec leurs dépendances), converties au format Android
 * (d8) et leurs ressources compilées (aapt2). À chaque construction, NEXORA ajoute ce kit à l'application,
 * avec la configuration du projet Firebase (google-services.json), le service qui reçoit les messages et
 * les déclarations du manifeste — comme le ferait Gradle avec le plugin google-services, sans Gradle.
 *
 * Envoi de test : API FCM HTTP v1, authentifiée par la clé de compte de service du projet (JWT signé ici). */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { run } = require('./toolchain');
const { extract } = require('./zip');
const fsx = require('../fsx');

const REPOS = ['https://dl.google.com/dl/android/maven2/', 'https://repo1.maven.org/maven2/'];
const ROOT_ARTIFACT = ['com.google.firebase', 'firebase-messaging'];
const FALLBACK_VERSION = '25.0.1';
// Versions minimales d'androidx utilisées par le code récent des services Google Play (leurs POM citent des
// versions plus anciennes : dans une application Gradle classique, d'autres bibliothèques les relèvent).
const FLOORS = [['androidx.core', 'core', '1.13.1'], ['androidx.activity', 'activity', '1.9.3']];
const KIT_FORMAT = 3;
const MIN_SDK = 24;
const SHELL_DIR = path.join(__dirname, '..', '..', 'android', 'shell');

function cmpVer(a, b) {
  const pa = String(a).split(/[.-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : x));
  const pb = String(b).split(/[.-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : x));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0; const y = pb[i] ?? 0;
    if (typeof x === 'number' && typeof y === 'number') { if (x !== y) return x - y; } else if (String(x) !== String(y)) {
      // 1.0.0 > 1.0.0-rc01 : une version avec suffixe passe après la version finale.
      if (typeof x === 'number') return 1;
      if (typeof y === 'number') return -1;
      return String(x) < String(y) ? -1 : 1;
    }
  }
  return 0;
}

const tag = (xml, name) => { const m = new RegExp(`<${name}>\\s*([^<]*?)\\s*</${name}>`).exec(xml); return m ? m[1] : ''; };
function stripBlock(xml, name) { return xml.replace(new RegExp(`<${name}>[\\s\\S]*?</${name}>`, 'g'), ''); }

// Lecture d'un POM : propriétés, parent, dépendances (hors gestion des dépendances, tests et optionnelles).
function parsePom(xml) {
  const props = {};
  const pm = /<properties>([\s\S]*?)<\/properties>/.exec(xml);
  if (pm) for (const m of pm[1].matchAll(/<([\w.-]+)>([^<]*)<\/\1>/g)) props[m[1]] = m[2].trim();
  const parentM = /<parent>([\s\S]*?)<\/parent>/.exec(xml);
  const parent = parentM ? { g: tag(parentM[1], 'groupId'), a: tag(parentM[1], 'artifactId'), v: tag(parentM[1], 'version') } : null;
  const managed = {};
  const dmM = /<dependencyManagement>([\s\S]*?)<\/dependencyManagement>/.exec(xml);
  if (dmM) for (const d of dmM[1].matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) managed[`${tag(d[1], 'groupId')}:${tag(d[1], 'artifactId')}`] = tag(d[1], 'version');
  const body = stripBlock(stripBlock(xml, 'dependencyManagement'), 'build');
  const deps = [];
  const depsBlock = /<dependencies>([\s\S]*?)<\/dependencies>/.exec(body);
  if (depsBlock) {
    for (const d of depsBlock[1].matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
      const x = d[1];
      const scope = tag(x, 'scope') || 'compile';
      if (!['compile', 'runtime'].includes(scope) || tag(x, 'optional') === 'true') continue;
      const excl = [...x.matchAll(/<exclusion>([\s\S]*?)<\/exclusion>/g)].map((e) => `${tag(e[1], 'groupId')}:${tag(e[1], 'artifactId')}`);
      deps.push({
        g: tag(x, 'groupId'), a: tag(x, 'artifactId'), v: tag(x, 'version'), type: tag(x, 'type') || '', excl,
      });
    }
  }
  // En-tête du projet : sans les blocs qui contiennent eux aussi des groupId / version.
  let head = xml;
  for (const b of ['parent', 'dependencyManagement', 'dependencies', 'build', 'profiles', 'licenses', 'developers', 'contributors', 'scm', 'organization', 'distributionManagement', 'properties', 'issueManagement', 'repositories', 'pluginRepositories', 'reporting']) head = stripBlock(head, b);
  return {
    g: tag(head, 'groupId') || (parent && parent.g), v: tag(head, 'version') || (parent && parent.v), packaging: tag(head, 'packaging') || 'jar', props, parent, managed, deps,
  };
}

// Valeurs Firebase attendues par l'application (ce que fait le plugin Gradle google-services).
function parseGoogleServices(text, appId) {
  let j;
  try { j = typeof text === 'string' ? JSON.parse(text) : text; } catch { return { ok: false, error: 'Ce fichier n’est pas un google-services.json valide (JSON illisible).' }; }
  const pi = j && j.project_info;
  if (!pi || !Array.isArray(j.client)) return { ok: false, error: 'Ce fichier n’est pas un google-services.json (projet Firebase introuvable).' };
  const clients = j.client.filter((c) => c.client_info && c.client_info.android_client_info);
  const pkgs = clients.map((c) => c.client_info.android_client_info.package_name);
  const c = clients.find((x) => x.client_info.android_client_info.package_name === appId);
  if (!c) {
    return {
      ok: false, projectId: pi.project_id, packages: pkgs, error: `Ce fichier ne contient pas l’application « ${appId} » (il contient : ${pkgs.join(', ') || 'aucune application Android'}). Dans la console Firebase, ajoute une application Android avec exactement cet identifiant, puis télécharge à nouveau le fichier.`,
    };
  }
  const key = (c.api_key || []).find((k) => k.current_key);
  const strings = {
    google_app_id: c.client_info.mobilesdk_app_id,
    gcm_defaultSenderId: pi.project_number,
    google_api_key: key ? key.current_key : '',
    google_crash_reporting_api_key: key ? key.current_key : '',
    project_id: pi.project_id,
    google_storage_bucket: pi.storage_bucket || '',
    firebase_database_url: pi.firebase_url || '',
  };
  if (!strings.google_app_id || !strings.gcm_defaultSenderId || !strings.google_api_key) return { ok: false, error: 'Le fichier est incomplet (identifiant d’application, numéro de projet ou clé d’API manquants).' };
  return {
    ok: true, projectId: pi.project_id, senderId: pi.project_number, appId: strings.google_app_id, packages: pkgs, strings,
  };
}

function xmlEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, "\\'"); }

function firebaseValuesXml(strings) {
  return `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${Object.entries(strings).filter(([, v]) => v).map(([k, v]) => `  <string name="${k}" translatable="false">${xmlEsc(v)}</string>`).join('\n')}\n</resources>\n`;
}

// Fusion des manifestes des bibliothèques : éléments de <application>, autorisations, <queries>.
function mergeManifests(manifests) {
  const app = [];
  const seen = new Set();
  const perms = new Set();
  const permDecl = [];
  const queries = [];
  const clean = (x) => x
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+tools:[\w-]+="[^"]*"/g, '');
  for (const raw of manifests) {
    const xml = clean(raw);
    for (const m of xml.matchAll(/<uses-permission(?:-sdk-23)?\b[^>]*android:name="([^"]+)"[^>]*\/?>(?:\s*<\/uses-permission>)?/g)) {
      if (!/tools:node="remove"/.test(m[0])) perms.add(m[1]);
    }
    for (const m of xml.matchAll(/<permission\b[\s\S]*?(?:\/>|<\/permission>)/g)) permDecl.push(m[0]);
    for (const m of xml.matchAll(/<queries>([\s\S]*?)<\/queries>/g)) queries.push(m[1].trim());
    const am = /<application\b[^>]*?(?:\/>|>([\s\S]*?)<\/application>)/.exec(xml);
    if (!am || !am[1]) continue;
    // Éléments de premier niveau (avec leurs enfants) : lecture des balises en comptant la profondeur.
    const inner = am[1];
    const tops = [];
    const tagRe = /<(\/?)([\w:-]+)\b[^>]*?(\/?)>/g;
    let depth = 0; let startIdx = -1; let topName = '';
    for (let m = tagRe.exec(inner); m; m = tagRe.exec(inner)) {
      const [whole, close, name, self] = m;
      if (!close && depth === 0) { startIdx = m.index; topName = name; }
      if (!close && !self) depth += 1;
      else if (close) depth -= 1;
      if (depth === 0 && startIdx >= 0 && (self || close)) {
        tops.push({ name: topName, el: inner.slice(startIdx, m.index + whole.length) });
        startIdx = -1;
      }
    }
    for (const t of tops) {
      if (!/^(activity|activity-alias|service|receiver|provider|meta-data|uses-library|property|profileable)$/.test(t.name)) continue;
      let el = t.el;
      const nameM = /^<[\w-]+\b[^>]*?android:name="([^"]+)"/.exec(el);
      const key = `${t.name}:${nameM ? nameM[1] : el}`;
      if (seen.has(key)) {
        // Même composant déclaré par plusieurs bibliothèques (ComponentDiscoveryService) : on réunit les meta-data.
        const idx = app.findIndex((x) => x.key === key);
        const metas = [...el.matchAll(/<meta-data\b[^>]*\/>/g)].map((x) => x[0]);
        if (idx >= 0 && metas.length) {
          let cur = app[idx].el;
          for (const md of metas) {
            const n = /android:name="([^"]+)"/.exec(md);
            if (n && !cur.includes(`"${n[1]}"`)) {
              cur = /<\/[\w-]+>\s*$/.test(cur) ? cur.replace(/(<\/[\w-]+>)\s*$/, `  ${md}\n$1`) : cur.replace(/\/>\s*$/, `>\n  ${md}\n</${t.name}>`);
            }
          }
          app[idx].el = cur;
        }
        continue;
      }
      seen.add(key);
      el = el.replace(/android:exported="\$\{[^}]+\}"/g, 'android:exported="false"');
      app.push({ key, el });
    }
  }
  return {
    application: app.map((x) => x.el), permissions: [...perms], permissionDecl: [...new Set(permDecl)], queries,
  };
}

class PushKit {
  constructor({ home, fetch, log = () => {}, base, onBaseChanged = () => {} }) {
    this.home = home;
    this.fetch = fetch;
    this.log = log;
    this.onBaseChanged = onBaseChanged;
    // Emplacement par défaut : sous Windows, AppData\Local\NEXORA\push (jamais synchronisé, chemin court) plutôt
    // que le dossier « Roaming » des réglages. Un kit déjà prêt à l'ancien emplacement continue d'être utilisé.
    this.legacyBase = path.join(home, 'push');
    const local = process.platform === 'win32' && process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'NEXORA', 'push') : null;
    this.defaultBase = local && !this.kitReadyIn(this.legacyBase) ? local : this.legacyBase;
    this.base = base || this.defaultBase;
    this.poms = new Map();
  }

  kitReadyIn(base) {
    try {
      const k = JSON.parse(fs.readFileSync(path.join(base, 'kit.json'), 'utf8'));
      return k.format === KIT_FORMAT && Array.isArray(k.dex) && k.dex.every((d) => fs.existsSync(path.join(base, k.version, k.dexDir || 'dex', d)));
    } catch { return false; }
  }

  // Emplacement choisi par l'utilisateur (dossier court, hors OneDrive / dossiers protégés).
  setBase(dir) { this.base = dir ? path.resolve(dir) : this.defaultBase; this.poms.clear(); }

  // Emplacements de repli essayés automatiquement si Windows bloque l'écriture.
  fallbacks() {
    const list = [this.defaultBase];
    if (process.platform === 'win32') {
      if (process.env.LOCALAPPDATA) list.push(path.join(process.env.LOCALAPPDATA, 'NEXORA', 'push'));
      list.push(path.join(`${process.env.SystemDrive || 'C:'}\\`, 'NEXORA-kit'));
      if (process.env.USERPROFILE) list.push(path.join(process.env.USERPROFILE, 'NEXORA-kit'));
    }
    list.push(this.legacyBase);
    return [...new Set(list.map((d) => path.resolve(d)))];
  }

  /* Vérifie qu'on peut écrire, renommer et supprimer dans le dossier : c'est exactement ce qui échoue
   * avec EPERM quand un antivirus, l'« Accès contrôlé aux dossiers » de Windows ou OneDrive bloque. */
  async checkWritable(dir = this.base) {
    const probe = path.join(dir, `.nexora-test-${process.pid}`);
    try {
      await fsx.mkdirp(dir);
      await fsx.writeFile(`${probe}.part`, 'ok');
      await fsx.rename(`${probe}.part`, probe);
      await fsx.rmrf(probe);
      return { ok: true };
    } catch (e) {
      return { ok: false, code: e.code || '', error: e.message };
    }
  }

  kitFile() { return path.join(this.base, 'kit.json'); }

  status() {
    try {
      const k = JSON.parse(fs.readFileSync(this.kitFile(), 'utf8'));
      const ok = k.format === KIT_FORMAT && k.dex && k.dex.every((d) => fs.existsSync(path.join(this.base, k.version, k.dexDir || 'dex', d)));
      return {
        installed: Boolean(ok), version: k.version, artifacts: (k.artifacts || []).length, size: k.size || 0, built: k.built,
      };
    } catch { return { installed: false }; }
  }

  kit() {
    const k = JSON.parse(fs.readFileSync(this.kitFile(), 'utf8'));
    k.dir = path.join(this.base, k.version);
    return k;
  }

  async getText(url) {
    const r = await this.fetch(url);
    if (!r.ok) return null;
    return r.text();
  }

  async latestVersion() {
    try {
      const x = await this.getText(`${REPOS[0]}${ROOT_ARTIFACT[0].replace(/\./g, '/')}/${ROOT_ARTIFACT[1]}/maven-metadata.xml`);
      const v = x && (tag(x, 'release') || tag(x, 'latest'));
      return v || FALLBACK_VERSION;
    } catch { return FALLBACK_VERSION; }
  }

  async pom(g, a, v) {
    const key = `${g}:${a}:${v}`;
    if (this.poms.has(key)) return this.poms.get(key);
    const rel = `${g.replace(/\./g, '/')}/${a}/${v}/${a}-${v}.pom`;
    let xml = null;
    let repo = null;
    for (const r of REPOS) {
      // eslint-disable-next-line no-await-in-loop
      xml = await this.getText(r + rel).catch(() => null);
      if (xml) { repo = r; break; }
    }
    if (!xml) throw new Error(`Bibliothèque introuvable : ${key}`);
    const p = parsePom(xml);
    p.repo = repo;
    // Propriétés et versions gérées héritées du parent.
    if (p.parent && p.parent.g && p.parent.v) {
      try {
        const par = await this.pom(p.parent.g, p.parent.a, p.parent.v);
        p.props = { ...par.props, ...p.props };
        p.managed = { ...par.managed, ...p.managed };
      } catch { /* parent absent : on continue */ }
    }
    p.props['project.version'] = v;
    p.props.version = v;
    this.poms.set(key, p);
    return p;
  }

  // Résolution des dépendances, la version la plus haute l'emporte (comme Gradle).
  async resolve(rootVersion, onStep) {
    const chosen = new Map(); // g:a → { g, a, v, packaging, repo }
    const queue = [{ g: ROOT_ARTIFACT[0], a: ROOT_ARTIFACT[1], v: rootVersion, excl: [] }, ...FLOORS.map(([g, a, v]) => ({ g, a, v, excl: [] }))];
    let n = 0;
    while (queue.length) {
      const d = queue.shift();
      const ga = `${d.g}:${d.a}`;
      const cur = chosen.get(ga);
      if (cur && cmpVer(cur.v, d.v) >= 0) continue;
      // eslint-disable-next-line no-await-in-loop
      const p = await this.pom(d.g, d.a, d.v);
      chosen.set(ga, {
        g: d.g, a: d.a, v: d.v, packaging: p.packaging, repo: p.repo,
      });
      n += 1;
      if (onStep) onStep({ label: `Lecture des dépendances (${n})`, progress: Math.min(0.25, n / 160) });
      for (const c of p.deps) {
        const sub = (s) => String(s || '').replace(/\$\{([^}]+)\}/g, (_m, k) => p.props[k] ?? '');
        const g = sub(c.g); const a = sub(c.a);
        let v = sub(c.v) || p.managed[`${g}:${a}`] || '';
        v = v.replace(/^\[([^,\]]+)\]$/, '$1').replace(/^\[([^,\]]+),.*$/, '$1').replace(/^\(?,?([^,)]+)\)?$/, '$1');
        if (!g || !a || !v || /\$\{/.test(v)) continue;
        if (d.excl.includes(`${g}:${a}`) || d.excl.includes(`${g}:*`)) continue;
        queue.push({
          g, a, v, excl: [...d.excl, ...c.excl], type: c.type,
        });
      }
    }
    // Bibliothèques multiplateformes (Kotlin) : la variante Android remplace la variante JVM de bureau.
    const all = [...chosen.values()];
    const names = new Set(all.map((x) => `${x.g}:${x.a}`));
    return all.filter((x) => !(/-(jvm|desktop)$/.test(x.a) && names.has(`${x.g}:${x.a.replace(/-(jvm|desktop)$/, '-android')}`)));
  }

  async downloadArtifact(art, dir) {
    const rel = `${art.g.replace(/\./g, '/')}/${art.a}/${art.v}/${art.a}-${art.v}`;
    const exts = art.packaging === 'aar' ? ['aar', 'jar'] : ['jar', 'aar'];
    const repos = [art.repo, ...REPOS.filter((r) => r !== art.repo)];
    for (const ext of exts) {
      const file = path.join(dir, `${art.g}__${art.a}__${art.v}.${ext}`);
      if (fs.existsSync(file) && fs.statSync(file).size > 0) return { file, ext };
      for (const r of repos) {
        // eslint-disable-next-line no-await-in-loop
        const res = await this.fetch(`${r}${rel}.${ext}`).catch(() => null);
        if (res && res.ok) {
          // eslint-disable-next-line no-await-in-loop
          const buf = Buffer.from(await res.arrayBuffer());
          // Écriture puis renommage tolérants au verrouillage antivirus de Windows (EPERM).
          await fsx.writeFile(`${file}.part`, buf);
          await fsx.rename(`${file}.part`, file);
          return { file, ext };
        }
      }
    }
    return null; // POM seul (bibliothèque sans code, ex. « bom »)
  }

  /* Prépare le kit. tools : outils Android détectés (build-tools, plateforme, Java). onStep({ label, progress }). */
  /* Si Windows bloque l'écriture (antivirus, accès contrôlé aux dossiers, OneDrive, fichiers en lecture seule
   * laissés par un essai précédent), NEXORA essaie tout seul d'autres emplacements courts et garde celui qui
   * fonctionne. Le message d'erreur n'apparaît que si tous sont bloqués, avec l'opération exacte refusée. */
  async install(tools, onStep = () => {}) {
    const isPerm = (e) => /EPERM|EACCES|EBUSY|ENAMETOOLONG|operation not permitted|permission denied/i.test(`${e.code || ''} ${e.message}`);
    const first = this.base;
    const tried = [];
    for (const b of [first, ...this.fallbacks().filter((d) => d !== path.resolve(first))]) {
      if (b !== this.base) {
        this.setBase(b);
        this.log(`Nouvel essai du kit dans ${b}`);
        onStep({ label: `Emplacement bloqué : nouvel essai dans ${b}`, progress: 0.01 });
      }
      try {
        // eslint-disable-next-line no-await-in-loop
        const r = await this.installInner(tools, onStep);
        if (b !== first) { try { this.onBaseChanged(b); } catch { /* ignore */ } }
        return r;
      } catch (e) {
        if (!isPerm(e)) { if (b !== first) this.setBase(first); throw e; }
        const what = [e.syscall, e.path].filter(Boolean).join(' ');
        tried.push(`${b} — ${e.code || 'accès refusé'}${what ? ` (${what})` : ''}`);
        this.log(`Emplacement bloqué : ${tried[tried.length - 1]}`);
      }
    }
    this.setBase(first);
    const err = new Error(`Windows a bloqué l’écriture du kit dans tous les emplacements essayés :\n• ${tried.join('\n• ')}\n`
      + 'Cause habituelle : antivirus ou « Accès contrôlé aux dossiers » de Windows Defender. Autorise NEXORA dans '
      + 'Sécurité Windows › Protection contre les virus et menaces › Protection contre les ransomwares › « Autoriser une application », '
      + 'ou choisis un autre dossier avec « Changer l’emplacement », puis relance.');
    err.code = 'PUSH_LOCATION';
    throw err;
  }

  async installInner(tools, onStep = () => {}) {
    if (!tools || !tools.buildTools || !tools.platform || !tools.java) throw new Error('Installe d’abord les outils Android (bouton « Installer » de l’App Builder).');
    const javac = path.join(tools.java.home, 'bin', process.platform === 'win32' ? 'javac.exe' : 'javac');
    if (!fs.existsSync(javac)) throw new Error('Le Java installé ne contient pas le compilateur (javac) : installe le JDK proposé par l’App Builder.');
    onStep({ label: 'Vérification de l’emplacement du kit', progress: 0.01 });
    const w = await this.checkWritable();
    if (!w.ok) { const e = new Error(w.error); e.code = w.code || 'EPERM'; throw e; }
    onStep({ label: 'Recherche de la dernière version de Firebase Messaging', progress: 0.02 });
    const version = await this.latestVersion();
    const dir = path.join(this.base, version);
    const libs = path.join(dir, 'libs');
    await fsx.mkdirp(libs);
    const arts = await this.resolve(version, onStep);
    this.log(`Firebase Messaging ${version} : ${arts.length} bibliothèques.`);
    const jars = [];
    const manifests = [];
    const resZips = [];
    const packages = [];
    let size = 0;
    // Dossier de travail neuf à chaque essai : les restes verrouillés d'un essai précédent ne bloquent plus rien.
    for (const old of fs.readdirSync(dir).filter((n) => /^x\d*$/.test(n))) await fsx.rmrf(path.join(dir, old)).catch(() => {});
    const work = path.join(dir, `x${Date.now() % 1e6}`);
    await fsx.mkdirp(work);
    let i = 0;
    for (const art of arts) {
      i += 1;
      onStep({ label: `Téléchargement : ${art.a} ${art.v} (${i}/${arts.length})`, progress: 0.25 + 0.4 * (i / arts.length) });
      // eslint-disable-next-line no-await-in-loop
      const got = await this.downloadArtifact(art, libs);
      if (!got) continue;
      size += fs.statSync(got.file).size;
      if (got.ext === 'jar') { jars.push(got.file); continue; }
      // Dossier d'extraction court (numéro) : les outils Android (aapt2, javac, d8) ne gèrent pas
      // les chemins de plus de 260 caractères sous Windows.
      const x = path.join(work, String(i));
      // eslint-disable-next-line no-await-in-loop
      await extract(got.file, x);
      const cj = path.join(x, 'classes.jar');
      if (fs.existsSync(cj)) jars.push(cj);
      const ld = path.join(x, 'libs');
      if (fs.existsSync(ld)) for (const f of fs.readdirSync(ld)) if (f.endsWith('.jar')) jars.push(path.join(ld, f));
      const mf = path.join(x, 'AndroidManifest.xml');
      if (fs.existsSync(mf)) {
        const xml = fs.readFileSync(mf, 'utf8');
        manifests.push(xml);
        const pkg = /package="([^"]+)"/.exec(xml);
        const res = path.join(x, 'res');
        const hasRes = fs.existsSync(res) && fs.readdirSync(res).some((d) => fs.readdirSync(path.join(res, d)).length);
        const rtxt = path.join(x, 'R.txt');
        const hasR = fs.existsSync(rtxt) && fs.statSync(rtxt).size > 0;
        if (pkg && (hasRes || hasR)) packages.push(pkg[1]);
        if (hasRes) {
          const flat = path.join(dir, 'res', `r${i}.zip`);
          // eslint-disable-next-line no-await-in-loop
          await fsx.mkdirp(path.dirname(flat));
          // eslint-disable-next-line no-await-in-loop
          await fsx.rmrf(flat).catch(() => {});
          // eslint-disable-next-line no-await-in-loop
          const r = await run(tools.buildTools.aapt2, ['compile', '--no-crunch', '--dir', res, '-o', flat]);
          if (r.code) throw new Error(`Compilation des ressources de ${art.a} impossible : ${(r.stderr || r.stdout).slice(-800)}`);
          resZips.push(flat);
        }
      }
    }
    // Service qui reçoit les messages (application ouverte) et enregistre le jeton de l'appareil.
    onStep({ label: 'Compilation du service de notifications', progress: 0.7 });
    const cls = path.join(work, 'classes');
    await fsx.mkdirp(cls);
    // Source copiée hors de l'archive de l'application (javac ne lit pas dans app.asar).
    const src = path.join(work, 'src', 'app', 'vitrine', 'shell', 'VtPushService.java');
    await fsx.mkdirp(path.dirname(src));
    await fsx.writeFile(src, fs.readFileSync(path.join(SHELL_DIR, 'push', 'app', 'vitrine', 'shell', 'VtPushService.java')));
    const cp = [tools.platform.jar, ...jars].join(path.delimiter);
    let r = await run(javac, ['--release', '11', '-nowarn', '-encoding', 'UTF-8', '-cp', cp, '-d', cls, src]);
    if (r.code) throw new Error(`Compilation du service de notifications impossible : ${(r.stderr || r.stdout).slice(-1200)}`);
    const svcJar = path.join(work, 'vtpush.jar');
    r = await run(path.join(tools.java.home, 'bin', process.platform === 'win32' ? 'jar.exe' : 'jar'), ['cf', svcJar, '-C', cls, '.']);
    if (r.code) throw new Error(`Assemblage du service impossible : ${r.stderr}`);
    // Conversion au format Android (d8), en plusieurs fichiers dex si besoin.
    onStep({ label: 'Conversion des bibliothèques au format Android (d8)', progress: 0.74 });
    // Dossier dex neuf (nom retenu dans kit.json) : un ancien dossier verrouillé ne fait plus échouer la préparation.
    const oldDex = fs.readdirSync(dir).filter((n) => /^dex\d*$/.test(n));
    const dexName = `dex${Date.now() % 1e6}`;
    const dexDir = path.join(dir, dexName);
    await fsx.mkdirp(dexDir);
    const d8 = path.join(tools.buildTools.dir, 'lib', 'd8.jar');
    // Chemins passés directement (le fichier d'arguments de d8 ne gère pas les guillemets). Une classe présente
    // dans deux bibliothèques (anciennes variantes) : on écarte le doublon et on recommence.
    let progJars = [...jars, svcJar];
    for (let attempt = 0; attempt < 12; attempt++) {
      // eslint-disable-next-line no-await-in-loop
      for (const f of fs.readdirSync(dexDir)) await fsx.rmrf(path.join(dexDir, f));
      // eslint-disable-next-line no-await-in-loop
      r = await run(tools.java.java, ['-Xmx2g', '-cp', d8, 'com.android.tools.r8.D8', '--release', '--min-api', String(MIN_SDK), '--lib', tools.platform.jar, '--output', dexDir, ...progJars], { timeout: 15 * 60 * 1000 });
      const dup = /is defined multiple times: (.+?\.jar):[^,]+, (.+?\.jar):/.exec(`${r.stderr}\n${r.stdout}`);
      if (!r.code || !dup) break;
      // On garde la variante Android (extraite d'un .aar) plutôt que le .jar générique.
      const drop = dup[2].includes(`${path.sep}libs${path.sep}`) || /-jvm__/.test(dup[2]) ? dup[2] : dup[1];
      this.log(`Doublon écarté : ${path.basename(drop)}`);
      progJars = progJars.filter((j) => path.resolve(j) !== path.resolve(drop));
    }
    if (r.code) {
      const out = `${r.stderr}\n${r.stdout}`;
      const lines = out.split('\n').filter((l) => /Error|error:|defined multiple|Type .* is/i.test(l) && !/^\s+at /.test(l)).slice(0, 8);
      throw new Error(`Conversion d8 impossible : ${(lines.join('\n') || out.slice(0, 1500)).slice(0, 2000)}`);
    }
    const dex = fs.readdirSync(dexDir).filter((f) => /^classes\d*\.dex$/.test(f)).sort((a, b) => (Number(a.slice(7, -4)) || 1) - (Number(b.slice(7, -4)) || 1));
    onStep({ label: 'Préparation du manifeste', progress: 0.95 });
    const merged = mergeManifests(manifests);
    // Version des services Google Play (meta-data obligatoire) : lue dans les ressources de play-services-basement.
    let gmsVersion = null;
    for (const d of fs.readdirSync(work)) {
      const v = path.join(work, d, 'res', 'values', 'values.xml');
      if (fs.existsSync(v)) { const m = /<integer name="google_play_services_version">(\d+)<\/integer>/.exec(fs.readFileSync(v, 'utf8')); if (m) gmsVersion = m[1]; }
    }
    const kit = {
      format: KIT_FORMAT, version, built: new Date().toISOString(), artifacts: arts.map((a) => `${a.g}:${a.a}:${a.v}`), dex, dexDir: dexName, res: resZips.map((f) => path.relative(dir, f)), packages: [...new Set(packages)], manifest: merged, gmsVersion, size,
    };
    await fsx.writeFile(path.join(dir, 'kit.json'), JSON.stringify(kit, null, 1));
    await fsx.writeFile(this.kitFile(), JSON.stringify(kit, null, 1));
    // Fichiers intermédiaires inutiles ensuite (les manifestes et ressources compilées sont gardés).
    // Un nettoyage refusé par l'antivirus ne fait pas échouer un kit prêt : il sera retenté au prochain essai.
    await fsx.rmrf(work).catch((e) => this.log(`Nettoyage reporté : ${e.code || e.message}`));
    for (const old of oldDex) await fsx.rmrf(path.join(dir, old)).catch(() => {});
    onStep({ label: 'Kit de notifications prêt', progress: 1 });
    return this.status();
  }

  /* Éléments de construction pour une application : ressources, manifeste, dex. */
  forBuild(spec) {
    const k = this.kit();
    const appId = spec.appId;
    const sub = (s) => s.replace(/\$\{applicationId\}/g, appId);
    const push = spec.push || {};
    const app = [
      ...k.manifest.application.map(sub),
      `<service android:name="app.vitrine.shell.VtPushService" android:exported="false"><intent-filter android:priority="1"><action android:name="com.google.firebase.MESSAGING_EVENT"/></intent-filter></service>`,
      '<meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/vt_notification"/>',
      '<meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="vt_default"/>',
      '<meta-data android:name="com.google.firebase.messaging.default_notification_color" android:resource="@color/vt_push_color"/>',
      k.gmsVersion && !k.manifest.application.some((x) => x.includes('com.google.android.gms.version')) ? `<meta-data android:name="com.google.android.gms.version" android:value="${k.gmsVersion}"/>` : '',
      push.autoInit === false ? '<meta-data android:name="firebase_messaging_auto_init_enabled" android:value="false"/>' : '',
    ].filter(Boolean);
    return {
      resZips: k.res.map((f) => path.join(k.dir, f)),
      packages: k.packages,
      application: app,
      permissions: [...new Set([...k.manifest.permissions.map(sub), 'android.permission.POST_NOTIFICATIONS', 'android.permission.INTERNET', 'android.permission.WAKE_LOCK'])],
      permissionDecl: k.manifest.permissionDecl.map(sub),
      queries: k.manifest.queries,
      dex: k.dex.map((d) => fs.readFileSync(path.join(k.dir, k.dexDir || 'dex', d))),
    };
  }

  /* Classes R des bibliothèques (identifiants des ressources de cette application), compilées puis converties. */
  async compileR(genDir, work, tools) {
    const files = [];
    const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f === 'R.java') files.push(p); } };
    walk(genDir);
    if (!files.length) return [];
    const javac = path.join(tools.java.home, 'bin', process.platform === 'win32' ? 'javac.exe' : 'javac');
    const cls = path.join(work, 'rclasses');
    fs.mkdirSync(cls, { recursive: true });
    const list = path.join(work, 'r-sources.txt');
    fs.writeFileSync(list, files.map((f) => `"${f.replace(/\\/g, '/')}"`).join('\n'));
    let r = await run(javac, ['--release', '11', '-nowarn', '-encoding', 'UTF-8', '-cp', tools.platform.jar, '-d', cls, `@${list}`], { timeout: 10 * 60 * 1000 });
    if (r.code) throw new Error(`Compilation des identifiants de ressources impossible : ${(r.stderr || r.stdout).slice(-1000)}`);
    const jarFile = path.join(work, 'r.jar');
    r = await run(path.join(tools.java.home, 'bin', process.platform === 'win32' ? 'jar.exe' : 'jar'), ['cf', jarFile, '-C', cls, '.']);
    if (r.code) throw new Error(`Assemblage des identifiants impossible : ${r.stderr}`);
    const out = path.join(work, 'rdex');
    fs.mkdirSync(out, { recursive: true });
    r = await run(tools.java.java, ['-cp', path.join(tools.buildTools.dir, 'lib', 'd8.jar'), 'com.android.tools.r8.D8', '--release', '--min-api', String(MIN_SDK), '--lib', tools.platform.jar, '--output', out, jarFile], { timeout: 10 * 60 * 1000 });
    if (r.code) throw new Error(`Conversion des identifiants impossible : ${(r.stderr || r.stdout).slice(-1000)}`);
    return fs.readdirSync(out).filter((f) => /\.dex$/.test(f)).sort().map((f) => fs.readFileSync(path.join(out, f)));
  }
}

// ------------------------------------------------------------------ envoi de test (FCM HTTP v1)
function b64url(b) { return Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }

function parseServiceAccount(text) {
  let j;
  try { j = typeof text === 'string' ? JSON.parse(text) : text; } catch { return { ok: false, error: 'Ce fichier n’est pas une clé de compte de service (JSON illisible).' }; }
  if (!j || j.type !== 'service_account' || !j.private_key || !j.client_email) return { ok: false, error: 'Ce fichier n’est pas une clé de compte de service Firebase (Paramètres du projet › Comptes de service › Générer une nouvelle clé privée).' };
  return { ok: true, projectId: j.project_id, email: j.client_email, json: j };
}

async function accessToken(sa, fetchImpl, scope = 'https://www.googleapis.com/auth/firebase.messaging') {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3000,
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${head}.${claim}`);
  const jwt = `${head}.${claim}.${b64url(signer.sign(sa.private_key))}`;
  const r = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Connexion à Google refusée : ${j.error_description || j.error || r.status}. Vérifie la clé du compte de service.`);
  return j.access_token;
}

// Nom réel du sujet pour une application : même règle que l'application (Push.topic).
function appTopic(appId, topic) {
  const p = `${String(appId || '').replace(/\./g, '_')}__`;
  const t = String(topic || 'all').replace(/^\/topics\//, '').replace(/[^a-zA-Z0-9\-_.~%]/g, '_');
  return !appId || t.startsWith(p) ? t : p + t;
}

async function sendTest({
  serviceAccount, title, body, url, image, topic, token, appId,
}, fetchImpl) {
  const sa = parseServiceAccount(serviceAccount);
  if (!sa.ok) throw new Error(sa.error);
  const tok = await accessToken(sa.json, fetchImpl);
  const message = {
    notification: { title: String(title || 'Test'), body: String(body || '') },
    android: { priority: 'high', notification: { channel_id: 'vt_default', ...(image ? { image } : {}) } },
    data: { ...(url ? { url } : {}), source: 'vitrine', ...(appId ? { vt_app: String(appId) } : {}) },
  };
  // Le sujet est propre à l'application : un envoi ne touche jamais les autres applications.
  if (token) message.token = String(token).trim(); else message.topic = appTopic(appId, topic);
  if (appId) message.android.restricted_package_name = String(appId);
  const r = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(sa.projectId)}/messages:send`, {
    method: 'POST', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: JSON.stringify({ message }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const st = j.error && (j.error.status || j.error.message);
    const hint = /UNREGISTERED|NOT_FOUND/.test(String(st)) ? ' Le jeton n’est plus valide (application désinstallée ou réinstallée).' : /PERMISSION_DENIED/.test(String(st)) ? ' Active l’API « Firebase Cloud Messaging » du projet et vérifie que la clé appartient bien à ce projet.' : /INVALID_ARGUMENT/.test(String(st)) ? ' Un champ est invalide (jeton, sujet ou adresse d’image).' : '';
    throw new Error(`Envoi refusé (${r.status}) : ${(j.error && j.error.message) || st || 'erreur inconnue'}.${hint}`);
  }
  return { ok: true, name: j.name, projectId: sa.projectId, topic: message.topic || null };
}

module.exports = {
  PushKit, appTopic, accessToken, parseGoogleServices, firebaseValuesXml, parseServiceAccount, sendTest, mergeManifests, parsePom, cmpVer,
};
