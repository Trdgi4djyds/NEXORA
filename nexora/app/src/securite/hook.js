'use strict';
/* NEXORA #048 — Outils pour les développeurs :
 *  - crochet Git « pre-push » qui bloque un envoi contenant un secret (script sh autonome, exécuté par Git,
 *    aussi sous Windows grâce au shell fourni avec Git) ; un crochet existant est gardé et appelé ensuite ;
 *  - export SARIF 2.1.0 des constats (onglet « Security » de GitHub, GitLab, Azure DevOps…) ;
 *  - fichiers d'intégration continue : un workflow GitHub Actions et un script d'audit sans dépendance
 *    (dépendances vulnérables par OSV, secrets, en-têtes du site publié) qui fait échouer la construction
 *    sous la note choisie. */
const fs = require('fs');
const path = require('path');

const MARK = '# NEXORA : contrôle des secrets avant envoi';
const PATTERNS = [
  '(AKIA|ASIA)[0-9A-Z]{16}', 'gh[pousr]_[A-Za-z0-9]{36,}', 'github_pat_[A-Za-z0-9_]{60,}', '(sk|rk)_live_[0-9A-Za-z]{20,}',
  'xox[abprs]-[0-9A-Za-z-]{10,}', 'AIza[0-9A-Za-z_-]{35}', '-----BEGIN [A-Z ]*PRIVATE KEY-----', 'x(keysib|smtpsib)-[0-9a-f]{64}',
  'sk-ant-[A-Za-z0-9_-]{32,}', 'sk-proj-[A-Za-z0-9_-]{32,}', 'SG\\.[A-Za-z0-9_-]{22}\\.[A-Za-z0-9_-]{43}', 'sbp_[0-9a-f]{40}',
  'sb_secret_[A-Za-z0-9_-]{20,}', 'npm_[A-Za-z0-9]{36}', 'SERVICE_ROLE[A-Z_]*[[:space:]]*[=:][[:space:]]*["\']?eyJ',
];

function hookScript() {
  return `#!/bin/sh
${MARK} (installé par NEXORA).
# Bloque « git push » si les commits envoyés ajoutent une clé, un jeton ou un fichier .env.
# Pour passer outre une fois (à tes risques) : git push --no-verify
PATTERNS='${PATTERNS.join('|').replace(/'/g, "'\\''")}'
z40=0000000000000000000000000000000000000000
input=$(cat)
status=0
while read -r local_ref local_sha remote_ref remote_sha; do
  [ -z "$local_sha" ] && continue
  [ "$local_sha" = "$z40" ] && continue
  hits=$(git log -p -U0 --no-color --no-ext-diff "$local_sha" --not --remotes 2>/dev/null | grep -E '^\\+' | grep -v '^+++' | grep -E -o "$PATTERNS" | head -n 5)
  envs=$(git log --name-only --format= "$local_sha" --not --remotes 2>/dev/null | grep -E '(^|/)\\.env(\\.[A-Za-z0-9_-]+)?$' | grep -v -E '\\.(example|sample|template|dist)$' | sort -u | head -n 5)
  if [ -n "$hits" ] || [ -n "$envs" ]; then
    echo "" >&2
    echo "NEXORA a bloqué cet envoi : des secrets sont présents dans les commits de $local_ref." >&2
    [ -n "$hits" ] && echo "$hits" | sed -E 's/^(.{6}).*(.{2})$/  - \\1…\\2/' >&2
    [ -n "$envs" ] && echo "$envs" | sed 's/^/  - fichier : /' >&2
    echo "Retire-les (git commit --amend ou git rebase), révoque les clés concernées, puis renvoie." >&2
    echo "Pour passer outre : git push --no-verify" >&2
    status=1
  fi
done <<EOF
$input
EOF
[ $status -ne 0 ] && exit $status
prev="$(dirname "$0")/pre-push.avant-nexora"
if [ -x "$prev" ]; then
  printf '%s\\n' "$input" | "$prev" "$@"
  exit $?
fi
exit 0
`;
}

