'use strict';
/* NEXORA #120 : projets à serveur dans l'App Builder (Laravel, dont Laravel + Inertia + Vue ou React, Symfony, autres
 * projets PHP). Une application Laravel s'exécute sur un serveur PHP : un téléphone ne peut pas la faire tourner
 * seul, l'APK s'ouvre donc sur l'adresse d'un serveur. Deux façons de construire l'APK :
 *  - l'adresse du site en ligne (hébergement), pour publier ;
 *  - un serveur de test lancé sur ce PC et ouvert au réseau local (php artisan serve, ou php -S pour les autres
 *    projets PHP) : l'APK s'ouvre sur l'adresse de ce PC tant qu'il reste allumé et que le téléphone est sur le
 *    même Wi-Fi.
 * Ce module détecte le type de projet, vérifie ce qu'il faut (PHP, dépendances, .env, fichiers construits par Vite,
 * serveur Vite encore lancé) et démarre ou arrête le serveur de test. La construction des fichiers (npm run build)
 * reste celle de l'App Builder (buildWeb de ipc.js). */
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const http = require('http');
const { spawn, execFile } = require('child_process');

const WIN = process.platform === 'win32';
const servers = new Map(); // dossier → { proc, status }
let phpCache = null;

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

// Type de projet à serveur, ou null pour un site statique (index.html construit).
function detect(dir) {
  if (!dir || !fs.existsSync(dir)) return null;
  const has = (p) => fs.existsSync(path.join(dir, p));
  const composer = readJson(path.join(dir, 'composer.json'));
  const pkg = readJson(path.join(dir, 'package.json'));
  const deps = { ...((pkg && pkg.dependencies) || {}), ...((pkg && pkg.devDependencies) || {}) };
  const req = { ...((composer && composer.require) || {}), ...((composer && composer['require-dev']) || {}) };
  const front = deps.vue ? 'Vue' : deps.react ? 'React' : deps.svelte ? 'Svelte' : '';
  if (has('artisan') && (req['laravel/framework'] || has('bootstrap/app.php'))) {
    const inertia = Boolean(req['inertiajs/inertia-laravel'] || deps['@inertiajs/vue3'] || deps['@inertiajs/react'] || deps['@inertiajs/svelte'] || deps['@inertiajs/inertia']);
    const label = ['Laravel', inertia ? 'Inertia' : '', front].filter(Boolean).join(' + ');
    return { kind: 'laravel', label, name: 'Laravel', php: true, vite: Boolean(deps.vite || deps['laravel-vite-plugin']), canServe: true };
  }
  if (has('bin/console') && req['symfony/framework-bundle']) return { kind: 'symfony', label: 'Symfony', name: 'Symfony', php: true, vite: Boolean(deps.vite), canServe: true };
  const rootPhp = has('index.php') && !has('index.html');
  const publicPhp = has('public/index.php') && !has('public/index.html');
  if (composer || rootPhp || publicPhp) return { kind: 'php', label: 'PHP', name: 'PHP', php: true, vite: Boolean(deps.vite), canServe: rootPhp || publicPhp };
  if (has('manage.py')) return { kind: 'django', label: 'Django', name: 'Django', php: false, canServe: false };
  if (has('Gemfile') && has('config/application.rb')) return { kind: 'rails', label: 'Ruby on Rails', name: 'Ruby on Rails', php: false, canServe: false };
  return null;
}

// PHP : celui du PATH (dont celui installé par NEXORA, ajouté au PATH au démarrage), puis les emplacements
// habituels de Laragon, WampServer, XAMPP, Herd et Scoop.
function phpCandidates() {
  const list = ['php'];
  if (WIN) {
    const home = process.env.USERPROFILE || os.homedir();
    for (const root of ['C:\\laragon\\bin\\php', 'C:\\wamp64\\bin\\php', 'C:\\wamp\\bin\\php']) {
      try { for (const d of fs.readdirSync(root).sort().reverse()) list.push(path.join(root, d, 'php.exe')); } catch { /* absent */ }
    }
    list.push('C:\\xampp\\php\\php.exe', path.join(home, '.config', 'herd', 'bin', 'php.bat'), path.join(home, 'scoop', 'shims', 'php.exe'), 'C:\\php\\php.exe', 'C:\\tools\\php\\php.exe');
  } else {
    list.push('/usr/bin/php', '/usr/local/bin/php', '/opt/homebrew/bin/php');
  }
  return [...new Set(list)];
}

