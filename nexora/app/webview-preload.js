'use strict';
/* NEXORA #114 : script des pages affichées dans les <webview> (Responsive Lab, Browser Lab, aperçu du Dev Lab,
 * App Builder), posé par main.js (will-attach-webview, WEBVIEW_PRELOAD). Ce fichier manquait depuis l'import
 * (#001) : sans lui, les barres de défilement des appareils restaient grisées, le glissement à la souris ne
 * faisait rien et la synchronisation des appareils (défilement, clics, saisies, navigation) ne marchait pas.
 * Il est réécrit d'après les messages que l'interface envoie et attend (renderer/dist/chunks/chunk-NXGVNXL4.js,
 * browserlab, devlab, chunk-5NQJ7RFA.js pour l'audit, chunk-2TLCLXOI.js pour la vidéo) :
 *   reçus  : vitrine-config, vitrine-scroll-to, vitrine-scroll-sync, vitrine-scroll-ratio, vitrine-locate,
 *            vitrine-do-click, vitrine-set-input, vitrine-spa-nav, vitrine-highlight ;
 *   envoyés : vitrine-scroll, vitrine-top, vitrine-active, vitrine-pointer, vitrine-click, vitrine-input,
 *            vitrine-located, vitrine-spa-done.
 * La page est isolée (contextIsolation, sandbox) : ce script ne voit que le DOM, jamais le JavaScript du site. */
const { ipcRenderer } = require('electron');

const send = (channel, payload) => { try { ipcRenderer.sendToHost(channel, payload); } catch { /* page fermée */ } };
const on = (channel, fn) => ipcRenderer.on(channel, (_e, payload) => { try { fn(payload); } catch { /* page */ } });

// Réglages envoyés par l'interface à chaque chargement (dom-ready). Sans réglage (aperçu de l'App Builder),
// le script décide seul d'après la page : écran tactile émulé → glissement et barres superposées.
const cfg = { dragScroll: false, touch: false, pointer: false, syncClicks: false, syncNav: false, syncScroll: false, syncInput: false };
let configured = false;
let hostBars = false; // le Responsive Lab dessine ses propres barres (réglage syncScroll présent)

const now = () => Date.now();
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// Largeur et hauteur visibles : sur téléphone, une page plus large que l'écran élargit innerWidth.
const viewW = () => (window.visualViewport ? window.visualViewport.width : document.documentElement.clientWidth) || innerWidth;
const viewH = () => (window.visualViewport ? window.visualViewport.height : innerHeight) || innerHeight;
const coarse = () => { try { return matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0; } catch { return false; } };
const dragOn = () => (configured ? Boolean(cfg.dragScroll) : coarse());

// ---------------------------------------------------------------- éléments et chemins
const root = () => document.scrollingElement || document.documentElement;
function cssPath(el) {
  if (!el || el.nodeType !== 1) return null;
  if (el === document.documentElement || el === document.body || el === root()) return null;
  const parts = [];
  let node = el;
  while (node && node.nodeType === 1 && node !== document.documentElement) {
    if (node.id && /^[A-Za-z][\w-]*$/.test(node.id) && document.querySelectorAll(`#${node.id}`).length === 1) {
      parts.unshift(`#${node.id}`);
      break;
    }
    const parent = node.parentElement;
    if (!parent) break;
    const tag = node.tagName.toLowerCase();
    const same = [...parent.children].filter((c) => c.tagName === node.tagName);
    parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag);
    node = parent;
  }
  return parts.join(' > ') || null;
}
function find(sel) {
  if (!sel) return null;
  try { return document.querySelector(sel); } catch { return null; }
}
const textOf = (el) => String((el && (el.innerText || el.value || el.getAttribute('aria-label') || el.title)) || '').replace(/\s+/g, ' ').trim().slice(0, 80);

