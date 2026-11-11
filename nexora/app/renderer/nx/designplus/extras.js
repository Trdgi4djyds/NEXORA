// NEXORA #113 : fonctions de desigma (MIT ou Apache-2.0) absentes de NEX-DESIGN, refaites pour son éditeur :
//  - « Couleurs de la sélection » (ou de la page) : chaque couleur utilisée, modifiable en une fois partout ;
//  - lissage des coins des rectangles (coins « continus » façon iOS, crochet de dessin du rectangle) ;
//  - tableau blanc : pense-bêtes (texte qui rétrécit pour tenir), connecteurs qui suivent les calques qu'ils relient ;
//  - notes de présentation de chaque page (lues dans la présentation, touche N).
import { esc, ico, toast, sec, hex, objs, walk, isText, settings } from './ui.js';
import { FabricObject, Rect, Textbox } from './ui.js';
import { Line, Shadow } from '../design/fab.js';
import * as M from './motion-model.js';

for (const p of ['nxSticky', 'nxConn']) if (!FabricObject.customProperties.includes(p)) FabricObject.customProperties.push(p);

// ---------- Lissage des coins ----------
// Un coin lissé commence plus tôt sur le côté ((1 + s) × rayon) et garde le même creux au milieu qu'un arc de cercle :
// la courbure varie sans à-coup, comme les icônes d'iOS.
if (!Rect.prototype.nxSmoothRender) {
  Rect.prototype.nxSmoothRender = Rect.prototype._render;
  Rect.prototype._render = function (ctx) {
    const s = Math.max(0, Math.min(1, Number(this.nxSmooth) || 0));
    if (!s || !this.rx) return this.nxSmoothRender(ctx);
    const w = this.width; const h = this.height; const x = -w / 2; const y = -h / 2;
    const r = Math.min(this.rx, w / 2, h / 2);
    const a = Math.min(r * (1 + s), w / 2, h / 2);
    const k = Math.min(a, Math.max(0, (0.5 * a - 0.2929 * r) / 0.375));
    ctx.beginPath();
    ctx.moveTo(x + a, y);
    ctx.lineTo(x + w - a, y); ctx.bezierCurveTo(x + w - a + k, y, x + w, y + a - k, x + w, y + a);
    ctx.lineTo(x + w, y + h - a); ctx.bezierCurveTo(x + w, y + h - a + k, x + w - a + k, y + h, x + w - a, y + h);
    ctx.lineTo(x + a, y + h); ctx.bezierCurveTo(x + a - k, y + h, x, y + h - a + k, x, y + h - a);
    ctx.lineTo(x, y + a); ctx.bezierCurveTo(x, y + a - k, x + a - k, y, x + a, y);
    ctx.closePath();
    this._renderPaintInOrder(ctx);
  };
}

