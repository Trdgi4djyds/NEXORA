// NEXORA #113 : Motion de NEX-DESIGN, modèle pur (sans interface ni Fabric.js : aussi lu par Node pour les essais).
// Porté de desigma (DeepFounder, licence MIT ou Apache-2.0, au choix ; voir LICENCE-desigma.md) :
//  - crates/desigma-doc/src/motion : courbes (Bézier, ressorts dont la durée est fixée), clips (préréglages
//    retouchables), 41 préréglages, pistes d'images clés, composition des clips sur les pistes ;
//  - crates/desigma-export/src/css_anim.rs : code CSS (@keyframes), SwiftUI (keyframeAnimator), Compose (keyframes).
// Adaptations à NEX-DESIGN : position = centre du calque sur la page ; rotation en degrés dans le sens des
// aiguilles d'une montre (convention de Fabric.js et du champ Rotation) ; largeur et hauteur = taille affichée.
// Temps en millisecondes ; une image clé est posée sur une milliseconde entière, la tête de lecture peut être entre deux.

// ---------- Courbes ----------
export const DEFAULT_BOUNCE = 0.25;
const BOUNCE_RANGE = [-0.8, 0.9];
const SETTLE_NEPERS = 8;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const finite = (v, d = 0) => (Number.isFinite(v) ? v : d);

// y(t) de la courbe de Bézier cubique (0,0), (x1,y1), (x2,y2), (1,1), comme cubic-bezier() en CSS.
export function cubicBezier(c, t) {
  const x1 = clamp(finite(c[0]), 0, 1); const y1 = finite(c[1]); const x2 = clamp(finite(c[2], 1), 0, 1); const y2 = finite(c[3], 1);
  if (!Number.isFinite(t)) return 0;
  t = clamp(t, 0, 1);
  if (t === 0 || t === 1) return t;
  const sample = (p1, p2, s) => { const u = 1 - s; return 3 * u * u * s * p1 + 3 * u * s * s * p2 + s * s * s; };
  const dx = (s) => { const u = 1 - s; return 3 * u * u * x1 + 6 * u * s * (x2 - x1) + 3 * s * s * (1 - x2); };
  let s = t;
  for (let i = 0; i < 8; i += 1) {
    const err = sample(x1, x2, s) - t;
    if (Math.abs(err) < 1e-6) return sample(y1, y2, s);
    const d = dx(s);
    if (Math.abs(d) < 1e-6) break;
    s -= err / d;
  }
  let lo = 0; let hi = 1; s = t;
  for (let i = 0; i < 40; i += 1) {
    const x = sample(x1, x2, s);
    if (Math.abs(x - t) < 1e-6) break;
    if (x < t) lo = s; else hi = s;
    s = (lo + hi) / 2;
  }
  return sample(y1, y2, s);
}
// Réponse d'un ressort amorti (part de 0, se pose à 1) : zeta = amortissement, w0 = pulsation propre.
export function springStep(zeta, w0, tau) {
  if (zeta < 1 - 1e-4) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta); const a = zeta * w0;
    return 1 - Math.exp(-a * tau) * (Math.cos(wd * tau) + (a / wd) * Math.sin(wd * tau));
  }
  if (zeta <= 1 + 1e-4) return 1 - Math.exp(-w0 * tau) * (1 + w0 * tau);
  const s = Math.sqrt(zeta * zeta - 1); const r1 = -w0 * (zeta - s); const r2 = -w0 * (zeta + s);
  return 1 - (r2 * Math.exp(r1 * tau) - r1 * Math.exp(r2 * tau)) / (r2 - r1);
}
// Rebond → amortissement, comme Spring(duration:bounce:) de SwiftUI : 0 = sans dépassement, proche de 1 = rebondit longtemps.
export function bounceToDamping(bounce) {
  const b = Number.isFinite(bounce) ? clamp(bounce, BOUNCE_RANGE[0], BOUNCE_RANGE[1]) : DEFAULT_BOUNCE;
  return b >= 0 ? 1 - b : 1 / (1 + b);
}
// Ressort dont la réponse dure exactement le segment : 0 au départ, 1 à l'arrivée (dépasse 1 si bounce > 0).
export function springUnit(bounce, t) {
  if (!Number.isFinite(t)) return 0;
  t = clamp(t, 0, 1);
  if (t === 0 || t === 1) return t;
  const zeta = bounceToDamping(bounce);
  const rate = zeta < 1 ? zeta : zeta - Math.sqrt(zeta * zeta - 1);
  const w0 = SETTLE_NEPERS / Math.max(rate, 1e-3);
  return springStep(zeta, w0, t) + (1 - springStep(zeta, w0, 1)) * t;
}

