'use strict';
/* NEXORA #016 : outils de développement indispensables aux projets importés (Node.js, Flutter, Python,
 * PHP…), téléchargés depuis leurs sources officielles et installés dans un dossier privé de NEXORA, sans
 * droits d'administrateur.
 *
 * Pour chaque outil : recherche de la dernière version stable, téléchargement avec reprise et
 * vérification de l'empreinte SHA-256 quand la source la publie, décompression, configuration (PATH de
 * NEXORA et, au choix, PATH de ton compte Windows, réglages propres à l'outil), puis contrôle par sa
 * commande de version. Les dépendances passent d'abord (Git avant Flutter, PHP avant Composer…).
 *
 * La détection (detect) relie l'analyse d'un projet (frameworks.js) aux outils présents (sdk.js). */
const { LIB_MSG } = require('./plain');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const { spawn } = require('child_process');
const { resumableDownload } = require('./download');
const { extract } = require('./android/zip');
const sdk = require('./sdk');
const { pathKey } = require('./isolation');

const IS_WIN = process.platform === 'win32';

// Ordre d'affichage dans le gestionnaire d'outils.
const ORDER = ['node', 'pnpm', 'yarn', 'bun', 'deno', 'python', 'php', 'composer', 'ruby', 'bundler', 'go', 'dotnet', 'hugo', 'flutter', 'git'];

