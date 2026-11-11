// Script des sites affichés par NEXORA : chaque <webview> du Responsive Lab, du Browser Lab, de l'aperçu du Dev Lab et
// de l'App Builder (jamais VS Code), posé par main.js (`will-attach-webview`, WEBVIEW_PRELOAD).
// NEXORA #114 : ce fichier était attendu depuis l'origine mais manquait aux sources comme au logiciel publié. Sans lui,
// les barres de défilement des appareils du Responsive Lab restaient vides (aucun état de défilement reçu), la page ne
// se glissait pas à la souris et, sur téléphone et tablette, où main.js masque les barres natives, seule la molette
// faisait défiler (aucun défilement horizontal) ; la synchronisation des appareils (défilement, clics, saisie,
// navigation) et la couleur de la barre d'état ne fonctionnaient pas non plus. Il est réécrit d'après le protocole que
// lit l'interface (`chunk-NXGVNXL4.js`, `browserlab-UGHKGTIY.js`, `devlab-T6IBPWI7.js`, `chunk-5NQJ7RFA.js`).
// Monde isolé (contextIsolation, sandbox) : rien n'est exposé aux scripts de la page.
'use strict';

const { ipcRenderer } = require('electron');

const cfg = {
  dragScroll: false, touch: false, pointer: false, syncClicks: false, syncNav: false, syncScroll: false, syncInput: false, hostBars: false,
};
let configured = false; // l'hôte a envoyé ses réglages (vitrine-config)
let mobile = false; // émulation de téléphone ou de tablette (barres natives masquées par main.js)
let capturing = false;

const toHost = (channel, data) => { try { ipcRenderer.sendToHost(channel, data); } catch { /* hôte fermé */ } };
const root = () => document.scrollingElement || document.documentElement;
const isRoot = (el) => !el || el === root() || el === document.documentElement || el === document.body;
const now = () => performance.now();

