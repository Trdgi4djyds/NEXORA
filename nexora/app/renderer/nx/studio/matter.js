// NEXORA #011 : matières et géométrie du Studio (matières réalistes procédurales, placage triplanaire,
// couches de matière, réseau, miroir, déformation en vague, formes combinées).
import { CanvasTexture, Group, Box3, Vector3, Mesh, MeshStandardMaterial, GLTFExporter, C, csg, geometryToPolys, polysToGeometry } from './three.js';
import { makeTexture, TEXTURES } from '../library.js';
import { toast, busy, sleep } from '../core.js';

const SKIP = ['image', 'video', 'sequence', 'texte', 'lumiere', 'confettis'];
export const canMatter = (item) => item && item.type !== 'device' && !SKIP.includes(item.kind);
const texCache = new Map();
function textures(m) {
  const key = `${m.kind}:${m.wear || 0}:${m.scratches || 0}:${(m.colors || []).join(',')}`;
  if (texCache.has(key)) return texCache.get(key);
  const t = makeTexture(m.kind, { size: 512, wear: m.wear || 0, scratches: m.scratches || 0, colors: m.colors && m.colors.length ? m.colors : null });
  const mk = (c, srgb) => { const x = new CanvasTexture(c); x.wrapS = C.RepeatWrapping; x.wrapT = C.RepeatWrapping; if (srgb) x.colorSpace = C.SRGB; x.anisotropy = 8; return x; };
  const r = { map: mk(t.color, true), normal: mk(t.normal, false), rough: mk(t.rough, false), metal: t.metal, roughness: t.roughness };
  if (texCache.size > 24) texCache.delete(texCache.keys().next().value);
  texCache.set(key, r);
  return r;
}
// Couches injectées dans le shader standard : triplanaire, reflet selon l'angle, holographique, bruit.
function shaderPatch(mat, m) {
  const tri = !!m.triplanar; const fr = m.fresnel && m.fresnel.on; const holo = !!m.holo; const noise = m.noise && m.noise.on;
  if (!tri && !fr && !holo && !noise) { mat.onBeforeCompile = () => {}; mat.customProgramCacheKey = () => 'nx0'; return; }
  const key = `nx:${tri}:${fr}:${holo}:${noise}`;
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.nxScale = { value: (m.scale || 1) * 0.06 }; sh.uniforms.nxRim = { value: new (mat.color.constructor)(m.fresnel ? m.fresnel.color || '#6a4cff' : '#6a4cff') }; sh.uniforms.nxRimPow = { value: m.fresnel ? m.fresnel.power || 4 : 4 }; sh.uniforms.nxNoise = { value: m.noise ? m.noise.amount ?? 0.35 : 0.35 };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 nxW; varying vec3 nxN;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nnxW = (modelMatrix * vec4(transformed, 1.0)).xyz; nxN = normalize(mat3(modelMatrix) * objectNormal);');
    let fs = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 nxW; varying vec3 nxN; uniform float nxScale; uniform vec3 nxRim; uniform float nxRimPow; uniform float nxNoise;
float nxH(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float nxVN(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(nxH(i), nxH(i + vec3(1,0,0)), f.x), mix(nxH(i + vec3(0,1,0)), nxH(i + vec3(1,1,0)), f.x), f.y), mix(mix(nxH(i + vec3(0,0,1)), nxH(i + vec3(1,0,1)), f.x), mix(nxH(i + vec3(0,1,1)), nxH(i + vec3(1,1,1)), f.x), f.y), f.z); }`);
    if (tri && mat.map) fs = fs.replace('#include <map_fragment>', `{ vec3 bw = pow(abs(normalize(nxN)), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
      vec4 tx = texture2D(map, nxW.zy * nxScale); vec4 ty = texture2D(map, nxW.xz * nxScale); vec4 tz = texture2D(map, nxW.xy * nxScale);
      diffuseColor *= tx * bw.x + ty * bw.y + tz * bw.z; }`);
    if (noise) fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 1.0 - nxNoise + nxNoise * 2.0 * nxVN(nxW * 0.35);');
    if (fr || holo) fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { float nxF = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), nxRimPow);
        ${fr ? 'totalEmissiveRadiance += nxRim * nxF * 0.6;' : ''}
        ${holo ? 'vec3 nxHc = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + nxF * 1.2 + dot(nxW, vec3(0.02))));\n totalEmissiveRadiance += nxHc * (0.25 + nxF * 0.9);' : ''} }`);
    sh.fragmentShader = fs;
  };
  mat.needsUpdate = true;
}
export function applyMatter(entry) {
  const item = entry.item; const m = item.nxMat;
  if (!canMatter(item) || !entry.model || !entry.model.root) return;
  entry.model.root.traverse((o) => {
    if (!o.isMesh || o.userData.editorOnly || o.userData.nxArr) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mat of mats) {
      if (!mat || !mat.isMeshStandardMaterial) continue;
      if (!mat.userData.nxOrig) mat.userData.nxOrig = { map: mat.map, normalMap: mat.normalMap, roughnessMap: mat.roughnessMap, color: mat.color.getHex(), roughness: mat.roughness, metalness: mat.metalness };
      const orig = mat.userData.nxOrig;
      if (m && m.kind && m.kind !== 'none') {
        const t = textures(m); const rep = m.scale || 1;
        for (const tx of [t.map, t.normal, t.rough]) tx.repeat.set(rep, rep);
        mat.map = t.map; mat.normalMap = t.normal; mat.roughnessMap = t.rough; mat.color.set('#ffffff');
        mat.roughness = 1; mat.metalness = t.metal; mat.normalScale && mat.normalScale.set(1, 1);
      } else if (orig) { mat.map = orig.map; mat.normalMap = orig.normalMap; mat.roughnessMap = orig.roughnessMap; mat.color.setHex(orig.color); mat.roughness = orig.roughness; mat.metalness = orig.metalness; }
      shaderPatch(mat, m || {});
      mat.needsUpdate = true;
    }
  });
}

