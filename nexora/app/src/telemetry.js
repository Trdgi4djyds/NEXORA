'use strict';
/* NEXORA #015 — Santé de NEXORA elle-même (onglet « Plateforme » de la supervision), mesurée sur ce PC
 * et gardée sur ce PC : processeur et mémoire de chaque processus (interface, sites affichés, GPU…),
 * erreurs de l'interface, plantages, sessions, et disponibilité des services en ligne de NEXORA
 * (compte, base de données, stockage, temps réel, fonctions). Rien n'est envoyé ailleurs. */
const fs = require('fs');
const os = require('os');
const path = require('path');

const SAMPLE_MS = 10000; // relevé des processus
const SAMPLES = 360; // 1 h de relevés détaillés
const MINUTES = 1440; // 24 h en moyennes par minute
const SERVICE_MS = 60000; // vérification des services en ligne
const SERVICE_KEEP = 1440; // 24 h par service

const SERVICES = [
  { id: 'auth', label: 'Comptes et connexion', path: '/auth/v1/health' },
  { id: 'db', label: 'Base de données', path: '/rest/v1/plans?select=id&limit=1' },
  { id: 'storage', label: 'Stockage des fichiers', path: '/storage/v1/status' },
  { id: 'functions', label: 'Fonctions serveur', path: '/functions/v1/site-info', method: 'OPTIONS' },
  { id: 'realtime', label: 'Temps réel (synchronisation)', ws: '/realtime/v1/websocket' },
];

const GROUPS = { main: 'Processus principal', window: 'Interface', webview: 'Sites affichés', gpu: 'Carte graphique', other: 'Services' };

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }

class Telemetry {
  constructor({ app, net, getWin, webContents, now }) {
    this.app = app;
    this.net = net;
    this.getWin = getWin || (() => null);
    this.webContents = webContents || null;
    this.now = now || Date.now;
    this.file = path.join(app.getPath('userData'), 'telemetry.json');
    const saved = readJson(this.file, {});
    this.events = Array.isArray(saved.events) ? saved.events : [];
    this.sessions = Array.isArray(saved.sessions) ? saved.sessions : [];
    this.services = saved.services && typeof saved.services === 'object' ? saved.services : {};
    this.serviceCfg = saved.serviceCfg || null;
    this.samples = [];
    this.minutes = [];
    this.minuteAcc = [];
    this.prevCpu = null;
    this.startedAt = this.now();
    // Session précédente sans fin enregistrée : NEXORA s'est fermée brutalement (plantage, coupure).
    const last = this.sessions[this.sessions.length - 1];
    if (last && !last.end) {
      last.end = last.lastSeen || last.start;
      last.unexpected = true;
      this.event('crash', 'Fermeture inattendue de NEXORA lors de la session précédente', { at: last.end });
    }
    this.session = { start: this.startedAt, end: null, lastSeen: this.startedAt, version: safe(() => app.getVersion(), ''), errors: 0, crashes: 0 };
    this.sessions.push(this.session);
    if (this.sessions.length > 60) this.sessions.splice(0, this.sessions.length - 60);
    this.save();
  }

  event(kind, message, extra = {}) {
    const at = extra.at || this.now();
    // Même message dans la minute : on compte au lieu d'empiler.
    const same = this.events.find((e) => e.kind === kind && e.message === message && at - e.last < 60000);
    if (same) { same.count += 1; same.last = at; } else {
      this.events.unshift({ at, last: at, kind, message: String(message).slice(0, 500), count: 1, ...extra, at });
      if (this.events.length > 300) this.events.length = 300;
    }
    if (this.session) {
      if (kind === 'error') this.session.errors += 1;
      if (kind === 'crash') this.session.crashes += 1;
    }
    this.saveLater();
  }

  save() {
    try {
      fs.writeFileSync(this.file, JSON.stringify({ events: this.events, sessions: this.sessions, services: this.services, serviceCfg: this.serviceCfg }));
    } catch { /* best effort */ }
  }

  saveLater() { clearTimeout(this.saveT); this.saveT = setTimeout(() => this.save(), 2000); }

