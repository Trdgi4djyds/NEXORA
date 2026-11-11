'use strict';
/* NEXORA #052 : explorateur de bases de données : SQLite (intégré à NEXORA), Postgres (pilote téléchargé une
 * fois), Supabase (API REST du projet). Tables, colonnes, lignes, requêtes SQL et données de test. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { run, inside, listFiles, envFor } = require('./util');
const { parseDotenv } = require('./vault');

let sqliteMod;
const sqlite = () => {
  if (sqliteMod === undefined) { try { sqliteMod = require('node:sqlite'); } catch { sqliteMod = null; } }
  if (!sqliteMod) throw new Error('SQLite n’est pas disponible dans cette version de NEXORA.');
  return sqliteMod;
};
const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;

// Valeur de test d'après le nom et le type de la colonne.
const FIRST = ['Awa', 'Lucas', 'Fatou', 'Hugo', 'Inès', 'Moussa', 'Léa', 'Yao', 'Chloé', 'Kofi', 'Emma', 'Nadia'];
const LAST = ['Diallo', 'Martin', 'Koné', 'Bernard', 'Traoré', 'Dubois', 'Mensah', 'Laurent', 'Ndiaye', 'Petit'];
const WORDS = ['rapide', 'simple', 'projet', 'client', 'nouveau', 'commande', 'service', 'équipe', 'produit', 'idée', 'test', 'mise à jour'];
function fake(col, i) {
  const n = String(col.name).toLowerCase();
  const t = String(col.type || '').toLowerCase();
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  if (/uuid/.test(t) || n === 'uuid') return crypto.randomUUID();
  if (/mail/.test(n)) return `${pick(FIRST).toLowerCase()}.${pick(LAST).toLowerCase()}${i}@exemple.com`;
  if (/(first|pr[eé]nom)/.test(n)) return pick(FIRST);
  if (/(last|nom_famille|surname)/.test(n)) return pick(LAST);
  if (/(name|nom|titre|title|label)/.test(n)) return /name|nom/.test(n) ? `${pick(FIRST)} ${pick(LAST)}` : `${pick(WORDS)} ${pick(WORDS)}`.replace(/^./, (c) => c.toUpperCase());
  if (/(phone|t[eé]l)/.test(n)) return `+225 07 ${String(10 + i).padStart(2, '0')} ${String(Math.floor(Math.random() * 90) + 10)} ${String(Math.floor(Math.random() * 90) + 10)}`;
  if (/(url|site|link|lien)/.test(n)) return `https://exemple.com/${i}`;
  if (/(bool)/.test(t) || /^(is_|has_|actif|active|enabled)/.test(n)) return Math.random() > 0.5;
  if (/(date|time|_at$|^at$)/.test(t + ' ' + n)) return new Date(Date.now() - Math.floor(Math.random() * 90) * 864e5).toISOString();
  if (/(price|prix|amount|montant|total)/.test(n)) return Math.round(Math.random() * 20000) / 100;
  if (/(int|serial|numeric|real|double|float|decimal)/.test(t)) return Math.floor(Math.random() * 1000);
  if (/json/.test(t)) return JSON.stringify({ exemple: true, n: i });
  return `${pick(WORDS)} ${i}`;
}

class Databases {
  constructor({ store, vault, dataDir }) { this.store = store; this.vault = vault; this.dataDir = dataDir; this.pgMod = null; }
  list(root) { return (this.store.get(root, 'databases', { items: [] }).items || []).map((c) => ({ ...c, secret: undefined, hasSecret: Boolean(c.secret) })); }
  raw(root, id) { const c = (this.store.get(root, 'databases', { items: [] }).items || []).find((x) => x.id === id); if (!c) throw new Error('Connexion introuvable.'); return c; }
  save(root, conn) {
    const d = this.store.get(root, 'databases', { items: [] });
    const id = conn.id || `db${Date.now().toString(36)}`;
    const prev = d.items.find((x) => x.id === id) || {};
    const item = { id, type: conn.type, name: conn.name || conn.type, file: conn.file || '', url: conn.url || '', secret: conn.secret ? this.vault.enc(conn.secret) : prev.secret || null };
    d.items = [...d.items.filter((x) => x.id !== id), item];
    this.store.set(root, 'databases', d);
    return this.list(root);
  }
  remove(root, id) { const d = this.store.get(root, 'databases', { items: [] }); d.items = d.items.filter((x) => x.id !== id); this.store.set(root, 'databases', d); return this.list(root); }
  // Bases repérées dans le projet : fichiers SQLite, DATABASE_URL, projet Supabase.
  detect(root) {
    const env = { ...Object.fromEntries(['.env', '.env.local'].flatMap((f) => { const p = path.join(root, f); return fs.existsSync(p) ? parseDotenv(fs.readFileSync(p, 'utf8')) : []; })), ...this.vault.envObject(root) };
    const out = listFiles(root, { max: 3000 }).filter((f) => /\.(sqlite3?|db)$/i.test(f)).slice(0, 10).map((f) => ({ type: 'sqlite', name: path.basename(f), file: f }));
    const pgUrl = env.DATABASE_URL || env.POSTGRES_URL || env.SUPABASE_DB_URL;
    if (pgUrl && /^postgres/.test(pgUrl)) out.push({ type: 'postgres', name: 'Base du projet (DATABASE_URL)', url: pgUrl.replace(/:[^:@/]+@/, ':••••@'), fromEnv: true });
    const sbUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL;
    if (sbUrl) out.push({ type: 'supabase', name: 'Projet Supabase', url: sbUrl, fromEnv: true });
    return out;
  }
  secretOf(root, c) {
    if (c.secret) return this.vault.dec(c.secret);
    const env = this.vault.envObject(root);
    if (c.type === 'postgres') return env.DATABASE_URL || env.POSTGRES_URL || env.SUPABASE_DB_URL || '';
    if (c.type === 'supabase') return env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';
    return '';
  }
  async pg() {
    if (this.pgMod) return this.pgMod;
    const dir = path.join(this.dataDir, 'devplus', 'pg');
    const mod = path.join(dir, 'node_modules', 'pg');
    if (!fs.existsSync(mod)) {
      fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(path.join(dir, 'package.json'))) fs.writeFileSync(path.join(dir, 'package.json'), '{"private":true}');
      const r = await run('npm', ['install', 'pg@8', '--no-audit', '--no-fund', '--omit=dev'], { cwd: dir, env: envFor(dir), timeout: 5 * 60 * 1000 });
      if (r.code) throw new Error('Téléchargement du pilote Postgres impossible : vérifie la connexion et que Node.js est installé (« Outils »).');
    }
    this.pgMod = require(mod);
    return this.pgMod;
  }
  async withPg(root, c, fn) {
    const { Client } = await this.pg();
    const cs = this.secretOf(root, c) || c.url;
    const client = new Client({ connectionString: cs, ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(cs) ? false : { rejectUnauthorized: false }, statement_timeout: 30000, connectionTimeoutMillis: 10000 });
    await client.connect();
    try { return await fn(client); } finally { await client.end().catch(() => {}); }
  }
  sqliteDb(root, c, readOnly = false) { const { DatabaseSync } = sqlite(); return new DatabaseSync(inside(root, c.file), { readOnly }); }
  async supa(root, c, p, opts = {}) {
    const key = this.secretOf(root, c);
    if (!key) throw new Error('Ajoute la clé du projet Supabase à la connexion (ou dans les variables protégées).');
    const r = await fetch(`${c.url.replace(/\/$/, '')}/rest/v1${p}`, { method: opts.method || 'GET', headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', prefer: opts.prefer || 'count=exact' }, body: opts.body ? JSON.stringify(opts.body) : undefined, signal: AbortSignal.timeout(20000) });
    const text = await r.text();
    if (!r.ok) throw new Error(`Supabase : ${(() => { try { return JSON.parse(text).message; } catch { return text.slice(0, 200); } })()}`);
    return { json: text ? JSON.parse(text) : null, range: r.headers.get('content-range') };
  }
  async tables(root, { id }) {
    const c = this.raw(root, id);
    if (c.type === 'sqlite') {
      const db = this.sqliteDb(root, c, true);
      try {
        return db.prepare("select name from sqlite_master where type in ('table','view') and name not like 'sqlite_%' order by name").all().map((t) => ({ name: t.name, columns: db.prepare(`pragma table_info(${ident(t.name)})`).all().map((x) => ({ name: x.name, type: x.type, pk: !!x.pk, nullable: !x.notnull })), count: db.prepare(`select count(*) as n from ${ident(t.name)}`).get().n }));
      } finally { db.close(); }
    }
    if (c.type === 'postgres') {
      return this.withPg(root, c, async (cl) => {
        const cols = (await cl.query("select table_schema, table_name, column_name, data_type, is_nullable from information_schema.columns where table_schema not in ('pg_catalog','information_schema') and table_schema not like 'pg_%' order by table_schema, table_name, ordinal_position")).rows;
        const map = new Map();
        for (const r of cols) { const k = r.table_schema === 'public' ? r.table_name : `${r.table_schema}.${r.table_name}`; if (!map.has(k)) map.set(k, []); map.get(k).push({ name: r.column_name, type: r.data_type, nullable: r.is_nullable === 'YES' }); }
        return [...map].map(([name, columns]) => ({ name, columns }));
      });
    }
    const { json } = await this.supa(root, c, '/');
    return Object.entries((json && json.definitions) || {}).map(([name, d]) => ({ name, columns: Object.entries(d.properties || {}).map(([n, p]) => ({ name: n, type: p.format || p.type, pk: /<pk\/>/.test(p.description || ''), nullable: !(d.required || []).includes(n) })) }));
  }
  async rows(root, { id, table, limit = 100, offset = 0 }) {
    const c = this.raw(root, id);
    limit = Math.max(1, Math.min(500, Number(limit) || 100));
    offset = Math.max(0, Number(offset) || 0);
    if (c.type === 'sqlite') {
      const db = this.sqliteDb(root, c, true);
      try { return { rows: db.prepare(`select * from ${ident(table)} limit ? offset ?`).all(limit, offset), total: db.prepare(`select count(*) as n from ${ident(table)}`).get().n }; } finally { db.close(); }
    }
    if (c.type === 'postgres') {
      const q = table.split('.').map(ident).join('.');
      return this.withPg(root, c, async (cl) => ({ rows: (await cl.query(`select * from ${q} limit ${limit} offset ${offset}`)).rows, total: Number((await cl.query(`select count(*) as n from ${q}`)).rows[0].n) }));
    }
    const { json, range } = await this.supa(root, c, `/${encodeURIComponent(table)}?select=*&limit=${limit}&offset=${offset}`);
    return { rows: json || [], total: range ? Number(range.split('/')[1]) || null : null };
  }
  async query(root, { id, sql }) {
    const c = this.raw(root, id);
    const t0 = Date.now();
    if (c.type === 'sqlite') {
      const db = this.sqliteDb(root, c);
      try {
        const st = db.prepare(sql);
        if (/^\s*(select|pragma|with|explain)\b/i.test(sql)) { const rows = st.all(); return { rows: rows.slice(0, 1000), total: rows.length, ms: Date.now() - t0 }; }
        const r = st.run();
        return { rows: [], changes: Number(r.changes), ms: Date.now() - t0 };
      } finally { db.close(); }
    }
    if (c.type === 'postgres') return this.withPg(root, c, async (cl) => { const r = await cl.query(sql); return { rows: (r.rows || []).slice(0, 1000), total: r.rowCount, changes: r.command !== 'SELECT' ? r.rowCount : undefined, ms: Date.now() - t0 }; });
    throw new Error('Les requêtes SQL ne passent pas par l’API d’un projet Supabase : parcours les tables, ou ajoute une connexion Postgres avec l’adresse de la base.');
  }
  async seed(root, { id, table, count = 10 }) {
    const c = this.raw(root, id);
    count = Math.max(1, Math.min(500, Number(count) || 10));
    const t = (await this.tables(root, { id })).find((x) => x.name === table);
    if (!t) throw new Error('Table introuvable.');
    const cols = t.columns.filter((x) => !(x.pk && /int|serial/i.test(x.type || 'integer')) && !/^(id|created_at|updated_at)$/.test(x.name) || (x.pk && /uuid|text/i.test(x.type || '')));
    const rows = Array.from({ length: count }, (_, i) => Object.fromEntries(cols.map((x) => [x.name, fake(x, i + 1)])));
    if (c.type === 'sqlite') {
      const db = this.sqliteDb(root, c);
      try {
        const st = db.prepare(`insert into ${ident(table)} (${cols.map((x) => ident(x.name)).join(',')}) values (${cols.map(() => '?').join(',')})`);
        db.exec('begin');
        for (const r of rows) st.run(...cols.map((x) => (typeof r[x.name] === 'boolean' ? Number(r[x.name]) : r[x.name])));
        db.exec('commit');
      } catch (e) { try { db.exec('rollback'); } catch { /* rien à annuler */ } throw e; } finally { db.close(); }
    } else if (c.type === 'postgres') {
      const q = table.split('.').map(ident).join('.');
      await this.withPg(root, c, async (cl) => {
        await cl.query('begin');
        try { for (const r of rows) await cl.query(`insert into ${q} (${cols.map((x) => ident(x.name)).join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')})`, cols.map((x) => r[x.name])); await cl.query('commit'); } catch (e) { await cl.query('rollback'); throw e; }
      });
    } else await this.supa(root, c, `/${encodeURIComponent(table)}`, { method: 'POST', body: rows, prefer: 'return=minimal' });
    return { inserted: rows.length };
  }
}

module.exports = { Databases, fake };
