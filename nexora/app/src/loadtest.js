'use strict';
/* Test de charge avec k6 (Grafana) : télécharge l'exécutable k6 une seule fois, lance un test contre TON site
 * et renvoie le résumé (requêtes/s, temps de réponse p95, taux d'erreur). k6 est un outil officiel et gratuit.
 * Aussi : génère une configuration Prometheus + un tableau de bord Grafana + un docker-compose prêts à lancer. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const zlib = require('zlib');
const { spawn } = require('child_process');
const { resumableDownload } = require('./download');
const { extract } = require('./android/zip');

const K6_FALLBACK = 'v1.3.0';

function dir(app) { return path.join(app.getPath('userData'), 'outils', 'k6'); }
function bin(app) { return path.join(dir(app), process.platform === 'win32' ? 'k6.exe' : 'k6'); }

async function ensureK6(app, fetchImpl, onStep = () => {}) {
  const b = bin(app);
  if (fs.existsSync(b)) return b;
  onStep({ label: 'Préparation du moteur de test', progress: 0.05 });
  let tag = K6_FALLBACK;
  try {
    const r = await fetchImpl('https://api.github.com/repos/grafana/k6/releases/latest', { headers: { 'user-agent': 'NEXORA', accept: 'application/vnd.github+json' } });
    const j = await r.json(); if (j && j.tag_name) tag = j.tag_name;
  } catch { /* hors ligne : on garde la version de secours */ }
  const plat = process.platform === 'win32' ? 'windows-amd64' : process.platform === 'darwin' ? 'macos-amd64' : 'linux-amd64';
  const ext = process.platform === 'win32' ? 'zip' : 'tar.gz';
  const name = `k6-${tag}-${plat}`;
  const url = `https://github.com/grafana/k6/releases/download/${tag}/${name}.${ext}`;
  const tmp = path.join(dir(app), `${name}.${ext}`);
  fs.mkdirSync(dir(app), { recursive: true });
  onStep({ label: 'Téléchargement du moteur de test (~15 Mo, une seule fois)', progress: 0.1 });
  await resumableDownload(fetchImpl, url, tmp, { onProgress: (p) => onStep({ label: 'Téléchargement du moteur de test', progress: 0.1 + p * 0.6 }) });
  onStep({ label: 'Installation du moteur de test', progress: 0.75 });
  if (ext === 'zip') await extract(tmp, dir(app), { strip: 1 });
  else await new Promise((res, rej) => { const p = spawn('tar', ['xzf', tmp, '-C', dir(app), '--strip-components=1']); p.on('close', (c) => (c ? rej(new Error('extraction k6')) : res())); p.on('error', rej); });
  if (process.platform !== 'win32') { try { fs.chmodSync(b, 0o755); } catch { /* */ } }
  fs.rmSync(tmp, { force: true });
  if (!fs.existsSync(b)) throw new Error('Le moteur de test n’a pas pu être installé.');
  return b;
}

// NEXORA #015 : scénarios de test, plusieurs pages par parcours, seuils réglables, mesures reçues en direct
// (sortie InfluxDB de k6 vers un petit serveur local, seconde par seconde), arrêt et historique des tests.
const SCENARIOS = {
  smoke: 'Vérification rapide', load: 'Charge', stress: 'Stress', spike: 'Pic soudain', soak: 'Endurance',
};
const HISTORY_MAX = 30;
const SERIES_MAX = 600;

function secs(d) {
  const m = /^(\d+)(s|m|h)?$/.exec(String(d || '').trim());
  if (!m) return 30;
  return Number(m[1]) * (m[2] === 'h' ? 3600 : m[2] === 'm' ? 60 : 1);
}