// Courbe d'un segment : identifiant de préréglage, { bezier: [x1, y1, x2, y2] } ou { spring: rebond }.
export const EASES = [
  ['hold', 'Maintien'], ['linear', 'Linéaire'], ['in', 'Accélération'], ['out', 'Décélération'], ['inout', 'Accélération puis décélération'],
  ['inback', 'Recul au départ'], ['outback', 'Dépassement à l’arrivée'], ['inoutback', 'Recul et dépassement'],
  ['gentle', 'Ressort doux'], ['quick', 'Ressort vif'], ['bouncy', 'Ressort rebondissant'], ['slow', 'Ressort lent'],
];
const CP = { linear: [0, 0, 1, 1], in: [0.42, 0, 1, 1], out: [0, 0, 0.58, 1], inout: [0.42, 0, 0.58, 1], inback: [0.3, -0.05, 0.7, -0.5], outback: [0.45, 1.45, 0.8, 1], inoutback: [0.7, -0.4, 0.4, 1.4] };
const BOUNCES = { gentle: 0.25, quick: 0.42, bouncy: 0.7, slow: -0.1 };
export const controlPoints = (e) => (e && typeof e === 'object' ? (Array.isArray(e.bezier) ? e.bezier : null) : CP[e] || null);
export const bounceOf = (e) => (e && typeof e === 'object' ? (Number.isFinite(e.spring) ? e.spring : null) : e in BOUNCES ? BOUNCES[e] : null);
export const easeFamily = (e) => (e === 'hold' ? 'hold' : bounceOf(e) !== null ? 'spring' : 'curve');
export function easeName(e) {
  const p = EASES.find(([id]) => id === e);
  if (p) return p[1];
  if (e && typeof e === 'object' && e.bezier) return 'Courbe personnalisée';
  if (e && typeof e === 'object' && 'spring' in e) return 'Ressort personnalisé';
  return 'Linéaire';
}
export function sanitizeEase(e) {
  if (typeof e === 'string') return EASES.some(([id]) => id === e) ? e : 'linear';
  if (e && typeof e === 'object' && Array.isArray(e.bezier)) { const c = e.bezier; return { bezier: [clamp(finite(c[0]), 0, 1), finite(c[1]), clamp(finite(c[2], 1), 0, 1), finite(c[3], 1)] }; }
  if (e && typeof e === 'object' && 'spring' in e) return { spring: Number.isFinite(e.spring) ? clamp(e.spring, BOUNCE_RANGE[0], BOUNCE_RANGE[1]) : DEFAULT_BOUNCE };
  return 'linear';
}
// Même forme en version modifiable (préréglage → courbe ou ressort personnalisés).
export function toCustom(e) {
  const c = controlPoints(e); if (c) return { bezier: c.slice() };
  const b = bounceOf(e); if (b !== null) return { spring: b };
  return e;
}
export function ease(e, t) {
  if (!Number.isFinite(t)) return 0;
  t = clamp(t, 0, 1);
  if (e === 'hold') return t >= 1 ? 1 : 0;
  if (!e || e === 'linear') return t;
  const c = controlPoints(e); if (c) return cubicBezier(c, t);
  const b = bounceOf(e); if (b !== null) return springUnit(b, t);
  return t;
}
export function sampleEase(e, n = 48) {
  const out = [];
  for (let i = 0; i <= n; i += 1) out.push([i / n, ease(e, i / n)]);
  if (e === 'hold') out.splice(out.length - 1, 0, [1, 0]);
  return out;
}
// Fonction de temps CSS d'un segment (ressort : courbe linear() échantillonnée).
export function timingFunction(e) {
  if (e === 'hold') return 'step-end';
  if (!e || e === 'linear') return 'linear';
  const c = controlPoints(e);
  if (c) return `cubic-bezier(${n2(clamp(c[0], 0, 1))}, ${n2(c[1])}, ${n2(clamp(c[2], 0, 1))}, ${n2(c[3])})`;
  const pts = []; for (let i = 0; i <= 30; i += 1) pts.push(n2(ease(e, i / 30)));
  return `linear(${pts.join(', ')})`;
}

// ---------- Valeurs ----------
// Propriétés animables : [id, nom, forme, unité, facteur d'affichage].
export const PROPS = [
  ['position', 'Position', 'vec2', 'px', 1], ['scale', 'Échelle', 'vec2', '%', 100], ['rotation', 'Rotation', 'scalar', '°', 1],
  ['width', 'Largeur', 'scalar', 'px', 1], ['height', 'Hauteur', 'scalar', 'px', 1], ['opacity', 'Opacité', 'scalar', '%', 100],
  ['radius', 'Arrondi des coins', 'scalar', 'px', 1], ['fill', 'Remplissage', 'color', '', 1], ['stroke', 'Contour', 'color', '', 1],
  ['strokeWidth', 'Épaisseur du contour', 'scalar', 'px', 1], ['shadowX', 'Ombre X', 'scalar', 'px', 1], ['shadowY', 'Ombre Y', 'scalar', 'px', 1],
  ['shadowBlur', 'Flou de l’ombre', 'scalar', 'px', 1], ['shadowColor', 'Couleur de l’ombre', 'color', '', 1], ['blur', 'Flou du calque', 'scalar', 'px', 1],
];
export const PROP = Object.fromEntries(PROPS.map(([id, name, kind, unit, factor]) => [id, { id, name, kind, unit, factor }]));
export function parseColor(c) {
  if (Array.isArray(c)) return [c[0], c[1], c[2], c[3] ?? 1];
  const s = String(c || '').trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('');
    const v = (i) => parseInt(h.slice(i, i + 2), 16);
    return [v(0), v(2), v(4), h.length === 8 ? v(6) / 255 : 1];
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s);
  if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]];
  if (s === 'white') return [255, 255, 255, 1];
  if (s === 'transparent' || !s) return [0, 0, 0, 0];
  return [0, 0, 0, 1];
}
export function colorString(c) {
  const [r, g, b, a] = parseColor(c).map((v, i) => (i < 3 ? clamp(Math.round(v), 0, 255) : clamp(v, 0, 1)));
  if (a >= 0.999) return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
}
export function lerpValue(kind, a, b, p) {
  if (kind === 'vec2') return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
  if (kind === 'color') { const x = parseColor(a); const y = parseColor(b); return colorString(x.map((v, i) => v + (y[i] - v) * p)); }
  return a + (b - a) * p;
}
const validValue = (kind, v) => (kind === 'vec2' ? !!v && Number.isFinite(v.x) && Number.isFinite(v.y) : kind === 'color' ? typeof v === 'string' || Array.isArray(v) : Number.isFinite(v));

