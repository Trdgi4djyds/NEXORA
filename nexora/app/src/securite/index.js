'use strict';
/* NEXORA #048 — Centre de sécurité du processus principal : historique des audits (site, pages, domaine, code,
 * applications) et comparaison d'un audit au précédent (nouveau, corrigé, toujours là), risques acceptés avec
 * une raison et une date d'expiration, audits programmés (chaque jour, chaque semaine ou après un déploiement)
 * avec une alerte quand la note baisse, correctifs écrits dans le projet, crochet Git, intégration continue,
 * export SARIF et rapports HTML ou PDF. Canaux préfixés « sec: » (déjà autorisés par preload.js). */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { findingKey, uid } = require('./util');
const domain = require('./domain');
const crawl = require('./crawl');
const csp = require('./csp');
const fixes = require('./fixes');
const code = require('./code');
const hook = require('./hook');
const apps = require('./apps');

const PER_TARGET = 30;
const MAX_TOTAL = 400;

class Store {
  constructor(dir, now = Date.now) {
    this.dir = dir;
    this.now = now;
    this.file = path.join(dir, 'audits.json');
    this.data = { audits: [], accepted: [], schedules: [] };
    try { this.data = { ...this.data, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) }; } catch { /* premier lancement */ }
  }

  save() {
    clearTimeout(this.t);
    this.t = setTimeout(() => this.flush(), 400);
  }

  flush() {
    clearTimeout(this.t);
    try { fs.mkdirSync(this.dir, { recursive: true }); fs.writeFileSync(this.file, JSON.stringify(this.data)); } catch { /* best effort */ }
  }

  summary(a) {
    return { id: a.id, kind: a.kind, target: a.target, host: a.host || '', url: a.url || '', name: a.name || '', at: a.at, score: a.score, counts: a.counts, scheduled: Boolean(a.scheduled) };
  }

  record(report, extra = {}) {
    const a = { ...report, ...extra, id: uid(), at: report.at || this.now() };
    for (const f of a.findings || []) f.key = findingKey(f);
    this.data.audits.unshift(a);
    const same = this.data.audits.filter((x) => x.kind === a.kind && x.target === a.target);
    if (same.length > PER_TARGET) { const drop = new Set(same.slice(PER_TARGET).map((x) => x.id)); this.data.audits = this.data.audits.filter((x) => !drop.has(x.id)); }
    if (this.data.audits.length > MAX_TOTAL) this.data.audits.length = MAX_TOTAL;
    this.save();
    return { ...a, compare: this.compare(a.id) };
  }

  get(id) { return this.data.audits.find((a) => a.id === id) || null; }

  list({ kind, target, limit = 60 } = {}) {
    return this.data.audits.filter((a) => (!kind || a.kind === kind) && (!target || a.target === target)).slice(0, Math.max(1, Math.min(400, Number(limit) || 60))).map((a) => this.summary(a));
  }

  latest(kind, target) { return this.data.audits.find((a) => a.kind === kind && (!target || a.target === target)) || null; }

  compare(id) {
    const cur = this.get(id);
    if (!cur) return null;
    const prev = this.data.audits.find((a) => a.id !== id && a.kind === cur.kind && a.target === cur.target && a.at < cur.at);
    if (!prev) return { prev: null, added: [], fixed: [], still: (cur.findings || []).filter((f) => f.sev !== 'info').length };
    const keys = (r) => new Map((r.findings || []).filter((f) => f.sev !== 'info').map((f) => [f.key || findingKey(f), f]));
    const a = keys(cur);
    const b = keys(prev);
    return {
      prev: this.summary(prev),
      added: [...a].filter(([k]) => !b.has(k)).map(([, f]) => f),
      fixed: [...b].filter(([k]) => !a.has(k)).map(([, f]) => f),
      still: [...a.keys()].filter((k) => b.has(k)).length,
      delta: cur.score - prev.score,
    };
  }

  remove(id) { this.data.audits = this.data.audits.filter((a) => a.id !== id); this.save(); return true; }

  accepted(target) {
    const now = this.now();
    this.data.accepted = this.data.accepted.filter((r) => !r.until || r.until > now);
    return this.data.accepted.filter((r) => !target || r.target === target);
  }

  accept({ target, key, title, reason = '', days = 90 }) {
    if (!target || !key) throw new Error('Constat inconnu.');
    this.data.accepted = this.data.accepted.filter((r) => !(r.target === target && r.key === key));
    const d = Number(days) || 0;
    this.data.accepted.push({ target, key, title: String(title || '').slice(0, 200), reason: String(reason || '').slice(0, 500), at: this.now(), until: d > 0 ? this.now() + d * 86400e3 : 0 });
    this.save();
    return this.accepted(target);
  }

  unaccept({ target, key }) {
    this.data.accepted = this.data.accepted.filter((r) => !(r.target === target && r.key === key));
    this.save();
    return this.accepted(target);
  }
}

