'use strict';
/* NEXORA #052 : recherche de clés, jetons et mots de passe dans les fichiers modifiés, avant un envoi Git. */
const fs = require('fs');
const path = require('path');
const git = require('isomorphic-git');
const { rel, isTextFile, listFiles } = require('./util');

const RULES = [
  ['Clé privée', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/],
  ['Clé d’accès AWS', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['Jeton GitHub', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b/],
  ['Jeton GitLab', /\bglpat-[A-Za-z0-9_-]{20,}\b/],
  ['Jeton Slack', /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/],
  ['Clé Stripe', /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/],
  ['Clé Google', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Clé d’IA', /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}\b/],
  ['Clé d’envoi d’e-mails', /\b(?:xkeysib|xsmtpsib)-[a-f0-9]{64}-[A-Za-z0-9]{16}\b|\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/],
  ['Jeton de gestion de base de données', /\bsbp_[a-f0-9]{40}\b/],
  ['Jeton JWT à privilèges', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]*(?:c2VydmljZV9yb2xl|InNlcnZpY2Vfcm9sZS)[A-Za-z0-9_-]*\.[A-Za-z0-9_-]{10,}/],
  ['Adresse de base de données avec mot de passe', /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^:\s/'"]+:[^@\s'"]{4,}@/],
  ['Mot de passe ou clé en clair', /\b(?:api[_-]?key|secret|passw(?:or)?d|access[_-]?token|auth[_-]?token|client[_-]?secret)\b["']?\s*[:=]\s*["'][^"'\s]{12,}["']/i],
];
const SKIP = /(^|\/)(\.env\.example|\.env\.sample|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lock)$|\.(png|jpe?g|gif|webp|ico|pdf|zip|woff2?|ttf|mp4|mp3|lock|min\.js|map)$/i;
const mask = (s) => (s.length <= 8 ? '••••' : `${s.slice(0, 4)}${'•'.repeat(Math.min(16, s.length - 6))}${s.slice(-2)}`);

// Fichiers modifiés ou nouveaux par rapport au dernier enregistrement (tous les fichiers sans dépôt).
async function changedFiles(root) {
  if (!fs.existsSync(path.join(root, '.git'))) return listFiles(root, { max: 3000 });
  const rows = await git.statusMatrix({ fs, dir: root });
  return rows.filter(([, head, work, stage]) => work !== 0 && (head !== work || head !== stage || work === 2)).map(([f]) => f);
}

function scanText(text, file, extra = []) {
  const out = [];
  const lines = String(text).split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.length > 4000 || /nexora-allow-secret/.test(line)) return;
    for (const [rule, re] of RULES) {
      const m = re.exec(line);
      if (m) out.push({ file, line: i + 1, col: m.index + 1, rule, preview: line.slice(Math.max(0, m.index - 20), m.index).trim() + ' ' + mask(m[0]) });
    }
    for (const [key, value] of extra) {
      const at = line.indexOf(value);
      if (at >= 0) out.push({ file, line: i + 1, col: at + 1, rule: `Valeur de la variable protégée ${key}`, preview: mask(value) });
    }
  });
  return out;
}

async function scan(root, { files, vault } = {}) {
  const list = files && files.length ? files : await changedFiles(root);
  const extra = vault ? vault.secretValues(root) : [];
  const findings = [];
  let scanned = 0;
  for (const f of list) {
    const r = rel(root, path.resolve(root, f));
    if (SKIP.test(r) || r.startsWith('..')) continue;
    const abs = path.join(root, r);
    let st;
    try { st = fs.statSync(abs); } catch { continue; }
    if (!st.isFile() || st.size > 1.5e6 || !isTextFile(abs)) continue;
    scanned += 1;
    findings.push(...scanText(fs.readFileSync(abs, 'utf8'), r, extra));
    if (findings.length > 200) break;
  }
  const envTracked = list.map((f) => rel(root, path.resolve(root, f))).filter((f) => /(^|\/)\.env(\.local|\.production|\.development)?$/.test(f));
  for (const f of envTracked) findings.unshift({ file: f, line: 1, col: 1, rule: 'Fichier de variables d’environnement prêt à être envoyé', preview: 'ajoute-le au .gitignore' });
  return { findings, scanned };
}

module.exports = { scan, scanText, changedFiles, RULES };
