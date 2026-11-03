'use strict';
/* Test de charge avec k6 (Grafana) : télécharge l'exécutable k6 une seule fois, lance un test contre TON site
 * et renvoie le résumé (requêtes/s, temps de réponse p95, taux d'erreur). k6 est un outil officiel et gratuit.
 * Aussi : génère une configuration Prometheus + un tableau de bord Grafana + un docker-compose prêts à lancer. */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { resumableDownload } = require('./download');
const { extract } = require('./android/zip');

const K6_FALLBACK = 'v0.55.0';

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

function script({ url, vus = 10, duration = '30s', rampUp = true }) {
  const stages = rampUp
    ? `stages: [ { duration: '10s', target: ${vus} }, { duration: '${duration}', target: ${vus} }, { duration: '5s', target: 0 } ]`
    : `vus: ${vus}, duration: '${duration}'`;
  return `import http from 'k6/http';
import { check, sleep } from 'k6';
export const options = { ${stages}, thresholds: { http_req_duration: ['p(95)<1000'], http_req_failed: ['rate<0.05'] } };
export default function () {
  const res = http.get(${JSON.stringify(url)});
  check(res, { 'statut 200-399': (r) => r.status >= 200 && r.status < 400 });
  sleep(1);
}
`;
}

async function run(app, fetchImpl, opts, onStep = () => {}) {
  const b = await ensureK6(app, fetchImpl, onStep);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'nexora-lt-'));
  const scr = path.join(work, 'test.js');
  const out = path.join(work, 'summary.json');
  fs.writeFileSync(scr, script(opts));
  onStep({ label: 'Test de charge en cours', progress: 0.85 });
  return new Promise((resolve, reject) => {
    const p = spawn(b, ['run', '--summary-export', out, '--no-color', scr], { cwd: work });
    let err = '';
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.stdout.on('data', () => {});
    p.on('error', reject);
    p.on('close', (code) => {
      try {
        const j = JSON.parse(fs.readFileSync(out, 'utf8'));
        const m = j.metrics || {};
        const dur = m.http_req_duration || {};
        const result = {
          ok: true,
          requests: (m.http_reqs && m.http_reqs.count) || 0,
          rps: (m.http_reqs && Math.round((m.http_reqs.rate || 0) * 10) / 10) || 0,
          failRate: m.http_req_failed ? Math.round((m.http_req_failed.value || 0) * 1000) / 10 : 0,
          avg: Math.round(dur.avg || 0), p90: Math.round(dur['p(90)'] || 0), p95: Math.round(dur['p(95)'] || 0), max: Math.round(dur.max || 0), min: Math.round(dur.min || 0),
          vus: opts.vus, duration: opts.duration,
        };
        resolve(result);
      } catch (e) {
        reject(new Error(code ? `Test de charge : ${err.split('\n').filter(Boolean).slice(-3).join(' ').slice(0, 300)}` : 'Résultat du test illisible.'));
      } finally { fs.rmSync(work, { recursive: true, force: true }); }
    });
  });
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
  ipcMain.handle('mon:loadtest', (_e, opts) => run(app, fetchImpl, opts, (p) => send('mon:loadtest-progress', p)));
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

module.exports = { register };
