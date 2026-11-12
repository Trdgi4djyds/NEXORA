'use strict';
/* NEXORA #052 : canaux devx:* des outils du Dev Lab (Problèmes, scripts, variables protégées, secrets, Git avancé,
 * demandes de fusion, débogueur, client d'API, tests, dépendances, mise en ligne, contrôles, bases de données,
 * assistant IA du projet). Offres : voir GATES de src/plan.js (Standard : devlab, Pro : devlab_pro). */
const fs = require('fs');
const path = require('path');
const util = require('./util');
const { Vault } = require('./vault');
const secrets = require('./secrets');
const tasks = require('./tasks');
const problems = require('./problems');
const gitx = require('./gitx');
const { Debugger } = require('./debug');
const http = require('./http');
const tests = require('./tests');
const deps = require('./deps');
const { Deployer } = require('./deploy');
const checks = require('./checks');
const { Databases } = require('./db');
const agent = require('./agent');
const { GitHub } = require('../dev/git');

function register({ ipcMain, app, safeStorage, send, BrowserWindow, partition }) {
  const dataDir = app.getPath('userData');
  const store = new util.Store(path.join(dataDir, 'devplus'));
  const vault = new Vault({ store, safeStorage });
  util.setVault(vault);
  const gh = new GitHub({ store: path.join(dataDir, 'github.json'), safeStorage });
  const runner = new tasks.Tasks((m) => send('devx:task', m));
  const dbg = new Debugger((m) => send('devx:debug', m));
  const deployer = new Deployer({ store, safeStorage, gh, emit: (m) => send('devx:deploy', m) });
  const dbs = new Databases({ store, vault, dataDir });
  const prs = new gitx.PullRequests(gh);
  const project = (root) => {
    if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error('Ouvrez d’abord un projet dans le Dev Lab.');
    return path.resolve(root);
  };
  const h = (channel, fn) => ipcMain.handle(channel, (_e, a = {}) => fn(a || {}));
  const log = (channel, id) => (text, stream) => send(channel, { id, type: 'log', stream, text });

  h('devx:info', () => ({ git: Boolean(util.which('git')), node: Boolean(util.which('node')), sqlite: (() => { try { require('node:sqlite'); return true; } catch { return false; } })(), encrypted: vault.canEncrypt(), github: Boolean(gh.token()), debugger: typeof WebSocket === 'function' }));
  h('devx:files', (a) => util.listFiles(project(a.root), { max: 20000 }));

  // Assistant IA du projet
  h('devx:agent-context', (a) => agent.context(project(a.root), a));
  h('devx:agent-apply', (a) => agent.apply(project(a.root), { edits: a.edits, dataDir }));
  h('devx:agent-undo', (a) => agent.undo(project(a.root), { undoId: a.undoId, dataDir }));
  h('devx:consignes-get', (a) => agent.consignes(project(a.root)));
  h('devx:consignes-set', (a) => agent.saveConsignes(project(a.root), a.text));

  // Problèmes et scripts
  h('devx:problems', (a) => problems.check(project(a.root)));
  h('devx:tasks', (a) => ({ ...tasks.list(project(a.root)), running: runner.running(path.resolve(a.root)) }));
  h('devx:task-start', (a) => runner.start(project(a.root), a.task || {}));
  h('devx:task-stop', (a) => runner.stop(a.id));
  h('devx:locate', (a) => tasks.locations(project(a.root), a.text || ''));

  // Variables protégées et secrets
  h('devx:env-list', (a) => vault.list(project(a.root)));
  h('devx:env-set', (a) => vault.set(project(a.root), a));
  h('devx:env-remove', (a) => vault.remove(project(a.root), a.key));
  h('devx:env-reveal', (a) => vault.reveal(project(a.root), a.key));
  h('devx:env-example', (a) => vault.writeExample(project(a.root)));
  h('devx:env-export', (a) => vault.exportDotenv(project(a.root)));
  h('devx:env-import', (a) => vault.importDotenv(project(a.root), a.file || '.env'));
  h('devx:secrets-scan', (a) => secrets.scan(project(a.root), { files: a.files, vault }));

  // Git avancé
  h('devx:git-branches', (a) => gitx.branches(project(a.root)));
  h('devx:git-branch-create', (a) => gitx.branchCreate(project(a.root), a));
  h('devx:git-branch-delete', (a) => gitx.branchDelete(project(a.root), a));
  h('devx:git-switch', (a) => gitx.switchTo(project(a.root), a));
  h('devx:git-merge', (a) => gitx.merge(project(a.root), a));
  h('devx:git-conflicts', (a) => gitx.conflicts(project(a.root)));
  h('devx:git-conflict', (a) => gitx.conflictFile(project(a.root), a));
  h('devx:git-resolve', (a) => gitx.resolve(project(a.root), a));
  h('devx:git-merge-abort', (a) => gitx.mergeAbort(project(a.root)));
  h('devx:git-merge-continue', (a) => gitx.mergeContinue(project(a.root)));
  h('devx:git-stash-list', (a) => gitx.stashList(project(a.root)));
  h('devx:git-stash', (a) => gitx.stashPush(project(a.root), a));
  h('devx:git-stash-apply', (a) => gitx.stashApply(project(a.root), a));
  h('devx:git-stash-drop', (a) => gitx.stashDrop(project(a.root), a));
  h('devx:git-stash-show', (a) => gitx.stashShow(project(a.root), a));
  h('devx:git-blame', (a) => gitx.blame(project(a.root), { file: path.relative(path.resolve(a.root), path.resolve(a.root, a.file || '')).split(path.sep).join('/') }));
  h('devx:git-graph', (a) => gitx.graph(project(a.root), a));
  h('devx:pr-list', (a) => prs.list(project(a.root), a));
  h('devx:pr-create', (a) => prs.create(project(a.root), a));
  h('devx:pr-get', (a) => prs.get(project(a.root), a));
  h('devx:pr-review', (a) => prs.review(project(a.root), a));
  h('devx:pr-merge', (a) => prs.merge(project(a.root), a));

  // Débogueur
  h('devx:debug-start', (a) => dbg.start(project(a.root), a));
  h('devx:debug-attach', (a) => dbg.attach(a.port));
  h('devx:debug-cmd', (a) => dbg.cmd(a.action));
  h('devx:debug-breakpoints', (a) => dbg.setBreakpoints(a.file, (a.lines || []).map(Number).filter((n) => n > 0)));
  h('devx:debug-eval', (a) => dbg.evaluate(a.frame, a.expression));
  h('devx:debug-scopes', (a) => dbg.frameScopes(a.frame || 0));
  h('devx:debug-props', (a) => dbg.props(a.objectId));

  // Client d'API
  h('devx:http', (a) => http.send(a));
  h('devx:api-load', (a) => store.get(project(a.root), 'api', { collections: [], vars: {}, history: [] }));
  h('devx:api-save', (a) => store.set(project(a.root), 'api', a.data || {}));
  h('devx:api-import', (a) => http.importOpenApi(a.text || ''));

  // Tests
  h('devx:tests-detect', (a) => tests.detect(project(a.root)));
  h('devx:tests-run', (a) => tests.runTests(project(a.root), a, log('devx:tests', 'tests')));

  // Dépendances
  h('devx:deps', (a) => deps.report(project(a.root)));
  h('devx:deps-update', (a) => deps.update(project(a.root), a, log('devx:deps', 'deps')));
  h('devx:deps-fix', (a) => deps.auditFix(project(a.root), log('devx:deps', 'deps')));

  // Mise en ligne et contrôles
  h('devx:deploy-providers', () => deployer.providers());
  h('devx:deploy-creds', (a) => deployer.setCreds(a.provider, a.values));
  h('devx:deploy-config', (a) => deployer.config(project(a.root)));
  h('devx:deploy-save', (a) => deployer.saveConfig(project(a.root), a.config || {}));
  h('devx:deploy-run', (a) => deployer.deploy(project(a.root), a));
  h('devx:checks-run', (a) => checks.runChecks({ BrowserWindow, partition: partition() }, a));

  // Bases de données
  h('devx:db-list', (a) => ({ items: dbs.list(project(a.root)), detected: dbs.detect(project(a.root)) }));
  h('devx:db-save', (a) => dbs.save(project(a.root), a.conn || {}));
  h('devx:db-remove', (a) => dbs.remove(project(a.root), a.id));
  h('devx:db-tables', (a) => dbs.tables(project(a.root), a));
  h('devx:db-rows', (a) => dbs.rows(project(a.root), a));
  h('devx:db-query', (a) => dbs.query(project(a.root), a));
  h('devx:db-seed', (a) => dbs.seed(project(a.root), a));

  if (app.on) app.on('before-quit', () => { runner.stopAll(); dbg.stopAll(); });
  return { vault, runner, dbg };
}

module.exports = { register };