// ---------- Réseau, miroir et vague ----------
export const ARRAYS = { none: 'Aucun', line: 'Réseau en ligne', grid: 'Réseau en grille', circle: 'Réseau en cercle', mirror: 'Miroir' };
export function applyArray(entry) {
  const root = entry.model && entry.model.root; if (!root) return;
  const old = root.children.find((c) => c.userData.nxArr); if (old) root.remove(old);
  const a = entry.item.nxArr;
  // Vague : déformation des sommets (géométries copiées, l'original reste en mémoire).
  root.traverse((o) => {
    if (!o.isMesh || o.userData.editorOnly) return;
    if (o.userData.nxGeo && !(entry.item.nxWave && entry.item.nxWave.amp)) { o.geometry = o.userData.nxGeo; delete o.userData.nxGeo; }
  });
  const wv = entry.item.nxWave;
  if (wv && wv.amp) {
    const box = new Box3().setFromObject(root); const size = box.getSize(new Vector3());
    root.traverse((o) => {
      if (!o.isMesh || o.userData.editorOnly || !o.geometry || !o.geometry.attributes.position) return;
      const base = o.userData.nxGeo || o.geometry; o.userData.nxGeo = base; const g = base.clone(); const p = g.attributes.position;
      const len = Math.max(size.x, size.z, 1); const amp = wv.amp * Math.max(size.y, 1) * 0.25; const fq = (wv.freq || 2) * Math.PI * 2 / len;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i); const z = p.getZ(i); p.setY(i, p.getY(i) + Math.sin(x * fq + (wv.phase || 0)) * amp * (wv.axis === 'z' ? 0 : 1) + Math.sin(z * fq) * amp * (wv.axis === 'z' ? 1 : 0)); }
      p.needsUpdate = true; g.computeVertexNormals(); o.geometry = g;
    });
  }
  if (!a || a.mode === 'none') return;
  const src = root.children.filter((c) => !c.userData.nxArr && !c.userData.editorOnly);
  if (!src.length) return;
  const box = new Box3(); for (const c of src) box.expandByObject(c);
  const size = box.getSize(new Vector3()); const g = new Group(); g.userData.nxArr = true; g.name = 'Réseau';
  const n = Math.max(1, Math.min(60, Math.round(a.count || 3))); const gap = a.gap ?? 0.2;
  const add = (fn) => { for (const c of src) { const k = c.clone(true); k.traverse((x) => { x.userData = { ...x.userData, nxArr: true }; }); fn(k); g.add(k); } };
  if (a.mode === 'line') for (let i = 1; i < n; i++) add((k) => { k.position.x += i * size.x * (1 + gap); });
  if (a.mode === 'grid') for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) if (r || q) add((k) => { k.position.x += q * size.x * (1 + gap); k.position.z += r * size.z * (1 + gap); });
  if (a.mode === 'circle') { const R = a.radius || Math.max(size.x, size.z) * 1.6; for (let i = 1; i < n; i++) { const ang = (i / n) * Math.PI * 2; add((k) => { const px = k.position.x; const pz = k.position.z; k.position.set(px + Math.sin(ang) * R, k.position.y, pz + R - Math.cos(ang) * R); k.rotation.y += ang; }); } }
  if (a.mode === 'mirror') add((k) => { const ax = a.axis || 'x'; k.scale[ax] *= -1; const c = box.getCenter(new Vector3()); k.position[ax] = 2 * (box.max[ax] + size[ax] * gap * 0.5) - k.position[ax]; void c; });
  root.add(g);
}

