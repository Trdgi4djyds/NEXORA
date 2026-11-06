'use strict';
/* NEXORA #052 : utilitaires communs des outils du Dev Lab (commandes, chemins, stockage par projet). */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { killTree, IS_WIN } = require('../dev/terminal');
const isolation = require('../isolation');

const IGNORED = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', '.output', '.svelte-kit', 'coverage', '.turbo', '.cache', 'vendor', '__pycache__', '.venv', 'venv', 'target', '.dart_tool', '.idea', '.vscode']);

const hash = (s) => crypto.createHash('sha1').update(String(s).toLowerCase()).digest('hex').slice(0, 16);
const readJson = (file, fallback = null) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
const writeJson = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2)); };

// Chemin d'un fichier du projet, refusé s'il sort du dossier.
function inside(root, file) {
  const r = path.resolve(root);
  const f = path.resolve(r, file || '');
  if (f !== r && !f.startsWith(r + path.sep)) throw new Error('Ce fichier est en dehors du projet.');
  return f;
}
const rel = (root, file) => path.relative(root, file).split(path.sep).join('/');

// Exécutable trouvé dans le PATH (avec les extensions de Windows), ou null.
function which(bin, env = process.env) {
  const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
  const exts = IS_WIN ? String(env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';') : [''];
  for (const dir of String(env[key] || '').split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const f = path.join(dir, bin + ext.toLowerCase());
      const g = path.join(dir, bin + ext);
      if (fs.existsSync(f) && fs.statSync(f).isFile()) return f;
      if (fs.existsSync(g) && fs.statSync(g).isFile()) return g;
    }
  }
  return null;
}
// Commande installée dans node_modules/.bin du projet.
function localBin(root, name) {
  const f = path.join(root, 'node_modules', '.bin', IS_WIN ? `${name}.cmd` : name);
  return fs.existsSync(f) ? f : null;
}
// Gestionnaire de paquets du projet, d'après son fichier de verrouillage.
function packageManager(root) {
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(root, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(root, 'bun.lockb')) || fs.existsSync(path.join(root, 'bun.lock'))) return 'bun';
  return 'npm';
}
const quote = (a) => (/^[\w@%+=:,./\\-]+$/.test(a) ? a : IS_WIN ? `"${String(a).replace(/"/g, '""')}"` : `'${String(a).replace(/'/g, "'\\''")}'`);

// Lance une commande et attend sa fin. shell : chaîne passée telle quelle à l'interpréteur.
function run(cmd, args = [], { cwd, env, timeout = 10 * 60 * 1000, onData, input, shell = false, signal } = {}) {
  return new Promise((resolve, reject) => {
    const line = shell ? cmd : [cmd, ...args].map(quote).join(' ');
    let child;
    try {
      child = spawn(line, [], { cwd, env: env || process.env, shell: true, windowsHide: true, detached: !IS_WIN });
    } catch (e) { reject(e); return; }
    let stdout = '';
    let stderr = '';
    const cap = (s, d) => (s.length > 8e6 ? s : s + d);
    child.stdout.on('data', (d) => { const t = d.toString('utf8'); stdout = cap(stdout, t); if (onData) onData(t, 'out'); });
    child.stderr.on('data', (d) => { const t = d.toString('utf8'); stderr = cap(stderr, t); if (onData) onData(t, 'err'); });
    const timer = timeout ? setTimeout(() => { killTree(child.pid); }, timeout) : null;
    if (signal) signal.addEventListener('abort', () => killTree(child.pid), { once: true });
    child.on('error', (e) => { if (timer) clearTimeout(timer); reject(e); });
    child.on('close', (code) => { if (timer) clearTimeout(timer); resolve({ code: code == null ? -1 : code, stdout, stderr }); });
    if (input != null) child.stdin.end(input); else child.stdin.end();
  });
}
// Processus de longue durée (scripts, débogage) : renvoie l'enfant.
// Hors Windows, groupe de processus à part : killTree arrête aussi les processus lancés par la commande.
function start(line, { cwd, env } = {}) {
  return spawn(line, [], { cwd, env: env || process.env, shell: true, windowsHide: true, detached: !IS_WIN });
}

// Liste des fichiers du projet (hors dossiers lourds), chemins relatifs.
function listFiles(root, { max = 4000, maxDepth = 12 } = {}) {
  const out = [];
  const walk = (dir, depth) => {
    if (out.length >= max || depth > maxDepth) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => (a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? 1 : -1));
    for (const e of entries) {
      if (out.length >= max) return;
      if (e.isDirectory()) { if (!IGNORED.has(e.name) && !e.name.startsWith('.')) walk(path.join(dir, e.name), depth + 1); } else if (e.isFile()) out.push(rel(root, path.join(dir, e.name)));
    }
  };
  walk(root, 0);
  return out;
}
const isTextFile = (file) => {
  try {
    const fd = fs.openSync(file, 'r');
    const b = Buffer.alloc(4096);
    const n = fs.readSync(fd, b, 0, 4096, 0);
    fs.closeSync(fd);
    return !b.subarray(0, n).includes(0);
  } catch { return false; }
};

// Données d'un projet gardées dans le dossier de NEXORA (jamais dans le projet).
class Store {
  constructor(dir) { this.dir = dir; }
  file(root, name) { return path.join(this.dir, root ? hash(path.resolve(root)) : 'global', `${name}.json`); }
  get(root, name, fallback) { return readJson(this.file(root, name), fallback); }
  set(root, name, data) { writeJson(this.file(root, name), data); return data; }
}

// Environnement d'une commande du projet : outils du projet (#016) et variables du coffre (#052).
let vaultRef = null;
const setVault = (v) => { vaultRef = v; };
function envFor(root, extra = {}) {
  const vars = vaultRef ? vaultRef.envObject(root) : {};
  return isolation.projectEnv(root, { FORCE_COLOR: '0', ...vars, ...extra });
}
const tmpFile = (name) => path.join(os.tmpdir(), `nexora-${process.pid}-${Date.now().toString(36)}-${name}`);

module.exports = {
  IS_WIN, IGNORED, hash, readJson, writeJson, inside, rel, which, localBin, packageManager, quote, run, start, listFiles, isTextFile, Store, envFor, setVault, tmpFile, killTree,
};
