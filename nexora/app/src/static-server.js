'use strict';
// Petit serveur HTTP pour un dossier de build (dist/, build/) ou un site HTML.
// Les routes inconnues renvoient index.html, comme une application à page unique.
const http = require('http');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.bmp': 'image/bmp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.wasm': 'application/wasm', '.pdf': 'application/pdf',
};

class StaticServer extends EventEmitter {
  constructor(root) {
    super();
    this.root = path.resolve(root);
    this.server = null;
    this.watcher = null;
    this.url = null;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handle(req, res));
      this.server.on('error', reject);
      this.server.listen(0, '127.0.0.1', () => {
        this.url = `http://localhost:${this.server.address().port}/`;
        this.watch();
        resolve(this.url);
      });
    });
  }

  watch() {
    let timer = null;
    try {
      this.watcher = fs.watch(this.root, { recursive: true }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => this.emit('change'), 300);
      });
    } catch {
      this.watcher = null;
    }
  }

  handle(req, res) {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400); res.end(); return;
    }
    let file = path.normalize(path.join(this.root, pathname));
    if (!file.startsWith(this.root)) { res.writeHead(403); res.end(); return; }

    const send = (fp) => {
      const type = MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      fs.createReadStream(fp).pipe(res);
    };

    fs.stat(file, (err, st) => {
      if (!err && st.isDirectory()) file = path.join(file, 'index.html');
      fs.stat(file, (err2, st2) => {
        if (!err2 && st2.isFile()) return send(file);
        if (!path.extname(pathname)) {
          const index = path.join(this.root, 'index.html');
          if (fs.existsSync(index)) return send(index);
        }
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Fichier introuvable');
        return undefined;
      });
    });
  }

  close() {
    try { this.watcher && this.watcher.close(); } catch { /* ignore */ }
    try { this.server && this.server.close(); } catch { /* ignore */ }
    this.watcher = null;
    this.server = null;
  }
}

module.exports = { StaticServer };
