'use strict';
/* NEXORA #052 : scripts du projet en boutons (package.json, composer.json, deno.json, Makefile), port du serveur
 * repéré dans la sortie et emplacements des erreurs (fichier:ligne:colonne) reconnus. */
const fs = require('fs');
const path = require('path');
const { readJson, packageManager, envFor, start, killTree, rel } = require('./util');

const URL_RE = /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]|[\w.-]+\.local)(?::(\d{2,5}))[^\s'")\]]*/i;
const LOC_RE = /((?:[A-Za-z]:)?[\w@~.\\/-]*\.(?:[cm]?[jt]sx?|vue|svelte|astro|css|scss|sass|less|html|py|php|go|rs|dart|rb|java|kt|cs|json|ya?ml))(?::|\(|", line )(\d+)(?:[:,]\s?(\d+))?/g;
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07/g;
const ICON = { dev: 'play', start: 'play', serve: 'play', preview: 'eye', build: 'wrench', test: 'pass', lint: 'audit', format: 'pen', typecheck: 'check', deploy: 'upload' };

function list(root) {
  const out = [];
  const pm = packageManager(root);
  const pkg = readJson(path.join(root, 'package.json'));
  if (pkg && pkg.scripts) {
    for (const [name, cmd] of Object.entries(pkg.scripts)) {
      if (/^(pre|post)/.test(name) && pkg.scripts[name.replace(/^(pre|post)/, '')]) continue;
      out.push({ id: `npm:${name}`, name, source: 'package.json', command: `${pm} run ${name}`, detail: String(cmd), icon: ICON[name.split(':')[0]] || 'terminal' });
    }
  }
  const composer = readJson(path.join(root, 'composer.json'));
  if (composer && composer.scripts) for (const name of Object.keys(composer.scripts)) out.push({ id: `composer:${name}`, name, source: 'composer.json', command: `composer run-script ${name}`, detail: [].concat(composer.scripts[name]).join(' && '), icon: 'terminal' });
  const deno = readJson(path.join(root, 'deno.json')) || readJson(path.join(root, 'deno.jsonc'));
  if (deno && deno.tasks) for (const [name, cmd] of Object.entries(deno.tasks)) out.push({ id: `deno:${name}`, name, source: 'deno.json', command: `deno task ${name}`, detail: String(cmd), icon: ICON[name] || 'terminal' });
  const mk = path.join(root, 'Makefile');
  if (fs.existsSync(mk)) {
    const seen = new Set();
    for (const m of fs.readFileSync(mk, 'utf8').matchAll(/^([A-Za-z0-9][\w.-]*)\s*:(?!=)/gm)) if (!seen.has(m[1])) { seen.add(m[1]); out.push({ id: `make:${m[1]}`, name: m[1], source: 'Makefile', command: `make ${m[1]}`, detail: 'cible Make', icon: 'terminal' }); }
  }
  return { pm, tasks: out };
}

// Emplacements d'erreurs d'une ligne de sortie, limités aux fichiers du projet.
function locations(root, text, cwd = root) {
  const out = [];
  for (const m of String(text).replace(ANSI, '').matchAll(LOC_RE)) {
    let f = m[1].replace(/^file:\/\/\/?/, '');
    const abs = path.isAbsolute(f) ? f : path.resolve(cwd, f);
    const r = path.relative(root, abs);
    if (r.startsWith('..') || /node_modules/.test(r)) continue;
    if (!fs.existsSync(abs)) continue;
    out.push({ file: abs, rel: rel(root, abs), line: Number(m[2]), col: Number(m[3] || 1) });
  }
  return out;
}

class Tasks {
  constructor(emit) { this.emit = emit; this.runs = new Map(); this.seq = 0; }
  start(root, task) {
    const t = list(root).tasks.find((x) => x.id === task.id) || (task.command ? { id: `cmd:${++this.seq}`, name: task.name || task.command, command: task.command } : null);
    if (!t) throw new Error('Script introuvable dans le projet.');
    for (const r of this.runs.values()) if (r.root === root && r.task.id === t.id && r.alive) throw new Error(`« ${t.name} » tourne déjà.`);
    const id = `task${++this.seq}`;
    const child = start(t.command, { cwd: root, env: envFor(root) });
    const r = { id, root, task: t, child, alive: true, started: Date.now(), url: null, buf: '' };
    this.runs.set(id, r);
    const onData = (d, stream) => {
      const text = d.toString('utf8');
      this.emit({ id, type: 'data', stream, text });
      r.buf = (r.buf + text).slice(-4000);
      const plain = text.replace(ANSI, '');
      if (!r.url) { const m = URL_RE.exec(plain); if (m) { r.url = m[0].replace('0.0.0.0', 'localhost').replace(/\[::1?\]/, 'localhost').replace(/[.,;]+$/, ''); this.emit({ id, type: 'url', url: r.url }); } }
      const locs = locations(root, plain);
      if (locs.length && /error|erreur|failed|exception|warn|✘|×/i.test(plain)) this.emit({ id, type: 'problems', items: locs.slice(0, 20), text: plain.trim().split(/\r?\n/).slice(0, 4).join('\n') });
    };
    child.stdout.on('data', (d) => onData(d, 'out'));
    child.stderr.on('data', (d) => onData(d, 'err'));
    child.on('close', (code) => { r.alive = false; r.code = code; this.emit({ id, type: 'exit', code, ms: Date.now() - r.started }); });
    child.on('error', (e) => { r.alive = false; this.emit({ id, type: 'data', stream: 'err', text: `${e.message}\n` }); });
    this.emit({ id, type: 'start', task: t, root });
    return { id, task: t };
  }
  stop(id) { const r = this.runs.get(id); if (r && r.alive) killTree(r.child.pid); return true; }
  running(root) { return [...this.runs.values()].filter((r) => r.root === root && r.alive).map((r) => ({ id: r.id, task: r.task, url: r.url, started: r.started })); }
  stopAll() { for (const r of this.runs.values()) if (r.alive) killTree(r.child.pid); }
}

module.exports = { list, locations, Tasks, URL_RE };