  // Type de chaque processus de rendu : fenêtre de NEXORA ou site affiché dans un appareil.
  rendererKinds() {
    const kinds = new Map();
    if (!this.webContents) return kinds;
    for (const wc of safe(() => this.webContents.getAllWebContents(), [])) {
      const pid = safe(() => wc.getOSProcessId(), 0);
      if (pid) kinds.set(pid, safe(() => wc.getType(), '') === 'webview' ? 'webview' : 'window');
    }
    return kinds;
  }

  sample() {
    const at = this.now();
    const groups = {};
    for (const g of Object.keys(GROUPS)) groups[g] = { cpu: 0, mem: 0, n: 0 };
    const metrics = safe(() => this.app.getAppMetrics(), []);
    const kinds = this.rendererKinds();
    let cpu = 0; let mem = 0;
    for (const m of metrics) {
      const g = m.type === 'Browser' ? 'main' : m.type === 'GPU' ? 'gpu' : m.type === 'Tab' ? kinds.get(m.pid) || 'window' : 'other';
      const c = (m.cpu && m.cpu.percentCPUUsage) || 0;
      const w = ((m.memory && m.memory.workingSetSize) || 0) / 1024; // Mo
      groups[g].cpu += c; groups[g].mem += w; groups[g].n += 1;
      cpu += c; mem += w;
    }
    // Processeur de tout le PC, d'après les compteurs du système.
    const times = os.cpus().reduce((acc, c) => { const t = c.times; acc.idle += t.idle; acc.total += t.user + t.nice + t.sys + t.idle + t.irq; return acc; }, { idle: 0, total: 0 });
    let sysCpu = null;
    if (this.prevCpu && times.total > this.prevCpu.total) sysCpu = Math.round((1 - (times.idle - this.prevCpu.idle) / (times.total - this.prevCpu.total)) * 1000) / 10;
    this.prevCpu = times;
    const r1 = (v) => Math.round(v * 10) / 10;
    for (const g of Object.keys(groups)) { groups[g].cpu = r1(groups[g].cpu); groups[g].mem = Math.round(groups[g].mem); }
    const s = { t: at, cpu: r1(cpu), mem: Math.round(mem), sysCpu, sysMem: Math.round((os.totalmem() - os.freemem()) / 1048576), procs: metrics.length, groups };
    this.samples.push(s);
    if (this.samples.length > SAMPLES) this.samples.shift();
    // Moyennes par minute (24 h).
    this.minuteAcc.push(s);
    const minute = Math.floor(at / 60000) * 60000;
    if (this.minuteAcc.length && Math.floor(this.minuteAcc[0].t / 60000) * 60000 !== minute) {
      const acc = this.minuteAcc.filter((x) => Math.floor(x.t / 60000) * 60000 !== minute);
      this.minuteAcc = this.minuteAcc.filter((x) => Math.floor(x.t / 60000) * 60000 === minute);
      const avg = (k) => r1(acc.reduce((a, x) => a + (x[k] || 0), 0) / acc.length);
      this.minutes.push({ t: Math.floor(acc[0].t / 60000) * 60000, cpu: avg('cpu'), mem: Math.round(avg('mem')), sysCpu: avg('sysCpu'), sysMem: Math.round(avg('sysMem')) });
      if (this.minutes.length > MINUTES) this.minutes.shift();
    }
    this.session.lastSeen = at;
    this.saveLater();
    return s;
  }

  async fetchTimed(url, opts) {
    const t0 = this.now();
    const f = this.net && this.net.fetch ? this.net.fetch.bind(this.net) : fetch;
    const r = await f(url, { ...opts, signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined });
    await r.arrayBuffer().catch(() => null);
    return { status: r.status, ms: this.now() - t0 };
  }