// ---------------------------------------------------------------- repérage des éléments
function uniqueId(el) {
  if (!el.id) return null;
  try { return document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1 ? `#${CSS.escape(el.id)}` : null; } catch { return null; }
}
function pathOf(el) {
  if (!el || el.nodeType !== 1 || isRoot(el)) return null;
  const parts = [];
  for (let e = el; e && e.nodeType === 1 && e !== document.documentElement; e = e.parentElement) {
    const id = uniqueId(e);
    if (id) { parts.unshift(id); return parts.join(' > '); }
    let i = 1;
    for (let s = e.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === e.tagName) i += 1;
    parts.unshift(`${e.tagName.toLowerCase()}:nth-of-type(${i})`);
  }
  return `:root > ${parts.join(' > ')}`;
}
function byPath(p) {
  if (!p) return null;
  try { return document.querySelector(p); } catch { return null; }
}
const textOf = (el) => String((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim().slice(0, 80);
function visible(el) {
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  const s = getComputedStyle(el);
  return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
}
// Point de la page en pixels CSS de l'écran de l'appareil (zoom d'une page non adaptée compris).
function screenPoint(cx, cy) {
  const vv = window.visualViewport;
  if (!vv) return { x: cx, y: cy };
  return { x: (cx - vv.offsetLeft) * vv.scale, y: (cy - vv.offsetTop) * vv.scale };
}

// ---------------------------------------------------------------- élément qui défile
const SCROLLS = /(auto|scroll|overlay)/;
function canScroll(el, axis) {
  if (!el || el.nodeType !== 1) return false;
  if (isRoot(el)) {
    const r = root();
    return axis === 'x' ? r.scrollWidth > r.clientWidth + 1 : r.scrollHeight > r.clientHeight + 1;
  }
  const s = getComputedStyle(el);
  if (axis === 'x') return SCROLLS.test(s.overflowX) && el.scrollWidth > el.clientWidth + 1;
  return SCROLLS.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1;
}
const pageScrolls = () => canScroll(root(), 'y') || canScroll(root(), 'x');
function bigEnough(el) {
  const r = el.getBoundingClientRect();
  return r.width * r.height >= innerWidth * innerHeight * 0.4;
}
let scroller = null; // null : la page elle-même
let lastScan = 0;
// Application en une page : la page ne défile pas, un conteneur plein écran défile à sa place.
function scanScroller() {
  lastScan = now();
  if (pageScrolls()) { scroller = null; return; }
  if (scroller && scroller.isConnected && (canScroll(scroller, 'y') || canScroll(scroller, 'x')) && bigEnough(scroller)) return;
  scroller = null;
  const all = document.body ? document.body.getElementsByTagName('*') : [];
  let best = 0;
  for (let i = 0; i < all.length && i < 4000; i += 1) {
    const el = all[i];
    if (el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1) continue;
    if (!(canScroll(el, 'y') || canScroll(el, 'x')) || !bigEnough(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width * r.height > best) { best = r.width * r.height; scroller = el; }
  }
}
function metrics() {
  const el = scroller && scroller.isConnected ? scroller : root();
  return {
    x: el.scrollLeft, y: el.scrollTop, sw: el.scrollWidth, sh: el.scrollHeight, cw: el.clientWidth, ch: el.clientHeight,
  };
}
function setScroll(el, { x, y }) {
  const t = el || root();
  const opts = { behavior: 'instant' };
  if (Number.isFinite(x)) opts.left = x;
  if (Number.isFinite(y)) opts.top = y;
  try { t.scrollTo(opts); } catch { if (Number.isFinite(x)) t.scrollLeft = x; if (Number.isFinite(y)) t.scrollTop = y; }
}
// Haut d'un élément dans la zone qui défile (pour aligner un même repère sur tous les appareils).
function topIn(el, sc) {
  const r = el.getBoundingClientRect();
  if (!sc) return r.top + root().scrollTop;
  return r.top - sc.getBoundingClientRect().top + sc.scrollTop;
}
const ANCHORS = 'section, article, header, footer, main, nav, h1, h2, h3, h4, h5, h6, li, figure, form, [id]';
function anchor() {
  try {
    const sc = scroller && scroller.isConnected ? scroller : null;
    const box = sc ? sc.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    let el = document.elementFromPoint(box.left + box.width / 2, box.top + Math.min(40, box.height / 4));
    while (el && !isRoot(el) && el !== sc) {
      if (el.matches(ANCHORS) && el.getBoundingClientRect().height <= box.height * 3) break;
      el = el.parentElement;
    }
    if (!el || isRoot(el) || el === sc) return null;
    const h = Math.max(1, el.getBoundingClientRect().height);
    const pos = sc ? sc.scrollTop : root().scrollTop;
    return { path: pathOf(el), off: (pos - topIn(el, sc)) / h };
  } catch { return null; }
}

let lastSent = '';
let queued = false;
function report() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    if (!document.documentElement) return;
    if (now() - lastScan > 1000) scanScroller();
    const m = metrics();
    m.path = scroller && scroller.isConnected ? pathOf(scroller) : null;
    const key = JSON.stringify(m);
    if (key !== lastSent) {
      lastSent = key;
      if (cfg.syncScroll) m.anchor = anchor();
      toHost('vitrine-scroll', m);
    }
    bars.update(m);
  });
}

