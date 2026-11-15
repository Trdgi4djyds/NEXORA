// NEXORA #124 : vrais appareils dans la composition libre des Maquettes (Studio 3D & Motion).
// Le moteur de mockup-PQYZUGF2.js dessine chaque appareil vu de face, puis l'incline comme une carte et simule son
// épaisseur en tamponnant sa silhouette décalée : un portable incliné n'avait ni clavier ni charnière, une fenêtre de
// navigateur devenait une dalle épaisse. Ce module branche cinq crochets (globalThis.__nxMk) appelés par le moteur :
//  - bg : début de chaque rendu (rien n'est dessiné : étiquettes du rendu précédent oubliées) ;
//  - device : rend l'appareil avec le modèle réaliste du Studio (#100, GLB à taille réelle) dans une scène three.js, à
//    l'inclinaison demandée, et renvoie l'image à poser à la place du dessin à plat (et son emprise pour la sélection) ;
//  - depth : épaisseur réelle du catalogue pour les appareils sans modèle 3D, aucune pour une fenêtre de navigateur ;
//  - empty : écran sans capture : fond d'écran NEXORA au lieu du texte « Déposez une capture » déformé ;
//  - top : dans l'aperçu seulement (jamais dans les exports), étiquette droite « Déposez une capture » sur chaque
//    appareil encore vide.
import * as T from '../../dist/chunks/three-D5YSJNBV.js';
import { d as deviceById } from '../../dist/chunks/chunk-ZAWUH4BJ.js';
import { MockupEditor } from '../../dist/chunks/mockup-PQYZUGF2.js';
import { state } from '../core.js';

const RAD = Math.PI / 180;
// Modèles disponibles (devices/*.glb) ; même identifiant que l'appareil du catalogue du Responsive Lab.
const EXACT = new Set(['iphone-18-pro', 'iphone-18-pro-max', 'iphone-17', 'galaxy-s26-ultra', 'ipad-pro-13', 'ipad-pro-11', 'macbook-pro-16', 'macbook-pro-14', 'macbook-air-13', 'studio-display']);
const ANDROID = new Set(['samsung', 'xiaomi', 'pixel', 'transsion', 'bbk', 'huawei', 'moto', 'generic']);
// Portables : l'écran (incliné de 20° vers l'arrière dans le modèle) face à l'objectif, clavier vu d'un peu au-dessus.
const LAPTOP_LEAN = 20 * RAD;
// Animations qui inclinent les appareils : un appareil animé reste en 3D du début à la fin.
const TILT_ANIMS = new Set(['tilt', 'float', 'reveal', 'orbit']);

// Modèle réaliste d'un appareil du catalogue : le sien s'il existe (exact), sinon le plus proche de sa famille.
// Pliables, montres, téléviseurs, consoles, voitures… : aucun (dessin à plat d'origine, épaisseur réelle).
function modelFor(dev) {
  if (!dev) return null;
  if (EXACT.has(dev.id)) return { key: dev.id, exact: true };
  const c = dev.category; const id = dev.id; const diag = (dev.p && dev.p.diag) || 0;
  if (c === 'iphone') return { key: /max|plus/.test(id) ? 'iphone-18-pro-max' : /pro/.test(id) ? 'iphone-18-pro' : 'iphone-17', exact: false };
  if (ANDROID.has(c)) return { key: 'galaxy-s26-ultra', exact: false };
  if (c === 'tablet') return { key: diag >= 12 ? 'ipad-pro-13' : 'ipad-pro-11', exact: false };
  if (c === 'desktop') return { key: diag >= 15.5 ? 'macbook-pro-16' : /air/.test(id) ? 'macbook-air-13' : 'macbook-pro-14', exact: false };
  if (c === 'pc' || c === 'bigscreen') {
    const r = dev.w / Math.max(1, dev.h);
    return r > 1.5 && r < 1.9 ? { key: 'studio-display', exact: false } : null;
  }
  return null;
}

const tilted = (s) => Math.abs(s.rx || 0) >= 1 || Math.abs(s.ry || 0) >= 1;
const devId = (s) => s.device || 'iphone-18-pro';
// Élément plus large que haut : fenêtre de navigateur, portable, ordinateur, téléphone ou tablette en paysage.
function wide(s) {
  if (s.kind === 'browser') return true;
  if ((s.kind || 'device') !== 'device') return false;
  const dev = deviceById(devId(s));
  if (!dev || !dev.w || !dev.h) return false;
  return (s.land ? dev.h / dev.w : dev.w / dev.h) > 1.2;
}

