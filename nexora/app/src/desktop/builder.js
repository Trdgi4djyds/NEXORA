'use strict';
/* NEXORA #023 : construction des logiciels de bureau (Desktop Builder).
 *
 * Étapes : 1. outils (Node.js, installé par le gestionnaire d'outils de NEXORA s'il manque, et kit de construction
 * electron-builder, installé une seule fois dans le dossier de NEXORA) ; 2. moteur Electron (archive officielle
 * téléchargée avec reprise et vérifiée par son empreinte SHA-256, gardée pour les constructions suivantes) ;
 * 3. source (construction du site pour un projet web, dépendances pour un projet Electron) ; 4. projet généré ;
 * 5. emballage et installateur (electron-builder) ; 6. paquet MSI à part, pour qu'un échec n'empêche pas les autres
 * formats ; 7. copie des fichiers d'installation dans le dossier du logiciel (Documents\NEXORA\Logiciels\<nom>).
 *
 * La construction se fait dans un dossier de travail local (pas dans Documents, souvent synchronisé par OneDrive) ;
 * seuls les fichiers finaux sont copiés. Un dossier de sortie déjà utilisé par un autre logiciel n'est jamais
 * réutilisé (fichier .nexora-desktop.json, comme pour l'App Builder). */
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const { spawn } = require('child_process');
const { resumableDownload } = require('../download');
const fsx = require('../fsx');
const sdk = require('../sdk');
const toolsMod = require('../tools');
const { projectEnv } = require('../isolation');
const { techLog } = require('../plain');
const project = require('./project');
const { analyzeDesktopSource } = require('./analyze');

const IS_WIN = process.platform === 'win32';
const OWNER_FILE = '.nexora-desktop.json';
const MIN_NODE = 18;
const MIN_ELECTRON = 30;
// Jetons qui font choisir un service de publication à electron-builder (app-builder-lib 26.18.1,
// resolvePublishConfigurations). NEXORA construit sans publier : ils sont retirés de l'environnement d'electron-builder.
const PUBLISH_TOKENS = ['GH_TOKEN', 'GITHUB_TOKEN', 'GITLAB_TOKEN', 'KEYGEN_TOKEN', 'BITBUCKET_TOKEN', 'BT_TOKEN'];

function defaultHome(userData) {
  if (process.env.NEXORA_DESKTOP_HOME) return process.env.NEXORA_DESKTOP_HOME;
  if (IS_WIN && process.env.LOCALAPPDATA) return path.join(process.env.LOCALAPPDATA, 'NEXORA', 'desktop');
  return path.join(userData, 'desktop');
}
// eslint-disable-next-line no-control-regex
const stripAnsi = (s) => String(s).replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '');
const major = (v) => { const m = /(\d+)/.exec(String(v || '')); return m ? Number(m[1]) : 0; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Commande lancée dans un terminal caché ; les lignes de sortie sont transmises une à une. */
function runCommand(command, {
  cwd, env, timeout = 40 * 60000, onLine, signal,
} = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, { cwd, env, shell: true, windowsHide: true, detached: !IS_WIN });
    } catch (err) { if (onLine) onLine(err.message); resolve({ code: 1, tail: [err.message] }); return; }
    const tail = [];
    let buf = '';
    const feed = (d) => {
      buf += d.toString('utf8');
      const lines = buf.split(/\r?\n|\r/);
      buf = lines.pop();
      for (const raw of lines) {
        const l = stripAnsi(raw).trimEnd();
        if (!l.trim()) continue;
        tail.push(l);
        if (tail.length > 120) tail.shift();
        if (onLine) onLine(l);
      }
    };
    const kill = () => {
      try {
        if (IS_WIN) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        else process.kill(-child.pid, 'SIGTERM');
      } catch { try { child.kill(); } catch { /* déjà arrêté */ } }
    };
    if (child.stdout) child.stdout.on('data', feed);
    if (child.stderr) child.stderr.on('data', feed);
    const timer = setTimeout(kill, timeout);
    const onAbort = () => kill();
    if (signal) { if (signal.aborted) kill(); else signal.addEventListener('abort', onAbort, { once: true }); }
    child.on('error', (err) => { clearTimeout(timer); tail.push(err.message); resolve({ code: 1, tail }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      if (buf.trim()) { tail.push(stripAnsi(buf).trim()); if (onLine) onLine(stripAnsi(buf).trim()); }
      resolve({ code: code == null ? 1 : code, tail });
    });
  });
}

/** Message clair à partir de la fin du journal d'une commande qui a échoué. */
function explain(tail, fallback) {
  // Les lignes d'erreur passent avant le reste (« no code signing certificate configured » n'est pas une erreur).
  const errors = tail.filter((l) => /⨯|error|erreur|failed|échec|ERR!/i.test(l) && !/signing is skipped/i.test(l));
  const text = (errors.length ? errors : tail).join('\n');
  if (/ENOSPC|not enough space|espace insuffisant/i.test(text)) return 'Le disque est plein : libère au moins 2 Go, puis relance la construction.';
  if (/EBUSY|EPERM|resource busy|being used by another process|utilisé par un autre processus/i.test(text)) {
    return 'Un fichier est utilisé par un autre programme : ferme le logiciel s’il est ouvert (test ou ancienne version), l’explorateur ouvert sur son dossier, puis relance. Si cela continue, ton antivirus analyse peut-être les fichiers : réessaie dans une minute.';
  }
  if (/\b429\b|Too Many Requests/i.test(text)) return 'Le serveur de téléchargement limite les demandes pour le moment : réessaie dans quelques minutes.';
  if (/ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|getaddrinfo|socket hang up|network|ECONNREFUSED/i.test(text)) return 'Problème de connexion pendant un téléchargement : vérifie ta connexion à Internet (ou ton proxy), puis relance la construction.';
  if (/signtool|Cannot sign|sign(ing)? failed|certificate (password|is invalid|not found)|password is incorrect|invalid password/i.test(text)) return 'La signature a échoué : vérifie le certificat (.pfx) et son mot de passe dans la section Signature.';
  if (/Cannot find module|MODULE_NOT_FOUND/i.test(text)) return 'Un module de construction est introuvable : vide le cache de construction (section Construction), puis relance.';
  if (/7za process failed|Exit code: null|^Killed$|\bKilled\b/im.test(text)) return 'La construction s’est arrêtée (mémoire insuffisante ou antivirus). Ferme les programmes lourds, puis relance ; tu peux aussi choisir la compression « rapide » dans la section Installation.';
  // Première ligne « ⨯ » d'electron-builder, avec sa précision éventuelle (« - configuration has… »).
  const idx = tail.findIndex((l) => /^\s*⨯/.test(l));
  if (idx >= 0) {
    const detail = tail.slice(idx + 1, idx + 4).find((l) => /^\s*-\s/.test(l));
    return `${fallback} : ${tail[idx].replace(/^\s*⨯\s*/, '').slice(0, 220)}${detail ? ` (${detail.trim().replace(/^-\s*/, '').slice(0, 160)})` : ''}`;
  }
  const line = tail.slice().reverse().find((l) => /⨯|error|erreur|failed|échec|not found|introuvable|is not recognized|n.est pas reconnu/i.test(l));
  return line ? `${fallback} : ${line.replace(/^\s*⨯\s*/, '').slice(0, 280)}` : `${fallback}.`;
}

