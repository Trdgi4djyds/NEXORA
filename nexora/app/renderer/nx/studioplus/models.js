// NEXORA #055 : import des modèles OBJ, STL, PLY et SPLAT (captures 3D en nuage de points) et objets composés par
// l'IA. Chaque modèle est converti en GLB puis ajouté par le chemin d'import du Studio (registerGlb, addDecor) :
// il s'enregistre, s'anime et s'exporte comme un modèle .glb importé.
import * as THREE from '../../dist/chunks/three-D5YSJNBV.js';
import { GLTFExporter } from '../studio/three.js';
import { parseObj, parseStl, parsePly, parseSplat, thin, cleanParts } from './formats.js';
import { pickFile, toast, busy, done, allowed } from './ui.js';
import { aiJson, needAi } from '../services.js';

// three.js sous ses vrais noms (même instance que le Studio).
const T = THREE;

export const MODEL_EXTS = ['obj', 'stl', 'ply', 'splat'];
// Modèle lu → géométrie centrée, posée au sol, ramenée à environ 20 unités (la taille d'un téléphone en vaut 15).
function geometry(m) {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(m.positions, 3));
  if (m.colors) g.setAttribute('color', new T.BufferAttribute(m.colors, 3));
  if (m.indices) g.setIndex(new T.BufferAttribute(m.indices, 1));
  g.computeBoundingBox();
  const b = g.boundingBox; const s = b.getSize(new T.Vector3()); const c = b.getCenter(new T.Vector3());
  const k = 20 / Math.max(s.x, s.y, s.z, 1e-6);
  g.translate(-c.x, -b.min.y, -c.z); g.scale(k, k, k);
  // Sans faces (PLY de points, captures 3D, SPLAT) : nuage de points.
  const points = Boolean(m.points || m.splat) && !m.indices;
  if (!points) { if (m.normals && m.normals.some((v) => v !== 0)) g.setAttribute('normal', new T.BufferAttribute(m.normals, 3)); else g.computeVertexNormals(); }
  return { g, points };
}
async function toGlb(object) {
  const r = await new GLTFExporter().parseAsync(object, { binary: true, onlyVisible: true });
  return new Uint8Array(r);
}
async function addGlb(S, bytes, name, extra = {}) {
  const id = await S.registerGlb(bytes);
  const item = S.addDecor({ kind: 'glb', glbId: id, color: '#ffffff', ...extra });
  if (item && name) { item.name = name; S.renderList && S.renderList(); }
  return item;
}
export function readModel(name, bytes) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'obj') return parseObj(new TextDecoder().decode(bytes));
  if (ext === 'stl') return parseStl(bytes);
  if (ext === 'ply') { const m = parsePly(bytes); return m.indices ? m : { ...m, points: true }; }
  if (ext === 'splat') return parseSplat(bytes);
  throw new Error('Format non pris en charge : utilise OBJ, STL, PLY, SPLAT ou GLB.');
}
export async function importModel(S) {
  const f = await pickFile({ title: 'Importer un modèle 3D', name: 'Modèles 3D', extensions: MODEL_EXTS, as: 'bytes' });
  if (!f || !f.data) return;
  const t = busy('Conversion du modèle 3D…');
  try { await addModelBytes(S, f.name || 'modele.obj', f.data); } catch (e) { toast(e.message || String(e), { kind: 'bad' }); } finally { done(t); }
}
export async function addModelBytes(S, fileName, bytes) {
  const raw = readModel(fileName, bytes);
  const m = thin(raw);
  const { g, points } = geometry(m);
  let obj;
  if (points) obj = new T.Points(g, new T.PointsMaterial({ size: 0.12, vertexColors: !!m.colors, color: m.colors ? 0xffffff : 0xcccccc }));
  else obj = new T.Mesh(g, new T.MeshStandardMaterial({ color: m.colors ? 0xffffff : 0xd9d9de, vertexColors: !!m.colors, roughness: 0.55, metalness: 0.05 }));
  obj.name = (fileName || 'Modèle').replace(/\.[^.]+$/, '');
  const item = await addGlb(S, await toGlb(obj), obj.name, points ? { nxPoints: 0.12 } : {});
  if (points) dressPoints(S, item);
  toast(points ? `Capture 3D importée en nuage de points (${(m.positions.length / 3).toLocaleString('fr-FR')} points${m.thinned ? `, un sur ${m.thinned} pour l’aperçu` : ''}).` : `Modèle « ${obj.name} » importé.`);
  return item;
}
// Les nuages de points rechargés depuis un GLB ont des points d'un pixel : taille réglée à chaque reconstruction.
export function dressPoints(S, item) {
  const e = item && S.objects.get(item.id); if (!e || !item.nxPoints) return;
  e.model.root.traverse((o) => { if (o.isPoints && o.material) { o.material.size = item.nxPoints; o.material.sizeAttenuation = true; o.material.needsUpdate = true; } });
  S.dirty = true;
}

// ---------- Objet composé par l'IA (formes simples assemblées) ----------
function shapeGeometry(shape) {
  const G = { box: ['BoxGeometry', [1, 1, 1]], sphere: ['SphereGeometry', [0.5, 32, 20]], cylinder: ['CylinderGeometry', [0.5, 0.5, 1, 32]], cone: ['ConeGeometry', [0.5, 1, 32]], torus: ['TorusGeometry', [0.38, 0.12, 20, 48]], capsule: ['CapsuleGeometry', [0.3, 0.4, 8, 16]] }[shape];
  const C = T[G[0]];
  return new C(...G[1]);
}
export function buildParts(plan) {
  const group = new T.Group(); group.name = plan.name;
  for (const p of plan.parts) {
    const mesh = new T.Mesh(shapeGeometry(p.shape), new T.MeshStandardMaterial({ color: new T.Color(p.color), metalness: p.metal, roughness: p.rough }));
    mesh.position.set(...p.pos); mesh.rotation.set(...p.rot.map((d) => d * Math.PI / 180)); mesh.scale.set(...p.size);
    group.add(mesh);
  }
  return group;
}
export async function aiObject(S, text) {
  if (!allowed('L’objet composé par l’IA') || !(await needAi())) return;
  const t = busy('L’IA compose l’objet…');
  try {
    const raw = await aiJson(`Compose un objet 3D simple à partir de formes de base pour une scène de présentation produit. Description : « ${text} ».
Formes possibles : box, sphere, cylinder, cone, torus, capsule (taille 1 avant mise à l'échelle). Unités : centimètres, objet d'environ 10 à 25 de haut, posé sur y = 0.
Format : {"name":"…","parts":[{"shape":"box","pos":[x,y,z],"rot":[degX,degY,degZ],"size":[sx,sy,sz],"color":"#rrggbb","metal":0..1,"rough":0..1}]} ; 3 à 25 formes.`, { maxTokens: 1800 });
    const plan = cleanParts(raw);
    const item = await addGlb(S, await toGlb(buildParts(plan)), plan.name);
    toast(`« ${plan.name} » ajouté : ${plan.parts.length} formes assemblées par l’IA, modifiable comme tout objet importé.`);
    return item;
  } catch (e) { toast(e.message || String(e), { kind: 'bad' }); } finally { done(t); }
}
