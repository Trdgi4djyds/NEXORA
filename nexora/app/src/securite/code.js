'use strict';
/* NEXORA #048 — Audit du code d'un projet (Dev Lab ou dossier choisi) :
 *  - dépendances vulnérables, tous langages : les fichiers verrouillés (package-lock, pnpm-lock, yarn.lock,
 *    requirements, poetry, composer, Gemfile, go.sum, Cargo, pubspec, NuGet) sont comparés à la base publique
 *    OSV (osv.dev, Google), sans rien installer ;
 *  - secrets écrits dans le code (clés AWS, Stripe, GitHub, OpenAI, Brevo, clé de service Supabase, clés
 *    privées…), fichiers .env suivis par Git, et secrets restés dans l'historique Git (même supprimés).
 * Les valeurs trouvées ne sont jamais renvoyées en entier (masquées). */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { collector, finish, mask, pool, withTimeout } = require('./util');
const { LOCKFILES, parseLock, walk, BIN_EXT, findSecrets } = require('./lockfiles');

const OSV = 'https://api.osv.dev/v1';
const SEV_OF = { CRITICAL: 'critical', HIGH: 'high', MODERATE: 'medium', MEDIUM: 'medium', LOW: 'low' };

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { maxBuffer: 24 * 1024 * 1024, timeout: 45000, windowsHide: true, ...opts }, (err, stdout) => resolve(err && !stdout ? null : String(stdout || '')));
  });
}

// Version corrigée la plus proche pour ce paquet (évènements « fixed » de l'avis OSV).
function fixedOf(vuln, name) {
  const fixed = [];
  for (const a of vuln.affected || []) {
    if (a.package && a.package.name && a.package.name.toLowerCase() !== name.toLowerCase()) continue;
    for (const r of a.ranges || []) for (const e of r.events || []) if (e.fixed) fixed.push(e.fixed);
  }
  return fixed[0] || '';
}

function severityOf(v) {
  const ds = v.database_specific && v.database_specific.severity;
  if (ds && SEV_OF[String(ds).toUpperCase()]) return SEV_OF[String(ds).toUpperCase()];
  for (const a of v.affected || []) {
    const es = a.ecosystem_specific && a.ecosystem_specific.severity;
    if (es && SEV_OF[String(es).toUpperCase()]) return SEV_OF[String(es).toUpperCase()];
  }
  const s = (v.severity || []).find((x) => /CVSS/.test(x.type));
  if (s) {
    const vec = String(s.score);
    const crit = /AV:N/.test(vec) && /PR:N/.test(vec) && /C:H|I:H/.test(vec) && /A:H|C:H/.test(vec);
    if (crit && /UI:N/.test(vec)) return 'high';
    return 'medium';
  }
  return 'medium';
}

function upgradeCmd(eco, name, fixed, file) {
  const f = fixed || 'dernière version';
  if (eco === 'npm') {
    const tool = file === 'pnpm-lock.yaml' ? 'pnpm add' : file === 'yarn.lock' ? 'yarn add' : file === 'bun.lock' ? 'bun add' : 'npm install';
    return `${tool} ${name}@${fixed ? `^${fixed}` : 'latest'}`;
  }
  if (eco === 'PyPI') return file === 'poetry.lock' ? `poetry add "${name}>=${f}"` : `pip install "${name}>=${f}"`;
  if (eco === 'Packagist') return `composer require ${name}:^${f}`;
  if (eco === 'RubyGems') return `bundle update ${name}`;
  if (eco === 'Go') return `go get ${name}@${fixed ? (fixed.startsWith('v') ? fixed : `v${fixed}`) : 'latest'}`;
  if (eco === 'crates.io') return `cargo update -p ${name}${fixed ? ` --precise ${fixed}` : ''}`;
  if (eco === 'Pub') return `dart pub upgrade ${name}`;
  if (eco === 'NuGet') return `dotnet add package ${name}${fixed ? ` --version ${fixed}` : ''}`;
  return '';
}

async function osv(fetchImpl, pkgs, onStep) {
  const results = new Array(pkgs.length).fill(null);
  for (let i = 0; i < pkgs.length; i += 500) {
    const chunk = pkgs.slice(i, i + 500);
    onStep({ label: `Base des failles connues : ${Math.min(pkgs.length, i + 500)} / ${pkgs.length} paquets`, progress: 0.35 + 0.3 * (i / Math.max(1, pkgs.length)) });
    const r = await fetchImpl(`${OSV}/querybatch`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: withTimeout(30000),
      body: JSON.stringify({ queries: chunk.map((p) => ({ package: { name: p.name, ecosystem: p.eco }, version: p.version })) }),
    });
    if (!r.ok) throw new Error(`base OSV indisponible (${r.status})`);
    const j = await r.json();
    (j.results || []).forEach((x, k) => { results[i + k] = (x && x.vulns) || []; });
  }
  const ids = [...new Set(results.flat().filter(Boolean).map((v) => v.id))].slice(0, 200);
  onStep({ label: `Détail de ${ids.length} faille(s)`, progress: 0.7 });
  const details = new Map();
  await pool(ids, 6, async (id) => {
    const r = await fetchImpl(`${OSV}/vulns/${encodeURIComponent(id)}`, { signal: withTimeout(20000) });
    if (r.ok) details.set(id, await r.json());
  });
  return { results, details };
}