// Faut-il le modèle 3D pour cet emplacement ? Toujours pour un appareil qui a le sien ; pour un autre de la même
// famille, seulement s'il est incliné (de face, son cadre exact du Responsive Lab est plus fidèle). Tous les
// emplacements du même appareil suivent la même règle, pour qu'une composition ne mélange pas les deux rendus.
function wantsModel(m, doc) {
  if ((m.kind || 'device') !== 'device' || (m.style && m.style !== 'default')) return null;
  const dev = deviceById(devId(m));
  const mod = modelFor(dev);
  if (!mod) return null;
  if (mod.exact) return { ...mod, dev };
  const anim = doc && doc.anim && TILT_ANIMS.has(doc.anim.preset);
  const same = ((doc && doc.slots) || []).some((s) => (s.kind || 'device') === 'device' && devId(s) === devId(m) && tilted(s));
  return anim || same || tilted(m) ? { ...mod, dev } : null;
}

// ---------- Fond d'écran d'un appareil sans capture ----------
export function paintWallpaper(x, w, h) {
  const g = x.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#1b1440'); g.addColorStop(0.55, '#5b3fd6'); g.addColorStop(1, '#2f8cff');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  const r = x.createRadialGradient(w * 0.7, h * 0.85, 0, w * 0.7, h * 0.85, Math.max(w, h) * 0.6);
  r.addColorStop(0, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = r; x.fillRect(0, 0, w, h);
  // Téléphone ou tablette en portrait : date et heure comme sur un écran verrouillé.
  if (h > w * 1.2) {
    const big = Math.min(w * 0.26, h * 0.12);
    x.save(); x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    x.font = `600 ${Math.round(big * 0.22)}px Urbanist, Inter, "Segoe UI", sans-serif`;
    const jour = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    x.fillText(jour.charAt(0).toUpperCase() + jour.slice(1), w / 2, h * 0.17);
    x.font = `600 ${Math.round(big)}px Urbanist, Inter, "Segoe UI", sans-serif`;
    x.fillText('9:41', w / 2, h * 0.17 + big);
    x.restore();
  }
}

// Capture recadrée dans l'écran comme le moteur d'origine (couvrir, zoom, ancrage haut, centre ou bas).
function coverDraw(x, img, W, H, zoom, align) {
  const iw = img.videoWidth || img.naturalWidth || img.width; const ih = img.videoHeight || img.naturalHeight || img.height;
  if (!iw || !ih) { paintWallpaper(x, W, H); return; }
  const k = Math.max(W / iw, H / ih) * (zoom || 1); const dw = iw * k; const dh = ih * k;
  const y = align === 'center' ? (H - dh) / 2 : align === 'bottom' ? H - dh : 0;
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
  x.drawImage(img, (W - dw) / 2, y, dw, dh);
}

// ---------- Moteur three.js partagé ----------
let R = null; // { renderer, scene, camera, pivot } ou false si WebGL est indisponible (rendu à plat d'origine)
function engine() {
  if (R !== null) return R;
  try {
    const renderer = new T.WebGLRenderer({ canvas: document.createElement('canvas'), alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.NeutralToneMapping;
    renderer.toneMappingExposure = 1;
    const scene = new T.Scene();
    // Éclairage de studio photo produit : reflets d'une pièce claire, lumière principale en haut à gauche.
    const pm = new T.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new T.RoomEnvironment(), 0.04).texture;
    pm.dispose();
    const key = new T.DirectionalLight(0xffffff, 1.2); key.position.set(-2, 3, 4);
    const fill = new T.DirectionalLight(0xffffff, 0.35); fill.position.set(3, 1, 2);
    scene.add(key, fill);
    const pivot = new T.Group(); scene.add(pivot);
    R = { renderer, scene, camera: new T.PerspectiveCamera(20, 1, 1, 10), pivot };
  } catch (er) {
    console.warn('[nx3d] WebGL indisponible : maquettes dessinées à plat.', er);
    R = false;
  }
  return R;
}

// ---------- Modèles ----------
const models = new Map(); // clé → { ready, failed, promise, data }
let editor = null; // éditeur des maquettes affiché (redessiné quand un modèle finit de se charger)
function redraw() {
  try { if (editor && editor.stage && !editor.stage.hidden) editor.draw(); } catch { /* éditeur fermé */ }
}

function load(key) {
  let s = models.get(key);
  if (s) return s;
  s = { ready: false, failed: false };
  s.promise = (async () => {
    try {
      const r = await fetch(new URL(`./devices/${key}.glb`, import.meta.url));
      if (!r.ok) throw new Error(`Modèle ${key} introuvable (${r.status}).`);
      const gltf = await new T.GLTFLoader().parseAsync(await r.arrayBuffer(), '');
      s.data = await prepare(key, gltf);
      s.ready = true;
    } catch (er) {
      s.failed = true;
      console.warn('[nx3d]', er);
    }
    redraw();
    return s;
  })();
  models.set(key, s);
  return s;
}

async function prepare(key, gltf) {
  const model = gltf.scene;
  const laptop = /^macbook/.test(key);
  model.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(model);
  model.position.sub(box.getCenter(new T.Vector3())); // centre de l'appareil sur le pivot des rotations
  const inner = new T.Group(); inner.add(model);
  const size = box.getSize(new T.Vector3());
  let screen = null;
  model.traverse((o) => { if (!screen && o.isMesh && o.name === 'NX_SCREEN') screen = o; });
  let aspect = 1; let canvas = null; let tex = null;
  if (screen) {
    screen.geometry.computeBoundingBox();
    const s = screen.geometry.boundingBox.getSize(new T.Vector3());
    aspect = s.x / Math.max(1e-6, s.y);
    // Dalle à taille fixe (2048 px sur le grand côté) : assez pour les exports, une seule allocation par modèle.
    canvas = document.createElement('canvas');
    canvas.width = aspect >= 1 ? 2048 : Math.round(2048 * aspect);
    canvas.height = aspect >= 1 ? Math.round(2048 / aspect) : 2048;
    tex = new T.CanvasTexture(canvas);
    tex.colorSpace = T.SRGBColorSpace; tex.flipY = false; tex.anisotropy = 8;
    screen.material = new T.MeshBasicMaterial({ map: tex, toneMapped: false, name: 'Écran' });
  }
  // Coque (aluminium, titane, verre teinté) : matériaux de la couleur du premier matériau du fichier, teintés ensuite
  // à la couleur choisie dans les Maquettes (couleurs du catalogue du Responsive Lab).
  const body = [];
  try {
    const first = await gltf.parser.getDependency('material', 0);
    const c0 = first && first.color;
    if (c0) {
      const seen = new Set();
      model.traverse((o) => {
        if (!o.isMesh || o === screen) return;
        for (const mt of [].concat(o.material)) {
          if (!mt || seen.has(mt) || !mt.color) continue;
          seen.add(mt);
          const near = Math.abs(mt.color.r - c0.r) + Math.abs(mt.color.g - c0.g) + Math.abs(mt.color.b - c0.b) < 0.03;
          if (near && (mt.opacity ?? 1) >= 0.99) body.push(mt);
        }
      });
    }
  } catch { /* coque laissée à sa couleur d'origine */ }
  // Portable et écran se posent sur une table ; téléphone et tablette se tiennent ou se couchent.
  const stand = laptop || key === 'studio-display';
  return { key, laptop, stand, inner, size, screen, aspect, canvas, tex, body, original: body.map((mt) => mt.color.clone()), painted: '', front: {} };
}

// Orientation de l'appareil à partir des inclinaisons du moteur (degrés ; y vers le bas, profondeur vers le fond),
// converties vers three.js (y vers le haut, z vers l'objectif).
//  - Téléphone, tablette : comme la carte d'origine (rotation dans le plan, puis haut/bas, puis gauche/droite) ;
//    « haut / bas » positif éloigne le haut de l'appareil : vu d'un peu au-dessus comme une photo produit, et couché
//    sur la table pour « À plat (dessus) » (la carte d'origine, symétrique, ne montrait pas qu'elle était vue de dessous).
//  - Portable, écran, posés sur une table : « haut / bas » est la hauteur de l'objectif (le portable part d'une vue
//    un peu plongeante qui montre le clavier), « rotation » leur orientation sur la table (et non un appareil penché
//    sur un coin), « gauche / droite » inchangé.
const AX = new T.Vector3(1, 0, 0); const AY = new T.Vector3(0, 1, 0);
const qa = new T.Quaternion(); const qb = new T.Quaternion(); const eu = new T.Euler();
function pose(q, d, rx, ry, rz) {
  if (d.stand) {
    const lean = d.laptop ? LAPTOP_LEAN : 0;
    return q.setFromAxisAngle(AY, -ry * RAD).multiply(qa.setFromAxisAngle(AX, lean + rx * RAD)).multiply(qb.setFromAxisAngle(AY, -rz * RAD));
  }
  return q.setFromEuler(eu.set(-rx * RAD, -ry * RAD, -rz * RAD, 'YXZ'));
}
// Taille de la face avant (vue de face, sans perspective) : elle prend la place du dessin d'origine.
function front(d, land) {
  const k = land ? 'l' : 'p';
  if (!d.front[k]) {
    const m = new T.Matrix4().makeRotationFromQuaternion(pose(new T.Quaternion(), d, 0, 0, 0));
    if (land) m.multiply(new T.Matrix4().makeRotationZ(Math.PI / 2));
    const half = d.size.clone().multiplyScalar(0.5); let w = 0; let h = 0;
    for (let i = 0; i < 8; i++) {
      const p = new T.Vector3(i & 1 ? half.x : -half.x, i & 2 ? half.y : -half.y, i & 4 ? half.z : -half.z).applyMatrix4(m);
      w = Math.max(w, Math.abs(p.x)); h = Math.max(h, Math.abs(p.y));
    }
    d.front[k] = { w: 2 * w, h: 2 * h };
  }
  return d.front[k];
}

// Modèles nécessaires à une maquette (avant un export : aucune image ne part avec un appareil à plat).
async function ensure(doc) {
  if (!engine()) return;
  const keys = new Set();
  for (const s of (doc && doc.slots) || []) { const w = wantsModel(s, doc); if (w) keys.add(w.key); }
  await Promise.all([...keys].map((k) => load(k).promise));
}

// ---------- Rendu d'un emplacement ----------
const cache = new Map();
const labels = new Map(); // emplacement → centre de son écran à l'image, pour le rendu en cours
function paintScreen(d, media, m, video) {
  if (!d.canvas) return;
  const land = !!m.land && !d.laptop && d.key !== 'studio-display';
  const id = video ? '' : JSON.stringify([m.media || '', media ? `${media.width}x${media.height}` : '', m.zoom || 1, m.align || 'top', land, m.scroll ? Math.round(m.scroll * 200) : 0]);
  if (id && id === d.painted) return;
  const c = d.canvas; const x = c.getContext('2d');
  x.save();
  // Appareil en paysage : la dalle reste en portrait dans le modèle, le contenu y est tourné d'un quart de tour.
  if (land) { x.translate(c.width, 0); x.rotate(Math.PI / 2); }
  const W = land ? c.height : c.width; const H = land ? c.width : c.height;
  if (media) coverDraw(x, media, W, H, m.zoom, m.align); else paintWallpaper(x, W, H);
  x.restore();
  d.tex.needsUpdate = true;
  d.painted = id;
}

function renderSlot(want, m, media, o) {
  const E = engine();
  if (!E) return null;
  const s = load(want.key);
  if (!s.ready) return null; // pendant le chargement : dessin d'origine, redessiné ensuite
  const d = s.data;
  const video = !!(media && media.tagName === 'VIDEO');
  const color = m.color || (want.dev && want.dev.colors && want.dev.colors[0] && want.dev.colors[0][1]) || '';
  const res = Math.max(1, Math.min(2, o.quality || 1));
  const land = !!m.land && !d.laptop && d.key !== 'studio-display';
  const ck = video ? '' : JSON.stringify([want.key, color, +(m.rx || 0).toFixed(1), +(m.ry || 0).toFixed(1), +(m.rz || 0).toFixed(1), land, Math.round(o.hw), Math.round(o.hh), Math.round(o.focal), res, m.media || '', media ? `${media.width}x${media.height}` : '', m.zoom || 1, m.align || 'top', m.scroll ? Math.round(m.scroll * 200) : 0]);
  let hit = ck && cache.get(ck);
  if (!hit) {
    paintScreen(d, media, m, video);
    d.body.forEach((mt, i) => { if (color) mt.color.set(color); else mt.color.copy(d.original[i]); });
    E.pivot.clear(); E.pivot.add(d.inner);
    d.inner.rotation.set(0, 0, land ? Math.PI / 2 : 0);
    // Échelle : la face avant de l'appareil occupe la place du dessin d'origine.
    const fr = front(d, land);
    E.pivot.scale.setScalar(Math.min((2 * o.hw * 0.94) / fr.w, (2 * o.hh * 0.94) / fr.h));
    pose(E.pivot.quaternion, d, m.rx || 0, m.ry || 0, m.rz || 0);
    E.pivot.updateMatrixWorld(true);
    // Emprise à l'écran : les 8 coins de l'appareil projetés avec la perspective du moteur (focale o.focal).
    const D = o.focal;
    let e = extent(d, D);
    if (!e) return null; // appareil plus près que l'objectif : dessin d'origine
    // Portable ou écran vus de dessus : clavier et pied s'ajoutent à la face avant ; on reste dans la place prévue
    // par la mise en page au lieu de déborder du cadre.
    if (d.stand) {
      const fit = Math.min(1, (2 * o.hw * 1.02) / (e.maxX - e.minX), (2 * o.hh * 1.02) / (e.maxY - e.minY));
      if (fit < 0.999) { E.pivot.scale.multiplyScalar(fit); E.pivot.updateMatrixWorld(true); e = extent(d, D); if (!e) return null; }
    }
    const { minX, maxX, minY, maxY, depth } = e;
    const hx = Math.max(Math.abs(minX), Math.abs(maxX)) * 1.03 + 2; const hy = Math.max(Math.abs(minY), Math.abs(maxY)) * 1.03 + 2;
    // Centre de l'écran à l'image (étiquette « Déposez une capture » de l'aperçu).
    let label = null;
    if (d.screen) {
      d.screen.geometry.computeBoundingBox();
      const c = d.screen.geometry.boundingBox.getCenter(new T.Vector3()).applyMatrix4(d.screen.matrixWorld);
      const f = D / (D - c.z); label = [c.x * f, -c.y * f];
    }
    const cam = E.camera;
    cam.position.set(0, 0, D); cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0);
    cam.fov = (2 * Math.atan(hy / D)) / RAD; cam.aspect = hx / hy;
    cam.near = Math.max(0.5, D - depth * 1.5 - 10); cam.far = D + depth * 1.5 + 10;
    cam.updateProjectionMatrix();
    let r2 = res; const big = Math.max(2 * hx, 2 * hy) * r2;
    if (big > 2400) r2 *= 2400 / big;
    const W = Math.max(2, Math.ceil(2 * hx * r2)); const H = Math.max(2, Math.ceil(2 * hy * r2));
    E.renderer.setPixelRatio(1);
    E.renderer.setSize(W, H, false);
    E.renderer.render(E.scene, cam);
    const img = document.createElement('canvas'); img.width = W; img.height = H;
    img.getContext('2d').drawImage(E.renderer.domElement, 0, 0);
    hit = { img, hx, hy, q: [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]], label };
    // Cache court (les images peuvent peser plusieurs mégaoctets) : il sert surtout aux redessins sans changement.
    if (ck) { cache.set(ck, hit); if (cache.size > 10) cache.delete(cache.keys().next().value); }
  }
  if (m.id && hit.label) labels.set(m.id, [o.cx + hit.label[0], o.cy + hit.label[1]]);
  return { img: hit.img, x: o.cx - hit.hx, y: o.cy - hit.hy, w: 2 * hit.hx, h: 2 * hit.hy, quad: hit.q.map(([x, y]) => [o.cx + x, o.cy + y]) };
}

