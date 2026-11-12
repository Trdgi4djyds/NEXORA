'use strict';
/* Outils de construction Android : détection (Android Studio, SDK existant, JDK) et installation
 * à la demande depuis les dépôts officiels (Google, Adoptium, GitHub), avec vérification des sommes. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { extract } = require('./zip');
const { resumableDownload } = require('../download');

const IS_WIN = process.platform === 'win32';
const EXE = IS_WIN ? '.exe' : '';
const GOOGLE_REPO = 'https://dl.google.com/android/repository/';
const REPO_XML = `${GOOGLE_REPO}repository2-3.xml`;
const HOST_OS = IS_WIN ? 'windows' : process.platform === 'darwin' ? 'macosx' : 'linux';
const TARGET_API = 36;
const MIN_BUILD_TOOLS = 35;

// Paquets connus (repli si le dépôt n'est pas lisible) : nom, empreinte SHA-1.
const PINNED = {
  windows: {
    'build-tools;36.0.0': ['build-tools_r36_windows.zip', 'f16ccffd34de8790dede813a6c7d8e2c11a27b50'],
    'platforms;android-36': ['platform-36_r02.zip', '2c1a80dd4d9f7d0e6dd336ec603d9b5c55a6f576'],
    'platform-tools': ['platform-tools_r37.0.1-win.zip', 'e03e78b1d80b396f1c3358e31251cb31740e1110'],
  },
  linux: {
    'build-tools;36.0.0': ['build-tools_r36_linux.zip', 'b0b6376977657e8ad9b969bacf4093601da2c6fb'],
    'platforms;android-36': ['platform-36_r02.zip', '2c1a80dd4d9f7d0e6dd336ec603d9b5c55a6f576'],
    'platform-tools': ['platform-tools_r37.0.1-linux.zip', '477254aa5f903c15cf51001717bdf347fb6b53e0'],
  },
  macosx: {
    'build-tools;36.0.0': ['build-tools_r36_macosx.zip', '199ae0047ee61e842f8ee0c6d3918e44fb9a1f83'],
    'platforms;android-36': ['platform-36_r02.zip', '2c1a80dd4d9f7d0e6dd336ec603d9b5c55a6f576'],
    'platform-tools': ['platform-tools_r37.0.1-darwin.zip', '6ae73f4de6452dc57e62ec02b68eed92a4c21661'],
  },
};

const SDK_LICENSE_URL = 'https://developer.android.com/studio/terms';

function exists(p) { try { return fs.statSync(p).isFile(); } catch { return false; } }
function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }
function run(file, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, maxBuffer: 64 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || ''), error: err });
    });
  });
}

class Toolchain {
  constructor({ home, fetch, log = () => {} }) {
    this.home = home; // dossier privé de NEXORA pour les outils téléchargés
    this.fetch = fetch;
    this.log = log;
    this.found = null;
  }

  get sdkDir() { return path.join(this.home, 'sdk'); }

  sdkRoots() {
    const env = process.env;
    const local = env.LOCALAPPDATA || '';
    const home = os.homedir();
    return [
      this.sdkDir, env.ANDROID_HOME, env.ANDROID_SDK_ROOT,
      local && path.join(local, 'Android', 'Sdk'), path.join(home, 'AppData', 'Local', 'Android', 'Sdk'),
      path.join(home, 'Android', 'Sdk'), path.join(home, 'Library', 'Android', 'sdk'),
    ].filter((p, i, a) => p && a.indexOf(p) === i && isDir(p));
  }

  javaHomes() {
    const env = process.env;
    const pf = env.ProgramFiles || 'C:\\Program Files';
    const local = env.LOCALAPPDATA || '';
    const cands = [];
    if (isDir(this.home)) for (const d of fs.readdirSync(this.home)) if (/^jdk/i.test(d)) cands.push(path.join(this.home, d));
    cands.push(
      env.JAVA_HOME,
      path.join(pf, 'Android', 'Android Studio', 'jbr'), local && path.join(local, 'Programs', 'Android Studio', 'jbr'),
      '/Applications/Android Studio.app/Contents/jbr/Contents/Home', '/opt/android-studio/jbr', path.join(os.homedir(), 'android-studio', 'jbr'),
    );
    for (const base of [path.join(pf, 'Eclipse Adoptium'), path.join(pf, 'Java'), path.join(pf, 'Microsoft'), path.join(pf, 'Zulu'), '/usr/lib/jvm']) {
      if (isDir(base)) for (const d of fs.readdirSync(base)) cands.push(path.join(base, d));
    }
    // JDK présent dans le PATH.
    for (const dir of String(env.PATH || '').split(path.delimiter)) {
      if (exists(path.join(dir, `java${EXE}`)) && exists(path.join(dir, `jarsigner${EXE}`))) cands.push(path.dirname(dir));
    }
    return cands.filter((p, i, a) => p && a.indexOf(p) === i && exists(path.join(p, 'bin', `java${EXE}`)) && exists(path.join(p, 'bin', `jarsigner${EXE}`)) && exists(path.join(p, 'bin', `keytool${EXE}`)));
  }

  async javaVersion(javaHome) {
    const r = await run(path.join(javaHome, 'bin', `java${EXE}`), ['-version']);
    const m = /version "(\d+)(?:\.(\d+))?/.exec(r.stderr + r.stdout);
    if (!m) return 0;
    return Number(m[1]) === 1 ? Number(m[2]) : Number(m[1]);
  }

  /* État des outils : { buildTools, platform, platformTools, java, bundletool, ready, missing[] }. */
  async detect() {
    const out = {
      buildTools: null, platform: null, platformTools: null, java: null, bundletool: null,
    };
    for (const root of this.sdkRoots()) {
      const bt = path.join(root, 'build-tools');
      if (!out.buildTools && isDir(bt)) {
        const versions = fs.readdirSync(bt).filter((v) => /^\d+/.test(v) && Number(v.split('.')[0]) >= MIN_BUILD_TOOLS).sort((a, b) => cmpVer(b, a));
        for (const v of versions) {
          const d = path.join(bt, v);
          if (exists(path.join(d, `aapt2${EXE}`)) && exists(path.join(d, `zipalign${EXE}`)) && exists(path.join(d, 'lib', 'apksigner.jar'))) {
            out.buildTools = { dir: d, version: v, aapt2: path.join(d, `aapt2${EXE}`), zipalign: path.join(d, `zipalign${EXE}`), apksigner: path.join(d, 'lib', 'apksigner.jar') };
            break;
          }
        }
      }
      const pf = path.join(root, 'platforms');
      if (!out.platform && isDir(pf)) {
        const apis = fs.readdirSync(pf).map((d) => [d, Number((/^android-(\d+)$/.exec(d) || [])[1])]).filter(([, n]) => n >= TARGET_API).sort((a, b) => b[1] - a[1]);
        for (const [d, n] of apis) {
          const jar = path.join(pf, d, 'android.jar');
          if (exists(jar)) { out.platform = { api: n, jar }; break; }
        }
      }
      const adb = path.join(root, 'platform-tools', `adb${EXE}`);
      if (!out.platformTools && exists(adb)) out.platformTools = { adb };
    }
    for (const jh of this.javaHomes()) {
      // eslint-disable-next-line no-await-in-loop
      const v = await this.javaVersion(jh);
      if (v >= 17) {
        out.java = {
          home: jh, version: v, java: path.join(jh, 'bin', `java${EXE}`), keytool: path.join(jh, 'bin', `keytool${EXE}`), jarsigner: path.join(jh, 'bin', `jarsigner${EXE}`),
        };
        break;
      }
    }
    const bundletool = path.join(this.home, 'bundletool.jar');
    if (exists(bundletool)) out.bundletool = { jar: bundletool };
    out.missing = [];
    if (!out.buildTools) out.missing.push('build-tools');
    if (!out.platform) out.missing.push('platform');
    if (!out.java) out.missing.push('java');
    out.ready = out.missing.length === 0;
    this.found = out;
    return out;
  }

  // ------------------------------------------------------------------ téléchargements
  async download(url, file, { sha1, sha256, onProgress } = {}) {
    // Reprise automatique d'un téléchargement interrompu (fichier « .part »).
    const r = await resumableDownload(this.fetch, url, file, { sha1, sha256, onProgress });
    if (r.resumed) this.log(`Téléchargement repris : ${path.basename(file)}`);
    return r.file;
  }

  async googlePackages() {
    try {
      const res = await this.fetch(REPO_XML);
      if (!res.ok) throw new Error(String(res.status));
      return parseRepository(await res.text(), HOST_OS);
    } catch (err) {
      this.log(`Dépôt Google illisible (${err.message}) : versions connues utilisées.`);
      const pinned = {};
      for (const [k, [url, sha1]] of Object.entries(PINNED[HOST_OS] || PINNED.linux)) pinned[k] = { url, sha1 };
      return pinned;
    }
  }

  /* Installe ce qui manque. parts : sous-ensemble de ['build-tools', 'platform', 'platform-tools', 'java', 'bundletool'].
   * onStep({ part, label, progress }) */
  async install(parts, onStep = () => {}) {
    const tmp = path.join(this.home, 'downloads');
    fs.mkdirSync(tmp, { recursive: true });
    const google = parts.some((p) => ['build-tools', 'platform', 'platform-tools'].includes(p)) ? await this.googlePackages() : {};
    const pick = (prefix) => {
      if (google[prefix]) return [prefix, google[prefix]];
      const keys = Object.keys(google).filter((k) => k.startsWith(prefix) && !/rc|preview/i.test(k)).sort((a, b) => cmpVer(b.split(';')[1] || '', a.split(';')[1] || ''));
      return keys.length ? [keys[0], google[keys[0]]] : null;
    };
    for (const part of parts) {
      if (part === 'build-tools' || part === 'platform' || part === 'platform-tools') {
        const choice = part === 'build-tools' ? (pick('build-tools;36.0.0') || pick('build-tools;'))
          : part === 'platform' ? pick(`platforms;android-${TARGET_API}`) : pick('platform-tools');
        if (!choice) throw new Error(`Paquet introuvable dans le dépôt Google : ${part}`);
        const [id, pkg] = choice;
        const label = part === 'build-tools' ? `Outils de compilation Android ${id.split(';')[1]}` : part === 'platform' ? `Plateforme Android ${TARGET_API}` : 'Outils de connexion au téléphone (adb)';
        const url = /^https?:/.test(pkg.url) ? pkg.url : GOOGLE_REPO + pkg.url;
        const zipFile = path.join(tmp, path.basename(pkg.url));
        // eslint-disable-next-line no-await-in-loop
        await this.download(url, zipFile, { sha1: pkg.sha1, onProgress: (p) => onStep({ part, label, progress: p * 0.85 }) });
        const dest = part === 'build-tools' ? path.join(this.sdkDir, 'build-tools', id.split(';')[1])
          : part === 'platform' ? path.join(this.sdkDir, 'platforms', `android-${TARGET_API}`) : path.join(this.sdkDir, 'platform-tools');
        fs.rmSync(dest, { recursive: true, force: true });
        onStep({ part, label, progress: 0.86, extracting: true });
        // eslint-disable-next-line no-await-in-loop
        await extract(zipFile, dest, { strip: 1, onProgress: (p) => onStep({ part, label, progress: 0.86 + p * 0.14, extracting: true }) });
        fs.rmSync(zipFile, { force: true });
        onStep({ part, label, progress: 1 });
      } else if (part === 'java') {
        const label = 'Java (Eclipse Temurin JDK 21)';
        const osName = IS_WIN ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
        const arch = process.arch === 'arm64' ? 'aarch64' : 'x64';
        // eslint-disable-next-line no-await-in-loop
        const res = await this.fetch(`https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=${arch}&image_type=jdk&os=${osName}&vendor=eclipse`);
        if (!res.ok) throw new Error(`Service Adoptium indisponible (${res.status})`);
        // eslint-disable-next-line no-await-in-loop
        const list = await res.json();
        const bin = list && list[0] && list[0].binary && list[0].binary.package;
        if (!bin) throw new Error('JDK introuvable chez Adoptium');
        const file = path.join(tmp, bin.name);
        // eslint-disable-next-line no-await-in-loop
        await this.download(bin.link, file, { sha256: bin.checksum, onProgress: (p) => onStep({ part, label, progress: p * 0.8 }) });
        const dest = path.join(this.home, 'jdk-21');
        fs.rmSync(dest, { recursive: true, force: true });
        onStep({ part, label, progress: 0.82, extracting: true });
        if (/\.zip$/i.test(file)) {
          // eslint-disable-next-line no-await-in-loop
          await extract(file, dest, { strip: 1, onProgress: (p) => onStep({ part, label, progress: 0.82 + p * 0.18, extracting: true }) });
        } else {
          fs.mkdirSync(dest, { recursive: true });
          // eslint-disable-next-line no-await-in-loop
          const r = await run('tar', ['-xzf', file, '-C', dest, '--strip-components', process.platform === 'darwin' ? '3' : '1']);
          if (r.code) throw new Error(`Extraction du JDK impossible : ${r.stderr}`);
        }
        fs.rmSync(file, { force: true });
        onStep({ part, label, progress: 1 });
      } else if (part === 'bundletool') {
        const label = 'bundletool (format AAB pour le Play Store)';
        // eslint-disable-next-line no-await-in-loop
        const res = await this.fetch('https://api.github.com/repos/google/bundletool/releases/latest');
        // NEXORA #115 : messages sans nom de service ni d'outil (affichés par NEX-OUTILS et l'App Builder).
        if (!res.ok) throw new Error(`Service de téléchargement indisponible (${res.status}) : réessayez plus tard.`);
        // eslint-disable-next-line no-await-in-loop
        const rel = await res.json();
        const asset = (rel.assets || []).find((a) => /^bundletool-all-.*\.jar$/.test(a.name));
        if (!asset) throw new Error('Bibliothèque du format Play Store introuvable : réessayez plus tard.');
        // eslint-disable-next-line no-await-in-loop
        await this.download(asset.browser_download_url, path.join(this.home, 'bundletool.jar'), { onProgress: (p) => onStep({ part, label, progress: p }) });
        onStep({ part, label, progress: 1 });
      }
    }
    return this.detect();
  }
}