// Paliers d'utilisateurs virtuels de chaque scénario (exécuteur « ramping-vus » de k6).
function plan({ scenario = 'load', vus = 10, duration = '30s', rampUp = true }) {
  const v = Math.max(1, Math.min(2000, Math.round(Number(vus) || 10)));
  const d = Math.max(10, secs(duration));
  const st = (s, target) => ({ duration: `${Math.max(1, Math.round(s))}s`, target: Math.max(0, Math.round(target)) });
  const low = Math.max(1, v * 0.1);
  switch (scenario) {
    case 'smoke': return [st(2, 1), st(d, 1)];
    case 'stress': return [st(d / 8, v * 0.5), st(d / 8, v * 0.5), st(d / 8, v), st(d / 8, v), st(d / 8, v * 1.5), st(d / 8, v * 1.5), st(d / 8, v * 2), st(d / 8, v * 2), st(10, 0)];
    case 'spike': return [st(10, low), st(d * 0.2, low), st(5, v), st(d * 0.4, v), st(5, low), st(d * 0.3, low), st(5, 0)];
    case 'soak': return [st(Math.max(30, d * 0.1), v), st(d, v), st(30, 0)];
    default: return rampUp ? [st(Math.max(5, d * 0.2), v), st(d, v), st(Math.max(5, d * 0.1), 0)] : [st(1, v), st(d, v)];
  }
}

function script({ urls, stages, thinkSec = 1, p95Ms = 1000, errPct = 5 }) {
  const think = Math.max(0, Math.min(30, Number(thinkSec) || 0));
  return `import http from 'k6/http';
import { check, sleep } from 'k6';
export const options = {
  stages: ${JSON.stringify(stages)},
  thresholds: { http_req_duration: ['p(95)<${Math.max(1, Number(p95Ms) || 1000)}'], http_req_failed: ['rate<${Math.max(0, Number(errPct) || 0) / 100}'] },
  discardResponseBodies: true,
};
const URLS = ${JSON.stringify(urls)};
export default function () {
  for (const url of URLS) {
    const res = http.get(url, { tags: { name: url } });
    check(res, { 'statut 200-399': (r) => r.status >= 200 && r.status < 400 });
    sleep(${think});
  }
}
`;
}

// Découpe une ligne du protocole InfluxDB envoyée par k6 : mesure, étiquettes, valeur, horodatage.
function splitEsc(s, sep) {
  const out = [];
  let cur = '';
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) { cur += s[i + 1]; i += 1; } else if (c === sep) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}

function parseLine(line) {
  let i = 0;
  while (i < line.length && !(line[i] === ' ' && line[i - 1] !== '\\')) i += 1;
  const head = line.slice(0, i);
  const rest = line.slice(i + 1);
  const ts = rest.lastIndexOf(' ');
  if (ts < 0) return null;
  const m = /(?:^|,)value=(-?[\d.]+(?:e[-+]?\d+)?)i?(?:,|$)/i.exec(rest.slice(0, ts));
  if (!m) return null;
  const parts = splitEsc(head, ',');
  const tags = {};
  for (const p of parts.slice(1)) { const [k, ...v] = splitEsc(p, '='); tags[k] = v.join('='); }
  return { metric: parts[0], tags, value: Number(m[1]), t: Math.floor(Number(rest.slice(ts + 1)) / 1e9) };
}

const pct = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * q) - 1))] : 0);

