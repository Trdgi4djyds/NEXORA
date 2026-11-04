'use strict';
/* NEXORA #015 — Sonde HTTP de la supervision : une connexion neuve par vérification, pour mesurer
 * chaque étape comme un premier visiteur (résolution DNS, connexion TCP, poignée de main TLS, premier
 * octet, transfert) et lire l'expiration du certificat sur la même connexion. Suit les redirections. */
const http = require('http');
const https = require('https');
const zlib = require('zlib');

const MAX_BODY = 10 * 1024 * 1024; // au-delà, le transfert est interrompu (page anormalement lourde)
const KEEP_BODY = 200000; // texte gardé pour chercher le mot-clé attendu

const chrome = (process.versions && process.versions.chrome) || '140.0.0.0';
const UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36 NEXORA-Supervision`;

// Message en français pour une erreur réseau de Node.
function reasonOf(err) {
  const code = (err && (err.code || (err.cause && err.cause.code))) || '';
  const msg = String((err && err.message) || err || '');
  if (code === 'ETIMEDOUT' || /timeout|aborted/i.test(msg)) return 'délai dépassé';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'nom de domaine introuvable (DNS)';
  if (code === 'ECONNREFUSED') return 'connexion refusée';
  if (code === 'ECONNRESET' || code === 'EPIPE') return 'connexion coupée par le serveur';
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return 'serveur injoignable';
  if (code === 'CERT_HAS_EXPIRED') return 'certificat expiré';
  if (/ERR_TLS_CERT_ALTNAME_INVALID/.test(code)) return 'certificat pour un autre domaine';
  if (/SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER|CERT_/.test(code)) return 'certificat non reconnu';
  if (/EPROTO|SSL|TLS/i.test(code + msg)) return 'erreur TLS';
  return 'injoignable';
}

function once(url, { timeout, wantBody, method }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const t0 = process.hrtime.bigint();
    const ms = () => Number(process.hrtime.bigint() - t0) / 1e6;
    const tm = { dns: null, tcp: null, tls: null, ttfb: null, dl: null };
    let tLookup = 0; let tConnect = 0; let tSecure = 0; let tResp = 0;
    let cert = null; let ip = '';
    let done = false;
    const fail = (err) => { if (!done) { done = true; clearTimeout(timer); req.destroy(); reject(err); } };
    const req = lib.request(u, {
      method,
      agent: false,
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8', 'accept-encoding': 'gzip, deflate, br', 'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8', 'cache-control': 'no-cache' },
      servername: u.hostname,
    });
    const timer = setTimeout(() => { const e = new Error('timeout'); e.code = 'ETIMEDOUT'; fail(e); }, timeout);
    req.on('socket', (s) => {
      s.once('lookup', (err, address) => { tLookup = ms(); if (address) ip = Array.isArray(address) ? address[0].address : address; });
      s.once('connect', () => { tConnect = ms(); if (!ip) ip = s.remoteAddress || ''; });
      s.once('secureConnect', () => {
        tSecure = ms();
        try {
          const c = s.getPeerCertificate();
          if (c && c.valid_to) cert = { days: Math.floor((new Date(c.valid_to) - Date.now()) / 86400000), issuer: (c.issuer && (c.issuer.O || c.issuer.CN)) || '', validTo: new Date(c.valid_to).getTime() };
        } catch { /* */ }
      });
    });
    req.on('error', fail);
    req.on('response', (res) => {
      tResp = ms();
      const chunks = [];
      let size = 0;
      res.on('data', (d) => {
        size += d.length;
        if (wantBody && chunks.reduce((s, c) => s + c.length, 0) < KEEP_BODY * 4) chunks.push(d);
        if (size > MAX_BODY) res.destroy();
      });
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        const total = ms();
        tm.dns = tLookup ? tLookup : 0;
        tm.tcp = tConnect ? Math.max(0, tConnect - (tLookup || 0)) : null;
        tm.tls = tSecure ? Math.max(0, tSecure - tConnect) : (u.protocol === 'https:' ? null : 0);
        tm.ttfb = Math.max(0, tResp - (tSecure || tConnect || 0));
        tm.dl = Math.max(0, total - tResp);
        let body = '';
        if (wantBody && chunks.length) {
          let buf = Buffer.concat(chunks);
          const enc = String(res.headers['content-encoding'] || '').toLowerCase();
          try {
            if (enc === 'gzip') buf = zlib.gunzipSync(buf, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
            else if (enc === 'deflate') buf = zlib.inflateSync(buf, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
            else if (enc === 'br') buf = zlib.brotliDecompressSync(buf, { finishFlush: zlib.constants.BROTLI_OPERATION_FLUSH });
          } catch { /* corps tronqué : on cherche dans ce qui a pu être décodé */ }
          body = buf.toString('utf8').slice(0, KEEP_BODY);
        }
        resolve({ status: res.statusCode, location: res.headers.location, ms: total, tm, size, ip, cert, body, httpVersion: res.httpVersion });
      };
      res.on('end', finish);
      res.on('close', finish);
      res.on('error', finish);
    });
    req.end();
  });
}

// Vérifie une adresse : renvoie le statut final, le temps total et le détail de chaque étape (cumulé sur
// les redirections). Rejette en cas d'erreur réseau (message en français dans `reason`).
async function probe(url, { timeout = 20000, keyword = '', method = 'GET', maxRedirects = 5 } = {}) {
  const sum = { dns: 0, tcp: 0, tls: 0, ttfb: 0, dl: 0 };
  const started = Date.now();
  let current = url;
  let r = null;
  let cert = null;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const left = timeout - (Date.now() - started);
    if (left <= 0) { const e = new Error('timeout'); e.code = 'ETIMEDOUT'; e.reason = reasonOf(e); throw e; }
    try {
      r = await once(current, { timeout: left, wantBody: Boolean(keyword), method });
    } catch (err) {
      err.reason = reasonOf(err);
      throw err;
    }
    for (const k of Object.keys(sum)) sum[k] += r.tm[k] || 0;
    if (r.cert && !cert) cert = r.cert;
    if (r.status >= 300 && r.status < 400 && r.location && hop < maxRedirects) { current = new URL(r.location, current).href; continue; }
    break;
  }
  const round = (v) => Math.round(v);
  return {
    status: r.status,
    ms: round(Date.now() - started),
    dns: round(sum.dns), tcp: round(sum.tcp), tls: round(sum.tls), ttfb: round(sum.ttfb), dl: round(sum.dl),
    size: r.size,
    ip: r.ip,
    http: r.httpVersion,
    finalUrl: current,
    cert,
    body: r.body,
  };
}

module.exports = { probe, reasonOf, UA };
