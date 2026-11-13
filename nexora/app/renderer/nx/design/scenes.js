// NEXORA #118 : éléments des modèles « photo » de NEX-DESIGN (planches de marque, cartes, mises en scène) :
// photos d'exemple (nx/photos/, remplaçables comme toute photo de cadre), dégradés, halos, pastilles, ronds à flèche,
// appareils réalistes du Studio (#100) posés en calques 3D inclinés avec un écran d'exemple aux couleurs du kit de
// marque, roches et objets 3D. Réglage « Écran de l'appareil » des calques 3D posés par ces modèles.
import { Rect, Ellipse, Textbox, FabricImage, Gradient, Shadow, Path } from './fab.js';
import { layoutInFrame } from './content.js';
import { SHAPES } from '../library.js';
import { a as LABELS3D, b as SPEC3D, d as forget3d, e as Layer3D, f as render3d } from '../../dist/chunks/chunk-LP5R3JQT.js';
import { photoUrl, screenCanvas, SCREENS } from './ecrans.js';
import { uid, inkOn, pickFile, toast, esc, ico } from '../core.js';

export const TYPES = new Set(['photo', 'grad', 'glow', 'pill', 'orb', 'device', 'rock', 'decor3d']);

// ---------- Photos ----------
const dataCache = new Map();
export function photoData(key) {
  if (!dataCache.has(key)) {
    dataCache.set(key, fetch(photoUrl(key)).then((r) => { if (!r.ok) throw new Error(`Photo « ${key} » introuvable.`); return r.blob(); })
      .then((b) => new Promise((ok, ko) => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = () => ko(f.error); f.readAsDataURL(b); })));
  }
  return dataCache.get(key);
}
// Carré arrondi au rayon `r` (px) pour une boîte w × h, tracé dans la boîte 100 × 100 des cadres : les coins restent
// ronds quelle que soit la forme de la boîte.
export function tilePath(w, h, r) {
  const rx = Math.min(50, (100 * r) / Math.max(1, w)); const ry = Math.min(50, (100 * r) / Math.max(1, h));
  const f = (n) => Number(n.toFixed(3));
  return `M${f(rx)} 0 H${f(100 - rx)} Q100 0 100 ${f(ry)} V${f(100 - ry)} Q100 100 ${f(100 - rx)} 100 H${f(rx)} Q0 100 0 ${f(100 - ry)} V${f(ry)} Q0 0 ${f(rx)} 0 Z`;
}

// ---------- Calques 3D ----------
function b64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768)); return btoa(s); }
function glbAsset(D, bytes, name) { return D.addAsset('glb', `data:model/gltf-binary;base64,${b64(bytes)}`, name); }
async function layer3d(D, spec, { x, y, w, h }, name) {
  const o = new Layer3D(null, { spec: { ...SPEC3D, shadow: 0, ...spec }, left: x, top: y, width: w, height: h });
  o.id = uid(); o.name = name;
  await render3d(o, D.doc.assets);
  return o;
}
async function deviceBytes(key, screen, brand, land) {
  const DEV = await import('../studioplus/devices.js');
  return DEV.build(key, typeof screen === 'string' && screen.startsWith('data:') ? screen : (aspect) => screenCanvas(screen, brand, aspect, { land }));
}
async function deviceName(key) { const DEV = await import('../studioplus/devices.js'); return (DEV.DEVICES[key] || {}).name || 'Appareil'; }

