// NEXORA #122 : présentations du Studio sur le modèle des références de l'utilisateur (ordinateurs et téléphones
// réalistes inclinés comme en photo de studio, fonds violets ou nuit, halos et arcs lumineux, socles brillants,
// roches, sol miroir, grands titres, repères en pilule). Quatre styles s'ajoutent au style d'origine
// (« Classique ») : chaque mise en page (couverture, tous les écrans, mobile, ordinateur, points forts, message
// clé, contact) a sa composition 3D et sa typographie, tirées des couleurs de la marque de la présentation.
// Rien n'est réécrit dans le Studio compilé : enveloppes de rebuildSlide, slideBuild, openSlide, load et build.
// Les appareils réalistes (#100) sont partagés : le fichier GLB d'origine est enregistré une fois sous un
// identifiant stable (« nx122:… »), réenregistré avant chaque chargement (les GLB ne sont gardés qu'en mémoire),
// et l'écran est posé à l'affichage (capture du site de la présentation, sinon écran d'exemple de la marque) :
// une diapositive n'enregistre que des propriétés, jamais de modèle ni d'image.
import * as THREE from '../../dist/chunks/three-D5YSJNBV.js';
import { c as freshAnim, e as addKey } from '../../dist/chunks/chunk-2DYF2ZBK.js';
import * as DEV from './devices.js';
import * as ROCKS from './rocks.js';
import { screenCanvas } from '../design/ecrans.js';
import { esc, icon, toast, busy, done, settings, saveSettings } from './ui.js';
import { mixHex } from '../core.js';

const PREFIX = 'nx122:';

// ---------- Styles ----------
// Chaque style : fond et lumière du Studio, matières du décor, couleurs du texte. `accent` : couleur tirée de la
// marque (fonction) ou fixée par le style.
export const LOOKS = {
  violet: { label: 'Violet', note: 'Fond violet profond, halo et socle brillant' },
  nuit: { label: 'Nuit néon', note: 'Noir, sol miroir et lumières néon' },
  galerie: { label: 'Galerie', note: 'Studio clair, roches et ombres douces' },
  marque: { label: 'Marque', note: 'Couleur de la marque : dégradé de la couleur principale, roches' },
  classique: { label: 'Classique', note: 'Style d’origine : podium et sphères' },
};
export const DEFAULT_LOOK = 'violet';

const lum = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return 0.5;
  const n = parseInt(m[1], 16); const c = [n >> 16 & 255, n >> 8 & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const rgba = (hex, a) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); const n = m ? parseInt(m[1], 16) : 0; return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
// Couleur de marque utilisable comme accent : ni presque noire ni presque blanche.
function brandAccent(S, fallback) {
  const p = (S.brand && S.brand().primary) || '';
  const l = lum(p);
  return /^#[0-9a-f]{6}$/i.test(p) && l > 0.03 && l < 0.82 ? p : fallback;
}

// Jetons d'un style pour la marque courante.
function tokens(S, key) {
  const brand = S.brand ? S.brand() : {};
  if (key === 'nuit') {
    const A = brandAccent(S, '#8b5cff');
    return {
      key, dark: true, accent: mixHex(A, '#ffffff', 0.25), glow: mixHex(A, '#ffffff', 0.15), glow2: '#4f86ff', halo: mixHex(A, '#000000', 0.35), screenAccent: A,
      ink: '#ffffff', soft: 'rgba(255,255,255,0.68)', faint: 'rgba(255,255,255,0.42)',
      pill: 'rgba(255,255,255,0.09)', pillInk: '#ffffff', cta: '#ffffff', ctaInk: '#0b0b10', card: 'rgba(255,255,255,0.07)', cardLine: 'rgba(255,255,255,0.14)',
      stand: { color: '#141320', finish: 'brillant' },
      env: { bg: 'color', bgColor: '#06050b', bgColor2: '#06050b', floor: 'glossy', light: 'neon', exposure: 1.05, reflect: 0.6, floorRough: 0.1, floorColor: '#06050b', fog: { mode: 'exp', color: '#06050b', density: 0.22 }, fx: { bloom: true, bloomStrength: 0.9, bloomRadius: 0.5, bloomThreshold: 1.5, vignette: true, vignetteAmount: 0.55 } },
    };
  }
  if (key === 'galerie') {
    const A = brandAccent(S, '#5b3df5');
    return {
      key, dark: false, accent: mixHex(A, '#000000', 0.08), glow: A, glow2: A, halo: null, screenAccent: A,
      ink: '#0e0e12', soft: 'rgba(14,14,18,0.66)', faint: 'rgba(14,14,18,0.42)',
      pill: 'rgba(14,14,18,0.06)', pillInk: '#0e0e12', cta: '#0e0e12', ctaInk: '#ffffff', card: 'rgba(255,255,255,0.72)', cardLine: 'rgba(14,14,18,0.08)',
      stand: { color: '#f4f4f6', finish: 'satin' },
      env: { bg: 'studio', bgColor: '#ececef', floor: 'shadow', light: 'doux', exposure: 1.02, reflect: 0.5, floorRough: 0.14, floorColor: '', fog: null, fx: { bloom: false, vignette: true, vignetteAmount: 0.22 } },
    };
  }
  if (key === 'marque') {
    const A = brandAccent(S, '#ff6a2c');
    const light = lum(A) > 0.45;
    return {
      key, dark: true, accent: light ? mixHex(A, '#ffffff', 0.2) : mixHex(A, '#ffffff', 0.45), glow: A, glow2: A, halo: mixHex(A, '#ffffff', 0.3), screenAccent: A,
      ink: '#ffffff', soft: 'rgba(255,255,255,0.74)', faint: 'rgba(255,255,255,0.48)',
      pill: 'rgba(255,255,255,0.12)', pillInk: '#ffffff', cta: '#ffffff', ctaInk: mixHex(A, '#000000', 0.7), card: 'rgba(0,0,0,0.22)', cardLine: 'rgba(255,255,255,0.16)',
      stand: { color: mixHex(A, '#000000', 0.55), finish: 'brillant' },
      env: { bg: 'gradient', bgColor: mixHex(A, '#ffffff', 0.1), bgColor2: mixHex(A, '#000000', 0.84), floor: 'shadow', light: 'contraste', exposure: 1, reflect: 0.5, floorRough: 0.14, floorColor: '', fog: null, fx: { bloom: false, vignette: true, vignetteAmount: 0.4 } },
    };
  }
  // Violet (par défaut) : la palette des références, quelle que soit la marque.
  return {
    key: 'violet', dark: true, accent: '#c4b2ff', glow: '#b9a3ff', glow2: '#5b2df0', halo: '#8a5cff', screenAccent: brandAccent(S, '#6d4aff'),
    ink: '#ffffff', soft: 'rgba(255,255,255,0.72)', faint: 'rgba(255,255,255,0.46)',
    pill: 'rgba(255,255,255,0.10)', pillInk: '#ffffff', cta: '#ffffff', ctaInk: '#1a0f3d', card: 'rgba(255,255,255,0.08)', cardLine: 'rgba(255,255,255,0.16)',
    stand: { color: '#5a2ee0', finish: 'brillant' },
    env: { bg: 'gradient', bgColor: '#4a25c4', bgColor2: '#0a0320', floor: 'shadow', light: 'studio', exposure: 1.05, reflect: 0.42, floorRough: 0.22, floorColor: '', fog: null, fx: { bloom: true, bloomStrength: 0.75, bloomRadius: 0.55, bloomThreshold: 1.5, vignette: true, vignetteAmount: 0.5 } },
    brandName: brand.name,
  };
}