// ---------------------------------------------------------------- zone qui défile
function canScroll(el, axis) {
  if (!el || el.nodeType !== 1) return false;
  const big = axis === 'y' ? el.scrollHeight - el.clientHeight > 1 : el.scrollWidth - el.clientWidth > 1;
  if (!big) return false;
  if (el === root()) {
    // Règle de Chrome : quand html laisse « visible », c'est le overflow du body qui s'applique à la fenêtre.
    const prop = axis === 'y' ? 'overflowY' : 'overflowX';
    const h = getComputedStyle(document.documentElement)[prop];
    const o = h === 'visible' && document.body ? getComputedStyle(document.body)[prop] : h;
    return o !== 'hidden' && o !== 'clip';
  }
  const o = axis === 'y' ? getComputedStyle(el).overflowY : getComputedStyle(el).overflowX;
  return o === 'auto' || o === 'scroll' || o === 'overlay';
}
// Zone principale : le document, sinon le plus grand bloc qui défile (sites dont le body est figé).
let mainEl = null;
let mainAt = 0;
function mainScroller(force) {
  if (!force && mainEl && mainEl.isConnected && now() - mainAt < 1500) return mainEl;
  mainAt = now();
  const r = root();
  if (canScroll(r, 'y') || canScroll(r, 'x')) return (mainEl = r);
  let best = null;
  let area = innerWidth * innerHeight * 0.3;
  const all = document.body ? document.body.getElementsByTagName('*') : [];
  for (let i = 0; i < all.length && i < 4000; i += 1) {
    const el = all[i];
    if (el.scrollHeight - el.clientHeight <= 1 && el.scrollWidth - el.clientWidth <= 1) continue;
    const a = el.clientWidth * el.clientHeight;
    if (a > area && (canScroll(el, 'y') || canScroll(el, 'x'))) { best = el; area = a; }
  }
  return (mainEl = best || r);
}
function metrics(el) {
  const isRoot = el === root();
  return {
    x: isRoot ? (el.scrollLeft || scrollX) : el.scrollLeft,
    y: isRoot ? (el.scrollTop || scrollY) : el.scrollTop,
    cw: el.clientWidth,
    ch: isRoot ? Math.min(el.clientHeight, innerHeight) || el.clientHeight : el.clientHeight,
    sw: el.scrollWidth,
    sh: el.scrollHeight,
  };
}
function setScroll(el, x, y) {
  const isRoot = el === root();
  if (isRoot) window.scrollTo({ left: x == null ? scrollX : x, top: y == null ? scrollY : y, behavior: 'instant' });
  else el.scrollTo({ left: x == null ? el.scrollLeft : x, top: y == null ? el.scrollTop : y, behavior: 'instant' });
}

// Repère du haut de l'écran : sert à caler les autres appareils sur le même contenu, même si la page n'a
// pas la même hauteur partout (mise en page différente sur téléphone et ordinateur).
function anchorOf(el) {
  try {
    const vv = window.visualViewport;
    const box = el === root() ? { left: vv ? vv.offsetLeft : 0, top: vv ? vv.offsetTop : 0, width: viewW() } : el.getBoundingClientRect();
    let node = document.elementFromPoint(box.left + box.width / 2, Math.max(0, box.top) + 4);
    while (node && node !== el && node !== document.body && node !== document.documentElement) {
      const r = node.getBoundingClientRect();
      if (r.height > 0 && r.height < innerHeight * 3 && (node.id || /^(SECTION|ARTICLE|HEADER|FOOTER|MAIN|H1|H2|H3|IMG|FIGURE|LI)$/.test(node.tagName))) {
        const sel = cssPath(node);
        if (sel) return { sel, k: clamp((Math.max(0, box.top) - r.top) / r.height, 0, 1) };
      }
      node = node.parentElement;
    }
  } catch { /* page en cours de chargement */ }
  return null;
}

let lastSent = '';
let scrollRaf = 0;
let scrollTimer = 0;
function report() {
  if (scrollRaf) cancelAnimationFrame(scrollRaf);
  clearTimeout(scrollTimer);
  scrollRaf = 0;
  scrollTimer = 0;
  if (!document.documentElement) return;
  const el = mainScroller();
  const m = metrics(el);
  const payload = { ...m, path: el === root() ? null : cssPath(el), anchor: null };
  const key = JSON.stringify(payload);
  if (key !== lastSent) {
    lastSent = key;
    payload.anchor = anchorOf(el);
    send('vitrine-scroll', payload);
  }
  bars.update(el, m);
}
// Image suivante, ou minuterie si la page ne dessine pas (fenêtre réduite, appareil hors de l'écran).
const queueReport = () => { if (!scrollRaf) { scrollRaf = requestAnimationFrame(report); scrollTimer = setTimeout(report, 120); } };

