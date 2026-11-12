'use strict';
/* NEXORA #052 : vérification de tout le projet (types TypeScript, ESLint, Ruff) pour le panneau « Problèmes ». */
const fs = require('fs');
const path = require('path');
const { run, localBin, which, envFor, rel } = require('./util');

function parseTsc(root, out) {
  const items = [];
  for (const m of String(out).matchAll(/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/gm)) {
    const abs = path.resolve(root, m[1]);
    items.push({ file: abs, rel: rel(root, abs), line: +m[2], col: +m[3], severity: m[4] === 'error' ? 'error' : 'warning', code: m[5], message: m[6].trim(), source: 'TypeScript' });
  }
  return items;
}
function parseEslint(root, json) {
  const items = [];
  let data = [];
  try { data = JSON.parse(json.slice(json.indexOf('['))); } catch { return items; }
  for (const f of data) for (const m of f.messages || []) items.push({ file: f.filePath, rel: rel(root, f.filePath), line: m.line || 1, col: m.column || 1, severity: m.severity === 2 ? 'error' : 'warning', code: m.ruleId || '', message: m.message, source: 'ESLint' });
  return items;
}
function parseRuff(root, json) {
  let data = [];
  try { data = JSON.parse(json); } catch { return []; }
  return data.map((m) => ({ file: m.filename, rel: rel(root, m.filename), line: m.location.row, col: m.location.column, severity: 'warning', code: m.code || '', message: m.message, source: 'Ruff' }));
}

async function check(root) {
  const env = envFor(root);
  const tools = [];
  const items = [];
  const tsconfig = fs.existsSync(path.join(root, 'tsconfig.json'));
  const tsc = localBin(root, 'vue-tsc') || localBin(root, 'tsc');
  if (tsconfig && tsc) {
    const t0 = Date.now();
    const r = await run(tsc, ['--noEmit', '--pretty', 'false', '-p', '.'], { cwd: root, env, timeout: 5 * 60 * 1000 });
    const found = parseTsc(root, r.stdout + r.stderr);
    items.push(...found);
    tools.push({ name: 'TypeScript', ran: true, ms: Date.now() - t0, count: found.length });
  } else tools.push({ name: 'TypeScript', ran: false, reason: tsconfig ? 'TypeScript n’est pas installé dans le projet (installez les dépendances).' : 'Pas de tsconfig.json.' });
  const eslint = localBin(root, 'eslint');
  if (eslint) {
    const t0 = Date.now();
    const r = await run(eslint, ['.', '-f', 'json', '--no-error-on-unmatched-pattern'], { cwd: root, env, timeout: 5 * 60 * 1000 });
    const found = parseEslint(root, r.stdout);
    items.push(...found);
    tools.push({ name: 'ESLint', ran: true, ms: Date.now() - t0, count: found.length, error: !found.length && r.code > 1 ? (r.stderr || '').split('\n')[0] : undefined });
  } else tools.push({ name: 'ESLint', ran: false, reason: 'ESLint n’est pas installé dans le projet.' });
  const hasPy = fs.existsSync(path.join(root, 'pyproject.toml')) || fs.existsSync(path.join(root, 'requirements.txt'));
  const ruff = hasPy && which('ruff', env);
  if (ruff) {
    const t0 = Date.now();
    const r = await run(ruff, ['check', '--output-format', 'json', '.'], { cwd: root, env });
    const found = parseRuff(root, r.stdout);
    items.push(...found);
    tools.push({ name: 'Ruff', ran: true, ms: Date.now() - t0, count: found.length });
  }
  items.sort((a, b) => (a.severity === b.severity ? a.rel.localeCompare(b.rel) || a.line - b.line : a.severity === 'error' ? -1 : 1));
  return { items: items.slice(0, 2000), tools, at: Date.now() };
}

module.exports = { check, parseTsc, parseEslint };