// ---------------------------------------------------------------- couleur du haut de la page (barre d'état)
function colorOf(el) {
  const s = getComputedStyle(el);
  const c = s.backgroundColor;
  if (c && !/rgba\(0,\s*0,\s*0,\s*0\)|transparent/.test(c)) {
    const a = /rgba\([^)]*,\s*([\d.]+)\)/.exec(c);
    if (!a || Number(a[1]) > 0.5) return c;
  }
  const bi = s.backgroundImage;
  if (bi && bi !== 'none') { const m = bi.match(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}/); if (m) return m[0]; }
  return '';
}
function themeColor() {
  let any = '';
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
    const content = (m.getAttribute('content') || '').trim();
    const media = m.getAttribute('media');
    if (!content) continue;
    if (!media) { if (!any) any = content; continue; }
    try { if (matchMedia(media).matches) return content; } catch { /* media invalide */ }
  }
  return any;
}
let lastTop = '';
let topAt = 0;
function reportTop(force) {
  if (!force && now() - topAt < 250) return;
  topAt = now();
  try {
    let el = document.elementFromPoint(innerWidth / 2, 1);
    let color = '';
    while (el && !color) { color = colorOf(el); el = el.parentElement; }
    color = color || themeColor() || (document.body && colorOf(document.body)) || '#ffffff';
    if (color !== lastTop) { lastTop = color; toHost('vitrine-top', color); }
  } catch { /* page en cours de chargement */ }
}

// ---------------------------------------------------------------- barres de défilement dans la page
// Seulement là où l'hôte n'en dessine pas à côté de l'appareil (App Builder, Browser Lab et aperçu du Dev Lab en mode
// mobile) : barres fines superposées comme sur un téléphone, qui apparaissent au survol et au défilement, se saisissent
// à la souris, n'enlèvent aucune largeur au site et disparaissent pendant les captures.
const BAR_CSS = `
.w{position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483647;contain:strict;transform-origin:0 0}
.b{position:absolute;opacity:0;transition:opacity .3s ease}
.b.v{top:3px;bottom:12px;right:0;width:calc(12px*var(--k,1))}
.b.h{left:3px;right:12px;bottom:0;height:calc(12px*var(--k,1))}
.w.on .b.can,.b.can.drag{opacity:1;transition-duration:.12s}
.t{position:absolute;border-radius:99px;background:rgba(20,20,20,.5);box-shadow:0 0 0 1px rgba(255,255,255,.6);pointer-events:auto;cursor:default;transition:width .15s,height .15s,background .15s}
.t::before{content:"";position:absolute;inset:calc(-6px*var(--k,1))}
.b:not(.can) .t{pointer-events:none}
.v .t{right:calc(3px*var(--k,1));width:calc(5px*var(--k,1));top:0}
.h .t{bottom:calc(3px*var(--k,1));height:calc(5px*var(--k,1));left:0}
.v .t:hover,.v.drag .t{width:calc(8px*var(--k,1));background:rgba(20,20,20,.68)}
.h .t:hover,.h.drag .t{height:calc(8px*var(--k,1));background:rgba(20,20,20,.68)}
.hl{position:absolute;display:none;border:2px solid #2f6bff;background:rgba(47,107,255,.12);border-radius:3px}
.w.cap .b,.w.cap .hl{display:none!important}`;