// ---------- Modèles partagés ----------
const glbCache = new Map();
function sharedBytes(id) {
  if (!glbCache.has(id)) {
    const p = (async () => {
      const parts = id.slice(PREFIX.length).split(':');
      if (parts[0] === 'dev') {
        const r = await fetch(new URL(`./devices/${parts[1]}.glb`, import.meta.url));
        if (!r.ok) throw new Error('Modèle introuvable.');
        return new Uint8Array(await r.arrayBuffer());
      }
      if (parts[0] === 'roche') return ROCKS.build({ seed: Number(parts[1]) || 1, size: 24, flat: Number(parts[2]) || 0.7 });
      if (['anneau', 'arc', 'barre', 'halo'].includes(parts[0]) && /^[0-9a-f]{6}$/i.test(parts[1] || '')) return lightBytes(parts[0], `#${parts[1]}`);
      throw new Error('Modèle inconnu.');
    })();
    p.catch(() => glbCache.delete(id));
    glbCache.set(id, p);
  }
  return glbCache.get(id);
}
async function ensureShared(S, id) {
  if (S.gltfs.has(id)) return id;
  if (!S.nxGlbJobs) S.nxGlbJobs = new Map();
  if (!S.nxGlbJobs.has(id)) S.nxGlbJobs.set(id, (async () => { const b = await sharedBytes(id); if (!S.gltfs.has(id)) await S.registerGlb(b, id); })().finally(() => S.nxGlbJobs.delete(id)));
  await S.nxGlbJobs.get(id);
  return id;
}
// Modèles partagés cités par une scène : enregistrés avant son chargement (sinon load() les ignore).
async function ensureFor(S, objects) {
  const ids = [...new Set((objects || []).filter((o) => o && o.kind === 'glb' && typeof o.glbId === 'string' && o.glbId.startsWith(PREFIX)).map((o) => o.glbId))];
  for (const id of ids) { try { await ensureShared(S, id); } catch (e) { console.warn('[NEXORA #122] modèle', id, e); } }
}

