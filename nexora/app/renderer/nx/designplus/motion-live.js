// NEXORA #113 : Motion de NEX-DESIGN, liaison avec les calques Fabric.js.
//  - animation d'un calque gardée dans o.nxMotion (images clés et clips, modèle motion-model.js), enregistrée avec lui ;
//  - flou du calque (o.nxBlur), nouveau : dessiné par le filtre du canevas, animable ;
//  - applyAt : état d'un calque au temps t (animation Motion, puis animation d'entrée et boucle du #011 par-dessus) :
//    sert à la lecture, à la présentation, aux exports (nx/design/pages.js) et à la frise ;
//  - affichage « vivant » quand la frise est ouverte : les calques prennent réellement leur état à la tête de lecture
//    (sélection, déplacement et poignées au bon endroit) ; leur état de base reste gardé à part et c'est lui qui est
//    enregistré (toObject), copié et annulé ; une modification faite à la tête de lecture devient une image clé si la
//    propriété en a déjà (ou en enregistrement automatique), sinon elle change l'état de base (comme desigma).
import { FabricObject, Shadow } from '../design/fab.js';
import * as M from './motion-model.js';
import { stateAt } from '../design/pages.js';

for (const p of ['nxMotion', 'nxBlur']) if (!FabricObject.customProperties.includes(p)) FabricObject.customProperties.push(p);

// Flou du calque : rayon en unités de la page, mis à l'échelle de l'affichage ou de l'export au moment du dessin.
if (!FabricObject.prototype.nxBlurRender) {
  FabricObject.prototype.nxBlurRender = FabricObject.prototype.render;
  FabricObject.prototype.render = function (ctx) {
    const r = Number(this.nxBlur) || 0;
    if (!(r > 0) || !ctx || typeof ctx.filter !== 'string') return this.nxBlurRender(ctx);
    const m = ctx.getTransform(); const k = Math.hypot(m.a, m.b) || 1;
    ctx.save();
    ctx.filter = `${ctx.filter && ctx.filter !== 'none' ? `${ctx.filter} ` : ''}blur(${Math.min(200, r * k).toFixed(2)}px)`;
    try { return this.nxBlurRender(ctx); } finally { ctx.restore(); }
  };
}

export const objs = (D) => D.canvas.getObjects().filter((o) => o.id !== '__board' && o.id !== '__nxcrop');
export const motionOf = (o) => (o && o.nxMotion && !M.isEmpty(o.nxMotion) ? o.nxMotion : null);
const legacyOf = (o) => (o && o.nxAnim && o.nxAnim.in && o.nxAnim.in !== 'none' ? o.nxAnim : null);
export const animated = (o) => Boolean(motionOf(o) || legacyOf(o));
const inSelection = (o) => Boolean(o.group && o.group.type === 'activeselection');

// ---------- Valeurs brutes (Fabric) ----------
const RAW = ['left', 'top', 'scaleX', 'scaleY', 'angle', 'opacity', 'rx', 'ry', 'fill', 'stroke', 'strokeWidth', 'shadow', 'nxBlur'];
export function snap(o) {
  const s = {};
  for (const k of RAW) s[k] = o[k];
  if (typeof o.text === 'string') s.text = o.text;
  return s;
}
export function put(o, s) {
  for (const k of Object.keys(s)) o[k] = s[k];
  if ('text' in s && o.initDimensions) { try { o.initDimensions(); } catch { /* texte sans mesure */ } }
  o.setCoords(); o.dirty = true;
}
const shadowSig = (sh) => (sh ? `${sh.color}|${sh.blur}|${sh.offsetX}|${sh.offsetY}` : '');
function same(k, a, b) {
  if (k === 'shadow') return shadowSig(a) === shadowSig(b);
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-4;
  return a === b;
}

