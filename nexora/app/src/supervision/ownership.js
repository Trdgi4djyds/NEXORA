'use strict';
/* NEXORA #048 — Un test de charge envoie des centaines de requêtes : NEXORA vérifie d'abord que le site
 * appartient à l'utilisateur. Preuve au choix : un fichier /.well-known/nexora-verify.txt contenant le jeton,
 * ou un enregistrement DNS TXT « nexora-verify=<jeton> » (sur le domaine ou sur _nexora.<domaine>). Les
 * adresses locales (localhost, réseau privé) n'ont pas besoin de preuve. Jeton propre à ce PC et au site. */
const fs = require('fs');
const path = require('path');
const dns = require('dns');
const crypto = require('crypto');

const timeout = (ms) => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined);

function isLocal(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.test') || h.endsWith('.example') || h.endsWith('.internal') || h === '::1' || h === '[::1]') return true;
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(h);
  if (!m) return false;
  const a = Number(m[1]); const b = Number(m[2]);
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

class Ownership {
  constructor(dir, fetchImpl) {
    this.file = path.join(dir, 'verification.json');
    this.fetch = fetchImpl;
    try { this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.data = {}; }
    if (!this.data.secret) { this.data.secret = crypto.randomBytes(16).toString('hex'); this.data.verified = {}; this.save(); }
    this.data.verified = this.data.verified || {};
  }

  save() { try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file, JSON.stringify(this.data)); } catch { /* */ } }

  host(url) { try { return new URL(/^https?:/i.test(url) ? url : `https://${url}`).hostname.toLowerCase(); } catch { return ''; } }

  token(host) { return crypto.createHash('sha256').update(`${this.data.secret}:${host}`).digest('hex').slice(0, 32); }

  status(url) {
    const host = this.host(url);
    const local = isLocal(host);
    const token = this.token(host);
    return { host, local, verified: local || Boolean(this.data.verified[host]), at: this.data.verified[host] || 0, token, file: `/.well-known/nexora-verify.txt`, fileUrl: `https://${host}/.well-known/nexora-verify.txt`, txt: `nexora-verify=${token}` };
  }

  async check(url) {
    const s = this.status(url);
    if (s.verified) return { ...s, method: s.local ? 'local' : 'déjà vérifié' };
    const tries = [];
    for (const u of [`https://${s.host}/.well-known/nexora-verify.txt`, `http://${s.host}/.well-known/nexora-verify.txt`]) {
      try {
        const r = await this.fetch(u, { redirect: 'follow', signal: timeout(10000) });
        const t = (await r.text()).slice(0, 2000);
        if (r.ok && t.includes(s.token)) return this.mark(s.host, 'fichier');
        tries.push(`fichier : ${r.status}`);
      } catch (e) { tries.push(`fichier : ${String(e.message || e).slice(0, 60)}`); }
    }
    const base = s.host.split('.').slice(-2).join('.');
    for (const name of [s.host, `_nexora.${s.host}`, base, `_nexora.${base}`]) {
      try {
        const recs = await dns.promises.resolveTxt(name);
        if (recs.some((r) => r.join('').includes(s.txt))) return this.mark(s.host, 'DNS');
      } catch { /* pas d'enregistrement */ }
    }
    tries.push('DNS : enregistrement TXT absent');
    return { ...s, verified: false, detail: tries.join(' · ') };
  }

  mark(host, method) {
    this.data.verified[host] = Date.now();
    this.save();
    return { ...this.status(host), method };
  }

  assert(urls) {
    for (const u of urls) {
      const s = this.status(u);
      if (!s.verified) throw new Error(`Vérifiez d’abord que ${s.host} vous appartient (fichier ou DNS) : un test de charge ne se lance que sur vos propres sites.`);
    }
  }
}

module.exports = { Ownership, isLocal };