// ---------- Clips (préréglages retouchables) ----------
export const CLIP_KINDS = { position: 'Position', scale: 'Échelle', rotation: 'Rotation', size: 'Taille', opacity: 'Opacité' };
export const CLIP_PROPS = { position: ['position'], scale: ['scale'], rotation: ['rotation'], size: ['width', 'height'], opacity: ['opacity'] };
export const DIRS = {
  top: 'Haut', bottom: 'Bas', left: 'Gauche', right: 'Droite', topleft: 'Haut gauche', topright: 'Haut droite', bottomleft: 'Bas gauche', bottomright: 'Bas droite',
  cw: 'Sens horaire', ccw: 'Sens antihoraire', both: 'Les deux axes', h: 'Horizontal', v: 'Vertical',
};
export const KIND_DIRS = { position: ['top', 'bottom', 'left', 'right', 'topleft', 'topright', 'bottomleft', 'bottomright'], rotation: ['cw', 'ccw'], scale: ['both', 'h', 'v'], size: ['both', 'h', 'v'], opacity: [] };
const D2 = Math.SQRT1_2;
const VEC = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0], topleft: [-D2, -D2], topright: [D2, -D2], bottomleft: [-D2, D2], bottomright: [D2, D2] };
export const neutral = (kind) => (kind === 'scale' || kind === 'size' ? { x: 1, y: 1 } : kind === 'opacity' ? { x: 1, y: 0 } : { x: 0, y: 0 });
const defaultDir = (kind) => (kind === 'position' ? 'bottom' : kind === 'rotation' ? 'cw' : 'both');
const defaultAmount = (kind) => (kind === 'position' ? 100 : kind === 'scale' || kind === 'size' ? 0.5 : kind === 'rotation' ? 90 : 0);
export const INFINITE = -1;
// Libellé du mode d'un clip (« Glisse en entrée »…).
export function clipLabel(c) {
  if (c.mode === 'custom') return `${CLIP_KINDS[c.kind]} personnalisée`;
  const verb = { position: 'Glisse', scale: 'Échelle', rotation: 'Tourne', size: 'Taille', opacity: 'Fondu' }[c.kind] || 'Clip';
  return `${verb} ${c.mode === 'out' ? 'en sortie' : 'en entrée'}`;
}
export function makeClip(kind, mode = 'in', o = {}) {
  return sanitizeClip({ id: 0, kind, mode, dir: defaultDir(kind), amount: defaultAmount(kind), from: neutral(kind), to: neutral(kind), delay: 0, dur: 500, ease: 'out', repeat: 1, yoyo: false, visible: true, ...o });
}
export function sanitizeClip(c) {
  const kind = CLIP_KINDS[c.kind] ? c.kind : 'opacity';
  const n = neutral(kind);
  const vec = (v) => (v && Number.isFinite(v.x) && Number.isFinite(v.y) ? { x: v.x, y: v.y } : { ...n });
  const rep = Number(c.repeat);
  return {
    id: Number.isFinite(c.id) ? c.id : 0, kind, mode: ['in', 'out', 'custom'].includes(c.mode) ? c.mode : 'in',
    dir: KIND_DIRS[kind].includes(c.dir) ? c.dir : defaultDir(kind), amount: finite(Number(c.amount), defaultAmount(kind)),
    from: vec(c.from), to: vec(c.to), delay: Math.max(0, Math.round(finite(Number(c.delay)))), dur: Math.max(1, Math.round(finite(Number(c.dur), 500))),
    ease: sanitizeEase(c.ease), repeat: rep === INFINITE ? INFINITE : Math.max(1, Math.round(finite(rep, 1))), yoyo: !!c.yoyo, visible: c.visible !== false,
    ...(c.preset ? { preset: String(c.preset) } : {}),
  };
}
// Valeurs de départ et d'arrivée d'un cycle. Position : décalage en px ; échelle et taille : facteur ;
// rotation : degrés (sens horaire positif) ; opacité : facteur. Mode personnalisé : from et to tels quels.
export function endpoints(c) {
  const n = neutral(c.kind);
  if (c.mode === 'custom') return [c.from, c.to];
  if (c.kind === 'rotation') {
    const turn = c.dir === 'ccw' ? -c.amount : c.amount;
    return c.mode === 'in' ? [{ x: -turn, y: 0 }, n] : [n, { x: turn, y: 0 }];
  }
  let away;
  if (c.kind === 'position') { const v = VEC[c.dir] || [0, 0]; away = { x: v[0] * c.amount, y: v[1] * c.amount }; }
  else if (c.kind === 'scale' || c.kind === 'size') { const ax = c.dir === 'h' ? [1, 0] : c.dir === 'v' ? [0, 1] : [1, 1]; away = { x: 1 + (c.amount - 1) * ax[0], y: 1 + (c.amount - 1) * ax[1] }; }
  else away = { x: c.amount, y: 0 };
  return c.mode === 'in' ? [away, n] : [n, away];
}
export const totalMs = (c) => (c.repeat === INFINITE ? null : Math.max(1, c.dur) * Math.max(1, c.repeat));
export const clipEnd = (c, timelineMs) => { const t = totalMs(c); return t === null ? Math.max(timelineMs, c.delay + Math.max(1, c.dur)) : c.delay + t; };
// Avancement (0 = départ, 1 = arrivée) au temps t : départ tenu avant le délai, état final du dernier cycle après.
export function progressAt(c, t) {
  const local = t - c.delay;
  if (!(local > 0)) return 0;
  const n = local / Math.max(1, c.dur);
  const k = c.repeat === INFINITE ? null : Math.max(1, c.repeat);
  if (k !== null && n >= k) return c.yoyo && (k - 1) % 2 === 1 ? 0 : 1;
  const idx = Math.floor(n); const frac = n - idx;
  const back = c.yoyo && idx % 2 === 1;
  return ease(c.ease, back ? 1 - frac : frac);
}
export function clipValue(c, t) { const [a, b] = endpoints(c); return lerpValue('vec2', a, b, progressAt(c, t)); }

