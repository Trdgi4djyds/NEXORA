// NEXORA #011 : classes de three.js utilisées par le Studio (même instance que NEXORA) et opérations booléennes 3D.
import * as T from '../../dist/chunks/chunk-6CI3EJGL.js';

export const Vector2 = T.ed; export const Vector3 = T.gd; export const Color = T.zd; export const Box3 = T.Ed; export const MathUtils = T.dd;
export const Object3D = T.wd; export const Group = T.xd; export const Mesh = T._d; export const Scene = T.Cd;
export const BufferGeometry = T.Rd; export const BufferAttribute = T.Gd; export const PlaneGeometry = T.af; export const BoxGeometry = T.Be; export const SphereGeometry = T.df;
export const MeshStandardMaterial = T.nf; export const MeshPhysicalMaterial = T.of; export const MeshBasicMaterial = T.Zd; export const MeshToonMaterial = T.qf;
export const MeshNormalMaterial = T.rf; export const MeshDepthMaterial = T.tf; export const ShaderMaterial = T.lf; export const LineBasicMaterial = T.je;
export const Line = T.ke; export const Points = T.oe; export const PointsMaterial = T.ne; export const CanvasTexture = T.we; export const DataTexture = T.be;
export const WebGLRenderTarget = T.od; export const Raycaster = T.Hg; export const PMREMGenerator = T.fh; export const ShaderPass = T.rh; export const GLTFExporter = T.qh;
export const Quaternion = T.fd;
// Constantes de three.js (valeurs stables de la bibliothèque).
export const C = { RepeatWrapping: 1000, ClampToEdge: 1001, DoubleSide: 2, FrontSide: 0, Equirect: 303, SRGB: 'srgb', RGBADepthPacking: 3201, Additive: 2, NearestFilter: 1003, RedFormat: 1028 };