// ---------- Formes combinées (booléens 3D) ----------
export const BOOLS = { union: 'Unir', subtract: 'Soustraire (la 2e forme creuse la 1re)', intersect: 'Intersection' };
export async function combine(S, ids, op) {
  const list = ids.map((id) => S.objects.get(id)).filter((e) => e && canMatter(e.item));
  if (list.length !== 2) { toast('Sélectionne exactement deux objets 3D (Maj + clic) pour les combiner.', { kind: 'bad' }); return; }
  const t = busy('Calcul de la forme combinée…');
  try {
    await sleep(30);
    const polysOf = (e) => { const out = []; e.model.root.updateMatrixWorld(true); e.model.root.traverse((o) => { if (o.isMesh && !o.userData.editorOnly && o.geometry && o.geometry.attributes.position) out.push(...geometryToPolys(o.geometry, o.matrixWorld)); }); return out; };
    const A = polysOf(list[0]); const B = polysOf(list[1]);
    if (A.length + B.length > 60000) throw new Error('Objets trop détaillés pour être combinés (plus de 60 000 triangles).');
    const res = csg(A, B, op);
    if (!res.length) throw new Error('Le résultat est vide : les deux objets ne se touchent pas ?');
    const geo = polysToGeometry(res); geo.computeBoundingBox();
    const center = geo.boundingBox.getCenter(new Vector3()); const size = geo.boundingBox.getSize(new Vector3());
    geo.translate(-center.x, -geo.boundingBox.min.y, -center.z);
    let srcMat = null; list[0].model.root.traverse((o) => { if (!srcMat && o.isMesh && o.material && o.material.isMeshStandardMaterial) srcMat = o.material; });
    const mesh = new Mesh(geo, new MeshStandardMaterial({ color: srcMat ? srcMat.color : '#cccccc', roughness: srcMat ? srcMat.roughness : 0.5, metalness: srcMat ? srcMat.metalness : 0 }));
    const glb = await new GLTFExporter().parseAsync(mesh, { binary: true });
    const glbId = await S.registerGlb(new Uint8Array(glb));
    const item = S.addDecor({ kind: 'glb', glbId, color: '#ffffff', name: `Forme combinée (${BOOLS[op].split(' ')[0].toLowerCase()})`, pos: [center.x, geo.boundingBox ? center.y - size.y / 2 : 0, center.z] }, { select: true, history: false });
    // Le modèle importé est remis à la taille calculée.
    const e = S.objects.get(item.id); const b = new Box3().setFromObject(e.model.root); const cur = b.getSize(new Vector3());
    const k = Math.max(size.x, size.y, size.z) / Math.max(cur.x, cur.y, cur.z, 1e-6);
    if (Number.isFinite(k) && Math.abs(k - 1) > 0.01) { item.scale = (item.scale || 1) * k; S.applyItemTransform(e); }
    item.pos = [center.x, center.y - size.y / 2, center.z]; S.applyItemTransform(e);
    for (const x of list) { x.item.hidden = true; x.model.root.visible = false; }
    S.renderList(); S.commit();
    toast(`Forme combinée créée (${res.length} faces). Les deux objets d’origine sont masqués dans la liste.`);
  } catch (e) { console.error(e); toast(e.message || String(e), { kind: 'bad' }); } finally { t.close(); }
}
export { TEXTURES };
