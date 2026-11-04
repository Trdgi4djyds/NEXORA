// NEXORA #011 : design vectoriel avancé de NEX-DESIGN.
// Édition des points, ciseaux, joindre, ouvrir/fermer, simplifier, lisser, décaler, contour vers tracé, diviser,
// déformations (enveloppes), dégradé de formes, répétition, symétrie, vectorisation, texte sur tracé, texte courbé, flèches.
import { Path, Group, IText, Textbox, FabricObject, Line, util, apply } from './fab.js';
import { nxPaper, nxToPaper } from '../../dist/chunks/design-WMWE74LA.js';
import { toast, uid, clamp, lerp, mixHex, makeCanvas, quantize, traceMask, smoothPathD, rdp, hexRgb } from '../core.js';

const f2 = (v) => Math.round(v * 100) / 100;
export const STYLE_KEYS = ['fill', 'stroke', 'strokeWidth', 'strokeDashArray', 'strokeLineCap', 'strokeLineJoin', 'opacity', 'shadow', 'globalCompositeOperation', 'fillRule', 'strokeUniform', 'nxFx', 'nxAnim', 'nxArrows', 'nxPattern', 'nxStyle'];
export function styleOf(o) {
  const s = {};
  for (const k of STYLE_KEYS) if (o[k] !== undefined) s[k] = o[k];
  if (s.strokeUniform === undefined) s.strokeUniform = true;
  return s;
}
// Remplace un calque par un autre au même rang (garde identifiant et nom).
export function replaceObj(D, old, neu, { keepName = true, select = true } = {}) {
  const c = D.canvas; const list = c.getObjects(); const i = list.indexOf(old);
  neu.id = old.id || uid();
  if (keepName) neu.name = old.name || D.typeName(old);
  D.loading = true;
  if (i >= 0) { c.remove(old); c.insertAt(i, neu); } else c.add(neu);
  D.loading = false;
  if (select) c.setActiveObject(neu);
  neu.setCoords();
  c.requestRenderAll();
  D.changed();
  return neu;
}
export const isShape = (o) => o && !['textbox', 'i-text', 'text', 'layer3d', 'image'].includes(o.type);

// ---------- Tracés : modèle de nœuds en coordonnées de la page ----------
// Nœud : point d'ancrage (x, y), poignée d'entrée (ix, iy) et de sortie (ox, oy).
export function toNodes(o) {
  const m = o.calcTransformMatrix(); const po = o.pathOffset || { x: 0, y: 0 };
  const T = (x, y) => apply(m, x - po.x, y - po.y);
  const subs = []; let cur = null;
  const add = (p, ix, iy) => { cur.nodes.push({ x: p.x, y: p.y, ix: ix ?? p.x, iy: iy ?? p.y, ox: p.x, oy: p.y }); };
  for (const seg of o.path || []) {
    const t = seg[0];
    if (t === 'M') { cur = { closed: false, nodes: [] }; subs.push(cur); add(T(seg[1], seg[2])); continue; }
    if (!cur) continue;
    const last = cur.nodes[cur.nodes.length - 1];
    if (t === 'L') add(T(seg[1], seg[2]));
    else if (t === 'C') { const c1 = T(seg[1], seg[2]); const c2 = T(seg[3], seg[4]); last.ox = c1.x; last.oy = c1.y; add(T(seg[5], seg[6]), c2.x, c2.y); }
    else if (t === 'Q') { const q = T(seg[1], seg[2]); const p = T(seg[3], seg[4]); last.ox = last.x + (q.x - last.x) * 2 / 3; last.oy = last.y + (q.y - last.y) * 2 / 3; add(p, p.x + (q.x - p.x) * 2 / 3, p.y + (q.y - p.y) * 2 / 3); }
    else if (t === 'Z' || t === 'z') {
      cur.closed = true;
      const a = cur.nodes[0]; const b = cur.nodes[cur.nodes.length - 1];
      if (cur.nodes.length > 1 && Math.hypot(a.x - b.x, a.y - b.y) < 0.01) { a.ix = b.ix; a.iy = b.iy; cur.nodes.pop(); }
    }
  }
  return subs.filter((s) => s.nodes.length);
}
const straight = (a, b) => Math.hypot(a.ox - a.x, a.oy - a.y) < 0.01 && Math.hypot(b.ix - b.x, b.iy - b.y) < 0.01;
export function nodesD(subs) {
  let d = '';
  for (const s of subs) {
    const n = s.nodes; if (!n.length) continue;
    d += `M ${f2(n[0].x)} ${f2(n[0].y)} `;
    const seg = (a, b) => (straight(a, b) ? `L ${f2(b.x)} ${f2(b.y)} ` : `C ${f2(a.ox)} ${f2(a.oy)} ${f2(b.ix)} ${f2(b.iy)} ${f2(b.x)} ${f2(b.y)} `);
    for (let i = 1; i < n.length; i++) d += seg(n[i - 1], n[i]);
    if (s.closed && n.length > 1) d += `${seg(n[n.length - 1], n[0])}Z `;
  }
  return d.trim();
}
// Convertit n'importe quel calque vectoriel en tracé « cuit » (sans rotation ni échelle).
export function bakeToPath(D, o) {
  let d = null;
  if (o.type === 'path') d = nodesD(toNodes(o));
  else if (o.type === 'line') {
    const m = o.calcTransformMatrix(); const p = o.calcLinePoints();
    const a = apply(m, p.x1, p.y1); const b = apply(m, p.x2, p.y2);
    d = `M ${f2(a.x)} ${f2(a.y)} L ${f2(b.x)} ${f2(b.y)}`;
  } else if (o.type === 'polyline' || o.type === 'polygon') {
    const m = o.calcTransformMatrix(); const po = o.pathOffset || { x: 0, y: 0 };
    d = o.points.map((p, i) => { const q = apply(m, p.x - po.x, p.y - po.y); return `${i ? 'L' : 'M'} ${f2(q.x)} ${f2(q.y)}`; }).join(' ') + (o.type === 'polygon' ? ' Z' : '');
  } else if (isShape(o)) {
    const p = nxToPaper(o);
    d = p && p.pathData;
  }
  if (!d) return null;
  const n = new Path(d, styleOf(o));
  if (o.type === 'line' || o.type === 'polyline') n.set('fill', '');
  return replaceObj(D, o, n);
}
function setPathD(o, d) {
  if (typeof o._setPath === 'function') { o._setPath(d, true); } else { const n = new Path(d); o.path = n.path; o.set({ width: n.width, height: n.height, pathOffset: n.pathOffset, left: n.left, top: n.top }); }
  o.setCoords(); o.dirty = true;
}
// Point d'une courbe de Bézier et découpe (de Casteljau).
function splitBez(a, b, t) {
  const P0 = [a.x, a.y]; const P1 = [a.ox, a.oy]; const P2 = [b.ix, b.iy]; const P3 = [b.x, b.y];
  const L = (p, q) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t)];
  const A = L(P0, P1); const B = L(P1, P2); const C = L(P2, P3); const AB = L(A, B); const BC = L(B, C); const M = L(AB, BC);
  return { a: { ...a, ox: A[0], oy: A[1] }, m: { x: M[0], y: M[1], ix: AB[0], iy: AB[1], ox: BC[0], oy: BC[1] }, b: { ...b, ix: C[0], iy: C[1] } };
}
function bezPt(a, b, t) {
  const u = 1 - t;
  return { x: u * u * u * a.x + 3 * u * u * t * a.ox + 3 * u * t * t * b.ix + t * t * t * b.x, y: u * u * u * a.y + 3 * u * u * t * a.oy + 3 * u * t * t * b.iy + t * t * t * b.y };
}
function nearestOnSubs(subs, p) {
  let best = { d: 1e9 };
  subs.forEach((s, si) => {
    const n = s.nodes; const cnt = s.closed ? n.length : n.length - 1;
    for (let i = 0; i < cnt; i++) {
      const a = n[i]; const b = n[(i + 1) % n.length];
      for (let k = 0; k <= 40; k++) { const t = k / 40; const q = bezPt(a, b, t); const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < best.d) best = { d, si, i, t }; }
    }
  });
  return best;
}

