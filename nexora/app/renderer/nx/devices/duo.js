// NEXORA #115 : animation de pliage des appareils pliables « livre » (iPhone Duo, Galaxy Z Fold, Pixel Fold…) du
// Responsive Lab. Au passage de « Ouvert » à « Fermé » (ou l'inverse), le volet tourne autour de la charnière comme
// sur le vrai appareil, au lieu de changer de forme d'un coup. Appelé par setState() de la vue d'appareil
// (chunk-NXGVNXL4.js) : before se termine quand l'appareil peut changer d'état, after() termine l'animation sur
// le nouvel état. Le site reste chargé pendant ce temps (l'appareil réel est seulement rendu transparent).
// Coupé par « Animations : aucune / réduites » des Réglages et par la préférence « Réduire les animations ».
import { settings } from '../core.js';

// Durées ralenties par globalThis.nxFoldSlow (captures du suivi : pnpm captures … --pliage).
const slow = () => Math.max(1, Number(globalThis.nxFoldSlow) || 1);
const FOLD = 520;
const MOVE = 200;
const EASE = 'cubic-bezier(.45, .05, .25, 1)';

const reduced = () => {
  const m = settings.ui && settings.ui.motion;
  return m === 'none' || m === 'reduced' || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
};
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
const done = (a) => (a && a.finished ? a.finished.catch(() => {}) : Promise.resolve());

// Géométrie de l'appareil à l'écran : cadre complet, corps et charnière (coordonnées de la fenêtre).
function geometry(view) {
  const L = view.L;
  const dev = view.$ && view.$.device;
  const body = view.$ && view.$.body;
  if (!L || !dev || !body) return null;
  const d = dev.getBoundingClientRect();
  if (!d.width || !d.height) return null;
  const s = d.width / L.TW;
  const b = L.body || { x: 0, y: 0, w: L.TW, h: L.TH };
  return {
    dev: d, canvas: body.getBoundingClientRect(), s,
    body: { left: d.left + b.x * s, top: d.top + b.y * s, width: b.w * s, height: b.h * s },
    color: L.color || '#2c2c2e',
  };
}

// Copie du canevas du cadre, recadrée sur [x0, x1] (coordonnées de la fenêtre).
function slice(view, g, x0, x1) {
  const src = view.$.body;
  const c = document.createElement('canvas');
  const kx = src.width / g.canvas.width;
  const ky = src.height / g.canvas.height;
  c.width = Math.max(1, Math.round((x1 - x0) * kx));
  c.height = src.height;
  c.getContext('2d').drawImage(src, (x0 - g.canvas.left) * kx, 0, c.width, c.height, 0, 0, c.width, c.height);
  Object.assign(c.style, { position: 'absolute', left: '0', top: '0', width: `${x1 - x0}px`, height: `${g.canvas.height}px` });
  return c;
}

// Image de l'écran (application Windows : capture du <webview>, site ou fond d'écran) ; rien dans NEXORA web.
async function screenShot(view) {
  try {
    const wv = view.wv;
    if (!wv || typeof wv.capturePage !== 'function') return null;
    const img = await Promise.race([wv.capturePage(), new Promise((r) => setTimeout(() => r(null), 300))]);
    return img && !img.isEmpty() ? img.toDataURL() : null;
  } catch { return null; }
}

// Face extérieure du volet : coque à la couleur de l'appareil, écran externe éteint, caméra.
function cover(g, w, h, side) {
  const el = document.createElement('div');
  const r = Math.max(10, Math.min(w, h) * 0.12);
  const pad = Math.max(2, Math.min(w, h) * 0.022);
  el.className = 'nxfold-cover';
  Object.assign(el.style, {
    position: 'absolute', top: '0', [side]: '0', width: `${w}px`, height: `${h}px`, borderRadius: `${r}px`,
    background: `linear-gradient(135deg, rgba(255,255,255,.22), rgba(255,255,255,0) 38%), ${g.color}`,
    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.18), inset 0 0 0 2px rgba(0,0,0,.25)',
  });
  const glass = document.createElement('div');
  Object.assign(glass.style, {
    position: 'absolute', inset: `${pad}px`, borderRadius: `${Math.max(6, r - pad)}px`,
    background: 'radial-gradient(120% 80% at 20% 0%, #2a2d33 0%, #0b0c0f 55%, #050506 100%)',
  });
  const cam = document.createElement('i');
  const cd = Math.max(5, w * 0.075);
  Object.assign(cam.style, { position: 'absolute', top: `${Math.max(8, h * 0.035)}px`, left: '50%', width: `${cd}px`, height: `${cd}px`, marginLeft: `${-cd / 2}px`, borderRadius: '50%', background: '#000', boxShadow: '0 0 0 1px rgba(255,255,255,.08)' });
  glass.append(cam);
  el.append(glass);
  return el;
}

