'use strict';
/* NEXORA #048 — Types de vérification de la supervision en plus de la page web (src/supervision/probe.js) :
 *  - api : requête au choix (méthode, en-têtes, corps) et contrôle d'une valeur de la réponse JSON ;
 *  - tcp : ouverture d'un port (base de données, serveur de jeu, SMTP…) ;
 *  - dns : enregistrement attendu, et alerte quand il change ;
 *  - domain : date d'expiration du nom de domaine (RDAP), une fois par jour ;
 *  - journey : parcours enregistré (clics, saisies, vérifications) rejoué dans un navigateur caché ;
 * plus l'empreinte du contenu d'une page pour détecter une modification (défiguration). */
const net = require('net');
const dns = require('dns');
const crypto = require('crypto');

const timeout = (ms) => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined);

// En-têtes saisis « Nom: valeur », un par ligne.
function parseHeaders(text) {
  const h = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) h[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return h;
}

// Chemin simple dans un JSON : data.items[0].status, $.status, items.length.
function pick(obj, p) {
  const parts = String(p || '').replace(/^\$\.?/, '').replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur = obj;
  for (const k of parts) {
    if (cur == null) return undefined;
    if (k === 'length' && (Array.isArray(cur) || typeof cur === 'string')) return cur.length;
    cur = cur[k];
  }
  return cur;
}

function assertJson(body, path, op, expect) {
  let j;
  try { j = JSON.parse(body); } catch { return { ok: false, reason: 'réponse non JSON' }; }
  if (!path) return { ok: true };
  const v = pick(j, path);
  const sv = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  const e = String(expect ?? '');
  let ok;
  if (op === 'exists') ok = v !== undefined && v !== null;
  else if (op === 'contains') ok = sv.includes(e);
  else if (op === 'not') ok = sv !== e;
  else if (op === 'lt') ok = Number(v) < Number(e);
  else if (op === 'gt') ok = Number(v) > Number(e);
  else ok = sv === e;
  return { ok, value: sv.slice(0, 120), reason: ok ? '' : `${path} = ${sv.slice(0, 60) || 'absent'} (attendu ${op === 'exists' ? 'présent' : `${{ equals: '=', contains: 'contient', not: '≠', lt: '<', gt: '>' }[op] || '='} ${e}`})` };
}

async function api(e, fetchImpl) {
  const t0 = Date.now();
  const method = String(e.method || 'GET').toUpperCase();
  const headers = { 'user-agent': 'NEXORA-Supervision/1.1', accept: 'application/json, */*;q=0.5', ...parseHeaders(e.headers) };
  const init = { method, headers, redirect: 'follow', signal: timeout(20000) };
  if (e.body && !/^(GET|HEAD)$/.test(method)) { init.body = String(e.body); if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) headers['content-type'] = 'application/json'; }
  let r;
  try { r = await fetchImpl(e.url, init); } catch (err) { return { up: false, status: 0, ms: Date.now() - t0, reason: reasonOf(err) }; }
  const text = method === 'HEAD' ? '' : (await r.text().catch(() => '')).slice(0, 1000000);
  const ms = Date.now() - t0;
  const okStatus = e.expectStatus ? r.status === Number(e.expectStatus) : r.status < 400;
  if (!okStatus) return { up: false, status: r.status, ms, size: text.length, reason: `statut ${r.status}` };
  if (e.keyword && !text.includes(e.keyword)) return { up: false, status: r.status, ms, size: text.length, reason: 'mot-clé absent' };
  if (e.jsonPath || e.jsonOp === 'json') {
    const a = assertJson(text, e.jsonPath, e.jsonOp || 'equals', e.jsonExpect);
    return { up: a.ok, status: r.status, ms, size: text.length, value: a.value, reason: a.reason || '' };
  }
  return { up: true, status: r.status, ms, size: text.length, reason: '' };
}