// ---------- Outil « Édition des points » ----------
export class NodeEditor {
  constructor(D) { this.D = D; this.obj = null; this.subs = []; this.sel = new Set(); this.drag = null; }
  get active() { return !!this.obj; }
  start(o) {
    const D = this.D;
    if (!o) { toast('Sélectionne d’abord une forme ou un tracé.', { kind: 'bad' }); return false; }
    if (['textbox', 'i-text', 'text'].includes(o.type)) { toast('Pour un texte, utilise d’abord « Vectoriser le texte » (panneau de droite).', { kind: 'bad' }); return false; }
    if (!isShape(o) || o.type === 'group') { toast('L’édition des points s’applique aux formes et aux tracés (pas aux images, groupes ni objets 3D).', { kind: 'bad' }); return false; }
    const p = o.type === 'path' && !o.angle && o.scaleX === 1 && o.scaleY === 1 && !o.flipX && !o.flipY && !o.skewX && !o.skewY ? o : bakeToPath(D, o);
    if (!p) return false;
    this.obj = p; this.subs = toNodes(p); this.sel.clear();
    D.canvas.discardActiveObject();
    for (const x of D.canvas.getObjects()) if (x.id !== '__board') { x.nxWasSel = x.selectable; x.selectable = false; x.evented = false; }
    D.canvas.selection = false; D.canvas.defaultCursor = 'crosshair';
    D.$.hint.hidden = false;
    D.$.hint.innerHTML = '<span>Édition des points : glisse un point ou une poignée · double-clic sur un trait pour ajouter un point · double-clic sur un point : lisse ou angle · Suppr : retirer · Alt : poignée libre · Entrée ou Échap pour terminer</span>';
    D.canvas.requestRenderAll();
    return true;
  }
  stop() {
    const D = this.D; if (!this.obj) return;
    for (const x of D.canvas.getObjects()) if (x.id !== '__board') { x.evented = !x.locked; x.selectable = !x.locked; delete x.nxWasSel; }
    D.canvas.selection = true; D.canvas.defaultCursor = 'default';
    D.$.hint.hidden = true;
    const o = this.obj; this.obj = null; this.sel.clear();
    if (D.canvas.getObjects().includes(o)) D.canvas.setActiveObject(o);
    D.canvas.requestRenderAll(); D.changed();
  }
  commit(final = false) {
    if (!this.obj) return;
    setPathD(this.obj, nodesD(this.subs));
    this.D.canvas.requestRenderAll();
    if (final) this.D.changed();
  }
  hit(p) {
    const z = this.D.canvas.getZoom(); const r = 7 / z;
    for (let si = 0; si < this.subs.length; si++) {
      const n = this.subs[si].nodes;
      for (let i = 0; i < n.length; i++) {
        const k = `${si}:${i}`;
        if (this.sel.has(k)) {
          if (Math.hypot(n[i].ix - p.x, n[i].iy - p.y) < r && Math.hypot(n[i].ix - n[i].x, n[i].iy - n[i].y) > 0.5) return { kind: 'in', si, i };
          if (Math.hypot(n[i].ox - p.x, n[i].oy - p.y) < r && Math.hypot(n[i].ox - n[i].x, n[i].oy - n[i].y) > 0.5) return { kind: 'out', si, i };
        }
        if (Math.hypot(n[i].x - p.x, n[i].y - p.y) < r) return { kind: 'node', si, i };
      }
    }
    return null;
  }
  down(p, e) {
    const h = this.hit(p);
    if (!h) {
      const near = nearestOnSubs(this.subs, p);
      if (near.d > 10 / this.D.canvas.getZoom()) { this.sel.clear(); this.drag = { kind: 'marquee', x0: p.x, y0: p.y, x1: p.x, y1: p.y }; }
      this.D.canvas.requestRenderAll();
      return;
    }
    const k = `${h.si}:${h.i}`;
    if (h.kind === 'node') { if (e.shiftKey) { this.sel.has(k) ? this.sel.delete(k) : this.sel.add(k); } else if (!this.sel.has(k)) { this.sel.clear(); this.sel.add(k); } }
    this.drag = { ...h, x: p.x, y: p.y, alt: e.altKey };
    this.D.canvas.requestRenderAll();
  }
  move(p) {
    const d = this.drag; if (!d) return;
    if (d.kind === 'marquee') { d.x1 = p.x; d.y1 = p.y; this.D.canvas.requestRenderAll(); return; }
    const dx = p.x - d.x; const dy = p.y - d.y; d.x = p.x; d.y = p.y; d.moved = true;
    if (d.kind === 'node') {
      for (const k of this.sel) { const [si, i] = k.split(':').map(Number); const n = this.subs[si].nodes[i]; n.x += dx; n.y += dy; n.ix += dx; n.iy += dy; n.ox += dx; n.oy += dy; }
    } else {
      const n = this.subs[d.si].nodes[d.i];
      const [hx, hy, ox, oy] = d.kind === 'in' ? ['ix', 'iy', 'ox', 'oy'] : ['ox', 'oy', 'ix', 'iy'];
      n[hx] += dx; n[hy] += dy;
      if (!d.alt && !n.corner) { const L = Math.hypot(n[ox] - n.x, n[oy] - n.y); const a = Math.atan2(n[hy] - n.y, n[hx] - n.x) + Math.PI; if (L > 0.01) { n[ox] = n.x + Math.cos(a) * L; n[oy] = n.y + Math.sin(a) * L; } }
    }
    this.commit();
  }
  up() {
    const d = this.drag; this.drag = null;
    if (d && d.kind === 'marquee') {
      const [x0, x1] = [Math.min(d.x0, d.x1), Math.max(d.x0, d.x1)]; const [y0, y1] = [Math.min(d.y0, d.y1), Math.max(d.y0, d.y1)];
      this.subs.forEach((s, si) => s.nodes.forEach((n, i) => { if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1) this.sel.add(`${si}:${i}`); }));
      this.D.canvas.requestRenderAll();
      return;
    }
    if (d && d.moved) this.commit(true);
  }
  dbl(p) {
    const h = this.hit(p);
    if (h && h.kind === 'node') {
      // Bascule angle / lisse.
      const s = this.subs[h.si]; const n = s.nodes[h.i];
      const flat = Math.hypot(n.ix - n.x, n.iy - n.y) < 0.5 && Math.hypot(n.ox - n.x, n.oy - n.y) < 0.5;
      if (flat) {
        const prev = s.nodes[(h.i - 1 + s.nodes.length) % s.nodes.length]; const next = s.nodes[(h.i + 1) % s.nodes.length];
        const vx = (next.x - prev.x) / 6; const vy = (next.y - prev.y) / 6;
        n.ix = n.x - vx; n.iy = n.y - vy; n.ox = n.x + vx; n.oy = n.y + vy; n.corner = false;
      } else { n.ix = n.x; n.iy = n.y; n.ox = n.x; n.oy = n.y; n.corner = true; }
      this.commit(true);
      return;
    }
    const near = nearestOnSubs(this.subs, p);
    if (near.d < 10 / this.D.canvas.getZoom()) {
      const s = this.subs[near.si]; const a = s.nodes[near.i]; const bi = (near.i + 1) % s.nodes.length; const b = s.nodes[bi];
      const r = splitBez(a, b, near.t);
      Object.assign(a, r.a); Object.assign(b, r.b);
      s.nodes.splice(near.i + 1, 0, r.m);
      this.sel.clear(); this.sel.add(`${near.si}:${near.i + 1}`);
      this.commit(true);
    }
  }
  // Ciseaux : coupe le tracé à l'endroit cliqué.
  cut(p) {
    const near = nearestOnSubs(this.subs, p);
    if (near.d > 12 / this.D.canvas.getZoom()) return false;
    const s = this.subs[near.si]; const a = s.nodes[near.i]; const bi = (near.i + 1) % s.nodes.length; const b = s.nodes[bi];
    const r = splitBez(a, b, near.t); Object.assign(a, r.a); Object.assign(b, r.b);
    const m1 = { ...r.m, ix: r.m.ix, iy: r.m.iy, ox: r.m.x, oy: r.m.y }; const m2 = { ...r.m, ix: r.m.x, iy: r.m.y };
    if (s.closed) {
      const order = [...s.nodes.slice(near.i + 1), ...s.nodes.slice(0, near.i + 1)];
      s.nodes = [m2, ...order, m1]; s.closed = false;
    } else {
      const left = [...s.nodes.slice(0, near.i + 1), m1]; const right = [m2, ...s.nodes.slice(near.i + 1)];
      s.nodes = left; this.subs.splice(near.si + 1, 0, { closed: false, nodes: right });
    }
    this.commit(true);
    return true;
  }
  removeSelected() {
    if (!this.sel.size) return;
    const keys = [...this.sel].map((k) => k.split(':').map(Number)).sort((a, b) => b[1] - a[1]);
    for (const [si, i] of keys) this.subs[si].nodes.splice(i, 1);
    this.subs = this.subs.filter((s) => s.nodes.length > 1);
    this.sel.clear();
    if (!this.subs.length) { const o = this.obj; this.stop(); this.D.canvas.remove(o); return; }
    this.commit(true);
  }
  nudge(dx, dy) {
    for (const k of this.sel) { const [si, i] = k.split(':').map(Number); const n = this.subs[si].nodes[i]; n.x += dx; n.y += dy; n.ix += dx; n.iy += dy; n.ox += dx; n.oy += dy; }
    this.commit(true);
  }
  draw(ctx) {
    if (!this.obj) return;
    const c = this.D.canvas; const v = c.viewportTransform; const R = c.getRetinaScaling();
    const S = (x, y) => [(x * v[0] + v[4]), (y * v[3] + v[5])];
    ctx.save(); ctx.setTransform(R, 0, 0, R, 0, 0);
    ctx.lineWidth = 1; ctx.strokeStyle = '#6a4cff';
    // Contour du tracé.
    ctx.beginPath();
    for (const s of this.subs) {
      const n = s.nodes; const [x, y] = S(n[0].x, n[0].y); ctx.moveTo(x, y);
      const seg = (a, b) => { const p1 = S(a.ox, a.oy); const p2 = S(b.ix, b.iy); const p = S(b.x, b.y); ctx.bezierCurveTo(p1[0], p1[1], p2[0], p2[1], p[0], p[1]); };
      for (let i = 1; i < n.length; i++) seg(n[i - 1], n[i]);
      if (s.closed) seg(n[n.length - 1], n[0]);
    }
    ctx.stroke();
    this.subs.forEach((s, si) => s.nodes.forEach((n, i) => {
      const on = this.sel.has(`${si}:${i}`); const [x, y] = S(n.x, n.y);
      if (on) {
        for (const [hx, hy] of [[n.ix, n.iy], [n.ox, n.oy]]) {
          if (Math.hypot(hx - n.x, hy - n.y) < 0.5) continue;
          const [a, b] = S(hx, hy); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(a, b); ctx.stroke();
          ctx.beginPath(); ctx.arc(a, b, 3.5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
        }
      }
      ctx.fillStyle = on ? '#6a4cff' : '#fff'; ctx.fillRect(x - 4, y - 4, 8, 8); ctx.strokeRect(x - 4, y - 4, 8, 8);
      if (i === 0 && !s.closed) { ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke(); }
    }));
    const d = this.drag;
    if (d && d.kind === 'marquee') { const [a, b] = S(d.x0, d.y0); const [e, f] = S(d.x1, d.y1); ctx.setLineDash([4, 3]); ctx.strokeRect(Math.min(a, e), Math.min(b, f), Math.abs(e - a), Math.abs(f - b)); }
    ctx.restore();
  }
}

