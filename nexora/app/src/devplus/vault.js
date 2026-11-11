'use strict';
/* NEXORA #052 : variables d'environnement d'un projet, chiffrées par Windows (safeStorage, DPAPI) et gardées
 * hors du projet. Injectées dans les scripts, tests, débogage et mises en ligne lancés par le Dev Lab. */
const fs = require('fs');
const path = require('path');
const { inside } = require('./util');

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.]*$/;
// Noms qui désignent presque toujours un secret.
const SECRET_HINT = /(SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|API_?KEY|ACCESS_?KEY|CREDENTIAL|DATABASE_URL|DSN|SERVICE_ROLE|CLIENT_SECRET|WEBHOOK)/i;

function parseDotenv(text) {
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      const dq = v.startsWith('"');
      v = v.slice(1, -1);
      if (dq) v = v.replace(/\\n/g, '\n').replace(/\\"/g, '"');
    } else v = v.replace(/\s+#.*$/, '');
    out.push([m[1], v]);
  }
  return out;
}
const dotenvValue = (v) => (/[\s#"'\\]/.test(v) || v === '' ? `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"` : v);

class Vault {
  constructor({ store, safeStorage }) { this.store = store; this.safe = safeStorage; }
  canEncrypt() { try { return Boolean(this.safe && this.safe.isEncryptionAvailable()); } catch { return false; } }
  load(root) { return this.store.get(root, 'env', { vars: {} }); }
  save(root, d) { this.store.set(root, 'env', d); }
  enc(value) {
    if (this.canEncrypt()) return { enc: this.safe.encryptString(String(value)).toString('base64') };
    return { plain: Buffer.from(String(value), 'utf8').toString('base64') };
  }
  dec(e) {
    if (!e) return '';
    if (e.enc) return this.safe.decryptString(Buffer.from(e.enc, 'base64'));
    return Buffer.from(e.plain || '', 'base64').toString('utf8');
  }
  // Liste sans les valeurs des secrets (masquées).
  list(root) {
    const d = this.load(root);
    const vars = Object.entries(d.vars).map(([key, v]) => {
      let value = '';
      try { value = this.dec(v); } catch { value = ''; }
      return { key, secret: !!v.secret, value: v.secret ? '' : value, preview: v.secret ? `${'•'.repeat(Math.min(12, Math.max(4, value.length)))}${value.length > 8 ? value.slice(-3) : ''}` : value, length: value.length, updated: v.updated || 0 };
    }).sort((a, b) => a.key.localeCompare(b.key));
    return { vars, encrypted: this.canEncrypt(), dotenv: ['.env', '.env.local', '.env.development'].filter((f) => fs.existsSync(path.join(root, f))) };
  }
  set(root, { key, value, secret }) {
    if (!KEY_RE.test(String(key || ''))) throw new Error('Nom de variable invalide : lettres, chiffres et « _ », sans commencer par un chiffre.');
    const d = this.load(root);
    d.vars[key] = { ...this.enc(value ?? ''), secret: secret == null ? SECRET_HINT.test(key) : Boolean(secret), updated: Date.now() };
    this.save(root, d);
    return this.list(root);
  }
  remove(root, key) { const d = this.load(root); delete d.vars[key]; this.save(root, d); return this.list(root); }
  reveal(root, key) { const d = this.load(root); if (!d.vars[key]) throw new Error('Variable introuvable.'); return this.dec(d.vars[key]); }
  envObject(root) {
    if (!root) return {};
    const out = {};
    const d = this.load(root);
    for (const [k, v] of Object.entries(d.vars || {})) { try { out[k] = this.dec(v); } catch { /* clé illisible sur ce PC */ } }
    return out;
  }
  secretValues(root) {
    const d = this.load(root);
    return Object.entries(d.vars || {}).filter(([, v]) => v.secret).map(([k, v]) => { try { return [k, this.dec(v)]; } catch { return [k, '']; } }).filter(([, v]) => v && v.length >= 6);
  }
  // .env.example : les noms, sans aucune valeur secrète.
  writeExample(root) {
    const d = this.load(root);
    const keys = Object.keys(d.vars).sort();
    for (const f of ['.env', '.env.local']) { const p = path.join(root, f); if (fs.existsSync(p)) for (const [k] of parseDotenv(fs.readFileSync(p, 'utf8'))) if (!keys.includes(k)) keys.push(k); }
    const lines = ['# Variables d’environnement du projet (générées par NEXORA).', '# Copie ce fichier en .env et remplis les valeurs. Ne mets jamais de vraie valeur ici.', ''];
    for (const k of keys) {
      const v = d.vars[k];
      const val = v && !v.secret ? this.dec(v) : '';
      lines.push(`${k}=${v && !v.secret && !SECRET_HINT.test(k) ? dotenvValue(val) : ''}`);
    }
    const file = inside(root, '.env.example');
    fs.writeFileSync(file, `${lines.join('\n')}\n`);
    return { file, count: keys.length };
  }
  // .env en clair, pour les outils qui ne lisent que ce fichier : ajouté au .gitignore.
  exportDotenv(root) {
    const d = this.load(root);
    const lines = ['# Généré par NEXORA à partir des variables protégées du projet. Ne pas envoyer sur un dépôt.'];
    for (const k of Object.keys(d.vars).sort()) lines.push(`${k}=${dotenvValue(this.dec(d.vars[k]))}`);
    fs.writeFileSync(inside(root, '.env'), `${lines.join('\n')}\n`);
    const gi = path.join(root, '.gitignore');
    const cur = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
    let ignored = false;
    if (!/^\.env(\s|$)/m.test(cur) && !/^\.env\*?$/m.test(cur)) { fs.writeFileSync(gi, `${cur}${cur && !cur.endsWith('\n') ? '\n' : ''}.env\n.env.local\n`); ignored = true; }
    return { count: Object.keys(d.vars).length, gitignoreUpdated: ignored };
  }
  importDotenv(root, file = '.env') {
    const p = inside(root, file);
    if (!fs.existsSync(p)) throw new Error(`${file} est introuvable dans le projet.`);
    const pairs = parseDotenv(fs.readFileSync(p, 'utf8'));
    const d = this.load(root);
    for (const [k, v] of pairs) d.vars[k] = { ...this.enc(v), secret: SECRET_HINT.test(k), updated: Date.now() };
    this.save(root, d);
    return { imported: pairs.length, ...this.list(root) };
  }
}

module.exports = { Vault, parseDotenv, SECRET_HINT };