// ---------------------------------------------------------------- couleur du haut (barre d'état de l'appareil)
function hex(c) {
  if (!c) return null;
  if (c[0] === '#') {
    let h = c.slice(1);
    if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((x) => x + x).join('');
    return /^[0-9a-f]{6}/i.test(h) ? `#${h.slice(0, 6).toLowerCase()}` : null;
  }
  const m = /rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?/.exec(c);
  if (!m) return null;
  const a = m[4] == null ? 1 : (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : Number(m[4]));
  if (a < 0.5) return null;
  return `#${[m[1], m[2], m[3]].map((v) => Math.round(Number(v)).toString(16).padStart(2, '0')).join('')}`;
}
function colorOf(el) {
  const s = getComputedStyle(el);
  const c = hex(s.backgroundColor);
  if (c) return c;
  const bi = s.backgroundImage;
  if (bi && bi !== 'none') { const m = bi.match(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}/); if (m) return hex(m[0]); }
  return null;
}
function themeColor() {
  let any = '';
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
    const ct = (m.getAttribute('content') || '').trim();
    const md = m.getAttribute('media');
    if (!ct) continue;
    if (!md) { if (!any) any = ct; continue; }
    try { if (matchMedia(md).matches) return ct; } catch { /* media invalide */ }
  }
  return any;
}
let topSent = '';
let topTimer = 0;
function reportTop() {
  topTimer = 0;
  if (!document.body) return;
  let color = null;
  const vv = window.visualViewport;
  let el = document.elementFromPoint((vv ? vv.offsetLeft : 0) + viewW() / 2, (vv ? vv.offsetTop : 0) + 1);
  while (el && !color) { if (el !== bars.host) color = colorOf(el); el = el.parentElement; }
  color = color || colorOf(document.body) || colorOf(document.documentElement) || hex(themeColor()) || '#ffffff';
  if (color !== topSent) { topSent = color; send('vitrine-top', color); }
}
const queueTop = (ms = 250) => { if (!topTimer) topTimer = setTimeout(reportTop, ms); };

// ---------------------------------------------------------------- activité de l'utilisateur
// L'interface s'en sert pour savoir quel appareil mène la synchronisation et lequel prend le focus.
let activeAt = 0;
function active(kind) {
  if (kind !== 'down' && now() - activeAt < 150) return;
  activeAt = now();
  send('vitrine-active', kind);
}
// Clic ou saisie rejoués depuis un autre appareil : pas de renvoi vers les autres.
let replayClick = 0;
let replayInput = 0;

// ---------------------------------------------------------------- glissement à la souris (appareils tactiles)
const NO_DRAG = 'input, textarea, select, option, button[draggable="true"], [contenteditable=""], [contenteditable="true"], [draggable="true"], video, audio, canvas, iframe, embed, object, [role="slider"], [role="scrollbar"]';
let drag = null;
let swallowClick = 0;
let inertia = 0;
function scrollTargets(start) {
  let x = null;
  let y = null;
  for (let el = start; el && el.nodeType === 1; el = el.parentElement) {
    if (!y && canScroll(el, 'y')) y = el;
    if (!x && canScroll(el, 'x')) x = el;
    if (x && y) break;
  }
  const r = root();
  return { x: x || (canScroll(r, 'x') ? r : null), y: y || (canScroll(r, 'y') ? r : null) };
}
function scrollBy(el, axis, d) {
  if (!el || !d) return 0;
  const isRoot = el === root();
  const before = axis === 'y' ? (isRoot ? scrollY : el.scrollTop) : (isRoot ? scrollX : el.scrollLeft);
  if (isRoot) window.scrollBy({ left: axis === 'x' ? d : 0, top: axis === 'y' ? d : 0, behavior: 'instant' });
  else if (axis === 'y') el.scrollTop += d; else el.scrollLeft += d;
  const after = axis === 'y' ? (isRoot ? scrollY : el.scrollTop) : (isRoot ? scrollX : el.scrollLeft);
  return after - before;
}
function stopInertia() { if (inertia) cancelAnimationFrame(inertia); inertia = 0; }
function onDragDown(e) {
  stopInertia();
  if (!dragOn() || e.button !== 0 || e.pointerType !== 'mouse' || !e.isTrusted) return;
  const t = e.composedPath ? e.composedPath()[0] : e.target;
  if (!t || t.nodeType !== 1 || (t.closest && t.closest(NO_DRAG)) || bars.owns(t)) return;
  const targets = scrollTargets(t);
  if (!targets.x && !targets.y) return;
  drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, targets, samples: [], el: t };
}
function onDragMove(e) {
  if (!drag || e.pointerId !== drag.id) return;
  if (!(e.buttons & 1)) { onDragUp(e); return; }
  const dx = e.clientX - drag.lx;
  const dy = e.clientY - drag.ly;
  if (!drag.moved) {
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5) return;
    drag.moved = true;
    try { drag.el.setPointerCapture(e.pointerId); } catch { /* élément retiré */ }
    document.documentElement.style.setProperty('user-select', 'none', 'important');
    try { getSelection().removeAllRanges(); } catch { /* sélection */ }
  }
  e.preventDefault();
  drag.lx = e.clientX;
  drag.ly = e.clientY;
  scrollBy(drag.targets.x, 'x', -dx);
  scrollBy(drag.targets.y, 'y', -dy);
  drag.samples.push({ t: performance.now(), dx, dy });
  if (drag.samples.length > 8) drag.samples.shift();
  active('drag');
}
function onDragUp(e) {
  if (!drag || (e && e.pointerId !== drag.id)) return;
  const d = drag;
  drag = null;
  try { d.el.releasePointerCapture(d.id); } catch { /* déjà relâché */ }
  document.documentElement.style.removeProperty('user-select');
  if (!d.moved) return;
  // Le clic que le navigateur envoie juste après le relâchement n'en est pas un.
  swallowClick = now();
  setTimeout(() => { swallowClick = 0; }, 80);
  // Élan : vitesse des 100 dernières millisecondes, freinée image par image, comme sur un téléphone.
  const t0 = performance.now();
  const recent = d.samples.filter((s) => t0 - s.t < 100);
  if (!recent.length || (e && e.type === 'pointercancel')) return;
  const span = Math.max(16, t0 - recent[0].t);
  let vx = -recent.reduce((a, s) => a + s.dx, 0) / span * 16;
  let vy = -recent.reduce((a, s) => a + s.dy, 0) / span * 16;
  const step = () => {
    vx *= 0.94; vy *= 0.94;
    const mx = scrollBy(d.targets.x, 'x', vx);
    const my = scrollBy(d.targets.y, 'y', vy);
    if ((Math.abs(vx) < 0.4 && Math.abs(vy) < 0.4) || (!mx && !my)) { inertia = 0; return; }
    active('drag');
    inertia = requestAnimationFrame(step);
  };
  if (Math.abs(vx) > 1 || Math.abs(vy) > 1) inertia = requestAnimationFrame(step);
}