// Calque d'animation : deux moitiés du cadre ouvert (fixe et volet), posées sur l'appareil.
function stage(view, g, coverOn, shot = null) {
  const hinge = g.body.left + g.body.width / 2;
  const root = document.createElement('div');
  root.className = 'nxfold';
  Object.assign(root.style, {
    position: 'fixed', left: `${g.canvas.left}px`, top: `${g.canvas.top}px`, width: `${g.canvas.width}px`, height: `${g.canvas.height}px`,
    zIndex: '60', pointerEvents: 'none', perspective: `${Math.round(g.body.height * 4)}px`, transformOrigin: '0 0',
  });
  const half = (x0, x1, moving) => {
    const el = document.createElement('div');
    Object.assign(el.style, { position: 'absolute', left: `${x0 - g.canvas.left}px`, top: '0', width: `${x1 - x0}px`, height: `${g.canvas.height}px`, transformStyle: 'preserve-3d' });
    const face = document.createElement('div');
    Object.assign(face.style, { position: 'absolute', inset: '0', overflow: 'hidden', backfaceVisibility: 'hidden' });
    face.append(slice(view, g, x0, x1));
    if (shot) {
      const L = view.L;
      const img = new Image();
      img.src = shot;
      Object.assign(img.style, {
        position: 'absolute', left: `${g.dev.left + (L.screen.x + L.vp.x) * g.s - x0}px`, top: `${g.dev.top + (L.screen.y + L.vp.y) * g.s - g.canvas.top}px`,
        width: `${L.vp.w * g.s}px`, height: `${L.vp.h * g.s}px`, borderRadius: `${Math.max(4, Math.min(L.vp.w, L.vp.h) * g.s * 0.04)}px`,
      });
      face.append(img);
    }
    el.append(face);
    if (moving) {
      // Ombre portée sur le volet pendant qu'il tourne (corps de l'appareil seulement), et face extérieure
      // visible au-delà de 90°.
      const shade = document.createElement('div');
      const r = Math.max(8, Math.min(g.body.width / 2, g.body.height) * 0.1);
      const right = coverOn === 'left';
      Object.assign(shade.style, {
        position: 'absolute', top: `${g.body.top - g.canvas.top}px`, height: `${g.body.height}px`, background: '#000', opacity: '0', backfaceVisibility: 'hidden',
        left: right ? '0' : `${g.body.left - x0}px`, right: right ? `${x1 - (g.body.left + g.body.width)}px` : '0',
        borderRadius: right ? `0 ${r}px ${r}px 0` : `${r}px 0 0 ${r}px`,
      });
      face.append(shade);
      el.shade = shade;
      const top = g.body.top - g.canvas.top;
      const back = cover(g, g.body.width / 2, g.body.height, coverOn === 'left' ? 'right' : 'left');
      Object.assign(back.style, { top: `${top}px`, transform: 'rotateY(180deg)', backfaceVisibility: 'hidden' });
      if (coverOn === 'left') back.style.right = `${x1 - (g.body.left + g.body.width)}px`; else back.style.left = `${g.body.left - x0}px`;
      el.append(back);
    }
    root.append(el);
    return el;
  };
  const left = coverOn === 'left';
  const fixed = left ? half(g.canvas.left, hinge, false) : half(hinge, g.canvas.left + g.canvas.width, false);
  const flap = left ? half(hinge, g.canvas.left + g.canvas.width, true) : half(g.canvas.left, hinge, true);
  flap.style.transformOrigin = left ? 'left center' : 'right center';
  document.body.append(root);
  return { root, fixed, flap, sign: left ? -1 : 1, hinge };
}

