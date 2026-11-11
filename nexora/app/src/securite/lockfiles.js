'use strict';
/* NEXORA #048 — Lecture des fichiers de dépendances verrouillées et motifs de secrets. Module autonome (aucune
 * dépendance, seulement fs et path) : il est aussi recopié tel quel dans le script d'audit des GitHub Actions
 * généré par NEXORA (src/securite/hook.js, ciFiles). */
const fs = require('fs');
const path = require('path');

const LOCKFILES = {
  'package-lock.json': 'npm', 'npm-shrinkwrap.json': 'npm', 'pnpm-lock.yaml': 'npm', 'yarn.lock': 'npm', 'bun.lock': 'npm',
  'requirements.txt': 'PyPI', 'poetry.lock': 'PyPI', 'Pipfile.lock': 'PyPI', 'uv.lock': 'PyPI',
  'composer.lock': 'Packagist', 'Gemfile.lock': 'RubyGems', 'go.sum': 'Go', 'Cargo.lock': 'crates.io',
  'pubspec.lock': 'Pub', 'packages.lock.json': 'NuGet',
};

function parseLock(name, text) {
  const out = [];
  const add = (n, v) => { if (n && v && /^[0-9a-zA-Z]/.test(v)) out.push([n, v.replace(/^v(?=\d)/, '')]); };
  try {
    if (name === 'package-lock.json' || name === 'npm-shrinkwrap.json') {
      const j = JSON.parse(text);
      if (j.packages) {
        for (const [k, v] of Object.entries(j.packages)) if (k && v && v.version && !v.link) add(v.name || k.replace(/^.*node_modules\//, ''), v.version);
      } else {
        const walk = (deps) => { for (const [k, v] of Object.entries(deps || {})) { if (v && v.version) add(k, v.version); walk(v && v.dependencies); } };
        walk(j.dependencies);
      }
    } else if (name === 'pnpm-lock.yaml') {
      const re = /^ {2}['"]?\/?((?:@[^/@\s'"]+\/)?[^@\s'"/()][^@\s'"()]*)[@/](\d[^:'"\s()]*)/gm;
      let m;
      while ((m = re.exec(text))) add(m[1], m[2]);
    } else if (name === 'yarn.lock') {
      const re = /^"?((?:@[^@\s"/]+\/)?[^@\s",]+)@[^\n]*:\n(?:[ \t]+[^\n]*\n)*?[ \t]+version:?\s+"?([^"\s]+)"?/gm;
      let m;
      while ((m = re.exec(text))) add(m[1], m[2]);
    } else if (name === 'bun.lock') {
      const re = /"((?:@[^@"/]+\/)?[^@"/]+)@(\d[^"]*)"/g;
      let m;
      while ((m = re.exec(text))) add(m[1], m[2]);
    } else if (name === 'requirements.txt') {
      for (const line of text.split(/\r?\n/)) {
        const m = /^\s*([A-Za-z0-9_.-]+)(?:\[[^\]]*\])?\s*==\s*([0-9][^\s;#]*)/.exec(line);
        if (m) add(m[1].toLowerCase(), m[2]);
      }
    } else if (name === 'poetry.lock' || name === 'uv.lock' || name === 'Cargo.lock') {
      const re = /\[\[package\]\]\s*\nname\s*=\s*"([^"]+)"\s*\nversion\s*=\s*"([^"]+)"/g;
      let m;
      while ((m = re.exec(text))) add(m[1], m[2]);
    } else if (name === 'Pipfile.lock') {
      const j = JSON.parse(text);
      for (const sec of ['default', 'develop']) for (const [k, v] of Object.entries(j[sec] || {})) if (v && v.version) add(k.toLowerCase(), String(v.version).replace(/^==/, ''));
    } else if (name === 'composer.lock') {
      const j = JSON.parse(text);
      for (const p of [...(j.packages || []), ...(j['packages-dev'] || [])]) add(p.name, String(p.version || ''));
    } else if (name === 'Gemfile.lock') {
      const specs = /^ {4}([a-zA-Z0-9_.-]+) \(([0-9][^)\s]*)\)/gm;
      let m;
      while ((m = specs.exec(text))) add(m[1], m[2].replace(/-[a-z].*$/, ''));
    } else if (name === 'go.sum') {
      for (const line of text.split(/\r?\n/)) {
        const m = /^(\S+) (v[^\s/]+)(?:\/go\.mod)? h1:/.exec(line);
        if (m) add(m[1], m[2].replace(/\+incompatible$/, ''));
      }
    } else if (name === 'pubspec.lock') {
      const re = /^ {2}([a-z0-9_]+):\n(?: {4}[^\n]*\n)*? {4}version: "([^"]+)"/gm;
      let m;
      while ((m = re.exec(text))) add(m[1], m[2]);
    } else if (name === 'packages.lock.json') {
      const j = JSON.parse(text);
      for (const fw of Object.values(j.dependencies || {})) for (const [k, v] of Object.entries(fw || {})) if (v && v.resolved) add(k, v.resolved);
    }
  } catch { /* fichier illisible : ignoré */ }
  const seen = new Set();
  return out.filter(([n, v]) => { const k = `${n}@${v}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', '.svelte-kit', 'vendor', '.venv', 'venv', 'env', '__pycache__', 'target', '.dart_tool', '.gradle', 'coverage', '.cache', '.turbo', '.vercel', '.netlify', 'Pods', '.idea', '.vscode', 'bin', 'obj', '.parcel-cache', 'storybook-static', '.expo', '.angular']);
const BIN_EXT = /\.(png|jpe?g|gif|webp|avif|ico|bmp|tiff?|psd|ai|sketch|fig|pdf|zip|rar|7z|gz|tgz|bz2|xz|mp3|mp4|m4a|webm|mov|avi|wav|ogg|flac|woff2?|ttf|otf|eot|exe|dll|so|dylib|bin|class|jar|apk|aab|dex|keystore|jks|p12|pfx|pyc|o|a|lib|wasm|lock|map|min\.js|sqlite|db)$/i;

// Parcourt un dossier de projet (dossiers lourds ignorés) ; renvoie les chemins relatifs.
function walk(dir, { max = 15000 } = {}) {
  const files = [];
  const stack = [''];
  while (stack.length && files.length < max) {
    const rel = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.git')) stack.push(r); } else if (e.isFile()) files.push(r);
      if (files.length >= max) break;
    }
  }
  return files;
}

// Motifs de secrets : [identifiant, libellé, expression, gravité].
const SECRETS = [
  ['aws', 'Clé d’accès AWS', /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g, 'critical'],
  ['github', 'Jeton GitHub', /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/g, 'critical'],
  ['stripe', 'Clé secrète Stripe', /\b(sk|rk)_live_[0-9A-Za-z]{20,}\b/g, 'critical'],
  ['stripe-test', 'Clé de test Stripe', /\bsk_test_[0-9A-Za-z]{20,}\b/g, 'low'],
  ['google', 'Clé d’API Google', /\bAIza[0-9A-Za-z_-]{35}\b/g, 'medium'],
  ['slack', 'Jeton Slack', /\bxox[abprs]-[0-9A-Za-z-]{10,}\b/g, 'high'],
  ['slack-hook', 'Webhook Slack', /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/]{20,}/g, 'medium'],
  ['discord-hook', 'Webhook Discord', /https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]{30,}/g, 'medium'],
  ['private-key', 'Clé privée', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/g, 'critical'],
  ['brevo', 'Clé Brevo', /\bx(?:keysib|smtpsib)-[0-9a-f]{64}-[0-9A-Za-z]{16}\b/g, 'critical'],
  ['openai', 'Clé OpenAI', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/g, 'critical'],
  ['anthropic', 'Clé Anthropic', /\bsk-ant-[A-Za-z0-9_-]{32,}\b/g, 'critical'],
  ['sendgrid', 'Clé SendGrid', /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g, 'critical'],
  ['twilio', 'Clé Twilio', /\bSK[0-9a-f]{32}\b/g, 'high'],
  ['supabase-pat', 'Jeton d’accès Supabase', /\bsbp_[0-9a-f]{40}\b/g, 'critical'],
  ['supabase-secret', 'Clé secrète Supabase', /\bsb_secret_[A-Za-z0-9_-]{20,}\b/g, 'critical'],
  ['npm', 'Jeton npm', /\bnpm_[A-Za-z0-9]{36}\b/g, 'critical'],
  ['mailgun', 'Clé Mailgun', /\bkey-[0-9a-f]{32}\b/g, 'high'],
  ['jwt', 'Jeton JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, 'jwt'],
  ['password', 'Mot de passe écrit dans le code', /\b(?:password|passwd|pwd|mot_de_passe|db_pass(?:word)?)\s*[:=]\s*["'][^"'\s]{6,}["']/gi, 'medium'],
  ['url-creds', 'Identifiants dans une adresse', /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|ftp):\/\/[^\s:@/"']+:[^\s@/"']{3,}@[^\s"']+/g, 'high'],
];
const PLACEHOLDER = /(x{4,}|your[_-]|<[^>]+>|\$\{|example|exemple|changeme|change_me|dummy|placeholder|test123|password123|\*{3,}|\.\.\.)/i;

function jwtRole(token) {
  try {
    const p = JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return p.role || (p.iss && /supabase/.test(p.iss) ? 'supabase' : '');
  } catch { return ''; }
}

// Secrets trouvés dans un texte : [{ id, label, sev, line, value }].
function findSecrets(text) {
  const hits = [];
  for (const [id, label, re, sev] of SECRETS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) && hits.length < 200) {
      const value = m[0];
      if (PLACEHOLDER.test(value) && id !== 'private-key') continue;
      let s = sev;
      let l = label;
      if (id === 'jwt') {
        const role = jwtRole(value);
        if (role !== 'service_role') continue; // une clé publique (anon) n'est pas un secret
        s = 'critical'; l = 'Clé de service Supabase (service_role)';
      }
      const line = text.slice(0, m.index).split('\n').length;
      hits.push({ id, label: l, sev: s, line, value });
    }
  }
  return hits;
}

module.exports = { LOCKFILES, parseLock, walk, SKIP_DIRS, BIN_EXT, SECRETS, findSecrets, jwtRole };