// Coins de l'appareil (à son échelle et son orientation courantes) projetés : bornes en pixels autour de son centre.
function extent(d, D) {
  const half = d.size.clone().multiplyScalar(0.5);
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity; let depth = 0;
  for (let i = 0; i < 8; i++) {
    const p = new T.Vector3(i & 1 ? half.x : -half.x, i & 2 ? half.y : -half.y, i & 4 ? half.z : -half.z).applyMatrix4(d.inner.matrixWorld);
    if (p.z >= D * 0.9) return null;
    const f = D / (D - p.z); const px = p.x * f; const py = -p.y * f;
    minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
    depth = Math.max(depth, Math.abs(p.z));
  }
  return { minX, maxX, minY, maxY, depth };
}

let warned = false;
function device(m, media, o) {
  try {
    const want = wantsModel(m, o.doc);
    return want ? renderSlot(want, m, media, o) : null;
  } catch (er) {
    if (!warned) { warned = true; console.warn('[nx3d] rendu 3D impossible, dessin à plat :', er); }
    return null;
  }
}

// Épaisseur (demi-épaisseur, en pixels) des appareils dessinés à plat : celle du catalogue (millimètres) au lieu de
// 12 % de la plus petite dimension, qui donnait 3 cm à l'écran d'un portable ; aucune pour une fenêtre de navigateur.
function depth(m, K, Hh) {
  const base = Math.min(K, Hh);
  if (m.kind === 'browser') return 0;
  if ((m.kind || 'device') !== 'device') return base * 0.12;
  const dev = deviceById(devId(m)); const b = dev && dev.p && dev.p.b;
  if (!b || !(b[2] > 0)) return base * 0.06;
  const real = (b[2] / Math.max(1, Math.min(b[0], b[1]))) * base * 0.94;
  return Math.max(0.6, Math.min(base * 0.12, real));
}

