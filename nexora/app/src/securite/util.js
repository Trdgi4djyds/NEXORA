'use strict';
/* NEXORA #048 — Outils communs des audits de sécurité (domaine, pages, code, applications) : constats au même
 * format que l'audit d'origine (src/security.js : gravité, catégorie, titre, détail, correction), note sur 100,
 * requêtes avec délai, reconnaissance des adresses locales et du domaine enregistrable. */
const crypto = require('crypto');

const SEV = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

function collector() {
  const findings = [];
  const add = (sev, cat, title, detail, fix, extra) => {
    findings.push({ sev, cat, title, detail: detail || '', fix: fix || '', ...(extra || {}) });
  };
  return { findings, add };
}

// Même barème que l'audit d'origine : pénalités par gravité.
function finish(findings, extra = {}) {
  findings.sort((a, b) => SEV[b.sev] - SEV[a.sev]);
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) counts[f.sev] = (counts[f.sev] || 0) + 1;
  let score = 100 - (counts.critical * 25 + counts.high * 12 + counts.medium * 6 + counts.low * 2);
  score = Math.max(0, Math.min(100, score));
  return { score, counts, findings, at: Date.now(), ...extra };
}

// Clé stable d'un constat (les nombres changent d'un audit à l'autre : « 3 ressource(s)… »).
function findingKey(f) {
  const t = String(f.title || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
  return `${f.cat || ''}|${t}`;
}

function isLocalHost(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.vitrine') || h.endsWith('.nexora') || h.endsWith('.internal') || h.endsWith('.lan')) return true;
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return h.includes(':');
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
}

// Domaine enregistrable approché (eTLD+1) : suffit pour les enregistrements DNS de messagerie.
const SLD2 = new Set(['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'co.jp', 'ne.jp', 'or.jp', 'com.br', 'com.mx', 'com.ar', 'com.co', 'com.tr', 'co.za', 'co.in', 'co.kr', 'com.cn', 'com.hk', 'com.sg', 'com.tw', 'gouv.fr', 'asso.fr', 'co.ma', 'gov.ma', 'co.ci', 'com.ng', 'co.ke', 'com.eg', 'co.il', 'com.pl', 'co.id', 'com.my', 'com.ph', 'com.vn', 'gouv.ci', 'gouv.sn', 'com.tn']);
// Sous-domaines offerts par les plateformes d'hébergement (liste publique des suffixes, partie privée).
const PLATFORMS = ['workers.dev', 'pages.dev', 'github.io', 'gitlab.io', 'netlify.app', 'vercel.app', 'herokuapp.com', 'web.app', 'firebaseapp.com', 'azurewebsites.net', 'azurestaticapps.net', 'onrender.com', 'fly.dev', 'glitch.me', 'repl.co', 'replit.app', 'blogspot.com', 'wordpress.com', 'wixsite.com', 'myshopify.com', 'surge.sh', 'up.railway.app', 'deno.dev', 'netlify.com', 'appspot.com', 'cloudfront.net', 'amplifyapp.com', 'webflow.io', 'framer.website', 'carrd.co', 'ngrok.app', 'ngrok-free.app', 'trycloudflare.com'];
function platformOf(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/\.$/, '');
  return PLATFORMS.find((p) => h.endsWith(`.${p}`)) || '';
}
function registrable(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
  const parts = h.split('.').filter(Boolean);
  const plat = platformOf(h);
  if (plat) return parts.slice(-(plat.split('.').length + 1)).join('.');
  if (parts.length <= 2) return parts.join('.');
  const last2 = parts.slice(-2).join('.');
  return SLD2.has(last2) ? parts.slice(-3).join('.') : last2;
}

function withTimeout(ms) {
  return typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined;
}

// Requête qui ne lève jamais d'exception : { ok, status, headers, body, error }.
async function grab(fetchImpl, url, { method = 'GET', headers, body, timeout = 12000, max = 400000, redirect = 'follow' } = {}) {
  try {
    const r = await fetchImpl(url, { method, headers, body, redirect, signal: withTimeout(timeout) });
    let text = '';
    if (method !== 'HEAD') text = (await r.text().catch(() => '')).slice(0, max);
    const h = {};
    if (r.headers && typeof r.headers.forEach === 'function') r.headers.forEach((v, k) => { h[k.toLowerCase()] = v; });
    let setCookies = [];
    try { setCookies = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : []; } catch { setCookies = []; }
    return { ok: r.ok, status: r.status, headers: h, body: text, url: r.url || url, setCookies };
  } catch (e) {
    return { ok: false, status: 0, headers: {}, body: '', url, error: String((e && e.message) || e), setCookies: [] };
  }
}

// Valeur masquée d'un secret : on n'affiche jamais un secret en entier.
function mask(v) {
  const s = String(v || '');
  if (s.length <= 8) return `${s.slice(0, 2)}…`;
  return `${s.slice(0, 4)}…${s.slice(-2)}`;
}

const sha256b64 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('base64');
const uid = () => crypto.randomBytes(6).toString('hex');

// Petite file d'attente : n tâches en parallèle au plus.
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    while (i < items.length) {
      const k = i++;
      try { out[k] = await fn(items[k], k); } catch (e) { out[k] = { error: String((e && e.message) || e) }; }
    }
  });
  await Promise.all(workers);
  return out;
}

module.exports = { SEV, collector, finish, findingKey, isLocalHost, registrable, platformOf, grab, mask, sha256b64, uid, pool, withTimeout };