// ---------- Opérations sur les tracés ----------
const P = () => nxPaper();
function paperOf(o) { const p = nxToPaper(o); if (!p) throw new Error('Forme non convertible.'); return p; }
function fromPaper(D, src, item, extra = {}) {
  if (!item || !item.pathData) return null;
  const n = new Path(item.pathData, { ...styleOf(src), fillRule: 'evenodd', ...extra });
  return n;
}
function children(item) { return item.children ? item.children.filter((c) => c.segments) : [item]; }

export function simplify(D, o, tol = 2.5) {
  const p = paperOf(o); for (const c of children(p)) c.simplify(tol);
  return replaceObj(D, o, fromPaper(D, o, p));
}
export function smooth(D, o) {
  const p = paperOf(o); for (const c of children(p)) c.smooth({ type: 'continuous' });
  return replaceObj(D, o, fromPaper(D, o, p));
}
export function reverse(D, o) {
  const baked = o.type === 'path' ? o : bakeToPath(D, o);
  if (!baked) return null;
  const subs = toNodes(baked);
  for (const s of subs) { s.nodes.reverse(); for (const n of s.nodes) [n.ix, n.iy, n.ox, n.oy] = [n.ox, n.oy, n.ix, n.iy]; }
  return replaceObj(D, baked, new Path(nodesD(subs), styleOf(baked)));
}
// Points régulièrement espacés, avec la normale extérieure.
function sample(path, step) {
  const L = path.length; const n = Math.max(8, Math.min(1600, Math.round(L / step)));
  const out = [];
  for (let i = 0; i < (path.closed ? n : n + 1); i++) {
    const off = Math.min(L, (i / n) * L);
    const pt = path.getPointAt(off); const nm = path.getNormalAt(off);
    if (pt && nm) out.push([pt.x, pt.y, nm.x, nm.y]);
  }
  return out;
}
function offsetPath(path, d) {
  const pp = P();
  const pts = sample(path, Math.max(1, Math.abs(d) / 3));
  if (!pts.length) return null;
  // Sens de la normale : vers l'extérieur.
  const probe = pts[Math.floor(pts.length / 3)];
  const inside = path.closed && path.contains(new pp.Point(probe[0] + probe[2] * 0.5, probe[1] + probe[3] * 0.5));
  const s = inside ? -1 : 1;
  const poly = new pp.Path({ segments: pts.map(([x, y, nx, ny]) => [x + nx * d * s, y + ny * d * s]), closed: path.closed, insert: false });
  poly.simplify(0.4);
  if (path.closed) { try { const r = poly.resolveCrossings(); return r.reorient ? r.reorient(true, true) : r; } catch { return poly; } }
  return poly;
}
export function offset(D, o, d) {
  const p = paperOf(o); const pp = P();
  let res = null;
  for (const c of children(p)) {
    const r = offsetPath(c, d); if (!r) continue;
    res = res ? res.unite(r, { insert: false }) : r;
  }
  if (!res) return null;
  const n = fromPaper(D, o, res);
  n.name = `${o.name || D.typeName(o)} (décalé)`;
  D.canvas.add(n); D.canvas.setActiveObject(n); D.changed();
  void pp;
  return n;
}
export function outlineStroke(D, o) {
  const w = (o.strokeWidth || 0) * (o.strokeUniform ? 1 : Math.max(o.scaleX, o.scaleY));
  if (!o.stroke || w <= 0) { toast('Ce calque n’a pas de contour à convertir.', { kind: 'bad' }); return null; }
  const pp = P();
  let base;
  if (o.type === 'line') { const m = o.calcTransformMatrix(); const lp = o.calcLinePoints(); const a = apply(m, lp.x1, lp.y1); const b = apply(m, lp.x2, lp.y2); base = new pp.Path({ segments: [[a.x, a.y], [b.x, b.y]], insert: false }); } else {
    const tmp = o.type === 'path' ? o : null;
    base = tmp ? (() => { const n = new pp.CompoundPath({ pathData: nodesD(toNodes(tmp)), insert: false }); return n; })() : paperOf(o);
  }
  let res = null;
  for (const c of children(base)) {
    let ring;
    if (c.closed) { const outer = offsetPath(c, w / 2); const inner = offsetPath(c, -w / 2); ring = outer && inner ? outer.subtract(inner, { insert: false }) : outer; } else {
      const pts = sample(c, Math.max(1, w / 4));
      const left = pts.map(([x, y, nx, ny]) => [x + nx * w / 2, y + ny * w / 2]); const right = pts.map(([x, y, nx, ny]) => [x - nx * w / 2, y - ny * w / 2]).reverse();
      ring = new pp.Path({ segments: [...left, ...right], closed: true, insert: false }); ring.simplify(0.4);
      if (o.strokeLineCap === 'round') { const a = pts[0]; const b = pts[pts.length - 1]; ring = ring.unite(new pp.Path.Circle({ center: [a[0], a[1]], radius: w / 2, insert: false }), { insert: false }).unite(new pp.Path.Circle({ center: [b[0], b[1]], radius: w / 2, insert: false }), { insert: false }); }
    }
    if (ring) res = res ? res.unite(ring, { insert: false }) : ring;
  }
  if (!res) return null;
  const n = new Path(res.pathData, { fill: o.stroke, stroke: null, strokeWidth: 0, opacity: o.opacity, shadow: o.shadow, fillRule: 'nonzero' });
  n.name = `${o.name || D.typeName(o)} (contour)`;
  return replaceObj(D, o, n, { keepName: false });
}
// Diviser : découpe les formes qui se chevauchent en toutes leurs parties.
export function divide(D, list) {
  const shapes = list.filter(isShape);
  if (shapes.length < 2) { toast('Sélectionne au moins deux formes qui se chevauchent.', { kind: 'bad' }); return; }
  const objs = D.canvas.getObjects(); shapes.sort((a, b) => objs.indexOf(a) - objs.indexOf(b));
  let pieces = [];
  for (const s of shapes) {
    const p = paperOf(s); const next = [];
    for (const pc of pieces) {
      const i = pc.item.intersect(p, { insert: false }); const r = pc.item.subtract(p, { insert: false });
      if (i && Math.abs(i.area) > 1) next.push({ item: i, src: s });
      if (r && Math.abs(r.area) > 1) next.push({ item: r, src: pc.src });
    }
    let rest = p;
    for (const pc of pieces) rest = rest.subtract(pc.item, { insert: false });
    if (rest && Math.abs(rest.area) > 1) next.push({ item: rest, src: s });
    pieces = next;
  }
  const at = objs.indexOf(shapes[0]);
  D.canvas.discardActiveObject(); D.loading = true;
  for (const s of shapes) D.canvas.remove(s);
  const made = pieces.map((pc, k) => { const n = fromPaper(D, pc.src, pc.item); n.id = uid(); n.name = `Partie ${k + 1}`; D.canvas.insertAt(at + k, n); return n; });
  D.loading = false; D.selectList(made); D.changed();
  toast(`${made.length} parties créées.`);
}
export function toggleClosed(D, o) {
  const p = o.type === 'path' ? o : bakeToPath(D, o); if (!p) return;
  const subs = toNodes(p); const close = subs.some((s) => !s.closed);
  for (const s of subs) s.closed = close;
  setPathD(p, nodesD(subs)); if (close && !p.fill) p.set('fill', (D.shapeStyle && D.shapeStyle().fill) || '#6a4cff');
  D.canvas.requestRenderAll(); D.changed();
}
export function join(D, list) {
  const paths = list.filter(isShape);
  if (paths.length !== 2) { toast('Sélectionne exactement deux tracés ouverts à joindre.', { kind: 'bad' }); return; }
  const [A, B] = paths.map((o) => toNodes(o.type === 'path' ? o : (bakeToPath(D, o)))).map((s) => s[0]);
  if (!A || !B || A.closed || B.closed) { toast('Les deux tracés doivent être ouverts (utilise les ciseaux ou « Ouvrir »).', { kind: 'bad' }); return; }
  const ends = (s) => [s.nodes[0], s.nodes[s.nodes.length - 1]];
  const rev = (s) => { s.nodes.reverse(); for (const n of s.nodes) [n.ix, n.iy, n.ox, n.oy] = [n.ox, n.oy, n.ix, n.iy]; };
  const [a0, a1] = ends(A); const [b0, b1] = ends(B);
  const opts = [[a1, b0, 0], [a1, b1, 1], [a0, b0, 2], [a0, b1, 3]].map(([p, q, k]) => [Math.hypot(p.x - q.x, p.y - q.y), k]).sort((x, y) => x[0] - y[0]);
  const k = opts[0][1];
  if (k === 1) rev(B); if (k === 2) rev(A); if (k === 3) { rev(A); rev(B); }
  const merged = { closed: false, nodes: [...A.nodes, ...B.nodes] };
  const cur = D.sel().filter(isShape);
  const n = new Path(nodesD([merged]), styleOf(cur[0]));
  const at = D.canvas.getObjects().indexOf(cur[0]);
  D.canvas.discardActiveObject(); D.loading = true;
  for (const o of cur) D.canvas.remove(o);
  n.id = uid(); n.name = 'Tracé joint'; D.canvas.insertAt(at, n); D.loading = false;
  D.canvas.setActiveObject(n); D.changed();
}
// Séparer les sous-tracés en calques distincts.
export function separate(D, o) {
  const p = o.type === 'path' ? o : bakeToPath(D, o); const subs = toNodes(p);
  if (subs.length < 2) { toast('Ce tracé n’a qu’une seule partie.'); return; }
  const at = D.canvas.getObjects().indexOf(p); const st = styleOf(p);
  D.canvas.discardActiveObject(); D.loading = true; D.canvas.remove(p);
  const made = subs.map((s, i) => { const n = new Path(nodesD([s]), st); n.id = uid(); n.name = `${p.name || 'Tracé'} ${i + 1}`; D.canvas.insertAt(at + i, n); return n; });
  D.loading = false; D.selectList(made); D.changed();
}

