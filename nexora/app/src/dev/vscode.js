'use strict';
/* Visual Studio Code dans le Dev Lab : l'interface web officielle (« code serve-web ») tourne sur ce PC,
 * sur 127.0.0.1, protégée par un jeton secret. On utilise le VS Code déjà installé (son outil
 * code-tunnel) ou l'outil en ligne de commande officiel, téléchargé une fois depuis code.visualstudio.com.
 * Les extensions s'installent depuis le Marketplace, dans VS Code lui-même. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const zip = require('../android/zip');
const { resumableDownload } = require('../download');

const WIN = process.platform === 'win32';
const MAC = process.platform === 'darwin';

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
    this.starting = new Promise((resolve, reject) => {
      const args = ['serve-web', '--host', '127.0.0.1', '--port', '0', '--connection-token-file', this.token(), '--accept-server-license-terms', '--server-data-dir', path.join(this.dir, 'server'), '--cli-data-dir', path.join(this.dir, 'cli-data'), '--disable-telemetry'];
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
    }).finally(() => { this.starting = null; });
    return this.starting;
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

  stop() {
    if (!this.proc) return;
    try {
      if (WIN) execFile('taskkill', ['/pid', String(this.proc.pid), '/T', '/F'], () => {});
      // Le serveur de VS Code lance plusieurs processus : on arrête tout le groupe.
      else { try { process.kill(-this.proc.pid, 'SIGTERM'); } catch { this.proc.kill('SIGTERM'); } }
    } catch { /* déjà arrêté */ }
    this.proc = null;
    this.url = null;
  }
}

module.exports = { VsCode };
