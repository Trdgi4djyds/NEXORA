'use strict';
/* NEXORA #015 — Stockage de l'historique de la supervision, dans le dossier de l'utilisateur :
 *   supervision/sites/<id>/AAAA-MM-JJ.jsonl  une ligne par vérification (gardées RAW_DAYS jours) ;
 *   supervision/sites/<id>/hours.json        un agrégat par heure (gardés HOUR_DAYS jours).
 * Les 48 dernières heures restent en mémoire pour des tableaux de bord instantanés. */
const fs = require('fs');
const path = require('path');
const { hourAgg, HOUR } = require('./stats');

const RAW_DAYS = 31;
const HOUR_DAYS = 400;
const MEMORY_MS = 49 * HOUR;
const DAY = 24 * HOUR;

const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
const hourStart = (t) => Math.floor(t / HOUR) * HOUR;

class SiteStore {
  constructor(root, now = Date.now) {
    this.root = path.join(root, 'sites');
    this.now = now;
    this.mem = new Map(); // id → vérifications des 48 dernières heures (ordre chronologique)
    this.hoursCache = new Map(); // id → agrégats horaires
    this.dayCache = new Map(); // `${id}/${jour}` → vérifications d'un jour terminé (lecture seule)
    this.saveT = new Map();
  }

  dir(id) { return path.join(this.root, String(id).replace(/[^\w-]/g, '_')); }

  readDay(id, key) {
    const today = dayKey(this.now());
    const ck = `${id}/${key}`;
    if (key !== today && this.dayCache.has(ck)) return this.dayCache.get(ck);
    let list = [];
    try {
      const txt = fs.readFileSync(path.join(this.dir(id), `${key}.jsonl`), 'utf8');
      for (const line of txt.split('\n')) { if (line) { try { list.push(JSON.parse(line)); } catch { /* ligne tronquée */ } } }
    } catch { list = []; }
    if (key !== today) {
      this.dayCache.set(ck, list);
      if (this.dayCache.size > 64) this.dayCache.delete(this.dayCache.keys().next().value);
    }
    return list;
  }

  // Vérifications des 48 dernières heures (chargées depuis les fichiers au premier appel).
  recent(id) {
    if (!this.mem.has(id)) {
      const now = this.now();
      const from = now - MEMORY_MS;
      const list = [];
      for (let t = from; dayKey(t) <= dayKey(now); t += DAY) list.push(...this.readDay(id, dayKey(t)).filter((r) => r.at >= from));
      // Un jour peut être lu deux fois si la boucle déborde : on retire les doublons.
      const seen = new Set();
      this.mem.set(id, list.filter((r) => (seen.has(r.at) ? false : seen.add(r.at))).sort((a, b) => a.at - b.at));
    }
    return this.mem.get(id);
  }

  // Vérifications d'une période quelconque (mémoire si possible, sinon fichiers du jour).
  raw(id, from, to) {
    const now = this.now();
    if (from >= now - MEMORY_MS + 60000) return this.recent(id).filter((r) => r.at >= from && r.at < to);
    const out = [];
    const keys = new Set();
    for (let t = from; t < to + DAY; t += DAY) keys.add(dayKey(Math.min(t, to)));
    for (const k of [...keys].sort()) for (const r of this.readDay(id, k)) if (r.at >= from && r.at < to) out.push(r);
    return out.sort((a, b) => a.at - b.at);
  }

  append(id, rec) {
    const list = this.recent(id);
    const prev = list[list.length - 1];
    list.push(rec);
    const cut = rec.at - MEMORY_MS;
    while (list.length && list[0].at < cut) list.shift();
    try {
      fs.mkdirSync(this.dir(id), { recursive: true });
      fs.appendFileSync(path.join(this.dir(id), `${dayKey(rec.at)}.jsonl`), `${JSON.stringify(rec)}\n`);
    } catch { /* disque plein ou dossier protégé : la mémoire garde les mesures */ }
    if (prev && hourStart(prev.at) !== hourStart(rec.at)) this.rollup(id);
  }