// Serveur local qui reçoit les mesures de k6 et les agrège par seconde.
function receiver(onPoint) {
  const buckets = new Map();
  const perUrl = new Map();
  const all = [];
  let seen = 0;
  const bucket = (t) => {
    if (!buckets.has(t)) buckets.set(t, { d: [], n: 0, fail: 0, vus: 0, recv: 0, chkN: 0, chkOk: 0 });
    return buckets.get(t);
  };
  const url = (name) => {
    if (!perUrl.has(name)) perUrl.set(name, { n: 0, fail: 0, d: [] });
    return perUrl.get(name);
  };
  const keep = (list, v, max) => { if (list.length < max) list.push(v); else { const j = Math.floor(Math.random() * (list.length + 1)); if (j < max) list[j] = v; } };
  const ingest = (text) => {
    for (const line of text.split('\n')) {
      if (!line) continue;
      const k = line.slice(0, line.indexOf(','));
      const name = k.indexOf(' ') >= 0 ? k.slice(0, k.indexOf(' ')) : k;
      if (!['http_req_duration', 'http_req_failed', 'http_reqs', 'vus', 'data_received', 'checks'].includes(name) && !line.startsWith('vus ')) continue;
      const p = parseLine(line);
      if (!p) continue;
      const b = bucket(p.t);
      if (p.metric === 'http_req_duration') { b.d.push(p.value); seen += 1; keep(all, p.value, 200000); if (p.tags.name) keep(url(p.tags.name).d, p.value, 20000); } else if (p.metric === 'http_req_failed') { if (p.value) { b.fail += 1; if (p.tags.name) url(p.tags.name).fail += 1; } } else if (p.metric === 'http_reqs') { b.n += 1; if (p.tags.name) url(p.tags.name).n += 1; } else if (p.metric === 'vus') b.vus = Math.max(b.vus, p.value);
      else if (p.metric === 'data_received') b.recv += p.value;
      else if (p.metric === 'checks') { b.chkN += 1; b.chkOk += p.value; }
    }
  };
  const points = [];
  const finalize = (upTo) => {
    for (const t of [...buckets.keys()].sort((a, b) => a - b)) {
      if (t > upTo) break;
      const b = buckets.get(t);
      buckets.delete(t);
      const d = b.d.sort((x, y) => x - y);
      const r = (v) => Math.round(v * 10) / 10;
      const p = {
        t: t * 1000, vus: b.vus, rps: b.n, err: b.n ? r((b.fail / b.n) * 100) : 0,
        avg: d.length ? r(d.reduce((a, x) => a + x, 0) / d.length) : null,
        p50: d.length ? r(pct(d, 0.5)) : null, p95: d.length ? r(pct(d, 0.95)) : null, p99: d.length ? r(pct(d, 0.99)) : null,
        max: d.length ? r(d[d.length - 1]) : null, recv: Math.round(b.recv),
      };
      // Une seconde sans requête garde le nombre d'utilisateurs de la précédente.
      if (!p.vus && points.length) p.vus = points[points.length - 1].vus;
      points.push(p);
      onPoint(p);
    }
  };
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      let body = Buffer.concat(chunks);
      if (/gzip/i.test(req.headers['content-encoding'] || '')) { try { body = zlib.gunzipSync(body); } catch { /* */ } }
      if (req.url.startsWith('/write')) { ingest(body.toString('utf8')); res.writeHead(204); res.end(); } else {
        // Requête « CREATE DATABASE » envoyée par k6 au démarrage.
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"results":[{"statement_id":0}]}');
      }
    });
  });
  const timer = setInterval(() => finalize(Math.floor(Date.now() / 1000) - 3), 1000);
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({
      port: server.address().port,
      points,
      perUrl,
      all,
      seen: () => seen,
      close() { clearInterval(timer); finalize(Infinity); server.close(); },
    }));
  });
}

function downsample(points, max) {
  if (points.length <= max) return points;
  const k = Math.ceil(points.length / max);
  const out = [];
  for (let i = 0; i < points.length; i += k) {
    const g = points.slice(i, i + k);
    const avg = (key) => { const v = g.map((p) => p[key]).filter((x) => x != null); return v.length ? Math.round((v.reduce((a, x) => a + x, 0) / v.length) * 10) / 10 : null; };
    out.push({ t: g[0].t, vus: Math.max(...g.map((p) => p.vus || 0)), rps: avg('rps'), err: avg('err'), avg: avg('avg'), p50: avg('p50'), p95: Math.max(...g.map((p) => p.p95 || 0)) || null, p99: Math.max(...g.map((p) => p.p99 || 0)) || null, max: Math.max(...g.map((p) => p.max || 0)) || null, recv: avg('recv') });
  }
  return out;
}