// ---------- Pense-bêtes ----------
const STICKY = { yellow: ['#fff3a3', 'Jaune'], pink: ['#ffd1dc', 'Rose'], green: ['#c9f2c7', 'Vert'], blue: ['#cfe6ff', 'Bleu'], violet: ['#e3d7ff', 'Violet'], orange: ['#ffdcb8', 'Orange'] };
const isSticky = (o) => o && o.nxKind === 'sticky' && isText(o);
const PAD = 16;
if (!Textbox.prototype.nxStickyInit) {
  Textbox.prototype.nxStickyInit = Textbox.prototype.initDimensions;
  Textbox.prototype.initDimensions = function (...a) {
    const r = this.nxStickyInit(...a);
    // Pense-bête : au moins carré.
    if (this.nxKind === 'sticky' && this.width) this.height = Math.max(this.height, this.width);
    return r;
  };
  Textbox.prototype.nxStickyBg = Textbox.prototype._renderBackground;
  Textbox.prototype._renderBackground = function (ctx) {
    if (this.nxKind !== 'sticky' || !this.backgroundColor) return this.nxStickyBg(ctx);
    const w = this.width + PAD * 2; const h = this.height + PAD * 2;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.14)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
    ctx.fillStyle = this.backgroundColor;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-w / 2, -h / 2, w, h, 6) : ctx.rect(-w / 2, -h / 2, w, h); ctx.fill();
    ctx.restore();
  };
}
// Texte qui rétrécit pour tenir dans le carré (et regrandit jusqu'à sa taille de départ).
function fit(o) {
  if (!isSticky(o)) return;
  const base = (o.nxSticky && o.nxSticky.size) || 24;
  let size = base; o.fontSize = size; o.initDimensions();
  const max = o.width;
  const tall = () => { o.nxKind = ''; o.initDimensions(); const hh = o.height; o.nxKind = 'sticky'; o.initDimensions(); return hh; };
  while (tall() > max && size > 10) { size -= 1; o.fontSize = size; }
  o.setCoords(); o.dirty = true;
}
function prep(o) { if (isSticky(o)) { o.objectCaching = false; o.padding = PAD; o.initDimensions(); } }
export function addSticky(D, color = settings.nxStickyColor || 'yellow') {
  const pg = D.page;
  const o = new Textbox('Écris ici…', { width: 220, fontSize: 24, fontFamily: 'NX Inter', fontWeight: 500, fill: '#1f1f22', lineHeight: 1.2, backgroundColor: (STICKY[color] || STICKY.yellow)[0], nxKind: 'sticky', nxSticky: { size: 24, color }, name: 'Pense-bête' });
  o.id = `nx${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  prep(o);
  const n = objs(D).filter(isSticky).length;
  o.set({ left: pg.w / 2 - 110 + (n % 5) * 28, top: pg.h / 2 - 110 + (n % 5) * 28 });
  D.canvas.add(o); D.canvas.setActiveObject(o); o.setCoords();
  D.nxNextLabel = 'Pense-bête'; D.changed(); D.canvas.requestRenderAll();
  toast('Pense-bête ajouté : double-clique pour écrire ; le texte rétrécit pour tenir.');
  return o;
}

// ---------- Connecteurs ----------
const isConn = (o) => o && o.type === 'line' && o.nxConn && o.nxConn.from && o.nxConn.to;
const byId = (D, id) => objs(D).find((o) => String(o.id) === String(id)) || null;
// Points d'accroche : milieu de chaque côté ; on prend le couple le plus proche.
function anchors(o) {
  const b = o.getBoundingRect();
  // Pense-bête : son fond déborde de la boîte du texte ; la flèche s'arrête au bord visible.
  const m = isSticky(o) ? PAD * Math.abs(o.scaleX || 1) + 2 : 0;
  const r = { left: b.left - m, top: b.top - m, width: b.width + m * 2, height: b.height + m * 2 };
  return [{ x: r.left + r.width / 2, y: r.top }, { x: r.left + r.width, y: r.top + r.height / 2 }, { x: r.left + r.width / 2, y: r.top + r.height }, { x: r.left, y: r.top + r.height / 2 }];
}
function route(a, b) {
  let best = null;
  for (const p of anchors(a)) for (const q of anchors(b)) { const d = Math.hypot(p.x - q.x, p.y - q.y); if (!best || d < best.d) best = { p, q, d }; }
  return best;
}
function place(D, c) {
  const a = byId(D, c.nxConn.from); const b = byId(D, c.nxConn.to);
  if (!a || !b) return false;
  const r = route(a, b);
  c.set({ x1: r.p.x, y1: r.p.y, x2: r.q.x, y2: r.q.y });
  c.setCoords(); c.dirty = true;
  return true;
}
export function connect(D, a, b) {
  const c = new Line([0, 0, 1, 1], { stroke: '#3a3a40', strokeWidth: 2.5, strokeLineCap: 'round', fill: '', nxArrows: { start: 'none', end: 'triangle' }, nxConn: { from: a.id, to: b.id }, name: 'Connecteur', perPixelTargetFind: false });
  c.id = `nx${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  D.canvas.add(c);
  place(D, c);
  // Sous les calques reliés, pour que la flèche parte du bord.
  const idx = Math.min(D.canvas.getObjects().indexOf(a), D.canvas.getObjects().indexOf(b));
  if (idx >= 0 && D.canvas.moveObjectTo) D.canvas.moveObjectTo(c, idx);
  D.canvas.setActiveObject(c);
  D.nxNextLabel = 'Connecteur'; D.changed(); D.canvas.requestRenderAll();
  toast('Connecteur ajouté : il suit les deux calques quand tu les déplaces.');
  return c;
}
function follow(D, moved) {
  const ids = new Set();
  const list = moved && moved.type === 'activeselection' ? moved.getObjects() : [moved];
  for (const o of list) if (o && o.id) ids.add(String(o.id));
  let any = false;
  // Un connecteur pris dans une sélection multiple est replacé quand elle se défait.
  for (const c of objs(D)) if (isConn(c) && !c.group && (ids.has(String(c.nxConn.from)) || ids.has(String(c.nxConn.to)))) { if (place(D, c)) any = true; }
  if (any) D.canvas.requestRenderAll();
}
function relinkAll(D) { for (const c of objs(D)) if (isConn(c)) place(D, c); for (const o of objs(D)) prep(o); }

// ---------- Couleurs de la sélection (ou de la page) ----------
function colorUses(list) {
  const map = new Map();
  const add = (o, k, c, set) => { const h = hex(c); if (!h) return; const e = map.get(h) || { hex: h, n: 0, uses: [] }; e.n += 1; e.uses.push({ o, k, set }); map.set(h, e); };
  walk(list, (o) => {
    for (const k of ['fill', 'stroke']) {
      const c = o[k];
      if (typeof c === 'string' && c && c !== 'transparent') add(o, k, c, (v) => { o.set(k, v); });
      else if (c && typeof c === 'object' && Array.isArray(c.colorStops)) c.colorStops.forEach((s, i) => add(o, `${k}:${i}`, s.color, (v) => { c.colorStops[i].color = v; o.dirty = true; }));
    }
    if (o.backgroundColor && isSticky(o)) add(o, 'backgroundColor', o.backgroundColor, (v) => { o.set('backgroundColor', v); });
  });
  return [...map.values()].sort((a, b) => b.n - a.n);
}
function colorsCard(D, list, title) {
  const uses = colorUses(list);
  if (!uses.length) return '';
  return sec(title, `<div class="nxx-colors">${uses.slice(0, 24).map((u) => `<label class="nxx-color" title="${esc(`${u.hex} · utilisée ${u.n} fois`)}"><input type="color" value="${u.hex}" data-exc="${u.hex}" aria-label="${esc(`Remplacer ${u.hex}`)}"><span class="nxx-sw" style="--c:${u.hex}"></span><span class="nxx-hex">${u.hex.toUpperCase()}</span><small>${u.n}</small></label>`).join('')}</div><p class="dzx-hint">Change une couleur : toutes ses utilisations ${list.length === objs(D).length ? 'de la page' : 'de la sélection'} suivent (remplissages, contours, dégradés, textes).</p>`);
}
function replaceColor(D, from, to) {
  const s = D.sel(); const list = s.length ? s : objs(D);
  let n = 0;
  for (const u of colorUses(list)) {
    if (u.hex !== from) continue;
    for (const x of u.uses) {
      const cur = x.k.includes(':') ? null : x.o[x.k];
      const alpha = typeof cur === 'string' ? M.parseColor(cur)[3] : 1;
      x.set(alpha < 1 ? M.colorString([...M.parseColor(to).slice(0, 3), alpha]) : to);
      x.o.dirty = true; n += 1;
    }
  }
  D.canvas.requestRenderAll();
  D.nxNextLabel = 'Couleurs de la sélection'; D.changed();
  toast(`${n} utilisation${n > 1 ? 's' : ''} de ${from.toUpperCase()} remplacée${n > 1 ? 's' : ''} par ${to.toUpperCase()}.`);
}

// ---------- Panneau de droite ----------
export function props(D) {
  const s = D.sel();
  if (!s.length) {
    const notes = D.page && D.page.nxNotes ? D.page.nxNotes : '';
    return sec('Notes de présentation', `<textarea class="input nxx-notes" rows="3" maxlength="4000" data-exk="notes" placeholder="Ce que tu veux dire sur cette page : lu dans la présentation (touche N), jamais exporté.">${esc(notes)}</textarea>`)
      + sec('Tableau blanc', `<div class="nx-btns"><button class="btn small" data-ex="sticky">${ico('nxComment', 13)}<span>Pense-bête</span></button></div><p class="dzx-hint">Pense-bêtes dont le texte rétrécit pour tenir ; sélectionne deux calques pour les relier par un connecteur qui les suit.</p>`)
      + colorsCard(D, objs(D), 'Couleurs de la page');
  }
  let h = '';
  if (s.length === 2) h += sec('Tableau blanc', `<div class="nx-btns"><button class="btn small" data-ex="connect">${ico('nxArrowRight', 13)}<span>Relier par un connecteur</span></button></div><p class="dzx-hint">La flèche part du premier calque sélectionné et suit les deux calques quand ils bougent.</p>`);
  const o = s.length === 1 ? s[0] : null;
  if (o && o.type === 'rect') {
    const v = Math.round((Number(o.nxSmooth) || 0) * 100);
    h += sec('Lissage des coins', `<div class="st-field"><span>Lissage <b data-exv>${v} %</b></span><input type="range" min="0" max="100" step="1" value="${v}" data-exk="smooth" aria-label="Lissage des coins"></div><p class="dzx-hint">${o.rx ? 'Coins continus, comme les icônes d’iOS (60 % : réglage d’Apple).' : 'Donne d’abord un arrondi aux coins (section Calque), puis lisse-les.'}</p>`);
  }
  if (isSticky(o)) h += sec('Pense-bête', `<div class="nxx-stk">${Object.entries(STICKY).map(([k, [c, l]]) => `<button class="nxx-stkc${(o.nxSticky && o.nxSticky.color) === k ? ' on' : ''}" data-ex="stk:${k}" style="--c:${c}" title="${l}" aria-label="${l}"></button>`).join('')}</div>`);
  if (isConn(o)) h += sec('Connecteur', `<p class="dzx-hint">Relie « ${esc((byId(D, o.nxConn.from) || {}).name || 'calque')} » à « ${esc((byId(D, o.nxConn.to) || {}).name || 'calque')} ».</p><div class="nx-btns"><button class="btn small" data-ex="flip">${ico('nxRepeat', 13)}<span>Inverser le sens</span></button><button class="btn small" data-ex="unlink">${ico('link', 13)}<span>Détacher</span></button></div>`);
  h += colorsCard(D, s, 'Couleurs de la sélection');
  return h;
}
function onAction(D, a) {
  const s = D.sel(); const o = s.length === 1 ? s[0] : null;
  if (a === 'sticky') { addSticky(D); return; }
  if (a === 'connect' && s.length === 2) { connect(D, s[0], s[1]); return; }
  if (a.startsWith('stk:') && isSticky(o)) { const k = a.slice(4); o.set('backgroundColor', STICKY[k][0]); o.nxSticky = { ...(o.nxSticky || {}), color: k }; settings.nxStickyColor = k; D.nxNextLabel = 'Pense-bête'; D.changed(); D.canvas.requestRenderAll(); D.renderProps(); return; }
  if (a === 'flip' && isConn(o)) { o.nxConn = { from: o.nxConn.to, to: o.nxConn.from }; place(D, o); D.nxNextLabel = 'Connecteur'; D.changed(); D.canvas.requestRenderAll(); return; }
  if (a === 'unlink' && isConn(o)) { delete o.nxConn; D.nxNextLabel = 'Connecteur détaché'; D.changed(); D.renderProps(); }
}

export function install(D) {
  if (D.nxExtras) return;
  D.nxExtras = true;
  if (!document.querySelector('link[data-nxx-css]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('./extras.css', import.meta.url).href; l.dataset.nxxCss = '1'; document.head.append(l); }
  const c = D.canvas;
  for (const ev of ['object:moving', 'object:scaling', 'object:rotating', 'object:modified']) c.on(ev, (e) => { if (e && e.target && !isConn(e.target)) follow(D, e.target); });
  c.on('text:changed', (e) => { if (isSticky(e.target)) { fit(e.target); c.requestRenderAll(); } });
  c.on('selection:cleared', () => { relinkAll(D); c.requestRenderAll(); });
  c.on('object:removed', (e) => {
    const gone = e && e.target && e.target.id; if (!gone) return;
    const dead = objs(D).filter((x) => isConn(x) && (String(x.nxConn.from) === String(gone) || String(x.nxConn.to) === String(gone)));
    if (dead.length) setTimeout(() => { for (const x of dead) if (D.canvas.getObjects().includes(x)) D.canvas.remove(x); D.canvas.requestRenderAll(); }, 0);
  });
  const proto = Object.getPrototypeOf(D);
  if (!proto.nxExLoadPage) {
    proto.nxExLoadPage = proto.loadPage;
    proto.loadPage = async function (pg, json) { await this.nxExLoadPage(pg, json); try { relinkAll(this); } catch (e) { console.warn('[NEXORA #113]', e); } };
  }
  relinkAll(D);
  const f = D.$.props;
  f.addEventListener('click', (e) => { const b = e.target.closest('[data-ex]'); if (!b || !f.contains(b)) return; e.stopPropagation(); onAction(D, b.dataset.ex); });
  f.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.exk === 'smooth') { const o = D.sel()[0]; if (!o) return; o.nxSmooth = Number(t.value) / 100; o.dirty = true; c.requestRenderAll(); const v = t.parentElement.querySelector('[data-exv]'); if (v) v.textContent = `${t.value} %`; }
  });
  f.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.exk === 'smooth') { D.nxNextLabel = 'Lissage des coins'; D.changed(); }
    if (t.dataset.exk === 'notes' && D.page) { D.page.nxNotes = String(t.value || '').slice(0, 4000); D.nxNextLabel = 'Notes de présentation'; D.changed(); }
    if (t.dataset.exc) replaceColor(D, t.dataset.exc, t.value);
  });
  void Shadow;
}