function phpVersion(cmd) {
  return new Promise((resolve) => {
    execFile(cmd, ['-r', 'echo PHP_VERSION;'], { timeout: 10000, windowsHide: true, shell: /\.bat$/i.test(cmd) }, (err, out) => {
      const v = String(out || '').trim();
      resolve(!err && /^\d+\.\d+/.test(v) ? v : null);
    });
  });
}

async function findPhp({ fresh = false } = {}) {
  if (phpCache && !fresh) return phpCache;
  for (const cmd of phpCandidates()) {
    if (cmd !== 'php' && !fs.existsSync(cmd)) continue;
    const version = await phpVersion(cmd);
    if (version) { phpCache = { path: cmd, version }; return phpCache; }
  }
  phpCache = null;
  return null;
}

// Ce qu'il faut pour servir un projet Laravel.
function laravelChecks(dir) {
  const has = (p) => fs.existsSync(path.join(dir, p));
  let env = '';
  try { env = fs.readFileSync(path.join(dir, '.env'), 'utf8'); } catch { /* absent */ }
  return {
    vendor: has('vendor/autoload.php'),
    env: Boolean(env),
    envExample: has('.env.example'),
    key: /^APP_KEY=\S+/m.test(env),
    built: has('public/build/manifest.json') || has('public/build/.vite/manifest.json'),
    hot: has('public/hot'),
    nodeModules: has('node_modules'),
  };
}

// Adresses de ce PC sur le réseau local, Wi-Fi et Ethernet d'abord (jamais les cartes virtuelles ni les VPN).
function lanAddresses() {
  const out = [];
  const virtual = /vethernet|virtualbox|vmware|hyper-v|wsl|docker|vbox|loopback|tailscale|zerotier|hamachi|bluetooth|teredo|isatap|vpn|\btap\b|\btun\b|utun|bridge/i;
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if ((a.family !== 'IPv4' && a.family !== 4) || a.internal) continue;
      if (!/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) continue;
      let rank = /wi-?fi|wlan|wireless|sans fil/i.test(name) ? 0 : /ethernet|^eth|^en\d|local/i.test(name) ? 1 : 2;
      if (virtual.test(name)) rank += 10;
      if (a.address.startsWith('192.168.')) rank -= 0.5;
      out.push({ name, address: a.address, rank });
    }
  }
  return out.sort((a, b) => a.rank - b.rank);
}

function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '0.0.0.0');
  });
}

async function pickPort(from = 8000) {
  for (let p = from; p < from + 50; p++) if (await portFree(p)) return p;
  throw new Error(`Aucun port libre entre ${from} et ${from + 49}.`);
}

// Code HTTP d'une adresse (0 si injoignable).
function httpStatus(url, timeout = 2500) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => { res.resume(); resolve(res.statusCode || 0); });
    req.setTimeout(timeout, () => { req.destroy(); resolve(0); });
    req.on('error', () => resolve(0));
  });
}

// Fichier public/hot de Laravel : Vite (npm run dev) est-il encore lancé ? S'il ne répond plus, le fichier est un
// reste d'une session arrêtée brutalement : il est retiré, sinon Laravel chargerait les fichiers depuis Vite.
async function checkHot(dir, log) {
  const f = path.join(dir, 'public', 'hot');
  if (!fs.existsSync(f)) return;
  let url = '';
  try { url = fs.readFileSync(f, 'utf8').trim(); } catch { /* illisible */ }
  const target = url.replace('[::1]', '127.0.0.1').replace('localhost', '127.0.0.1');
  const code = /^https?:\/\//.test(target) ? await httpStatus(`${target.replace(/\/$/, '')}/@vite/client`) : 0;
  if (code) throw new Error('Vite (« npm run dev ») tourne encore sur ce PC : le téléphone ne pourrait pas charger ses fichiers. Arrêtez-le (Ctrl+C dans son terminal), puis réessayez : NEXORA utilise les fichiers construits (npm run build).');
  fs.rmSync(f, { force: true });
  log('Ancien fichier public/hot retiré (Vite n’est plus lancé) : Laravel utilise les fichiers construits.');
}

function status(dir) {
  const s = servers.get(dir);
  return s && s.proc && s.proc.exitCode === null ? s.status : null;
}