  wsTimed(url) {
    return new Promise((resolve, reject) => {
      if (typeof WebSocket === 'undefined') { reject(new Error('mesure impossible sur ce poste')); return; }
      const t0 = this.now();
      let ws;
      const timer = setTimeout(() => { try { ws.close(); } catch { /* */ } reject(new Error('délai dépassé')); }, 15000);
      try { ws = new WebSocket(url); } catch (err) { clearTimeout(timer); reject(err); return; }
      ws.onopen = () => { clearTimeout(timer); const ms = this.now() - t0; try { ws.close(); } catch { /* */ } resolve({ status: 101, ms }); };
      ws.onerror = () => { clearTimeout(timer); reject(new Error('connexion refusée')); };
    });
  }

  async checkServices() {
    const cfg = this.serviceCfg;
    if (!cfg || !cfg.url || !cfg.key) return this.servicesView();
    const base = String(cfg.url).replace(/\/+$/, '');
    const headers = { apikey: cfg.key, authorization: `Bearer ${cfg.key}` };
    await Promise.all(SERVICES.map(async (sv) => {
      const at = this.now();
      let rec;
      try {
        const r = sv.ws
          ? await this.wsTimed(`${base.replace(/^http/, 'ws')}${sv.ws}?apikey=${encodeURIComponent(cfg.key)}&vsn=1.0.0`)
          : await this.fetchTimed(`${base}${sv.path}`, { method: sv.method || 'GET', headers });
        const ok = r.status < 400 || r.status === 101;
        rec = { t: at, ok, ms: r.ms, status: r.status, error: ok ? '' : `réponse ${r.status}` };
      } catch (err) {
        rec = { t: at, ok: false, ms: null, status: 0, error: /abort|timeout|délai/i.test(String(err && err.message)) ? 'délai dépassé' : String((err && err.message) || 'injoignable').slice(0, 120) };
      }
      const list = this.services[sv.id] || (this.services[sv.id] = []);
      const prev = list[list.length - 1];
      list.push(rec);
      if (list.length > SERVICE_KEEP) list.splice(0, list.length - SERVICE_KEEP);
      if (prev && prev.ok && !rec.ok) this.event('service', `${sv.label} : injoignable (${rec.error})`);
      if (prev && !prev.ok && rec.ok) this.event('service-ok', `${sv.label} : de nouveau disponible`);
    }));
    this.saveLater();
    return this.servicesView();
  }

  servicesView() {
    const day = this.now() - 86400e3;
    return SERVICES.map((sv) => {
      const list = (this.services[sv.id] || []).filter((r) => r.t >= day);
      const last = list[list.length - 1] || null;
      const ok = list.filter((r) => r.ok);
      const ms = ok.map((r) => r.ms).filter((v) => v != null).sort((a, b) => a - b);
      return {
        id: sv.id, label: sv.label, last,
        avail: list.length ? Math.round((ok.length / list.length) * 1000) / 10 : null,
        p95: ms.length ? ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.95))] : null,
        series: list.slice(-240),
      };
    });
  }

  setServiceConfig(cfg) {
    if (!cfg || !/^https:\/\/[\w.-]+$/.test(String(cfg.url || '').replace(/\/+$/, '')) || !cfg.key) return false;
    const changed = !this.serviceCfg || this.serviceCfg.url !== cfg.url || this.serviceCfg.key !== cfg.key;
    this.serviceCfg = { url: String(cfg.url).replace(/\/+$/, ''), key: String(cfg.key) };
    if (changed) { this.save(); this.checkServices().catch(() => {}); }
    return true;
  }

  snapshot() {
    const at = this.now();
    const week = at - 7 * 86400e3;
    const day = at - 86400e3;
    const sessions = this.sessions.filter((s) => s.start >= week);
    const durations = sessions.filter((s) => s !== this.session && s.end).map((s) => s.end - s.start);
    const cpus = os.cpus();
    return {
      now: at,
      app: {
        version: safe(() => this.app.getVersion(), ''),
        electron: process.versions.electron || '', chrome: process.versions.chrome || '', node: process.versions.node || '',
        platform: process.platform, arch: process.arch, os: `${os.type()} ${os.release()}`,
        cpuModel: cpus[0] ? cpus[0].model.trim() : '', cpus: cpus.length, totalMem: Math.round(os.totalmem() / 1048576),
        startedAt: this.startedAt, uptime: at - this.startedAt,
      },
      groups: GROUPS,
      current: this.samples[this.samples.length - 1] || null,
      samples: this.samples,
      minutes: this.minutes,
      events: this.events.slice(0, 150),
      sessions: this.sessions.slice(-30).reverse(),
      services: this.servicesView(),
      servicesReady: Boolean(this.serviceCfg),
      counters: {
        errors24h: this.events.filter((e) => e.kind === 'error' && e.last >= day).reduce((a, e) => a + e.count, 0),
        crashes7d: this.events.filter((e) => e.kind === 'crash' && e.last >= week).reduce((a, e) => a + e.count, 0),
        sessions7d: sessions.length,
        avgSession: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
      },
    };
  }

  start() {
    this.sample();
    this.timer = setInterval(() => this.sample(), SAMPLE_MS);
    this.svcTimer = setInterval(() => this.checkServices().catch(() => {}), SERVICE_MS);
    if (this.serviceCfg) this.checkServices().catch(() => {});
  }

  stop() {
    clearInterval(this.timer);
    clearInterval(this.svcTimer);
    clearTimeout(this.saveT);
    this.session.end = this.now();
    this.session.lastSeen = this.session.end;
    this.save();
  }
}