const ghLatest = async (ctx, repo, re) => {
  const rel = await ctx.json(`https://api.github.com/repos/${repo}/releases/latest`);
  const asset = (rel.assets || []).find((a) => re.test(a.name));
  if (!asset) throw new Error(`Aucun fichier pour Windows dans la dernière version publiée (${repo}).`);
  const digest = String(asset.digest || '');
  return {
    version: String(rel.tag_name || '').replace(/^v/, '').replace(/^RubyInstaller-/, ''),
    url: asset.browser_download_url,
    file: asset.name,
    sha256: digest.startsWith('sha256:') ? digest.slice(7) : null,
    size: asset.size,
  };
};
const winArm = () => process.arch === 'arm64';
// Une version récente d'un langage n'a pas toujours ses paquets compilés : on prend la dernière
// version corrective de l'avant-dernière branche (par exemple 3.14.x quand 3.15 vient de sortir).
function previousMinor(versions) {
  const stable = versions.filter((v) => /^\d+\.\d+\.\d+$/.test(v));
  const key = (v) => v.split('.').map(Number);
  stable.sort((a, b) => { const x = key(a); const y = key(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; });
  const minors = [...new Set(stable.map((v) => v.split('.').slice(0, 2).join('.')))];
  const pick = minors.length > 1 ? minors[minors.length - 2] : minors[0];
  return stable.filter((v) => v.startsWith(`${pick}.`)).pop();
}

/*
 * Recettes (Windows) : resolve(ctx) rend { version, url, file, sha256?, size?, strip? } ; kind indique
 * comment installer le fichier : zip (décompressé), file (copié), exe (installateur silencieux),
 * script (PowerShell officiel), npm (paquet global dans le dossier de l'outil), cmd (commande seule).
 */
const RECIPES = {
  node: {
    kind: 'zip', size: '≈ 35 Mo', bins: ['.'],
    async resolve(ctx) {
      const plat = winArm() ? 'win-arm64' : 'win-x64';
      const index = await ctx.json('https://nodejs.org/dist/index.json');
      const rel = index.find((r) => r.lts && (r.files || []).includes(`${plat}-zip`));
      if (!rel) throw new Error('Aucune version LTS de Node.js trouvée pour Windows.');
      const file = `node-${rel.version}-${plat}.zip`;
      const sums = await ctx.text(`https://nodejs.org/dist/${rel.version}/SHASUMS256.txt`);
      const line = sums.split('\n').find((l) => l.trim().endsWith(`  ${file}`));
      return { version: rel.version.slice(1), url: `https://nodejs.org/dist/${rel.version}/${file}`, file, sha256: line ? line.split(/\s+/)[0] : null, strip: 1 };
    },
  },
  // Node.js 25 et plus ne fournissent plus Corepack : pnpm et Yarn s'installent avec npm dans leur dossier.
  pnpm: { kind: 'npm', pkg: 'pnpm', deps: ['node'], size: '≈ 10 Mo', bins: ['.'] },
  yarn: { kind: 'npm', pkg: 'yarn', deps: ['node'], size: '≈ 5 Mo', bins: ['.'] },
  bun: {
    kind: 'zip', size: '≈ 55 Mo', bins: ['.'],
    async resolve(ctx) { return { ...await ghLatest(ctx, 'oven-sh/bun', winArm() ? /^bun-windows-aarch64\.zip$/ : /^bun-windows-x64\.zip$/), strip: 1 }; },
  },
  deno: {
    kind: 'zip', size: '≈ 45 Mo', bins: ['.'],
    async resolve(ctx) { return { ...await ghLatest(ctx, 'denoland/deno', winArm() ? /^deno-aarch64-pc-windows-msvc\.zip$/ : /^deno-x86_64-pc-windows-msvc\.zip$/), strip: 0 }; },
  },
  git: {
    kind: 'zip', size: '≈ 40 Mo', bins: ['cmd'],
    async resolve(ctx) { return { ...await ghLatest(ctx, 'git-for-windows/git', winArm() ? /^MinGit-[\d.]+-arm64\.zip$/ : /^MinGit-[\d.]+-64-bit\.zip$/), strip: 0 }; },
  },
  flutter: {
    kind: 'zip', deps: ['git'], size: '≈ 1,2 Go', bins: ['bin'], noSpaces: true,
    async resolve(ctx) {
      const data = await ctx.json('https://storage.googleapis.com/flutter_infra_release/releases/releases_windows.json');
      const hash = data.current_release && data.current_release.stable;
      const rel = (data.releases || []).find((r) => r.hash === hash && r.channel === 'stable');
      if (!rel) throw new Error('Version stable de Flutter introuvable.');
      return { version: rel.version, url: `${data.base_url}/${rel.archive}`, file: path.basename(rel.archive), sha256: rel.sha256, strip: 1 };
    },
    async configure(ctx, dir) {
      const flutter = `"${path.join(dir, 'bin', 'flutter.bat')}"`;
      await ctx.cmd(`${flutter} config --no-analytics`, 'Désactivation des statistiques de Flutter', { allowFail: true });
      await ctx.cmd(`${flutter} config --enable-web`, 'Activation de la version web');
      // Premier lancement : Flutter télécharge le SDK Dart et ses outils (une à trois minutes).
      await ctx.cmd(`${flutter} --version`, 'Premier lancement de Flutter (téléchargement du SDK Dart)', { timeout: 30 * 60000 });
    },
  },
  python: {
    kind: 'zip', size: '≈ 17 Mo', bins: ['tools', path.join('tools', 'Scripts')],
    async resolve(ctx) {
      const { versions } = await ctx.json('https://api.nuget.org/v3-flatcontainer/python/index.json');
      const v = previousMinor(versions || []);
      if (!v) throw new Error('Version de Python introuvable.');
      return { version: v, url: `https://api.nuget.org/v3-flatcontainer/python/${v}/python.${v}.nupkg`, file: `python-${v}.zip`, strip: 0 };
    },
    async configure(ctx, dir) {
      // Scripts reçoit pip et les outils installés ensuite : créé tout de suite pour figurer dans le PATH.
      fs.mkdirSync(path.join(dir, 'tools', 'Scripts'), { recursive: true });
      ctx.applyPath();
      const py = `"${path.join(dir, 'tools', 'python.exe')}"`;
      const ok = await ctx.cmd(`${py} -m pip --version`, 'Vérification de pip', { allowFail: true });
      if (!ok) await ctx.cmd(`${py} -m ensurepip --default-pip`, 'Installation de pip');
    },
  },
  php: {
    kind: 'zip', size: '≈ 35 Mo', bins: ['.'],
    async resolve(ctx) {
      const data = await ctx.json('https://windows.php.net/downloads/releases/releases.json');
      const keys = Object.keys(data).sort((a, b) => { const x = a.split('.').map(Number); const y = b.split('.').map(Number); return y[0] - x[0] || y[1] - x[1]; });
      for (const k of keys) {
        const build = data[k]['nts-vs17-x64'] || data[k]['nts-vs16-x64'];
        if (build && build.zip) return { version: data[k].version, url: `https://windows.php.net/downloads/releases/${build.zip.path}`, file: build.zip.path, sha256: build.zip.sha256, strip: 0 };
      }
      throw new Error('Version de PHP pour Windows introuvable.');
    },
    async configure(ctx, dir) {
      // php.ini de développement avec les extensions qu'attendent Laravel, Symfony et Composer.
      const src = path.join(dir, 'php.ini-development');
      let ini = fs.existsSync(src) ? fs.readFileSync(src, 'utf8') : '';
      ini = ini.replace(/^;\s*extension_dir\s*=\s*"ext"\s*$/m, 'extension_dir = "ext"');
      for (const ext of ['curl', 'fileinfo', 'gd', 'intl', 'mbstring', 'mysqli', 'openssl', 'pdo_mysql', 'pdo_sqlite', 'sodium', 'sqlite3', 'zip']) {
        ini = ini.replace(new RegExp(`^;(extension=${ext})\\s*$`, 'm'), '$1');
      }
      let tz = '';
      try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { tz = ''; }
      if (tz) ini = ini.replace(/^;\s*date\.timezone\s*=.*$/m, `date.timezone = ${tz}`);
      if (ini) fs.writeFileSync(path.join(dir, 'php.ini'), ini);
      ctx.log('php.ini créé (extensions curl, fileinfo, gd, intl, mbstring, openssl, pdo, sqlite, zip…).');
      // PHP pour Windows a besoin du runtime Visual C++ 2015-2022 de Microsoft.
      const sys = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
      if (!fs.existsSync(path.join(sys, 'vcruntime140_1.dll'))) {
        ctx.step('Runtime Visual C++ de Microsoft (nécessaire à PHP)', 0.9);
        const file = path.join(ctx.downloads, 'vc_redist.x64.exe');
        await ctx.download('https://aka.ms/vs/17/release/vc_redist.x64.exe', file, {}, 0.9, 0.94);
        ctx.log('Windows va demander ton accord pour installer le runtime Visual C++.');
        await ctx.exec(file, ['/install', '/quiet', '/norestart'], 'Installation du runtime Visual C++', { allowFail: true });
      }
    },
  },
  composer: {
    kind: 'file', deps: ['php'], size: '≈ 3 Mo', bins: ['.'],
    async resolve(ctx) {
      const sum = await ctx.text('https://getcomposer.org/download/latest-stable/composer.phar.sha256sum').catch(() => '');
      return { version: 'stable', url: 'https://getcomposer.org/download/latest-stable/composer.phar', file: 'composer.phar', sha256: (sum.trim().split(/\s+/)[0] || '').length === 64 ? sum.trim().split(/\s+/)[0] : null };
    },
    async configure(ctx, dir) {
      fs.writeFileSync(path.join(dir, 'composer.bat'), '@php "%~dp0composer.phar" %*\r\n');
    },
  },
  ruby: {
    kind: 'exe', size: '≈ 140 Mo', bins: ['bin'],
    async resolve(ctx) { return ghLatest(ctx, 'oneclick/rubyinstaller2', /^rubyinstaller-devkit-[\d.]+-\d+-x64\.exe$/); },
    // Installateur Inno Setup : silencieux, pour ton compte seulement, dans le dossier de NEXORA ; PATH géré par NEXORA.
    args: (dir) => ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', '/CURRENTUSER', `/DIR=${dir}`, '/TASKS=defaultutf8'],
    async configure(ctx, dir) {
      const bundle = `"${path.join(dir, 'bin', 'bundle.bat')}"`;
      const ok = fs.existsSync(path.join(dir, 'bin', 'bundle.bat')) && await ctx.cmd(`${bundle} --version`, 'Vérification de Bundler', { allowFail: true });
      if (!ok) await ctx.cmd(`"${path.join(dir, 'bin', 'gem.cmd')}" install bundler --no-document`, 'Installation de Bundler');
    },
  },
  bundler: { kind: 'cmd', deps: ['ruby'], size: '< 1 Mo', bins: [], command: 'gem install bundler --no-document' },
  go: {
    kind: 'zip', size: '≈ 80 Mo', bins: ['bin'],
    async resolve(ctx) {
      const list = await ctx.json('https://go.dev/dl/?mode=json');
      const rel = list.find((r) => r.stable);
      const f = rel && rel.files.find((x) => x.os === 'windows' && x.arch === (winArm() ? 'arm64' : 'amd64') && x.kind === 'archive');
      if (!f) throw new Error('Version de Go pour Windows introuvable.');
      return { version: rel.version.replace(/^go/, ''), url: `https://go.dev/dl/${f.filename}`, file: f.filename, sha256: f.sha256, strip: 1 };
    },
  },
  hugo: {
    kind: 'zip', size: '≈ 25 Mo', bins: ['.'],
    async resolve(ctx) { return { ...await ghLatest(ctx, 'gohugoio/hugo', winArm() ? /^hugo_[\d.]+_windows-arm64\.zip$/ : /^hugo_extended_[\d.]+_windows-amd64\.zip$/), strip: 0 }; },
  },
  dotnet: {
    kind: 'script', size: '≈ 220 Mo', bins: ['.'],
    env: (dir) => ({ DOTNET_ROOT: dir, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1' }),
    async resolve() { return { version: 'LTS', url: 'https://dot.net/v1/dotnet-install.ps1', file: 'dotnet-install.ps1' }; },
    args: (dir, file) => ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file, '-Channel', 'LTS', '-InstallDir', dir, '-NoPath'],
  },
};

// Dossier des outils : sous Windows, dans les données locales (pas dans le profil itinérant, ces outils sont lourds).
function defaultHome(userData) {
  if (process.env.NEXORA_TOOLS_HOME) return process.env.NEXORA_TOOLS_HOME;
  if (IS_WIN && process.env.LOCALAPPDATA) return path.join(process.env.LOCALAPPDATA, 'NEXORA', 'tools');
  return path.join(userData, 'tools');
}
const hasSpecialChars = (p) => /[\s()&!%^,;=']|[^\x20-\x7e]/.test(p);
const major = (v) => { const m = /(\d+)\.\d+/.exec(String(v || '')); return m ? Number(m[1]) : 0; };

function runCommand(command, { cwd, env, timeout = 15 * 60000, onLine, shell = true, args = null } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = args ? spawn(command, args, { cwd, env, windowsHide: true, shell: false }) : spawn(command, { cwd, env, windowsHide: true, shell });
    } catch (err) { if (onLine) onLine(err.message); resolve({ code: 1, child: null }); return; }
    let buf = '';
    const feed = (d) => {
      buf += d.toString('utf8');
      const lines = buf.split(/\r?\n|\r/);
      buf = lines.pop();
      for (const l of lines) if (l.trim() && onLine) onLine(l.trim());
    };
    if (child.stdout) child.stdout.on('data', feed);
    if (child.stderr) child.stderr.on('data', feed);
    const timer = setTimeout(() => { try { child.kill(); } catch { /* arrêté */ } }, timeout);
    child.on('error', (err) => { clearTimeout(timer); if (onLine) onLine(err.message); resolve({ code: 1 }); });
    child.on('exit', (code) => { clearTimeout(timer); if (buf.trim() && onLine) onLine(buf.trim()); resolve({ code: code == null ? 1 : code }); });
    runCommand.current = child;
  });
}