// ---------- Bibliothèque : 41 préréglages (Base, Entrée, Boucle, Sortie) ----------
export const GROUPS = { basic: 'Base', enter: 'Entrée', cycle: 'Boucle', exit: 'Sortie' };
export const SPEEDS = { fast: 'Rapide', medium: 'Moyen', slow: 'Lent' };
const BURST = { bezier: [0.07, 0.97, 0.58, 1] };
const mv = (mode, dir, amount, dur, e) => makeClip('position', mode, { dir, amount, dur, ease: e });
const grow = (mode, amount, dur, e) => makeClip('scale', mode, { amount, dur, ease: e });
const growAxis = (mode, dir, amount, dur, e) => makeClip('scale', mode, { dir, amount, dur, ease: e });
const turn = (mode, dir, amount, dur, e) => makeClip('rotation', mode, { dir, amount, dur, ease: e });
const fade = (mode, amount, dur, e) => makeClip('opacity', mode, { amount, dur, ease: e });
const forever = (c) => ({ ...c, repeat: INFINITE });
const wobble = (c, d) => forever({ ...c, dur: Math.floor(d / 2), yoyo: true });
const P = (id, name, group, speed, build) => ({ id, name, group, speed, build });
export const PRESETS = [
  P('position', 'Position', 'basic', null, (d) => [mv('in', 'bottom', 100, d, 'out')]),
  P('scale', 'Échelle', 'basic', null, (d) => [grow('in', 0.5, d, 'out')]),
  P('rotation', 'Rotation', 'basic', null, (d) => [turn('in', 'cw', 90, d, 'out')]),
  P('size', 'Taille', 'basic', null, (d) => [makeClip('size', 'in', { amount: 0.5, dur: d, ease: 'out' })]),
  P('opacity', 'Opacité', 'basic', null, (d) => [fade('in', 0, d, 'out')]),
  P('burst', 'Éclat', 'enter', 'fast', (d) => [mv('in', 'bottom', 116, d, BURST), grow('in', 0.8, d, BURST), turn('in', 'ccw', 10, d, BURST), fade('in', 0, d, BURST)]),
  P('ignite', 'Étincelle', 'enter', 'fast', (d) => [grow('in', 0.4, d, 'outback'), fade('in', 0, Math.floor((d * 2) / 3), 'out')]),
  P('sweep', 'Balayage', 'enter', 'fast', (d) => [mv('in', 'left', 200, d, 'out'), fade('in', 0, d, 'out')]),
  P('slam', 'Impact', 'enter', 'fast', (d) => [grow('in', 1.6, d, 'out'), fade('in', 0, Math.floor(d / 2), 'linear')]),
  P('descend', 'Descente', 'enter', 'medium', (d) => [mv('in', 'top', 80, d, 'out'), fade('in', 0, d, 'out')]),
  P('magnify', 'Loupe', 'enter', 'medium', (d) => [grow('in', 0.6, d, 'out'), fade('in', 0, d, 'out')]),
  P('glide', 'Glissade', 'enter', 'medium', (d) => [mv('in', 'right', 120, d, 'inout'), fade('in', 0, d, 'inout')]),
  P('drop', 'Chute', 'enter', 'medium', (d) => [mv('in', 'top', 160, d, 'outback'), fade('in', 0, Math.floor(d / 3), 'out')]),
  P('reveal', 'Révélation', 'enter', 'slow', (d) => [fade('in', 0, d, 'inout'), grow('in', 0.94, d, 'inout')]),
  P('rise', 'Montée', 'enter', 'slow', (d) => [mv('in', 'bottom', 60, d, 'out'), fade('in', 0, d, 'out')]),
  P('tip', 'Bascule', 'enter', 'slow', (d) => [turn('in', 'cw', 25, d, 'outback'), fade('in', 0, Math.floor(d / 2), 'out')]),
  P('feather', 'Plume', 'enter', 'slow', (d) => [mv('in', 'bottom', 16, d, 'inout'), fade('in', 0, d, 'inout')]),
  P('crank', 'Manivelle', 'cycle', 'fast', (d) => [forever(turn('out', 'cw', 360, d, 'inout'))]),
  P('press', 'Pression', 'cycle', 'fast', (d) => [wobble(grow('out', 0.9, d, 'inout'), d)]),
  P('pop', 'Sursaut', 'cycle', 'fast', (d) => [wobble(grow('out', 1.15, d, 'out'), d)]),
  P('scoot', 'Va-et-vient', 'cycle', 'fast', (d) => [wobble(mv('out', 'right', 16, d, 'inout'), d)]),
  P('spin', 'Tour complet', 'cycle', 'medium', (d) => [forever(turn('out', 'cw', 360, d, 'linear'))]),
  P('flip', 'Retournement', 'cycle', 'medium', (d) => [wobble(growAxis('out', 'h', -1, d, 'inout'), d)]),
  P('tick', 'Tic-tac', 'cycle', 'medium', (d) => [wobble(turn('out', 'cw', 12, d, 'outback'), d)]),
  P('creep', 'Dérive', 'cycle', 'medium', (d) => [wobble(mv('out', 'bottomright', 20, d, 'inout'), d)]),
  P('float', 'Flottement', 'cycle', 'slow', (d) => [wobble(mv('out', 'top', 14, d, 'inout'), d)]),
  P('orbit', 'Orbite', 'cycle', 'slow', (d) => {
    const r = 24;
    const sweep = (from, to, delay) => wobble({ ...makeClip('position', 'custom', { from, to, ease: 'inout', delay, dur: d }) }, d);
    return [sweep({ x: -r, y: 0 }, { x: r, y: 0 }, 0), sweep({ x: 0, y: -r }, { x: 0, y: r }, Math.floor(d / 4))];
  }),
  P('breathe', 'Respiration', 'cycle', 'slow', (d) => [wobble(grow('out', 1.06, d, 'inout'), d), wobble(fade('out', 0.85, d, 'inout'), d)]),
  P('pulse', 'Pulsation', 'cycle', 'slow', (d) => [wobble(grow('out', 1.1, d, 'out'), d), wobble(fade('out', 0.7, d, 'out'), d)]),
  P('launch', 'Envol', 'exit', 'fast', (d) => [mv('out', 'top', 240, d, 'in'), grow('out', 0.8, d, 'in'), fade('out', 0, d, 'in')]),
  P('vanish', 'Disparition', 'exit', 'fast', (d) => [grow('out', 0, d, 'in'), fade('out', 0, d, 'in')]),
  P('flick', 'Pichenette', 'exit', 'fast', (d) => [mv('out', 'right', 160, d, 'in'), turn('out', 'cw', 25, d, 'in'), fade('out', 0, d, 'in')]),
  P('swipe', 'Glissé', 'exit', 'fast', (d) => [mv('out', 'left', 200, d, 'in'), fade('out', 0, d, 'in')]),
  P('poof', 'Pouf', 'exit', 'medium', (d) => [grow('out', 1.4, d, 'out'), fade('out', 0, d, 'out')]),
  P('deflate', 'Dégonflement', 'exit', 'medium', (d) => [grow('out', 0.5, d, 'in'), fade('out', 0, d, 'in')]),
  P('fling', 'Lancer', 'exit', 'medium', (d) => [mv('out', 'topright', 200, d, 'in'), turn('out', 'cw', 45, d, 'in'), fade('out', 0, d, 'in')]),
  P('splat', 'Écrasement', 'exit', 'medium', (d) => [growAxis('out', 'h', 1.4, d, 'out'), growAxis('out', 'v', 0.3, d, 'out'), fade('out', 0, d, 'in')]),
  P('evaporate', 'Évaporation', 'exit', 'slow', (d) => [fade('out', 0, d, 'inout'), mv('out', 'top', 40, d, 'inout')]),
  P('recede', 'Recul', 'exit', 'slow', (d) => [grow('out', 0.7, d, 'inout'), fade('out', 0, d, 'inout')]),
  P('sink', 'Plongée', 'exit', 'slow', (d) => [mv('out', 'bottom', 80, d, 'inout'), fade('out', 0, d, 'inout')]),
  P('tumble', 'Culbute', 'exit', 'slow', (d) => [turn('out', 'ccw', 120, d, 'in'), mv('out', 'bottom', 140, d, 'in'), fade('out', 0, d, 'in')]),
];
// Durée du mouvement principal (un cycle pour une boucle) : 300/500/800 ms (entrée, sortie), 400/1000/2000 ms (boucle), 500 ms (base).
export function presetDuration(p) {
  if (!p.speed) return 500;
  if (p.group === 'cycle') return { fast: 400, medium: 1000, slow: 2000 }[p.speed];
  return { fast: 300, medium: 500, slow: 800 }[p.speed];
}
export const findPreset = (id) => PRESETS.find((p) => p.id === String(id || '').toLowerCase()) || null;
export const presetsIn = (group) => PRESETS.filter((p) => p.group === group);
// Clips du préréglage, décalés à la tête de lecture, numérotés à partir de firstId.
export function instantiate(p, startMs = 0, firstId = 1) {
  return p.build(presetDuration(p)).map((c, i) => sanitizeClip({ ...c, id: firstId + i, delay: c.delay + Math.max(0, Math.round(startMs)), preset: p.id }));
}