function dirOwner(dir) { try { return JSON.parse(fs.readFileSync(path.join(dir, OWNER_FILE), 'utf8')).appId || null; } catch { return null; } }
/** Dossier de sortie du logiciel : jamais celui d'un autre logiciel (même nom affiché, par exemple). */
function claimOutDir(dir, appId, name) {
  let d = dir;
  for (let n = 1; n < 50; n++) {
    const o = dirOwner(d);
    if (!o || o === appId) break;
    d = n === 1 ? `${dir} (${appId})` : `${dir} (${appId} ${n})`;
  }
  fs.mkdirSync(d, { recursive: true });
  if (!dirOwner(d)) {
    const f = path.join(d, OWNER_FILE);
    fs.writeFileSync(f, JSON.stringify({ appId, name, note: 'Dossier de ce logiciel dans NEXORA (Desktop Builder).' }, null, 2));
    if (IS_WIN) { try { spawn('attrib', ['+h', f], { windowsHide: true, stdio: 'ignore' }); } catch { /* fichier visible, sans conséquence */ } }
  }
  return d;
}

function kindOf(name) {
  const n = name.toLowerCase();
  if (n.endsWith('.blockmap') || n.endsWith('.yml')) return 'update';
  if (n.endsWith('.msi')) return 'msi';
  if (n.endsWith('.zip')) return 'zip';
  if (n.endsWith('.appx') || n.endsWith('.msix')) return 'appx';
  if (n.endsWith('.nupkg')) return 'squirrel';
  if (/-portable-/i.test(n)) return 'portable';
  if (n.endsWith('.exe')) return 'nsis';
  return 'other';
}

class DesktopBuilder extends EventEmitter {
  constructor({
    home, fetchImpl, nexoraVersion = '', documents = '', crypt = null,
  }) {
    super();
    this.home = home;
    this.fetch = fetchImpl;
    this.nexoraVersion = nexoraVersion;
    this.documents = documents;
    this.crypt = crypt;
    this.busy = null;
    this.abort = null;
    this.lastLog = '';
    this.latest = null;
  }

  get kitDir() { return path.join(this.home, 'kit'); }
  get cacheDir() { return path.join(this.home, 'cache'); }
  get electronDir() { return path.join(this.home, 'electron'); }
  get buildsDir() { return path.join(this.home, 'builds'); }
  get certsDir() { return path.join(this.home, 'certificats'); }
  get logsDir() { return path.join(this.home, 'journaux'); }
  outRoot() { return path.join(this.documents || path.join(require('os').homedir(), 'Documents'), 'NEXORA', 'Logiciels'); }

  kitVersion() {
    try { return JSON.parse(fs.readFileSync(path.join(this.kitDir, 'node_modules', 'electron-builder', 'package.json'), 'utf8')).version || null; } catch { return null; }
  }
  cachedElectron() {
    try {
      return fs.readdirSync(this.electronDir).map((f) => /^electron-v(.+)-win32-(x64|arm64)\.zip\.sha256$/.exec(f)).filter(Boolean).map((m) => `${m[1]} (${m[2]})`);
    } catch { return []; }
  }

  async status() {
    const node = await sdk.checkSdk('node', { fresh: true }).catch(() => ({ ok: false }));
    return {
      platform: process.platform,
      node: { ok: Boolean(node.ok) && major(node.version) >= MIN_NODE, version: node.version || null, min: MIN_NODE },
      kit: { version: this.kitVersion(), expected: project.BUILDER_VERSION },
      electron: { nexora: process.versions.electron || '', cached: this.cachedElectron() },
      home: this.home,
      outRoot: this.outRoot(),
      autoInstall: IS_WIN,
      busy: Boolean(this.busy),
    };
  }