// ---------- Écrans ----------
const screenCache = new Map();
const CATALOG = { phone: 'phone', laptop: 'laptop', tablet: 'tablet', display: 'laptop' };
function kitFor(S, look) {
  const b = S.brand ? S.brand() : {};
  const T = tokens(S, look || 'violet');
  return { name: (b.name || 'NEXORA').trim() || 'NEXORA', colors: [T.screenAccent, '#ff5b3a', '#ffd23f', '#111113', '#f4f4f1'], fonts: { title: 'Inter', body: 'Inter' }, logo: null };
}
function screenAspect(mesh) {
  mesh.geometry.computeBoundingBox();
  const s = mesh.geometry.boundingBox.getSize(new THREE.Vector3());
  return s.x / Math.max(1e-6, s.y);
}
// Capture du site au format de l'écran (comme object-fit: cover, ancrée en haut), sinon null.
async function siteShot(S, fam, land, aspect) {
  const url = S.siteUrl ? S.siteUrl() : '';
  if (!url || !S.snapPage) return null;
  const slots = S.adState ? S.adState().devices : {};
  const id = slots[CATALOG[fam] || 'phone'] || (fam === 'phone' ? 'iphone-18-pro' : fam === 'tablet' ? 'ipad-pro-11' : 'macbook-pro-14');
  const shot = await S.snapPage(id, null, !!land, url, false);
  if (!shot || !shot.canvas) return null;
  const img = shot.canvas; const W = 1600; const H = Math.round(W / aspect);
  const c = document.createElement('canvas'); c.width = aspect >= 1 ? W : Math.round(1600 * aspect); c.height = aspect >= 1 ? H : 1600;
  const x = c.getContext('2d'); x.fillStyle = shot.sbBg || '#ffffff'; x.fillRect(0, 0, c.width, c.height);
  const k = Math.max(c.width / img.width, c.height / img.height);
  x.drawImage(img, (c.width - img.width * k) / 2, 0, img.width * k, img.height * k);
  return c;
}
function screenFor(S, item, aspect) {
  const o = item.nxSlide || {};
  const fam = (DEV.DEVICES[item.nxDevice] || {}).kind || 'phone';
  const kit = kitFor(S, o.look);
  const url = S.siteUrl ? S.siteUrl() : '';
  const key = [item.nxDevice, o.screen, o.land ? 1 : 0, aspect.toFixed(3), url, kit.name, kit.colors[0]].join('|');
  if (!screenCache.has(key)) {
    const p = (async () => {
      let c = null;
      try { c = await siteShot(S, fam, o.land, aspect); } catch (e) { console.warn('[NEXORA #122] capture du site', e); }
      if (!c) c = await screenCanvas(o.screen || (fam === 'phone' ? 'app' : 'site'), kit, aspect, { land: !!o.land });
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.anisotropy = 8;
      return new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, name: 'Écran' });
    })();
    p.catch(() => screenCache.delete(key));
    screenCache.set(key, p);
    // Cache borné : la texture la plus ancienne est libérée (three la renverrait seule si elle resservait).
    if (screenCache.size > 24) {
      const old = screenCache.keys().next().value; const q = screenCache.get(old); screenCache.delete(old);
      q.then((m) => { if (m && m.map) m.map.dispose(); }).catch(() => {});
    }
  }
  return screenCache.get(key);
}
// Écran posé sur le clone de l'appareil (matière propre au clone : les clones partagent celles du GLB).
function dressScreen(S, entry) {
  const root = entry && entry.model && entry.model.root; if (!root) return;
  let mesh = null; root.traverse((m) => { if (!mesh && m.isMesh && m.name === 'NX_SCREEN') mesh = m; });
  if (!mesh) return;
  const job = screenFor(S, entry.item, screenAspect(mesh)).then((mat) => {
    if (S.objects.get(entry.item.id) !== entry) return;
    mesh.material = mat; S.dirty = true;
  }).catch((e) => console.warn('[NEXORA #122] écran', e));
  if (!S.nxScreenJobs) S.nxScreenJobs = new Set();
  S.nxScreenJobs.add(job); job.finally(() => S.nxScreenJobs.delete(job));
}
async function screensReady(S) { for (let i = 0; i < 3 && S.nxScreenJobs && S.nxScreenJobs.size; i++) await Promise.all([...S.nxScreenJobs]); }

// ---------- Construction d'une diapositive ----------
const NO = { select: false, history: false };
async function device(S, T, key, { pos, rot = [0, 0, 0], screen, land = false, k = 1 }) {
  const d = DEV.DEVICES[key];
  const glbId = await ensureShared(S, `${PREFIX}dev:${key}`);
  const item = S.addDecor({ kind: 'glb', glbId, color: '#ffffff', nxDevice: key, nxScreen: S.siteUrl && S.siteUrl() ? 'scene' : 'exemple', nxSlide: { screen: screen || (d.kind === 'phone' ? 'app' : 'site'), land, look: T.key }, pos, rot, scale: Math.round((d.mm / 200) * k * 1000) / 1000 }, NO);
  if (item) item.name = d.name;
  return item;
}
async function rock(S, seed, flat, { pos, rot = [0, 0, 0], scale = 1 }) {
  const glbId = await ensureShared(S, `${PREFIX}roche:${seed}:${flat}`);
  const item = S.addDecor({ kind: 'glb', glbId, color: '#ffffff', pos, rot, scale }, NO);
  if (item) item.name = 'Roche';
  return item;
}
const decor = (S, kind, props) => S.addDecor({ kind, ...props }, NO);
// Lumières du décor (modèles partagés) : anneau ou arc néon très fin, tube néon, halo doux. Les GLB sont ramenés à
// 20 unités par le Studio : `size` est la plus grande dimension voulue, `center` le centre visé.
const NAMES = { anneau: 'Anneau lumineux', arc: 'Arc lumineux', barre: 'Tube lumineux', halo: 'Halo' };
async function light(S, shape, color, { center, size, yaw = 0, tilt = 0 }) {
  const glbId = await ensureShared(S, `${PREFIX}${shape}:${String(color).replace('#', '')}`);
  const k = size / 20;
  // Modèle posé au sol par le Studio : le pied de l'objet est à `pos`, d'où le décalage vers le centre voulu.
  const h = shape === 'arc' ? 0 : shape === 'barre' ? size / 2 : size / 2;
  const item = S.addDecor({ kind: 'glb', glbId, color: '#ffffff', noShadow: true, pos: [center[0], center[1] - h, center[2]], rot: [tilt, yaw, 0], scale: Math.round(k * 1000) / 1000 }, NO);
  if (item) item.name = NAMES[shape] || 'Lumière';
  return item;
}
function haloCanvas(color) {
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
  const g = x.createRadialGradient(256, 256, 0, 256, 256, 256);
  g.addColorStop(0, rgba(color, 0.85)); g.addColorStop(0.3, rgba(color, 0.42)); g.addColorStop(0.62, rgba(color, 0.12)); g.addColorStop(1, rgba(color, 0));
  x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  return c;
}
// GLB des lumières, construit à la demande (même identifiant, même modèle : rien n'est enregistré).
async function lightBytes(shape, color) {
  const T = THREE; const root = new T.Group();
  if (shape === 'halo') {
    const tex = new T.CanvasTexture(haloCanvas(color)); tex.colorSpace = T.SRGBColorSpace;
    root.add(new T.Mesh(new T.PlaneGeometry(40, 40), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })));
  } else {
    const mat = new T.MeshStandardMaterial({ color: '#000000', emissive: new T.Color(color), emissiveIntensity: 5.5, roughness: 0.5, metalness: 0 });
    const geo = shape === 'barre' ? new T.CylinderGeometry(0.16, 0.16, 20, 24) : new T.TorusGeometry(10, 0.09, 12, 320, shape === 'arc' ? Math.PI : Math.PI * 2);
    root.add(new T.Mesh(geo, mat));
  }
  return new Uint8Array(await new T.GLTFExporter().parseAsync(root, { binary: true }));
}