const bars = {
  host: null, wrap: null, v: null, h: null, hl: null, m: null, hideAt: 0, hover: false, timer: null,
  wanted() { return mobile && !cfg.hostBars; },
  ensure() {
    if (this.host && this.host.isConnected) return true;
    if (!document.documentElement) return false;
    this.host = document.createElement('div');
    this.host.setAttribute('data-nexora', 'defilement');
    this.host.style.cssText = 'all:initial;position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647';
    const sh = this.host.attachShadow({ mode: 'closed' });
    sh.innerHTML = `<style>${BAR_CSS}</style><div class="w"><div class="b v"><div class="t"></div></div><div class="b h"><div class="t"></div></div><div class="hl"></div></div>`;
    this.wrap = sh.querySelector('.w');
    this.v = sh.querySelector('.b.v');
    this.h = sh.querySelector('.b.h');
    this.hl = sh.querySelector('.hl');
    this.bindThumb(this.v, 'y');
    this.bindThumb(this.h, 'x');
    document.documentElement.appendChild(this.host);
    this.wrap.classList.toggle('cap', capturing);
    return true;
  },
  // Suit la zone visible (zoom d'une page non adaptée) ; l'épaisseur reste la même à l'écran.
  place() {
    const vv = window.visualViewport;
    if (!vv || !this.wrap) return;
    const k = 1 / (vv.scale || 1);
    Object.assign(this.wrap.style, {
      width: `${vv.width}px`, height: `${vv.height}px`, transform: `translate(${vv.offsetLeft}px, ${vv.offsetTop}px)`,
    });
    this.wrap.style.setProperty('--k', String(k));
  },
  update(m) {
    this.m = m;
    if (!this.wanted()) { if (this.host) this.host.remove(); this.host = null; return; }
    if (!this.ensure()) return;
    this.place();
    for (const [bar, axis] of [[this.v, 'y'], [this.h, 'x']]) {
      const total = axis === 'y' ? m.sh : m.sw;
      const view = axis === 'y' ? m.ch : m.cw;
      const pos = axis === 'y' ? m.y : m.x;
      const max = Math.max(0, total - view);
      bar.classList.toggle('can', max > 1);
      if (max <= 1) continue;
      const track = axis === 'y' ? bar.clientHeight : bar.clientWidth;
      const len = Math.max(28, track * (view / total));
      const at = (track - len) * Math.min(1, Math.max(0, pos / max));
      const t = bar.firstElementChild;
      t.style[axis === 'y' ? 'height' : 'width'] = `${len}px`;
      t.style.transform = axis === 'y' ? `translateY(${at}px)` : `translateX(${at}px)`;
    }
  },
  show() {
    if (!this.wrap) return;
    this.wrap.classList.add('on');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { if (!this.hover && !this.dragging) this.wrap.classList.remove('on'); }, 1500);
  },
  bindThumb(bar, axis) {
    const t = bar.firstElementChild;
    t.addEventListener('pointerenter', () => { this.hover = true; this.show(); });
    t.addEventListener('pointerleave', () => { this.hover = false; this.show(); });
    t.addEventListener('pointerdown', (e) => {
      const m = this.m;
      if (!m || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      stopMomentum();
      t.setPointerCapture(e.pointerId);
      bar.classList.add('drag');
      this.dragging = true;
      toHost('vitrine-active', 'down');
      const el = scroller && scroller.isConnected ? scroller : null;
      const start = axis === 'y' ? e.clientY : e.clientX;
      const pos0 = axis === 'y' ? m.y : m.x;
      const total = axis === 'y' ? m.sh : m.sw;
      const view = axis === 'y' ? m.ch : m.cw;
      const max = Math.max(1, total - view);
      const track = axis === 'y' ? bar.clientHeight : bar.clientWidth;
      const len = Math.max(28, track * (view / total));
      const k = (window.visualViewport && window.visualViewport.scale) || 1;
      const move = (ev) => {
        const d = ((axis === 'y' ? ev.clientY : ev.clientX) - start) * k;
        setScroll(el, { [axis]: pos0 + (d / Math.max(1, track * k - len * k)) * max });
        activity('drag');
      };
      const end = () => {
        bar.classList.remove('drag');
        this.dragging = false;
        t.removeEventListener('pointermove', move);
        t.removeEventListener('pointerup', end);
        t.removeEventListener('pointercancel', end);
        this.show();
      };
      t.addEventListener('pointermove', move);
      t.addEventListener('pointerup', end);
      t.addEventListener('pointercancel', end);
    });
  },
  highlight(el) {
    if (!el || !this.ensure()) return;
    this.place();
    try { el.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch { /* élément détaché */ }
    const r = el.getBoundingClientRect();
    const vv = window.visualViewport;
    const ox = vv ? vv.offsetLeft : 0;
    const oy = vv ? vv.offsetTop : 0;
    Object.assign(this.hl.style, {
      display: 'block', left: `${r.left - ox - 2}px`, top: `${r.top - oy - 2}px`, width: `${r.width}px`, height: `${r.height}px`,
    });
    clearTimeout(this.hlTimer);
    this.hlTimer = setTimeout(() => {
      if (this.hl) this.hl.style.display = 'none';
      if (!this.wanted() && this.host) { this.host.remove(); this.host = null; }
    }, 1800);
  },
};

// ---------------------------------------------------------------- activité (appareil qui mène la synchronisation)
let activeAt = 0;
function activity(kind) {
  if (now() - activeAt < 200 && kind !== 'down') return;
  activeAt = now();
  toHost('vitrine-active', kind);
}

// ---------------------------------------------------------------- glissement à la souris (comme un doigt)
const NO_DRAG = 'input, textarea, select, option, button[draggable="true"], [contenteditable=""], [contenteditable="true"], [draggable="true"], video, audio, canvas, iframe, embed, object';
let drag = null;
let momentum = null;
let swallowClick = 0;
function stopMomentum() { if (momentum) cancelAnimationFrame(momentum); momentum = null; }
const dragOn = () => (configured ? cfg.dragScroll && (cfg.touch || mobile) : mobile);
function blocksDrag(target) {
  for (let el = target; el && el.nodeType === 1; el = el.parentElement) {
    if (el.matches(NO_DRAG)) return true;
    const ta = getComputedStyle(el).touchAction;
    if (ta === 'none' || ta === 'pinch-zoom') return true;
    if (el === document.body) break;
  }
  return false;
}
function scrollParent(el, axis) {
  for (let e = el; e && e.nodeType === 1 && !isRoot(e); e = e.parentElement) if (canScroll(e, axis)) return e;
  return null;
}
// Fait défiler l'élément, puis la page avec ce qui reste (comme un geste sur un téléphone).
function scrollChain(el, dx, dy) {
  let rx = dx;
  let ry = dy;
  if (el) {
    const x0 = el.scrollLeft;
    const y0 = el.scrollTop;
    el.scrollLeft = x0 + dx;
    el.scrollTop = y0 + dy;
    rx = dx - (el.scrollLeft - x0);
    ry = dy - (el.scrollTop - y0);
  }
  const r = root();
  if (Math.abs(rx) >= 0.5 || Math.abs(ry) >= 0.5) {
    const x0 = r.scrollLeft;
    const y0 = r.scrollTop;
    r.scrollLeft = x0 + rx;
    r.scrollTop = y0 + ry;
    return Math.abs(r.scrollLeft - x0) + Math.abs(r.scrollTop - y0) + Math.abs(dx - rx) + Math.abs(dy - ry);
  }
  return Math.abs(dx) + Math.abs(dy);
}

// ---------------------------------------------------------------- synchronisation des clics et de la saisie
const CLICKABLE = 'a[href], button, input, select, textarea, label, summary, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], [role="checkbox"], [role="switch"], [onclick], [tabindex]';
function describe(target, e) {
  const el = (target.closest && target.closest(CLICKABLE)) || target;
  const r = el.getBoundingClientRect();
  return {
    path: pathOf(el),
    tag: el.tagName.toLowerCase(),
    text: textOf(el),
    href: el.getAttribute('href') || null,
    label: el.getAttribute('aria-label') || el.getAttribute('title') || null,
    name: el.getAttribute('name') || null,
    rx: r.width ? Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) : 0.5,
    ry: r.height ? Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) : 0.5,
  };
}
function findTarget(d) {
  if (!d) return null;
  const same = (el) => el && el.tagName.toLowerCase() === d.tag
    && (!d.text || textOf(el) === d.text)
    && (!d.href || el.getAttribute('href') === d.href);
  const byP = byPath(d.path);
  if (same(byP)) return byP;
  let list = [];
  try { list = [...document.querySelectorAll(d.tag)]; } catch { return null; }
  const match = list.filter((el) => (d.href && el.getAttribute('href') === d.href && (!d.text || textOf(el) === d.text))
    || (d.label && (el.getAttribute('aria-label') === d.label || el.getAttribute('title') === d.label))
    || (d.text && textOf(el) === d.text)
    || (d.name && el.getAttribute('name') === d.name));
  // Sur un téléphone, un même lien existe souvent en deux exemplaires (menu d'ordinateur masqué, menu mobile) : le
  // visible d'abord.
  return match.find(visible) || match[0] || (byP && byP.tagName.toLowerCase() === d.tag ? byP : null);
}
function fieldOf(t) {
  if (!t || t.nodeType !== 1) return null;
  if (t.matches('input, textarea, select')) return t;
  return t.isContentEditable ? t.closest('[contenteditable]') || t : null;
}
function findField(d) {
  const p = byPath(d.path);
  if (p && p.tagName.toLowerCase() === d.tag) return p;
  if (d.id) { const el = document.getElementById(d.id); if (el) return el; }
  if (d.name) {
    try {
      const list = [...document.querySelectorAll(`${d.tag}[name="${CSS.escape(d.name)}"]`)];
      return list.find(visible) || list[0] || null;
    } catch { return null; }
  }
  return null;
}
const nativeSetter = (el) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  return desc && desc.set;
};

