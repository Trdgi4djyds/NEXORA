'use strict';
/* Visual Studio Code dans le Dev Lab : l'interface web officielle (« code serve-web ») tourne sur ce PC,
 * sur 127.0.0.1, protégée par un jeton secret. On utilise le VS Code déjà installé (son outil
 * code-tunnel) ou l'outil en ligne de commande officiel, téléchargé une fois depuis code.visualstudio.com.
 * Les extensions s'installent depuis le Marketplace, dans VS Code lui-même. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const net = require('net');
const { spawn, execFile } = require('child_process');
const zip = require('../android/zip');
const { resumableDownload } = require('../download');

const WIN = process.platform === 'win32';
const MAC = process.platform === 'darwin';

/* NEXORA #120 : ouverture rapide de Code Editor.
 *  - Port stable, gardé dans <userData>/vscode/port : la vue web garde son cache (≈ 24 Mo de code de l'éditeur) et
 *    son état d'une ouverture à l'autre ; avec un port au hasard, tout était rechargé à chaque fois.
 *  - Version du serveur fixée (--commit-id) dès qu'elle est téléchargée : plus d'appel à Microsoft ni de nouveau
 *    téléchargement (≈ 70 Mo) au moment d'ouvrir l'éditeur. La version suivante est préparée en arrière-plan, au
 *    plus une fois par semaine, par un second serveur discret, puis adoptée à l'ouverture suivante.
 *  - Démarrage anticipé (warm) : au lancement de NEXORA, si Code Editor était ouvert la dernière fois, le serveur
 *    démarre et se prépare sans attendre l'ouverture du Dev Lab. */
const WEEK = 7 * 24 * 3600 * 1000;

function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}

// Code HTTP d'une adresse locale (0 si injoignable) : 202 tant que le serveur se télécharge, puis 200 ou 302.
function httpStatus(url, timeout = 8000) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => { res.resume(); resolve(res.statusCode || 0); });
    req.setTimeout(timeout, () => { req.destroy(); resolve(0); });
    req.on('error', () => resolve(0));
  });
}

// Attend qu'un serveur web de VS Code soit prêt (serveur téléchargé et démarré).
async function waitReady(url, maxMs = 5 * 60 * 1000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const code = await httpStatus(url);
    if (code === 200 || (code >= 300 && code < 400)) return true;
    await new Promise((r) => setTimeout(r, code ? 800 : 400));
  }
  return false;
}

// Nom de la plateforme du serveur web dans le service de mise à jour de Microsoft.
function serverPlatform() {
  const arm = process.arch === 'arm64';
  if (WIN) return arm ? 'win32-arm64' : 'win32-x64';
  if (MAC) return arm ? 'darwin-arm64' : 'darwin';
  return arm ? 'linux-arm64' : 'linux-x64';
}

function cliFlavor() {
  const arm = process.arch === 'arm64';
  if (WIN) return arm ? 'cli-win32-arm64' : 'cli-win32-x64';
  if (MAC) return arm ? 'cli-darwin-arm64' : 'cli-darwin-x64';
  return arm ? 'cli-alpine-arm64' : 'cli-alpine-x64';
}

class VsCode {
  constructor({ dataDir, fetchImpl, emit }) {
    this.dir = path.join(dataDir, 'vscode');
    this.fetch = fetchImpl;
    this.emit = emit;
    this.proc = null;
    this.url = null;
    this.starting = null;
    fs.mkdirSync(this.dir, { recursive: true });
  }

  get ownCli() { return path.join(this.dir, 'cli', WIN ? 'code.exe' : 'code'); }

  // Dossier des serveurs téléchargés par l'outil (un sous-dossier par version, nommé par son commit).
  get serversDir() { return path.join(this.dir, 'cli-data', 'serve-web'); }

  // Port gardé d'une fois sur l'autre ; un autre port libre (gardé à son tour) s'il est pris.
  async port() {
    const f = path.join(this.dir, 'port');
    let saved = 0;
    try { saved = Number(fs.readFileSync(f, 'utf8').trim()) || 0; } catch { /* premier lancement */ }
    if (saved > 1024 && saved < 65536 && await portFree(saved)) return saved;
    const port = await freePort();
    try { fs.writeFileSync(f, String(port)); } catch { /* sans effet sur le démarrage */ }
    return port;
  }

  // Version fixée du serveur, si elle est toujours téléchargée.
  pinned() {
    try {
      const c = fs.readFileSync(path.join(this.dir, 'commit'), 'utf8').trim();
      if (/^[0-9a-f]{40}$/.test(c) && fs.existsSync(path.join(this.serversDir, c))) return c;
    } catch { /* aucune version fixée */ }
    return null;
  }

  pin(commit) {
    try { fs.writeFileSync(path.join(this.dir, 'commit'), commit); } catch { /* ignoré */ }
  }

