'use strict';
/* NEXORA #052 : tests du projet (Vitest, Jest, Playwright, exécuteur de Node, pytest) : résultats par fichier,
 * relance d'un seul test, couverture. */
const fs = require('fs');
const path = require('path');
const { run, readJson, localBin, which, envFor, tmpFile, rel, listFiles } = require('./util');

function detect(root) {
  const pkg = readJson(path.join(root, 'package.json')) || {};
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const out = [];
  if (deps.vitest) out.push({ id: 'vitest', name: 'Vitest' });
  if (deps.jest || deps['ts-jest']) out.push({ id: 'jest', name: 'Jest' });
  if (deps['@playwright/test']) out.push({ id: 'playwright', name: 'Playwright' });
  const script = String((pkg.scripts || {}).test || '');
  const nodeTests = listFiles(root, { max: 3000 }).filter((f) => /(^|\/)(test|tests|__tests__)\/.*\.[cm]?js$|\.test\.[cm]?js$/.test(f));
  if (!out.length && (/node\s+(--\S+\s+)*--test/.test(script) || nodeTests.length)) out.push({ id: 'node', name: 'Exécuteur de tests de Node' });
  if (fs.existsSync(path.join(root, 'pytest.ini')) || /pytest/.test(fs.existsSync(path.join(root, 'pyproject.toml')) ? fs.readFileSync(path.join(root, 'pyproject.toml'), 'utf8') : '') || fs.existsSync(path.join(root, 'tests', 'conftest.py'))) out.push({ id: 'pytest', name: 'pytest' });
  return { runners: out };
}

const attr = (s, k) => { const m = new RegExp(`\\b${k}="([^"]*)"`).exec(s); return m ? m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : ''; };
function parseJunit(root, xml) {
  const files = new Map();
  for (const m of String(xml).matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const a = m[1];
    const inner = m[2] || '';
    const file = attr(a, 'file') || attr(a, 'classname') || 'tests';
    const fail = /<(failure|error)\b([^>]*)>?([\s\S]*?)(?:<\/\1>|$)/.exec(inner);
    const t = { name: attr(a, 'name'), status: fail ? 'failed' : /<skipped/.test(inner) ? 'skipped' : 'passed', ms: Math.round(parseFloat(attr(a, 'time') || '0') * 1000), message: fail ? (attr(fail[2], 'message') + '\n' + fail[3]).trim().slice(0, 3000) : '' };
    const key = file.startsWith('/') || /^[A-Za-z]:/.test(file) ? rel(root, file) : file;
    if (!files.has(key)) files.set(key, []);
    files.get(key).push(t);
  }
  return [...files].map(([file, tests]) => ({ file, tests }));
}
function parseJestLike(root, data) {
  return (data.testResults || []).map((f) => ({
    file: rel(root, f.name || f.testFilePath || ''),
    tests: (f.assertionResults || f.testResults || []).map((t) => ({ name: t.fullName || t.title, status: t.status === 'pending' || t.status === 'todo' ? 'skipped' : t.status, ms: t.duration || 0, message: (t.failureMessages || []).join('\n').slice(0, 3000) })),
    error: f.status === 'failed' && !(f.assertionResults || []).length ? String(f.message || '').slice(0, 3000) : '',
  }));
}
function parsePlaywright(data) {
  const files = new Map();
  const walk = (suite, file) => {
    const f = suite.file || file;
    for (const s of suite.specs || []) for (const t of s.tests || []) {
      const res = (t.results || [])[t.results.length - 1] || {};
      if (!files.has(f)) files.set(f, []);
      files.get(f).push({ name: `${s.title}${t.projectName ? ` [${t.projectName}]` : ''}`, status: res.status === 'passed' ? 'passed' : res.status === 'skipped' ? 'skipped' : 'failed', ms: res.duration || 0, message: res.error ? String(res.error.message || '').slice(0, 3000) : '' });
    }
    for (const c of suite.suites || []) walk(c, f);
  };
  for (const s of data.suites || []) walk(s, s.file);
  return [...files].map(([file, tests]) => ({ file, tests }));
}
function parseLcov(text) {
  const t = { lines: [0, 0], functions: [0, 0], branches: [0, 0] };
  for (const m of String(text).matchAll(/^(LF|LH|FNF|FNH|BRF|BRH):(\d+)/gm)) {
    const k = { LF: ['lines', 0], LH: ['lines', 1], FNF: ['functions', 0], FNH: ['functions', 1], BRF: ['branches', 0], BRH: ['branches', 1] }[m[1]];
    t[k[0]][k[1]] += +m[2];
  }
  const pct = ([total, hit]) => (total ? Math.round((hit / total) * 1000) / 10 : null);
  return { lines: pct(t.lines), functions: pct(t.functions), branches: pct(t.branches) };
}
function summaryCoverage(file) {
  const j = readJson(file);
  if (!j || !j.total) return null;
  return { lines: j.total.lines && j.total.lines.pct, functions: j.total.functions && j.total.functions.pct, branches: j.total.branches && j.total.branches.pct, statements: j.total.statements && j.total.statements.pct };
}