function subdivide(sp, k) {
  const n = sp.nodes; const cnt = sp.closed ? n.length : n.length - 1;
  const out = n.map((x) => ({ ...x })); const res = [];
  for (let i = 0; i < n.length; i++) {
    if (i >= cnt) { res.push({ ...out[i] }); continue; }
    const bi = (i + 1) % n.length;
    let cur = { ...out[i] }; let b = { ...out[bi] }; const seq = [];
    for (let j = k; j > 1; j--) { const r = splitBez(cur, b, 1 / j); seq.push(r.a); cur = r.m; b = r.b; }
    seq.push(cur);
    out[bi] = { ...out[bi], ix: b.ix, iy: b.iy };
    seq[0].ix = out[i].ix; seq[0].iy = out[i].iy;
    res.push(...seq);
  }
  if (sp.closed && res.length) { res[0].ix = out[0].ix; res[0].iy = out[0].iy; }
  return { closed: sp.closed, nodes: res };
}
// ---------- Déformations (enveloppes) ----------
export const DISTORT = { arc: 'Arc', arch: 'Arche', wave: 'Vague', flag: 'Drapeau', bulge: 'Renflement', pinch: 'Compression', twist: 'Torsion', fisheye: 'Fish-eye' };
export function distort(D, o, kind, amount = 0.5) {
  const p = o.type === 'path' ? o : bakeToPath(D, o); if (!p) return null;
  let subs = toNodes(p);
  // Subdivision : chaque segment en 4 pour une déformation régulière.
  subs = subs.map((sp) => subdivide(sp, 4));
  let x0 = 1e9; let y0 = 1e9; let x1 = -1e9; let y1 = -1e9;
  for (const s of subs) for (const n of s.nodes) { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); }
  const w = Math.max(1, x1 - x0); const h = Math.max(1, y1 - y0); const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2; const A = amount;
  const f = (x, y) => {
    const u = (x - x0) / w; const v = (y - y0) / h;
    switch (kind) {
      case 'arc': return [x, y - A * h * 0.6 * (1 - (2 * u - 1) ** 2)];
      case 'arch': return [x, y - A * h * 0.6 * (1 - (2 * u - 1) ** 2) * (1 - v)];
      case 'wave': return [x, y + A * h * 0.25 * Math.sin(u * Math.PI * 2)];
      case 'flag': return [x, y + A * h * 0.25 * Math.sin(u * Math.PI * 2) * u];
      case 'bulge': { const k = 1 + A * 0.5 * Math.cos((v - 0.5) * Math.PI); return [cx + (x - cx) * k, y]; }
      case 'pinch': { const k = 1 - A * 0.6 * (1 - v); return [cx + (x - cx) * k, y]; }
      case 'twist': { const a = A * Math.PI * 0.5 * (v - 0.5); const dx = x - cx; const dy = y - cy; return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)]; }
      case 'fisheye': { const dx = (x - cx) / (w / 2); const dy = (y - cy) / (h / 2); const r = Math.hypot(dx, dy); const k = 1 + A * 0.6 * Math.max(0, 1 - r * r); return [cx + (x - cx) * k, cy + (y - cy) * k]; }
      default: return [x, y];
    }
  };
  for (const s of subs) for (const n of s.nodes) { [n.x, n.y] = f(n.x, n.y); [n.ix, n.iy] = f(n.ix, n.iy); [n.ox, n.oy] = f(n.ox, n.oy); }
  setPathD(p, nodesD(subs)); D.canvas.setActiveObject(p); D.canvas.requestRenderAll(); D.changed();
  return p;
}