  // ------------------------------------------------------------ progression et journal
  step(id, label, progress, detail = '') { this.emit('progress', { step: id, label, progress: Math.max(0, Math.min(1, progress)), detail }); }
  log(line) {
    const l = String(line).slice(0, 600);
    if (this.logStream) { try { this.logStream.write(`${l}\n`); } catch { /* journal fermé */ } }
    this.emit('log', l);
  }
  checkAbort() { if (this.abort && this.abort.signal.aborted) throw Object.assign(new Error('Construction annulée.'), { cancelled: true }); }
  async cmd(command, title, { cwd, env, timeout, allowFail = false } = {}) {
    this.checkAbort();
    this.log(`> ${command}`);
    const r = await runCommand(command, {
      cwd, env: env || this.env(), timeout, signal: this.abort && this.abort.signal, onLine: (l) => this.log(l),
    });
    this.checkAbort();
    if (r.code !== 0 && !allowFail) throw new Error(explain(r.tail, `${title} : échec`));
    return r;
  }
  env(extra = {}) {
    const env = {
      ...process.env,
      ELECTRON_BUILDER_CACHE: this.cacheDir,
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      NO_UPDATE_NOTIFIER: '1',
      npm_config_fund: 'false',
      npm_config_audit: 'false',
      npm_config_update_notifier: 'false',
      FORCE_COLOR: '0',
      NO_COLOR: '1',
      ...extra,
    };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;
    delete env.CSC_LINK;
    delete env.CSC_KEY_PASSWORD;
    for (const k of ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET']) delete env[k];
    Object.assign(env, extra);
    return env;
  }
  fetchSigned(url, opts = {}) { return this.fetch(url, { ...opts, signal: this.abort && this.abort.signal }); }

  // ------------------------------------------------------------ 1. outils
  async ensureNode(from, to) {
    const have = await sdk.checkSdk('node', { fresh: true }).catch(() => ({ ok: false }));
    if (have.ok && major(have.version) >= MIN_NODE) { this.log(`Node.js ${have.version} présent.`); return have.version; }
    const tools = toolsMod.shared();
    if (!IS_WIN || !tools) throw new Error(`Node.js ${MIN_NODE} ou plus récent est nécessaire pour construire le logiciel : installe-le depuis https://nodejs.org, puis relance.`);
    this.step('tools', have.ok ? `Mise à jour de Node.js (${have.version} est trop ancien)` : 'Installation de Node.js (≈ 35 Mo, une seule fois)', from);
    const onProgress = (p) => {
      if (p.id !== 'node') return;
      if (p.phase === 'log' && p.line) this.log(p.line);
      if (typeof p.progress === 'number') this.step('tools', p.message || 'Installation de Node.js', from + (to - from) * p.progress);
    };
    tools.on('progress', onProgress);
    try {
      const r = await tools.installMany(['node']);
      if (!r.ok) throw new Error(r.cancelled ? 'Construction annulée.' : `Node.js n’a pas pu être installé : ${r.message}`);
    } finally { tools.removeListener('progress', onProgress); }
    const now = await sdk.checkSdk('node', { fresh: true });
    if (!now.ok) throw new Error('Node.js est installé mais ne répond pas. Redémarre NEXORA, puis relance la construction.');
    return now.version;
  }
  async ensureKit(from) {
    if (this.kitVersion() === project.BUILDER_VERSION) return;
    this.step('tools', `Installation du kit de construction electron-builder ${project.BUILDER_VERSION} (une seule fois, 1 à 3 min)`, from);
    fs.mkdirSync(this.kitDir, { recursive: true });
    fs.writeFileSync(path.join(this.kitDir, 'package.json'), JSON.stringify({
      name: 'nexora-desktop-kit', private: true, description: 'Kit de construction des logiciels de bureau de NEXORA', dependencies: { 'electron-builder': project.BUILDER_VERSION },
    }, null, 2));
    await this.cmd('npm install --no-fund --no-audit --no-progress --loglevel=error', 'Installation du kit de construction', { cwd: this.kitDir, timeout: 25 * 60000 });
    if (this.kitVersion() !== project.BUILDER_VERSION) throw new Error('Le kit de construction ne s’est pas installé correctement. Vérifie ta connexion, puis relance.');
  }

  // ------------------------------------------------------------ 2. moteur Electron
  async electronVersion(choice) {
    const own = process.versions.electron || '';
    if (choice === 'nexora' && own) return own;
    if (this.latest && Date.now() - this.latest.at < 6 * 3600e3) return this.latest.version;
    try {
      const res = await this.fetchSigned('https://registry.npmjs.org/-/package/electron/dist-tags', { headers: { Accept: 'application/json', 'User-Agent': 'NEXORA' } });
      const tags = res.ok ? await res.json() : null;
      const v = tags && String(tags.latest || '');
      if (/^\d+\.\d+\.\d+$/.test(v) && major(v) >= MIN_ELECTRON) { this.latest = { version: v, at: Date.now() }; return v; }
    } catch (err) { if (this.abort && this.abort.signal.aborted) throw err; this.log(`Dernière version d’Electron introuvable (${err.message}).`); }
    // Hors connexion : dernière version déjà téléchargée, sinon celle de NEXORA.
    const cached = this.cachedElectron().map((c) => c.split(' ')[0]).sort((a, b) => {
      const x = a.split('.').map(Number); const y = b.split('.').map(Number); return y[0] - x[0] || y[1] - x[1] || y[2] - x[2];
    })[0];
    if (cached || own) this.log(`Version d’Electron utilisée : ${cached || own} (hors connexion).`);
    if (cached || own) return cached || own;
    throw new Error('Impossible de connaître la version d’Electron à utiliser : vérifie ta connexion.');
  }
  async electronSha(version, file) {
    try {
      const res = await this.fetchSigned(`https://github.com/electron/electron/releases/download/v${version}/SHASUMS256.txt`, { headers: { 'User-Agent': 'NEXORA' } });
      if (res.ok) {
        const line = (await res.text()).split('\n').find((l) => l.trim().split(/\s+/)[1] && l.trim().split(/\s+/)[1].replace(/^\*/, '') === file);
        if (line) return line.trim().split(/\s+/)[0];
      }
    } catch (err) { if (this.abort && this.abort.signal.aborted) throw err; }
    // Source de secours : empreintes publiées dans le paquet npm officiel d'Electron.
    const res = await this.fetchSigned(`https://cdn.jsdelivr.net/npm/electron@${version}/checksums.json`, { headers: { 'User-Agent': 'NEXORA' } });
    const sums = res.ok ? await res.json() : null;
    if (sums && /^[0-9a-f]{64}$/.test(sums[file] || '')) return sums[file];
    throw new Error('Empreinte de sécurité d’Electron introuvable : vérifie ta connexion, puis relance.');
  }
  async ensureElectron(version, archs, from, to) {
    fs.mkdirSync(this.electronDir, { recursive: true });
    const span = (to - from) / archs.length;
    for (let i = 0; i < archs.length; i++) {
      const file = `electron-v${version}-win32-${archs[i]}.zip`;
      const dest = path.join(this.electronDir, file);
      const mark = `${dest}.sha256`;
      if (fs.existsSync(dest) && fs.existsSync(mark)) { this.log(`Electron ${version} (${archs[i]}) déjà téléchargé.`); continue; }
      const base = from + span * i;
      this.step('electron', `Téléchargement d’Electron ${version} pour ${archs[i] === 'x64' ? 'Windows 64 bits' : 'Windows ARM'} (≈ 150 Mo, une seule fois)`, base);
      // eslint-disable-next-line no-await-in-loop
      const sha = await this.electronSha(version, file);
      const urls = [`https://github.com/electron/electron/releases/download/v${version}/${file}`, `https://npmmirror.com/mirrors/electron/${version}/${file}`];
      let done = false;
      let lastErr = null;
      for (const url of urls) {
        try {
          let last = 0;
          // eslint-disable-next-line no-await-in-loop
          await resumableDownload((u, o) => this.fetchSigned(u, o), url, dest, {
            sha256: sha,
            headers: { 'User-Agent': 'NEXORA' },
            onProgress: (p, got, total) => {
              if (Date.now() - last < 200 && p < 1) return;
              last = Date.now();
              const mb = (n) => Math.round(n / 1048576);
              this.step('electron', `Téléchargement d’Electron ${version} (${archs[i]})`, base + span * p, total ? `${mb(got)} / ${mb(total)} Mo` : '');
            },
          });
          done = true;
          break;
        } catch (err) {
          if (this.abort && this.abort.signal.aborted) throw err;
          lastErr = err;
          this.log(`Téléchargement depuis ${new URL(url).host} impossible : ${err.message}`);
        }
      }
      if (!done) throw new Error(`Electron n’a pas pu être téléchargé : ${lastErr ? lastErr.message : 'erreur inconnue'}`);
      fs.writeFileSync(mark, sha);
      this.log(`Moteur du logiciel (${archs[i]}) téléchargé et vérifié.`);
    }
  }

  // ------------------------------------------------------------ 3. source
  pmInstall(pm) { return pm === 'yarn' ? 'yarn install' : pm === 'bun' ? 'bun install' : pm === 'pnpm' ? 'pnpm install' : 'npm install --no-fund --no-audit'; }
  async ensurePm(pm) {
    if (!['pnpm', 'yarn', 'bun'].includes(pm)) return;
    const ok = await sdk.checkSdk(pm, { fresh: true }).catch(() => ({ ok: false }));
    if (ok.ok) return;
    const tools = toolsMod.shared();
    if (!IS_WIN || !tools) throw new Error(`Le projet utilise ${pm}, qui n’est pas installé.`);
    this.log(`Installation de ${pm} par le gestionnaire d’outils de NEXORA.`);
    const r = await tools.installMany([pm]);
    if (!r.ok) throw new Error(`${pm} n’a pas pu être installé : ${r.message}`);
  }
  async prepareWeb(c, from, to) {
    const dir = c.source.dir;
    const a = analyzeDesktopSource(dir);
    if (a.kind === 'unsupported') throw new Error(a.unsupported.message);
    if (c.source.build && c.source.buildCmd) {
      // Installation sans NODE_ENV=production : npm, Yarn et pnpm sauteraient les devDependencies, dont l'outil de
      // construction (« vite: not found »). Pas de CI non plus : Create React App traiterait chaque avertissement comme
      // une erreur, pnpm et Yarn refuseraient un fichier de verrouillage pas tout à fait à jour.
      const base = { ...process.env, BROWSER: 'none' };
      delete base.NODE_ENV;
      if (a.kind === 'web' && fs.existsSync(path.join(dir, 'package.json'))) {
        await this.ensurePm(a.pm);
        if (!fs.existsSync(path.join(dir, 'node_modules'))) {
          this.step('source', 'Installation des dépendances du projet', from);
          await this.cmd(this.pmInstall(a.pm), 'Installation des dépendances du projet', { cwd: dir, env: projectEnv(dir, {}, base), timeout: 30 * 60000 });
        }
      }
      this.step('source', `Construction du site : ${c.source.buildCmd}`, from + (to - from) * 0.4);
      await this.cmd(c.source.buildCmd, 'Construction du site', { cwd: dir, env: projectEnv(dir, { NODE_ENV: 'production' }, base), timeout: 30 * 60000 });
    }
    const candidates = [c.source.webDir, ...(a.webDirs || [])].filter((d) => d !== undefined && d !== null);
    for (const rel of candidates) {
      const abs = path.resolve(dir, rel || '.');
      if ((abs === path.resolve(dir) || abs.startsWith(path.resolve(dir) + path.sep)) && fs.existsSync(path.join(abs, 'index.html'))) {
        if (rel !== c.source.webDir) this.log(`Dossier du site : ${rel || '(racine du projet)'}`);
        return abs;
      }
    }
    throw new Error(`Aucun fichier index.html dans « ${c.source.webDir || 'le dossier choisi'} »${c.source.build ? ' après la construction' : ''}. Vérifie le dossier du site dans la section Source.`);
  }

  // ------------------------------------------------------------ 5. emballage
  progressFromLine(line, from, to) {
    // La barre n'avance que vers l'avant, même si electron-builder télécharge un outil au milieu d'une étape.
    const at = (f, label) => { this.pkgAt = Math.max(this.pkgAt || 0, from + (to - from) * f); this.step('package', label, this.pkgAt); };
    if (/•\s*packaging/.test(line)) at(0.15, 'Emballage de l’application');
    else if (/asar integrity|@electron\/fuses/.test(line)) at(0.3, 'Verrouillage de l’exécutable et intégrité des fichiers');
    else if (/signing|signtool/i.test(line) && !/skipped/.test(line)) at(0.35, 'Signature');
    else if (/target=nsis\b/.test(line)) at(0.45, 'Création de l’installateur');
    else if (/building block map/.test(line)) at(0.7, 'Préparation des mises à jour différentielles');
    else if (/target=portable/.test(line)) at(0.75, 'Création de la version portable');
    else if (/target=zip/.test(line)) at(0.88, 'Création de l’archive ZIP');
    else if (/target=msi/.test(line)) at(0.5, 'Création du paquet MSI');
    else if (/downloading|downloaded/.test(line) && /nsis|wix|winCodeSign|7zip/i.test(line)) at(0.4, 'Téléchargement des outils d’installation (une seule fois)');
  }
  async runBuilder(cli, args, { cwd, env, from, to, title }) {
    this.pkgAt = from;
    const command = `node "${cli}" ${args.map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(' ')}`;
    // Construction sans publication (--publish never) : un jeton GH_TOKEN présent sur le PC ferait pourtant choisir
    // GitHub à electron-builder, qui échoue à la fin (« Cannot read properties of null (reading 'provider') ») quand le
    // projet n'a pas de dépôt GitHub.
    let runEnv = Object.fromEntries(Object.entries(env).filter(([k]) => !PUBLISH_TOKENS.includes(k.toUpperCase())));
    for (let attempt = 0; attempt < 2; attempt++) {
      this.checkAbort();
      this.log(`> electron-builder ${args.filter((a) => !a.startsWith('-c.electronDist')).join(' ')}`);
      // eslint-disable-next-line no-await-in-loop
      const r = await runCommand(command, {
        cwd, env: runEnv, signal: this.abort && this.abort.signal, onLine: (l) => { this.log(l); this.progressFromLine(l, from, to); },
      });
      this.checkAbort();
      if (r.code === 0) return r;
      const text = r.tail.join('\n');
      // Coupure réseau ou limite du serveur pendant le téléchargement des outils d'installation : un nouvel essai.
      if (attempt === 0 && /\b429\b|ETIMEDOUT|ECONNRESET|EAI_AGAIN|socket hang up/i.test(text)) {
        this.log('Problème de réseau : nouvel essai dans 15 secondes.');
        // eslint-disable-next-line no-await-in-loop
        await wait(15000);
        continue;
      }
      // 7-Zip arrêté faute de mémoire : electron-builder compresse l'application au niveau 9 (2,7 Go de mémoire pour un
      // logiciel de 350 Mo, mesuré) ; le niveau 7 en demande deux fois moins, pour des fichiers à peine plus gros (+ 1 %).
      if (attempt === 0 && !runEnv.ELECTRON_BUILDER_COMPRESSION_LEVEL && /7za/.test(text) && /Exit code: (null|8)\b|allocate|not enough memory|\bKilled\b/i.test(text)) {
        this.log('Mémoire insuffisante pour la compression : nouvel essai avec une compression un peu plus légère.');
        runEnv = { ...runEnv, ELECTRON_BUILDER_COMPRESSION_LEVEL: '7' };
        continue;
      }
      throw new Error(explain(r.tail, title));
    }
    return null;
  }
  /** Paquet MSI construit à part (x64 seulement) : s'il échoue, les autres formats restent prêts. */
  async buildMsi(cli, common, {
    cwd, env, from, to, warnings, required,
  }) {
    this.step('msi', 'Création du paquet MSI', from);
    try {
      await this.runBuilder(cli, ['--win', 'msi', '--x64', ...common], { cwd, env, from, to, title: 'Le paquet MSI n’a pas pu être créé' });
    } catch (err) {
      if (err.cancelled || required) throw err;
      warnings.push(`MSI non créé : ${err.message} Les autres formats sont prêts.`);
    }
  }
  collect(dist) {
    let names = [];
    try { names = fs.readdirSync(dist); } catch { names = []; }
    return names.filter((n) => {
      const full = path.join(dist, n);
      if (!fs.statSync(full).isFile()) return false;
      if (/__uninstaller|^elevate\.exe$|builder-debug\.yml|builder-effective-config\.yaml|\.7z$/i.test(n)) return false;
      return /\.(exe|msi|zip|appx|msix|blockmap|nupkg)$/i.test(n) || /^latest.*\.yml$/i.test(n) || n === 'RELEASES';
    }).map((n) => ({ name: n, src: path.join(dist, n), kind: kindOf(n) }));
  }

  // ------------------------------------------------------------ signature (certificat .pfx)
  certFile(appId) { return path.join(this.certsDir, `${project.packageName(appId)}.pfx`); }
  certMeta(appId) { return path.join(this.certsDir, `${project.packageName(appId)}.json`); }
  certInfo(appId) {
    try { const m = JSON.parse(fs.readFileSync(this.certMeta(appId), 'utf8')); return { ok: fs.existsSync(this.certFile(appId)), name: m.name, at: m.at }; } catch { return { ok: false }; }
  }
  async saveCert(appId, file, password) {
    if (!this.crypt) throw new Error('Le trousseau sécurisé de Windows n’est pas disponible : le mot de passe du certificat ne peut pas être protégé.');
    if (!file || !/\.(pfx|p12)$/i.test(file) || !fs.existsSync(file)) throw new Error('Choisis un certificat au format .pfx ou .p12.');
    if (fs.statSync(file).size > 1e6) throw new Error('Ce fichier est trop gros pour un certificat.');
    fs.mkdirSync(this.certsDir, { recursive: true });
    fs.copyFileSync(file, this.certFile(appId));
    const enc = await this.crypt.encrypt(String(password || ''));
    fs.writeFileSync(this.certMeta(appId), JSON.stringify({ name: path.basename(file), at: new Date().toISOString(), password: enc }, null, 2), { mode: 0o600 });
    return this.certInfo(appId);
  }
  removeCert(appId) {
    fs.rmSync(this.certFile(appId), { force: true });
    fs.rmSync(this.certMeta(appId), { force: true });
    return { ok: false };
  }
  async certEnv(appId) {
    const info = this.certInfo(appId);
    if (!info.ok) throw new Error('Signature activée, mais aucun certificat n’est enregistré : ajoute-le dans la section Signature, ou désactive la signature.');
    const m = JSON.parse(fs.readFileSync(this.certMeta(appId), 'utf8'));
    const password = m.password ? await this.crypt.decrypt(m.password) : '';
    return { CSC_LINK: this.certFile(appId), CSC_KEY_PASSWORD: password };
  }

  // ------------------------------------------------------------ signature Microsoft dans le cloud (NEXORA #058)
  azureMeta(appId) { return path.join(this.certsDir, `${project.packageName(appId)}.azure.json`); }
  azureInfo(appId) {
    try { const m = JSON.parse(fs.readFileSync(this.azureMeta(appId), 'utf8')); return { ok: Boolean(m.secret), tenant: m.tenant, client: m.client, at: m.at }; } catch { return { ok: false }; }
  }
  async saveAzure(appId, { tenant, client, secret } = {}) {
    if (!this.crypt) throw new Error('Le trousseau sécurisé de Windows n’est pas disponible : le secret ne peut pas être protégé.');
    const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!GUID.test(String(tenant || '')) || !GUID.test(String(client || ''))) throw new Error('L’identifiant du locataire (tenant) et celui de l’application (client) ont la forme 00000000-0000-0000-0000-000000000000.');
    if (String(secret || '').length < 8) throw new Error('Colle le secret client de l’application Azure.');
    fs.mkdirSync(this.certsDir, { recursive: true });
    fs.writeFileSync(this.azureMeta(appId), JSON.stringify({ tenant, client, secret: await this.crypt.encrypt(String(secret)), at: new Date().toISOString() }, null, 2), { mode: 0o600 });
    return this.azureInfo(appId);
  }
  removeAzure(appId) { fs.rmSync(this.azureMeta(appId), { force: true }); return { ok: false }; }
  async azureEnv(appId) {
    const info = this.azureInfo(appId);
    if (!info.ok) throw new Error('Signature dans le cloud activée, mais les identifiants Azure ne sont pas enregistrés : ajoute-les dans la section Signature.');
    const m = JSON.parse(fs.readFileSync(this.azureMeta(appId), 'utf8'));
    return { AZURE_TENANT_ID: m.tenant, AZURE_CLIENT_ID: m.client, AZURE_CLIENT_SECRET: await this.crypt.decrypt(m.secret) };
  }
  /** Variables de signature données à electron-builder seulement : certificat .pfx ou identifiants Azure. */
  async signEnv(c) {
    if (!c.signing || !c.signing.enabled) return {};
    return c.signing.mode === 'azure' ? this.azureEnv(c.appId) : this.certEnv(c.appId);
  }