const historyFile = (app) => path.join(app.getPath('userData'), 'loadtests.json');
function history(app) { try { const h = JSON.parse(fs.readFileSync(historyFile(app), 'utf8')); return Array.isArray(h) ? h : []; } catch { return []; } }
function saveHistory(app, list) { try { fs.writeFileSync(historyFile(app), JSON.stringify(list.slice(0, HISTORY_MAX))); } catch { /* best effort */ } }

let current = null; // un seul test à la fois

function normalizeUrls(opts) {
  const list = (Array.isArray(opts.urls) && opts.urls.length ? opts.urls : [opts.url]).map((u) => String(u || '').trim()).filter(Boolean).slice(0, 10);
  const out = list.map((u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`));
  for (const u of out) { try { new URL(u); } catch { throw new Error(`Adresse invalide : ${u}`); } }
  if (!out.length) throw new Error('Indique l’adresse à tester.');
  return out;
}

async function run(app, fetchImpl, opts, onStep = () => {}) {
  if (current) throw new Error('Un test de charge est déjà en cours : attends sa fin ou arrête-le.');
  const urls = normalizeUrls(opts || {});
  const scenario = SCENARIOS[opts.scenario] ? opts.scenario : 'load';
  const stages = plan({ ...opts, scenario });
  const total = stages.reduce((a, s) => a + secs(s.duration), 0);
  const p95Ms = Math.max(1, Number(opts.p95Ms) || 1000);
  const errPct = Math.max(0, Number(opts.errPct != null ? opts.errPct : 5));
  current = { proc: null, stopped: false };
  let rcv = null;
  let work = null;
  try {
    const b = await ensureK6(app, fetchImpl, onStep);
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'nexora-lt-'));
    const scr = path.join(work, 'test.js');
    const out = path.join(work, 'summary.json');
    fs.writeFileSync(scr, script({ urls, stages, thinkSec: opts.thinkSec != null ? opts.thinkSec : 1, p95Ms, errPct }));
    const started = Date.now();
    rcv = await receiver((point) => onStep({ label: 'Test de charge en cours', progress: Math.min(0.99, (Date.now() - started) / 1000 / total), phase: 'run', elapsed: Math.round((Date.now() - started) / 1000), total, point }));
    onStep({ label: 'Test de charge en cours', progress: 0, phase: 'run', elapsed: 0, total });
    const code = await new Promise((resolve, reject) => {
      const p = spawn(b, ['run', '--summary-export', out, '--summary-trend-stats', 'avg,min,med,max,p(90),p(95),p(99)', '--no-color', '--quiet', '--no-usage-report', '--out', `influxdb=http://127.0.0.1:${rcv.port}/k6`, scr], { cwd: work, env: { ...process.env, K6_INFLUXDB_PUSH_INTERVAL: '1s' } });
      current.proc = p;
      let err = '';
      p.stderr.on('data', (d) => { err += d.toString(); if (err.length > 20000) err = err.slice(-20000); });
      p.stdout.on('data', () => {});
      p.on('error', reject);
      p.on('close', (c) => { current.err = err; resolve(c); });
    });
    await new Promise((r) => setTimeout(r, 300));
    rcv.close();
    let j = null;
    try { j = JSON.parse(fs.readFileSync(out, 'utf8')); } catch { j = null; }
    if (!j && !rcv.seen()) {
      if (current.stopped) throw new Error('Test arrêté avant la première mesure.');
      const lines = String(current.err || '').split('\n').filter(Boolean).slice(-3).join(' ').slice(0, 300);
      throw new Error(code ? `Test de charge : ${lines}` : 'Résultat du test illisible.');
    }
    const m = (j && j.metrics) || {};
    const dur = m.http_req_duration || {};
    const sorted = rcv.all.slice().sort((x, y) => x - y);
    const points = rcv.points;
    const reqs = (m.http_reqs && m.http_reqs.count) || points.reduce((a, p) => a + p.rps, 0);
    const fails = points.reduce((a, p) => a + (p.rps * p.err) / 100, 0);
    const elapsed = Math.max(1, (Date.now() - started) / 1000);
    const r1 = (v) => Math.round((v || 0) * 10) / 10;
    const result = {
      ok: true,
      id: Math.random().toString(36).slice(2, 10),
      at: started,
      name: String(opts.name || '').slice(0, 80),
      scenario, scenarioLabel: SCENARIOS[scenario],
      urls, url: urls[0], vus: Math.max(...stages.map((s) => s.target)), duration: opts.duration || '30s', stages, total,
      thinkSec: opts.thinkSec != null ? Number(opts.thinkSec) : 1,
      thresholds: { p95Ms, errPct },
      requests: reqs,
      rps: m.http_reqs ? r1(m.http_reqs.rate) : r1(reqs / elapsed),
      failRate: m.http_req_failed ? r1((m.http_req_failed.value || 0) * 100) : r1(reqs ? (fails / reqs) * 100 : 0),
      avg: Math.round(dur.avg != null ? dur.avg : sorted.reduce((a, x) => a + x, 0) / (sorted.length || 1)),
      med: Math.round(dur.med != null ? dur.med : pct(sorted, 0.5)),
      p90: Math.round(dur['p(90)'] != null ? dur['p(90)'] : pct(sorted, 0.9)),
      p95: Math.round(dur['p(95)'] != null ? dur['p(95)'] : pct(sorted, 0.95)),
      p99: Math.round(dur['p(99)'] != null ? dur['p(99)'] : pct(sorted, 0.99)),
      max: Math.round(dur.max != null ? dur.max : sorted[sorted.length - 1] || 0),
      min: Math.round(dur.min != null ? dur.min : sorted[0] || 0),
      checks: m.checks ? r1((m.checks.value || 0) * 100) : null,
      dataRecv: m.data_received ? Math.round(m.data_received.count || 0) : points.reduce((a, p) => a + (p.recv || 0), 0),
      peakRps: points.reduce((a, p) => Math.max(a, p.rps || 0), 0),
      stopped: Boolean(current.stopped),
      series: downsample(points, SERIES_MAX),
      perUrl: [...rcv.perUrl.entries()].map(([u, s]) => { const d = s.d.sort((x, y) => x - y); return { url: u, n: s.n, failRate: s.n ? r1((s.fail / s.n) * 100) : 0, avg: d.length ? Math.round(d.reduce((a, x) => a + x, 0) / d.length) : null, p95: d.length ? Math.round(pct(d, 0.95)) : null }; }),
    };
    result.pass = { p95: result.p95 < p95Ms, err: result.failRate < errPct };
    const list = history(app);
    list.unshift(result);
    saveHistory(app, list);
    return result;
  } finally {
    if (rcv) { try { rcv.close(); } catch { /* */ } }
    if (work) fs.rmSync(work, { recursive: true, force: true });
    current = null;
  }
}