// Zones du cadre réservées aux appareils (le texte occupe le reste) : mêmes valeurs pour la mise en scène et pour
// le calque de texte (openSlide recadre d'après slideBuild).
const REGION = {
  cover: { cx: 0.7, cy: 0.54, rw: 0.6, rh: 0.94 },
  screens: { cx: 0.5, cy: 0.67, rw: 0.96, rh: 0.64 },
  mobile: { cx: 0.29, cy: 0.53, rw: 0.46, rh: 0.92 },
  desktop: { cx: 0.67, cy: 0.53, rw: 0.62, rh: 0.92 },
  features: { cx: 0.78, cy: 0.53, rw: 0.38, rh: 0.92 },
  statement: { cx: 0.5, cy: 0.71, rw: 0.62, rh: 0.52 },
  contact: { cx: 0.27, cy: 0.53, rw: 0.44, rh: 0.92 },
};
// Direction de la caméra (depuis la scène) par mise en page.
const DIR = {
  cover: [0.4, 0.12, 1], screens: [0.02, 0.2, 1], mobile: [0.16, 0.1, 1], desktop: [0.4, 0.14, 1],
  features: [0.2, 0.1, 1], statement: [0, 0.12, 1], contact: [-0.18, 0.1, 1],
};
const yawOf = (d) => Math.round(Math.atan2(d[0], d[2]) * 180 / Math.PI);