async function dependencies(dir, files, fetchImpl, onStep) {
  const locks = files.filter((f) => LOCKFILES[path.basename(f)] && !/(^|\/)(node_modules|vendor)\//.test(f)).slice(0, 30);
  const pkgs = [];
  const perFile = [];
  for (const f of locks) {
    const name = path.basename(f);
    let text = '';
    try { text = fs.readFileSync(path.join(dir, f), 'utf8'); } catch { continue; }
    const list = parseLock(name, text);
    perFile.push({ file: f, ecosystem: LOCKFILES[name], packages: list.length });
    for (const [n, v] of list) pkgs.push({ name: n, version: v, eco: LOCKFILES[name], file: f });
  }
  const uniq = [];
  const seen = new Set();
  for (const p of pkgs) { const k = `${p.eco}|${p.name}|${p.version}`; if (!seen.has(k)) { seen.add(k); uniq.push(p); } }
  const manifests = files.filter((f) => /(^|\/)(package\.json|pyproject\.toml|composer\.json|Gemfile|go\.mod|Cargo\.toml|pubspec\.yaml)$/.test(f) && !/node_modules\//.test(f));
  if (!uniq.length) return { files: perFile, packages: 0, vulnerable: [], manifests, error: '' };
  let data;
  try { data = await osv(fetchImpl, uniq.slice(0, 5000), onStep); } catch (e) { return { files: perFile, packages: uniq.length, vulnerable: [], manifests, error: `Vérification des failles impossible : ${e.message || e}` }; }
  const vulnerable = [];
  uniq.slice(0, 5000).forEach((p, i) => {
    const list = data.results[i] || [];
    if (!list.length) return;
    const vulns = list.map((v) => {
      const d = data.details.get(v.id) || v;
      return {
        id: v.id, cve: ((d.aliases || []).find((a) => /^CVE-/.test(a)) || ''), summary: String(d.summary || (d.details || '').split('\n')[0] || '').slice(0, 240),
        severity: severityOf(d), fixed: fixedOf(d, p.name), url: `https://osv.dev/vulnerability/${encodeURIComponent(v.id)}`,
      };
    });
    const order = { critical: 4, high: 3, medium: 2, low: 1 };
    vulns.sort((a, b) => order[b.severity] - order[a.severity]);
    const fixed = vulns.map((v) => v.fixed).filter(Boolean).sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))[0] || '';
    vulnerable.push({ ...p, vulns, worst: vulns[0].severity, fixed, command: upgradeCmd(p.eco, p.name, fixed, path.basename(p.file)) });
  });
  const order = { critical: 4, high: 3, medium: 2, low: 1 };
  vulnerable.sort((a, b) => order[b.worst] - order[a.worst] || b.vulns.length - a.vulns.length);
  return { files: perFile, packages: uniq.length, vulnerable, manifests, error: '' };
}