// ---------------------------------------------------------------- événements de la page
function onPointerDown(e) {
  if (!e.isTrusted) return;
  stopMomentum();
  activity('down');
  if (cfg.pointer) toHost('vitrine-pointer', { type: 'down', ...screenPoint(e.clientX, e.clientY) });
}
let moveQueued = null;
function onPointerMove(e) {
  bars.show();
  if (!cfg.pointer || !e.isTrusted) return;
  const p = screenPoint(e.clientX, e.clientY);
  if (moveQueued) { moveQueued = p; return; }
  moveQueued = p;
  requestAnimationFrame(() => { toHost('vitrine-pointer', { type: 'move', ...moveQueued }); moveQueued = null; });
}
function onPointerUp(e) {
  if (cfg.pointer && e.isTrusted) toHost('vitrine-pointer', { type: 'up', ...screenPoint(e.clientX, e.clientY) });
}

// mousedown en phase de bouillonnement sur window : si un script de la page a déjà pris la main (carrousel, carte,
// curseur…), il garde le geste.
function onMouseDown(e) {
  drag = null;
  if (!e.isTrusted || e.button !== 0 || e.defaultPrevented || !dragOn()) return;
  if (e.composedPath().includes(bars.host)) return;
  if (blocksDrag(e.target)) return;
  drag = {
    x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: now(), target: e.target, el: null, moved: false, vx: 0, vy: 0,
  };
}
function onMouseMove(e) {
  if (!drag) return;
  if (!(e.buttons & 1)) { drag = null; return; }
  if (!drag.moved) {
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    drag.el = scrollParent(drag.target, Math.abs(dx) > Math.abs(dy) ? 'x' : 'y') || scrollParent(drag.target, Math.abs(dx) > Math.abs(dy) ? 'y' : 'x');
    try { getSelection().removeAllRanges(); } catch { /* aucune sélection */ }
  }
  e.preventDefault();
  const t = now();
  // clientX et clientY sont relatifs à la zone affichée : ils ne changent pas quand la page défile sous le pointeur, et
  // sont déjà en pixels CSS (zoom d'une page non adaptée compris), comme le contenu à déplacer.
  const ddx = drag.lx - e.clientX;
  const ddy = drag.ly - e.clientY;
  drag.lx = e.clientX;
  drag.ly = e.clientY;
  scrollChain(drag.el, ddx, ddy);
  const dt = Math.max(1, t - drag.t);
  drag.vx = drag.vx * 0.6 + (ddx / dt) * 0.4;
  drag.vy = drag.vy * 0.6 + (ddy / dt) * 0.4;
  drag.t = t;
  activity('drag');
}
function onMouseUp() {
  const d = drag;
  drag = null;
  if (!d || !d.moved) return;
  swallowClick = now();
  // Élan : la page continue sur sa lancée puis ralentit, comme après un geste rapide.
  if (now() - d.t > 80) return;
  let vx = d.vx;
  let vy = d.vy;
  let last = now();
  const step = () => {
    const t = now();
    const dt = Math.min(40, t - last);
    last = t;
    const f = 0.995 ** dt;
    vx *= f;
    vy *= f;
    if (Math.abs(vx) + Math.abs(vy) < 0.03) { momentum = null; return; }
    if (scrollChain(d.el, vx * dt, vy * dt) < 0.1) { momentum = null; return; }
    momentum = requestAnimationFrame(step);
  };
  if (Math.abs(vx) + Math.abs(vy) > 0.15) momentum = requestAnimationFrame(step);
}
function onClickCapture(e) {
  if (swallowClick && now() - swallowClick < 60) {
    swallowClick = 0;
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }
  if (cfg.syncClicks && e.isTrusted && e.target && e.target.nodeType === 1) {
    try { toHost('vitrine-click', describe(e.target, e)); } catch { /* élément retiré */ }
  }
}
function onInput(e) {
  if (!cfg.syncInput || !e.isTrusted) return;
  const el = fieldOf(e.target);
  if (!el || el.type === 'file') return;
  toHost('vitrine-input', {
    path: pathOf(el),
    tag: el.tagName.toLowerCase(),
    id: el.id || null,
    name: el.getAttribute('name') || null,
    type: el.type || null,
    value: el.isContentEditable && !el.matches('input, textarea, select') ? el.innerText : el.value,
    checked: 'checked' in el ? Boolean(el.checked) : null,
    rich: el.isContentEditable && !el.matches('input, textarea, select'),
  });
}