// ---------- Pistes d'images clés et animation d'un calque ----------
// motion = { tracks: { [propriété]: [{ t, v, e }] }, clips: [clip] } ; e = courbe du segment qui part de l'image clé.
export const emptyMotion = () => ({ tracks: {}, clips: [] });
export function normalizeMotion(m) {
  const out = emptyMotion();
  if (!m || typeof m !== 'object') return out;
  for (const [p, keys] of Object.entries(m.tracks || {})) {
    const info = PROP[p]; if (!info || !Array.isArray(keys)) continue;
    const list = keys.filter((k) => k && Number.isFinite(k.t) && validValue(info.kind, k.v)).map((k) => ({ t: Math.max(0, Math.round(k.t)), v: info.kind === 'color' ? colorString(k.v) : info.kind === 'vec2' ? { x: k.v.x, y: k.v.y } : k.v, e: sanitizeEase(k.e) })).sort((a, b) => a.t - b.t);
    const dedup = [];
    for (const k of list) { if (dedup.length && dedup[dedup.length - 1].t === k.t) dedup[dedup.length - 1] = k; else dedup.push(k); }
    if (dedup.length) out.tracks[p] = dedup;
  }
  let id = 1;
  for (const c of Array.isArray(m.clips) ? m.clips : []) { const s = sanitizeClip(c); if (!s.id || out.clips.some((x) => x.id === s.id)) s.id = id; id = Math.max(id, s.id + 1); out.clips.push(s); }
  return out;
}
export const isEmpty = (m) => !m || (!Object.keys(m.tracks || {}).length && !(m.clips || []).length);
export const nextClipId = (m) => (m.clips || []).reduce((a, c) => Math.max(a, c.id), 0) + 1;
export function trackValue(keys, kind, t) {
  if (!keys || !keys.length) return undefined;
  let i = -1;
  for (let j = 0; j < keys.length; j += 1) { if (keys[j].t <= t) i = j; else break; }
  if (i < 0) return keys[0].v;
  const a = keys[i]; const b = keys[i + 1];
  if (!b) return a.v;
  return lerpValue(kind, a.v, b.v, ease(a.e, (t - a.t) / Math.max(1, b.t - a.t)));
}
export const keyAt = (m, p, t) => ((m.tracks || {})[p] || []).find((k) => k.t === Math.round(t)) || null;
export function setKey(m, p, t, v, e) {
  const info = PROP[p]; if (!info) return m;
  const keys = (m.tracks[p] = m.tracks[p] || []);
  t = Math.max(0, Math.round(t));
  const value = info.kind === 'color' ? colorString(v) : info.kind === 'vec2' ? { x: v.x, y: v.y } : v;
  const i = keys.findIndex((k) => k.t === t);
  if (i >= 0) { keys[i].v = value; if (e !== undefined) keys[i].e = sanitizeEase(e); return m; }
  const at = keys.findIndex((k) => k.t > t);
  const inherited = at > 0 ? keys[at - 1].e : at < 0 && keys.length ? keys[keys.length - 1].e : 'linear';
  keys.splice(at < 0 ? keys.length : at, 0, { t, v: value, e: e === undefined ? inherited : sanitizeEase(e) });
  return m;
}
export function removeKey(m, p, t) {
  const keys = (m.tracks || {})[p]; if (!keys) return m;
  const i = keys.findIndex((k) => k.t === Math.round(t));
  if (i >= 0) keys.splice(i, 1);
  if (!keys.length) delete m.tracks[p];
  return m;
}
// Déplace (ou copie) une image clé ; une image clé déjà posée à l'arrivée est remplacée.
export function moveKey(m, p, from, to, copy = false) {
  const keys = (m.tracks || {})[p]; if (!keys) return m;
  const k = keys.find((x) => x.t === Math.round(from)); if (!k) return m;
  to = Math.max(0, Math.round(to));
  if (to === k.t) return m;
  const rest = keys.filter((x) => x.t !== to && (copy || x !== k));
  rest.push({ ...k, v: typeof k.v === 'object' ? { ...k.v } : k.v, t: to });
  m.tracks[p] = rest.sort((a, b) => a.t - b.t);
  return m;
}
export function keyTimes(m) {
  const s = new Set();
  for (const keys of Object.values(m.tracks || {})) for (const k of keys) s.add(k.t);
  return [...s].sort((a, b) => a - b);
}
// Fin de l'animation du calque (dernière image clé, fin du dernier clip ; une boucle va jusqu'au bout de la frise).
export function motionEnd(m, timelineMs) {
  let end = 0;
  for (const keys of Object.values(m.tracks || {})) if (keys.length) end = Math.max(end, keys[keys.length - 1].t);
  for (const c of m.clips || []) if (c.visible) end = Math.max(end, clipEnd(c, timelineMs));
  return end;
}
export function animatedProps(m) {
  const set = new Set(Object.keys(m.tracks || {}).filter((p) => (m.tracks[p] || []).length));
  for (const c of m.clips || []) if (c.visible) for (const p of CLIP_PROPS[c.kind]) set.add(p);
  return PROPS.map(([id]) => id).filter((id) => set.has(id));
}
// Valeurs animées au temps t : les pistes donnent la valeur de base (valeur fixe du calque sans piste), puis chaque
// clip visible s'y ajoute (position, rotation) ou la multiplie (échelle, taille, opacité). base : valeurs fixes du calque.
export function evaluate(m, base, t) {
  const ev = {};
  if (isEmpty(m)) return ev;
  t = Number.isFinite(t) ? Math.max(0, t) : 0;
  for (const [p, keys] of Object.entries(m.tracks || {})) { const v = trackValue(keys, PROP[p].kind, t); if (v !== undefined) ev[p] = v; }
  for (const c of m.clips || []) {
    if (!c.visible) continue;
    const v = clipValue(c, t);
    if (c.kind === 'position') { const cur = ev.position || base.position || { x: 0, y: 0 }; ev.position = { x: cur.x + v.x, y: cur.y + v.y }; }
    else if (c.kind === 'rotation') ev.rotation = (ev.rotation ?? base.rotation ?? 0) + v.x;
    else if (c.kind === 'scale') { const cur = ev.scale || { x: 1, y: 1 }; ev.scale = { x: cur.x * v.x, y: cur.y * v.y }; }
    else if (c.kind === 'size') { ev.width = (ev.width ?? base.width ?? 0) * v.x; ev.height = (ev.height ?? base.height ?? 0) * v.y; }
    else if (c.kind === 'opacity') ev.opacity = clamp((ev.opacity ?? base.opacity ?? 1) * v.x, 0, 1);
  }
  return ev;
}
// Valeur affichée à la tête de lecture (clips compris), sinon valeur fixe.
export const valueAt = (m, base, p, t) => { const ev = evaluate(m, base, t); return p in ev ? ev[p] : base[p]; };
// Valeur de la piste seule (clips ignorés) : ce que capture une nouvelle image clé.
export const keyedValueAt = (m, base, p, t) => { const v = trackValue((m.tracks || {})[p], PROP[p].kind, t); return v === undefined ? base[p] : v; };
export function applyPreset(m, presetId, startMs = 0) {
  const p = findPreset(presetId); if (!p) return [];
  const clips = instantiate(p, startMs, nextClipId(m));
  m.clips.push(...clips);
  return clips;
}