// ---------- Construction d'un élément de modèle (positions relatives à la page) ----------
function rot(o, angle, cx, cy) { if (angle) o.set({ angle }); o.setPositionByOrigin({ x: cx, y: cy }, 'center', 'center'); }
export async function build(D, it, { W, H, m, brand }) {
  const x = it.x * W; const y = it.y * H; const w = it.w * W; const h = (it.h != null ? it.h * H : it.w * W);
  const r = (it.r || 0) * m; const out = [];
  if (it.type === 'photo') {
    const img = await FabricImage.fromURL(await photoData(it.src));
    layoutInFrame(img, { x, y, w, h }, 'tuile', { zoom: it.zoom || 1, dx: it.dx || 0, dy: it.dy || 0, rad: r });
    img.name = it.name || 'Photo';
    out.push(img);
  }
  if (it.type === 'grad') {
    const c = it.coords || [0, 0, 0, 1];
    const fill = new Gradient({ type: 'linear', gradientUnits: 'pixels', coords: { x1: c[0] * w, y1: c[1] * h, x2: c[2] * w, y2: c[3] * h }, colorStops: it.stops.map(([offset, color]) => ({ offset, color })) });
    out.push(new Rect({ left: x, top: y, width: w, height: h, rx: r, ry: r, fill, strokeWidth: 0, name: it.name || 'Dégradé' }));
  }
  if (it.type === 'glow') {
    const mid = it.color.replace(/[\d.]+\)$/, (a) => `${(parseFloat(a) * 0.35).toFixed(3)})`);
    const fill = new Gradient({ type: 'radial', gradientUnits: 'pixels', coords: { x1: 50, y1: 50, r1: 0, x2: 50, y2: 50, r2: 50 }, colorStops: [{ offset: 0, color: it.color }, { offset: 0.55, color: mid }, { offset: 1, color: 'rgba(0,0,0,0)' }] });
    out.push(new Ellipse({ left: x, top: y, rx: 50, ry: 50, scaleX: w / 100, scaleY: h / 100, fill, strokeWidth: 0, name: 'Halo' }));
  }
  if (it.type === 'pill') {
    const cx = x + w / 2; const cy = y + h / 2;
    const p = new Rect({ width: w, height: h, rx: h / 2, ry: h / 2, fill: it.fill, stroke: it.stroke || null, strokeWidth: it.stroke ? Math.max(1, m * 0.0016) : 0, name: 'Pastille' });
    rot(p, it.angle, cx, cy); out.push(p);
    const dot = it.dot ? h * 0.32 : 0;
    const t = new Textbox(it.text, { width: w - h * 0.5 - dot, fontSize: it.size * m, fontFamily: it.font || brand.fonts.body, fontWeight: it.weight || 600, fill: it.color || inkOn(it.fill), textAlign: 'center', lineHeight: 1 });
    const a = ((it.angle || 0) * Math.PI) / 180; const off = dot / 2;
    rot(t, it.angle, cx + Math.cos(a) * off, cy + Math.sin(a) * off); t.name = it.text.slice(0, 24); out.push(t);
    if (it.dot) { const d = new Ellipse({ rx: h * 0.12, ry: h * 0.12, fill: it.dot, strokeWidth: 0, name: 'Point' }); const dx = -w / 2 + h * 0.42; rot(d, 0, cx + Math.cos(a) * dx, cy + Math.sin(a) * dx); out.push(d); }
  }
  if (it.type === 'orb') {
    const d = it.w * W; const c = new Ellipse({ left: x, top: y, rx: d / 2, ry: d / 2, fill: it.fill || 'rgba(0,0,0,0)', stroke: it.stroke || null, strokeWidth: it.stroke ? Math.max(1, d * 0.03) : 0, name: 'Bouton rond' });
    out.push(c);
    const s = d * 0.42; const p = new Path(SHAPES.flecheOblique[1], { fill: it.color || inkOn(it.fill || '#000000'), strokeWidth: 0 });
    p.set({ scaleX: s / p.width, scaleY: s / p.height }); p.setPositionByOrigin({ x: x + d / 2, y: y + d / 2 }, 'center', 'center'); p.name = 'Flèche'; out.push(p);
  }
  if (it.type === 'device') {
    const name = await deviceName(it.key);
    const asset = glbAsset(D, await deviceBytes(it.key, it.screen || 'site', brand, !!it.land), name);
    out.push(await layer3d(D, { kind: 'glb', asset, color: '#ffffff', rx: it.rx || 0, ry: it.ry || 0, rz: it.rz || 0, fov: it.fov || 30, light: it.light ?? 35, intensity: it.intensity ?? 1, env: it.env ?? 1, nxDevice: it.key, nxScreen: it.screen || 'site', nxLand: !!it.land }, { x, y, w, h }, `3D · ${name}`));
  }
  if (it.type === 'rock') {
    const R = await import('../studioplus/rocks.js');
    const asset = glbAsset(D, await R.build({ seed: it.seed || 1, flat: it.flat || 0.7 }), 'Roche');
    out.push(await layer3d(D, { kind: 'glb', asset, color: '#ffffff', rx: it.rx || 0, ry: it.ry || 0, rz: it.rz || 0, light: it.light ?? 35, intensity: it.intensity ?? 1 }, { x, y, w, h }, '3D · Roche'));
  }
  if (it.type === 'decor3d') {
    out.push(await layer3d(D, { kind: 'decor', shape: it.shape, color: it.color, finish: it.finish || 'satin', rx: it.rx ?? -12, ry: it.ry ?? 28, rz: it.rz || 0 }, { x, y, w, h }, `3D · ${LABELS3D[it.shape] || it.shape}`));
  }
  for (const o of out) { decorate(o, it, { W, H, m }); if (!o.id) o.id = uid(); }
  return out;
}
// Opacité, mode de fusion, ombre portée et découpe (rectangle fixe de la page) d'un élément de modèle.
export function decorate(o, it, { W, H, m }) {
  if (it.opacity != null) o.set('opacity', it.opacity);
  if (it.blend) o.set('globalCompositeOperation', it.blend);
  if (it.shadow) o.set('shadow', new Shadow({ color: it.shadow[0], blur: it.shadow[1] * m, offsetX: (it.shadow[2] || 0) * m, offsetY: (it.shadow[3] || 0) * m }));
  if (it.clip) { const [cx, cy, cw, ch, cr = 0] = it.clip; o.clipPath = new Rect({ left: cx * W, top: cy * H, width: cw * W, height: ch * H, rx: cr * m, ry: cr * m, absolutePositioned: true }); }
  return o;
}
// Texte : couleur par ligne (`lines`) et mot d'accent (`accent` : [texte, couleur, graisse ?]).
export function styleText(o, it) {
  const lines = String(it.text).split('\n'); const st = {};
  if (Array.isArray(it.lines)) lines.forEach((l, i) => { if (!it.lines[i]) return; st[i] = st[i] || {}; for (let c = 0; c < l.length; c++) st[i][c] = { fill: it.lines[i] }; });
  if (it.accent) {
    const [word, color, weight] = it.accent;
    lines.forEach((l, i) => { const at = l.indexOf(word); if (at < 0) return; st[i] = st[i] || {}; for (let c = at; c < at + word.length; c++) st[i][c] = { ...(st[i][c] || {}), fill: color, ...(weight ? { fontWeight: weight } : {}) }; });
  }
  if (Object.keys(st).length) o.set('styles', st);
}
export const isDevice = (o) => !!(o && o.spec && o.spec.nxDevice);