  // Version téléchargée la plus récente (après un premier démarrage sans version fixée).
  newestServer() {
    try {
      return fs.readdirSync(this.serversDir).filter((d) => /^[0-9a-f]{40}$/.test(d))
        .map((d) => ({ d, t: fs.statSync(path.join(this.serversDir, d)).mtimeMs }))
        .sort((a, b) => b.t - a.t).map((x) => x.d)[0] || null;
    } catch { return null; }
  }

  // Après le démarrage : serveur préparé tout de suite (téléchargé si besoin et lancé) pour que la vue web le
  // trouve prêt, version fixée, puis mise à jour préparée en arrière-plan si la version a plus d'une semaine.
  prime(url) {
    if (this.priming) return this.priming;
    this.priming = (async () => {
      const ok = await waitReady(url);
      if (!ok || this.url !== url) return false;
      if (!this.pinned()) { const c = this.newestServer(); if (c) this.pin(c); }
      this.refresh().catch(() => {});
      return true;
    })().finally(() => { this.priming = null; });
    return this.priming;
  }

  // Une fois par semaine au plus : si Microsoft a publié un nouveau serveur, il est téléchargé par un second
  // « serve-web » sur un autre port (l'éditeur ouvert n'est pas touché), puis adopté à l'ouverture suivante.
  async refresh() {
    const f = path.join(this.dir, 'commit');
    let age = Infinity;
    try { age = Date.now() - fs.statSync(f).mtimeMs; } catch { /* aucune version fixée */ }
    if (age < WEEK || this.refreshing || !this.fetch) return;
    this.refreshing = true;
    try {
      const r = await this.fetch(`https://update.code.visualstudio.com/api/latest/server-${serverPlatform()}-web/stable`);
      const j = r && r.ok ? await r.json() : null;
      const commit = j && j.version;
      if (!/^[0-9a-f]{40}$/.test(commit || '')) return;
      if (!fs.existsSync(path.join(this.serversDir, commit))) await this.prefetch(commit);
      if (fs.existsSync(path.join(this.serversDir, commit))) this.pin(commit);
    } catch { /* hors ligne : la version fixée reste */ } finally { this.refreshing = false; }
  }

  async prefetch(commit) {
    const cli = this.status().cli;
    if (!cli) return;
    const port = await freePort();
    const args = ['serve-web', '--host', '127.0.0.1', '--port', String(port), '--connection-token-file', this.token(), '--accept-server-license-terms', '--server-data-dir', path.join(this.dir, 'server'), '--cli-data-dir', path.join(this.dir, 'cli-data'), '--disable-telemetry', '--commit-id', commit];
    const p = spawn(cli, args, { windowsHide: true, detached: !WIN, env: { ...process.env, VSCODE_CLI_DATA_DIR: path.join(this.dir, 'cli-data') } });
    try {
      const url = await new Promise((resolve, reject) => {
        let buf = '';
        const timer = setTimeout(() => reject(new Error('délai')), 60000);
        const onData = (d) => { buf += d.toString(); const m = /Web UI available at (https?:\/\/[^\s]+)/.exec(buf); if (m) { clearTimeout(timer); resolve(m[1]); } };
        p.stdout.on('data', onData);
        p.stderr.on('data', onData);
        p.on('error', (e) => { clearTimeout(timer); reject(e); });
        p.on('exit', () => { clearTimeout(timer); reject(new Error('arrêté')); });
      });
      await waitReady(url, 15 * 60 * 1000);
    } finally { this.kill(p); }
  }

  // Démarrage anticipé, sans fenêtre : rien si l'outil n'est pas installé ou ses conditions pas acceptées.
  async warm() {
    const st = this.status();
    if (!st.cli || !st.accepted) return { warmed: false };
    try { const url = await this.start(); return { warmed: true, url }; } catch (e) { return { warmed: false, error: e.message }; }
  }