// ---------- Dégradé de formes ----------
export async function blendShapes(D, list, steps = 6) {
  const sh = list.filter(isShape);
  if (sh.length !== 2) { toast('Sélectionne exactement deux formes pour créer le dégradé.', { kind: 'bad' }); return; }
  const objs = D.canvas.getObjects(); sh.sort((a, b) => objs.indexOf(a) - objs.indexOf(b));
  const [A, B] = sh; const pa = children(paperOf(A))[0]; const pb = children(paperOf(B))[0];
  const N = 120; const smp = (p) => Array.from({ length: N }, (_, i) => { const pt = p.getPointAt((i / N) * p.length); return [pt.x, pt.y]; });
  const sa = smp(pa); let sb = smp(pb);
  // Aligne le point de départ et le sens pour éviter les torsions.
  let best = [1e18, 0, false];
  for (const revd of [false, true]) {
    const s = revd ? [...sb].reverse() : sb;
    for (let o = 0; o < N; o += 2) { let d = 0; for (let i = 0; i < N; i += 6) { const q = s[(i + o) % N]; d += (sa[i][0] - q[0]) ** 2 + (sa[i][1] - q[1]) ** 2; } if (d < best[0]) best = [d, o, revd]; }
  }
  const sbb = best[2] ? [...sb].reverse() : sb; sb = sbb.map((_, i) => sbb[(i + best[1]) % N]);
  const colA = typeof A.fill === 'string' && A.fill ? A.fill : '#6a4cff'; const colB = typeof B.fill === 'string' && B.fill ? B.fill : '#ff2d78';
  const items = [];
  for (let k = 1; k <= steps; k++) {
    const t = k / (steps + 1);
    const pts = sa.map((p, i) => [lerp(p[0], sb[i][0], t), lerp(p[1], sb[i][1], t)]);
    const n = new Path(smoothPathD(rdp([...pts, pts[0]], 0.25).slice(0, -1), pa.closed), { fill: mixHex(colA, colB, t), stroke: A.stroke ? mixHex(A.stroke, B.stroke || A.stroke, t) : null, strokeWidth: lerp(A.strokeWidth || 0, B.strokeWidth || 0, t), opacity: lerp(A.opacity ?? 1, B.opacity ?? 1, t), strokeUniform: true });
    items.push(n);
  }
  const g = new Group(items, { subTargetCheck: false, interactive: false });
  g.id = uid(); g.name = 'Dégradé de formes';
  D.loading = true; D.canvas.insertAt(objs.indexOf(A) + 1, g); D.loading = false;
  D.canvas.setActiveObject(g); D.changed();
}

