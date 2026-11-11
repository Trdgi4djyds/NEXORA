'use strict';
/* Partage des sites développés en local.
 *  - Lien public : tunnel Cloudflare (cloudflared, téléchargé une fois) → https://xxxx.trycloudflare.com,
 *    accessible depuis n'importe quel appareil connecté à Internet tant que NEXORA est ouvert.
 *  - Adresse locale personnalisée : http://monsite.nexora (par défaut) ou un nom fictif en .com, servie par
 *    un relais local (WebSocket compris, pour le rechargement à chaud) et reconnue dans NEXORA sans
 *    droits administrateur (script de proxy de la session) ; en option, dans tous les navigateurs du PC
 *    (fichier hosts, avec l'accord de l'administrateur). */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const net = require('net');
const { spawn, execFile } = require('child_process');
const { resumableDownload } = require('../download');

const IS_WIN = process.platform === 'win32';
const RELAY_PORT = 47800;

function cloudflaredAsset() {
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'ia32' ? '386' : 'amd64';
  if (IS_WIN) return { name: `cloudflared-windows-${arch}.exe`, file: 'cloudflared.exe' };
  if (process.platform === 'darwin') return { name: `cloudflared-darwin-${arch === 'arm64' ? 'arm64' : 'amd64'}.tgz`, file: 'cloudflared', tgz: true };
  return { name: `cloudflared-linux-${arch}`, file: 'cloudflared' };
}

class Share {
  constructor({ binDir, fetchImpl, emit, sessions }) {
    this.binDir = binDir;
    this.fetch = fetchImpl || fetch;
    this.emit = emit || (() => {});
    this.sessions = sessions || [];
    this.tunnels = new Map(); // id → { proc, url, target }
    this.names = new Map(); // nom d'hôte → adresse cible
    this.relay = null;
    this.relay80 = null;
  }

  // ------------------------------------------------------------- tunnel public
  binPath() { return path.join(this.binDir, cloudflaredAsset().file); }

  hasCloudflared() {
    if (fs.existsSync(this.binPath())) return this.binPath();
    return null;
  }