// ---------- Valeurs animables d'un calque (état de base) ----------
const solid = (c) => typeof c === 'string' && c !== '' && c !== 'transparent';
export function baseOf(o) {
  const c = o.getCenterPoint();
  const b = { position: { x: c.x, y: c.y }, scale: { x: 1, y: 1 }, rotation: o.angle || 0, width: o.getScaledWidth(), height: o.getScaledHeight(), opacity: o.opacity ?? 1, blur: Number(o.nxBlur) || 0 };
  if (o.type === 'rect') b.radius = o.rx || 0;
  if (o.type !== 'group' && o.type !== 'image') {
    if (solid(o.fill)) b.fill = M.colorString(o.fill);
    if (solid(o.stroke)) b.stroke = M.colorString(o.stroke);
    b.strokeWidth = o.strokeWidth || 0;
  }
  const sh = o.shadow;
  b.shadowX = sh ? sh.offsetX || 0 : 0; b.shadowY = sh ? sh.offsetY || 0 : 0; b.shadowBlur = sh ? sh.blur || 0 : 0;
  b.shadowColor = sh && sh.color ? M.colorString(sh.color) : 'rgba(0, 0, 0, 0)';
  return b;
}
// Propriétés que ce calque peut animer (une forme sans remplissage uni n'anime pas sa couleur).
export function propsOf(o) { const b = baseOf(o); return M.PROPS.map(([id]) => id).filter((p) => p in b); }

// Écrit des valeurs animées (ev) sur le calque, à partir de son état brut (raw) et de base (base).
function write(o, raw, base, ev) {
  let kx = 1; let ky = 1;
  if (ev.scale) { kx *= ev.scale.x; ky *= ev.scale.y; }
  if ('width' in ev && base.width) kx *= ev.width / base.width;
  if ('height' in ev && base.height) ky *= ev.height / base.height;
  o.scaleX = raw.scaleX * kx; o.scaleY = raw.scaleY * ky;
  if ('rotation' in ev) o.angle = ev.rotation;
  if ('opacity' in ev) o.opacity = Math.min(1, Math.max(0, ev.opacity));
  if ('radius' in ev && o.type === 'rect') { o.rx = Math.max(0, ev.radius); o.ry = Math.max(0, ev.radius); }
  if ('fill' in ev && 'fill' in base) o.fill = ev.fill;
  if ('stroke' in ev && 'stroke' in base) o.stroke = ev.stroke;
  if ('strokeWidth' in ev && 'strokeWidth' in base) o.strokeWidth = Math.max(0, ev.strokeWidth);
  if (['shadowX', 'shadowY', 'shadowBlur', 'shadowColor'].some((p) => p in ev)) {
    const sh = raw.shadow || {};
    o.shadow = new Shadow({ affectStroke: sh.affectStroke, nonScaling: sh.nonScaling, includeDefaultValues: true, color: ev.shadowColor ?? base.shadowColor, blur: Math.max(0, ev.shadowBlur ?? base.shadowBlur), offsetX: ev.shadowX ?? base.shadowX, offsetY: ev.shadowY ?? base.shadowY });
  }
  if ('blur' in ev) o.nxBlur = Math.max(0, ev.blur);
  const c = ev.position || base.position;
  o.setPositionByOrigin({ x: c.x, y: c.y }, 'center', 'center');
}
// Animation d'entrée et boucle du #011 (o.nxAnim), posées par-dessus.
function writeLegacy(o, st) {
  if (!st) return null;
  const c = o.getCenterPoint();
  o.opacity = (o.opacity ?? 1) * st.alpha; o.scaleX *= st.k; o.scaleY *= st.k; o.angle = (o.angle || 0) + st.rot;
  o.setPositionByOrigin({ x: c.x + st.dx, y: c.y + st.dy }, 'center', 'center');
  if (st.chars !== null && typeof o.text === 'string') { o.text = o.text.slice(0, Math.round(o.text.length * st.chars)); if (o.initDimensions) o.initDimensions(); }
  return st;
}

// ---------- État vivant (frise ouverte) ----------
const LIVE = new WeakMap();
export const isLive = (o) => LIVE.has(o);
// État brut du calque, hors animation affichée.
export const rawOf = (o) => (LIVE.get(o) || {}).raw || snap(o);

// Met un calque dans son état au temps t (ms), toujours calculé depuis son état de base.
export function applyAt(o, t) {
  const L = LIVE.get(o);
  if (L) put(o, L.raw);
  const raw = L ? L.raw : snap(o);
  const m = motionOf(o); const legacy = legacyOf(o);
  const base = baseOf(o);
  const ev = m ? M.evaluate(m, base, t) : {};
  write(o, raw, base, ev);
  const st = legacy ? writeLegacy(o, stateAt(o, t / 1000)) : null;
  o.setCoords(); o.dirty = true;
  return { base, ev, st };
}