// ---------- Frise de la page ----------
// Réglages de la page (page.nxAnim, existants depuis #011) : dur en secondes, fps et boucle (#113).
export const timeline = (pa) => ({ ms: Math.round(clamp(finite(Number(pa && pa.dur), 4), 0.1, 600) * 1000), fps: clamp(Math.round(finite(Number(pa && pa.fps), 30)), 1, 120), loop: !!(pa && pa.loop) });
export const frameMs = (fps) => 1000 / Math.max(1, fps);
export const snapToFrame = (t, fps) => Math.round(t / frameMs(fps)) * frameMs(fps);
export const frameCount = (ms, fps) => Math.max(1, Math.ceil((ms * fps) / 1000));
export const playbackTime = (elapsed, ms, loop) => (loop ? ((elapsed % ms) + ms) % ms : clamp(elapsed, 0, ms));
export function formatTime(ms) { const s = ms / 1000; return `${s.toFixed(s < 10 ? 2 : 1).replace('.', ',')} s`; }

// ---------- Code (CSS, SwiftUI, Jetpack Compose) ----------
function n2(v) { const r = Math.round(v * 100) / 100; return String(Object.is(r, -0) ? 0 : r); }
function n0(v) { const r = Math.round(v * 10) / 10; return String(Object.is(r, -0) ? 0 : r); }
export const kebab = (s) => String(s || 'calque').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'calque';
const pascalCase = (s) => kebab(s).split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('') || 'Calque';
const camelCase = (s) => { const p = pascalCase(s); return (/^\d/.test(p) ? `l${p}` : p.charAt(0).toLowerCase() + p.slice(1)); };
const CSS_NAMES = { position: 'position', scale: 'scale', rotation: 'rotation', width: 'width', height: 'height', opacity: 'opacity', radius: 'radius', fill: 'fill', stroke: 'stroke', strokeWidth: 'stroke-width', blur: 'blur' };
function declaration(layer, p, v) {
  const b = layer.base;
  switch (p) {
    case 'position': return `translate: ${n0(v.x - b.position.x)}px ${n0(v.y - b.position.y)}px`;
    case 'scale': return `scale: ${n2(v.x)} ${n2(v.y)}`;
    case 'rotation': return `rotate: ${n2(v - (b.rotation || 0))}deg`;
    case 'width': return `width: ${n0(v)}px`;
    case 'height': return `height: ${n0(v)}px`;
    case 'opacity': return `opacity: ${n2(v)}`;
    case 'radius': return `border-radius: ${n0(v)}px`;
    case 'fill': return `${layer.text ? 'color' : 'background-color'}: ${colorString(v)}`;
    case 'stroke': return `border-color: ${colorString(v)}`;
    case 'strokeWidth': return `border-width: ${n0(v)}px`;
    case 'blur': return `filter: blur(${n0(Math.max(0, v))}px)`;
    default: return null;
  }
}
// Images clés d'une propriété : [temps, valeur, courbe du segment qui part d'ici] ; propriété pilotée par des clips :
// valeurs échantillonnées (toutes les 33 ms environ, 120 au plus).
function frames(layer, p, ms) {
  const m = layer.motion; const baked = (m.clips || []).some((c) => c.visible && CLIP_PROPS[c.kind].includes(p));
  const keys = (m.tracks || {})[p];
  if (baked || !keys || !keys.length) {
    const step = Math.max(33, Math.floor(ms / 120)); const out = [];
    for (let t = 0; t < ms; t += step) out.push([t, valueAt(m, layer.base, p, t), null]);
    out.push([ms, valueAt(m, layer.base, p, ms), null]);
    // Images identiques à leurs deux voisines retirées (repos avant ou après le clip).
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    return out.filter((f, i) => i === 0 || i === out.length - 1 || !(same(f[1], out[i - 1][1]) && same(f[1], out[i + 1][1])));
  }
  const out = keys.map((k, i) => [Math.min(k.t, ms), k.v, i + 1 < keys.length ? k.e : null]);
  if (out[0][0] > 0) out.unshift([0, out[0][1], null]);
  if (out[out.length - 1][0] < ms) out.push([ms, out[out.length - 1][1], null]);
  return out.filter((f, i) => i === 0 || f[0] !== out[i - 1][0]);
}
const SHADOW = ['shadowX', 'shadowY', 'shadowBlur', 'shadowColor'];
function shadowFrames(layer, ms) {
  const m = layer.motion; const tracks = SHADOW.map((p) => (m.tracks || {})[p]).filter((k) => k && k.length);
  if (!tracks.length) return [];
  const times = new Set([0, ms]);
  for (const keys of tracks) for (const k of keys) times.add(Math.min(k.t, ms));
  const list = [...times].sort((a, b) => a - b);
  return list.map((t, i) => {
    const v = (p) => valueAt(m, layer.base, p, t);
    const timing = i + 1 < list.length ? (SHADOW.map((p) => keyAt(m, p, t)).find(Boolean) || { e: 'linear' }).e : null;
    return [t, `${n2(v('shadowX') || 0)}px ${n2(v('shadowY') || 0)}px ${n2(v('shadowBlur') || 0)}px ${colorString(v('shadowColor') || '#000000')}`, timing];
  });
}
const pct = (t, ms) => `${n2((Math.min(t, ms) / Math.max(1, ms)) * 100)}%`;
// layers : [{ name, text, base, motion }] (calques animés de la page) ; tl : frise de la page.
export function cssAnimation(layers, tl) {
  const out = []; const used = new Set();
  for (const layer of layers) {
    if (isEmpty(layer.motion)) continue;
    let cls = kebab(layer.name); if (used.has(cls)) { let i = 2; while (used.has(`${cls}-${i}`)) i += 1; cls = `${cls}-${i}`; } used.add(cls);
    const names = [];
    const sh = shadowFrames(layer, tl.ms);
    if (sh.length >= 2) {
      const name = `${cls}-ombre`; out.push(`@keyframes ${name} {`);
      for (const [t, v, e] of sh) out.push(`  ${pct(t, tl.ms)} { box-shadow: ${v};${e ? ` animation-timing-function: ${timingFunction(e)};` : ''} }`);
      out.push('}', ''); names.push(name);
    }
    for (const p of animatedProps(layer.motion)) {
      if (SHADOW.includes(p)) continue;
      const fr = frames(layer, p, tl.ms); if (fr.length < 2) continue;
      const name = `${cls}-${CSS_NAMES[p]}`; out.push(`@keyframes ${name} {`);
      for (const [t, v, e] of fr) { const d = declaration(layer, p, v); if (d) out.push(`  ${pct(t, tl.ms)} { ${d};${e ? ` animation-timing-function: ${timingFunction(e)};` : ''} }`); }
      out.push('}', ''); names.push(name);
    }
    if (!names.length) continue;
    out.push(`.${cls} {`, `  animation: ${names.map((n) => `${n} ${tl.ms}ms linear both ${tl.loop ? 'infinite' : '1'}`).join(', ')};`, '}', '');
  }
  return out.join('\n').trim();
}
// Canaux gérés par SwiftUI et Compose (x, y, échelle, rotation, opacité) ; les autres sont listés en commentaire.
function channels(layer, ms) {
  const out = []; const skipped = [];
  for (const p of animatedProps(layer.motion)) {
    const fr = frames(layer, p, ms); if (fr.length < 2) continue;
    const split = (key, f) => out.push({ key, frames: fr.map(([t, v, e]) => [t, f(v), e]) });
    if (p === 'position') { split('x', (v) => v.x - layer.base.position.x); split('y', (v) => v.y - layer.base.position.y); }
    else if (p === 'scale') { split('scaleX', (v) => v.x); split('scaleY', (v) => v.y); }
    else if (p === 'rotation') split('rotation', (v) => v - (layer.base.rotation || 0));
    else if (p === 'opacity') split('opacity', (v) => v);
    else skipped.push(PROP[p].name.toLowerCase());
  }
  return { chs: out, skipped };
}
const secs = (ms) => n2(ms / 1000);
export function swiftuiAnimation(layers, tl) {
  const out = [];
  for (const layer of layers) {
    const { chs, skipped } = channels(layer, tl.ms); if (!chs.length) continue;
    const ty = `${pascalCase(layer.name)}Animation`; const has = (k) => chs.some((c) => c.key === k);
    if (out.length) out.push('');
    out.push(`// ${layer.name}`, `struct ${ty} {`, ...chs.map((c) => `    var ${c.key} = ${n2(c.frames[0][1])}`), '}', '');
    out.push(`.keyframeAnimator(initialValue: ${ty}(), repeating: ${tl.loop}) { view, v in`, '    view');
    if (has('x')) out.push(`        .offset(x: ${has('x') ? 'v.x' : '0'}, y: ${has('y') ? 'v.y' : '0'})`);
    if (has('scaleX')) out.push('        .scaleEffect(x: v.scaleX, y: v.scaleY)');
    if (has('rotation')) out.push('        .rotationEffect(.degrees(v.rotation))');
    if (has('opacity')) out.push('        .opacity(v.opacity)');
    out.push('} keyframes: { _ in');
    for (const c of chs) {
      out.push(`    KeyframeTrack(\\.${c.key}) {`, `        MoveKeyframe(${n2(c.frames[0][1])})`);
      for (let i = 0; i + 1 < c.frames.length; i += 1) {
        const [t0, v0, e0] = c.frames[i]; const [t1, v1] = c.frames[i + 1]; const d = secs(t1 - t0); const e = e0 || 'linear';
        if (e === 'hold') out.push(`        LinearKeyframe(${n2(v0)}, duration: ${d})`, `        MoveKeyframe(${n2(v1)})`);
        else if (bounceOf(e) !== null) out.push(`        SpringKeyframe(${n2(v1)}, duration: ${d}, spring: Spring(duration: ${d}, bounce: ${n2(bounceOf(e))}))`);
        else if (e === 'linear') out.push(`        LinearKeyframe(${n2(v1)}, duration: ${d})`);
        else out.push(`        CubicKeyframe(${n2(v1)}, duration: ${d}) // ${timingFunction(e)}`);
      }
      out.push('    }');
    }
    out.push('}');
    if (skipped.length) out.push(`// non généré : ${skipped.join(', ')}`);
  }
  return out.join('\n');
}
const kf = (v) => `${n2(v)}f`;
function kotlinEasing(e) {
  if (!e || e === 'linear') return '';
  if (e === 'hold') return ' using Easing { f -> if (f < 1f) 0f else 1f }';
  const c = controlPoints(e);
  if (c) return ` using CubicBezierEasing(${kf(clamp(c[0], 0, 1))}, ${kf(c[1])}, ${kf(clamp(c[2], 0, 1))}, ${kf(c[3])})`;
  return ' using CubicBezierEasing(0.34f, 1.56f, 0.64f, 1f) // ressort';
}
export function composeAnimation(layers, tl) {
  const out = [];
  for (const layer of layers) {
    const { chs, skipped } = channels(layer, tl.ms); if (!chs.length) continue;
    const base = camelCase(layer.name);
    if (out.length) out.push('');
    out.push(`// ${layer.name}`);
    if (tl.loop) out.push(`val ${base}Transition = rememberInfiniteTransition(label = "${base}")`);
    for (const c of chs) {
      const v = `${base}${c.key.charAt(0).toUpperCase()}${c.key.slice(1)}`; const first = c.frames[0][1]; const last = c.frames[c.frames.length - 1][1];
      const spec = (pad) => [`${pad}keyframes {`, `${pad}    durationMillis = ${tl.ms}`, ...c.frames.map(([t, val, e]) => `${pad}    ${kf(val)} at ${t}${kotlinEasing(e)}`), `${pad}}`];
      if (tl.loop) out.push(`val ${v} by ${base}Transition.animateFloat(`, `    initialValue = ${kf(first)},`, `    targetValue = ${kf(last)},`, '    animationSpec = infiniteRepeatable(', '        animation =', ...spec('            '), '        ,', '        repeatMode = RepeatMode.Restart', '    ),', `    label = "${c.key}"`, ')');
      else out.push(`val ${v} = remember { Animatable(${kf(first)}) }`, `LaunchedEffect(Unit) { ${v}.animateTo(${kf(last)}, animationSpec =`, ...spec('    '), ') }');
    }
    out.push('Modifier.graphicsLayer {');
    for (const c of chs) {
      const v = `${base}${c.key.charAt(0).toUpperCase()}${c.key.slice(1)}${tl.loop ? '' : '.value'}`;
      out.push(`    ${{ x: `translationX = ${v}.dp.toPx()`, y: `translationY = ${v}.dp.toPx()`, scaleX: `scaleX = ${v}`, scaleY: `scaleY = ${v}`, rotation: `rotationZ = ${v}` }[c.key] || `alpha = ${v}`}`);
    }
    out.push('}');
    if (skipped.length) out.push(`// non généré : ${skipped.join(', ')}`);
  }
  return out.join('\n');
}