  // ------------------------------------------------------------ construction complète
  async build({ app: raw, assets = {}, out = '' } = {}) {
    if (this.busy) throw new Error('Une construction est déjà en cours.');
    const c = project.sanitize(raw);
    const t0 = Date.now();
    this.busy = c.appId;
    this.abort = new AbortController();
    fs.mkdirSync(this.logsDir, { recursive: true });
    this.lastLog = path.join(this.logsDir, `${c.pkgName}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.txt`);
    this.logStream = fs.createWriteStream(this.lastLog);
    const warnings = [];
    try {
      this.log(`Construction de « ${c.name} » ${c.version} (${c.appId}) — NEXORA ${this.nexoraVersion}`);
      this.step('tools', 'Vérification des outils de construction', 0.01);
      await this.ensureNode(0.01, 0.08);
      this.checkAbort();
      const archs = Object.keys(c.install.archs).filter((a) => c.install.archs[a]);
      const work = path.join(this.buildsDir, c.pkgName);
      const dist = path.join(work, 'dist');
      const outBase = out && path.isAbsolute(out) ? out : this.outRoot();
      const outDir = claimOutDir(path.join(outBase, c.name), c.appId, c.name);
      // Les fichiers de la construction précédente sont retirés (le logiciel lancé pour un test les verrouille).
      try { await fsx.rmrf(dist); } catch {
        throw new Error(`Ferme « ${c.name} » s’il est ouvert (lancé pour un test), puis relance la construction : ses fichiers sont utilisés.`);
      }
      let result;
      if (c.source.kind === 'electron') result = await this.buildElectronProject(c, assets, { work, dist, archs, warnings });
      else result = await this.buildGenerated(c, assets, { work, dist, archs, outDir, warnings });
      this.step('copy', 'Copie des fichiers d’installation', 0.97);
      const files = [];
      for (const f of result.artifacts) {
        if (f.kind === 'update' && c.updates.mode === 'none' && c.source.kind !== 'electron') continue;
        let dest = path.join(outDir, f.name);
        try { await fsx.copyFile(f.src, dest); } catch {
          dest = path.join(outDir, f.name.replace(/(\.[^.]+)$/, ' (2)$1'));
          await fsx.copyFile(f.src, dest);
          warnings.push(`${f.name} était utilisé par un autre programme : le nouveau fichier s’appelle ${path.basename(dest)}.`);
        }
        files.push({ name: path.basename(dest), path: dest, kind: f.kind, size: fs.statSync(dest).size });
      }
      const unpacked = (() => {
        for (const d of ['win-unpacked', 'win-arm64-unpacked']) {
          const dir = path.join(dist, d);
          try { const exe = fs.readdirSync(dir).find((n) => n.toLowerCase().endsWith('.exe') && !/^elevate/i.test(n)); if (exe) return path.join(dir, exe); } catch { /* absent */ }
        }
        return null;
      })();
      this.step('done', 'Logiciel prêt', 1);
      const ms = Date.now() - t0;
      this.log(`Terminé en ${Math.round(ms / 1000)} s : ${files.map((f) => f.name).join(', ')}`);
      return {
        ok: true, appId: c.appId, version: c.version, outDir, files, unpacked, electron: result.electron, builder: result.builder, project: result.projectDir || null, ms, warnings, log: this.lastLog,
      };
    } catch (err) {
      this.log(`Échec : ${err.message}`);
      techLog('desktop', `${c.appId}\n${err && err.stack ? err.stack : err}`);
      this.step('error', err.cancelled ? 'Construction annulée' : 'Construction interrompue', 1, err.message);
      throw err;
    } finally {
      try { this.logStream.end(); } catch { /* déjà fermé */ }
      this.logStream = null;
      this.busy = null;
      this.abort = null;
    }
  }