// Montre la page au temps t : chaque calque animé prend son état (les autres retrouvent le leur).
export function showFrame(D, t) {
  for (const o of objs(D)) {
    const L = LIVE.get(o);
    if (!animated(o)) { if (L) { put(o, L.raw); LIVE.delete(o); } continue; }
    if (o.isEditing || inSelection(o)) continue;
    const entry = L || { raw: snap(o) };
    if (!L) LIVE.set(o, entry);
    const r = applyAt(o, t);
    entry.base = r.base; entry.ev = r.ev; entry.st = r.st; entry.t = t; entry.applied = snap(o);
  }
  D.canvas.requestRenderAll();
}
// Remet chaque calque dans son état de base (frise fermée, export d'une image fixe…).
export function stopLive(D) {
  for (const o of objs(D)) { const L = LIVE.get(o); if (L) { if (!inSelection(o)) put(o, L.raw); LIVE.delete(o); } }
  D.canvas.requestRenderAll();
}
// Le temps d'une fonction (export d'une image, vignette), les calques reprennent leur état de base.
export function withBase(D, fn) {
  const list = objs(D).filter((o) => LIVE.has(o) && !inSelection(o));
  if (!list.length) return fn();
  const cur = list.map((o) => [o, snap(o)]);
  for (const o of list) put(o, LIVE.get(o).raw);
  const back = () => { for (const [o, s] of cur) put(o, s); D.canvas.requestRenderAll(); };
  let r;
  try { r = fn(); } catch (e) { back(); throw e; }
  if (r && typeof r.then === 'function') return r.finally(back);
  back();
  return r;
}

// Enregistrement : un calque vivant est toujours enregistré (et copié) dans son état de base.
if (!FabricObject.prototype.nxMotionToObject) {
  FabricObject.prototype.nxMotionToObject = FabricObject.prototype.toObject;
  FabricObject.prototype.toObject = function (props) {
    const L = LIVE.get(this);
    if (!L) return this.nxMotionToObject(props);
    const cur = snap(this);
    const keep = { left: this.left, top: this.top, scaleX: this.scaleX, scaleY: this.scaleY, angle: this.angle };
    // Dans une sélection multiple, Fabric a déjà posé l'état absolu du calque : seul ce qui n'est pas la géométrie
    // est remplacé, la géométrie de base vient de l'état brut.
    for (const k of Object.keys(L.raw)) this[k] = L.raw[k];
    try { return this.nxMotionToObject(props); } finally { for (const k of Object.keys(cur)) this[k] = cur[k]; Object.assign(this, keep); }
  };
}