// ---------- Panneau de droite : écran de l'appareil ----------
export function props(D, o, { sec, btn }) {
  if (!isDevice(o)) return '';
  const cur = o.spec.nxScreen;
  const ex = Object.entries(SCREENS).map(([k, l]) => `<button class="btn small${cur === k ? ' primary' : ''}" data-dzx="nxdev-ex:${k}" aria-pressed="${cur === k}">${ico('display', 13)}<span>${esc(l)}</span></button>`).join('');
  return sec('Écran de l’appareil', `<div class="nx-btns">${btn('nxdev-pick', 'image', 'Choisir une image…')}</div><div class="nx-btns">${ex}</div><p class="dzx-hint">Modèle réaliste du Studio : l’image est recadrée au format exact de l’écran. Les écrans d’exemple reprennent les couleurs et la police de votre kit de marque.</p>`);
}
export async function onAction(D, o, a, brand) {
  if (!isDevice(o) || !a.startsWith('nxdev-')) return false;
  let screen = null;
  if (a === 'nxdev-pick') { const f = await pickFile({ title: 'Image de l’écran', name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }); if (!f || !f.dataUrl) return true; screen = f.dataUrl; }
  else screen = a.slice('nxdev-ex:'.length);
  const t = toast('Mise à jour de l’écran…', { busy: true, sticky: true });
  try {
    const key = o.spec.nxDevice; const old = o.spec.asset;
    const asset = glbAsset(D, await deviceBytes(key, screen, brand, !!o.spec.nxLand), await deviceName(key));
    o.spec = { ...o.spec, asset, nxScreen: screen.startsWith('data:') ? 'image' : screen };
    forget3d(o.id); await render3d(o, D.doc.assets);
    if (old && old !== asset && !D.canvas.getObjects().some((x) => x !== o && x.spec && x.spec.asset === old)) delete D.doc.assets[old];
    D.canvas.requestRenderAll(); D.changed(); D.renderProps();
    toast(screen.startsWith('data:') ? 'Image affichée sur l’écran.' : `Écran d’exemple : ${SCREENS[screen]}.`);
  } finally { t.close(); }
  return true;
}