  // Outils trouvés : le VS Code installé (code-tunnel) et/ou l'outil téléchargé par NEXORA.
  findInstalled() {
    const c = [];
    if (WIN) {
      const la = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
      for (const base of [path.join(la, 'Programs', 'Microsoft VS Code'), path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft VS Code'), path.join(la, 'Programs', 'Microsoft VS Code Insiders')]) {
        c.push(path.join(base, 'bin', 'code-tunnel.exe'));
      }
    } else if (MAC) {
      c.push('/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code-tunnel', path.join(os.homedir(), 'Applications/Visual Studio Code.app/Contents/Resources/app/bin/code-tunnel'));
    } else {
      c.push('/usr/share/code/bin/code-tunnel', '/usr/lib/code/bin/code-tunnel', '/snap/code/current/usr/share/code/bin/code-tunnel');
    }
    return c.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } }) || null;
  }

  status() {
    const installed = this.findInstalled();
    const own = fs.existsSync(this.ownCli) ? this.ownCli : null;
    const accepted = fs.existsSync(path.join(this.dir, 'license-accepted'));
    return {
      installed, own, cli: own || installed, accepted, running: Boolean(this.proc && this.url), url: this.url,
    };
  }

  acceptLicense() {
    fs.writeFileSync(path.join(this.dir, 'license-accepted'), new Date().toISOString());
    return true;
  }

  // Télécharge l'outil officiel (≈ 15 Mo) avec une progression.
  async download() {
    const url = `https://code.visualstudio.com/sha/download?build=stable&os=${cliFlavor()}`;
    this.emit({ phase: 'download', progress: 0 });
    const tmp = path.join(this.dir, `cli-download${WIN || MAC ? '.zip' : '.tgz'}`);
    await resumableDownload(this.fetch, url, tmp, { onProgress: (p) => this.emit({ phase: 'download', progress: p }) });
    const dest = path.join(this.dir, 'cli');
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(dest, { recursive: true });
    this.emit({ phase: 'extract' });
    if (WIN || MAC) await zip.extract(tmp, dest);
    else await new Promise((res, rej) => execFile('tar', ['xzf', tmp, '-C', dest], (e) => (e ? rej(e) : res())));
    fs.rmSync(tmp, { force: true });
    if (!WIN) fs.chmodSync(this.ownCli, 0o755);
    if (!fs.existsSync(this.ownCli)) throw new Error("L'archive de VS Code ne contient pas l'outil attendu.");
    this.emit({ phase: 'ready' });
    return this.status();
  }

  token() {
    const f = path.join(this.dir, 'token');
    if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(24).toString('hex'), { mode: 0o600 });
    return f;
  }

  // Démarre le serveur web de VS Code (le premier lancement télécharge le serveur, ≈ 60 Mo).
  start({ prefer } = {}) {
    if (this.proc && this.url) return Promise.resolve(this.url);
    if (this.starting) return this.starting;
    const st = this.status();
    const cli = prefer === 'installed' && st.installed ? st.installed : st.cli;
    if (!cli) return Promise.reject(new Error('VS Code n’est pas disponible : téléchargez-le d’abord.'));
    this.starting = (async () => {
      const port = await this.port();
      const commit = this.pinned();
      return this.spawnServer(cli, port, commit);
    })().finally(() => { this.starting = null; });
    return this.starting;
  }

  spawnServer(cli, port, commit) {
    return new Promise((resolve, reject) => {
      const args = ['serve-web', '--host', '127.0.0.1', '--port', String(port), '--connection-token-file', this.token(), '--accept-server-license-terms', '--server-data-dir', path.join(this.dir, 'server'), '--cli-data-dir', path.join(this.dir, 'cli-data'), '--disable-telemetry', ...(commit ? ['--commit-id', commit] : [])];
      const p = spawn(cli, args, { windowsHide: true, detached: !WIN, env: { ...process.env, VSCODE_CLI_DATA_DIR: path.join(this.dir, 'cli-data') } });
      this.proc = p;
      let buf = '';
      const timer = setTimeout(() => { reject(new Error('VS Code ne répond pas (délai dépassé).')); }, 120000);
      const onData = (d) => {
        const s = d.toString();
        buf += s;
        this.emit({ phase: 'log', text: s });
        const m = /Web UI available at (https?:\/\/[^\s]+)/.exec(buf);
        if (m && !this.url) {
          clearTimeout(timer);
          this.url = m[1];
          this.emit({ phase: 'running', url: this.url });
          resolve(this.url);
          this.prime(this.url).catch(() => {});
        }
      };
      p.stdout.on('data', onData);
      p.stderr.on('data', onData);
      p.on('error', (e) => { clearTimeout(timer); this.proc = null; reject(e); });
      p.on('exit', (code) => {
        clearTimeout(timer);
        this.proc = null;
        this.url = null;
        this.emit({ phase: 'stopped', code });
        reject(new Error(`VS Code s'est arrêté (code ${code}).${buf ? `\n${buf.slice(-600)}` : ''}`));
      });
    });
  }

  // Adresse pour ouvrir un dossier (chemin Windows converti au format attendu : /c:/…).
  folderUrl(dir) {
    if (!this.url) return null;
    const u = new URL(this.url);
    if (dir) {
      let p = dir.replace(/\\/g, '/');
      if (/^[a-zA-Z]:/.test(p)) p = `/${p}`;
      u.searchParams.set('folder', p);
    }
    return u.toString();
  }

  // Le serveur de VS Code lance plusieurs processus : on arrête tout le groupe.
  kill(p) {
    if (!p || !p.pid) return;
    try {
      if (WIN) execFile('taskkill', ['/pid', String(p.pid), '/T', '/F'], () => {});
      else { try { process.kill(-p.pid, 'SIGTERM'); } catch { p.kill('SIGTERM'); } }
    } catch { /* déjà arrêté */ }
  }

  stop() {
    if (!this.proc) return;
    this.kill(this.proc);
    this.proc = null;
    this.url = null;
  }
}

module.exports = { VsCode };
