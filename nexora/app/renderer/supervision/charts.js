// NEXORA #015 : graphiques des tableaux de bord de la supervision. SVG écrit à la main (aucune
// bibliothèque ni ressource externe : la politique de sécurité de la page reste inchangée), couleurs et
// textes tirés des variables du thème, infobulle au survol, séries masquables depuis la légende.
import { esc, num } from './fmt.js';

function niceStep(range, count) {
  const raw = range / Math.max(1, count);
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function yScale(min, max, count) {
  if (!(max > min)) max = min + 1;
  const step = niceStep(max - min, count);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step - 1e-9) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { lo, hi: hi > lo ? hi : lo + step, ticks };
}

const TIME_STEPS = [1e3, 2e3, 5e3, 10e3, 15e3, 30e3, 60e3, 120e3, 300e3, 600e3, 900e3, 1800e3, 3600e3, 7200e3, 10800e3, 21600e3, 43200e3, 86400e3, 172800e3, 604800e3, 1209600e3, 2592000e3];

function timeTicks(from, to, width, elapsed) {
  const span = Math.max(1, to - from);
  const target = Math.max(2, Math.floor(width / 92));
  const step = TIME_STEPS.find((s) => span / s <= target) || TIME_STEPS[TIME_STEPS.length - 1];
  const ticks = [];
  if (elapsed) {
    for (let t = from; t <= to; t += step) ticks.push(t);
  } else {
    // Graduations alignées sur l'heure locale (minuit pour les jours).
    const tz = new Date(from).getTimezoneOffset() * 60000;
    for (let t = Math.ceil((from - tz) / step) * step + tz; t <= to; t += step) ticks.push(t);
  }
  return { step, ticks };
}

function timeLabel(t, step, from, elapsed) {
  if (elapsed) {
    const s = Math.round((t - from) / 1000);
    return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60}` : ''}`;
  }
  const d = new Date(t);
  if (step >= 86400e3) return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  if (d.getHours() === 0 && d.getMinutes() === 0 && step >= 3600e3) return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', ...(step < 60e3 ? { second: '2-digit' } : {}) });
}