function reasonOf(err) {
  const c = (err && (err.code || (err.cause && err.cause.code))) || '';
  const m = String((err && err.message) || err || '');
  if (/ENOTFOUND|EAI_AGAIN/.test(c) || /ENOTFOUND|getaddrinfo/.test(m)) return 'nom de domaine introuvable (DNS)';
  if (/ECONNREFUSED/.test(c) || /ECONNREFUSED/.test(m)) return 'connexion refusée';
  if (/ETIMEDOUT|ABORT|TimeoutError/i.test(c + m)) return 'délai dépassé';
  if (/ECONNRESET/.test(c + m)) return 'connexion coupée par le serveur';
  if (/CERT|SSL|TLS/i.test(c + m)) return 'erreur de certificat ou TLS';
  return m.slice(0, 120) || 'injoignable';
}

function tcp(e) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let host = String(e.host || '').trim();
    let port = Number(e.port) || 0;
    if (!host && e.url) { try { const u = new URL(e.url.includes('://') ? e.url : `tcp://${e.url}`); host = u.hostname; port = port || Number(u.port); } catch { /* */ } }
    if (!host || !port) { resolve({ up: false, status: 0, ms: 0, reason: 'adresse ou port manquant' }); return; }
    const s = net.connect({ host, port, timeout: 10000 });
    const done = (rec) => { try { s.destroy(); } catch { /* */ } resolve(rec); };
    s.once('connect', () => done({ up: true, status: 1, ms: Date.now() - t0, reason: '' }));
    s.once('timeout', () => done({ up: false, status: 0, ms: Date.now() - t0, reason: 'délai dépassé' }));
    s.once('error', (err) => done({ up: false, status: 0, ms: Date.now() - t0, reason: reasonOf(err) }));
  });
}

async function dnsCheck(e) {
  const t0 = Date.now();
  const host = String(e.host || e.url || '').replace(/^https?:\/\//, '').replace(/[/:].*$/, '');
  const type = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'CAA'].includes(String(e.recordType || 'A').toUpperCase()) ? String(e.recordType || 'A').toUpperCase() : 'A';
  let values = [];
  try {
    const r = await dns.promises.resolve(host, type);
    values = r.map((x) => (typeof x === 'string' ? x : Array.isArray(x) ? x.join('') : x.exchange ? `${x.priority} ${x.exchange}` : x.issue || x.iodef ? `${x.critical} ${x.issue ? `issue "${x.issue}"` : `iodef "${x.iodef}"`}` : JSON.stringify(x))).sort();
  } catch (err) {
    return { up: false, status: 0, ms: Date.now() - t0, reason: err.code === 'ENODATA' ? `aucun enregistrement ${type}` : reasonOf(err), values: [] };
  }
  const ms = Date.now() - t0;
  const expect = String(e.dnsExpect || '').trim();
  if (expect && !values.some((v) => v.includes(expect))) return { up: false, status: 1, ms, values, reason: `${type} = ${values.join(', ').slice(0, 80)} (attendu ${expect})` };
  return { up: true, status: 1, ms, values, reason: '' };
}

async function domainCheck(e, fetchImpl) {
  const t0 = Date.now();
  const host = String(e.host || e.url || '').replace(/^https?:\/\//, '').replace(/[/:].*$/, '').replace(/^www\./, '');
  const parts = host.split('.');
  const d = parts.slice(-2).join('.');
  try {
    const r = await fetchImpl(`https://rdap.org/domain/${encodeURIComponent(d)}`, { headers: { accept: 'application/rdap+json, application/json' }, redirect: 'follow', signal: timeout(15000) });
    const j = await r.json();
    const ev = (j.events || []).find((x) => /expir/i.test(x.eventAction || ''));
    const days = ev ? Math.floor((new Date(ev.eventDate) - Date.now()) / 86400000) : null;
    return { up: true, status: r.status, ms: Date.now() - t0, domainDays: days, reason: days == null ? 'date d’expiration non publiée' : '' };
  } catch (err) {
    return { up: true, status: 0, ms: Date.now() - t0, domainDays: null, reason: `lecture impossible (${reasonOf(err)})` };
  }
}

// Empreinte du texte visible d'une page (scripts, styles et nombres longs ignorés : horloges, jetons…).
function contentHash(html) {
  const text = String(html || '')
    .replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\d{3,}/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
  return { hash: crypto.createHash('sha1').update(text).digest('hex').slice(0, 16), size: text.length };
}

module.exports = { api, tcp, dnsCheck, domainCheck, contentHash, parseHeaders, pick, assertJson, reasonOf };
