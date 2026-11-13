// NEXORA #118 : roches des mises en scène réalistes du Studio et du modèle « Lancement produit » de NEX-DESIGN :
// sphère subdivisée, déformée par un bruit et coupée par quelques plans (arêtes de pierre taillée), habillée de la
// photo de roche noire (nx/photos/roche.webp, projection par face), posée au sol et exportée en GLB comme un modèle
// importé (elle s'enregistre, s'anime et s'exporte avec la scène).
import * as THREE from '../../dist/chunks/three-D5YSJNBV.js';

const T = THREE;

function rng(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s % 1000003) / 1000003; }; }
// Bruit de valeur 3D lissé (reproductible pour une même graine).
function noise3(seed) {
  const r = rng(seed + 17); const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const p = new Uint8Array(512); for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const g = new Float32Array(256); for (let i = 0; i < 256; i++) g[i] = r() * 2 - 1;
  const fade = (t) => t * t * (3 - 2 * t); const l = (a, b, t) => a + (b - a) * t;
  const h = (x, y, z) => g[p[p[p[x & 255] + (y & 255)] + (z & 255)]];
  return (x, y, z) => {
    const X = Math.floor(x); const Y = Math.floor(y); const Z = Math.floor(z);
    const fx = fade(x - X); const fy = fade(y - Y); const fz = fade(z - Z);
    return l(l(l(h(X, Y, Z), h(X + 1, Y, Z), fx), l(h(X, Y + 1, Z), h(X + 1, Y + 1, Z), fx), fy),
      l(l(h(X, Y, Z + 1), h(X + 1, Y, Z + 1), fx), l(h(X, Y + 1, Z + 1), h(X + 1, Y + 1, Z + 1), fx), fy), fz);
  };
}

let photo = null;
function texture() {
  if (!photo) photo = new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = new URL('../photos/roche.webp', import.meta.url).href; });
  return photo;
}

// Maillage de la roche (non indexé : chaque face reçoit sa propre projection de texture, sans couture).
export async function mesh({ seed = 1, size = 24, flat = 0.7 } = {}) {
  const geo = new T.IcosahedronGeometry(1, 16);
  const pos = geo.attributes.position; const N = noise3(seed); const r = rng(seed);
  const cuts = Array.from({ length: 6 + Math.floor(r() * 4) }, () => ({ n: new T.Vector3(r() * 2 - 1, r() * 1.6 - 0.5, r() * 2 - 1).normalize(), d: 0.58 + r() * 0.3 }));
  const v = new T.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = 1 + 0.24 * N(v.x * 1.4 + 3, v.y * 1.4, v.z * 1.4) + 0.09 * N(v.x * 4.5, v.y * 4.5 + 7, v.z * 4.5) + 0.035 * N(v.x * 13, v.y * 13, v.z * 13 + 11);
    v.multiplyScalar(k);
    for (const c of cuts) { const dd = v.dot(c.n); if (dd > c.d) v.addScaledVector(c.n, -(dd - c.d) * 0.9); }
    pos.setXYZ(i, v.x * 1.18, v.y * flat, v.z * 0.96);
  }
  // Normales adoucies : même normale pour tous les sommets d'une même position (pierre usée plutôt que facettes).
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal; const acc = new Map(); const key = (i) => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
  for (let i = 0; i < pos.count; i++) { const kk = key(i); const a = acc.get(kk) || [0, 0, 0]; a[0] += nrm.getX(i); a[1] += nrm.getY(i); a[2] += nrm.getZ(i); acc.set(kk, a); }
  for (let i = 0; i < pos.count; i++) { const a = acc.get(key(i)); const L = Math.hypot(a[0], a[1], a[2]) || 1; nrm.setXYZ(i, a[0] / L, a[1] / L, a[2] / L); }
  // Projection de la texture selon l'axe dominant de chaque face.
  const uv = geo.attributes.uv; const fa = new T.Vector3(); const fb = new T.Vector3(); const fc = new T.Vector3(); const fn = new T.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    fa.fromBufferAttribute(pos, i); fb.fromBufferAttribute(pos, i + 1); fc.fromBufferAttribute(pos, i + 2);
    fn.subVectors(fc, fb).cross(fb.clone().sub(fa)); const ax = Math.abs(fn.x); const ay = Math.abs(fn.y); const az = Math.abs(fn.z);
    for (let j = 0; j < 3; j++) { v.fromBufferAttribute(pos, i + j); const [s, t] = ax >= ay && ax >= az ? [v.z, v.y] : ay >= az ? [v.x, v.z] : [v.x, v.y]; uv.setXY(i + j, s * 0.62 + 0.5, t * 0.62 + 0.5); }
  }
  geo.computeBoundingBox();
  const bb = geo.boundingBox; const sz = bb.getSize(new T.Vector3()); const k = size / Math.max(sz.x, sz.y, sz.z);
  geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2); geo.scale(k, k, k);
  const img = await texture();
  const mat = new T.MeshStandardMaterial({ color: img ? '#ffffff' : '#2a2a2e', roughness: 0.88, metalness: 0, name: 'Roche' });
  if (img) { const tx = new T.Texture(img); tx.colorSpace = T.SRGBColorSpace; tx.wrapS = tx.wrapT = T.RepeatWrapping; tx.userData.mimeType = 'image/jpeg'; tx.needsUpdate = true; mat.map = tx; }
  const m = new T.Mesh(geo, mat); m.name = 'Roche'; m.castShadow = true; m.receiveShadow = true;
  return m;
}

// GLB de la roche (taille en unités du Studio : 1 unité = 10 mm).
export async function build(opts = {}) {
  const m = await mesh(opts);
  const out = await new T.GLTFExporter().parseAsync(m, { binary: true, onlyVisible: true, maxTextureSize: 512 });
  return new Uint8Array(out);
}