// ---------- Répétition et symétrie ----------
export async function repeat(D, o, spec) {
  const src = o.nxRepeat && o.type === 'group' ? null : o;
  let base;
  if (!src) { const objs = await util.enlivenObjects([o.nxRepeat.src]); base = objs[0]; } else base = await o.clone(FabricObject.customProperties);
  const items = [];
  const br = base.getBoundingRect(); const cx = br.left + br.width / 2; const cy = br.top + br.height / 2;
  if (spec.mode === 'radial') {
    const R = spec.radius ?? Math.max(br.width, br.height) * 0.9; const n = clamp(Math.round(spec.count || 8), 2, 72);
    for (let i = 0; i < n; i++) {
      const c = await base.clone(FabricObject.customProperties); const a = (i / n) * Math.PI * 2;
      c.set({ angle: (base.angle || 0) + (spec.rotate !== false ? (i / n) * 360 : 0) });
      c.setPositionByOrigin({ x: cx + Math.sin(a) * R, y: cy - R + R - Math.cos(a) * R }, 'center', 'center');
      items.push(c);
    }
  } else {
    const cols = clamp(Math.round(spec.cols || 3), 1, 30); const rows = clamp(Math.round(spec.rows || 3), 1, 30);
    const gx = spec.gapX ?? br.width * 0.25; const gy = spec.gapY ?? br.height * 0.25;
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
      const c = await base.clone(FabricObject.customProperties);
      c.setPositionByOrigin({ x: cx + q * (br.width + gx) + (spec.stagger && r % 2 ? (br.width + gx) / 2 : 0), y: cy + r * (br.height + gy) }, 'center', 'center');
      items.push(c);
    }
  }
  const g = new Group(items, { subTargetCheck: false, interactive: false });
  g.nxRepeat = { ...spec, src: base.toObject(FabricObject.customProperties) };
  g.name = spec.mode === 'radial' ? 'Répétition circulaire' : 'Répétition en grille';
  return replaceObj(D, o, g, { keepName: false });
}
export async function mirror(D, o, axis = 'x') {
  const c = await o.clone(FabricObject.customProperties);
  const br = o.getBoundingRect();
  c.set(axis === 'x' ? { flipX: !o.flipX } : { flipY: !o.flipY });
  c.setCoords();
  const cb = c.getBoundingRect();
  if (axis === 'x') c.set({ left: c.left + (br.left + br.width - cb.left) }); else c.set({ top: c.top + (br.top + br.height - cb.top) });
  c.setCoords();
  const at = D.canvas.getObjects().indexOf(o);
  D.loading = true; D.canvas.remove(o);
  const g = new Group([o, c], { subTargetCheck: false, interactive: false });
  g.id = uid(); g.name = 'Symétrie'; D.canvas.insertAt(at, g); D.loading = false;
  D.canvas.setActiveObject(g); D.changed();
}

