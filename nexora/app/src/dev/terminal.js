'use strict';
/* Terminaux du Dev Lab : une invite de commandes persistante par onglet (cmd sous Windows, bash ou zsh
 * ailleurs), couleurs conservées, dossier courant suivi, arrêt de la commande en cours, détection de
 * l'adresse d'un serveur de développement dans la sortie. */
const { spawn, execFile } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const IS_WIN = process.platform === 'win32';
const MARK = '__VTCWD__';
const URL_RE = /(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]|[\w.-]+\.local|\d+\.\d+\.\d+\.\d+)(?::\d+)?(?:\/[^\s"'\u001b]*)?)/i;
const strip = (s) => s.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '').replace(/\u001b\][^\u0007]*\u0007/g, '');

function killTree(pid) {
  return new Promise((resolve) => {
    if (!pid) { resolve(); return; }
    if (IS_WIN) {
      execFile('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }, () => resolve());
      return;
    }
    try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch { /* déjà terminé */ } }
    setTimeout(() => { try { process.kill(-pid, 'SIGKILL'); } catch { /* terminé */ } resolve(); }, 600);
  });
}

class Session {
  constructor(id, cwd, emit, extraEnv = {}) {
    this.id = id;
    this.cwd = cwd && fs.existsSync(cwd) ? cwd : os.homedir();
    this.emit = emit;
    this.extraEnv = extraEnv;
    this.busy = false;
    this.urls = new Set();
    this.start();
  }

  start() {
    const env = {
      ...process.env, FORCE_COLOR: '1', CLICOLOR_FORCE: '1', npm_config_color: 'always', TERM: 'xterm-256color', COLORTERM: 'truecolor', BROWSER: 'none', ...this.extraEnv,
    };
    delete env.ELECTRON_RUN_AS_NODE;
    if (IS_WIN) {
      env.PROMPT = '$_';
      this.proc = spawn(process.env.ComSpec || 'cmd.exe', ['/Q', '/D', '/K', 'chcp 65001>nul'], {
        cwd: this.cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
      });
    } else {
      const shell = process.env.SHELL && /(bash|zsh)$/.test(process.env.SHELL) ? process.env.SHELL : '/bin/bash';
      // Shell de connexion non interactif : PATH complet (nvm, Homebrew…) sans invite.
      this.proc = spawn(shell, ['-l', '-s'], {
        cwd: this.cwd, env, detached: true, stdio: ['pipe', 'pipe', 'pipe'],
      });
    }
    this.buf = '';
    const onData = (d) => this.onData(d.toString('utf8'));
    this.proc.stdout.on('data', onData);
    this.proc.stderr.on('data', (d) => this.emit({ id: this.id, data: d.toString('utf8') }));
    this.proc.on('exit', (code) => { if (!this.restarting) this.emit({ id: this.id, exit: code }); });
    this.proc.on('error', (e) => this.emit({ id: this.id, data: `\r\n${e.message}\r\n` }));
  }

  onData(s) {
    this.buf += s;
    const lines = this.buf.split(/\r?\n/);
    this.buf = lines.pop();
    // Une ligne incomplète (question « Ok to proceed? (y) ») est affichée tout de suite.
    let out = '';
    for (const line of lines) {
      if (line.startsWith(MARK)) {
        const cwd = line.slice(MARK.length).trim();
        if (cwd) this.cwd = cwd;
        this.busy = false;
        this.emit({ id: this.id, cwd: this.cwd, done: true });
        continue;
      }
      if (IS_WIN && line === '') { out += '\n'; continue; }
      out += `${line}\n`;
      const m = URL_RE.exec(strip(line));
      if (m) {
        const u = m[1].replace(/0\.0\.0\.0|\[::\]|\[::1\]/, 'localhost').replace(/[.,;)]+$/, '');
        if (!this.urls.has(u)) { this.urls.add(u); this.emit({ id: this.id, url: u }); }
      }
    }
    if (this.buf && !this.buf.startsWith(MARK.slice(0, Math.min(this.buf.length, MARK.length)))) { out += this.buf; this.buf = ''; }
    if (out) this.emit({ id: this.id, data: out.replace(/\n{3,}/g, '\n\n') });
  }

  write(line) {
    if (!this.proc || this.proc.exitCode != null) this.start();
    const cmd = String(line).replace(/\r?\n$/, '');
    this.busy = true;
    const marker = IS_WIN ? `echo ${MARK}%CD%` : `printf '\\n${MARK}%s\\n' "$PWD"`;
    this.proc.stdin.write(`${cmd}\n${marker}\n`);
  }

  /** Réponse à une question de la commande en cours (sans marqueur de fin). */
  input(text) {
    if (this.proc && this.proc.stdin.writable) this.proc.stdin.write(`${text}\n`);
  }

  async interrupt() {
    // Pas de vrai Ctrl+C sans terminal : on arrête l'invite et tout ce qu'elle a lancé, puis on la relance.
    this.restarting = true;
    await killTree(this.proc && this.proc.pid);
    this.restarting = false;
    this.busy = false;
    this.urls.clear();
    this.emit({ id: this.id, data: '\r\n\u001b[33m■ Commande arrêtée\u001b[0m\r\n', done: true, cwd: this.cwd });
    this.start();
  }

  async close() {
    this.restarting = true;
    await killTree(this.proc && this.proc.pid);
  }
}

class Terminals {
  constructor(emit) {
    this.emit = emit;
    this.sessions = new Map();
    this.seq = 0;
  }

  open(cwd, env) {
    const id = `term${++this.seq}`;
    this.sessions.set(id, new Session(id, cwd, this.emit, env));
    return { id, cwd: this.sessions.get(id).cwd, shell: IS_WIN ? 'cmd' : path.basename(process.env.SHELL || 'bash') };
  }

  get(id) {
    const s = this.sessions.get(id);
    if (!s) throw new Error('Terminal fermé.');
    return s;
  }

  async close(id) {
    const s = this.sessions.get(id);
    if (s) { await s.close(); this.sessions.delete(id); }
  }

  closeAllSync() {
    for (const s of this.sessions.values()) {
      try {
        if (IS_WIN) execFile('taskkill', ['/pid', String(s.proc.pid), '/T', '/F'], { windowsHide: true });
        else process.kill(-s.proc.pid, 'SIGKILL');
      } catch { /* déjà fermé */ }
    }
    this.sessions.clear();
  }
}

module.exports = { Terminals, killTree, IS_WIN };