// Compositions : appareils et décor par mise en page, selon le style. Rendent les objets à cadrer et la marge.
async function compose(S, T, layout) {
  const dir = DIR[layout]; const face = yawOf(dir);
  const st = T.stand; const neon = T.key === 'violet'; const night = T.key === 'nuit';
  const rocky = T.key === 'galerie' || T.key === 'marque';
  const halo = (center, size) => (T.halo ? light(S, 'halo', T.halo, { center, size, yaw: face }) : null);
  const ring = (center, size, turn = -16) => (neon ? light(S, 'anneau', T.glow, { center, size, yaw: face + turn }) : null);
  const arc = (center, size) => (neon ? light(S, 'arc', T.glow, { center, size, yaw: face }) : null);
  // Nuit : deux tubes néon verticaux derrière le sujet (couleur de la marque et bleu).
  const bars = async (x, z, h, spread = h * 0.42) => { if (!night) return; await light(S, 'barre', T.glow, { center: [x - spread, h / 2, z], size: h, yaw: face }); await light(S, 'barre', T.glow2, { center: [x + spread, h / 2, z - 4], size: h, yaw: face }); };
  const out = { frame: [], pad: 1.15 };
  if (layout === 'cover') {
    if (rocky) {
      await halo([0, 16, -34], 90);
      await rock(S, 11, 0.85, { pos: [33, 0, -18], rot: [0, -30, 0], scale: 1.45 });
      await rock(S, 3, 0.62, { pos: [-36, 0, 10], rot: [0, 20, 0], scale: 0.95 });
      const lap = await device(S, T, 'macbook-pro-16', { pos: [0, 9, 0], rot: [-6, -26, 7], screen: 'site' });
      await rock(S, 7, 0.6, { pos: [26, 0, 17], rot: [0, -10, 0], scale: 0.9 });
      out.frame = [lap]; out.pad = 1.12;
    } else {
      await halo([0, 26, -32], 92);
      await ring([2, 27, -38], 64);
      await bars(0, -34, 60);
      const cap = decor(S, 'capsule', { color: st.color, finish: st.finish, pos: [0, 0, 0], rot: [0, -24, 0], scale: 3.3 });
      const lap = await device(S, T, 'macbook-pro-16', { pos: [0, 15.8, 0], rot: [0, -24, 0], screen: 'site' });
      out.frame = [lap, cap]; out.pad = 0.96;
    }
  } else if (layout === 'screens') {
    await halo([0, 14, -30], 110);
    await arc([0, -4, -34], 96);
    await bars(0, -36, 34, 52);
    const lap = await device(S, T, 'macbook-pro-16', { pos: [0, 0, 0], rot: [0, -6, 0], screen: 'site' });
    const tab = await device(S, T, 'ipad-pro-13', { pos: [-17, 10.9, 6], rot: [-10, 22, 90], screen: T.dark ? 'sombre' : 'dash', land: true });
    const pod = decor(S, 'podium', { color: st.color, finish: st.finish, pos: [27, 0, 9], scale: 0.48 });
    const ph = await device(S, T, 'iphone-18-pro', { pos: [27, 1.25, 9], rot: [0, -20, 0], screen: 'app', k: 1.25 });
    out.frame = [lap, tab, ph, pod]; out.pad = 1.04;
  } else if (layout === 'mobile') {
    if (rocky) {
      await halo([0, 9, -20], 50);
      await rock(S, 5, 0.75, { pos: [0, 0, 0], rot: [0, 30, 0], scale: 0.9 });
      const ph = await device(S, T, 'iphone-18-pro', { pos: [2, 5, 3], rot: [-14, -22, -24], screen: 'app' });
      await rock(S, 9, 0.55, { pos: [-16, 0, 10], rot: [0, -40, 0], scale: 0.42 });
      out.frame = [ph]; out.pad = 1.3;
    } else {
      await halo([0, 10, -18], 52);
      await ring([0, 10, -16], 32);
      await bars(0, -18, 30);
      const pod = decor(S, 'podium', { color: st.color, finish: st.finish, pos: [0, 0, 0], scale: 0.75 });
      const back = await device(S, T, 'iphone-18-pro', { pos: [-8.5, 1.95, -5], rot: [0, 22, 0], screen: 'app' });
      const ph = await device(S, T, 'iphone-18-pro', { pos: [4, 1.95, 3], rot: [0, -26, 0], screen: 'app' });
      out.frame = [ph, back, pod]; out.pad = 1.1;
    }
  } else if (layout === 'desktop') {
    // Ordinateur de trois quarts sur un disque fin (brillant, satiné en galerie).
    await halo([0, 14, -30], 86);
    await ring([0, 14, -34], 50, 12);
    await bars(0, -32, 48);
    const pod = decor(S, 'podium', { color: st.color, finish: st.finish, pos: [0, 0, 0], scale: 1.9 });
    const lap = await device(S, T, 'macbook-pro-16', { pos: [0, 4.94, 0], rot: [0, 28, 0], screen: 'dash' });
    out.frame = [lap, pod]; out.pad = 1;
  } else if (layout === 'features') {
    if (rocky) {
      await halo([0, 9, -18], 46);
      await rock(S, 17, 0.7, { pos: [0, 0, 0], rot: [0, 10, 0], scale: 0.8 });
      const ph = await device(S, T, 'iphone-18-pro', { pos: [0, 6.5, 2], rot: [-10, -18, -16], screen: 'app' });
      out.frame = [ph]; out.pad = 1.3;
    } else {
      await halo([0, 10, -14], 44);
      await ring([0, 10, -12], 27);
      await bars(0, -14, 26);
      const pod = decor(S, 'podium2', { color: st.color, finish: st.finish, pos: [0, 0, 0], scale: 0.5 });
      const ph = await device(S, T, 'iphone-18-pro', { pos: [0, 2.2, 0], rot: [0, -20, 0], screen: 'app' });
      out.frame = [ph, pod]; out.pad = 1.12;
    }
  } else if (layout === 'statement') {
    await halo([0, 12, -24], 84);
    await arc([0, -6, -22], 74);
    await bars(0, -26, 30, 38);
    if (rocky) {
      await rock(S, 21, 0.6, { pos: [-33, 0, -6], rot: [0, 30, 0], scale: 1 });
      await rock(S, 4, 0.7, { pos: [34, 0, -9], rot: [0, -20, 0], scale: 1.15 });
    }
    const lap = await device(S, T, 'macbook-pro-16', { pos: [0, 0, 0], rot: [0, 0, 0], screen: 'site' });
    out.frame = [lap]; out.pad = 1.12;
  } else {
    // Contact.
    if (rocky) {
      await halo([0, 9, -18], 46);
      await rock(S, 8, 0.7, { pos: [0, 0, 0], rot: [0, 20, 0], scale: 0.8 });
      const ph = await device(S, T, 'iphone-18-pro', { pos: [1, 6, 2], rot: [-12, 20, 14], screen: 'site' });
      out.frame = [ph]; out.pad = 1.3;
    } else {
      await halo([0, 10, -14], 46);
      await ring([0, 10, -12], 28, 16);
      await bars(0, -14, 26);
      const pod = decor(S, 'podium', { color: st.color, finish: st.finish, pos: [0, 0, 0], scale: 0.72 });
      const ph = await device(S, T, 'iphone-18-pro', { pos: [0, 1.9, 0], rot: [0, 20, 0], screen: 'site' });
      out.frame = [ph, pod]; out.pad = 1.12;
    }
  }
  return { ...out, dir };
}

// Mouvement discret : la pose de départ est la pose composée (vignettes et éditeur), les appareils montent un peu
// et la caméra s'avance lentement.
function animate(S, frame) {
  const D = S.anim.duration;
  for (const it of frame) {
    if (!it) continue;
    const s0 = S.getState(it.id);
    addKey(S.anim, it.id, 0, s0, 'inOut');
    addKey(S.anim, it.id, D, { ...s0, pos: [s0.pos[0], s0.pos[1] + 0.9, s0.pos[2]], rot: [s0.rot[0], s0.rot[1] + 3, s0.rot[2]] }, 'inOut');
  }
  const c = S.getState('camera');
  const t = new THREE.Vector3(...c.ctarget); const p = new THREE.Vector3(...c.cpos);
  addKey(S.anim, 'camera', 0, c, 'inOut');
  addKey(S.anim, 'camera', D, { ...c, cpos: t.clone().add(p.clone().sub(t).multiplyScalar(0.93)).toArray() }, 'inOut');
}

export function lookOf(S) {
  const d = S.deckState(); return LOOKS[d.look] ? d.look : DEFAULT_LOOK;
}