// ---------- Vectorisation d'image (et de texte) ----------
export async function traceImage(D, o, { colors = 6, mode = 'color', detail = 0.6 } = {}) {
  const el = o.getElement ? o.getElement() : null;
  if (!el) return null;
  const ew = el.naturalWidth || el.width; const eh = el.naturalHeight || el.height;
  const maxSide = Math.round(220 + detail * 380); const k = Math.min(1, maxSide / Math.max(ew, eh));
  const W = Math.max(8, Math.round(ew * k)); const H = Math.max(8, Math.round(eh * k));
  const cv = makeCanvas(W, H); const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(el, o.cropX || 0, o.cropY || 0, o.width, o.height, 0, 0, W, H);
  const img = cx.getImageData(0, 0, W, H);
  const layers = [];
  if (mode === 'bw') {
    const m = new Uint8Array(W * H);
    for (let p = 0; p < W * H; p++) { const i = p * 4; m[p] = img.data[i + 3] > 100 && (img.data[i] * 0.3 + img.data[i + 1] * 0.59 + img.data[i + 2] * 0.11) < 128 ? 255 : 0; }
    layers.push({ color: '#14151a', mask: m });
  } else {
    const q = quantize(img, clamp(colors, 2, 12));
    // Du plus clair au plus foncé : les zones sombres passent devant.
    const order = q.palette.map((c, i) => [c, i]).sort((a, b) => lumOf(b[0]) - lumOf(a[0]));
    for (const [color, idx] of order) {
      const m = new Uint8Array(W * H);
      for (let p = 0; p < W * H; p++) m[p] = q.labels[p] === idx ? 255 : 0;
      layers.push({ color, mask: m });
    }
  }
  const m = o.calcTransformMatrix(); const sx = o.width / W; const sy = o.height / H;
  const items = [];
  for (const L of layers) {
    const paths = traceMask(L.mask, W, H, { minArea: 6 + (1 - detail) * 30, tolerance: 0.6 + (1 - detail) * 1.4 });
    if (!paths.length) continue;
    const d = paths.map((pts) => smoothPathD(pts.map(([x, y]) => { const q = apply(m, x * sx - o.width / 2, y * sy - o.height / 2); return [q.x, q.y]; }), true, 0.45)).join(' ');
    items.push(new Path(d, { fill: L.color, stroke: null, strokeWidth: 0, fillRule: 'evenodd' }));
  }
  if (!items.length) { toast('Rien à vectoriser dans cette image.', { kind: 'bad' }); return null; }
  const g = new Group(items, { subTargetCheck: false, interactive: false });
  g.id = uid(); g.name = `${o.name || 'Image'} (vectorisée)`;
  const at = D.canvas.getObjects().indexOf(o);
  D.loading = true; D.canvas.insertAt(at + 1, g); D.loading = false;
  o.visible = false;
  D.canvas.setActiveObject(g); D.changed();
  toast(`Image vectorisée : ${items.length} couleur${items.length > 1 ? 's' : ''}. L’original est masqué dans les calques.`);
  return g;
}
const lumOf = (hex) => { const [r, g, b] = hexRgb(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
// Texte vers tracés : rendu haute définition puis vectorisation fidèle.
export async function textToPaths(D, o) {
  const scale = 4;
  const el = o.toCanvasElement({ multiplier: scale, enableRetinaScaling: false });
  const W = el.width; const H = el.height; const x = el.getContext('2d', { willReadFrequently: true }); const img = x.getImageData(0, 0, W, H);
  const m = new Uint8Array(W * H); for (let p = 0; p < W * H; p++) m[p] = img.data[p * 4 + 3];
  const br = o.getBoundingRect();
  const paths = traceMask(m, W, H, { minArea: 4, tolerance: 0.7 });
  if (!paths.length) return null;
  const d = paths.map((pts) => smoothPathD(pts.map(([px, py]) => [br.left + px / scale * (br.width * scale / W), br.top + py / scale * (br.height * scale / H)]), true, 0.4)).join(' ');
  const fill = typeof o.fill === 'string' ? o.fill : '#1d1d1f';
  const n = new Path(d, { fill, stroke: o.stroke || null, strokeWidth: o.stroke ? o.strokeWidth : 0, fillRule: 'evenodd', opacity: o.opacity, shadow: o.shadow, nxFx: o.nxFx });
  n.name = `${o.name || 'Texte'} (tracés)`;
  return replaceObj(D, o, n, { keepName: false });
}

// ---------- Texte sur tracé et texte courbé ----------
function textProps(t) {
  const keys = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fill', 'stroke', 'strokeWidth', 'paintFirst', 'charSpacing', 'underline', 'linethrough', 'opacity', 'shadow', 'textBackgroundColor', 'nxFx', 'nxAnim', 'nxStyle'];
  const s = {}; for (const k of keys) if (t[k] !== undefined) s[k] = t[k];
  return s;
}
export function textOnPath(D, list) {
  const t = list.find((o) => ['textbox', 'i-text', 'text'].includes(o.type)); const p = list.find((o) => isShape(o) && o !== t);
  if (!t || !p) { toast('Sélectionne un texte et un tracé (ou une forme) ensemble.', { kind: 'bad' }); return; }
  const baked = p.type === 'path' && !p.angle && p.scaleX === 1 && p.scaleY === 1 ? nodesD(toNodes(p)) : (p.type === 'line' ? (() => { const m = p.calcTransformMatrix(); const lp = p.calcLinePoints(); const a = apply(m, lp.x1, lp.y1); const b = apply(m, lp.x2, lp.y2); return `M ${a.x} ${a.y} L ${b.x} ${b.y}`; })() : (nxToPaper(p) || {}).pathData);
  if (!baked) { toast('Ce tracé ne peut pas servir de support.', { kind: 'bad' }); return; }
  const guide = new Path(baked, { fill: '', stroke: '', strokeWidth: 0, visible: true });
  const n = new IText(String(t.text || ''), { ...textProps(t), path: guide, pathAlign: 'center', pathSide: 'left', pathStartOffset: 0 });
  n.set({ left: guide.left, top: guide.top });
  n.id = t.id; n.name = `${t.name || 'Texte'} (sur tracé)`;
  const at = D.canvas.getObjects().indexOf(t);
  D.canvas.discardActiveObject(); D.loading = true; D.canvas.remove(t); D.canvas.insertAt(at, n); D.loading = false;
  p.set({ opacity: 0.25 });
  D.canvas.setActiveObject(n); D.changed();
  toast('Texte posé sur le tracé. Le tracé guide est atténué : supprime-le ou masque-le si besoin.');
}
export function curveText(D, t, amount) {
  if (!t) return null;
  amount = clamp(Math.round(amount), -100, 100);
  const plain = t.nxCurve ? t.nxCurve : { w: t.width, kind: t.type };
  const props = { ...textProps(t), textAlign: 'center' };
  const center = t.getCenterPoint();
  let n;
  if (!amount) {
    n = new Textbox(String(t.text || ''), { ...props, width: plain.w || 400 });
    n.nxCurve = null;
  } else {
    const tmp = new IText(String(t.text || ''), props);
    const L = Math.max(10, tmp.calcTextWidth ? tmp.calcTextWidth() : tmp.width);
    const th = Math.max(0.05, Math.abs(amount) / 100 * Math.PI * 1.9);
    const R = L / th;
    const sx = R * Math.sin(th / 2); const sy = R * (1 - Math.cos(th / 2));
    const d = amount > 0 ? `M ${-sx} ${sy} A ${R} ${R} 0 ${th > Math.PI ? 1 : 0} 1 ${sx} ${sy}` : `M ${-sx} ${-sy} A ${R} ${R} 0 ${th > Math.PI ? 1 : 0} 0 ${sx} ${-sy}`;
    const guide = new Path(d, { fill: '', stroke: '', strokeWidth: 0 });
    n = new IText(String(t.text || ''), { ...props, path: guide, pathAlign: amount > 0 ? 'baseline' : 'ascender', pathSide: 'left' });
    n.nxCurve = { amount, w: plain.w };
  }
  n.setPositionByOrigin(center, 'center', 'center');
  return replaceObj(D, t, n);
}

// ---------- Flèches aux extrémités des lignes et tracés ----------
export const ARROWS = { none: 'Aucune', triangle: 'Triangle', open: 'Pointe ouverte', circle: 'Rond', bar: 'Barre', diamond: 'Losange' };
function endPoints(o) {
  if (o.type === 'line') {
    const m = o.calcTransformMatrix(); const p = o.calcLinePoints(); const a = apply(m, p.x1, p.y1); const b = apply(m, p.x2, p.y2);
    return { s: a, sd: Math.atan2(a.y - b.y, a.x - b.x), e: b, ed: Math.atan2(b.y - a.y, b.x - a.x) };
  }
  if (o.type !== 'path') return null;
  const subs = toNodes(o); const s = subs[0]; const e = subs[subs.length - 1];
  if (!s || s.closed) return null;
  const n0 = s.nodes[0]; const n1 = s.nodes[1] || n0; const m1 = e.nodes[e.nodes.length - 1]; const m0 = e.nodes[e.nodes.length - 2] || m1;
  const sDir = Math.hypot(n0.ox - n0.x, n0.oy - n0.y) > 0.5 ? Math.atan2(n0.y - n0.oy, n0.x - n0.ox) : Math.atan2(n0.y - n1.y, n0.x - n1.x);
  const eDir = Math.hypot(m1.ix - m1.x, m1.iy - m1.y) > 0.5 ? Math.atan2(m1.y - m1.iy, m1.x - m1.ix) : Math.atan2(m1.y - m0.y, m1.x - m0.x);
  return { s: n0, sd: sDir, e: m1, ed: eDir };
}
function drawHead(ctx, p, ang, style, size, color, lw) {
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang); ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  if (style === 'triangle') { ctx.moveTo(size * 0.35, 0); ctx.lineTo(-size * 0.75, -size * 0.55); ctx.lineTo(-size * 0.75, size * 0.55); ctx.closePath(); ctx.fill(); }
  if (style === 'open') { ctx.moveTo(-size * 0.8, -size * 0.6); ctx.lineTo(0, 0); ctx.lineTo(-size * 0.8, size * 0.6); ctx.stroke(); }
  if (style === 'circle') { ctx.arc(0, 0, size * 0.42, 0, Math.PI * 2); ctx.fill(); }
  if (style === 'bar') { ctx.moveTo(0, -size * 0.6); ctx.lineTo(0, size * 0.6); ctx.stroke(); }
  if (style === 'diamond') { ctx.moveTo(size * 0.5, 0); ctx.lineTo(0, -size * 0.45); ctx.lineTo(-size * 0.5, 0); ctx.lineTo(0, size * 0.45); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}
let arrowsOn = false;
export function installArrows() {
  if (arrowsOn) return; arrowsOn = true;
  const proto = FabricObject.prototype; const orig = proto.render;
  proto.render = function (ctx) {
    orig.call(this, ctx);
    const a = this.nxArrows;
    if (!a || (!a.start || a.start === 'none') && (!a.end || a.end === 'none') || this.visible === false || !this.stroke) return;
    if (this.group) return;
    const ep = endPoints(this); if (!ep) return;
    const lw = this.strokeWidth || 2; const size = Math.max(8, lw * (a.size || 3.2));
    ctx.save(); ctx.globalAlpha *= this.opacity ?? 1;
    if (a.start && a.start !== 'none') drawHead(ctx, ep.s, ep.sd, a.start, size, this.stroke, lw);
    if (a.end && a.end !== 'none') drawHead(ctx, ep.e, ep.ed, a.end, size, this.stroke, lw);
    ctx.restore();
  };
}
void Line;