function safe(fn, fallback) { try { const v = fn(); return v == null ? fallback : v; } catch { return fallback; } }

// Messages d'erreur de la console de l'interface (Electron 45 : objet d'évènement ; avant : arguments).
function consoleError(args) {
  const [ev, level, message, line, sourceId] = args;
  if (ev && typeof ev === 'object' && 'level' in ev && typeof ev.level === 'string') {
    return ev.level === 'error' ? { message: ev.message, line: ev.lineNumber, source: ev.sourceId } : null;
  }
  return level === 3 ? { message, line, source: sourceId } : null;
}

function register({
  ipcMain, app, net, getWin, webContents, now,
}) {
  const tel = new Telemetry({
    app, net, getWin, webContents, now,
  });
  // Erreurs et plantages de NEXORA (les erreurs des sites affichés dans les appareils sont ignorées).
  app.on('web-contents-created', (_e, wc) => {
    if (safe(() => wc.getType(), '') !== 'window') return;
    wc.on('console-message', (...args) => {
      const err = consoleError(args);
      if (!err || !err.message) return;
      let src = '';
      try { src = err.source ? new URL(err.source).pathname.split('/').pop() : ''; } catch { src = String(err.source || ''); }
      tel.event('error', err.message, { source: src ? `${src}${err.line ? `:${err.line}` : ''}` : '' });
    });
    wc.on('unresponsive', () => tel.event('freeze', 'L’interface ne répond plus'));
    wc.on('responsive', () => tel.event('freeze-ok', 'L’interface répond de nouveau'));
  });
  app.on('render-process-gone', (_e, wc, details) => {
    const kind = safe(() => wc.getType(), '') === 'webview' ? 'Un site affiché' : 'L’interface';
    if (details && details.reason === 'clean-exit') return;
    tel.event('crash', `${kind} s’est arrêté(e) : ${details ? details.reason : 'inconnu'}${details && details.exitCode ? ` (code ${details.exitCode})` : ''}`);
  });
  app.on('child-process-gone', (_e, details) => {
    if (!details || details.reason === 'clean-exit' || details.reason === 'killed') return;
    tel.event('crash', `Processus ${details.name || details.type} arrêté : ${details.reason}${details.exitCode ? ` (code ${details.exitCode})` : ''}`);
  });
  ipcMain.handle('tel:snapshot', () => tel.snapshot());
  ipcMain.handle('tel:services-config', (_e, cfg) => tel.setServiceConfig(cfg));
  ipcMain.handle('tel:check-services', () => tel.checkServices());
  ipcMain.handle('tel:clear-events', () => { tel.events = []; tel.save(); return true; });
  tel.start();
  app.on('before-quit', () => tel.stop());
  return tel;
}

module.exports = { register, Telemetry, SERVICES };
