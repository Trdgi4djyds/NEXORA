'use strict';
/* Tests automatiques de navigation (Browser Lab).
 *  - Exploration : chaque page interne est ouverte sur ordinateur et sur mobile ; on relève le code HTTP,
 *    le temps de chargement, les erreurs JavaScript, les requêtes en échec, les images cassées, les liens
 *    morts, le débordement horizontal, le titre, la description et une miniature.
 *  - Scénarios : suites d'étapes (aller à, cliquer, saisir, attendre, vérifier) rejouées automatiquement. */
const { BrowserWindow, net } = require('electron');
const cdp = require('./cdp');
const { normalize } = require('./scraper');

const VIEWPORTS = {
  desktop: { label: 'Ordinateur', width: 1440, height: 900, dpr: 1, mobile: false },
  laptop: { label: 'Portable', width: 1280, height: 800, dpr: 1, mobile: false },
  tablet: { label: 'Tablette', width: 820, height: 1180, dpr: 2, mobile: true },
  mobile: { label: 'Mobile', width: 390, height: 844, dpr: 3, mobile: true },
};
const MOBILE_UA = (v) => `Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Mobile Safari/537.36`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Petite bibliothèque injectée pour les scénarios : recherche par sélecteur CSS ou par texte (« text=… »).
const HELPERS = `window.__vt || (window.__vt = (() => {
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const find = (sel) => {
    if (!sel) return null;
    if (sel.startsWith('text=')) {
      const t = sel.slice(5).trim().toLowerCase();
      const all = [...document.querySelectorAll('a, button, [role=button], input[type=submit], input[type=button], label, summary, [onclick], li, span, div, h1, h2, h3, h4, p')];
      return all.filter(visible).filter((el) => (el.innerText || el.value || '').trim().toLowerCase().includes(t)).sort((a, b) => (a.innerText || '').length - (b.innerText || '').length)[0] || null;
    }
    try { return document.querySelector(sel); } catch { return null; }
  };
  const setValue = (el, v) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const d = Object.getOwnPropertyDescriptor(proto, 'value');
    if (d && d.set) d.set.call(el, v); else el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  return { find, visible, setValue };
})());`;

class NavTester {
  constructor({ url, options = {}, emit, partition, chrome }) {
    this.start = normalize(url);
    if (!this.start) throw new Error('Adresse invalide.');
    this.origin = new URL(this.start).origin;
    this.o = {
      maxPages: 30, viewports: ['desktop', 'mobile'], checkLinks: true, screenshots: true, timeout: 25000, ...options,
    };
    this.emit = emit || (() => {});
    this.partition = partition || 'persist:vitrine';
    this.chrome = chrome || '140.0.0.0';
    this.cancelled = false;
  }

  cancel() { this.cancelled = true; }