// ---------- Modification faite à la tête de lecture ----------
const ADD = ['position', 'rotation'];
const MUL = ['scale', 'opacity', 'width', 'height'];
const near = (p, a, b) => {
  if (a === undefined || b === undefined) return a === b;
  if (M.PROP[p].kind === 'vec2') return Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
  if (M.PROP[p].kind === 'color') return M.colorString(a) === M.colorString(b);
  return Math.abs(a - b) < (p === 'opacity' ? 1e-4 : 0.01);
};
function shownOf(o, L) {
  const c = o.getCenterPoint(); const st = L.st;
  const s = { position: { x: c.x, y: c.y }, rotation: o.angle || 0, opacity: o.opacity ?? 1, scale: { x: o.scaleX / (L.raw.scaleX || 1), y: o.scaleY / (L.raw.scaleY || 1) }, blur: Number(o.nxBlur) || 0 };
  if (st) { s.position = { x: s.position.x - st.dx, y: s.position.y - st.dy }; s.rotation -= st.rot; if (st.alpha > 1e-3) s.opacity /= st.alpha; s.scale = { x: s.scale.x / st.k, y: s.scale.y / st.k }; }
  if (o.type === 'rect') s.radius = o.rx || 0;
  if (solid(o.fill)) s.fill = M.colorString(o.fill);
  if (solid(o.stroke)) s.stroke = M.colorString(o.stroke);
  s.strokeWidth = o.strokeWidth || 0;
  const sh = o.shadow;
  s.shadowX = sh ? sh.offsetX || 0 : 0; s.shadowY = sh ? sh.offsetY || 0 : 0; s.shadowBlur = sh ? sh.blur || 0 : 0; s.shadowColor = sh && sh.color ? M.colorString(sh.color) : 'rgba(0, 0, 0, 0)';
  return s;
}
// Valeur attendue à la tête de lecture (ce qui était affiché avant la modification).
function expectedOf(L) {
  const e = { ...L.base, ...L.ev };
  const k = { x: (L.ev.scale ? L.ev.scale.x : 1) * ('width' in L.ev && L.base.width ? L.ev.width / L.base.width : 1), y: (L.ev.scale ? L.ev.scale.y : 1) * ('height' in L.ev && L.base.height ? L.ev.height / L.base.height : 1) };
  e.scale = k;
  return e;
}
// Après une modification (glisser, panneau, raccourci) : images clés ou nouvel état de base. Renvoie true si
// quelque chose a changé.
export function reconcile(D, t, { autoKey = false } = {}) {
  let any = false;
  for (const o of objs(D)) {
    const L = LIVE.get(o);
    if (!L || !L.applied || inSelection(o) || o.isEditing) continue;
    const cur = snap(o);
    if (RAW.every((k) => same(k, cur[k], L.applied[k])) && cur.text === L.applied.text) continue;
    any = true;
    if (cur.text !== L.applied.text && 'text' in L.raw && !L.st) L.raw.text = cur.text;
    const shown = shownOf(o, L); const exp = expectedOf(L);
    const m = M.normalizeMotion(o.nxMotion || {});
    const statics = {};
    // L'échelle affichée sert à la fois à l'échelle et à la taille : elle va à la propriété qui a une piste.
    const scaleTarget = m.tracks.scale ? 'scale' : m.tracks.width || m.tracks.height ? 'size' : 'scale';
    for (const p of propsOf(o)) {
      if (p === 'width' || p === 'height') continue;
      if (near(p, shown[p], exp[p])) continue;
      if (p === 'scale' && scaleTarget === 'size') {
        for (const [wp, ax] of [['width', 'x'], ['height', 'y']]) {
          if (Math.abs(shown.scale[ax] - exp.scale[ax]) < 1e-4) continue;
          const keyed = M.keyedValueAt(m, L.base, wp, t); const ratio = shown.scale[ax] / (exp.scale[ax] || 1);
          if (m.tracks[wp] || autoKey) {
            if (!m.tracks[wp] && t > 0) M.setKey(m, wp, 0, L.base[wp]);
            M.setKey(m, wp, t, keyed * ratio);
          } else {
            statics.scale = statics.scale || { x: 1, y: 1 };
            statics.scale[ax] = ratio;
          }
        }
        continue;
      }
      const keyed = M.keyedValueAt(m, L.base, p, t);
      let v;
      if (ADD.includes(p)) v = M.PROP[p].kind === 'vec2' ? { x: keyed.x + shown[p].x - exp[p].x, y: keyed.y + shown[p].y - exp[p].y } : keyed + shown[p] - exp[p];
      else if (MUL.includes(p)) v = M.PROP[p].kind === 'vec2' ? { x: keyed.x * (exp[p].x ? shown[p].x / exp[p].x : 1), y: keyed.y * (exp[p].y ? shown[p].y / exp[p].y : 1) } : exp[p] ? keyed * (shown[p] / exp[p]) : shown[p];
      else v = shown[p];
      if (m.tracks[p] || (autoKey && t > 0)) {
        if (!m.tracks[p]) M.setKey(m, p, 0, M.keyedValueAt(m, L.base, p, 0));
        M.setKey(m, p, t, v);
      } else if (p === 'scale') statics.scale = { x: exp.scale.x ? shown.scale.x / exp.scale.x : 1, y: exp.scale.y ? shown.scale.y / exp.scale.y : 1 };
      else if (ADD.includes(p)) statics[p] = M.PROP[p].kind === 'vec2' ? { x: L.base[p].x + shown[p].x - exp[p].x, y: L.base[p].y + shown[p].y - exp[p].y } : L.base[p] + shown[p] - exp[p];
      else if (p === 'opacity') statics.opacity = Math.min(1, Math.max(0, exp.opacity ? L.base.opacity * (shown.opacity / exp.opacity) : shown.opacity));
      else statics[p] = shown[p];
    }
    // Nouvel état de base : appliqué sur l'état brut, puis relu.
    put(o, L.raw);
    if (statics.scale) { o.scaleX *= statics.scale.x; o.scaleY *= statics.scale.y; }
    if ('rotation' in statics) o.angle = statics.rotation;
    if ('opacity' in statics) o.opacity = statics.opacity;
    if ('radius' in statics && o.type === 'rect') { o.rx = statics.radius; o.ry = statics.radius; }
    if ('fill' in statics) o.fill = statics.fill;
    if ('stroke' in statics) o.stroke = statics.stroke;
    if ('strokeWidth' in statics) o.strokeWidth = statics.strokeWidth;
    if (['shadowX', 'shadowY', 'shadowBlur', 'shadowColor'].some((p) => p in statics)) {
      const b = baseOf(o);
      o.shadow = new Shadow({ color: statics.shadowColor ?? b.shadowColor, blur: statics.shadowBlur ?? b.shadowBlur, offsetX: statics.shadowX ?? b.shadowX, offsetY: statics.shadowY ?? b.shadowY });
    }
    if ('blur' in statics) o.nxBlur = statics.blur;
    const center = statics.position || (statics.scale || 'rotation' in statics ? L.base.position : null);
    if (center) o.setPositionByOrigin({ x: center.x, y: center.y }, 'center', 'center');
    L.raw = snap(o);
    o.nxMotion = M.isEmpty(m) ? undefined : m;
    if (!o.nxMotion) delete o.nxMotion;
    const r = applyAt(o, t);
    L.base = r.base; L.ev = r.ev; L.st = r.st; L.t = t; L.applied = snap(o);
  }
  if (any) D.canvas.requestRenderAll();
  return any;
}