function secretsInFiles(dir, files, onStep) {
  const hits = [];
  const candidates = files.filter((f) => !BIN_EXT.test(f) && !/(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(f));
  candidates.forEach((f, i) => {
    if (i % 200 === 0) onStep({ label: `Recherche de secrets : ${i} / ${candidates.length} fichiers`, progress: 0.1 + 0.2 * (i / Math.max(1, candidates.length)) });
    let buf;
    try {
      const st = fs.statSync(path.join(dir, f));
      if (st.size > 1500000) return;
      buf = fs.readFileSync(path.join(dir, f));
    } catch { return; }
    if (buf.includes(0)) return;
    for (const h of findSecrets(buf.toString('utf8'))) if (hits.length < 300) hits.push({ ...h, file: f, value: mask(h.value) });
  });
  return hits;
}

async function gitInfo(dir) {
  if (!fs.existsSync(path.join(dir, '.git'))) return { repo: false };
  const tracked = await run('git', ['-C', dir, 'ls-files']);
  if (tracked == null) return { repo: true, git: false };
  const list = tracked.split(/\r?\n/).filter(Boolean);
  const env = list.filter((f) => /(^|\/)\.env(\.[\w-]+)?$/.test(f) && !/\.(example|sample|template|dist)$/.test(f));
  const keys = list.filter((f) => /\.(pem|key|p12|pfx|jks|keystore)$/i.test(f) || /(^|\/)(id_rsa|id_ed25519)$/.test(f));
  // Historique : lignes ajoutées des 400 derniers commits, toutes branches.
  const log = await run('git', ['-C', dir, 'log', '--all', '-p', '-U0', '--no-color', '--no-ext-diff', '-n', '400', '--format=commit %H']);
  const history = [];
  if (log) {
    let commit = '';
    let file = '';
    const lines = log.slice(0, 30000000).split('\n');
    for (const line of lines) {
      if (line.startsWith('commit ')) { commit = line.slice(7, 14); continue; }
      if (line.startsWith('+++ ')) { file = line.replace(/^\+\+\+ (b\/)?/, ''); continue; }
      if (!line.startsWith('+') || line.startsWith('+++')) continue;
      for (const h of findSecrets(line.slice(1))) {
        if (history.length >= 100) break;
        if (!history.some((x) => x.value === mask(h.value) && x.file === file)) history.push({ ...h, file, commit, value: mask(h.value) });
      }
    }
  }
  return { repo: true, git: true, tracked: list.length, env, keys, history };
}

async function audit(dir, { fetchImpl, onStep = () => {} } = {}) {
  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error('Dossier du projet introuvable.');
  const { findings, add } = collector();
  onStep({ label: 'Lecture des fichiers du projet', progress: 0.05 });
  const files = walk(dir);
  const secrets = secretsInFiles(dir, files, onStep);
  onStep({ label: 'Historique Git', progress: 0.3 });
  const git = await gitInfo(dir);
  onStep({ label: 'Dépendances', progress: 0.35 });
  const deps = await dependencies(dir, files, fetchImpl, onStep);
  onStep({ label: 'Synthèse', progress: 0.95 });
  const live = new Set(secrets.map((s) => `${s.file}|${s.value}`));
  for (const s of secrets) add(s.sev, 'Secrets', `${s.label} dans ${s.file} (ligne ${s.line})`, `Valeur : ${s.value}. Un secret écrit dans le code finit sur GitHub, dans l’application publiée ou chez un prestataire.`, 'Révoque cette clé chez le service concerné, crée-en une nouvelle et range-la dans une variable d’environnement (fichier .env ignoré par Git).', { who: 'toi', file: s.file, line: s.line });
  if (git.history) for (const h of git.history) if (!live.has(`${h.file}|${h.value}`)) add(h.sev === 'low' ? 'low' : 'high', 'Secrets', `${h.label} dans l’historique Git (${h.file}, commit ${h.commit})`, `Valeur : ${h.value}. Même supprimé du code, le secret reste lisible dans l’historique par toute personne qui a accès au dépôt.`, 'Révoque la clé ; si le dépôt est public, considère-la comme compromise. Pour nettoyer l’historique : git filter-repo.', { who: 'toi', file: h.file, commit: h.commit });
  if (git.env && git.env.length) add('high', 'Secrets', `Fichier .env suivi par Git (${git.env.slice(0, 3).join(', ')})`, 'Ce fichier contient en général des mots de passe et des clés : il part avec chaque envoi sur GitHub.', 'Ajoute « .env » à .gitignore, puis : git rm --cached .env ; révoque les clés qu’il contenait.', { who: 'toi' });
  if (git.keys && git.keys.length) add('high', 'Secrets', `Clé ou certificat privé suivi par Git (${git.keys.slice(0, 3).join(', ')})`, 'Une clé privée dans le dépôt permet de signer ou de se connecter à ta place.', 'Retire le fichier du dépôt (git rm --cached) et range-le hors du projet.', { who: 'toi' });
  if (git.repo && !fs.existsSync(path.join(dir, '.gitignore'))) add('low', 'Bonnes pratiques', 'Pas de fichier .gitignore', 'Sans .gitignore, des fichiers sensibles (.env, dossiers de build) peuvent partir sur GitHub.', 'Crée un .gitignore adapté à ton framework.', { who: 'toi' });
  for (const v of deps.vulnerable) {
    const first = v.vulns[0];
    add(v.worst, 'Dépendances', `${v.name} ${v.version} : ${v.vulns.length} faille(s) connue(s)`, `${first.cve || first.id} : ${first.summary || 'faille publiée'}${v.vulns.length > 1 ? ` (et ${v.vulns.length - 1} autre(s))` : ''}. Fichier : ${v.file}.`, v.fixed ? `Mets à jour vers ${v.fixed} ou plus : ${v.command}` : `Aucune version corrigée publiée : cherche une alternative ou surveille l’avis ${first.id}.`, { who: 'toi', pkg: v.name, eco: v.eco, url: first.url });
  }
  if (!deps.files.length && deps.manifests.length) add('low', 'Dépendances', 'Dépendances non verrouillées', `Le projet déclare des dépendances (${deps.manifests.slice(0, 3).join(', ')}) sans fichier de versions verrouillées : chaque installation peut tirer une version différente, et les failles ne peuvent pas être vérifiées.`, 'Installe les dépendances une fois (npm install, pnpm install, composer install…) et garde le fichier verrouillé dans Git.', { who: 'toi' });
  if (deps.error) add('info', 'Dépendances', 'Vérification des failles impossible', deps.error, 'Vérifie ta connexion à Internet, puis relance l’audit.', { who: 'toi' });
  onStep({ label: 'Terminé', progress: 1 });
  return finish(findings, {
    kind: 'code', target: dir, dir, name: path.basename(dir), files: files.length,
    deps: { files: deps.files, packages: deps.packages, vulnerable: deps.vulnerable, error: deps.error },
    secrets: secrets.length, git: { repo: git.repo, git: git.git !== false, tracked: git.tracked || 0, env: git.env || [], history: (git.history || []).length },
  });
}

module.exports = { audit, upgradeCmd, severityOf, fixedOf };