function turn(st, from, to) {
  const a = st.flap.animate([{ transform: `rotateY(${from * st.sign}deg)` }, { transform: `rotateY(${to * st.sign}deg)` }], { duration: FOLD * slow(), easing: EASE, fill: 'forwards' });
  const peak = [{ opacity: from > 90 ? 0.45 : 0 }, { opacity: 0.45, offset: 0.5 }, { opacity: to > 90 ? 0.45 : 0 }];
  if (st.flap.shade) st.flap.shade.animate(peak, { duration: FOLD * slow(), easing: EASE, fill: 'forwards' });
  return done(a);
}

// Déplace le calque pour que la zone [box] arrive sur [target] (fin du pliage, début du dépliage).
function move(root, origin, box, target) {
  const k = target.height / box.height;
  const dx = target.left - (origin.left + (box.left - origin.left) * k);
  const dy = target.top - (origin.top + (box.top - origin.top) * k);
  return done(root.animate([{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${k})` }], { duration: MOVE * slow(), easing: EASE, fill: 'forwards' }));
}

function reveal(view, root) {
  const dev = view.$.device;
  dev.style.transition = 'opacity .16s ease';
  dev.style.opacity = '';
  const a = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease', fill: 'forwards' });
  done(a).then(() => { root.remove(); dev.style.transition = ''; });
}

export function fold(view, to) {
  try {
    const dev = view && view.dev;
    if (!dev || !dev.fold || dev.fold.kind !== 'book' || !Array.isArray(dev.states) || reduced()) return null;
    const cur = view.stateInfo || {};
    const next = dev.states.find((x) => x.id === to);
    if (!next || cur.id === to) return null;
    const g = geometry(view);
    if (!g) return null;
    const coverOn = dev.fold.coverOn === 'right' ? 'right' : 'left';
    const closing = (Number(next.w) || 0) < (Number(cur.w) || 0);
    const device = view.$.device;
    if (closing) {
      // Ouvert → fermé : le volet (avec l'écran affiché) se replie sur l'autre moitié, puis l'appareil fermé
      // prend sa place.
      const hinge = g.body.left + g.body.width / 2;
      const kept = coverOn === 'left' ? { left: g.body.left, top: g.body.top, height: g.body.height } : { left: hinge, top: g.body.top, height: g.body.height };
      const run = (async () => {
        const st = stage(view, g, coverOn, await screenShot(view));
        device.style.opacity = '0';
        await turn(st, 0, 180);
        return st;
      })();
      return {
        before: run,
        async after() {
          const st = await run;
          await frame(); await frame();
          const g2 = geometry(view);
          if (g2) await move(st.root, g.canvas, kept, { left: g2.body.left, top: g2.body.top, height: g2.body.height });
          reveal(view, st.root);
        },
      };
    }
    // Fermé → ouvert : la coque fermée se place sur la moitié de l'appareil ouvert, puis le volet se déplie.
    const ghost = document.createElement('div');
    ghost.className = 'nxfold';
    Object.assign(ghost.style, { position: 'fixed', left: `${g.canvas.left}px`, top: `${g.canvas.top}px`, width: `${g.canvas.width}px`, height: `${g.canvas.height}px`, zIndex: '60', pointerEvents: 'none', transformOrigin: '0 0' });
    ghost.append(slice(view, g, g.canvas.left, g.canvas.left + g.canvas.width));
    document.body.append(ghost);
    device.style.opacity = '0';
    return {
      before: frame(),
      async after() {
        await frame(); await frame();
        const g2 = geometry(view);
        if (!g2) { ghost.remove(); device.style.opacity = ''; return; }
        const hinge = g2.body.left + g2.body.width / 2;
        const target = coverOn === 'left' ? { left: g2.body.left, top: g2.body.top, height: g2.body.height } : { left: hinge, top: g2.body.top, height: g2.body.height };
        await move(ghost, g.canvas, { left: g.body.left, top: g.body.top, height: g.body.height }, target);
        const st = stage(view, g2, coverOn);
        st.flap.style.transform = `rotateY(${180 * st.sign}deg)`;
        await frame();
        ghost.remove();
        await turn(st, 180, 0);
        reveal(view, st.root);
      },
    };
  } catch (e) {
    console.warn('[pliage]', e);
    return null;
  }
}

export function install() {
  globalThis.nxFold = fold;
}