// ---------- Opérations booléennes 3D (arbres BSP, d'après csg.js d'Evan Wallace) ----------
const EPS = 1e-5;
class V { constructor(p, n) { this.p = p; this.n = n; } clone() { return new V(this.p.clone(), this.n.clone()); } flip() { this.n.negate(); } lerp(o, t) { return new V(this.p.clone().lerp(o.p, t), this.n.clone().lerp(o.n, t)); } }
class Plane {
  constructor(n, w) { this.n = n; this.w = w; }
  static from(a, b, c) { const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize(); return new Plane(n, n.dot(a)); }
  clone() { return new Plane(this.n.clone(), this.w); }
  flip() { this.n.negate(); this.w = -this.w; }
  split(poly, cf, cb, f, b) {
    let type = 0; const types = [];
    for (const v of poly.vs) { const t = this.n.dot(v.p) - this.w; const k = t < -EPS ? 2 : t > EPS ? 1 : 0; type |= k; types.push(k); }
    if (type === 0) (this.n.dot(poly.plane.n) > 0 ? cf : cb).push(poly);
    else if (type === 1) f.push(poly);
    else if (type === 2) b.push(poly);
    else {
      const fs = []; const bs = [];
      for (let i = 0; i < poly.vs.length; i++) {
        const j = (i + 1) % poly.vs.length; const ti = types[i]; const tj = types[j]; const vi = poly.vs[i]; const vj = poly.vs[j];
        if (ti !== 2) fs.push(vi); if (ti !== 1) bs.push(ti !== 2 ? vi.clone() : vi);
        if ((ti | tj) === 3) { const t = (this.w - this.n.dot(vi.p)) / this.n.dot(vj.p.clone().sub(vi.p)); const v = vi.lerp(vj, t); fs.push(v); bs.push(v.clone()); }
      }
      if (fs.length >= 3) f.push(new Poly(fs, poly.shared)); if (bs.length >= 3) b.push(new Poly(bs, poly.shared));
    }
  }
}
class Poly { constructor(vs, shared) { this.vs = vs; this.shared = shared; this.plane = Plane.from(vs[0].p, vs[1].p, vs[2].p); } clone() { return new Poly(this.vs.map((v) => v.clone()), this.shared); } flip() { this.vs.reverse().forEach((v) => v.flip()); this.plane.flip(); } }
class Node {
  constructor(polys) { this.plane = null; this.front = null; this.back = null; this.polys = []; if (polys) this.build(polys); }
  invert() { for (const p of this.polys) p.flip(); if (this.plane) this.plane.flip(); if (this.front) this.front.invert(); if (this.back) this.back.invert(); [this.front, this.back] = [this.back, this.front]; }
  clipPolys(polys) {
    if (!this.plane) return polys.slice();
    let f = []; let b = [];
    for (const p of polys) this.plane.split(p, f, b, f, b);
    if (this.front) f = this.front.clipPolys(f);
    b = this.back ? this.back.clipPolys(b) : [];
    return f.concat(b);
  }
  clipTo(bsp) { this.polys = bsp.clipPolys(this.polys); if (this.front) this.front.clipTo(bsp); if (this.back) this.back.clipTo(bsp); }
  all() { let p = this.polys.slice(); if (this.front) p = p.concat(this.front.all()); if (this.back) p = p.concat(this.back.all()); return p; }
  build(polys) {
    // Construction itérative (évite les piles d'appels trop profondes sur les modèles détaillés).
    const stack = [[this, polys]];
    while (stack.length) {
      const [node, list] = stack.pop();
      if (!list.length) continue;
      if (!node.plane) node.plane = list[0].plane.clone();
      const f = []; const b = [];
      for (const p of list) node.plane.split(p, node.polys, node.polys, f, b);
      if (f.length) { if (!node.front) node.front = new Node(); stack.push([node.front, f]); }
      if (b.length) { if (!node.back) node.back = new Node(); stack.push([node.back, b]); }
    }
  }
}
export function geometryToPolys(geo, matrix) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position; const nor = g.attributes.normal; const polys = [];
  for (let i = 0; i < pos.count; i += 3) {
    const vs = [];
    for (let k = 0; k < 3; k++) {
      const p = new T.gd().fromBufferAttribute(pos, i + k); const n = nor ? new T.gd().fromBufferAttribute(nor, i + k) : new T.gd(0, 1, 0);
      if (matrix) { p.applyMatrix4(matrix); n.transformDirection(matrix); }
      vs.push(new V(p, n));
    }
    const area = vs[1].p.clone().sub(vs[0].p).cross(vs[2].p.clone().sub(vs[0].p)).lengthSq();
    if (area > 1e-12) polys.push(new Poly(vs, 0));
  }
  return polys;
}
export function polysToGeometry(polys) {
  const P = []; const N = [];
  for (const poly of polys) for (let i = 1; i < poly.vs.length - 1; i++) for (const v of [poly.vs[0], poly.vs[i], poly.vs[i + 1]]) { P.push(v.p.x, v.p.y, v.p.z); N.push(v.n.x, v.n.y, v.n.z); }
  const g = new T.Rd();
  g.setAttribute('position', new T.Gd(new Float32Array(P), 3));
  g.setAttribute('normal', new T.Gd(new Float32Array(N), 3));
  return g;
}
export function csg(aPolys, bPolys, op) {
  const a = new Node(aPolys.map((p) => p.clone())); const b = new Node(bPolys.map((p) => p.clone()));
  if (op === 'union') { a.clipTo(b); b.clipTo(a); b.invert(); b.clipTo(a); b.invert(); a.build(b.all()); return a.all(); }
  if (op === 'subtract') { a.invert(); a.clipTo(b); b.clipTo(a); b.invert(); b.clipTo(a); b.invert(); a.build(b.all()); a.invert(); return a.all(); }
  a.invert(); b.clipTo(a); b.invert(); a.clipTo(b); b.clipTo(a); a.build(b.all()); a.invert(); return a.all();
}
// Version de three.js chargée par les pages web exportées (visionneuse autonome).
export const WEB_THREE = '0.185.0';