async function runTests(root, { runner, file, name, coverage }, onData) {
  const env = { ...envFor(root), CI: '1' };
  const out = tmpFile('tests.json');
  const covDir = tmpFile('coverage');
  const t0 = Date.now();
  let files = [];
  let cov = null;
  let r;
  const bin = (n) => localBin(root, n) || n;
  if (runner === 'vitest' || runner === 'jest') {
    const args = runner === 'vitest' ? ['run', '--reporter=json', `--outputFile=${out}`] : ['--json', `--outputFile=${out}`];
    if (coverage) args.push(...(runner === 'vitest' ? ['--coverage.enabled', '--coverage.reporter=json-summary', `--coverage.reportsDirectory=${covDir}`] : ['--coverage', '--coverageReporters=json-summary', `--coverageDirectory=${covDir}`]));
    if (name) args.push('-t', name);
    if (file) args.push(file);
    r = await run(bin(runner), args, { cwd: root, env, onData, timeout: 20 * 60 * 1000 });
    const data = readJson(out);
    if (data) files = parseJestLike(root, data);
    if (coverage) cov = summaryCoverage(path.join(covDir, 'coverage-summary.json'));
  } else if (runner === 'playwright') {
    r = await run(bin('playwright'), ['test', '--reporter=json', ...(name ? ['-g', name] : []), ...(file ? [file] : [])], { cwd: root, env, onData: (d, s) => s === 'err' && onData && onData(d, s), timeout: 30 * 60 * 1000 });
    try { files = parsePlaywright(JSON.parse(r.stdout.slice(r.stdout.indexOf('{')))); } catch { /* sortie illisible */ }
  } else if (runner === 'node') {
    const lcov = tmpFile('lcov.info');
    const args = ['--test', '--test-reporter=spec', '--test-reporter-destination=stdout', '--test-reporter=junit', `--test-reporter-destination=${out}`];
    if (coverage) args.push('--experimental-test-coverage', '--test-reporter=lcov', `--test-reporter-destination=${lcov}`);
    if (name) args.push(`--test-name-pattern=${name}`);
    if (file) args.push(file);
    r = await run(which('node', env) || 'node', args, { cwd: root, env, onData, timeout: 20 * 60 * 1000 });
    if (fs.existsSync(out)) files = parseJunit(root, fs.readFileSync(out, 'utf8'));
    if (coverage && fs.existsSync(lcov)) { cov = parseLcov(fs.readFileSync(lcov, 'utf8')); fs.rmSync(lcov, { force: true }); }
  } else if (runner === 'pytest') {
    const py = which('python', env) || which('python3', env) || 'python';
    const args = ['-m', 'pytest', `--junitxml=${out}`, '-q'];
    if (coverage) args.push('--cov', `--cov-report=json:${covDir}.json`);
    if (name) args.push('-k', name);
    if (file) args.push(file);
    r = await run(py, args, { cwd: root, env, onData, timeout: 20 * 60 * 1000 });
    if (fs.existsSync(out)) files = parseJunit(root, fs.readFileSync(out, 'utf8'));
    const pc = readJson(`${covDir}.json`);
    if (pc && pc.totals) cov = { lines: Math.round(pc.totals.percent_covered * 10) / 10 };
  } else throw new Error('Choisis l’outil de test.');
  for (const f of [out]) fs.rmSync(f, { force: true });
  fs.rmSync(covDir, { recursive: true, force: true });
  const all = files.flatMap((f) => f.tests);
  const totals = { passed: all.filter((t) => t.status === 'passed').length, failed: all.filter((t) => t.status === 'failed').length + files.filter((f) => f.error).length, skipped: all.filter((t) => t.status === 'skipped').length };
  return { runner, files, totals, coverage: cov, ms: Date.now() - t0, code: r.code, tail: files.length ? '' : (r.stdout + r.stderr).slice(-3000) };
}

module.exports = { detect, runTests, parseJunit, parseLcov, parseJestLike };