// ---------------------------------------------------------------- pointeur tactile (cercle à la place de la flèche)
let touchSheet = null;
function applyTouchCursor() {
  const want = Boolean(cfg.touch);
  try {
    if (want && !touchSheet) {
      touchSheet = new CSSStyleSheet();
      const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28'><circle cx='14' cy='14' r='11' fill='rgba(128,128,128,.38)' stroke='rgba(255,255,255,.9)' stroke-width='1.5'/></svg>";
      touchSheet.replaceSync(`html, html * { cursor: url("data:image/svg+xml,${encodeURIComponent(svg)}") 14 14, auto !important; }`);
    }
    if (!touchSheet) return;
    const list = [...document.adoptedStyleSheets].filter((s) => s !== touchSheet);
    document.adoptedStyleSheets = want ? [...list, touchSheet] : list;
  } catch { /* feuilles adoptées indisponibles */ }
}

// ---------------------------------------------------------------- barres superposées (aperçus sans barres propres)
// Téléphones émulés : Chrome masque ses barres. Le Responsive Lab dessine les siennes à côté de l'appareil ;
// ailleurs (App Builder, Browser Lab et Dev Lab en mode mobile), le script pose des barres fines, comme sur
// un téléphone, qui apparaissent au défilement et au survol du bord et se saisissent à la souris.
const bars = {
  host: null, v: null, h: null, vt: null, ht: null, hideAt: 0, timer: 0, el: null, m: null, grab: null,
  wanted() {
    if (hostBars) return false;
    if (!configured) return coarse();
    if (!(cfg.dragScroll || cfg.touch)) return false;
    // Barres du système visibles (largeur de fenêtre plus grande que la page) : rien à ajouter.
    return innerWidth - document.documentElement.clientWidth <= 0;
  },
  owns(node) { return Boolean(this.host && node === this.host); },
  mount() {
    if (this.host || !document.documentElement) return;
    const host = document.createElement('vitrine-scrollbars');
    host.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483646;display:block;overflow:visible';
    const sr = host.attachShadow({ mode: 'closed' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(`
      .b { position: absolute; pointer-events: auto; opacity: 0; transition: opacity .25s, width .15s, height .15s; border-radius: 99px; }
      .b.on { opacity: 1; }
      .v { top: 3px; bottom: 9px; right: 2px; width: 6px; }
      .h { left: 3px; right: 9px; bottom: 2px; height: 6px; }
      .v:hover, .v.grab { width: 10px; background: rgba(128,128,128,.18); }
      .h:hover, .h.grab { height: 10px; background: rgba(128,128,128,.18); }
      .t { position: absolute; left: 0; top: 0; border-radius: 99px; background: rgba(60,60,60,.55); box-shadow: 0 0 0 1px rgba(255,255,255,.55); }
      .v .t { width: 100%; } .h .t { height: 100%; }
      .b[hidden] { display: none; }`);
    sr.adoptedStyleSheets = [sheet];
    sr.innerHTML = '<div class="b v" hidden><div class="t"></div></div><div class="b h" hidden><div class="t"></div></div>';
    [this.v, this.h] = sr.querySelectorAll('.b');
    this.vt = this.v.firstElementChild;
    this.ht = this.h.firstElementChild;
    for (const [bar, axis] of [[this.v, 'y'], [this.h, 'x']]) {
      bar.addEventListener('pointerdown', (e) => this.down(e, bar, axis));
      bar.addEventListener('pointerenter', () => this.show(true));
      bar.addEventListener('pointerleave', () => this.show());
    }
    document.documentElement.appendChild(host);
    this.host = host;
  },
  unmount() { if (this.host) this.host.remove(); this.host = null; },
  sync() { if (this.wanted()) { this.mount(); this.update(mainScroller(true)); } else this.unmount(); },
  show(stay) {
    if (!this.host) return;
    for (const b of [this.v, this.h]) b.classList.add('on');
    clearTimeout(this.timer);
    if (!stay && !this.grab) this.timer = setTimeout(() => { for (const b of [this.v, this.h]) b.classList.remove('on'); }, 1200);
  },
  geo(axis) {
    const m = this.m;
    if (!m) return null;
    const view = axis === 'y' ? m.ch : m.cw;
    const total = axis === 'y' ? m.sh : m.sw;
    const pos = axis === 'y' ? m.y : m.x;
    const max = total - view;
    if (max <= 1) return null;
    const track = axis === 'y' ? this.v.clientHeight : this.h.clientWidth;
    const size = Math.max(28, track * view / total);
    return { max, pos, track, size, at: (track - size) * clamp(pos / max, 0, 1) };
  },
  update(el, m) {
    if (!this.host) return;
    const moved = this.m && m && (this.m.x !== m.x || this.m.y !== m.y);
    this.el = el;
    this.m = m || metrics(el);
    // Calque posé sur la zone visible (pages plus larges que l'écran, zoom de la page) ; barres d'un bloc
    // interne posées sur ses bords.
    const vv = window.visualViewport;
    const ox = vv ? vv.offsetLeft : 0;
    const oy = vv ? vv.offsetTop : 0;
    const W = viewW();
    const H = viewH();
    Object.assign(this.host.style, { left: `${ox}px`, top: `${oy}px`, width: `${W}px`, height: `${H}px` });
    const r = el === root() ? null : el.getBoundingClientRect();
    const box = r ? { left: clamp(r.left - ox, 0, W), top: clamp(r.top - oy, 0, H), right: clamp(r.right - ox, 0, W), bottom: clamp(r.bottom - oy, 0, H) } : { left: 0, top: 0, right: W, bottom: H };
    this.v.style.top = `${box.top + 3}px`;
    this.v.style.bottom = `${H - box.bottom + 9}px`;
    this.v.style.right = `${W - box.right + 2}px`;
    this.h.style.left = `${box.left + 3}px`;
    this.h.style.right = `${W - box.right + 9}px`;
    this.h.style.bottom = `${H - box.bottom + 2}px`;
    for (const [bar, thumb, axis] of [[this.v, this.vt, 'y'], [this.h, this.ht, 'x']]) {
      bar.hidden = !this.geo(axis);
      const g = this.geo(axis);
      if (!g) continue;
      if (axis === 'y') { thumb.style.height = `${g.size}px`; thumb.style.transform = `translateY(${g.at}px)`; }
      else { thumb.style.width = `${g.size}px`; thumb.style.transform = `translateX(${g.at}px)`; }
    }
    if (moved) this.show();
  },
  down(e, bar, axis) {
    const g = this.geo(axis);
    if (!g || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    active('down');
    const thumb = bar.firstElementChild;
    const r = bar.getBoundingClientRect();
    const p = axis === 'y' ? e.clientY - r.top : e.clientX - r.left;
    // Clic dans le rail : la poignée vient sous le pointeur, puis suit le glissement.
    let start = g.pos;
    if (e.target !== thumb) {
      start = clamp((p - g.size / 2) / Math.max(1, g.track - g.size), 0, 1) * g.max;
      setScroll(this.el, axis === 'x' ? start : null, axis === 'y' ? start : null);
    }
    const origin = axis === 'y' ? e.clientY : e.clientX;
    this.grab = axis;
    bar.classList.add('grab');
    bar.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const d = (axis === 'y' ? ev.clientY : ev.clientX) - origin;
      const v = clamp(start + d / Math.max(1, g.track - g.size) * g.max, 0, g.max);
      setScroll(this.el, axis === 'x' ? v : null, axis === 'y' ? v : null);
      active('drag');
    };
    const up = () => {
      this.grab = null;
      bar.classList.remove('grab');
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up);
      bar.removeEventListener('pointercancel', up);
      this.show();
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
  },
};

// ---------------------------------------------------------------- clics, saisies et navigation synchronisés
const CLICKABLE = 'a[href], button, input, select, textarea, label, summary, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [onclick], [tabindex]';
function describe(el, e) {
  const r = el.getBoundingClientRect();
  return {
    sel: cssPath(el),
    tag: el.tagName.toLowerCase(),
    text: textOf(el),
    href: el.getAttribute && el.getAttribute('href'),
    id: el.id || null,
    name: el.getAttribute && el.getAttribute('name'),
    rx: r.width ? clamp((e.clientX - r.left) / r.width, 0, 1) : 0.5,
    ry: r.height ? clamp((e.clientY - r.top) / r.height, 0, 1) : 0.5,
    fx: e.clientX / Math.max(1, innerWidth),
    fy: e.clientY / Math.max(1, innerHeight),
  };
}
// Même élément sur un autre appareil : par son chemin, sinon par son identifiant, son lien ou son texte.
function locateEl(d) {
  if (!d) return null;
  const ok = (el) => el && el.tagName && el.tagName.toLowerCase() === d.tag;
  let el = d.id ? document.getElementById(d.id) : null;
  if (ok(el)) return el;
  el = find(d.sel);
  if (ok(el) && (!d.text || textOf(el) === d.text)) return el;
  const pool = [...document.querySelectorAll(d.tag || '*')].slice(0, 5000);
  if (d.href) { const m = pool.find((x) => x.getAttribute('href') === d.href && (!d.text || textOf(x) === d.text)) || pool.find((x) => x.getAttribute('href') === d.href); if (m) return m; }
  if (d.name) { const m = pool.find((x) => x.getAttribute('name') === d.name); if (m) return m; }
  if (d.text) { const m = pool.find((x) => textOf(x) === d.text && x.getClientRects().length); if (m) return m; }
  return ok(el) ? el : null;
}
const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < viewH() && r.left < viewW(); };
function onClickCapture(e) {
  if (swallowClick && now() - swallowClick < 80) {
    // Fin d'un glissement : ce n'était pas un clic.
    swallowClick = 0;
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }
  if (!e.isTrusted || !cfg.syncClicks || now() - replayClick < 600) return;
  const t = e.composedPath ? e.composedPath()[0] : e.target;
  if (!t || t.nodeType !== 1 || bars.owns(t)) return;
  const el = (t.closest && t.closest(CLICKABLE)) || t;
  send('vitrine-click', describe(el, e));
}
function locate(d) {
  const el = locateEl(d);
  if (!el) return { req: d.req, ok: false };
  if (!visible(el)) el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return { req: d.req, ok: false };
  let x = r.left + clamp(d.rx == null ? 0.5 : d.rx, 0.1, 0.9) * r.width;
  let y = r.top + clamp(d.ry == null ? 0.5 : d.ry, 0.1, 0.9) * r.height;
  const hit = document.elementFromPoint(x, y);
  if (!hit || (hit !== el && !el.contains(hit))) { x = r.left + r.width / 2; y = r.top + r.height / 2; }
  // Page agrandie par l'émulation (pages sans balise viewport) : coordonnées de l'écran de l'appareil.
  const vv = window.visualViewport;
  if (vv && vv.scale && vv.scale !== 1) { x = (x - vv.offsetLeft) * vv.scale; y = (y - vv.offsetTop) * vv.scale; }
  replayClick = now();
  return { req: d.req, ok: true, x, y };
}
function doClick(d) {
  const el = locateEl(d);
  if (!el) return;
  replayClick = now();
  if (!visible(el)) el.scrollIntoView({ block: 'center', behavior: 'instant' });
  try { el.focus({ preventScroll: true }); } catch { /* non focalisable */ }
  el.click();
}
const FIELDS = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
function onInputCapture(e) {
  if (!e.isTrusted || !cfg.syncInput || now() - replayInput < 300) return;
  const el = e.target;
  if (!el || !el.matches || !el.matches(FIELDS)) return;
  const type = (el.getAttribute('type') || '').toLowerCase();
  if (type === 'password' || type === 'file') return; // jamais de mot de passe ni de fichier recopiés
  send('vitrine-input', {
    sel: cssPath(el), tag: el.tagName.toLowerCase(), id: el.id || null, name: el.getAttribute('name'), type,
    value: el.isContentEditable ? el.innerText : el.value, checked: 'checked' in el ? el.checked : null,
  });
}
function setInput(d) {
  if (!d) return;
  let el = d.id ? document.getElementById(d.id) : null;
  if (!el && d.name) {
    const list = [...document.getElementsByName(d.name)];
    el = d.type === 'radio' ? list.find((x) => x.value === d.value) || null : list[0] || null;
  }
  if (!el) el = find(d.sel);
  if (!el || !el.matches || !el.matches(FIELDS)) return;
  replayInput = now();
  if (el.isContentEditable) el.innerText = d.value || '';
  else if (d.type === 'checkbox' || d.type === 'radio') el.checked = Boolean(d.checked);
  else {
    // Setter natif : les sites React et Vue voient la modification comme une saisie.
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, d.value == null ? '' : d.value); else el.value = d.value;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
// Navigation d'une application d'une seule page (même document) : par un lien de la page, sinon par l'historique.
function spaNav(d) {
  const url = d && d.url;
  let target;
  try { target = new URL(url, location.href); } catch { send('vitrine-spa-done', { ok: false, url }); return; }
  if (target.href === location.href) { send('vitrine-spa-done', { ok: true, url }); return; }
  if (target.origin !== location.origin) { send('vitrine-spa-done', { ok: false, url }); return; }
  replayClick = now();
  const link = [...document.querySelectorAll('a[href]')].find((a) => { try { return new URL(a.getAttribute('href'), location.href).href === target.href && !a.target; } catch { return false; } });
  if (link) link.click();
  else if (target.pathname === location.pathname && target.search === location.search) location.hash = target.hash;
  else {
    history.pushState(history.state, '', target.href);
    window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  }
  setTimeout(() => send('vitrine-spa-done', { ok: location.href === target.href, url }), 450);
}

// ---------------------------------------------------------------- éléments signalés par l'audit
let marks = null;
function highlight(sel) {
  let list = [];
  try { list = [...document.querySelectorAll(sel)].slice(0, 20); } catch { return; }
  if (!list.length) return;
  if (!visible(list[0])) list[0].scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  if (marks) marks.remove();
  const host = document.createElement('vitrine-marks');
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;display:block';
  const sr = host.attachShadow({ mode: 'closed' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync('.m { position: fixed; box-sizing: border-box; border: 2px solid #2f6bff; background: rgba(47,107,255,.14); border-radius: 3px; animation: p 1.2s ease-in-out 2; } @keyframes p { 50% { background: rgba(47,107,255,.32); } }');
  sr.adoptedStyleSheets = [sheet];
  for (const el of list) {
    const r = el.getBoundingClientRect();
    const m = document.createElement('div');
    m.className = 'm';
    m.style.cssText = `left:${r.left - 2}px;top:${r.top - 2}px;width:${r.width + 4}px;height:${r.height + 4}px`;
    sr.appendChild(m);
  }
  document.documentElement.appendChild(host);
  marks = host;
  setTimeout(() => { if (marks === host) { host.remove(); marks = null; } }, 3000);
}

// ---------------------------------------------------------------- messages de l'interface
on('vitrine-config', (c) => {
  Object.assign(cfg, c || {});
  configured = true;
  hostBars = Boolean(c && 'syncScroll' in c);
  if (!cfg.dragScroll && drag) onDragUp();
  if (document.documentElement) { applyTouchCursor(); bars.sync(); lastSent = ''; queueReport(); }
});
on('vitrine-scroll-to', (d) => {
  const el = (d && d.path && find(d.path)) || mainScroller();
  setScroll(el, d && d.x != null ? d.x : null, d && d.y != null ? d.y : null);
});
on('vitrine-scroll-sync', (d) => {
  if (!d) return;
  const el = mainScroller();
  const m = metrics(el);
  let y = null;
  const a = d.anchor && find(d.anchor.sel);
  if (a) {
    const r = a.getBoundingClientRect();
    const top = el === root() ? 0 : el.getBoundingClientRect().top;
    y = m.y + (r.top - top) + (Number(d.anchor.k) || 0) * r.height;
  } else if (d.ry != null) y = d.ry * Math.max(0, m.sh - m.ch);
  const x = d.rx != null ? d.rx * Math.max(0, m.sw - m.cw) : null;
  setScroll(el, x, y == null ? null : clamp(y, 0, Math.max(0, m.sh - m.ch)));
});
on('vitrine-scroll-ratio', (d) => {
  if (!d) return;
  const el = mainScroller();
  const m = metrics(el);
  setScroll(el, d.rx != null ? d.rx * Math.max(0, m.sw - m.cw) : null, d.ry != null ? d.ry * Math.max(0, m.sh - m.ch) : null);
});
on('vitrine-locate', (d) => send('vitrine-located', locate(d || {})));
on('vitrine-do-click', doClick);
on('vitrine-set-input', setInput);
on('vitrine-spa-nav', spaNav);
on('vitrine-highlight', highlight);

// ---------------------------------------------------------------- écouteurs de la page
let pointerRaf = 0;
let pendingPointer = null;
function pointer(e, type) {
  if (!cfg.pointer || !e.isTrusted) return;
  pendingPointer = { type, x: e.clientX, y: e.clientY };
  if (type !== 'move') { send('vitrine-pointer', pendingPointer); pendingPointer = null; return; }
  if (!pointerRaf) pointerRaf = requestAnimationFrame(() => { pointerRaf = 0; if (pendingPointer) send('vitrine-pointer', pendingPointer); pendingPointer = null; });
}
window.addEventListener('pointerdown', (e) => { if (e.isTrusted) active('down'); pointer(e, 'down'); onDragDown(e); }, true);
window.addEventListener('pointermove', (e) => { pointer(e, 'move'); onDragMove(e); if (bars.host && e.pointerType === 'mouse' && bars.m) { const vv = window.visualViewport; const x = e.clientX - (vv ? vv.offsetLeft : 0); const y = e.clientY - (vv ? vv.offsetTop : 0); if (viewW() - x < 24 || viewH() - y < 24) bars.show(); } }, { capture: true, passive: false });
window.addEventListener('pointerup', (e) => { pointer(e, 'up'); onDragUp(e); }, true);
window.addEventListener('pointercancel', (e) => { pointer(e, 'cancel'); onDragUp(e); }, true);
window.addEventListener('dragstart', (e) => { if (drag) e.preventDefault(); }, true);
window.addEventListener('click', onClickCapture, true);
window.addEventListener('input', onInputCapture, true);
window.addEventListener('change', onInputCapture, true);
window.addEventListener('wheel', (e) => { if (e.isTrusted) { stopInertia(); active('wheel'); } }, { capture: true, passive: true });
window.addEventListener('keydown', (e) => { if (e.isTrusted) active('key'); }, true);
window.addEventListener('touchstart', (e) => { if (e.isTrusted) active('down'); }, { capture: true, passive: true });
// Défilement de n'importe quel bloc : un grand bloc qui défile devient la zone principale.
document.addEventListener('scroll', (e) => {
  const t = e.target;
  if (t && t.nodeType === 1 && t !== root() && t.clientWidth * t.clientHeight > innerWidth * innerHeight * 0.3) { mainEl = t; mainAt = now(); }
  queueReport();
  queueTop(300);
}, { capture: true, passive: true });
window.addEventListener('resize', () => { mainScroller(true); bars.sync(); queueReport(); queueTop(); });
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => { if (bars.host) bars.update(mainScroller()); queueReport(); });
  window.visualViewport.addEventListener('scroll', () => { if (bars.host) bars.update(mainScroller()); });
}

function start() {
  applyTouchCursor();
  bars.sync();
  mainScroller(true);
  queueReport();
  queueTop(0);
  // Contenu chargé ou changé après coup (images, applications d'une seule page) : hauteurs et couleur à jour.
  let pending = 0;
  const refresh = () => { if (pending) return; pending = setTimeout(() => { pending = 0; mainScroller(true); if (!bars.host && bars.wanted()) bars.sync(); queueReport(); queueTop(0); }, 400); };
  try {
    new MutationObserver(refresh).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    new ResizeObserver(refresh).observe(document.documentElement);
  } catch { /* observateurs indisponibles */ }
  window.addEventListener('load', refresh);
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => queueTop(0)); } catch { /* media */ }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
