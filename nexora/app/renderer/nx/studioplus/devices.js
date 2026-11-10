// NEXORA #100 : appareils réalistes du Studio, modèles GLB générés à partir de react-3d-mockups (MIT, voir
// devices/LICENCE.md). Chaque appareil est mis à sa taille réelle (1 unité = 10 mm, un téléphone mesure environ 15
// unités comme ceux du Studio), posé au sol, et son écran (maillage NX_SCREEN) reçoit une image recadrée à son format :
// la capture de la page ouverte, une image choisie, une page NEX-DESIGN ou, à défaut, un fond d'écran NEXORA.
// L'image est intégrée au GLB avant l'ajout : le modèle s'enregistre, s'anime et s'exporte comme un .glb importé.
import * as THREE from '../../dist/chunks/three-D5YSJNBV.js';
import { toast, busy, done, pickFile } from './ui.js';

const T = THREE;

// Clé → libellé, famille (pour le fond par défaut) et plus grande dimension réelle en millimètres.
export const DEVICES = {
  'macbook-pro-16': { name: 'MacBook Pro 16 pouces', kind: 'laptop', mm: 356 },
  'macbook-pro-14': { name: 'MacBook Pro 14 pouces', kind: 'laptop', mm: 313 },
  'macbook-air-13': { name: 'MacBook Air 13 pouces', kind: 'laptop', mm: 304 },
  'studio-display': { name: 'Studio Display 27 pouces', kind: 'display', mm: 623 },
  'ipad-pro-13': { name: 'iPad Pro 13 pouces', kind: 'tablet', mm: 282 },
  'ipad-pro-11': { name: 'iPad Pro 11 pouces', kind: 'tablet', mm: 250 },
  'iphone-18-pro': { name: 'iPhone 18 Pro', kind: 'phone', mm: 150 },
  'iphone-18-pro-max': { name: 'iPhone 18 Pro Max', kind: 'phone', mm: 163 },
  'iphone-17': { name: 'iPhone 17', kind: 'phone', mm: 150 },
  'galaxy-s26-ultra': { name: 'Galaxy S26 Ultra', kind: 'phone', mm: 163 },
};
export const GROUPS = [
  ['Ordinateurs et écrans', ['macbook-pro-16', 'macbook-pro-14', 'macbook-air-13', 'studio-display']],
  ['Tablettes', ['ipad-pro-13', 'ipad-pro-11']],
  ['Téléphones', ['iphone-18-pro', 'iphone-18-pro-max', 'iphone-17', 'galaxy-s26-ultra']],
];

const cache = new Map();
async function source(key) {
  if (!cache.has(key)) cache.set(key, fetch(new URL(`./devices/${key}.glb`, import.meta.url)).then((r) => { if (!r.ok) throw new Error('Modèle introuvable.'); return r.arrayBuffer(); }));
  return cache.get(key);
}

function screenOf(root) {
  let m = null;
  root.traverse((o) => { if (!m && o.isMesh && o.name === 'NX_SCREEN') m = o; });
  return m;
}
// Format de l'écran (largeur / hauteur) d'après sa forme, dans son propre repère.
function aspectOf(mesh) {
  mesh.geometry.computeBoundingBox();
  const s = mesh.geometry.boundingBox.getSize(new T.Vector3());
  return s.x / Math.max(1e-6, s.y);
}

// Fond d'écran NEXORA par défaut (même esprit que les écrans des appareils du Studio : date et 9:41).
function wallpaper(aspect, kind) {
  const h = 1200; const w = Math.round(h * aspect);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#1b1440'); g.addColorStop(0.55, '#5b3fd6'); g.addColorStop(1, '#2f8cff');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  const r = x.createRadialGradient(w * 0.7, h * 0.85, 0, w * 0.7, h * 0.85, Math.max(w, h) * 0.6);
  r.addColorStop(0, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = r; x.fillRect(0, 0, w, h);
  x.fillStyle = '#fff'; x.textAlign = 'center';
  const big = kind === 'phone' ? h * 0.12 : h * 0.16;
  x.font = `600 ${Math.round(big * 0.22)}px Inter, "Segoe UI", sans-serif`;
  const jour = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  x.fillText(jour.charAt(0).toUpperCase() + jour.slice(1), w / 2, h * (kind === 'phone' ? 0.17 : 0.28));
  x.font = `600 ${Math.round(big)}px Inter, "Segoe UI", sans-serif`;
  x.fillText('9:41', w / 2, h * (kind === 'phone' ? 0.17 : 0.28) + big);
  return c;
}

// Image recadrée au format de l'écran (comme object-fit: cover, ancrée en haut pour les pages web).
async function fitted(src, aspect) {
  const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('Image illisible.')); i.src = src; });
  const w = Math.min(2400, Math.max(img.naturalWidth, 800)); const h = Math.round(w / aspect);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const k = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * k; const dh = img.naturalHeight * k;
  c.getContext('2d').drawImage(img, (w - dw) / 2, 0, dw, dh);
  return c;
}

