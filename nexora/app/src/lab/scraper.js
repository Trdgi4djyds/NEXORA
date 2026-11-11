'use strict';
/* Aspiration complète d'un site : toutes les pages (liens internes, sitemap), chacune affichée dans une
 * fenêtre cachée (le JavaScript s'exécute), toutes les ressources reçues (HTML, CSS, JS, images, polices,
 * vidéos), liens réécrits pour une copie qui fonctionne hors ligne, et sources d'origine reconstituées
 * depuis les source maps quand le site les publie. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { BrowserWindow, net } = require('electron');
const cdp = require('./cdp');

const HTML_TYPES = /^(text\/html|application\/xhtml\+xml)/i;
const FILE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp|tiff?|mp4|webm|mov|m4v|mp3|wav|ogg|m4a|flac|pdf|zip|rar|7z|gz|tar|docx?|xlsx?|pptx?|csv|txt|json|xml|woff2?|ttf|otf|eot|css|js|mjs|map|apk|dmg|exe|msi)$/i;
const MAX_FILE = 80e6;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8);

function normalize(u) {
  try {
    const x = new URL(u);
    x.hash = '';
    if ((x.protocol === 'http:' && x.port === '80') || (x.protocol === 'https:' && x.port === '443')) x.port = '';
    return x.href;
  } catch { return null; }
}

const EXT_BY_MIME = {
  'text/html': '.html', 'text/css': '.css', 'text/javascript': '.js', 'application/javascript': '.js', 'application/json': '.json', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/avif': '.avif', 'image/svg+xml': '.svg', 'image/x-icon': '.ico', 'image/vnd.microsoft.icon': '.ico', 'font/woff2': '.woff2', 'font/woff': '.woff', 'font/ttf': '.ttf', 'font/otf': '.otf', 'application/font-woff': '.woff', 'video/mp4': '.mp4', 'video/webm': '.webm', 'audio/mpeg': '.mp3', 'application/pdf': '.pdf', 'application/manifest+json': '.webmanifest', 'text/plain': '.txt', 'application/xml': '.xml', 'text/xml': '.xml',
};

/** Chemin local d'une adresse dans la copie : même arborescence que le site, autres domaines dans _externe/. */
function localPath(u, origin, mime, isPage) {
  const x = new URL(u);
  let p = decodeURIComponent(x.pathname).replace(/\\/g, '/');
  p = p.split('/').map((seg) => seg.replace(/[<>:"|?*\u0000-\u001f]/g, '_').slice(0, 120)).join('/');
  if (p.endsWith('/')) p += 'index.html';
  let ext = path.posix.extname(p);
  const wantExt = mime ? EXT_BY_MIME[String(mime).split(';')[0].trim().toLowerCase()] : null;
  if (isPage) {
    if (!ext || !/^\.(html?|php|aspx?|jsp)$/i.test(ext)) { p = `${p.replace(/\/$/, '')}/index.html`; ext = '.html'; } else if (ext !== '.html' && ext !== '.htm') { p = `${p.slice(0, -ext.length)}.html`; ext = '.html'; }
  } else if (!ext && wantExt) { p += wantExt; ext = wantExt; }
  if (x.search) {
    const base = ext ? p.slice(0, -ext.length) : p;
    p = `${base}.${hash(x.search)}${ext}`;
  }
  p = p.replace(/^\/+/, '');
  if (!p) p = 'index.html';
  return x.origin === origin ? p : `_externe/${x.host.replace(/:/g, '_')}/${p}`;
}

function rel(fromFile, toFile) {
  let r = path.posix.relative(path.posix.dirname(fromFile), toFile);
  if (!r.startsWith('.')) r = `./${r}`;
  return r.split('/').map((s) => encodeURIComponent(s).replace(/%2E/g, '.')).join('/').replace(/^\.%2F/, './');
}

class Scraper {
  constructor({ url, options = {}, workDir, partition, emit }) {
    this.start = normalize(url);
    if (!this.start) throw new Error('Adresse invalide.');
    this.origin = new URL(this.start).origin;
    this.host = new URL(this.start).host;
    this.o = {
      maxPages: 200, maxDepth: 6, rendered: true, external: true, sitemap: true, robots: true, delay: 150, scroll: true, sourceMaps: true, include: '', exclude: '', subdomains: false, ...options,
    };
    this.dir = workDir;
    this.partition = partition || 'persist:vitrine-scrape';
    this.emit = emit || (() => {});
    this.queue = [];
    this.seen = new Set();
    this.pages = [];
    this.files = new Map(); // url → { path, mime, size, status, page }
    this.errors = [];
    this.disallow = [];
    this.cancelled = false;
    this.bytes = 0;
  }

  cancel() { this.cancelled = true; }

  allowedHost(u) {
    try {
      const h = new URL(u).host;
      if (h === this.host) return true;
      if (this.o.subdomains) {
        const base = this.host.replace(/^www\./, '');
        return h === base || h.endsWith(`.${base}`);
      }
      return false;
    } catch { return false; }
  }

  wanted(u) {
    if (!u || !/^https?:/.test(u) || !this.allowedHost(u)) return false;
    const p = new URL(u).pathname;
    if (FILE_EXT.test(p) && !/\.(html?|php|aspx?)$/i.test(p)) return false;
    if (this.o.robots && this.disallow.some((d) => p.startsWith(d))) return false;
    if (this.o.include && !new RegExp(this.o.include.split(/\s*,\s*/).filter(Boolean).map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')).join('|')).test(u)) return false;
    if (this.o.exclude && new RegExp(this.o.exclude.split(/\s*,\s*/).filter(Boolean).map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')).join('|')).test(u)) return false;
    return true;
  }

  enqueue(u, depth) {
    const n = normalize(u);
    if (!n || this.seen.has(n) || !this.wanted(n)) return;
    if (this.seen.size >= this.o.maxPages || depth > this.o.maxDepth) return;
    this.seen.add(n);
    this.queue.push({ url: n, depth });
  }

  async fetchText(u) {
    try {
      const r = await net.fetch(u, { session: this.win ? this.win.webContents.session : undefined });
      if (!r.ok) return null;
      return await r.text();
    } catch { return null; }
  }

  async seeds() {
    if (this.o.robots || this.o.sitemap) {
      const robots = await this.fetchText(`${this.origin}/robots.txt`);
      const maps = [];
      if (robots) {
        let applies = false;
        for (const line of robots.split(/\r?\n/)) {
          const [k, ...rest] = line.split(':');
          const v = rest.join(':').trim();
          const key = k.trim().toLowerCase();
          if (key === 'user-agent') applies = v === '*';
          else if (key === 'disallow' && applies && v && this.o.robots) this.disallow.push(v.replace(/\*.*$/, ''));
          else if (key === 'sitemap' && v) maps.push(v);
        }
      }
      if (this.o.sitemap) {
        if (!maps.length) maps.push(`${this.origin}/sitemap.xml`);
        const visited = new Set();
        const readMap = async (m, level) => {
          if (visited.has(m) || level > 2 || visited.size > 20) return;
          visited.add(m);
          const xml = await this.fetchText(m);
          if (!xml) return;
          for (const loc of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
            const u = loc[1].replace(/&amp;/g, '&');
            if (/\.xml(\?|$)/i.test(u)) await readMap(u, level + 1);
            else this.enqueue(u, 1);
          }
        };
        for (const m of maps) await readMap(m, 0);
      }
    }
  }

  async run() {
    fs.mkdirSync(this.dir, { recursive: true });
    this.win = new BrowserWindow({
      show: false, width: 1440, height: 900, webPreferences: { partition: this.partition, offscreen: false, backgroundThrottling: false, sandbox: true, contextIsolation: true, javascript: true, images: true },
    });
    const wc = this.win.webContents;
    wc.setAudioMuted(true);
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    await wc.loadURL('about:blank').catch(() => {});
    const inflight = new Map();
    let lastActivity = Date.now();
    const off = cdp.on(wc, (m, p) => {
      if (m === 'Network.requestWillBeSent') { inflight.set(p.requestId, { url: p.request.url, type: p.type }); lastActivity = Date.now(); }
      else if (m === 'Network.responseReceived') {
        const r = inflight.get(p.requestId);
        if (r) { r.status = p.response.status; r.mime = p.response.mimeType; r.headers = p.response.headers; }
      } else if (m === 'Network.loadingFinished') {
        const r = inflight.get(p.requestId);
        inflight.delete(p.requestId);
        lastActivity = Date.now();
        if (r) this.capture(wc, p.requestId, r, p.encodedDataLength).catch(() => {});
      } else if (m === 'Network.loadingFailed') { inflight.delete(p.requestId); lastActivity = Date.now(); }
    });
    try {
      await cdp.send(wc, 'Network.enable', { maxTotalBufferSize: 300e6, maxResourceBufferSize: 60e6 });
      await cdp.send(wc, 'Network.setCacheDisabled', { cacheDisabled: true });
      this.emit({ phase: 'seeds', message: 'Lecture de robots.txt et du plan du site…' });
      this.seen.add(this.start);
      this.queue.unshift({ url: this.start, depth: 0 });
      await this.seeds();
      while (this.queue.length && !this.cancelled) {
        const item = this.queue.shift();
        this.current = item.url;
        this.emit({
          phase: 'page', url: item.url, done: this.pages.length, total: Math.min(this.o.maxPages, this.seen.size), files: this.files.size, bytes: this.bytes,
        });
        const t0 = Date.now();
        let status = 0;
        let title = '';
        try {
          const done = new Promise((resolve) => {
            let tmo = null;
            const finish = () => {
              clearTimeout(tmo);
              wc.removeListener('did-finish-load', finish);
              wc.removeListener('did-fail-load', fail);
              resolve();
            };
            const fail = (_e, code, desc, url, main) => { if (main) finish(); };
            tmo = setTimeout(finish, 30000);
            wc.on('did-finish-load', finish);
            wc.on('did-fail-load', fail);
          });
          wc.loadURL(item.url).catch(() => {});
          await done;
          // Réseau au repos (ou 12 s au maximum), après défilement pour charger les images différées.
          if (this.o.scroll) {
            await wc.executeJavaScript(`new Promise((res) => { let y = 0; const step = () => { y += innerHeight * 0.9; scrollTo(0, y); if (y < document.documentElement.scrollHeight && y < 40000) setTimeout(step, 90); else { scrollTo(0, 0); res(); } }; step(); })`, true).catch(() => {});
          }
          const until = Date.now() + 12000;
          while (Date.now() < until && (inflight.size > 0 || Date.now() - lastActivity < 700)) await sleep(150);
          const info = await wc.executeJavaScript(`(() => {
            const links = [...document.querySelectorAll('a[href], area[href], link[rel~="alternate"][href], iframe[src]')].map((a) => a.href || a.src).filter(Boolean);
            const dt = document.doctype ? '<!DOCTYPE ' + document.doctype.name + (document.doctype.publicId ? ' PUBLIC "' + document.doctype.publicId + '"' : '') + (document.doctype.systemId ? ' "' + document.doctype.systemId + '"' : '') + '>' : '<!DOCTYPE html>';
            return { links, title: document.title, html: dt + '\\n' + document.documentElement.outerHTML, url: location.href };
          })()`, true);
          title = info.title;
          const doc = [...this.files.values()].find((f) => f.url === item.url || f.url === normalize(info.url));
          status = doc ? doc.status : 200;
          const pageUrl = normalize(info.url) || item.url;
          const file = localPath(pageUrl, this.origin, 'text/html', true);
          if (this.o.rendered || !doc) this.writeFile(file, Buffer.from(info.html, 'utf8'), { url: pageUrl, mime: 'text/html', status, page: true });
          else this.files.set(pageUrl, { ...doc, page: true });
          if (pageUrl !== item.url) this.files.set(item.url, { ...this.files.get(pageUrl), alias: true });
          for (const l of info.links) this.enqueue(l, item.depth + 1);
        } catch (e) {
          this.errors.push({ url: item.url, error: e.message });
        }
        this.pages.push({
          url: item.url, title, status, depth: item.depth, ms: Date.now() - t0,
        });
        if (this.o.delay) await sleep(this.o.delay);
      }
      // Captures en cours.
      const t = Date.now() + 5000;
      while (this.pending > 0 && Date.now() < t) await sleep(100);
      this.emit({ phase: 'rewrite', message: 'Réécriture des liens…', done: this.pages.length, files: this.files.size, bytes: this.bytes });
      await this.rewriteAll();
      if (this.o.sourceMaps) {
        this.emit({ phase: 'sources', message: 'Reconstitution des sources (source maps)…' });
        await this.sources();
      }
      const report = this.report();
      fs.writeFileSync(path.join(this.dir, 'nexora-aspiration.json'), JSON.stringify(report, null, 2));
      this.emit({ phase: 'done', report });
      return report;
    } finally {
      off();
      if (!this.win.isDestroyed()) this.win.destroy();
    }
  }

  async capture(wc, requestId, r, encoded) {
    if (!r.url || !/^https?:/.test(r.url)) return;
    const n = normalize(r.url);
    if (!n || (this.files.has(n) && !this.files.get(n).alias)) return;
    if (!this.o.external && new URL(n).origin !== this.origin) return;
    if (r.type === 'Document' && HTML_TYPES.test(r.mime || '') && this.o.rendered) {
      // Le document lui-même est enregistré après l'exécution du JavaScript ; on garde son code d'origine à part.
      this.pending = (this.pending || 0) + 1;
      try {
        const b = await cdp.send(wc, 'Network.getResponseBody', { requestId });
        const buf = b.base64Encoded ? Buffer.from(b.body, 'base64') : Buffer.from(b.body, 'utf8');
        const file = localPath(n, this.origin, 'text/html', true).replace(/\.html$/, '.source.html');
        this.writeFile(`_code-serveur/${file}`, buf, { url: `${n}#source`, mime: 'text/html', status: r.status, original: true });
        this.files.set(n, { url: n, status: r.status, mime: r.mime, pending: true });
      } catch { /* corps indisponible */ } finally { this.pending -= 1; }
      return;
    }
    if (encoded > MAX_FILE) return;
    if (r.status >= 400) {
      // Ressource absente du site : signalée dans le rapport, pas enregistrée (le corps est une page d'erreur).
      if (!this.errors.some((e) => e.url === n)) this.errors.push({ url: n, error: `HTTP ${r.status}`, page: this.current });
      return;
    }
    this.pending = (this.pending || 0) + 1;
    try {
      const b = await cdp.send(wc, 'Network.getResponseBody', { requestId });
      const buf = b.base64Encoded ? Buffer.from(b.body, 'base64') : Buffer.from(b.body, 'utf8');
      const isPage = r.type === 'Document' && HTML_TYPES.test(r.mime || '');
      const file = localPath(n, this.origin, r.mime, isPage);
      this.writeFile(file, buf, { url: n, mime: r.mime, status: r.status, page: isPage });
    } catch { /* corps indisponible (redirection, flux) */ } finally { this.pending -= 1; }
  }

  writeFile(file, buf, meta) {
    const abs = path.join(this.dir, ...file.split('/'));
    // Un fichier et un dossier ne peuvent pas porter le même nom (ex. /blog et /blog/article).
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) return this.writeFile(`${file.replace(/\/$/, '')}/index.html`, buf, meta);
    let dir = path.dirname(abs);
    try { fs.mkdirSync(dir, { recursive: true }); } catch {
      // Un fichier occupe le nom d'un dossier : on le déplace en index.html de ce dossier.
      const parts = path.relative(this.dir, dir).split(path.sep);
      for (let i = 1; i <= parts.length; i += 1) {
        const p = path.join(this.dir, ...parts.slice(0, i));
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
          const tmp = `${p}.__tmp`;
          fs.renameSync(p, tmp);
          fs.mkdirSync(p, { recursive: true });
          fs.renameSync(tmp, path.join(p, 'index.html'));
          for (const f of this.files.values()) if (f.path === path.relative(this.dir, p).split(path.sep).join('/')) f.path = `${f.path}/index.html`;
        }
      }
      dir = path.dirname(abs);
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(abs, buf);
    this.bytes += buf.length;
    this.files.set(meta.url, { ...meta, path: file, size: buf.length });
    return file;
  }

  mapUrl(u, base) {
    let abs;
    try { abs = new URL(u.replace(/&amp;/g, '&'), base); } catch { return null; }
    if (!/^https?:$/.test(abs.protocol)) return null;
    const h = abs.hash;
    abs.hash = '';
    const f = this.files.get(normalize(abs.href));
    return f && f.path ? { path: f.path, hash: h } : null;
  }

  rewriteText(text, file, baseUrl, kind) {
    const swap = (raw) => {
      const v = raw.trim();
      if (!v || /^(data:|blob:|javascript:|mailto:|tel:|#|about:)/i.test(v)) return raw;
      const m = this.mapUrl(v, baseUrl);
      return m ? rel(file, m.path) + m.hash : raw;
    };
    let out = text;
    if (kind === 'html') {
      out = out.replace(/<base\b[^>]*>/gi, '');
      out = out.replace(/\s(integrity|crossorigin)(="[^"]*")?/gi, '');
      out = out.replace(/(\s(?:src|href|poster|data-src|data-href|action|data-bg|data-background|content)=")([^"]*)(")/gi, (all, a, v, b) => {
        if (/content="/i.test(a) && !/^https?:|^\//.test(v)) return all;
        return a + swap(v) + b;
      });
      out = out.replace(/(\s(?:srcset|data-srcset|imagesrcset)=")([^"]*)(")/gi, (all, a, v, b) => a + v.split(',').map((part) => {
        const [u, ...d] = part.trim().split(/\s+/);
        return [swap(u), ...d].join(' ');
      }).join(', ') + b);
      out = out.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (all, a, css, b) => a + this.rewriteCss(css, file, baseUrl, swap) + b);
      out = out.replace(/(\sstyle=")([^"]*)(")/gi, (all, a, css, b) => a + this.rewriteCss(css.replace(/&quot;/g, '"'), file, baseUrl, swap).replace(/"/g, '&quot;') + b);
    } else if (kind === 'css') out = this.rewriteCss(out, file, baseUrl, swap);
    return out;
  }

  rewriteCss(css, file, baseUrl, swap) {
    return css
      .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (all, q, u) => `url(${q}${swap(u)}${q})`)
      .replace(/@import\s+(['"])([^'"]+)\1/gi, (all, q, u) => `@import ${q}${swap(u)}${q}`);
  }

  async rewriteAll() {
    for (const f of this.files.values()) {
      if (!f.path || f.alias || f.original) continue;
      const kind = f.page || /html/i.test(f.mime || '') ? 'html' : /css/i.test(f.mime || '') || f.path.endsWith('.css') ? 'css' : null;
      if (!kind) continue;
      const abs = path.join(this.dir, ...f.path.split('/'));
      try {
        const text = fs.readFileSync(abs, 'utf8');
        fs.writeFileSync(abs, this.rewriteText(text, f.path, f.url, kind));
      } catch { /* fichier déplacé */ }
    }
  }

  /** Sources d'origine (React, Vue, TypeScript…) écrites depuis les source maps publiées. */
  async sources() {
    let count = 0;
    const done = new Set();
    for (const f of [...this.files.values()]) {
      if (!f.path || !/\.(m?js|css)$/i.test(f.path)) continue;
      const abs = path.join(this.dir, ...f.path.split('/'));
      let text;
      try { text = fs.readFileSync(abs, 'utf8'); } catch { continue; }
      const m = /[#@]\s*sourceMappingURL=([^\s'"*]+)\s*(?:\*\/)?\s*$/m.exec(text.slice(-4000));
      if (!m) continue;
      let map = null;
      try {
        if (m[1].startsWith('data:')) {
          const b64 = m[1].split(',')[1];
          map = JSON.parse(Buffer.from(b64, /;base64/.test(m[1]) ? 'base64' : 'utf8').toString('utf8'));
        } else {
          const u = new URL(m[1], f.url).href;
          if (done.has(u)) continue;
          done.add(u);
          const t = await this.fetchText(u);
          if (t) map = JSON.parse(t);
        }
      } catch { map = null; }
      if (!map || !Array.isArray(map.sources) || !Array.isArray(map.sourcesContent)) continue;
      map.sources.forEach((s, i) => {
        const content = map.sourcesContent[i];
        if (typeof content !== 'string') return;
        let p = String(s).replace(/^webpack:\/\/\/?/, '').replace(/^[a-z]+:\/\/\/?/i, '').replace(/^(\.\.\/)+/, '').replace(/\?.*$/, '');
        p = p.split('/').filter((x) => x && x !== '..' && x !== '.').map((x) => x.replace(/[<>:"|?*\u0000-\u001f]/g, '_')).join('/');
        if (!p || /node_modules\//.test(p) && !this.o.sourceMapsDeps) return;
        const target = path.join(this.dir, '_sources', ...p.split('/'));
        try {
          fs.mkdirSync(path.dirname(target), { recursive: true });
          if (!fs.existsSync(target)) { fs.writeFileSync(target, content); count += 1; }
        } catch { /* nom impossible */ }
      });
    }
    this.sourceCount = count;
  }

  report() {
    const byType = {};
    for (const f of this.files.values()) {
      if (!f.path || f.alias) continue;
      const k = f.page ? 'pages' : /css/.test(f.mime || '') ? 'css' : /javascript|ecmascript/.test(f.mime || '') ? 'js' : /^image\//.test(f.mime || '') ? 'images' : /font/.test(f.mime || '') || /\.(woff2?|ttf|otf)$/.test(f.path) ? 'polices' : /^(video|audio)\//.test(f.mime || '') ? 'médias' : 'autres';
      byType[k] = byType[k] || { count: 0, bytes: 0 };
      byType[k].count += 1;
      byType[k].bytes += f.size || 0;
    }
    const entry = this.files.get(this.start);
    return {
      start: this.start,
      host: this.host,
      date: new Date().toISOString(),
      cancelled: this.cancelled,
      pages: this.pages,
      files: this.files.size,
      bytes: this.bytes,
      byType,
      sources: this.sourceCount || 0,
      errors: this.errors,
      index: entry && entry.path ? entry.path : 'index.html',
      dir: this.dir,
      options: this.o,
    };
  }
}

module.exports = { Scraper, localPath, normalize };