export function tipTime(t, step, from, elapsed) {
  if (elapsed) return `à ${timeLabel(t, 1000, from, true)}`;
  const d = new Date(t);
  const day = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', ...(step && step < 60e3 ? { second: '2-digit' } : {}) });
  if (step && step >= 3600e3) {
    const e = new Date(t + step);
    return step >= 86400e3 ? day : `${day}, ${hm} – ${e.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  return `${day}, ${hm}`;
}

// Graphique temporel : lignes, aires, aires empilées et barres, sur un ou deux axes.
export class Chart {
  constructor(el, opts) {
    this.el = el;
    this.opts = opts;
    this.hidden = new Set(opts.hidden || []);
    el.classList.add('sup-chart');
    this.ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (this.el.clientWidth !== this.w) this.render(); }) : null;
    if (this.ro) this.ro.observe(el);
    this.render();
  }

  update(opts) { this.opts = { ...this.opts, ...opts }; this.render(); }

  destroy() { if (this.ro) this.ro.disconnect(); }

  render() {
    const o = this.opts;
    const el = this.el;
    const W = Math.max(240, el.clientWidth || 600);
    this.w = el.clientWidth;
    const H = o.height || 200;
    const all = (o.series || []).filter((s) => s.points && s.points.length);
    const vis = all.filter((s) => !this.hidden.has(s.id || s.name));
    const legend = o.legend !== false && all.length > 1
      ? `<div class="sup-legend">${(o.series || []).map((s) => `<button type="button" class="${this.hidden.has(s.id || s.name) ? 'off' : ''}" data-series="${esc(s.id || s.name)}"><i style="background:${s.color}${s.dash ? ';height:2px' : ''}"></i>${esc(s.name)}</button>`).join('')}</div>`
      : '';
    const has = vis.some((s) => s.points.some((p) => p.v != null));
    if (!all.length || !has) {
      el.innerHTML = `${legend}<div class="sup-chart-empty" style="height:${H}px">${esc(o.empty || 'Pas encore de mesure sur cette période.')}</div>`;
      this.bindLegend();
      return;
    }
    // Domaine des abscisses.
    let from = o.from; let to = o.to;
    if (from == null || to == null) {
      const ts = all.flatMap((s) => s.points.map((p) => p.t));
      from = from == null ? Math.min(...ts) : from;
      to = to == null ? Math.max(...ts) : to;
      if (to <= from) to = from + 1000;
    }
    const step = o.step || 0;
    const barsInside = vis.some((s) => s.type === 'bar');
    const xTo = barsInside && step ? to : to;
    // Domaines des ordonnées (empilement compris).
    const left = vis.filter((s) => s.axis !== 'right');
    const right = vis.filter((s) => s.axis === 'right');
    const stackOf = (list) => {
      const st = list.filter((s) => s.type === 'stack');
      const base = new Map();
      const tops = new Map();
      for (const s of st) {
        const top = s.points.map((p) => { const b = base.get(p.t) || 0; const v = p.v == null ? null : b + p.v; if (v != null) base.set(p.t, v); return { t: p.t, v, b }; });
        tops.set(s, top);
      }
      return tops;
    };
    const stacks = new Map([...stackOf(left), ...stackOf(right)]);
    const maxOf = (list) => {
      let mx = 0; let mn = Infinity;
      const sb = new Map();
      for (const s of list.filter((x) => x.type === 'bar' && x.stack)) for (const p of s.points) if (p.v != null) { const v = (sb.get(p.t) || 0) + p.v; sb.set(p.t, v); mx = Math.max(mx, v); }
      for (const s of list) {
        const pts = stacks.get(s) || s.points;
        for (const p of pts) if (p.v != null) { mx = Math.max(mx, p.v); mn = Math.min(mn, p.v); }
      }
      return { mx, mn: mn === Infinity ? 0 : mn };
    };
    const lm = maxOf(left);
    for (const th of o.thresholds || []) if (th.value != null && o.thresholdInScale !== false) lm.mx = Math.max(lm.mx, th.value * 1.08);
    const ly = yScale(o.yMin != null ? o.yMin : Math.min(0, lm.mn), o.yMax != null ? o.yMax : lm.mx * 1.05 || 1, Math.max(2, Math.round(H / 55)));
    const rm = maxOf(right);
    const ry = right.length ? yScale(o.yMinRight != null ? o.yMinRight : 0, o.yMaxRight != null ? o.yMaxRight : rm.mx * 1.05 || 1, Math.max(2, Math.round(H / 55))) : null;
    const fmtL = o.yFmt || ((v) => num(v));
    const fmtR = o.yFmtRight || ((v) => num(v));
    const textW = (s) => String(s).length * 6.4 + 12;
    const padL = Math.max(28, ...ly.ticks.map((v) => textW(fmtL(v))));
    const padR = ry ? Math.max(28, ...ry.ticks.map((v) => textW(fmtR(v)))) : 12;
    const padT = 10; const padB = 24;
    const pw = W - padL - padR; const ph = H - padT - padB;
    const X = (t) => padL + ((t - from) / (xTo - from || 1)) * pw;
    const YL = (v) => padT + ph - ((v - ly.lo) / (ly.hi - ly.lo)) * ph;
    const YR = ry ? (v) => padT + ph - ((v - ry.lo) / (ry.hi - ry.lo)) * ph : YL;
    const yOf = (s) => (s.axis === 'right' ? YR : YL);
    let svg = `<svg class="sup-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label || 'Graphique')}">`;
    // Bandes (incidents, phases du test) derrière les données.
    for (const b of o.bands || []) {
      const x1 = Math.max(padL, X(b.from)); const x2 = Math.min(padL + pw, X(b.to));
      if (x2 > x1) svg += `<rect x="${x1}" y="${padT}" width="${Math.max(1.5, x2 - x1)}" height="${ph}" fill="${b.color}" opacity="${b.opacity || 0.1}"><title>${esc(b.label || '')}</title></rect>`;
    }
    for (const v of ly.ticks) svg += `<line class="grid" x1="${padL}" x2="${padL + pw}" y1="${YL(v)}" y2="${YL(v)}"/><text class="ylab" x="${padL - 8}" y="${YL(v) + 3.5}" text-anchor="end">${esc(fmtL(v))}</text>`;
    if (ry) for (const v of ry.ticks) svg += `<text class="ylab" x="${padL + pw + 8}" y="${YR(v) + 3.5}">${esc(fmtR(v))}</text>`;
    const tt = timeTicks(from, to, pw, o.elapsed);
    for (const t of tt.ticks) {
      const x = X(t);
      if (x < padL - 1 || x > padL + pw + 1) continue;
      svg += `<text class="xlab" x="${x}" y="${H - 6}" text-anchor="middle">${esc(timeLabel(t, tt.step, from, o.elapsed))}</text><line class="tick" x1="${x}" x2="${x}" y1="${padT + ph}" y2="${padT + ph + 4}"/>`;
    }
    svg += `<line class="axis" x1="${padL}" x2="${padL + pw}" y1="${padT + ph}" y2="${padT + ph}"/>`;
    // Données.
    const barSeries = vis.filter((s) => s.type === 'bar');
    const nBars = barSeries.length ? Math.max(...barSeries.map((s) => s.points.length)) : 0;
    const slot = nBars ? pw / nBars : 0;
    // Barres côte à côte, ou empilées (`stack` vrai) pour des comptes qui s'additionnent.
    const sideBySide = barSeries.filter((s) => !s.stack);
    const barBase = new Map();
    barSeries.forEach((s) => {
      const Y = yOf(s);
      const bi = s.stack ? 0 : sideBySide.indexOf(s);
      const bw = Math.max(1, (slot * 0.78) / (s.stack ? 1 : sideBySide.length || 1));
      for (const p of s.points) {
        if (p.v == null) continue;
        const x = (step ? X(p.t) : X(p.t) - slot / 2) + (slot * 0.11) + bi * bw;
        const b0 = s.stack ? barBase.get(p.t) || 0 : 0;
        if (s.stack) { if (!p.v) continue; barBase.set(p.t, b0 + p.v); }
        const y = Y(Math.max(b0 + p.v, ly.lo));
        const y0 = Y(Math.max(b0, ly.lo));
        const color = typeof s.colorOf === 'function' ? s.colorOf(p) : s.color;
        svg += `<rect x="${x.toFixed(1)}" y="${Math.min(y, y0 - 1).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, Math.abs(y0 - y)).toFixed(1)}" rx="${Math.min(2, bw / 3)}" fill="${color}"${p.opacity != null ? ` opacity="${p.opacity}"` : ''}/>`;
      }
    });
    const half = step ? step / 2 : 0; // points placés au milieu de leur tranche
    const pathOf = (pts, Y) => {
      let d = ''; let pen = false;
      for (const p of pts) {
        if (p.v == null) { pen = false; continue; }
        d += `${pen ? 'L' : 'M'}${X(p.t + half).toFixed(1)},${Y(p.v).toFixed(1)}`;
        pen = true;
      }
      return d;
    };
    const areaOf = (pts, Y, baseOf) => {
      let d = ''; let seg = [];
      const flush = () => {
        if (!seg.length) return;
        d += `M${X(seg[0].t + half).toFixed(1)},${Y(baseOf(seg[0])).toFixed(1)}`;
        for (const p of seg) d += `L${X(p.t + half).toFixed(1)},${Y(p.v).toFixed(1)}`;
        for (let i = seg.length - 1; i >= 0; i -= 1) d += `L${X(seg[i].t + half).toFixed(1)},${Y(baseOf(seg[i])).toFixed(1)}`;
        d += 'Z'; seg = [];
      };
      for (const p of pts) { if (p.v == null) flush(); else seg.push(p); }
      flush();
      return d;
    };
    for (const s of vis.filter((x) => x.type === 'stack' || x.type === 'area')) {
      const Y = yOf(s);
      const pts = stacks.get(s) || s.points;
      const base = (p) => (s.type === 'stack' ? p.b : Math.max(0, ly.lo));
      svg += `<path d="${areaOf(pts, Y, base)}" fill="${s.color}" opacity="${s.type === 'stack' ? 0.78 : 0.14}"/>`;
      if (s.type === 'area') svg += `<path d="${pathOf(pts, Y)}" fill="none" stroke="${s.color}" stroke-width="${s.width || 1.8}" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
    for (const s of vis.filter((x) => !x.type || x.type === 'line')) {
      const Y = yOf(s);
      const d = pathOf(s.points, Y);
      svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 1.8}" stroke-linejoin="round" stroke-linecap="round"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}/>`;
      // Point isolé (entouré de trous) : une ligne serait invisible.
      s.points.forEach((p, i) => { if (p.v != null && (s.points[i - 1] || {}).v == null && (s.points[i + 1] || {}).v == null) svg += `<circle cx="${X(p.t + half)}" cy="${Y(p.v)}" r="2.2" fill="${s.color}"/>`; });
    }
    for (const th of o.thresholds || []) {
      if (th.value == null || th.value > ly.hi) continue;
      const y = YL(th.value);
      svg += `<line class="thr" x1="${padL}" x2="${padL + pw}" y1="${y}" y2="${y}" stroke="${th.color || 'var(--bad-dot)'}"/><text class="thr-lab" x="${padL + pw - 4}" y="${y - 4}" text-anchor="end" fill="${th.color || 'var(--bad-dot)'}">${esc(th.label || '')}</text>`;
    }
    svg += `<line class="cross" x1="0" x2="0" y1="${padT}" y2="${padT + ph}" visibility="hidden"/><g class="dots"></g><rect class="hit" x="${padL}" y="${padT}" width="${pw}" height="${ph}" fill="transparent"/></svg>`;
    el.innerHTML = `${legend}<div class="sup-plot">${svg}<div class="sup-tip" hidden></div></div>`;
    this.bindLegend();
    this.geo = { X, yOf, padL, padT, pw, ph, from, to: xTo, half, step, stacks, vis, fmtL, fmtR, tt };
    this.bindHover();
  }

  bindLegend() {
    for (const b of this.el.querySelectorAll('[data-series]')) {
      b.onclick = () => {
        const id = b.dataset.series;
        if (this.hidden.has(id)) this.hidden.delete(id); else this.hidden.add(id);
        this.render();
      };
    }
  }

  bindHover() {
    const svg = this.el.querySelector('svg');
    const hit = svg && svg.querySelector('.hit');
    if (!hit) return;
    const tip = this.el.querySelector('.sup-tip');
    const cross = svg.querySelector('.cross');
    const dots = svg.querySelector('.dots');
    const g = this.geo;
    const o = this.opts;
    const ref = g.vis.reduce((a, s) => (s.points.length > a.points.length ? s : a), g.vis[0]);
    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const x = ev.clientX - r.left;
      const t = g.from + ((x - g.padL) / g.pw) * (g.to - g.from) - g.half;
      let best = null; let bd = Infinity;
      for (const p of ref.points) { const d = Math.abs(p.t - t); if (d < bd) { bd = d; best = p; } }
      if (!best) return;
      const cx = g.X(best.t + g.half);
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
      const rows = [];
      let dotsHtml = '';
      for (const s of g.vis) {
        const p = s.points.find((q) => q.t === best.t);
        if (!p) continue;
        const fmt = s.fmt || (s.axis === 'right' ? g.fmtR : g.fmtL);
        rows.push(`<div><i style="background:${typeof s.colorOf === 'function' ? s.colorOf(p) : s.color}"></i><span>${esc(s.name)}</span><b>${p.v == null ? '—' : esc(fmt(p.v, p))}</b></div>`);
        if (p.v != null && s.type !== 'bar') {
          const top = g.stacks.get(s) ? g.stacks.get(s).find((q) => q.t === best.t) : p;
          if (top && top.v != null) dotsHtml += `<circle cx="${cx}" cy="${g.yOf(s)(top.v)}" r="3.4" fill="${s.color}" stroke="var(--surface)" stroke-width="1.6"/>`;
        }
      }
      dots.innerHTML = dotsHtml;
      const extra = o.tipExtra ? o.tipExtra(best) : '';
      tip.innerHTML = `<header>${esc(tipTime(best.t, g.step, g.from, o.elapsed))}</header>${rows.join('')}${extra}`;
      tip.hidden = false;
      const tw = tip.offsetWidth;
      const left = cx + 14 + tw > r.width ? cx - tw - 14 : cx + 14;
      tip.style.left = `${Math.max(0, left)}px`;
      tip.style.top = `${g.padT}px`;
    };
    const leave = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); dots.innerHTML = ''; };
    hit.addEventListener('mousemove', move);
    hit.addEventListener('mouseleave', leave);
    if (o.onClick) hit.addEventListener('click', (ev) => { move(ev); const r = svg.getBoundingClientRect(); o.onClick(g.from + ((ev.clientX - r.left - g.padL) / g.pw) * (g.to - g.from)); });
  }
}