// Remplace rebuildSlide pour les styles de #122 (le style « Classique » garde la recette d'origine).
async function rebuild(S, index, orig) {
  const deck = S.deckState(); const slide = deck.slides[index]; if (!slide) return;
  const look = lookOf(S);
  if (look === 'classique') { delete slide.look; return orig.call(S, index); }
  const T = tokens(S, look);
  const t = busy('Mise en scène de la diapositive…');
  try {
    S.clearScene();
    S.anim = freshAnim(); S.anim.duration = slide.dur || 5;
    S.three.applyEnv({ ...S.three.env, aspect: '16:9', rig: 1, lightAngle: 0, lightHeight: 1, warmth: 0, envIntensity: 1, ...T.env }, S.bgImageEl);
    const layout = REGION[slide.layout] ? slide.layout : 'cover';
    const out = await compose(S, T, layout);
    slide.look = look;
    slide.style = { ink: T.ink, dark: T.dark, look };
    S.setFraming(REGION[layout]);
    S.time = 0; S.applyTime();
    const box = new THREE.Box3();
    for (const it of out.frame) { const e = it && S.objects.get(it.id); if (e && e.model) box.expandByObject(e.model.root); }
    if (!box.isEmpty()) S.frameAll(false, new THREE.Vector3(...out.dir), { box, pad: out.pad });
    animate(S, out.frame);
    S.time = 0; S.applyTime();
    await screensReady(S);
    slide.scene = S.serialize();
    S.select(null);
    S.renderList(); if (S.timeline) S.timeline.render();
    S.dirty = true;
  } finally { done(t); }
}