// GLB de l'appareil, à taille réelle, posé au sol, écran habillé. `image` : adresse d'image (data:) ou null.
export async function build(key, image) {
  const d = DEVICES[key]; if (!d) throw new Error('Appareil inconnu.');
  const gltf = await new T.GLTFLoader().parseAsync((await source(key)).slice(0), '');
  const model = gltf.scene;
  const box = new T.Box3().setFromObject(model); const size = box.getSize(new T.Vector3()); const c = box.getCenter(new T.Vector3());
  const k = (d.mm / 10) / Math.max(size.x, size.y, size.z, 1e-6);
  const root = new T.Group(); root.name = d.name; root.add(model);
  model.position.set(-c.x, -box.min.y, -c.z); root.scale.setScalar(k);
  const screen = screenOf(model);
  if (screen) {
    const aspect = aspectOf(screen);
    const canvas = image ? await fitted(image, aspect) : wallpaper(aspect, d.kind);
    const tex = new T.CanvasTexture(canvas); tex.colorSpace = T.SRGBColorSpace; tex.flipY = false;
    screen.material = new T.MeshBasicMaterial({ map: tex, toneMapped: false, name: 'Écran' });
  }
  const out = await new T.GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true, maxTextureSize: 2048 });
  return new Uint8Array(out);
}

// Image de la page ouverte dans le Studio, s'il y en a une : la capture posée sur l'écran d'un appareil de la scène.
function sceneScreenImage(S) {
  for (const id of S.order || []) {
    const e = S.objects.get(id);
    if (!e || !e.model || e.item.nxDevice) continue;
    let img = null;
    try { (e.model.root || e.model.group || { traverse() {} }).traverse((o) => { if (!img && o.isMesh && /screen|écran|ecran|display/i.test(o.name || '') && o.material && o.material.map && o.material.map.image) img = o.material.map.image; }); } catch { /* */ }
    if (img && (img instanceof HTMLCanvasElement || img instanceof HTMLImageElement)) {
      try { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0); return c.toDataURL('image/jpeg', 0.9); } catch { /* image d'une autre origine */ }
    }
  }
  return null;
}

async function register(S, bytes) { return S.registerGlb(bytes); }

export async function add(S, key) {
  const d = DEVICES[key]; if (!d) return;
  const t = busy(`Préparation : ${d.name}…`);
  try {
    const image = sceneScreenImage(S);
    const id = await register(S, await build(key, image));
    // Scène déjà occupée : l'appareil se pose à droite de ce qui est au centre, au lieu de s'y cacher.
    const busyScene = (S.order || []).some((o) => { const e = S.objects.get(o); return e && e.item && e.item.type === 'device'; });
    const pos = busyScene ? [Math.round(d.mm / 40 + 6), 0, 0] : [0, 0, 0];
    const item = S.addDecor({ kind: 'glb', glbId: id, color: '#ffffff', nxDevice: key, nxScreen: image ? 'scene' : 'nexora', pos });
    if (item) { item.name = d.name; S.renderList && S.renderList(); }
    toast(`${d.name} ajouté : modèle réaliste à taille réelle${image ? ', avec la capture de la scène' : ''}. Change son écran dans le panneau de droite.`);
    return item;
  } catch (er) { toast(er.message || String(er), { kind: 'bad' }); } finally { done(t); }
}

// Nouvel écran pour l'appareil sélectionné : le GLB est reconstruit avec l'image, puis l'objet est rebâti.
export async function setScreen(S, image, label) {
  const e = S.sel && S.objects.get(S.sel);
  if (!e || !e.item.nxDevice) { toast('Sélectionne d’abord un appareil réaliste.', { kind: 'bad' }); return; }
  const t = busy('Mise à jour de l’écran…');
  try {
    e.item.glbId = await register(S, await build(e.item.nxDevice, image));
    e.item.nxScreen = image ? 'image' : 'nexora';
    S.build(e.item); S.dirty = true; S.renderProps(); S.commit();
    toast(label || 'Écran mis à jour.');
  } catch (er) { toast(er.message || String(er), { kind: 'bad' }); } finally { done(t); }
}

export async function pickScreen(S) {
  const f = await pickFile({ title: 'Image de l’écran', name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] });
  if (f && f.dataUrl) await setScreen(S, f.dataUrl, 'Image affichée sur l’écran.');
}