class Tools extends EventEmitter {
  constructor({ home, fetchImpl }) {
    super();
    this.home = home;
    this.fetch = fetchImpl;
    this.busy = null;
    this.abort = null;
    this.applied = [];
    this.recent = new Map();
    this.manifest = this.load();
    this.applyToProcess();
  }

  get manifestFile() { return path.join(this.home, 'tools.json'); }
  load() { try { const m = JSON.parse(fs.readFileSync(this.manifestFile, 'utf8')); return { tools: m.tools || {}, userPath: m.userPath !== false }; } catch { return { tools: {}, userPath: true }; } }
  save() { fs.mkdirSync(this.home, { recursive: true }); fs.writeFileSync(this.manifestFile, JSON.stringify(this.manifest, null, 2)); }

  supported(id) { return IS_WIN && Boolean(RECIPES[id]); }

  /** Dossiers et variables des outils installés par NEXORA, placés avant ceux du système. */
  applyToProcess() {
    const key = pathKey(process.env);
    const bins = [];
    for (const t of Object.values(this.manifest.tools)) {
      for (const b of t.bins || []) if (fs.existsSync(b)) bins.push(b);
      for (const [k, v] of Object.entries(t.env || {})) process.env[k] = v;
    }
    const norm = (p) => path.resolve(p).toLowerCase();
    const drop = new Set([...this.applied, ...bins].map(norm));
    const rest = String(process.env[key] || '').split(path.delimiter).filter((p) => p && !drop.has(norm(p)));
    process.env[key] = [...bins, ...rest].join(path.delimiter);
    this.applied = bins;
    if (sdk.setPreferred) sdk.setPreferred(bins);
  }