function hooksDir(dir) {
  const git = path.join(dir, '.git');
  if (!fs.existsSync(git)) throw new Error('Ce dossier n’est pas un dépôt Git : initialise-le d’abord (git init).');
  // Dossier réellement utilisé par Git (core.hooksPath du dépôt, de l'utilisateur ou du système compris).
  let real = '';
  try { real = require('child_process').execFileSync('git', ['-C', dir, 'rev-parse', '--git-path', 'hooks'], { encoding: 'utf8', windowsHide: true, timeout: 8000 }).trim(); } catch { real = ''; }
  if (real) {
    const abs = path.resolve(dir, real);
    const inside = !path.relative(path.resolve(dir), abs).startsWith('..');
    if (!inside) throw new Error(`Git utilise des crochets partagés par tous tes dépôts (core.hooksPath = ${abs}) : NEXORA n’y touche pas. Retire ce réglage ou ajoute toi-même le crochet « pre-push ».`);
    return abs;
  }
  let base = git;
  if (fs.statSync(git).isFile()) {
    const m = /gitdir:\s*(.+)/.exec(fs.readFileSync(git, 'utf8'));
    if (m) base = path.resolve(dir, m[1].trim());
  }
  let custom = '';
  try { custom = (/hooksPath\s*=\s*(.+)/.exec(fs.readFileSync(path.join(base, 'config'), 'utf8')) || [])[1] || ''; } catch { custom = ''; }
  return custom ? path.resolve(dir, custom.trim()) : path.join(base, 'hooks');
}

function hookStatus(dir) {
  try {
    const f = path.join(hooksDir(dir), 'pre-push');
    const ours = fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes(MARK);
    return { repo: true, installed: ours, other: fs.existsSync(f) && !ours, chained: fs.existsSync(`${f}.avant-nexora`), file: f };
  } catch (e) { return { repo: false, installed: false, error: e.message }; }
}

function installHook(dir) {
  const hd = hooksDir(dir);
  fs.mkdirSync(hd, { recursive: true });
  const f = path.join(hd, 'pre-push');
  if (fs.existsSync(f) && !fs.readFileSync(f, 'utf8').includes(MARK) && !fs.existsSync(`${f}.avant-nexora`)) fs.renameSync(f, `${f}.avant-nexora`);
  fs.writeFileSync(f, hookScript().replace(/\r\n/g, '\n'), { mode: 0o755 });
  try { fs.chmodSync(f, 0o755); } catch { /* Windows */ }
  return hookStatus(dir);
}

function removeHook(dir) {
  const f = path.join(hooksDir(dir), 'pre-push');
  if (fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes(MARK)) fs.unlinkSync(f);
  if (fs.existsSync(`${f}.avant-nexora`) && !fs.existsSync(f)) fs.renameSync(`${f}.avant-nexora`, f);
  return hookStatus(dir);
}

// SARIF 2.1.0 : un résultat par constat, règles dédupliquées.
const LEVEL = { critical: 'error', high: 'error', medium: 'warning', low: 'note', info: 'note' };
const SCORE = { critical: '9.5', high: '8.0', medium: '5.5', low: '3.0', info: '0.0' };
function toSarif(report) {
  const rules = new Map();
  const results = [];
  for (const f of report.findings || []) {
    const id = `nexora/${String(f.cat || 'general').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}/${String(f.title || '').toLowerCase().normalize('NFD').replace(/\d+/g, 'n').replace(/[^a-z0-9]+/g, '-').slice(0, 60)}`;
    if (!rules.has(id)) rules.set(id, { id, name: f.title, shortDescription: { text: f.title }, fullDescription: { text: f.detail || f.title }, help: { text: f.fix || '' }, properties: { 'security-severity': SCORE[f.sev] || '5.0', tags: ['security', f.cat] } });
    const loc = f.file ? { physicalLocation: { artifactLocation: { uri: f.file }, ...(f.line ? { region: { startLine: f.line } } : {}) } } : { physicalLocation: { artifactLocation: { uri: report.url || report.target || 'site' } } };
    results.push({ ruleId: id, level: LEVEL[f.sev] || 'warning', message: { text: `${f.title}. ${f.detail}${f.fix ? ` Correction : ${f.fix}` : ''}` }, locations: [loc] });
  }
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json', version: '2.1.0',
    runs: [{ tool: { driver: { name: 'NEXORA Sécurité', informationUri: 'https://nexoradevs.online/', version: require('../../package.json').version, rules: [...rules.values()] } }, results, properties: { score: report.score, target: report.target || report.url || '' } }],
  };
}