// ---------------------------------------------------------------- ordres de l'hôte
ipcRenderer.on('vitrine-config', (_e, c) => {
  configured = true;
  Object.assign(cfg, c || {});
  if (!dragOn()) drag = null;
  lastSent = '';
  report();
});
ipcRenderer.on('vitrine-emu', (_e, s) => {
  mobile = Boolean(s && s.mobile);
  lastSent = '';
  report();
});
ipcRenderer.on('vitrine-capture', (_e, on) => {
  capturing = Boolean(on);
  if (bars.wrap) bars.wrap.classList.toggle('cap', capturing);
});
ipcRenderer.on('vitrine-scroll-to', (_e, d) => {
  stopMomentum();
  const el = d && d.path ? byPath(d.path) : null;
  setScroll(el, { x: d && d.x, y: d && d.y });
  bars.show();
});
ipcRenderer.on('vitrine-scroll-ratio', (_e, d) => {
  const m = metrics();
  const el = scroller && scroller.isConnected ? scroller : null;
  setScroll(el, {
    y: d && Number.isFinite(d.ry) ? d.ry * Math.max(0, m.sh - m.ch) : undefined,
    x: d && Number.isFinite(d.rx) ? d.rx * Math.max(0, m.sw - m.cw) : undefined,
  });
});
ipcRenderer.on('vitrine-scroll-sync', (_e, d) => {
  if (!d) return;
  stopMomentum();
  const sc = scroller && scroller.isConnected ? scroller : null;
  const m = metrics();
  const a = d.anchor && byPath(d.anchor.path);
  let y;
  if (a && (!sc || sc.contains(a))) y = topIn(a, sc) + (Number(d.anchor.off) || 0) * Math.max(1, a.getBoundingClientRect().height);
  else if (Number.isFinite(d.ry)) y = d.ry * Math.max(0, m.sh - m.ch);
  const x = Number.isFinite(d.rx) ? d.rx * Math.max(0, m.sw - m.cw) : undefined;
  setScroll(sc, { x, y: Number.isFinite(y) ? Math.max(0, Math.min(y, m.sh - m.ch)) : undefined });
});
ipcRenderer.on('vitrine-locate', (_e, d) => {
  let res = { req: d && d.req, ok: false };
  try {
    const el = findTarget(d);
    if (el && visible(el)) {
      let r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) {
        el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
        r = el.getBoundingClientRect();
      }
      const p = screenPoint(r.left + r.width * (Number.isFinite(d.rx) ? d.rx : 0.5), r.top + r.height * (Number.isFinite(d.ry) ? d.ry : 0.5));
      res = { req: d.req, ok: true, x: p.x, y: p.y };
    }
  } catch { /* page en cours de chargement */ }
  toHost('vitrine-located', res);
});
ipcRenderer.on('vitrine-do-click', (_e, d) => {
  try { const el = findTarget(d); if (el) el.click(); } catch { /* élément introuvable */ }
});
ipcRenderer.on('vitrine-set-input', (_e, d) => {
  try {
    const el = d && findField(d);
    if (!el) return;
    if (d.rich) {
      if (el.innerText !== d.value) { el.innerText = d.value; el.dispatchEvent(new Event('input', { bubbles: true })); }
      return;
    }
    if ((el.type === 'checkbox' || el.type === 'radio') && d.checked != null) {
      if (el.checked !== d.checked) el.click();
      return;
    }
    if (el.value === d.value) return;
    const set = nativeSetter(el);
    if (set) set.call(el, d.value); else el.value = d.value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } catch { /* champ retiré */ }
});
ipcRenderer.on('vitrine-spa-nav', (_e, d) => {
  const url = d && d.url;
  let started = false;
  try {
    const u = new URL(url, location.href);
    if (u.origin === location.origin) {
      started = true;
      if (u.href !== location.href) {
        // Un lien de la page vers cette adresse : le routeur de l'application s'en charge comme d'un clic.
        const link = [...document.querySelectorAll('a[href]')].find((a) => a.href === u.href);
        if (link) link.click();
        else {
          history.pushState(history.state, '', u.href);
          window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
        }
      }
    }
  } catch { started = false; }
  setTimeout(() => toHost('vitrine-spa-done', { ok: started && location.href === new URL(url, location.href).href, url }), 400);
});
ipcRenderer.on('vitrine-highlight', (_e, sel) => {
  try { bars.highlight(typeof sel === 'string' ? document.querySelector(sel) : null); } catch { /* sélecteur invalide */ }
});