// Calques de la page pour le code (CSS, SwiftUI, Compose) : état de base et animation.
export function codeLayers(D, only = null) {
  return objs(D).filter((o) => motionOf(o) && (!only || only.includes(o))).map((o) => {
    return { name: layerName(D, o), text: ['textbox', 'i-text', 'text'].includes(o.type), base: baseFromRaw(o), motion: o.nxMotion };
  });
}
// État de base d'un calque, même s'il est affiché à la tête de lecture.
export function baseFromRaw(o) {
  const L = LIVE.get(o);
  if (!L || inSelection(o)) return baseOf(o);
  const cur = snap(o); put(o, L.raw);
  try { return baseOf(o); } finally { put(o, cur); }
}
// Change la valeur fixe d'une propriété (sans image clé) ; t : tête de lecture à remettre (frise ouverte).
export function setBase(o, p, v, t = null) {
  const L = LIVE.get(o);
  if (L) put(o, L.raw);
  const b = baseOf(o); const c = o.getCenterPoint();
  const keep = () => o.setPositionByOrigin({ x: c.x, y: c.y }, 'center', 'center');
  if (p === 'position') o.setPositionByOrigin({ x: v.x, y: v.y }, 'center', 'center');
  else if (p === 'scale') { o.scaleX *= v.x || 1; o.scaleY *= v.y || 1; keep(); }
  else if (p === 'rotation') { o.angle = v; keep(); }
  else if (p === 'width' && b.width) { o.scaleX *= v / b.width; keep(); }
  else if (p === 'height' && b.height) { o.scaleY *= v / b.height; keep(); }
  else if (p === 'opacity') o.opacity = Math.min(1, Math.max(0, v));
  else if (p === 'radius' && o.type === 'rect') { o.rx = Math.max(0, v); o.ry = Math.max(0, v); }
  else if (p === 'fill' || p === 'stroke') o[p] = M.colorString(v);
  else if (p === 'strokeWidth') o.strokeWidth = Math.max(0, v);
  else if (p === 'blur') o.nxBlur = Math.max(0, v);
  else if (p.startsWith('shadow')) {
    const s = { color: b.shadowColor, blur: b.shadowBlur, offsetX: b.shadowX, offsetY: b.shadowY };
    if (p === 'shadowX') s.offsetX = v; if (p === 'shadowY') s.offsetY = v; if (p === 'shadowBlur') s.blur = Math.max(0, v); if (p === 'shadowColor') s.color = M.colorString(v);
    o.shadow = new Shadow(s);
  }
  o.setCoords(); o.dirty = true;
  if (L) {
    L.raw = snap(o);
    if (t !== null) { const r = applyAt(o, t); L.base = r.base; L.ev = r.ev; L.st = r.st; L.t = t; L.applied = snap(o); }
  }
}
// Nom du calque, comme dans la liste des calques de NEX-DESIGN.
export const layerName = (D, o) => o.name || (D.typeName ? D.typeName(o) : o.type) || 'Calque';