function empty(x, w, h) { paintWallpaper(x, w, h); return true; }

// Début de chaque rendu d'une maquette (après le fond) : rien à dessiner, étiquettes du rendu précédent oubliées.
function bg() { labels.clear(); }

// Étiquette « Déposez une capture » sur les appareils vides, dans l'aperçu de l'éditeur seulement (le canevas des
// exports n'est pas celui de l'éditeur) : droite et lisible, quelle que soit l'inclinaison de l'appareil.
function top(n, doc, W, H, t, media, hits) {
  if (!n || !n.canvas || !n.canvas.classList || !n.canvas.classList.contains('mk-canvas')) return;
  const size = Math.max(12, Math.min(W, H) * 0.021);
  for (const s of (doc && doc.slots) || []) {
    if (s.media && media && media.get(s.media)) continue;
    const h = (hits || []).find((x) => x.id === s.id);
    if (!h || !h.quad) continue;
    const at = labels.get(s.id);
    const cx = at ? at[0] : h.quad.reduce((a, p) => a + p[0], 0) / h.quad.length;
    const cy = at ? at[1] : h.quad.reduce((a, p) => a + p[1], 0) / h.quad.length;
    n.save();
    n.font = `600 ${Math.round(size)}px Urbanist, Inter, "Segoe UI", sans-serif`;
    const label = 'Déposez une capture';
    const tw = n.measureText(label).width; const pw = tw + size * 1.6; const ph = size * 2;
    n.beginPath(); n.roundRect(cx - pw / 2, cy - ph / 2, pw, ph, ph / 2);
    n.fillStyle = 'rgba(10, 10, 10, 0.78)'; n.fill();
    n.lineWidth = Math.max(1, size * 0.06); n.strokeStyle = 'rgba(255, 255, 255, 0.35)'; n.stroke();
    n.fillStyle = '#ffffff'; n.textAlign = 'center'; n.textBaseline = 'middle';
    n.fillText(label, cx, cy + size * 0.04);
    n.restore();
  }
}