// Petite courbe pour les tableaux (valeurs négatives : échec, tracé en rouge).
export function spark(values, { w = 120, h = 28, color = 'var(--accent)', fill = true } = {}) {
  const v = values.filter((x) => x != null && x >= 0);
  if (!values.length || !v.length) return `<svg class="sup-spark" width="${w}" height="${h}"></svg>`;
  const mx = Math.max(...v, 1);
  const n = values.length;
  const X = (i) => (n === 1 ? w / 2 : (i / (n - 1)) * (w - 2) + 1);
  const Y = (x) => h - 2 - (x / mx) * (h - 5);
  let d = ''; let a = ''; let pen = false; let segStart = 0;
  let fails = '';
  values.forEach((x, i) => {
    if (x == null || x < 0) {
      if (x != null && x < 0) fails += `<rect x="${X(i) - 1}" y="1" width="2" height="${h - 2}" fill="var(--bad-dot)" opacity=".75"/>`;
      if (pen && fill) a += `L${X(i - 1).toFixed(1)},${h}L${X(segStart).toFixed(1)},${h}Z`;
      pen = false;
      return;
    }
    if (!pen) { segStart = i; a += `M${X(i).toFixed(1)},${h}`; }
    d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(x).toFixed(1)}`;
    a += `L${X(i).toFixed(1)},${Y(x).toFixed(1)}`;
    pen = true;
  });
  if (pen && fill) a += `L${X(n - 1).toFixed(1)},${h}L${X(segStart).toFixed(1)},${h}Z`;
  return `<svg class="sup-spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${fill ? `<path d="${a}" fill="${color}" opacity=".13"/>` : ''}<path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>${fails}</svg>`;
}

// Bandeau de disponibilité (une barre par tranche de temps).
export function statusBars(list, fmtTip) {
  return `<div class="sup-bars">${list.map((b) => {
    const cls = !b.n ? 'none' : b.fails ? (b.avail < 95 ? 'bad' : 'warn') : b.slow ? 'slow' : 'ok';
    return `<i class="${cls}" data-tip="${esc(fmtTip(b))}"></i>`;
  }).join('')}</div>`;
}

// Frise des incidents : une ligne par site, un bloc par incident.
export function timeline(lanes, from, to, fmtTip, colorOf) {
  const span = to - from || 1;
  const pos = (t) => Math.max(0, Math.min(100, ((t - from) / span) * 100));
  const tt = timeTicks(from, to, 700, false);
  const ticks = tt.ticks.map((t) => `<span style="left:${pos(t)}%">${esc(timeLabel(t, tt.step, from, false))}</span>`).join('');
  // Les incidents longs (certificat, erreurs de page) passent en bande fine sous les pannes et lenteurs,
  // dessinées par-dessus : un incident court reste visible.
  const minor = (i) => i.kind === 'cert' || i.kind === 'errors';
  return `<div class="sup-tl">${lanes.map((l) => `<div class="sup-tl-row"><span class="sup-tl-name" title="${esc(l.name)}">${esc(l.name)}</span><div class="sup-tl-track">${l.items.slice().sort((x, y) => Number(minor(y)) - Number(minor(x)) || ((y.end || to) - y.start) - ((x.end || to) - x.start)).map((i) => {
    const a = pos(i.start); const b = pos(i.end == null ? to : i.end);
    return `<button type="button" class="sup-tl-item ${i.end == null ? 'open' : ''} ${minor(i) ? 'minor' : ''}" data-incident="${esc(i.id)}" style="left:${a}%;width:max(4px, ${b - a}%);background:${colorOf(i)}" data-tip="${esc(fmtTip(i))}"></button>`;
  }).join('')}</div></div>`).join('')}<div class="sup-tl-axis"><span class="sup-tl-name"></span><div class="sup-tl-ticks">${ticks}</div></div></div>`;
}
