'use strict';
// Pilotage du serveur de développement d'un projet : SDK, installation, lancement, adresse.
const { spawn, execSync } = require('child_process');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const net = require('net');
const http = require('http');
const https = require('https');
const { checkSdks, describe } = require('./sdk');
const { analyzeProject, venvPython } = require('./frameworks');

const IS_WIN = process.platform === 'win32';

// eslint-disable-next-line no-control-regex
const ANSI_RE = /[\u001b\u009b][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))/g;
const URL_RE = /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]|(?:\d{1,3}\.){3}\d{1,3})(?::\d{2,5})?(?:\/[^\s'"<>)\]]*)?/gi;

function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(port, '127.0.0.1');
  });
}
async function findFreePort(start) {
  for (let p = start; p < start + 60; p++) {
    // eslint-disable-next-line no-await-in-loop
    if (await isPortFree(p)) return p;
  }
  return 0;
}

function probe(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    let lib;
    try { lib = new URL(url).protocol === 'https:' ? https : http; } catch { resolve(false); return; }
    const req = lib.get(url, { timeout: timeoutMs, rejectUnauthorized: false }, (res) => { res.resume(); resolve(true); });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

const normalizeUrl = (u) => u.replace('://0.0.0.0', '://localhost').replace('://[::]', '://localhost').replace('://[::1]', '://localhost').replace(/[.,;:]+$/, '');
const scoreUrl = (u) => (/\/\/(localhost|127\.0\.0\.1)/.test(u) ? 2 : /\/\/0\.0\.0\.0/.test(u) ? 1 : 0);

function killTree(pid) {
  return new Promise((resolve) => {
    if (!pid) { resolve(); return; }
    if (IS_WIN) {
      const k = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
      k.on('exit', () => resolve());
      k.on('error', () => resolve());
      return;
    }
    try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch { /* arrêté */ } }
    setTimeout(() => { try { process.kill(-pid, 'SIGKILL'); } catch { /* arrêté */ } resolve(); }, 1500);
  });
}

function buildEnv(extra) {
  const env = { ...process.env, ...extra };
  if (process.platform === 'darwin') env.PATH = ['/opt/homebrew/bin', '/usr/local/bin', env.PATH].filter(Boolean).join(':');
  return env;
}

class ProjectRunner extends EventEmitter {
  constructor() {
    super();
    this.procs = [];
    this.main = null;
    this.status = 'idle';
    this.url = null;
    this.gen = 0;
    this.watcher = null;
  }

  setStatus(status, extra = {}) {
    this.status = status;
    this.emit('status', { status, url: this.url, ...extra });
  }

  log(text, stream = 'out') {
    const clean = String(text).replace(ANSI_RE, '').replace(/\r(?!\n)/g, '\n');
    if (clean.trim()) this.emit('log', { stream, text: clean });
    return clean;
  }