function stop() {
  if (!current || !current.proc) return false;
  current.stopped = true;
  // Sous Windows, kill() arrête k6 sans résumé : le résultat est alors calculé à partir des mesures reçues.
  try { current.proc.kill(process.platform === 'win32' ? undefined : 'SIGINT'); } catch { /* déjà arrêté */ }
  return true;
}

// --- Prometheus + Grafana : fichiers prêts à lancer avec Docker (l'utilisateur a Docker installé). ---
function prometheusStack(targets) {
  const list = targets.map((t) => `          - ${JSON.stringify(t)}`).join('\n');
  const prometheus = `# prometheus.yml — supervise tes sites via le Blackbox Exporter
global:
  scrape_interval: 30s
scrape_configs:
  - job_name: 'sites'
    metrics_path: /probe
    params:
      module: [http_2xx]
    static_configs:
      - targets:
${list}
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: blackbox:9115
`;
  const compose = `# docker compose up  — Prometheus + Grafana + Blackbox Exporter
services:
  prometheus:
    image: prom/prometheus:latest
    volumes: [ "./prometheus.yml:/etc/prometheus/prometheus.yml" ]
    ports: [ "9090:9090" ]
  blackbox:
    image: prom/blackbox-exporter:latest
    ports: [ "9115:9115" ]
  grafana:
    image: grafana/grafana-oss:latest
    environment: [ "GF_SECURITY_ADMIN_PASSWORD=admin" ]
    ports: [ "3000:3000" ]
    volumes: [ "./grafana-dashboard.json:/var/lib/grafana/dashboards/sites.json" ]
`;
  const dashboard = JSON.stringify({
    title: 'Supervision des sites (NEXORA)',
    panels: [
      { type: 'timeseries', title: 'Disponibilité (probe_success)', targets: [{ expr: 'probe_success' }], gridPos: { h: 8, w: 12, x: 0, y: 0 } },
      { type: 'timeseries', title: 'Temps de réponse (s)', targets: [{ expr: 'probe_duration_seconds' }], gridPos: { h: 8, w: 12, x: 12, y: 0 } },
      { type: 'stat', title: 'Jours avant expiration du certificat', targets: [{ expr: '(probe_ssl_earliest_cert_expiry - time()) / 86400' }], gridPos: { h: 8, w: 12, x: 0, y: 8 } },
    ],
    schemaVersion: 39, time: { from: 'now-6h', to: 'now' },
  }, null, 2);
  return { prometheus, compose, dashboard };
}