  /** Logiciel à partir d'un lien ou d'un dossier : projet généré, construit avec le kit de NEXORA. */
  async buildGenerated(c, assets, {
    dist, archs, outDir, warnings,
  }) {
    await this.ensureKit(0.08);
    this.step('electron', 'Choix de la version d’Electron', 0.14);
    const electron = await this.electronVersion(c.install.electron);
    await this.ensureElectron(electron, archs, 0.15, 0.4);
    let webDir = null;
    if (c.source.kind === 'folder') {
      this.step('source', 'Préparation du site', 0.41);
      webDir = await this.prepareWeb(c, 0.41, 0.55);
    }
    this.step('project', 'Écriture du projet du logiciel', 0.56);
    const projectDir = path.join(outDir, 'projet');
    const w = project.writeProject(projectDir, c, assets, { electronVersion: electron, nexoraVersion: this.nexoraVersion, webDir });
    if (w.web) this.log(`Site intégré : ${w.web.files} fichiers (${Math.round(w.web.bytes / 1048576)} Mo).`);
    if (c.updates.mode !== 'none') {
      const have = (() => { try { return JSON.parse(fs.readFileSync(path.join(projectDir, 'app', 'node_modules', 'electron-updater', 'package.json'), 'utf8')).version; } catch { return null; } })();
      if (have !== project.UPDATER_VERSION) {
        this.step('project', 'Installation du module de mise à jour (electron-updater)', 0.58);
        await this.cmd('npm install --omit=dev --no-fund --no-audit --no-progress --loglevel=error', 'Installation du module de mise à jour', { cwd: path.join(projectDir, 'app'), timeout: 15 * 60000 });
      }
    }
    const cli = path.join(this.kitDir, 'node_modules', 'electron-builder', 'cli.js');
    const env = this.env(await this.signEnv(c));
    const archFlags = archs.map((a) => `--${a}`);
    const main = ['nsis', 'portable', 'zip', 'appx'].filter((t) => c.install.formats[t]);
    const common = ['--projectDir', projectDir, '--publish', 'never', `-c.directories.output=${dist}`, `-c.electronDist=${this.electronDir}`];
    this.step('package', 'Emballage de l’application', 0.6);
    if (main.length) await this.runBuilder(cli, ['--win', ...main, ...archFlags, ...common], { cwd: projectDir, env, from: 0.6, to: 0.9, title: 'La construction a échoué' });
    if (c.install.formats.msi) await this.buildMsi(cli, common, { cwd: projectDir, env, from: 0.9, to: 0.96, warnings, required: !main.length });
    return { artifacts: this.collect(dist), electron, builder: project.BUILDER_VERSION, projectDir };
  }