  async installCloudflared(onProgress) {
    const a = cloudflaredAsset();
    const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/${a.name}`;
    fs.mkdirSync(this.binDir, { recursive: true });
    const tmp = path.join(this.binDir, a.name);
    await resumableDownload(this.fetch, url, tmp, { onProgress: (p) => { if (onProgress) onProgress(p); } });
    if (a.tgz) {
      await new Promise((res, rej) => execFile('tar', ['-xzf', tmp, '-C', this.binDir], (e) => (e ? rej(e) : res())));
      fs.rmSync(tmp, { force: true });
    } else if (tmp !== this.binPath()) fs.renameSync(tmp, this.binPath());
    if (!IS_WIN) fs.chmodSync(this.binPath(), 0o755);
    return this.binPath();
  }

  startTunnel(id, target) {
    const bin = this.hasCloudflared();
    if (!bin) throw new Error("cloudflared n'est pas installé.");
    this.stopTunnel(id);
    const u = new URL(target);
    const args = ['tunnel', '--no-autoupdate', '--url', target, '--http-host-header', u.host];
    const proc = spawn(bin, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const t = { proc, url: null, target, started: Date.now() };
    this.tunnels.set(id, t);
    return new Promise((resolve, reject) => {
      let log = '';
      const timer = setTimeout(() => reject(new Error(`Le tunnel ne répond pas.\n${log.slice(-600)}`)), 45000);
      const onData = (d) => {
        const s = d.toString();
        log += s;
        const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i.exec(s);
        if (m && !t.url) {
          t.url = m[0];
          clearTimeout(timer);
          this.emit({ id, url: t.url, state: 'on' });
          resolve(t.url);
        }
      };
      proc.stdout.on('data', onData);
      proc.stderr.on('data', onData);
      proc.on('exit', (code) => {
        clearTimeout(timer);
        if (this.tunnels.get(id) === t) this.tunnels.delete(id);
        this.emit({ id, state: 'off', code });
        if (!t.url) reject(new Error(`cloudflared s'est arrêté (code ${code}).\n${log.slice(-600)}`));
      });
    });
  }

  stopTunnel(id) {
    const t = this.tunnels.get(id);
    if (!t) return;
    this.tunnels.delete(id);
    try {
      if (IS_WIN) execFile('taskkill', ['/pid', String(t.proc.pid), '/T', '/F'], { windowsHide: true });
      else t.proc.kill('SIGTERM');
    } catch { /* déjà arrêté */ }
  }

  // ------------------------------------------------------------- adresses locales
  async ensureRelay() {
    if (this.relay) return RELAY_PORT;
    this.relay = await this.listen(RELAY_PORT);
    return RELAY_PORT;
  }

  listen(port) {
    const server = http.createServer((req, res) => this.forward(req, res));
    server.on('upgrade', (req, socket, head) => this.forwardUpgrade(req, socket, head));
    server.on('connect', (req, socket) => { socket.end('HTTP/1.1 501 Not Implemented\r\n\r\n'); });
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => resolve(server));
    });
  }

  route(req) {
    let host = (req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
    if (/^https?:\/\//i.test(req.url)) { try { host = new URL(req.url).hostname.toLowerCase(); } catch { /* adresse */ } }
    const target = this.names.get(host);
    if (!target) return null;
    const pathPart = /^https?:\/\//i.test(req.url) ? (() => { const x = new URL(req.url); return x.pathname + x.search; })() : req.url;
    return { target: new URL(target), path: pathPart, host };
  }

  forward(req, res) {
    const r = this.route(req);
    if (!r) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><meta charset="utf-8"><title>Adresse inconnue</title><body style="font:15px system-ui;padding:40px;color:#333"><h1 style="font-size:20px">Adresse inconnue dans NEXORA</h1><p>${String(req.headers.host || '').replace(/[<>&]/g, '')} n’est associée à aucun projet. Ouvre le Dev Lab pour la créer.</p>`);
      return;
    }
    const opts = {
      host: r.target.hostname, port: r.target.port || 80, method: req.method, path: r.path, headers: { ...req.headers, host: r.target.host, 'x-forwarded-host': r.host, 'x-forwarded-proto': 'http' },
    };
    delete opts.headers['proxy-connection'];
    const up = http.request(opts, (ur) => {
      res.writeHead(ur.statusCode, ur.headers);
      ur.pipe(res);
    });
    up.on('error', (e) => {
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><meta charset="utf-8"><body style="font:15px system-ui;padding:40px;color:#333"><h1 style="font-size:20px">Le serveur du projet ne répond pas</h1><p>${r.target.href} : ${String(e.message).replace(/[<>&]/g, '')}</p><p>Lance le projet dans le Dev Lab, puis recharge cette page.</p>`);
    });
    req.pipe(up);
  }

  forwardUpgrade(req, socket, head) {
    const r = this.route(req);
    if (!r) { socket.destroy(); return; }
    const up = net.connect(Number(r.target.port) || 80, r.target.hostname, () => {
      const headers = { ...req.headers, host: r.target.host };
      up.write(`${req.method} ${r.path} HTTP/1.1\r\n${Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join('\r\n')}\r\n\r\n`);
      if (head && head.length) up.write(head);
      up.pipe(socket);
      socket.pipe(up);
    });
    up.on('error', () => socket.destroy());
    socket.on('error', () => up.destroy());
  }

  /* Script de proxy (PAC) : seuls les noms déclarés passent par le relais, le reste en direct. */
  pac() {
    const hosts = [...this.names.keys()];
    return `function FindProxyForURL(url, host) { host = host.toLowerCase(); var h = ${JSON.stringify(hosts)}; for (var i = 0; i < h.length; i++) { if (host === h[i]) return "PROXY 127.0.0.1:${RELAY_PORT}"; } if (dnsDomainIs(host, ".vitrine") || dnsDomainIs(host, ".nexora")) return "PROXY 127.0.0.1:${RELAY_PORT}"; return "DIRECT"; }`;
  }

  async applyPac() {
    const data = `data:application/x-ns-proxy-autoconfig;base64,${Buffer.from(this.pac()).toString('base64')}`;
    for (const s of this.sessions) {
      try { await s.setProxy({ pacScript: data }); } catch { /* session fermée */ }
    }
  }

  async setName(host, target) {
    const h = String(host).toLowerCase().trim();
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(h)) throw new Error('Nom invalide : lettres, chiffres et tirets, par exemple monsite.nexora');
    await this.ensureRelay();
    this.names.set(h, target);
    await this.applyPac();
    return `http://${h}`;
  }

  async removeName(host) {
    this.names.delete(String(host).toLowerCase());
    await this.applyPac();
  }

  /* Dans tous les navigateurs du PC : fichier hosts (accord de l'administrateur) et relais sur le port 80. */
  async systemWide(hosts) {
    if (!this.relay80) {
      try { this.relay80 = await this.listen(80); } catch (e) { throw new Error(`Le port 80 est déjà utilisé (${e.code || e.message}) : les adresses locales ne marcheront que dans NEXORA.`); }
    }
    const lines = hosts.map((h) => `127.0.0.1 ${h} # NEXORA`).join('\n');
    if (IS_WIN) {
      const file = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts');
      const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      const missing = hosts.filter((h) => !new RegExp(`^\\s*127\\.0\\.0\\.1\\s+${h.replace(/\./g, '\\.')}\\b`, 'm').test(cur));
      if (!missing.length) return true;
      const tmp = path.join(os.tmpdir(), `nexora-hosts-${Date.now()}.txt`);
      fs.writeFileSync(tmp, `\r\n${missing.map((h) => `127.0.0.1 ${h} # NEXORA`).join('\r\n')}\r\n`);
      const ps = `Start-Process -FilePath powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '-NoProfile','-Command',"Get-Content -Raw '${tmp}' | Add-Content -Path '${file}' -Encoding ASCII; ipconfig /flushdns | Out-Null"`;
      await new Promise((res, rej) => execFile('powershell', ['-NoProfile', '-Command', ps], { windowsHide: true }, (e) => (e ? rej(new Error('Autorisation refusée.')) : res())));
      fs.rmSync(tmp, { force: true });
      return true;
    }
    if (process.platform === 'darwin') {
      const cmd = `do shell script "printf '\\\\n${lines.replace(/\n/g, '\\\\n')}\\\\n' >> /etc/hosts && dscacheutil -flushcache" with administrator privileges`;
      await new Promise((res, rej) => execFile('osascript', ['-e', cmd], (e) => (e ? rej(new Error('Autorisation refusée.')) : res())));
      return true;
    }
    throw new Error(`Ajoute ces lignes à /etc/hosts (avec sudo) :\n${lines}`);
  }

  list() {
    return {
      tunnels: [...this.tunnels].map(([id, t]) => ({ id, url: t.url, target: t.target, since: t.started })),
      names: [...this.names].map(([host, target]) => ({ host, target, url: `http://${host}` })),
      relay: Boolean(this.relay),
      system: Boolean(this.relay80),
      cloudflared: Boolean(this.hasCloudflared()),
    };
  }

  stopAll() {
    for (const id of [...this.tunnels.keys()]) this.stopTunnel(id);
    try { if (this.relay) this.relay.close(); } catch { /* ignore */ }
    try { if (this.relay80) this.relay80.close(); } catch { /* ignore */ }
  }
}

module.exports = { Share, RELAY_PORT };