  async json(url) {
    const res = await this.fetch(url, { headers: { 'User-Agent': 'NEXORA', Accept: 'application/json' }, signal: this.abort && this.abort.signal });
    if (!res.ok) throw new Error(`Source de téléchargement indisponible (erreur ${res.status}). Vérifie ta connexion, puis réessaie.`);
    return res.json();
  }

  async text(url) {
    const res = await this.fetch(url, { headers: { 'User-Agent': 'NEXORA' }, signal: this.abort && this.abort.signal });
    if (!res.ok) throw new Error(`Source de téléchargement indisponible (erreur ${res.status}).`);
    return res.text();
  }

  /** État de chaque outil connu (gestionnaire d'outils). */
  async status() {
    const ids = ORDER.filter((id) => sdk.SDKS[id]);
    const checks = await Promise.all(ids.map((id) => sdk.checkSdk(id)));
    return {
      platform: process.platform,
      home: this.home,
      userPath: this.manifest.userPath,
      busy: this.busy,
      tools: ids.map((id, i) => this.entry(id, checks[i])),
    };
  }

  entry(id, check) {
    const d = sdk.describe(id) || { label: id, steps: [] };
    const m = this.manifest.tools[id];
    return {
      id, label: d.label, why: d.why, url: d.url, steps: d.steps,
      ok: Boolean(check && check.ok), version: (check && check.version) || null,
      auto: this.supported(id), size: RECIPES[id] ? RECIPES[id].size : null,
      deps: (RECIPES[id] && RECIPES[id].deps) || [],
      managed: m ? { version: m.version, dir: m.dir } : null,
    };
  }