function register({ ipcMain, app, net, send, dialog, shell, getWin }) {
  const fetchImpl = (u, o) => (net && net.fetch ? net.fetch(u, o) : fetch(u, o));
  // NEXORA #048 : un test de charge ne se lance que sur un site dont la propriété est prouvée (fichier ou DNS).
  const { Ownership } = require('./supervision/ownership');
  const owner = new Ownership(path.join(app.getPath('userData'), 'supervision'), fetchImpl);
  ipcMain.handle('mon:verify-status', (_e, { url } = {}) => owner.status(url));
  ipcMain.handle('mon:verify-check', (_e, { url } = {}) => owner.check(url));
  ipcMain.handle('mon:loadtest', (_e, opts) => {
    owner.assert(normalizeUrls(opts || {}));
    return run(app, fetchImpl, opts, (p) => send('mon:loadtest-progress', p));
  });
  ipcMain.handle('mon:loadtest-stop', () => stop());
  ipcMain.handle('mon:loadtests', () => history(app));
  ipcMain.handle('mon:loadtest-delete', (_e, id) => { saveHistory(app, history(app).filter((r) => r.id !== id)); return history(app); });
  ipcMain.handle('mon:loadtest-running', () => Boolean(current));
  ipcMain.handle('mon:export-stack', async (_e, { targets }) => {
    const r = await dialog.showOpenDialog(getWin(), { title: 'Dossier où enregistrer la configuration Prometheus + Grafana', properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const d = path.join(r.filePaths[0], 'nexora-supervision');
    fs.mkdirSync(d, { recursive: true });
    const { prometheus, compose, dashboard } = prometheusStack(targets || []);
    fs.writeFileSync(path.join(d, 'prometheus.yml'), prometheus);
    fs.writeFileSync(path.join(d, 'docker-compose.yml'), compose);
    fs.writeFileSync(path.join(d, 'grafana-dashboard.json'), dashboard);
    fs.writeFileSync(path.join(d, 'LISEZ-MOI.txt'), 'Lance : docker compose up\nPrometheus : http://localhost:9090\nGrafana : http://localhost:3000 (admin / admin)\nImporte grafana-dashboard.json dans Grafana.\n');
    shell.showItemInFolder(path.join(d, 'docker-compose.yml'));
    return d;
  });
}

module.exports = { register, run, plan, script, parseLine, receiver, SCENARIOS };