  async open() {
    this.win = new BrowserWindow({ show: false, width: 1440, height: 900, webPreferences: { partition: this.partition, backgroundThrottling: false, sandbox: true } });
    const wc = this.win.webContents;
    wc.setAudioMuted(true);
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    // Sans page chargée, la fenêtre n'a pas encore de processus : le protocole DevTools ne répondrait pas.
    await wc.loadURL('about:blank').catch(() => {});
    this.wc = wc;
    this.ev = { console: [], failed: [], doc: null };
    this.off = cdp.on(wc, (m, p) => {
      if (m === 'Runtime.exceptionThrown') this.ev.console.push({ level: 'error', text: (p.exceptionDetails.exception && p.exceptionDetails.exception.description) || p.exceptionDetails.text, url: p.exceptionDetails.url });
      else if (m === 'Runtime.consoleAPICalled' && (p.type === 'error' || p.type === 'assert')) this.ev.console.push({ level: 'error', text: p.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 400) });
      else if (m === 'Log.entryAdded' && p.entry.level === 'error' && p.entry.source !== 'network') this.ev.console.push({ level: 'error', text: p.entry.text, url: p.entry.url });
      else if (m === 'Network.responseReceived') {
        if (p.type === 'Document' && !this.ev.doc) this.ev.doc = { status: p.response.status, url: p.response.url, protocol: p.response.protocol };
        if (p.response.status >= 400) this.ev.failed.push({ url: p.response.url, status: p.response.status, type: p.type });
      } else if (m === 'Network.loadingFailed' && !p.canceled) this.ev.failed.push({ url: '', error: p.errorText, type: p.type, id: p.requestId });
      else if (m === 'Network.requestWillBeSent') this.reqs.set(p.requestId, p.request.url);
    });
    this.reqs = new Map();
    await cdp.send(wc, 'Runtime.enable');
    await cdp.send(wc, 'Log.enable');
    await cdp.send(wc, 'Network.enable');
    await cdp.send(wc, 'Network.setCacheDisabled', { cacheDisabled: true });
  }

  close() {
    try { this.off(); } catch { /* déjà fermé */ }
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
  }

  async viewport(name) {
    const v = VIEWPORTS[name] || VIEWPORTS.desktop;
    this.win.setContentSize(v.width, v.height);
    await cdp.send(this.wc, 'Emulation.setDeviceMetricsOverride', {
      width: v.width, height: v.height, deviceScaleFactor: v.dpr, mobile: v.mobile, screenWidth: v.width, screenHeight: v.height,
    });
    await cdp.send(this.wc, 'Emulation.setTouchEmulationEnabled', { enabled: v.mobile, maxTouchPoints: v.mobile ? 5 : 1 });
    await cdp.send(this.wc, 'Emulation.setUserAgentOverride', { userAgent: v.mobile ? MOBILE_UA(this.chrome) : this.wc.session.getUserAgent() });
    return v;
  }

  async load(url) {
    this.ev = { console: [], failed: [], doc: null };
    const wc = this.wc;
    const t0 = Date.now();
    await new Promise((resolve) => {
      let tmo = null;
      const finish = () => { clearTimeout(tmo); wc.removeListener('did-finish-load', finish); wc.removeListener('did-fail-load', fail); resolve(); };
      const fail = (_e, code, desc, u, main) => { if (main) { this.ev.loadError = desc; finish(); } };
      tmo = setTimeout(() => { this.ev.timeout = true; finish(); }, this.o.timeout);
      wc.on('did-finish-load', finish);
      wc.on('did-fail-load', fail);
      wc.loadURL(url).catch(() => {});
    });
    await sleep(600);
    return Date.now() - t0;
  }

  async inspect() {
    return this.wc.executeJavaScript(`(() => {
      const nav = performance.getEntriesByType('navigation')[0] || {};
      const lcp = (performance.getEntriesByType('largest-contentful-paint') || []).slice(-1)[0];
      const imgs = [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith('data:')).map((i) => i.currentSrc || i.src);
      const links = [...document.querySelectorAll('a[href]')].map((a) => a.href).filter((h) => /^https?:/.test(h));
      const de = document.documentElement;
      const over = de.scrollWidth > innerWidth + 1;
      let culprit = null;
      if (over) {
        for (const el of document.body.querySelectorAll('*')) {
          const r = el.getBoundingClientRect();
          if (r.right > innerWidth + 1 && r.width > 0 && getComputedStyle(el).position !== 'fixed') { culprit = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList[0] ? '.' + el.classList[0] : ''); break; }
        }
      }
      const small = [...document.querySelectorAll('a, button, [role=button], input, select')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.width < 24 || r.height < 24); }).length;
      return {
        title: document.title, h1: document.querySelectorAll('h1').length, description: (document.querySelector('meta[name="description"]') || {}).content || '',
        viewport: Boolean(document.querySelector('meta[name="viewport"]')), lang: de.lang || '',
        ttfb: nav.responseStart ? Math.round(nav.responseStart - nav.startTime) : null, dcl: nav.domContentLoadedEventEnd ? Math.round(nav.domContentLoadedEventEnd) : null, load: nav.loadEventEnd ? Math.round(nav.loadEventEnd) : null,
        lcp: lcp ? Math.round(lcp.startTime) : null, transfer: Math.round(performance.getEntriesByType('resource').reduce((a, r) => a + (r.transferSize || 0), nav.transferSize || 0)),
        requests: performance.getEntriesByType('resource').length + 1, brokenImages: imgs.slice(0, 20), links, overflow: over ? { width: de.scrollWidth, viewport: innerWidth, culprit } : null, smallTargets: small,
        url: location.href,
      };
    })()`, true);
  }

  async thumb() {
    try {
      const img = await this.wc.capturePage();
      const s = img.getSize();
      return img.resize({ width: 360, height: Math.round((360 * s.height) / s.width), quality: 'good' }).toJPEG(72).toString('base64');
    } catch { return null; }
  }

  issuesFor(r, vp) {
    const out = [];
    if (r.status >= 400 || r.loadError) out.push({ level: 'error', text: r.loadError ? `Page inaccessible : ${r.loadError}` : `Code HTTP ${r.status}` });
    if (r.timeout) out.push({ level: 'warn', text: 'Chargement trop long (délai dépassé)' });
    for (const c of r.console.slice(0, 10)) out.push({ level: 'error', text: `Erreur JavaScript : ${c.text}` });
    for (const f of r.failed.slice(0, 12)) out.push({ level: f.status >= 500 || f.type === 'Script' || f.type === 'Stylesheet' ? 'error' : 'warn', text: `${f.status ? `HTTP ${f.status}` : f.error} : ${f.url}` });
    for (const i of r.info.brokenImages || []) out.push({ level: 'warn', text: `Image cassée : ${i}` });
    if (r.info.overflow) out.push({ level: vp.mobile ? 'error' : 'warn', text: `Défilement horizontal : la page fait ${r.info.overflow.width} px pour ${r.info.overflow.viewport} px de large${r.info.overflow.culprit ? ` (élément : ${r.info.overflow.culprit})` : ''}` });
    if (!r.info.title) out.push({ level: 'warn', text: 'Titre de page manquant' });
    if (!r.info.description) out.push({ level: 'info', text: 'Description (meta description) manquante' });
    if (r.info.h1 === 0) out.push({ level: 'info', text: 'Aucun titre principal (h1)' });
    if (r.info.h1 > 1) out.push({ level: 'info', text: `${r.info.h1} titres h1 (un seul est conseillé)` });
    if (vp.mobile && !r.info.viewport) out.push({ level: 'error', text: 'Balise viewport absente : la page n’est pas adaptée au mobile' });
    if (vp.mobile && r.info.smallTargets > 3) out.push({ level: 'info', text: `${r.info.smallTargets} zones tactiles de moins de 24 px` });
    if (r.info.lcp && r.info.lcp > 4000) out.push({ level: 'warn', text: `Plus grand élément affiché tardivement (LCP ${(r.info.lcp / 1000).toFixed(1)} s)` });
    else if (r.ms > 6000) out.push({ level: 'warn', text: `Chargement lent (${(r.ms / 1000).toFixed(1)} s)` });
    return out;
  }

  async explore() {
    await this.open();
    const results = [];
    const linkTargets = new Map(); // lien interne → pages qui le contiennent
    const external = new Map();
    try {
      for (const vpName of this.o.viewports) {
        if (this.cancelled) break;
        const vp = await this.viewport(vpName);
        const queue = [this.start];
        const seen = new Set(queue);
        let n = 0;
        while (queue.length && n < this.o.maxPages && !this.cancelled) {
          const url = queue.shift();
          n += 1;
          this.emit({ phase: 'page', viewport: vpName, url, done: n, total: Math.min(this.o.maxPages, seen.size) });
          const ms = await this.load(url);
          let info = {};
          try { info = await this.inspect(); } catch { info = {}; }
          const r = {
            url, viewport: vpName, ms, status: this.ev.doc ? this.ev.doc.status : 0, console: this.ev.console.slice(0, 30), failed: this.ev.failed.filter((f) => f.url || f.error).map((f) => ({ ...f, url: f.url || this.reqs.get(f.id) || '' })).slice(0, 40), info, timeout: this.ev.timeout, loadError: this.ev.loadError,
          };
          r.issues = this.issuesFor(r, vp);
          if (this.o.screenshots) r.thumb = await this.thumb();
          results.push(r);
          this.emit({ phase: 'result', result: r });
          for (const l of info.links || []) {
            const nl = normalize(l);
            if (!nl) continue;
            if (nl.startsWith(this.origin)) {
              if (!linkTargets.has(nl)) linkTargets.set(nl, new Set());
              linkTargets.get(nl).add(url);
              if (!seen.has(nl) && !/\.(pdf|zip|jpe?g|png|gif|webp|svg|mp4|mp3|docx?|xlsx?)$/i.test(new URL(nl).pathname)) { seen.add(nl); queue.push(nl); }
            } else if (external.size < 150 && !external.has(nl)) external.set(nl, url);
          }
        }
      }
      // Liens morts : pages internes non visitées et liens externes (requête HEAD, puis GET).
      const broken = [];
      if (this.o.checkLinks && !this.cancelled) {
        const visited = new Set(results.map((r) => normalize(r.url)));
        for (const r of results) if (r.status >= 400) broken.push({ url: r.url, status: r.status, from: [...(linkTargets.get(normalize(r.url)) || [])].slice(0, 5) });
        const toCheck = [...linkTargets.keys()].filter((u) => !visited.has(u)).slice(0, 200).map((u) => [u, [...linkTargets.get(u)]]).concat([...external].slice(0, 100).map(([u, from]) => [u, [from]]));
        let i = 0;
        const worker = async () => {
          while (i < toCheck.length && !this.cancelled) {
            const [u, from] = toCheck[i];
            i += 1;
            this.emit({ phase: 'links', done: i, total: toCheck.length });
            let status = 0;
            try {
              let res = await net.fetch(u, { method: 'HEAD', redirect: 'follow', session: this.wc.session });
              if (res.status === 405 || res.status === 403 || res.status === 501) res = await net.fetch(u, { method: 'GET', redirect: 'follow', session: this.wc.session });
              status = res.status;
            } catch (e) { status = -1; }
            if (status >= 400 || status === -1) broken.push({ url: u, status, from: from.slice(0, 5) });
          }
        };
        await Promise.all([worker(), worker(), worker(), worker()]);
      }
      const summary = {
        pages: results.length,
        errors: results.reduce((a, r) => a + r.issues.filter((x) => x.level === 'error').length, 0),
        warnings: results.reduce((a, r) => a + r.issues.filter((x) => x.level === 'warn').length, 0),
        broken,
        avgMs: results.length ? Math.round(results.reduce((a, r) => a + r.ms, 0) / results.length) : 0,
        slowest: results.slice().sort((a, b) => b.ms - a.ms).slice(0, 5).map((r) => ({ url: r.url, ms: r.ms, viewport: r.viewport })),
        cancelled: this.cancelled,
      };
      this.emit({ phase: 'done', summary });
      return { results, summary };
    } finally { this.close(); }
  }

  /* Scénario : [{ action, selector?, value?, timeout? }] */
  async scenario(steps, vpName = 'desktop') {
    await this.open();
    const out = [];
    try {
      await this.viewport(vpName);
      let ok = true;
      for (let i = 0; i < steps.length && !this.cancelled; i += 1) {
        const s = steps[i];
        const t0 = Date.now();
        let res = { ok: true };
        try {
          res = await this.step(s);
        } catch (e) { res = { ok: false, error: e.message }; }
        const r = {
          i, step: s, ok: res.ok, error: res.error, ms: Date.now() - t0, url: this.wc.getURL(),
        };
        if (!res.ok || s.action === 'screenshot') r.thumb = await this.thumb();
        out.push(r);
        this.emit({ phase: 'step', result: r });
        if (!res.ok) { ok = false; break; }
      }
      const summary = {
        ok: ok && !this.cancelled, steps: out.length, total: steps.length, console: this.ev.console.slice(0, 20), failed: this.ev.failed.slice(0, 20),
      };
      this.emit({ phase: 'done', summary });
      return { steps: out, summary };
    } finally { this.close(); }
  }

  async waitFor(fnSrc, timeout = 8000) {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      // eslint-disable-next-line no-await-in-loop
      const v = await this.wc.executeJavaScript(`${HELPERS}(${fnSrc})()`, true).catch(() => false);
      if (v) return v;
      // eslint-disable-next-line no-await-in-loop
      await sleep(150);
    }
    return false;
  }

  async step(s) {
    const sel = JSON.stringify(s.selector || '');
    const val = JSON.stringify(s.value == null ? '' : String(s.value));
    const timeout = Number(s.timeout) || 8000;
    switch (s.action) {
      case 'goto': {
        const url = new URL(s.value || '/', this.wc.getURL() && /^https?:/.test(this.wc.getURL()) ? this.wc.getURL() : this.start).href;
        await this.load(url);
        if (this.ev.loadError) return { ok: false, error: this.ev.loadError };
        if (this.ev.doc && this.ev.doc.status >= 400) return { ok: false, error: `HTTP ${this.ev.doc.status}` };
        return { ok: true };
      }
      case 'click': {
        const found = await this.waitFor(`() => { const el = __vt.find(${sel}); if (!el || !__vt.visible(el)) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true; }`, timeout);
        if (!found) return { ok: false, error: `Élément introuvable : ${s.selector}` };
        await sleep(500);
        return { ok: true };
      }
      case 'type': {
        const found = await this.waitFor(`() => { const el = __vt.find(${sel}); if (!el) return false; el.focus(); __vt.setValue(el, ${val}); return true; }`, timeout);
        return found ? { ok: true } : { ok: false, error: `Champ introuvable : ${s.selector}` };
      }
      case 'select': {
        const found = await this.waitFor(`() => { const el = __vt.find(${sel}); if (!el) return false; __vt.setValue(el, ${val}); return true; }`, timeout);
        return found ? { ok: true } : { ok: false, error: `Liste introuvable : ${s.selector}` };
      }
      case 'press': {
        await this.wc.executeJavaScript(`(() => { const el = document.activeElement || document.body; const k = ${val}; for (const t of ['keydown', 'keypress', 'keyup']) el.dispatchEvent(new KeyboardEvent(t, { key: k, bubbles: true })); if (k === 'Enter' && el.form) el.form.requestSubmit ? el.form.requestSubmit() : el.form.submit(); })()`, true);
        await sleep(500);
        return { ok: true };
      }
      case 'wait': {
        if (s.selector) {
          const ok = await this.waitFor(`() => { const el = __vt.find(${sel}); return Boolean(el && __vt.visible(el)); }`, timeout);
          return ok ? { ok: true } : { ok: false, error: `Toujours absent après ${timeout / 1000} s : ${s.selector}` };
        }
        await sleep(Math.min(30000, Number(s.value) || 1000));
        return { ok: true };
      }
      case 'scroll': {
        await this.wc.executeJavaScript(`${HELPERS}(() => { const el = __vt.find(${sel}); if (el) el.scrollIntoView({ block: 'center' }); else scrollBy(0, Number(${val}) || innerHeight); })()`, true);
        await sleep(400);
        return { ok: true };
      }
      case 'assertText': {
        const ok = await this.waitFor(`() => (document.body.innerText || '').toLowerCase().includes(${val}.toLowerCase())`, timeout);
        return ok ? { ok: true } : { ok: false, error: `Texte absent : « ${s.value} »` };
      }
      case 'assertNoText': {
        const has = await this.wc.executeJavaScript(`(document.body.innerText || '').toLowerCase().includes(${val}.toLowerCase())`, true);
        return has ? { ok: false, error: `Texte présent : « ${s.value} »` } : { ok: true };
      }
      case 'assertUrl': {
        const ok = await this.waitFor(`() => location.href.includes(${val})`, timeout);
        return ok ? { ok: true } : { ok: false, error: `L’adresse ne contient pas « ${s.value} » (${this.wc.getURL()})` };
      }
      case 'assertVisible': {
        const ok = await this.waitFor(`() => { const el = __vt.find(${sel}); return Boolean(el && __vt.visible(el)); }`, timeout);
        return ok ? { ok: true } : { ok: false, error: `Élément invisible : ${s.selector}` };
      }
      case 'assertTitle': {
        const t = await this.wc.executeJavaScript('document.title', true);
        return String(t).toLowerCase().includes(String(s.value || '').toLowerCase()) ? { ok: true } : { ok: false, error: `Titre « ${t} »` };
      }
      case 'assertNoErrors':
        return this.ev.console.length ? { ok: false, error: `${this.ev.console.length} erreur(s) JavaScript : ${this.ev.console[0].text}` } : { ok: true };
      case 'screenshot': return { ok: true };
      default: return { ok: false, error: `Action inconnue : ${s.action}` };
    }
  }
}

module.exports = { NavTester, VIEWPORTS, HELPERS };