  /** Outils indispensables à un projet analysé, avec ceux qui manquent ou sont trop anciens. */
  async detect(a) {
    const ids = [...new Set(a.sdks || [])];
    const checks = await Promise.all(ids.map((id) => sdk.checkSdk(id, { fresh: true })));
    const tools = ids.map((id, i) => {
      const t = this.entry(id, checks[i]);
      const need = a.minVersions && a.minVersions[id];
      if (t.ok && need && major(t.version) && major(t.version) < need) {
        t.ok = false;
        t.outdated = { have: t.version, need };
      }
      return t;
    });
    return {
      dir: a.dir, name: a.name, kind: a.kind, framework: a.id, label: a.label,
      unsupported: a.unsupported ? { title: a.unsupported.title, message: a.unsupported.message } : null,
      tools, missing: tools.filter((t) => !t.ok).map((t) => t.id),
    };
  }

  /** Détection lancée à l'ouverture ou à l'import d'un projet : un seul avis par dossier toutes les 15 s. */
  announce(a, origin) {
    if (!a || !a.dir) return;
    const key = path.resolve(a.dir).toLowerCase();
    const last = this.recent.get(key) || 0;
    if (Date.now() - last < 15000) return;
    this.recent.set(key, Date.now());
    this.detect(a).then((r) => this.emit('detected', { ...r, origin })).catch(() => {});
  }