function workflow({ url = '', minScore = 70 }) {
  return `# Contrôle de sécurité généré par NEXORA : dépendances vulnérables (base OSV), secrets dans le code et
# en-têtes de sécurité du site publié. La construction échoue si un problème grave est trouvé ou si la note
# du site passe sous ${minScore}/100. Les résultats apparaissent aussi dans l'onglet « Security » quand il est disponible.
name: Sécurité (NEXORA)
on:
  push:
    branches: [main, master]
  pull_request:
  schedule:
    - cron: '23 6 * * 1'
  workflow_dispatch:
permissions:
  contents: read
  security-events: write
jobs:
  securite:
    name: Audit de sécurité
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Audit NEXORA
        run: node .nexora/audit-securite.cjs --sarif nexora-securite.sarif --min-score ${minScore}${url ? ` --url ${url}` : ''}
      - name: Envoyer les résultats à GitHub
        if: always()
        continue-on-error: true
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: nexora-securite.sarif
          category: nexora
`;
}

// Script autonome lancé par le workflow : réutilise le code de lockfiles.js recopié tel quel.
function ciScript() {
  const lock = fs.readFileSync(path.join(__dirname, 'lockfiles.js'), 'utf8').replace(/^'use strict';\s*/, '');
  const sarif = `${LEVEL_SRC}\n${toSarif.toString()}`;
  return `#!/usr/bin/env node
'use strict';
// Audit de sécurité généré par NEXORA (aucune dépendance, Node.js 18 ou plus) :
//   node .nexora/audit-securite.cjs [--url https://ton-site.com] [--min-score 70] [--sarif fichier.sarif]
// Code de sortie 1 : faille critique ou élevée dans les dépendances, secret dans le code, ou note du site trop basse.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const L = (() => { const module = { exports: {} }; ${lock}
return module.exports; })();
${sarif}
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const URL_ = arg('--url', ''); const MIN = Number(arg('--min-score', '70')); const OUT = arg('--sarif', '');
const findings = [];
const add = (sev, cat, title, detail, fix, extra) => findings.push({ sev, cat, title, detail, fix, ...(extra || {}) });
(async () => {
  let files;
  try { files = execSync('git ls-files', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split(/\\r?\\n/).filter(Boolean); } catch { files = L.walk(process.cwd()); }
  for (const f of files) {
    if (L.BIN_EXT.test(f)) continue;
    let t = '';
    try { if (fs.statSync(f).size > 1500000) continue; t = fs.readFileSync(f, 'utf8'); } catch { continue; }
    if (/(^|\\/)\\.env(\\.[\\w-]+)?$/.test(f) && !/\\.(example|sample|template|dist)$/.test(f)) add('high', 'Secrets', 'Fichier .env suivi par Git', f, 'Retire-le du dépôt et ajoute-le à .gitignore.', { file: f });
    for (const h of L.findSecrets(t)) add(h.sev, 'Secrets', h.label, 'Secret écrit dans le code.', 'Révoque la clé et range-la dans un secret du dépôt.', { file: f, line: h.line });
  }
  const pkgs = [];
  for (const f of files) { const n = path.basename(f); if (L.LOCKFILES[n] && !/node_modules\\//.test(f)) { try { for (const [name, version] of L.parseLock(n, fs.readFileSync(f, 'utf8'))) pkgs.push({ name, version, eco: L.LOCKFILES[n], file: f }); } catch {} } }
  for (let i = 0; i < pkgs.length; i += 500) {
    const chunk = pkgs.slice(i, i + 500);
    try {
      const r = await fetch('https://api.osv.dev/v1/querybatch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ queries: chunk.map((p) => ({ package: { name: p.name, ecosystem: p.eco }, version: p.version })) }) });
      const j = await r.json();
      for (const [k, x] of (j.results || []).entries()) for (const v of (x && x.vulns) || []) {
        const d = await (await fetch('https://api.osv.dev/v1/vulns/' + encodeURIComponent(v.id))).json().catch(() => ({}));
        const s = String((d.database_specific && d.database_specific.severity) || 'MODERATE').toUpperCase();
        const sev = s === 'CRITICAL' ? 'critical' : s === 'HIGH' ? 'high' : s === 'LOW' ? 'low' : 'medium';
        add(sev, 'Dépendances', chunk[k].name + ' ' + chunk[k].version + ' : ' + v.id, String(d.summary || ''), 'Mets à jour la dépendance.', { file: chunk[k].file });
      }
    } catch (e) { console.warn('Base OSV indisponible :', e.message); }
  }
  let score = null;
  if (URL_) {
    try {
      const r = await fetch(URL_, { redirect: 'follow' });
      const H = (k) => r.headers.get(k);
      const miss = [['strict-transport-security', 'medium', 'HSTS absent'], ['content-security-policy', 'high', 'Content-Security-Policy absente'], ['x-content-type-options', 'low', 'X-Content-Type-Options absent'], ['referrer-policy', 'low', 'Referrer-Policy absente']];
      for (const [h, sev, t] of miss) if (!H(h)) add(sev, 'En-têtes', t, URL_, 'Ajoute cet en-tête à la configuration de l’hébergeur.');
      if (!H('x-frame-options') && !/frame-ancestors/i.test(H('content-security-policy') || '')) add('medium', 'En-têtes', 'Pas de protection contre le cadrage (clickjacking)', URL_, 'X-Frame-Options: SAMEORIGIN');
      const c = { critical: 0, high: 0, medium: 0, low: 0 };
      for (const f of findings.filter((x) => x.cat === 'En-têtes')) c[f.sev] += 1;
      score = Math.max(0, 100 - (c.critical * 25 + c.high * 12 + c.medium * 6 + c.low * 2));
    } catch (e) { add('high', 'Site', 'Site injoignable', URL_ + ' : ' + e.message, 'Vérifie que le site est en ligne.'); }
  }
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(toSarif({ findings, url: URL_, score }), null, 2));
  const bad = findings.filter((f) => (f.cat === 'Secrets' || f.cat === 'Dépendances') && (f.sev === 'critical' || f.sev === 'high'));
  for (const f of findings) console.log('[' + f.sev + '] ' + f.cat + ' — ' + f.title + (f.file ? ' (' + f.file + (f.line ? ':' + f.line : '') + ')' : ''));
  if (score != null) console.log('Note du site : ' + score + '/100 (minimum ' + MIN + ')');
  if (bad.length || (score != null && score < MIN)) { console.error('Échec : ' + bad.length + ' problème(s) grave(s)' + (score != null && score < MIN ? ', note trop basse' : '') + '.'); process.exit(1); }
  console.log('Aucun problème bloquant.');
})();
`;
}
const LEVEL_SRC = `const LEVEL = ${JSON.stringify(LEVEL)};\nconst SCORE = ${JSON.stringify(SCORE)};`;

function writeCi(dir, opts = {}) {
  if (!dir || !fs.existsSync(dir)) throw new Error('Dossier du projet introuvable.');
  const out = [];
  const put = (rel, text) => {
    const f = path.join(dir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    if (fs.existsSync(f) && fs.readFileSync(f, 'utf8') !== text && !fs.existsSync(`${f}.avant-nexora`)) fs.copyFileSync(f, `${f}.avant-nexora`);
    fs.writeFileSync(f, text);
    out.push(rel);
  };
  put('.github/workflows/nexora-securite.yml', workflow(opts));
  put('.nexora/audit-securite.cjs', ciScript());
  return out;
}

module.exports = { hookScript, hookStatus, installHook, removeHook, toSarif, workflow, ciScript, writeCi, PATTERNS, MARK };