// ---------------------------------------------------------------- mise en place
document.addEventListener('scroll', (e) => {
  const t = e.target;
  if (t && t.nodeType === 1 && !isRoot(t) && t !== scroller && !pageScrolls() && bigEnough(t) && (canScroll(t, 'y') || canScroll(t, 'x'))) scroller = t;
  report();
  reportTop(false);
  bars.show();
}, { capture: true, passive: true });
window.addEventListener('wheel', (e) => { if (e.isTrusted) { stopMomentum(); activity('wheel'); } }, { capture: true, passive: true });
window.addEventListener('keydown', (e) => { if (e.isTrusted) activity('key'); }, true);
window.addEventListener('pointerdown', onPointerDown, true);
window.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
window.addEventListener('pointerup', onPointerUp, true);
window.addEventListener('mousedown', onMouseDown, false);
window.addEventListener('mousemove', onMouseMove, { capture: true, passive: false });
window.addEventListener('mouseup', onMouseUp, true);
window.addEventListener('click', onClickCapture, true);
window.addEventListener('selectstart', (e) => { if (drag) e.preventDefault(); }, true);
window.addEventListener('dragstart', (e) => { if (drag) e.preventDefault(); }, true);
window.addEventListener('input', onInput, true);
window.addEventListener('change', onInput, true);
window.addEventListener('resize', () => { lastScan = 0; report(); }, { passive: true });
document.addEventListener('DOMContentLoaded', () => {
  scanScroller();
  report();
  reportTop(true);
  try {
    const ro = new ResizeObserver(() => report());
    ro.observe(document.documentElement);
    if (document.body) ro.observe(document.body);
  } catch { /* navigateur ancien */ }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => report());
    window.visualViewport.addEventListener('scroll', () => report());
  }
});
window.addEventListener('load', () => { lastScan = 0; report(); reportTop(true); });
// Contenus chargés au fil de l'eau (images, listes) : la hauteur change sans aucun événement.
setInterval(() => { if (document.visibilityState === 'visible') { report(); reportTop(false); } }, 900);
try { ipcRenderer.send('vitrine-emu-state'); } catch { /* main.js ancien */ }