  /** Outils à installer, dépendances absentes comprises, dans l'ordre d'installation. */
  async plan(ids) {
    const out = [];
    const visit = async (id, chain = []) => {
      if (out.includes(id) || chain.includes(id) || !RECIPES[id]) return;
      for (const dep of RECIPES[id].deps || []) {
        // eslint-disable-next-line no-await-in-loop
        if (!(await sdk.checkSdk(dep, { fresh: true })).ok) await visit(dep, [...chain, id]);
      }
      out.push(id);
    };
    for (const id of ids) {
      // eslint-disable-next-line no-await-in-loop
      await visit(id);
    }
    return out;
  }

  cancel() {
    if (this.abort) this.abort.abort();
    if (runCommand.current) { try { runCommand.current.kill(); } catch { /* arrêté */ } }
    return true;
  }

  async installMany(ids, { userPath = this.manifest.userPath } = {}) {
    if (!IS_WIN) throw new Error('L\'installation automatique est prévue pour Windows. Suis les étapes indiquées pour ton système.');
    if (this.busy) throw new Error('Une installation est déjà en cours.');
    this.manifest.userPath = userPath !== false;
    const list = await this.plan(ids.filter((id) => RECIPES[id]));
    const done = [];
    this.busy = list.slice();
    this.abort = new AbortController();
    try {
      for (let i = 0; i < list.length; i++) {
        // eslint-disable-next-line no-await-in-loop
        const r = await this.installOne(list[i], { index: i, count: list.length, userPath: this.manifest.userPath });
        done.push(r);
      }
      this.emit('progress', { phase: 'all-done', done });
      return { ok: true, done };
    } catch (err) {
      const cancelled = this.abort && this.abort.signal.aborted;
      const message = cancelled ? 'Installation annulée. Elle reprendra là où elle s\'est arrêtée.' : (err && err.message) || String(err);
      this.emit('progress', { phase: 'error', message, done });
      return { ok: false, cancelled, message, done };
    } finally {
      this.busy = null;
      this.abort = null;
    }
  }