globalThis.__nxMk = { ...(globalThis.__nxMk || {}), bg, device, depth, empty, top };

// Éditeur : retenu à chaque dessin (pour le redessiner quand un modèle arrive), modèles chargés dès l'ouverture de la
// composition libre, et attendus avant chaque export.
const P = MockupEditor && MockupEditor.prototype;
if (P && !P.nx124) {
  P.nx124 = true;
  const draw = P.draw;
  P.draw = function nxDraw(...a) { editor = this; return draw.apply(this, a); };
  const enter = P.enter;
  P.enter = async function nxEnter(...a) { editor = this; const r = await enter.apply(this, a); ensure(this.doc).catch(() => {}); return r; };
  for (const name of ['exportImage', 'exportVideo']) {
    const f = P[name];
    if (typeof f === 'function') P[name] = async function nxExport(...a) { await ensure(this.doc).catch(() => {}); return f.apply(this, a); };
  }
  // « Deux côte à côte » avec des éléments larges (fenêtre de navigateur, portable, téléphone en paysage) : les deux
  // tournés vers le centre se chevauchaient, le bord avant de l'un passant derrière l'autre. Ils sont rapetissés et
  // écartés juste assez pour rester côte à côte.
  const applyLayout = P.applyLayout;
  if (typeof applyLayout === 'function') {
    P.applyLayout = function nxApplyLayout(name, doc, ...a) {
      const t = doc || this.doc;
      const r = applyLayout.call(this, name, t, ...a);
      if (name === 'duo' && t && Array.isArray(t.slots)) t.slots.forEach((s, i) => { if (wide(s)) { s.size = Math.min(s.size, 0.44); s.x = i % 2 ? 0.71 : 0.29; } });
      return r;
    };
  }
}
// Maquettes déjà ouvertes avant l'arrivée de ce module (le Studio charge ses compléments après son ouverture) :
// redessinées tout de suite avec les vrais appareils.
if (state.studio && state.studio.mockup) {
  editor = state.studio.mockup;
  redraw();
  ensure(editor.doc).catch(() => {});
}