  spawnShell(cmd, cwd, env, { stdin = false } = {}) {
    this.log(`> ${cmd}\n`, 'cmd');
    const child = spawn(cmd, {
      cwd, env, shell: true, windowsHide: true, detached: !IS_WIN, stdio: [stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });
    this.procs.push(child);
    child.on('exit', () => { this.procs = this.procs.filter((p) => p !== child); });
    return child;
  }

  async runStep(cmd, cwd, env, gen) {
    const child = this.spawnShell(cmd, cwd, env);
    child.stdout.on('data', (d) => this.log(d, 'out'));
    child.stderr.on('data', (d) => this.log(d, 'err'));
    const code = await new Promise((resolve) => {
      child.on('exit', resolve);
      child.on('error', () => resolve(1));
    });
    return gen === this.gen && code === 0;
  }

  resolvePy(a, pysys) {
    return venvPython(a.dir) ? `"${venvPython(a.dir)}"` : pysys;
  }

  fill(template, a, values) {
    return template
      .replace(/\{port\}/g, values.port)
      .replace(/\{script\}/g, values.script || '')
      .replace(/\{pysys\}/g, values.pysys || 'python')
      .replace(/\{py\}/g, () => this.resolvePy(a, values.pysys || 'python'));
  }

  async start({ dir, script, skipInstall = false }) {
    await this.stop(true);
    const gen = ++this.gen;
    this.url = null;
    const a = analyzeProject(dir);
    if (script) a.script = script;

    if (a.unsupported) {
      this.setStatus('unsupported', { message: a.unsupported.message, unsupported: a.unsupported });
      return;
    }

    this.setStatus('checking', { message: 'Vérification des outils' });
    const sdks = await checkSdks(a.sdks, { fresh: true });
    if (gen !== this.gen) return;
    const missing = a.sdks.filter((id) => !sdks[id].ok);
    if (missing.length) {
      const list = missing.map(describe).filter(Boolean);
      this.log(`Outils manquants : ${list.map((m) => m.label).join(', ')}\n`, 'err');
      this.setStatus('missing-sdk', { message: `${list.map((m) => m.label).join(' et ')} ${list.length > 1 ? 'sont introuvables' : 'est introuvable'} sur cet ordinateur.`, missing: list });
      return;
    }
    for (const id of a.sdks) this.log(`${sdks[id].version || id}\n`, 'info');

    if (a.needsWebSupport) {
      this.setStatus('needs-web', { message: 'Ce projet Flutter n\'a pas encore de version web (dossier web/ absent).' });
      return;
    }

    const pysys = sdks.python && sdks.python.command ? sdks.python.command : (IS_WIN ? 'python' : 'python3');
    const port = (await findFreePort(a.defaultPort)) || a.defaultPort;
    const values = { port: String(port), script: a.script, pysys };
    const env = buildEnv({
      PORT: String(port), BROWSER: 'none', FORCE_COLOR: '0', npm_config_color: 'false', ...a.env,
    });

    if (a.installNeeded && !skipInstall) {
      this.setStatus('installing', { message: a.install[0] ? a.install[0].label : 'Installation' });
      for (const step of a.install) {
        if (gen !== this.gen) return;
        this.setStatus('installing', { message: step.label });
        if (step.copy) {
          try {
            fs.copyFileSync(path.join(dir, step.copy[0]), path.join(dir, step.copy[1]));
            this.log(`> copie de ${step.copy[0]} vers ${step.copy[1]}\n`, 'cmd');
          } catch (err) { this.log(`${err.message}\n`, 'err'); }
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        const ok = await this.runStep(this.fill(step.cmd, a, values), dir, env, gen);
        if (gen !== this.gen) return;
        if (!ok) {
          this.setStatus('error', { message: `Échec : ${step.label.toLowerCase()}. Consulte la console du serveur.`, step: step.label });
          return;
        }
      }
    }

    if (a.kind === 'static') {
      this.setStatus('static', { message: 'Site statique' });
      return;
    }

    this.setStatus('starting', { message: a.kind === 'flutter' ? 'Compilation Flutter pour le web' : `Démarrage de ${a.label}` });
    const cmd = this.fill(a.run, a, values);
    const child = this.spawnShell(cmd, dir, env, { stdin: Boolean(a.watch) });
    this.main = child;
    for (const side of a.side) {
      const s = this.spawnShell(side.cmd, dir, env);
      s.stdout.on('data', (d) => this.log(d, 'out'));
      s.stderr.on('data', (d) => this.log(d, 'err'));
    }

    let candidates = [];
    let pickTimer = null;
    let resolved = false;
    const acceptUrl = async (url) => {
      if (resolved || gen !== this.gen) return;
      resolved = true;
      for (let i = 0; i < 240 && gen === this.gen; i++) {
        // eslint-disable-next-line no-await-in-loop
        if (await probe(url)) {
          if (gen !== this.gen) return;
          this.url = url;
          this.setStatus('running', { message: url });
          this.startWatch(a, child, gen);
          return;
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 500));
      }
      resolved = false;
    };

    const onData = (stream) => (d) => {
      const text = this.log(d, stream);
      if (resolved) return;
      const found = text.match(URL_RE);
      if (!found) return;
      candidates.push(...found.map(normalizeUrl));
      if (!pickTimer) {
        pickTimer = setTimeout(() => {
          const best = candidates.sort((x, y) => scoreUrl(y) - scoreUrl(x))[0];
          candidates = [];
          pickTimer = null;
          acceptUrl(best.endsWith('/') ? best : `${best}/`);
        }, 400);
      }
    };
    child.stdout.on('data', onData('out'));
    child.stderr.on('data', onData('err'));

    const fallbackUrl = `http://localhost:${port}/`;
    const poll = setInterval(async () => {
      if (resolved || gen !== this.gen) { clearInterval(poll); return; }
      if (await probe(fallbackUrl, 800)) { clearInterval(poll); acceptUrl(fallbackUrl); }
    }, 2500);

    const limit = a.kind === 'flutter' || a.kind === 'dotnet' ? 600000 : 240000;
    const giveUp = setTimeout(() => {
      if (!this.url && gen === this.gen && this.status === 'starting') {
        this.setStatus('error', { message: 'L\'adresse du serveur n\'a pas été détectée. Colle-la dans la barre d\'adresse si le serveur tourne.' });
      }
    }, limit);

    child.on('error', (err) => this.log(`${err.message}\n`, 'err'));
    child.on('exit', (code) => {
      clearInterval(poll);
      clearTimeout(giveUp);
      if (gen !== this.gen) return;
      this.main = null;
      const wasRunning = this.status === 'running';
      this.url = null;
      this.stopWatch();
      if (code === 0 || code === null) this.setStatus('stopped', { message: 'Serveur arrêté' });
      else {
        this.setStatus('error', {
          message: wasRunning ? `Le serveur s'est arrêté (code ${code}).` : `Le serveur n'a pas pu démarrer (code ${code}). Consulte la console du serveur.`,
        });
      }
    });
  }

  // Flutter : relance l'application quand un fichier Dart change (touche « r » de flutter run).
  startWatch(a, child, gen) {
    this.stopWatch();
    if (!a.watch || !child.stdin) return;
    let timer = null;
    const watchers = [];
    for (const d of a.watch.dirs) {
      try {
        watchers.push(fs.watch(path.join(a.dir, d), { recursive: true }, () => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            if (gen !== this.gen || !child.stdin.writable) return;
            this.log('> rechargement après modification du code\n', 'cmd');
            child.stdin.write(a.watch.key);
            this.emit('hot-reload');
          }, 400);
        }));
      } catch { /* dossier absent */ }
    }
    this.watcher = { close: () => watchers.forEach((w) => w.close()) };
  }

  stopWatch() {
    if (this.watcher) { try { this.watcher.close(); } catch { /* ignore */ } this.watcher = null; }
  }

  async runOnce(cmd, dir) {
    await this.stop(true);
    return this.runStep(cmd, dir, buildEnv({}), this.gen);
  }

  async stop(silent = false) {
    this.gen++;
    this.stopWatch();
    const procs = this.procs.slice();
    this.procs = [];
    this.main = null;
    this.url = null;
    await Promise.all(procs.map((p) => killTree(p.pid)));
    if (!silent) this.setStatus('stopped', { message: 'Serveur arrêté' });
  }

  stopSync() {
    this.stopWatch();
    for (const p of this.procs) {
      if (!p.pid) continue;
      if (IS_WIN) {
        try { execSync(`taskkill /pid ${p.pid} /T /F`, { windowsHide: true, stdio: 'ignore' }); } catch { /* ignore */ }
      } else {
        try { process.kill(-p.pid, 'SIGKILL'); } catch { /* ignore */ }
      }
    }
    this.procs = [];
  }
}

module.exports = { ProjectRunner, probe };