function cmpVer(a, b) {
  const pa = String(a).split(/[.-]/).map((x) => Number(x) || 0);
  const pb = String(b).split(/[.-]/).map((x) => Number(x) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

// Dépôt Google (repository2-3.xml) : { 'build-tools;36.0.0': { url, sha1, size }, ... } pour le système donné.
function parseRepository(xml, hostOs) {
  const out = {};
  const re = /<remotePackage path="([^"]+)">([\s\S]*?)<\/remotePackage>/g;
  let m;
  while ((m = re.exec(xml))) {
    const [, id, body] = m;
    if (!/^(build-tools;|platforms;android-\d+$|platform-tools$)/.test(id)) continue;
    if (/<channelRef ref="channel-[1-9]"/.test(body)) continue; // préversions
    const archives = body.match(/<archive>[\s\S]*?<\/archive>/g) || [];
    for (const a of archives) {
      const host = /<host-os>([^<]+)<\/host-os>/.exec(a);
      if (host && host[1] !== hostOs) continue;
      const url = /<url>([^<]+)<\/url>/.exec(a);
      const sha1 = /<checksum[^>]*>([^<]+)<\/checksum>/.exec(a);
      const size = /<size>(\d+)<\/size>/.exec(a);
      if (url) out[id] = { url: url[1], sha1: sha1 ? sha1[1] : null, size: size ? Number(size[1]) : 0 };
    }
  }
  return out;
}

module.exports = {
  Toolchain, parseRepository, run, SDK_LICENSE_URL, TARGET_API, cmpVer,
};