async function check(dir) {
  const server = detect(dir);
  const php = server && server.php ? await findPhp({ fresh: true }) : null;
  return {
    server,
    php,
    checks: server && server.kind === 'laravel' ? laravelChecks(dir) : null,
    running: status(dir),
    addresses: lanAddresses().map((a) => ({ name: a.name, address: a.address })),
  };
}

function kill(p) {
  if (!p || !p.pid) return;
  try {
    if (WIN) execFile('taskkill', ['/pid', String(p.pid), '/T', '/F'], () => {});
    else { try { process.kill(-p.pid, 'SIGTERM'); } catch { p.kill('SIGTERM'); } }
  } catch { /* déjà arrêté */ }
}

// Démarre le serveur de test (ouvert au réseau local) ; la construction des fichiers est faite avant par ipc.js.
async function start(dir, { log = () => {} } = {}) {
  const info = detect(dir);
  if (!info) throw new Error('Ce dossier ne contient pas de projet à serveur reconnu.');
  if (!info.canServe) throw new Error(`Un projet ${info.name} se teste avec son propre serveur : indiquez l’adresse du site en ligne.`);
  const running = status(dir);
  if (running) return running;
  const php = await findPhp({ fresh: true });
  if (!php) throw new Error('PHP est introuvable sur ce PC. Installez-le avec « Installer PHP » (Bibliothèques de NEXORA), puis réessayez.');
  let args;
  if (info.kind === 'laravel') {
    const c = laravelChecks(dir);
    if (!c.vendor) throw new Error('Les dépendances PHP du projet ne sont pas installées (dossier vendor absent) : lancez « composer install » dans le dossier du projet.');
    if (!c.env) throw new Error(c.envExample ? 'Fichier .env absent : copiez .env.example en .env, puis lancez « php artisan key:generate ».' : 'Fichier .env absent : créez la configuration de Laravel (.env).');
    if (!c.key) throw new Error('Clé de l’application absente dans .env : lancez « php artisan key:generate » dans le dossier du projet.');
    await checkHot(dir, log);
  }
  const port = await pickPort(8000);
  if (info.kind === 'laravel') args = ['artisan', 'serve', '--host=0.0.0.0', `--port=${port}`];
  else {
    const docroot = fs.existsSync(path.join(dir, 'public', 'index.php')) ? path.join(dir, 'public') : dir;
    args = ['-S', `0.0.0.0:${port}`, '-t', docroot];
  }
  log(`> ${path.basename(php.path)} ${args.join(' ')}  (PHP ${php.version})`);
  const proc = spawn(php.path, args, { cwd: dir, windowsHide: true, detached: !WIN, shell: /\.bat$/i.test(php.path), env: { ...process.env } });
  let out = '';
  const onData = (d) => {
    const text = String(d);
    out = (out + text).slice(-4000);
    text.split(/\r?\n/).filter(Boolean).forEach((l) => log(l));
  };
  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);
  const local = `http://127.0.0.1:${port}/`;
  const ready = await new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    proc.on('exit', () => finish(false));
    proc.on('error', () => finish(false));
    const t0 = Date.now();
    (async function poll() {
      while (!done && Date.now() - t0 < 30000) {
        if (await httpStatus(local)) return finish(true);
        await new Promise((r) => setTimeout(r, 400));
      }
      finish(false);
    })();
  });
  if (!ready) {
    kill(proc);
    throw new Error(`Le serveur de test n’a pas démarré.${out ? `\n${out.trim().split('\n').slice(-6).join('\n')}` : ''}`);
  }
  const lan = lanAddresses();
  const st = {
    running: true, kind: info.kind, label: info.label, port, local,
    url: lan[0] ? `http://${lan[0].address}:${port}/` : null,
    addresses: lan.map((a) => ({ name: a.name, url: `http://${a.address}:${port}/` })),
    since: new Date().toISOString(),
  };
  servers.set(dir, { proc, status: st });
  proc.on('exit', () => { const s = servers.get(dir); if (s && s.proc === proc) servers.delete(dir); });
  return st;
}

function stop(dir) {
  const s = servers.get(dir);
  if (s) { kill(s.proc); servers.delete(dir); }
  return true;
}

function stopAll() {
  for (const dir of [...servers.keys()]) stop(dir);
}

module.exports = { detect, check, start, stop, stopAll, findPhp, lanAddresses, laravelChecks };
