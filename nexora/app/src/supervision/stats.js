'use strict';
/* NEXORA #015 — Calculs de la supervision : percentiles, agrégats par tranche de temps, disponibilité
 * pondérée par la durée réellement surveillée, statistiques d'incidents (temps moyen de rétablissement,
 * temps moyen entre deux pannes). Fonctions pures, sans accès aux fichiers : utilisées par src/monitor.js. */

const PHASES = ['dns', 'tcp', 'tls', 'ttfb', 'dl'];
const HOUR = 3600000;

// Percentile d'une liste déjà triée (interpolation linéaire, comme Prometheus et k6).
function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Durée (en secondes) que représente une vérification : son intervalle, 300 s pour l'ancien historique.
const weight = (r) => Math.max(1, Number(r.iv) || 300);

// Agrégat fusionnable d'un ensemble de vérifications. Les percentiles sont exacts pour des vérifications
// brutes ; la fusion d'agrégats (heures → jours) les approche par une moyenne pondérée.
function aggregate(records, t = null) {
  const a = emptyAgg(t);
  const ms = [];
  for (const r of records) {
    const w = weight(r);
    a.n += 1;
    a.w += w;
    if (r.up) {
      a.up += 1;
      a.wUp += w;
      if (Number.isFinite(r.ms)) {
        ms.push(r.ms);
        a.sum += r.ms;
        a.min = a.min == null ? r.ms : Math.min(a.min, r.ms);
        a.max = a.max == null ? r.ms : Math.max(a.max, r.ms);
      }
      if (r.slow) a.slow += 1;
      for (const p of PHASES) if (Number.isFinite(r[p])) { a.ph[p][0] += r[p]; a.ph[p][1] += 1; }
    }
    const code = r.status ? String(r.status) : '0';
    a.codes[code] = (a.codes[code] || 0) + 1;
  }
  ms.sort((x, y) => x - y);
  a.lat = ms.length;
  a.p50 = quantile(ms, 0.5);
  a.p95 = quantile(ms, 0.95);
  a.p99 = quantile(ms, 0.99);
  return a;
}

function emptyAgg(t = null) {
  const ph = {};
  for (const p of PHASES) ph[p] = [0, 0];
  return { t, n: 0, up: 0, slow: 0, w: 0, wUp: 0, lat: 0, sum: 0, min: null, max: null, p50: null, p95: null, p99: null, ph, codes: {} };
}

function merge(list, t = null) {
  const a = emptyAgg(t);
  let q50 = 0; let q95 = 0; let q99 = 0;
  for (const b of list) {
    if (!b || !b.n) continue;
    a.n += b.n; a.up += b.up; a.slow += b.slow || 0; a.w += b.w; a.wUp += b.wUp; a.sum += b.sum; a.lat += b.lat || 0;
    if (b.min != null) a.min = a.min == null ? b.min : Math.min(a.min, b.min);
    if (b.max != null) a.max = a.max == null ? b.max : Math.max(a.max, b.max);
    if (b.lat) { q50 += (b.p50 || 0) * b.lat; q95 += (b.p95 || 0) * b.lat; q99 += (b.p99 || 0) * b.lat; }
    for (const p of PHASES) if (b.ph && b.ph[p]) { a.ph[p][0] += b.ph[p][0]; a.ph[p][1] += b.ph[p][1]; }
    for (const [c, k] of Object.entries(b.codes || {})) a.codes[c] = (a.codes[c] || 0) + k;
  }
  if (a.lat) { a.p50 = q50 / a.lat; a.p95 = q95 / a.lat; a.p99 = q99 / a.lat; }
  return a;
}

const round = (v, d = 0) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

// Point affichable d'un agrégat : disponibilité en %, latences en ms, phases moyennes.
function point(a) {
  const out = {
    t: a.t,
    n: a.n,
    fails: a.n - a.up,
    slow: a.slow,
    avail: a.w ? round((a.wUp / a.w) * 100, 3) : null,
    cov: a.w,
    avg: a.lat ? round(a.sum / a.lat) : null,
    min: round(a.min),
    max: round(a.max),
    p50: round(a.p50),
    p95: round(a.p95),
    p99: round(a.p99),
    codes: a.codes,
  };
  for (const p of PHASES) out[p] = a.ph[p][1] ? round(a.ph[p][0] / a.ph[p][1]) : null;
  return out;
}

// Découpe [from, to[ en `count` tranches et agrège chaque tranche. `items` : vérifications brutes
// (`at`) ou agrégats horaires (`t`, `hourly` vrai).
function buckets(items, from, to, count, hourly = false) {
  const step = Math.max(1, Math.ceil((to - from) / count));
  const groups = Array.from({ length: count }, () => []);
  for (const it of items) {
    const at = hourly ? it.t : it.at;
    if (at < from || at >= to) continue;
    const i = Math.min(count - 1, Math.floor((at - from) / step));
    groups[i].push(it);
  }
  return {
    step,
    points: groups.map((g, i) => point(hourly ? merge(g, from + i * step) : aggregate(g, from + i * step))),
  };
}

// Résumé d'une fenêtre entière.
function totals(items, from, to, hourly = false) {
  const inWin = items.filter((it) => { const at = hourly ? it.t : it.at; return at >= from && at < to; });
  return point(hourly ? merge(inWin, from) : aggregate(inWin, from));
}

// Agrégat d'une heure (stocké dans hours.json).
function hourAgg(records, t) {
  const a = aggregate(records, t);
  for (const k of ['p50', 'p95', 'p99', 'sum']) a[k] = round(a[k], 1);
  return a;
}

// Incidents d'une fenêtre : nombre, durée cumulée des pannes, temps moyen de rétablissement (MTTR) et
// temps moyen entre deux pannes (MTBF) sur le temps surveillé.
function incidentStats(incidents, from, to, coveredSec, now = Date.now()) {
  const inWin = incidents.filter((i) => i.start < to && (i.end == null || i.end > from));
  const downs = inWin.filter((i) => i.kind === 'down');
  let downtime = 0;
  for (const i of downs) downtime += Math.max(0, Math.min(to, i.end == null ? now : i.end) - Math.max(from, i.start));
  const closed = downs.filter((i) => i.end != null);
  const mttr = closed.length ? closed.reduce((s, i) => s + (i.end - i.start), 0) / closed.length : null;
  const observed = coveredSec != null ? coveredSec * 1000 : to - from;
  const mtbf = downs.length ? Math.max(0, observed - downtime) / downs.length : null;
  return {
    count: inWin.length,
    down: downs.length,
    open: inWin.filter((i) => i.end == null).length,
    downtime: Math.round(downtime),
    mttr: mttr == null ? null : Math.round(mttr),
    mtbf: mtbf == null ? null : Math.round(mtbf),
  };
}

module.exports = { PHASES, HOUR, quantile, aggregate, merge, point, buckets, totals, hourAgg, incidentStats, round };