  hours(id) {
    if (!this.hoursCache.has(id)) {
      let list = [];
      try { list = JSON.parse(fs.readFileSync(path.join(this.dir(id), 'hours.json'), 'utf8')); } catch { list = []; }
      this.hoursCache.set(id, Array.isArray(list) ? list : []);
    }
    return this.hoursCache.get(id);
  }

  // Calcule les agrégats des heures terminées qui manquent encore (après une fermeture de NEXORA, on
  // repart des fichiers du jour).
  rollup(id) {
    const hours = this.hours(id);
    const current = hourStart(this.now());
    const last = hours.length ? hours[hours.length - 1].t : null;
    const from = last != null ? last + HOUR : current - RAW_DAYS * DAY;
    if (from >= current) return;
    const recs = this.raw(id, from, current);
    if (!recs.length) return;
    const byHour = new Map();
    for (const r of recs) {
      const h = hourStart(r.at);
      if (!byHour.has(h)) byHour.set(h, []);
      byHour.get(h).push(r);
    }
    for (const h of [...byHour.keys()].sort((a, b) => a - b)) hours.push(hourAgg(byHour.get(h), h));
    const cut = current - HOUR_DAYS * DAY;
    while (hours.length && hours[0].t < cut) hours.shift();
    this.saveHours(id);
  }

  saveHours(id) {
    clearTimeout(this.saveT.get(id));
    this.saveT.set(id, setTimeout(() => this.flushHours(id), 1500));
  }

  flushHours(id) {
    clearTimeout(this.saveT.get(id));
    this.saveT.delete(id);
    try {
      fs.mkdirSync(this.dir(id), { recursive: true });
      fs.writeFileSync(path.join(this.dir(id), 'hours.json'), JSON.stringify(this.hours(id)));
    } catch { /* best effort */ }
  }

  flushAll() { for (const id of [...this.saveT.keys()]) this.flushHours(id); }

  // Agrégats horaires d'une période, heure en cours comprise (calculée à la volée).
  hourly(id, from, to) {
    this.rollup(id);
    const out = this.hours(id).filter((h) => h.t >= from && h.t < to);
    const current = hourStart(this.now());
    if (current < to) {
      const recs = this.recent(id).filter((r) => r.at >= current);
      if (recs.length) out.push(hourAgg(recs, current));
    }
    return out;
  }

  // Supprime les fichiers de vérifications trop anciens.
  prune(id) {
    const limit = dayKey(this.now() - RAW_DAYS * DAY);
    try {
      for (const f of fs.readdirSync(this.dir(id))) {
        const m = /^(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(f);
        if (m && m[1] < limit) fs.rmSync(path.join(this.dir(id), f), { force: true });
      }
    } catch { /* dossier absent */ }
  }

  remove(id) {
    clearTimeout(this.saveT.get(id));
    this.saveT.delete(id);
    this.mem.delete(id);
    this.hoursCache.delete(id);
    for (const k of [...this.dayCache.keys()]) if (k.startsWith(`${id}/`)) this.dayCache.delete(k);
    try { fs.rmSync(this.dir(id), { recursive: true, force: true }); } catch { /* */ }
  }

  // Reprise de l'ancien historique (monitor.json, 500 mesures au plus par site) au premier lancement.
  importLegacy(id, list) {
    if (!Array.isArray(list) || !list.length) return;
    if (fs.existsSync(this.dir(id))) return;
    const byDay = new Map();
    for (const r of list) {
      if (!r || !r.at) continue;
      const k = dayKey(r.at);
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(r);
    }
    try {
      fs.mkdirSync(this.dir(id), { recursive: true });
      for (const [k, recs] of byDay) fs.appendFileSync(path.join(this.dir(id), `${k}.jsonl`), recs.map((r) => JSON.stringify(r)).join('\n') + '\n');
    } catch { /* */ }
    this.mem.delete(id);
  }
}

module.exports = { SiteStore, RAW_DAYS, HOUR_DAYS, dayKey, hourStart };