  async installOne(id, { index = 0, count = 1, userPath = true } = {}) {
    const recipe = RECIPES[id];
    const label = (sdk.SDKS[id] && sdk.SDKS[id].label) || id;
    let last = 0;
    const emit = (p) => this.emit('progress', { id, label, index, count, ...p });
    const step = (message, progress) => emit({ phase: 'step', message, progress });
    const log = (line) => emit({ phase: 'log', line: String(line).slice(0, 400) });
    const downloads = path.join(this.home, 'downloads');
    const env = () => ({ ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', NO_UPDATE_NOTIFIER: '1' });
    const ctx = {
      downloads,
      json: (u) => this.json(u),
      text: (u) => this.text(u),
      step,
      log,
      applyPath: () => this.applyToProcess(),
      download: async (url, file, opts, from, to) => {
        const fetchImpl = (u, o) => this.fetch(u, { ...o, signal: this.abort && this.abort.signal });
        await resumableDownload(fetchImpl, url, file, {
          ...opts,
          headers: { 'User-Agent': 'NEXORA' },
          onProgress: (p, got, total) => {
            if (Date.now() - last < 150 && p < 1) return;
            last = Date.now();
            emit({ phase: 'download', progress: from + (to - from) * p, got, total });
          },
        });
      },
      cmd: async (command, title, { allowFail = false, timeout } = {}) => {
        step(title);
        log(`> ${command}`);
        const { code } = await runCommand(command, { env: env(), timeout, onLine: log });
        if (code !== 0 && !allowFail) throw new Error(`${title} : échec (code ${code}). Le détail est dans le journal de l'installation.`);
        return code === 0;
      },
      exec: async (file, args, title, { allowFail = false } = {}) => {
        step(title);
        const { code } = await runCommand(file, { args, env: env(), onLine: log });
        if (code !== 0 && !allowFail) throw new Error(`${title} : échec (code ${code}).`);
        return code === 0;
      },
    };

    emit({ phase: 'start', progress: 0 });
    let dir = path.join(this.home, id);
    // Flutter refuse les chemins avec espaces ou accents (nom d'utilisateur « Jean Dupont ») : dossier à la racine du disque.
    if (recipe.noSpaces && hasSpecialChars(dir)) {
      const alt = path.join(`${process.env.SystemDrive || 'C:'}\\`, 'nexora-tools', id);
      try { fs.mkdirSync(path.dirname(alt), { recursive: true }); dir = alt; } catch { /* on garde le dossier par défaut */ }
    }

    let version = '';
    if (recipe.kind === 'npm') {
      step(`Installation de ${label} avec npm`, 0.1);
      fs.mkdirSync(dir, { recursive: true });
      await ctx.cmd(`npm install -g ${recipe.pkg} --prefix "${dir}" --no-fund --no-audit`, `Installation de ${label}`);
    } else if (recipe.kind === 'cmd') {
      await ctx.cmd(recipe.command, `Installation de ${label}`);
      dir = null;
    } else {
      step('Recherche de la dernière version stable', 0.02);
      const rel = await recipe.resolve(ctx);
      version = rel.version || '';
      log(`${label} ${version} : ${rel.url}`);
      const file = path.join(downloads, rel.file);
      step(LIB_MSG, 0.04);
      await ctx.download(rel.url, file, { sha256: rel.sha256 || undefined }, 0.04, recipe.kind === 'zip' ? 0.7 : 0.8);
      if (rel.sha256) log('Fichier vérifié.');
      if (recipe.kind === 'zip') {
        step('Décompression', 0.72);
        const tmp = `${dir}.new`;
        fs.rmSync(tmp, { recursive: true, force: true });
        await extract(file, tmp, { strip: rel.strip || 0, onProgress: (p) => emit({ phase: 'extract', progress: 0.72 + p * 0.16 }) });
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch {
          throw new Error(`L'ancienne version de ${label} est en cours d'utilisation. Ferme les terminaux et serveurs qui l'utilisent, puis réessaie.`);
        }
        fs.renameSync(tmp, dir);
      } else if (recipe.kind === 'file') {
        fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(file, path.join(dir, rel.file));
      } else if (recipe.kind === 'exe') {
        await ctx.exec(file, recipe.args(dir, file), `Installation de ${label} ${version}`.trim());
      } else if (recipe.kind === 'script') {
        fs.mkdirSync(dir, { recursive: true });
        await ctx.exec('powershell.exe', recipe.args(dir, file), `Installation de ${label} ${version}`.trim());
      }
      try { fs.rmSync(file, { force: true }); } catch { /* fichier gardé, sans conséquence */ }
    }

    if (dir) {
      this.manifest.tools[id] = {
        version, dir, bins: recipe.bins.map((b) => path.join(dir, b)), env: recipe.env ? recipe.env(dir) : {}, at: new Date().toISOString(),
      };
      this.save();
      this.applyToProcess();
    }
    if (recipe.configure) {
      step('Configuration', 0.9);
      await recipe.configure(ctx, dir);
    }
    if (userPath && dir) {
      step('Ajout au PATH de ton compte Windows', 0.96);
      await this.userPath(this.manifest.tools[id].bins, this.manifest.tools[id].env).catch((e) => log(`PATH de Windows non modifié : ${e.message}`));
    }
    step('Vérification', 0.98);
    const check = await sdk.checkSdk(id, { fresh: true });
    if (!check.ok) throw new Error(`${label} est installé${dir ? ` dans ${dir}` : ''}, mais sa commande ne répond pas. Consulte le journal de l'installation.`);
    if (dir && check.version) { this.manifest.tools[id].version = check.version; this.save(); }
    emit({ phase: 'done', progress: 1, version: check.version });
    return { id, label, version: check.version, dir };
  }

  /** Ajoute (ou retire) des dossiers au PATH de ton compte Windows, et des variables d'environnement. */
  userPath(add = [], vars = {}, remove = []) {
    if (!IS_WIN) return Promise.resolve(false);
    const ps = [
      "$p = [Environment]::GetEnvironmentVariable('Path','User'); if (-not $p) { $p = '' }",
      "$parts = @($p -split ';' | Where-Object { $_ })",
      "$rm = @($env:NX_RM -split '\\|' | Where-Object { $_ })",
      "$parts = @($parts | Where-Object { $x = $_.TrimEnd('\\'); -not ($rm | Where-Object { $_.TrimEnd('\\') -ieq $x }) })",
      "foreach ($d in @($env:NX_ADD -split '\\|' | Where-Object { $_ })) { if (-not ($parts | Where-Object { $_.TrimEnd('\\') -ieq $d.TrimEnd('\\') })) { $parts = @($d) + $parts } }",
      "[Environment]::SetEnvironmentVariable('Path', ($parts -join ';'), 'User')",
      "if ($env:NX_VARS) { ($env:NX_VARS | ConvertFrom-Json).PSObject.Properties | ForEach-Object { [Environment]::SetEnvironmentVariable($_.Name, $_.Value, 'User') } }",
    ].join('; ');
    const env = {
      ...process.env, NX_ADD: add.join('|'), NX_RM: remove.join('|'), NX_VARS: Object.keys(vars).length ? JSON.stringify(vars) : '',
    };
    return runCommand('powershell.exe', { args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps], env, timeout: 30000 }).then(({ code }) => {
      if (code !== 0) throw new Error(`PowerShell a répondu ${code}`);
      return true;
    });
  }

  /** Retire un outil installé par NEXORA (dossier, PATH de NEXORA et de ton compte Windows). */
  async remove(id) {
    const m = this.manifest.tools[id];
    if (!m) throw new Error('Cet outil n\'a pas été installé par NEXORA.');
    try { fs.rmSync(m.dir, { recursive: true, force: true }); } catch {
      throw new Error('Des fichiers de cet outil sont en cours d\'utilisation. Ferme les terminaux et serveurs qui l\'utilisent, puis réessaie.');
    }
    delete this.manifest.tools[id];
    this.save();
    this.applyToProcess();
    const vars = Object.fromEntries(Object.keys(m.env || {}).map((k) => [k, '']));
    await this.userPath([], vars, m.bins || []).catch(() => {});
    return true;
  }
}

/* Catalogue d'un PC neuf (aucun outil installé), pour l'aperçu navigateur de NEXORA. */
function catalog(platform = 'win32') {
  return ORDER.filter((id) => sdk.SDKS[id]).map((id) => {
    const d = sdk.describe(id, platform);
    return {
      id, label: d.label, why: d.why, url: d.url, steps: d.steps, ok: false, version: null,
      auto: platform === 'win32' && Boolean(RECIPES[id]), size: RECIPES[id] ? RECIPES[id].size : null,
      deps: (RECIPES[id] && RECIPES[id].deps) || [], managed: null,
    };
  });
}

let shared = null;
module.exports = {
  Tools, RECIPES, ORDER, catalog, defaultHome, previousMinor,
  setShared(t) { shared = t; return t; },
  shared: () => shared,
};