// ---------- Calque de texte ----------
const domain = (u) => String(u || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
function textLayers(S, slide, index, total) {
  const deck = S.deckState(); const look = slide.look; const T = tokens(S, look);
  const brand = S.brand ? S.brand() : {};
  const font = brand.font === 'serif' ? 'serif' : 'display';
  const L = []; const layout = REGION[slide.layout] ? slide.layout : 'cover';
  const url = slide.url || deck.url || '';
  const pill = (text, o = {}) => (String(text || '').trim() ? { type: 'cta', text: String(text).trim().toUpperCase(), size: 1.85, weight: 650, bg: T.pill, color: T.pillInk, glow: 'rgba(0,0,0,0)', anim: 'up', dur: 0.6, ...o } : null);
  const title = (text, size, o = {}) => ({ type: 'text', text, size, weight: 750, font, color: T.ink, lineHeight: 1.03, letterSpacing: -0.035, maxLines: 4, anim: 'up', dur: 0.8, ...o });
  const body = (text, o = {}) => ({ type: 'text', text, size: 2.85, weight: 420, color: T.soft, lineHeight: 1.42, maxLines: 4, anim: 'up', dur: 0.8, ...o });
  const list = (items, o = {}) => ({ type: 'list', items: (items || []).filter((b) => String(b).trim()), size: 2.7, weight: 520, color: T.ink, bullet: T.accent, marker: 'check', gap: 1.6, anim: 'left', stagger: 0.12, ...o });
  const cta = (text, o = {}) => (String(text || '').trim() ? { type: 'cta', text, size: 2.45, weight: 650, bg: T.cta, color: T.ctaInk, glow: T.dark ? rgba(T.glow, 0.45) : 'rgba(0,0,0,0.12)', anim: 'scale', dur: 0.5, ...o } : null);
  const grad = T.dark ? { fill: 'gradient', gradient: ['#ffffff', '#ffffff', T.accent] } : {};
  const items = (arr) => arr.filter(Boolean);
  if (layout === 'cover') {
    L.push({ type: 'stack', x: 0.07, y: 0.53, valign: 'middle', align: 'left', maxW: 0.43, gap: 2.6, delay: 0.15, items: items([pill(slide.kicker), title(slide.title, 8.8, { maxLines: 4, ...grad }), body(slide.text, { maxW: 0.38 }), cta(domain(url))]) });
  } else if (layout === 'screens') {
    L.push({ type: 'stack', x: 0.5, y: 0.07, valign: 'top', align: 'center', maxW: 0.8, gap: 1.9, delay: 0.15, items: items([pill(slide.kicker), title(slide.title, 6, { maxLines: 2, ...grad }), body(slide.text, { maxLines: 2, size: 2.5 })]) });
  } else if (layout === 'mobile') {
    L.push({ type: 'stack', x: 0.55, y: 0.52, valign: 'middle', align: 'left', maxW: 0.38, gap: 2.4, delay: 0.15, items: items([pill(slide.kicker), title(slide.title, 6.4, { maxLines: 3, ...grad }), body(slide.text), list(slide.bullets, { maxW: 0.38 })]) });
  } else if (layout === 'desktop') {
    L.push({ type: 'stack', x: 0.07, y: 0.52, valign: 'middle', align: 'left', maxW: 0.33, gap: 2.4, delay: 0.15, items: items([pill(slide.kicker), title(slide.title, 6.2, { maxLines: 4, ...grad }), body(slide.text), list(slide.bullets, { maxW: 0.33 })]) });
  } else if (layout === 'features') {
    L.push({ type: 'stack', x: 0.07, y: 0.1, valign: 'top', align: 'left', maxW: 0.5, gap: 2, delay: 0.1, items: items([pill(slide.kicker), title(slide.title, 6.2, { maxLines: 2, ...grad })]) });
    const bl = (slide.bullets || []).filter((b) => String(b).trim()).slice(0, 6);
    const cols = 2; const cw = 0.262; const ch = 0.15; const gx = 0.016; const gy = 0.024; const x0 = 0.07;
    const rows = Math.ceil(bl.length / cols); const y0 = Math.max(0.34, 0.875 - rows * ch - (rows - 1) * gy);
    bl.forEach((b, i) => {
      const cx = x0 + (i % cols) * (cw + gx); const cy = y0 + Math.floor(i / cols) * (ch + gy); const d = 0.35 + i * 0.1;
      L.push({ type: 'rect', x: cx, y: cy, w: cw, h: ch, radius: 2.4, color: T.card, anim: 'up', delay: d, dur: 0.6 });
      L.push({ type: 'text', text: String(i + 1).padStart(2, '0'), x: cx + 0.02, y: cy + 0.028, size: 2, weight: 700, color: T.accent, letterSpacing: 0.06, anim: 'up', delay: d + 0.05, dur: 0.6 });
      L.push({ type: 'text', text: b, x: cx + 0.02, y: cy + 0.072, maxW: cw - 0.04, size: 2.55, weight: 580, color: T.ink, lineHeight: 1.25, maxLines: 2, anim: 'up', delay: d + 0.08, dur: 0.6 });
    });
  } else if (layout === 'statement') {
    L.push({ type: 'stack', x: 0.5, y: 0.09, valign: 'top', align: 'center', maxW: 0.82, gap: 2.2, delay: 0.15, items: items([pill(slide.kicker), title(slide.title, 7, { maxLines: 3, align: 'center', ...grad }), body(slide.text, { size: 2.8, maxLines: 2 })]) });
  } else {
    L.push({ type: 'stack', x: 0.52, y: 0.5, valign: 'middle', align: 'left', maxW: 0.38, gap: 2.4, delay: 0.15, items: items([pill(slide.kicker), title(slide.title, 6.6, { maxLines: 3, ...grad }), body(slide.text), cta(domain(url)), url ? { type: 'qr', text: url, size: 15, color: '#111111', bg: '#ffffff', anim: 'scale', dur: 0.5 } : null]) });
  }
  if (S.logoImg) L.push(layout === 'cover' ? { type: 'image', image: 'logo', size: 5.6, x: 0.07, y: 0.075, align: 'left', valign: 'top', anim: 'fade', delay: 0.05, round: true } : { type: 'image', image: 'logo', size: 4, x: 0.955, y: 0.06, align: 'right', valign: 'top', anim: 'fade', delay: 0.1, round: true });
  if (total > 1 && layout !== 'cover') {
    L.push({ type: 'text', text: (brand.name || '').trim(), size: 1.55, weight: 600, color: T.faint, x: 0.07, y: 0.95, valign: 'bottom', anim: 'none' });
    L.push({ type: 'text', text: `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`, size: 1.55, weight: 600, color: T.faint, x: 0.955, y: 0.95, align: 'right', valign: 'bottom', letterSpacing: 0.04, anim: 'none' });
  }
  return L;
}

// ---------- Panneau : style de la présentation ----------
const SWATCH = {
  violet: 'radial-gradient(120% 120% at 70% 45%, #6b45e6 0%, #2a1170 45%, #0b0420 100%)',
  nuit: 'radial-gradient(120% 120% at 60% 40%, #2a2448 0%, #0d0b18 55%, #030206 100%)',
  galerie: 'radial-gradient(120% 120% at 50% 30%, #ffffff 0%, #ececef 55%, #cfcfd5 100%)',
  classique: 'linear-gradient(160deg, #eef0ff 0%, #d9dcff 100%)',
};
function lookCard(S) {
  const cur = lookOf(S); const deck = S.deckState(); const slide = deck.slides[S.deckCur];
  const A = brandAccent(S, '#ff6a2c');
  const sw = (k) => k === 'marque' ? `radial-gradient(120% 120% at 60% 40%, ${mixHex(A, '#ffffff', 0.12)} 0%, ${mixHex(A, '#000000', 0.55)} 60%, ${mixHex(A, '#000000', 0.86)} 100%)` : SWATCH[k];
  const old = slide && !slide.look && cur !== 'classique';
  return `<section class="st-card nx-looks-card">
    <div class="st-field"><span>Style des diapositives</span></div>
    <div class="nx-looks" role="group" aria-label="Style des diapositives">${Object.entries(LOOKS).map(([k, v]) => `<button class="nx-look${k === cur ? ' on' : ''}" aria-pressed="${k === cur}" data-nx-look="${k}" title="${esc(v.note)}"><i style="background:${sw(k)}"></i><span>${esc(v.label)}</span></button>`).join('')}</div>
    ${old ? `<button class="btn small wide" data-nx-look="${cur}">${icon('sparkle', 13)}<span>Appliquer « ${esc(LOOKS[cur].label)} » à toute la présentation</span></button>` : ''}
    <p class="pop-note">${old ? 'Cette diapositive garde l’ancien style. ' : ''}Appareils réalistes à taille réelle, avec la capture du site de la présentation ou un écran d’exemple aux couleurs de la marque.</p>
  </section>`;
}
async function setLook(S, key) {
  if (!LOOKS[key]) return;
  const deck = S.deckState(); deck.look = key; saveSettings();
  const cur = S.deckCur ?? 0;
  const t = busy(`Style « ${LOOKS[key].label} » : mise en scène des ${deck.slides.length} diapositives…`);
  try {
    // Diapositive ouverte « oubliée » pendant la boucle : aucun enregistrement ne doit écrire la scène affichée
    // dans une autre diapositive (comme generateDeck).
    S.deckCur = null;
    for (let i = 0; i < deck.slides.length; i++) { await S.rebuildSlide(i); deck.slides[i].thumb = await S.slideThumb(i); }
    await S.openSlide(Math.min(cur, deck.slides.length - 1), { save: false });
  } finally { done(t); }
  saveSettings();
  toast(`Style « ${LOOKS[key].label} » appliqué à toute la présentation.`);
}

// Grille d'édition masquée sur les diapositives des styles de #122 (aperçu fidèle au rendu) ; le bouton « Grille »
// la montre toujours à la demande.
// setFraming passe par camera.setViewOffset(1, 1, …), qui remet camera.aspect à 1 : sans un resize() ensuite, la vue
// d'édition restait étirée en largeur (les rendus, eux, reprennent le bon format) ; d'où l'appel dans les enveloppes.
function gridFor(S) {
  const g = S.editorGrid; if (!g) return;
  const s = S.space === 'deck' && S.deckCur != null ? S.deckState().slides[S.deckCur] : null;
  g.visible = !(s && s.look && s.look !== 'classique') && settings.studioGrid !== false;
  S.dirty = true;
}

// Diapositive d'exemple jamais modifiée (créée à l'ouverture d'une présentation vide) : refaite au style courant.
function isSample(slide) {
  return slide && !slide.look && slide.layout === 'cover' && slide.kicker === 'Présentation' && slide.title === 'Titre de la présentation';
}

export async function install(S) {
  const proto = Object.getPrototypeOf(S);
  if (proto.nxSlidesInstalled) return;
  proto.nxSlidesInstalled = true;
  // Modèles partagés enregistrés avant chaque chargement de scène.
  proto.nxLoad = proto.load;
  proto.load = async function (t, ...rest) { try { await ensureFor(this, t && t.objects); } catch (e) { console.warn('[NEXORA #122]', e); } return this.nxLoad(t, ...rest); };
  // Écran posé à chaque construction d'un appareil de diapositive.
  proto.nxBuild = proto.build;
  proto.build = function (item, ...rest) { const r = this.nxBuild(item, ...rest); if (item && item.nxSlide && item.kind === 'glb') { try { dressScreen(this, r || this.objects.get(item.id)); } catch (e) { console.warn('[NEXORA #122]', e); } } return r; };
  // Aides d'édition rétablies après un rendu (vignette, export) : la poignée de déplacement n'est montrée que si un
  // objet y est rattaché (sinon editorVisible(true) l'affichait seule, à l'origine de la scène).
  proto.nxEditorVisible = proto.editorVisible;
  proto.editorVisible = function (a, ...rest) {
    const r = this.nxEditorVisible(a, ...rest);
    if (a) { try { if (this.gizmo && !this.gizmo.object) this.gizmo.getHelper().visible = false; gridFor(this); } catch { /* */ } }
    return r;
  };
  proto.nxRebuildSlide = proto.rebuildSlide;
  proto.rebuildSlide = async function (index) {
    await rebuild(this, index, this.nxRebuildSlide);
    const deck = this.deckState(); const s = deck.slides[index];
    if (s && index === this.deckCur) { try { s.thumb = await this.slideThumb(index); this.renderSpaceLeft(); } catch { /* vignette au prochain passage */ } }
    this.resize(); gridFor(this);
  };
  proto.nxSetSpace = proto.setSpace;
  proto.setSpace = async function (...args) { const r = await this.nxSetSpace(...args); gridFor(this); return r; };
  proto.nxSlideBuild = proto.slideBuild;
  proto.slideBuild = function (slide, index) {
    if (!slide || !slide.look || !LOOKS[slide.look] || slide.look === 'classique') return this.nxSlideBuild(slide, index);
    const layout = REGION[slide.layout] ? slide.layout : 'cover';
    return { region: { ...REGION[layout] }, layers: textLayers(this, slide, index, this.deckState().slides.length) };
  };
  proto.nxOpenSlide = proto.openSlide;
  proto.openSlide = async function (index, opts) {
    const deck = this.deckState(); const s = deck.slides[index];
    if (!deck.look && isSample(s)) delete s.scene;
    const r = await this.nxOpenSlide(index, opts);
    await screensReady(this);
    this.resize(); gridFor(this);
    return r;
  };
  proto.nxRenderProps0 = proto.renderProps0;
  proto.renderProps0 = function (...args) {
    const r = this.nxRenderProps0(...args);
    if (this.space === 'deck' && this.deckCur != null && !this.sel) {
      try { const first = this.$.props.querySelector('.st-card'); if (first) first.insertAdjacentHTML('afterend', lookCard(this)); } catch (e) { console.warn('[NEXORA #122]', e); }
    }
    return r;
  };
  S.$.props.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-nx-look]'); if (!b || !S.$.props.contains(b)) return;
    ev.stopPropagation();
    try { await setLook(S, b.dataset.nxLook); } catch (e) { console.error(e); toast(e.message || String(e), { kind: 'bad' }); }
  }, true);
  // Studio ouvert directement sur une présentation : la diapositive a été chargée avant ces enveloppes (appareils
  // partagés pas encore enregistrés, diapositive d'exemple au style d'origine) : elle est rouverte.
  if (S.space === 'deck' && S.deckCur != null) {
    const deck = S.deckState(); const s = deck.slides[S.deckCur];
    if (s && ((!deck.look && isSample(s)) || (s.look && s.look !== 'classique'))) { const cur = S.deckCur; S.deckCur = null; await S.openSlide(cur, { save: false }); }
  }
}

// Banc d'essai et rendus (scripts) : diapositive rendue avec son texte.
export async function renderSlide(S, index, w = 1600, h = 900) {
  const c = await S.renderSlide(index, w, h, 99, true);
  return c.toDataURL('image/png');
}