function normUrl(u) {
  let s = String(u || '').trim();
  if (!s) throw new Error('Indique l’adresse du site.');
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  const x = new URL(s);
  return x.href;
}

function register({ ipcMain, app, net, send, dialog, shell, getWin, BrowserWindow, runScan, withPage, notify, planCheck, now }) {
  const store = new Store(path.join(app.getPath('userData'), 'securite'), now);
  const fetchImpl = (u, o) => (net && net.fetch ? net.fetch(u, { ...o, useSessionCookies: false }) : fetch(u, o));
  const job = (name) => (p) => { try { send('sec:job', { job: name, ...p }); } catch { /* fenêtre fermée */ } };
  const win = () => (getWin ? getWin() : null);

  async function pickDir(title) {
    if (!dialog) return null;
    const r = await dialog.showOpenDialog(win(), { title, properties: ['openDirectory'] });
    return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
  }

  // ---------- Historique, comparaison, risques acceptés ----------
  ipcMain.handle('sec:history', (_e, q) => store.list(q || {}));
  ipcMain.handle('sec:history-get', (_e, id) => { const a = store.get(id); return a ? { ...a, compare: store.compare(id) } : null; });
  ipcMain.handle('sec:history-delete', (_e, id) => store.remove(id));
  ipcMain.handle('sec:latest', (_e, { kind, target } = {}) => { const a = store.latest(kind, target); return a ? { ...a, compare: store.compare(a.id) } : null; });
  ipcMain.handle('sec:compare', (_e, id) => store.compare(id));
  ipcMain.handle('sec:accepted', (_e, { target } = {}) => store.accepted(target));
  ipcMain.handle('sec:accept', (_e, r) => store.accept(r || {}));
  ipcMain.handle('sec:accept-remove', (_e, r) => store.unaccept(r || {}));
  // Vue d'ensemble : dernier audit de chaque cible, risques acceptés et audits programmés.
  ipcMain.handle('sec:summary', () => {
    const last = new Map();
    for (const a of store.data.audits) { const k = `${a.kind}|${a.target}`; if (!last.has(k)) last.set(k, a); }
    return {
      latest: [...last.values()].map((a) => ({ ...store.summary(a), top: (a.findings || []).filter((f) => f.sev !== 'info').slice(0, 8).map((f) => ({ sev: f.sev, cat: f.cat, title: f.title, fix: f.fix, key: f.key, who: f.who || '' })), records: a.kind === 'domain' && a.records ? { expiry: a.records.expiry || null, dnssec: a.records.dnssec } : undefined })),
      accepted: store.accepted(),
      schedules: store.data.schedules,
    };
  });

  // ---------- Audits ----------
  ipcMain.handle('sec:domain', async (_e, { host } = {}) => {
    const h = String(host || '').trim().replace(/^https?:\/\//i, '').replace(/[/:].*$/, '');
    const r = await domain.audit(h, { fetchImpl, onStep: job('domain') });
    return store.record(r);
  });
  ipcMain.handle('sec:crawl-audit', async (_e, { url, max } = {}) => {
    const r = await crawl.audit(normUrl(url), { fetchImpl, max, onStep: job('pages') });
    return store.record(r);
  });
  ipcMain.handle('sec:csp', async (_e, { url } = {}) => csp.analyze(normUrl(url), { withPage, fetchImpl }));
  ipcMain.handle('sec:code-audit', async (_e, { dir } = {}) => {
    const r = await code.audit(dir, { fetchImpl, onStep: job('code') });
    return store.record(r);
  });
  ipcMain.handle('sec:app-audit', async (_e, { target } = {}) => store.record(await apps.audit(target)));
  ipcMain.handle('sec:pick-dir', (_e, { title } = {}) => pickDir(title || 'Choisis le dossier du projet'));
  ipcMain.handle('sec:pick-app', async () => {
    if (!dialog) return null;
    const r = await dialog.showOpenDialog(win(), { title: 'Choisis une application Android (.apk) ou le dossier d’un projet Electron', properties: ['openFile', 'openDirectory'], filters: [{ name: 'Application Android', extensions: ['apk'] }, { name: 'Tous les fichiers', extensions: ['*'] }] });
    return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
  });

  // ---------- Correctifs ----------
  ipcMain.handle('sec:fix-plan', (_e, { id, target, csp: policy } = {}) => {
    const rep = id ? store.get(id) : store.latest('site');
    if (!rep) throw new Error('Lance d’abord un audit du site.');
    return { ...fixes.generate(rep, target, { csp: policy || '' }), detected: fixes.detect(rep.headers), targets: Object.entries(fixes.TARGETS).map(([k, v]) => ({ id: k, label: v.label })) };
  });
  ipcMain.handle('sec:fix-write', (_e, { dir, files } = {}) => fixes.write(dir, files));
  ipcMain.handle('sec:reveal', (_e, p) => { if (shell && p) shell.showItemInFolder(p); return true; });

  // ---------- Outils des développeurs ----------
  ipcMain.handle('sec:hook-status', (_e, { dir } = {}) => hook.hookStatus(dir));
  ipcMain.handle('sec:hook-install', (_e, { dir } = {}) => hook.installHook(dir));
  ipcMain.handle('sec:hook-remove', (_e, { dir } = {}) => hook.removeHook(dir));
  ipcMain.handle('sec:ci-write', (_e, { dir, url, minScore } = {}) => ({ files: hook.writeCi(dir, { url: url ? normUrl(url) : '', minScore: Math.max(0, Math.min(100, Number(minScore) || 70)) }) }));
  ipcMain.handle('sec:sarif-save', async (_e, { id } = {}) => {
    const rep = store.get(id);
    if (!rep) throw new Error('Audit introuvable.');
    if (!dialog) return null;
    const r = await dialog.showSaveDialog(win(), { title: 'Exporter au format SARIF', defaultPath: path.join(app.getPath('documents'), `nexora-${rep.kind}-${String(rep.name || rep.host || 'audit').replace(/[^\w.-]+/g, '-')}.sarif`), filters: [{ name: 'SARIF', extensions: ['sarif', 'json'] }] });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, JSON.stringify(hook.toSarif(rep), null, 2));
    return r.filePath;
  });

  // ---------- Rapports HTML ou PDF ----------
  ipcMain.handle('sec:report-save', async (_e, { html, name = 'Rapport NEXORA', format = 'pdf' } = {}) => {
    if (!dialog) return null;
    const ext = format === 'html' ? 'html' : 'pdf';
    const r = await dialog.showSaveDialog(win(), { title: 'Enregistrer le rapport', defaultPath: path.join(app.getPath('documents'), `${String(name).replace(/[\\/:*?"<>|]+/g, '-')}.${ext}`), filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (r.canceled || !r.filePath) return null;
    if (ext === 'html') { fs.writeFileSync(r.filePath, String(html || '')); return r.filePath; }
    const tmp = path.join(os.tmpdir(), `nexora-rapport-${uid()}.html`);
    fs.writeFileSync(tmp, String(html || ''));
    const w = new BrowserWindow({ show: false, width: 1000, height: 1400, webPreferences: { sandbox: true, offscreen: true, javascript: false } });
    try {
      await w.loadFile(tmp);
      const pdf = await w.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { marginType: 'default' } });
      fs.writeFileSync(r.filePath, pdf);
    } finally { if (!w.isDestroyed()) w.destroy(); fs.rm(tmp, () => {}); }
    return r.filePath;
  });

  // ---------- Audits programmés ----------
  const EVERY = { day: 86400e3, week: 7 * 86400e3 };
  ipcMain.handle('sec:schedules', () => store.data.schedules);
  ipcMain.handle('sec:schedule-set', (_e, s = {}) => {
    const url = normUrl(s.url);
    const list = store.data.schedules;
    const host = new URL(url).hostname;
    const cur = list.find((x) => x.id === s.id) || list.find((x) => new URL(x.url).hostname === host);
    const next = { id: cur ? cur.id : uid(), url, every: EVERY[s.every] || s.every === 'deploy' ? s.every : 'week', onDeploy: Boolean(s.onDeploy), minScore: Math.max(0, Math.min(100, Number(s.minScore) || 0)), enabled: s.enabled !== false, lastAt: cur ? cur.lastAt : 0, lastScore: cur ? cur.lastScore : null, lastId: cur ? cur.lastId : '', lastError: '' };
    if (cur) Object.assign(cur, next); else list.push(next);
    store.save();
    return list;
  });
  ipcMain.handle('sec:schedule-delete', (_e, id) => { store.data.schedules = store.data.schedules.filter((x) => x.id !== id); store.save(); return store.data.schedules; });
  ipcMain.handle('sec:schedule-run', (_e, id) => { const s = store.data.schedules.find((x) => x.id === id); if (!s) throw new Error('Audit programmé introuvable.'); return runScheduled(s, 'manuel'); });

  let running = false;
  async function runScheduled(s, why) {
    const host = new URL(s.url).hostname;
    try {
      if (planCheck) await planCheck('scan', 1);
      const rep = store.record(await runScan(s.url), { scheduled: why });
      const before = s.lastScore;
      Object.assign(s, { lastAt: Date.now(), lastScore: rep.score, lastId: rep.id, lastError: '' });
      store.save();
      const c = rep.compare || {};
      const worse = (c.added || []).filter((f) => f.sev === 'critical' || f.sev === 'high');
      const dropped = before != null && rep.score <= before - 5;
      const under = s.minScore && rep.score < s.minScore;
      if (notify && (worse.length || dropped || under)) {
        const why2 = [dropped ? `la note passe de ${before} à ${rep.score}/100` : '', under ? `la note ${rep.score}/100 est sous ton seuil de ${s.minScore}` : '', worse.length ? `${worse.length} nouveau(x) problème(s) grave(s) : ${worse.slice(0, 3).map((f) => f.title).join(' ; ')}` : ''].filter(Boolean).join(', ');
        notify({ id: `sec:${host}`, name: `Sécurité de ${host}`, url: s.url, key: 'secu', level: worse.some((f) => f.sev === 'critical') || under ? 'critique' : 'alerte', text: `🟠 Audit de sécurité de ${host} : ${why2}.` });
      }
      send('sec:scheduled', { id: s.id, report: store.summary(rep) });
      return { ...rep };
    } catch (e) {
      s.lastError = String((e && e.message) || e).slice(0, 300);
      s.lastAt = Date.now();
      store.save();
      throw e;
    }
  }

  async function tick() {
    if (running) return;
    running = true;
    try {
      const t = Date.now();
      for (const s of store.data.schedules) {
        if (!s.enabled || !EVERY[s.every]) continue;
        if (t - (s.lastAt || 0) < EVERY[s.every]) continue;
        await runScheduled(s, s.every).catch(() => {});
      }
    } finally { running = false; }
  }
  const timer = setInterval(() => { tick().catch(() => {}); }, 10 * 60e3);
  const first = setTimeout(() => { tick().catch(() => {}); }, 3 * 60e3);
  if (app && app.on) app.on('before-quit', () => { clearInterval(timer); clearTimeout(first); store.flush(); });

  // Après un déploiement (envoi Git, construction d'un logiciel) : audits marqués « après chaque déploiement ».
  function onDeploy() {
    setTimeout(async () => {
      for (const s of store.data.schedules) if (s.enabled && s.onDeploy) await runScheduled(s, 'deploy').catch(() => {});
    }, 2 * 60e3);
  }

  return { store, onDeploy, runScheduled, tick, stop() { clearInterval(timer); clearTimeout(first); } };
}

module.exports = { register, Store };
