'use strict';
/* NEXORA #052 : santé des dépendances : paquets obsolètes, failles connues, licences, mise à jour en un clic. */
const fs = require('fs');
const path = require('path');
const { run, readJson, packageManager, envFor } = require('./util');

const COPYLEFT = /\b(A?GPL|LGPL|SSPL|EUPL|OSL|CC-BY-SA|CPAL)\b/i;
const parse = (s) => { try { const i = s.search(/[[{]/); return i >= 0 ? JSON.parse(s.slice(i)) : null; } catch { return null; } };

async function outdated(root, pm, env) {
  const args = pm === 'pnpm' ? ['outdated', '--format', 'json'] : ['outdated', '--json'];
  const r = await run(pm === 'pnpm' ? 'pnpm' : 'npm', args, { cwd: root, env, timeout: 3 * 60 * 1000 });
  const j = parse(r.stdout) || {};
  return Object.entries(j).map(([name, v]) => ({ name, current: v.current || '—', wanted: v.wanted || '', latest: v.latest || '', dev: v.dependencyType === 'devDependencies' || v.isDevDependency === true || v.type === 'devDependencies', major: v.current && v.latest && String(v.current).split('.')[0] !== String(v.latest).split('.')[0] }));
}
async function audit(root, pm, env) {
  const lock = pm === 'pnpm' ? 'pnpm-lock.yaml' : 'package-lock.json';
  if (!fs.existsSync(path.join(root, lock))) return { items: [], skipped: `Pas de ${lock} : installe les dépendances pour vérifier les failles.` };
  const r = await run(pm === 'pnpm' ? 'pnpm' : 'npm', ['audit', '--json'], { cwd: root, env, timeout: 3 * 60 * 1000 });
  const j = parse(r.stdout) || {};
  const items = [];
  if (j.vulnerabilities) {
    for (const [name, v] of Object.entries(j.vulnerabilities)) {
      const via = (v.via || []).filter((x) => typeof x === 'object');
      items.push({ name, severity: v.severity, title: via.map((x) => x.title).filter(Boolean)[0] || `Dépend d’un paquet vulnérable (${(v.via || []).filter((x) => typeof x === 'string').join(', ')})`, range: v.range, url: (via[0] || {}).url || '', fix: v.fixAvailable ? (typeof v.fixAvailable === 'object' ? `${v.fixAvailable.name}@${v.fixAvailable.version}` : 'oui') : '' });
    }
  } else if (j.advisories) {
    for (const a of Object.values(j.advisories)) items.push({ name: a.module_name, severity: a.severity, title: a.title, range: a.vulnerable_versions, url: a.url, fix: a.patched_versions && a.patched_versions !== '<0.0.0' ? a.patched_versions : '' });
  }
  const order = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 };
  items.sort((a, b) => (order[a.severity] ?? 5) - (order[b.severity] ?? 5));
  return { items };
}
function licenses(root) {
  const dir = path.join(root, 'node_modules');
  const pkg = readJson(path.join(root, 'package.json')) || {};
  const direct = new Set(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }));
  const out = [];
  for (const name of direct) {
    const p = readJson(path.join(dir, ...name.split('/'), 'package.json'));
    if (!p) { out.push({ name, version: '—', license: 'Non installé', risk: 'missing' }); continue; }
    const lic = typeof p.license === 'string' ? p.license : p.license && p.license.type ? p.license.type : Array.isArray(p.licenses) ? p.licenses.map((l) => l.type || l).join(' OR ') : '';
    out.push({ name, version: p.version, license: lic || 'Inconnue', risk: !lic ? 'unknown' : COPYLEFT.test(lic) ? 'copyleft' : 'ok' });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

async function report(root) {
  if (!fs.existsSync(path.join(root, 'package.json'))) throw new Error('Ce projet n’a pas de package.json : la santé des dépendances concerne les projets JavaScript.');
  const pm = packageManager(root);
  const env = envFor(root);
  const [out, aud] = await Promise.all([outdated(root, pm, env).catch(() => []), audit(root, pm, env).catch((e) => ({ items: [], skipped: e.message }))]);
  const lic = licenses(root);
  const sev = (s) => aud.items.filter((v) => v.severity === s).length;
  return { pm, outdated: out, vulnerabilities: aud.items, auditSkipped: aud.skipped || '', licenses: lic, summary: { outdated: out.length, major: out.filter((o) => o.major).length, critical: sev('critical'), high: sev('high'), moderate: sev('moderate'), low: sev('low'), copyleft: lic.filter((l) => l.risk === 'copyleft').length }, at: Date.now() };
}
async function update(root, { name, version = 'latest', dev }, onData) {
  if (!/^(@[\w.-]+\/)?[\w.-]+$/.test(name || '')) throw new Error('Nom de paquet invalide.');
  const pm = packageManager(root);
  const spec = `${name}@${version}`;
  const args = pm === 'npm' ? ['install', spec, ...(dev ? ['--save-dev'] : [])] : pm === 'yarn' ? ['add', spec, ...(dev ? ['-D'] : [])] : ['add', spec, ...(dev ? ['-D'] : [])];
  const r = await run(pm, args, { cwd: root, env: envFor(root), onData, timeout: 10 * 60 * 1000 });
  if (r.code) throw new Error((r.stderr || r.stdout).trim().split('\n').slice(-3).join(' '));
  return { ok: true, spec };
}
async function auditFix(root, onData) {
  const pm = packageManager(root);
  const r = await run(pm === 'pnpm' ? 'pnpm' : 'npm', pm === 'pnpm' ? ['audit', '--fix'] : ['audit', 'fix'], { cwd: root, env: envFor(root), onData, timeout: 10 * 60 * 1000 });
  return { ok: r.code === 0, output: (r.stdout + r.stderr).slice(-2000) };
}

module.exports = { report, update, auditFix, licenses };