  /**
   * Projet Electron existant : dépendances, préparation, puis sa propre configuration (icône, installateur, fichiers)
   * ou celle de NEXORA (sections Icône, Installation, Sécurité et Mises à jour). Formats et processeurs : section
   * Installation dans les deux cas. Le projet n'est pas modifié (configuration de NEXORA dans le dossier de travail).
   */
  async buildElectronProject(c, assets, {
    work, dist, archs, warnings,
  }) {
    const dir = c.source.dir;
    const a = analyzeDesktopSource(dir);
    if (a.kind !== 'electron') throw new Error('Ce dossier n’est pas un projet Electron (aucune dépendance « electron » dans package.json).');
    // Environnement de NEXORA comme base (ses retraits, NODE_OPTIONS ou CSC_LINK, restent faits) ; le certificat et son
    // mot de passe ne vont qu'à electron-builder, pas aux scripts d'installation des dépendances.
    const certVars = await this.signEnv(c);
    const env = projectEnv(dir, {}, this.env());
    await this.ensurePm(a.pm);
    this.step('source', 'Installation des dépendances du projet', 0.12);
    await this.cmd(this.pmInstall(a.pm), 'Installation des dépendances du projet', { cwd: dir, env, timeout: 30 * 60000 });
    const prepare = c.source.prepareCmd || '';
    if (prepare) {
      this.step('source', `Préparation : ${prepare}`, 0.35);
      await this.cmd(prepare, 'Préparation du projet', { cwd: dir, env, timeout: 30 * 60000 });
    }
    let electron = '';
    try { electron = JSON.parse(fs.readFileSync(path.join(dir, 'node_modules', 'electron', 'package.json'), 'utf8')).version; } catch { electron = a.electron.version || ''; }
    if (a.electron.forge) {
      this.step('package', 'Création des installateurs (Electron Forge)', 0.5);
      const outMake = path.join(dir, 'out', 'make');
      await this.cmd(`npx electron-forge make --platform=win32 --arch=${archs.join(',')}`, 'Electron Forge', { cwd: dir, env, timeout: 40 * 60000 });
      const artifacts = [];
      const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.(exe|msi|zip|nupkg|appx|msix)$/i.test(e.name) || e.name === 'RELEASES') artifacts.push({ name: e.name, src: f, kind: kindOf(e.name) }); } };
      try { walk(outMake); } catch { /* aucun fichier */ }
      if (!artifacts.length) throw new Error('Electron Forge n’a produit aucun fichier d’installation (dossier out/make).');
      return { artifacts, electron, builder: 'Electron Forge' };
    }
    await this.ensureKit(0.4);
    // Moteur Electron du projet téléchargé et vérifié par NEXORA (reprise, empreinte, miroir de secours), puis
    // donné à electron-builder : pas de second téléchargement.
    const electronDist = /^\d+\.\d+\.\d+$/.test(electron) ? this.electronDir : '';
    if (electronDist) await this.ensureElectron(electron, archs, 0.4, 0.44);
    const projectConfig = Boolean(c.source.useProjectConfig && a.electron.builder);
    // electron-builder du projet pour sa propre configuration ; kit de NEXORA pour celle de NEXORA (écrite pour lui).
    const own = path.join(dir, 'node_modules', 'electron-builder', 'cli.js');
    const useOwn = projectConfig && fs.existsSync(own);
    const cli = useOwn ? own : path.join(this.kitDir, 'node_modules', 'electron-builder', 'cli.js');
    const buildEnv = projectEnv(dir, {}, this.env(certVars));
    const archFlags = archs.map((x) => `--${x}`);
    const common = ['--projectDir', dir, '--publish', 'never', `-c.directories.output=${dist}`, ...(electronDist ? [`-c.electronDist=${electronDist}`] : [])];
    if (!projectConfig) {
      // Pas de configuration dans le projet (ou choix de NEXORA) : icône, image et licence de l'installateur dans le
      // dossier de travail, désignées par des chemins absolus.
      const res = path.join(work, 'ressources');
      fs.rmSync(res, { recursive: true, force: true });
      fs.mkdirSync(res, { recursive: true });
      const put = (name, data) => {
        if (!data || !data.length) return '';
        const f = path.join(res, name);
        fs.writeFileSync(f, typeof data === 'string' ? data : Buffer.from(data));
        return f;
      };
      const cfg = project.builderConfig(c, { electronVersion: electron });
      cfg.directories = { buildResources: res, output: dist };
      cfg.npmRebuild = true;
      delete cfg.$schema;
      const ico = put('icon.ico', assets.ico);
      if (ico) cfg.win.icon = ico;
      else delete cfg.win.icon;
      if (cfg.nsis) {
        const sidebar = cfg.nsis.installerSidebar ? put('installerSidebar.bmp', assets.sidebar) : '';
        if (sidebar) { cfg.nsis.installerSidebar = sidebar; cfg.nsis.uninstallerSidebar = sidebar; } else { delete cfg.nsis.installerSidebar; delete cfg.nsis.uninstallerSidebar; }
        if (cfg.nsis.license) cfg.nsis.license = put('license.txt', project.licenseText(c.install.license));
      }
      const file = path.join(work, 'electron-builder.nexora.json');
      fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
      common.push('--config', file);
    } else {
      warnings.push('Configuration de construction du projet utilisée : icône, installateur et réglages du projet ; formats et processeurs de la section Installation.');
    }
    const main = ['nsis', 'portable', 'zip', 'appx'].filter((t) => c.install.formats[t]);
    this.step('package', 'Emballage de l’application', 0.45);
    if (main.length) await this.runBuilder(cli, ['--win', ...main, ...archFlags, ...common], { cwd: dir, env: buildEnv, from: 0.45, to: 0.9, title: 'La construction a échoué' });
    if (c.install.formats.msi) await this.buildMsi(cli, common, { cwd: dir, env: buildEnv, from: 0.9, to: 0.96, warnings, required: !main.length });
    return { artifacts: this.collect(dist), electron, builder: useOwn ? 'electron-builder du projet' : project.BUILDER_VERSION };
  }

  /** Code source du logiciel écrit dans un dossier choisi, sans construction (pour le modifier ou le publier). */
  async exportProject({ app: raw, assets = {} } = {}, destRoot) {
    if (this.busy) throw new Error('Une construction est en cours : attends sa fin pour exporter le projet.');
    const c = project.sanitize(raw);
    if (c.source.kind === 'electron') throw new Error('Un projet Electron existant est déjà ton code source : rien à exporter.');
    let dest = path.join(destRoot, c.slug);
    for (let n = 2; fs.existsSync(dest) && n < 100; n++) dest = path.join(destRoot, `${c.slug}-${n}`);
    this.abort = new AbortController();
    try {
      const electron = await this.electronVersion(c.install.electron);
      const webDir = c.source.kind === 'folder' ? await this.prepareWeb({ ...c, source: { ...c.source, build: false } }, 0, 0) : null;
      project.writeProject(dest, c, assets, { electronVersion: electron, nexoraVersion: this.nexoraVersion, webDir });
      return { dir: dest, electron };
    } finally { this.abort = null; }
  }

  cancel() {
    if (this.abort) this.abort.abort();
    const tools = toolsMod.shared();
    if (tools && this.busy) { try { tools.cancel(); } catch { /* rien à annuler */ } }
    return true;
  }

  async clearCache() {
    if (this.busy) throw new Error('Une construction est en cours.');
    let bytes = 0;
    const size = (p) => { try { const st = fs.statSync(p); if (st.isDirectory()) for (const n of fs.readdirSync(p)) size(path.join(p, n)); else bytes += st.size; } catch { /* absent */ } };
    size(this.buildsDir);
    await fsx.rmrf(this.buildsDir);
    return { freed: bytes };
  }

  /** Fichier produit par NEXORA (installateur, dossier) ou version de test : rien d'autre ne peut être lancé. */
  produced(file, { test = false } = {}) {
    const f = path.resolve(String(file || ''));
    if (!fs.existsSync(f)) return false;
    if (test) return f.startsWith(path.resolve(this.buildsDir) + path.sep) && /\.exe$/i.test(f);
    return /\.(exe|msi)$/i.test(f) && Boolean(dirOwner(path.dirname(f)));
  }
}

module.exports = {
  DesktopBuilder, defaultHome, runCommand, explain, claimOutDir, OWNER_FILE,
};
