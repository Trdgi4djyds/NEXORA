// NEXORA #011 : rendu du Studio (profondeur de champ, étalonnage, rendus stylisés, environnements HDRI,
// particules, qualité d'aperçu, couches, GIF, vidéo transparente, déclinaison des formats).
import { ShaderPass, WebGLRenderTarget, MeshDepthMaterial, MeshNormalMaterial, MeshBasicMaterial, MeshStandardMaterial, MeshToonMaterial, DataTexture, CanvasTexture, PMREMGenerator, Points, ShaderMaterial, BufferGeometry, BufferAttribute, Color, Vector2, C } from './three.js';
import { settings, saveSettings, toast, busy, makeCanvas, canvasBytes, zip, encodeGif, saveBytes, safeName, sleep, clamp, makeNoise, hexRgb, state } from '../core.js';

export const nxEnv = (S) => (S.three.env.nx = S.three.env.nx || {});
const on = (S, k) => { const n = S.three.env && S.three.env.nx; return !!(n && n[k] && n[k].on); };

// ---------- Passes de post-traitement ----------
const DOF = {
  uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, focus: { value: 60 }, aperture: { value: 0.6 }, maxBlur: { value: 0.012 }, near: { value: 0.5 }, far: { value: 3000 }, aspect: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `#include <packing>
    uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform float focus, aperture, maxBlur, near, far, aspect; varying vec2 vUv;
    float viewZ(vec2 uv){ float d = unpackRGBAToDepth(texture2D(tDepth, uv)); return -perspectiveDepthToViewZ(d, near, far); }
    void main(){
      float z = viewZ(vUv); float coc = clamp(abs(z - focus) / max(focus, 0.001) * aperture * 0.02, 0.0, maxBlur);
      vec4 acc = texture2D(tDiffuse, vUv); float wsum = 1.0;
      for (int i = 0; i < 32; i++) {
        float fi = float(i); float r = sqrt((fi + 0.5) / 32.0); float a = fi * 2.39996;
        vec2 off = vec2(cos(a) * r / aspect, sin(a) * r) * coc;
        float zs = viewZ(vUv + off); float cs = clamp(abs(zs - focus) / max(focus, 0.001) * aperture * 0.02, 0.0, maxBlur);
        float w = zs < z ? 1.0 : clamp(cs / max(coc, 0.0001), 0.0, 1.0);
        acc += texture2D(tDiffuse, vUv + off) * w; wsum += w;
      }
      gl_FragColor = acc / wsum;
    }`
};
export const GRADES = {
  aucun: ['Aucun', [0, 0, 1, 1, 0, 0]], cinema: ['Cinéma', [0.06, -0.02, 1.12, 0.92, 0.04, 0]], chaud: ['Chaud', [0.35, 0.04, 1.04, 1.08, 0, 0]], froid: ['Froid', [-0.35, 0, 1.05, 0.95, 0, 0]],
  tealorange: ['Sarcelle et orange', [0.12, 0, 1.15, 1.12, 0.03, 1]], nb: ['Noir et blanc', [0, 0, 1.18, 0, 0, 0]], vintage: ['Vintage', [0.22, 0.05, 0.92, 0.8, 0.1, 0]], delave: ['Délavé', [0, 0, 0.85, 0.7, 0.16, 0]], vif: ['Vif', [0.04, 0, 1.12, 1.3, 0, 0]]
};
const GRADE = {
  uniforms: { tDiffuse: { value: null }, temp: { value: 0 }, tint: { value: 0 }, contrast: { value: 1 }, sat: { value: 1 }, fade: { value: 0 }, split: { value: 0 }, exposure: { value: 0 } },
  vertexShader: DOF.vertexShader,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float temp, tint, contrast, sat, fade, split, exposure; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); vec3 v = c.rgb * pow(2.0, exposure);
      v += vec3(temp * 0.08, tint * 0.06, -temp * 0.08);
      v = (v - 0.5) * contrast + 0.5;
      float l = dot(v, vec3(0.2126, 0.7152, 0.0722)); v = mix(vec3(l), v, sat);
      if (split > 0.5) { v = mix(v, v * vec3(0.85, 1.02, 1.12), clamp(1.0 - l * 1.6, 0.0, 1.0) * 0.55); v = mix(v, v * vec3(1.12, 1.0, 0.86), clamp(l * 1.6 - 0.6, 0.0, 1.0) * 0.55); }
      v = mix(v, vec3(0.5) + (v - 0.5) * 0.8 + 0.08, fade);
      gl_FragColor = vec4(clamp(v, 0.0, 1.0), c.a); }`
};
const EDGE = {
  uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, res: { value: new Vector2(1, 1) }, near: { value: 0.5 }, far: { value: 3000 }, ink: { value: new Color('#1d1d1f') }, strength: { value: 1 } },
  vertexShader: DOF.vertexShader,
  fragmentShader: `#include <packing>
    uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform vec2 res; uniform float near, far, strength; uniform vec3 ink; varying vec2 vUv;
    float z(vec2 o){ return -perspectiveDepthToViewZ(unpackRGBAToDepth(texture2D(tDepth, vUv + o / res)), near, far); }
    void main(){ float c = z(vec2(0.0)); float e = abs(z(vec2(1.0,0.0)) + z(vec2(-1.0,0.0)) + z(vec2(0.0,1.0)) + z(vec2(0.0,-1.0)) - 4.0 * c) / max(c, 1.0) * 40.0;
      vec4 col = texture2D(tDiffuse, vUv); gl_FragColor = vec4(mix(col.rgb, ink, clamp(e * strength, 0.0, 1.0)), col.a); }`
};

// ---------- Rendus stylisés (matières remplacées le temps du rendu) ----------
export const STYLES = { normal: 'Réaliste', argile: 'Argile', toon: 'Dessin animé', filaire: 'Fil de fer', croquis: 'Croquis' };
const styleCache = new WeakMap();
let toonRamp = null;
function styled(mat, style) {
  let m = styleCache.get(mat); if (!m) { m = {}; styleCache.set(mat, m); }
  if (m[style]) return m[style];
  const col = mat.color ? mat.color.clone() : new Color('#cccccc');
  if (style === 'argile') m[style] = new MeshStandardMaterial({ color: '#d9d6d0', roughness: 0.85, metalness: 0 });
  if (style === 'toon') { if (!toonRamp) { toonRamp = new DataTexture(new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]), 3, 1); toonRamp.minFilter = C.NearestFilter; toonRamp.magFilter = C.NearestFilter; toonRamp.needsUpdate = true; } m[style] = new MeshToonMaterial({ color: col, map: mat.map || null, gradientMap: toonRamp }); }
  if (style === 'filaire') m[style] = new MeshBasicMaterial({ color: col.getHSL({}).l > 0.85 ? new Color('#6a4cff') : col, wireframe: true });
  if (style === 'croquis') m[style] = new MeshBasicMaterial({ color: '#ffffff' });
  return m[style];
}
function swapStyle(three, style) {
  const swapped = [];
  if (!style || style === 'normal') return swapped;
  three.content.traverse((o) => {
    if (!o.isMesh || o.userData.editorOnly || !o.visible) return;
    swapped.push([o, o.material]);
    o.material = Array.isArray(o.material) ? o.material.map((x) => styled(x, style)) : styled(o.material, style);
  });
  return swapped;
}

// ---------- Environnements d'éclairage (HDRI générés) ----------
export const HDRIS = { defaut: 'Studio NEXORA (par défaut)', softbox: 'Studio à boîtes à lumière', exterieur: 'Extérieur, ciel clair', couchant: 'Coucher de soleil', interieur: 'Intérieur lumineux', neon: 'Nuit et néons', nuageux: 'Ciel couvert' };
function hdriCanvas(kind) {
  const W = 1024; const H = 512; const c = makeCanvas(W, H); const x = c.getContext('2d');
  const sky = (stops) => { const g = x.createLinearGradient(0, 0, 0, H); stops.forEach(([o, col]) => g.addColorStop(o, col)); x.fillStyle = g; x.fillRect(0, 0, W, H); };
  const box = (cx, cy, w, h, col, blur = 8) => { x.save(); x.filter = `blur(${blur}px)`; x.fillStyle = col; x.fillRect(cx - w / 2, cy - h / 2, w, h); x.restore(); };
  const sun = (cx, cy, r, col) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H); };
  if (kind === 'softbox') { sky([[0, '#2a2b30'], [0.5, '#16171a'], [1, '#0d0d0f']]); box(W * 0.25, H * 0.3, 120, 70, '#ffffff'); box(W * 0.75, H * 0.32, 90, 140, '#f4f6ff'); box(W * 0.5, H * 0.08, 300, 40, '#ffffff'); box(W * 0.02, H * 0.4, 30, 160, '#fff6ea'); }
  if (kind === 'exterieur') { sky([[0, '#4b8de0'], [0.45, '#bcd7f5'], [0.5, '#e9eef2'], [0.52, '#8f9a7e'], [1, '#4a5440']]); sun(W * 0.3, H * 0.18, 90, 'rgba(255,252,235,1)'); }
  if (kind === 'couchant') { sky([[0, '#1f2350'], [0.3, '#a6507a'], [0.46, '#ffb36b'], [0.5, '#ffd9a0'], [0.53, '#4a3a3c'], [1, '#1b1718']]); sun(W * 0.62, H * 0.47, 120, 'rgba(255,220,160,1)'); }
  if (kind === 'interieur') { sky([[0, '#e9e3da'], [0.5, '#d6cec2'], [1, '#8b7f72']]); for (let i = 0; i < 3; i++) box(W * (0.2 + i * 0.3), H * 0.35, 110, 150, '#ffffff', 4); }
  if (kind === 'neon') { sky([[0, '#06060c'], [1, '#0d0b14']]); box(W * 0.2, H * 0.4, 40, 200, '#ff2d78', 10); box(W * 0.55, H * 0.35, 200, 30, '#00d1ff', 10); box(W * 0.85, H * 0.45, 30, 160, '#8a5cff', 10); }
  if (kind === 'nuageux') { sky([[0, '#b9c0c9'], [0.5, '#dfe3e8'], [0.52, '#7c8079'], [1, '#55574f']]); const N = makeNoise(5); const id = x.getImageData(0, 0, W, H / 2); for (let y = 0; y < H / 2; y++) for (let xx = 0; xx < W; xx++) { const v = N.fbm(xx / 140, y / 70, 4) * 60 - 20; const i = (y * W + xx) * 4; for (let k = 0; k < 3; k++) id.data[i + k] = clamp(id.data[i + k] + v, 0, 255); } x.putImageData(id, 0, 0); }
  return c;
}
function applyHdri(three) {
  const n = three.env && three.env.nx; const kind = n && n.hdri && n.hdri.kind;
  if (!kind || kind === 'defaut') { if (three.nxEnvKind) { three.scene.environment = three.envTex; three.nxEnvKind = null; } return; }
  if (three.nxEnvKind !== kind) {
    const pm = new PMREMGenerator(three.renderer); const tex = new CanvasTexture(hdriCanvas(kind)); tex.mapping = C.Equirect; tex.colorSpace = C.SRGB;
    if (three.nxEnvTex) three.nxEnvTex.dispose();
    three.nxEnvTex = pm.fromEquirectangular(tex).texture; tex.dispose(); pm.dispose(); three.nxEnvKind = kind;
  }
  three.scene.environment = three.nxEnvTex;
  if (n.hdri.bg) { three.scene.background = three.nxEnvTex; three.scene.backgroundBlurriness = n.hdri.blur ?? 0.4; three.cyclo && (three.cyclo.visible = false); }
}

// ---------- Particules (animées par le temps de la frise : identiques dans les exports) ----------
export const PARTICLES = { poussiere: 'Poussière', etincelles: 'Étincelles', bulles: 'Bulles', neige: 'Neige', confettis: 'Confettis', etoiles: 'Étoiles' };
let dot = null;
function dotTexture() { if (dot) return dot; const c = makeCanvas(64, 64); const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); dot = new CanvasTexture(c); return dot; }
function syncParticles(S) {
  const three = S.three; const n = three.env.nx || {}; const p = n.particles;
  if (!p || !p.on) { if (three.nxPts) { three.scene.remove(three.nxPts); three.nxPts.geometry.dispose(); three.nxPts = null; } return; }
  const count = clamp(Math.round(p.count || 300), 20, 4000);
  const key = `${p.type}:${count}:${p.color}:${p.size}`;
  if (!three.nxPts || three.nxPts.userData.key !== key) {
    if (three.nxPts) { three.scene.remove(three.nxPts); three.nxPts.geometry.dispose(); }
    const N = makeNoise(11); const seeds = new Float32Array(count * 4); for (let i = 0; i < seeds.length; i++) seeds[i] = N.rnd();
    const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3)); g.setAttribute('color', new BufferAttribute(new Float32Array(count * 3), 3));
    const mat = new ShaderMaterial({ uniforms: { map: { value: dotTexture() }, size: { value: (p.size || 1) * (p.type === 'neige' ? 3.2 : p.type === 'bulles' ? 4 : 1.8) } }, vertexShader: 'attribute vec3 color; varying vec3 vC; uniform float size; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * 300.0 / max(-mv.z, 1.0); gl_Position = projectionMatrix * mv; }', fragmentShader: 'uniform sampler2D map; varying vec3 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); if (t.a < 0.02) discard; gl_FragColor = vec4(vC, t.a); }', transparent: true, depthWrite: false, blending: ['etincelles', 'etoiles'].includes(p.type) ? C.Additive : 1 });
    const pts = new Points(g, mat); pts.userData = { key, seeds, count, editorOnly: false }; pts.frustumCulled = false; pts.renderOrder = 5;
    three.nxPts = pts; three.scene.add(pts);
  }
  const pts = three.nxPts; const pos = pts.geometry.attributes.position; const col = pts.geometry.attributes.color; const sd = pts.userData.seeds; const t = S.time || 0; const sp = p.speed ?? 1;
  const box = S.contentBox ? S.contentBox() : null; const cx = box && !box.isEmpty() ? (box.min.x + box.max.x) / 2 : 0; const cz = box && !box.isEmpty() ? (box.min.z + box.max.z) / 2 : 0; const R = box && !box.isEmpty() ? Math.max(40, box.getSize(new (box.min.constructor)()).length() * 1.2) : 80;
  const base = new Color(p.color || '#ffffff'); const conf = ['#ff2d78', '#ffcc00', '#34c759', '#0a84ff', '#af52de'].map((h) => new Color(h));
  for (let i = 0; i < pts.userData.count; i++) {
    const a = sd[i * 4]; const b = sd[i * 4 + 1]; const c = sd[i * 4 + 2]; const d = sd[i * 4 + 3];
    let x = cx + (a - 0.5) * R; let z = cz + (b - 0.5) * R; let y;
    const H = R * 0.8;
    if (p.type === 'neige' || p.type === 'confettis') { y = H - ((c * H + t * sp * (6 + d * 6)) % H); x += Math.sin(t * sp + d * 6) * 2; }
    else if (p.type === 'bulles') { y = (c * H + t * sp * (4 + d * 4)) % H; x += Math.sin(t * 2 * sp + d * 9) * 1.5; }
    else if (p.type === 'etincelles') { const life = (t * sp * 0.7 + d) % 1; y = 4 + life * H * 0.5 * (0.5 + c); x = cx + (a - 0.5) * R * 0.3 * (1 + life * 2); z = cz + (b - 0.5) * R * 0.3 * (1 + life * 2); }
    else { y = c * H + Math.sin(t * sp * 0.6 + d * 6.28) * 2; x += Math.cos(t * sp * 0.3 + a * 6.28) * 2; }
    pos.setXYZ(i, x, y, z);
    const cc = p.type === 'confettis' ? conf[i % 5] : base; const k = p.type === 'etincelles' ? 1 - ((t * sp * 0.7 + d) % 1) : 0.6 + d * 0.4;
    col.setXYZ(i, cc.r * k, cc.g * k, cc.b * k);
  }
  pos.needsUpdate = true; col.needsUpdate = true;
}

// ---------- Installation sur le moteur de rendu du Studio ----------
export function installRender(S) {
  const three = S.three; const proto = Object.getPrototypeOf(three);
  if (proto.nxInstalled) return; proto.nxInstalled = true;
  const desc = Object.getOwnPropertyDescriptor(proto, 'effectsOn');
  Object.defineProperty(proto, 'effectsOn', { configurable: true, get() { return (desc && desc.get ? desc.get.call(this) : false) || on({ three: this }, 'dof') || on({ three: this }, 'grade') || (this.env && this.env.nx && this.env.nx.style && this.env.nx.style.kind === 'croquis'); } });
  const ensure = proto.ensureComposer;
  proto.ensureComposer = function () {
    const had = !!this.composer; ensure.call(this);
    if (had || this.nxDof) return;
    this.nxDof = new ShaderPass(DOF); this.nxGrade = new ShaderPass(GRADE); this.nxEdge = new ShaderPass(EDGE);
    const passes = this.composer.passes; const out = passes.indexOf(this.outputPass);
    this.composer.insertPass(this.nxDof, 1); this.composer.insertPass(this.nxEdge, 2);
    this.composer.insertPass(this.nxGrade, passes.indexOf(this.outputPass) + 1);
    void out;
    this.nxDepth = new WebGLRenderTarget(2, 2); this.nxDepthMat = new MeshDepthMaterial({ depthPacking: C.RGBADepthPacking });
  };
  const draw = proto.draw;
  proto.draw = function () {
    const n = this.env && this.env.nx || {};
    const style = n.style && n.style.kind;
    const swapped = this.nxSwapping ? [] : swapStyle(this, style);
    try {
      if (this.effectsOn) {
        this.ensureComposer();
        const r = this.renderer; const sz = r.getDrawingBufferSize(new Vector2());
        const needDepth = (n.dof && n.dof.on) || style === 'croquis';
        this.nxDof.enabled = !!(n.dof && n.dof.on); this.nxEdge.enabled = style === 'croquis'; this.nxGrade.enabled = !!(n.grade && n.grade.on);
        if (needDepth) {
          if (this.nxDepth.width !== sz.x || this.nxDepth.height !== sz.y) this.nxDepth.setSize(sz.x, sz.y);
          const bg = this.scene.background; const ov = this.scene.overrideMaterial; const cc = r.getClearColor(new Color()); const ca = r.getClearAlpha();
          const hidden = []; if (this.nxPts) { hidden.push(this.nxPts); this.nxPts.visible = false; }
          this.scene.background = null; this.scene.overrideMaterial = this.nxDepthMat; r.setClearColor(0xffffff, 1);
          r.setRenderTarget(this.nxDepth); r.clear(); r.render(this.scene, this.camera); r.setRenderTarget(null);
          this.scene.background = bg; this.scene.overrideMaterial = ov; r.setClearColor(cc, ca); for (const h of hidden) h.visible = true;
          for (const p of [this.nxDof, this.nxEdge]) { p.uniforms.tDepth.value = this.nxDepth.texture; p.uniforms.near.value = this.camera.near; p.uniforms.far.value = this.camera.far; }
          this.nxEdge.uniforms.res.value.set(sz.x, sz.y);
        }
        if (n.dof && n.dof.on) {
          const u = this.nxDof.uniforms; u.aperture.value = n.dof.aperture ?? 0.6; u.maxBlur.value = (n.dof.blur ?? 0.6) * 0.02; u.aspect.value = sz.x / Math.max(1, sz.y);
          u.focus.value = n.dof.auto !== false && this.nxFocus ? this.nxFocus() : (n.dof.focus ?? 60);
        }
        if (n.grade && n.grade.on) {
          const g = n.grade; const pre = (GRADES[g.preset] || GRADES.aucun)[1]; const u = this.nxGrade.uniforms;
          u.temp.value = pre[0] + (g.temp || 0); u.tint.value = pre[1] + (g.tint || 0); u.contrast.value = pre[2] * (g.contrast ?? 1); u.sat.value = pre[3] * (g.sat ?? 1); u.fade.value = pre[4] + (g.fade || 0); u.split.value = pre[5]; u.exposure.value = g.exposure || 0;
        }
      }
      return draw.call(this);
    } finally { for (const [o, m] of swapped) o.material = m; }
  };
  // Rendus d’export (opaques et transparents) : même style que l’aperçu.
  for (const name of ['renderOnce', 'renderFinal']) {
    const orig = proto[name]; if (!orig) continue;
    proto[name] = function (...args) {
      if (this.nxSwapping) return orig.apply(this, args);
      const n = this.env && this.env.nx || {}; const swapped = swapStyle(this, n.style && n.style.kind); this.nxSwapping = true;
      const done = () => { this.nxSwapping = false; for (const [o, m] of swapped) o.material = m; };
      let res; try { res = orig.apply(this, args); } catch (e) { done(); throw e; }
      if (res && typeof res.then === 'function') return res.finally(done);
      done(); return res;
    };
  }
  const applyEnv = proto.applyEnv;
  proto.applyEnv = function (o, img) { applyEnv.call(this, o, img); try { applyHdri(this); } catch (e) { console.warn('[NEXORA #011] HDRI', e); } };
  // Les particules suivent le temps de la frise.
  const sproto = Object.getPrototypeOf(S);
  if (!sproto.nxApplyTime) { sproto.nxApplyTime = sproto.applyTime; sproto.applyTime = function () { sproto.nxApplyTime.call(this); try { syncParticles(this); } catch (e) { console.warn(e); } }; }
  three.nxFocus = () => { const sel = S.sel && S.objects.get(S.sel); const target = sel ? sel.model.root.getWorldPosition(new (S.three.camera.position.constructor)()) : S.controls.target; return S.three.camera.position.distanceTo(target); };
  applyHdri(three); syncParticles(S); if (settings.nxStudioQuality) applyQuality(S);
}
// Réapplique l’environnement d’origine (fond, cyclorama) puis l’HDRI choisi : revenir à « par défaut » rétablit le fond.
export function refresh(S) { S.three.applyEnv(S.three.env, S.bgImageEl); syncParticles(S); S.dirty = true; }

// ---------- Qualité d'aperçu ----------
export const QUALITY = { brouillon: 'Brouillon (rapide)', normal: 'Normale', fine: 'Fine (écran haute définition)' };
export const qualityName = () => settings.nxStudioQuality || 'normal';
export function applyQuality(S) {
  const q = settings.nxStudioQuality || 'normal'; const r = S.three.renderer; const dpr = window.devicePixelRatio || 1;
  r.setPixelRatio(q === 'brouillon' ? 0.6 : q === 'fine' ? Math.min(3, dpr * 1.5) : Math.min(2, dpr));
  r.shadowMap.autoUpdate = q !== 'brouillon'; r.shadowMap.needsUpdate = true;
  S.resize && S.resize(); S.dirty = true;
}
export function setQuality(S, q) { settings.nxStudioQuality = q; saveSettings(); applyQuality(S); toast(`Qualité d’aperçu : ${QUALITY[q]}. Les exports gardent leur propre qualité.`); }

// ---------- Couches de rendu (pour la retouche) ----------
async function renderWith(S, w, h, fn, transparent = false) {
  const three = S.three; const restore = fn(three) || (() => {});
  try { return three.renderOnce(w, h, { transparent }); } finally { restore(); }
}
const override = (mat) => (three) => { const ov = three.scene.overrideMaterial; three.scene.overrideMaterial = mat; return () => { three.scene.overrideMaterial = ov; }; };
export async function exportPasses(S, { toDesign = false } = {}) {
  const { w, h } = S.exportSize('1080'); const t = busy('Rendu des couches…');
  try {
    S.editorVisible && S.editorVisible(false); await sleep(30);
    const beauty = await renderWith(S, w, h, () => null);
    const alpha = await renderWith(S, w, h, () => null, true);
    const mask = makeCanvas(w, h); { const x = mask.getContext('2d'); x.drawImage(alpha, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'destination-over'; x.fillStyle = '#000000'; x.fillRect(0, 0, w, h); }
    const depth = await renderWith(S, w, h, (three) => { const bg = three.scene.background; three.scene.background = new Color('#000000'); const r = override(new MeshDepthMaterial())(three); return () => { r(); three.scene.background = bg; }; });
    const normal = await renderWith(S, w, h, (three) => { const bg = three.scene.background; three.scene.background = new Color('#8080ff'); const r = override(new MeshNormalMaterial())(three); return () => { r(); three.scene.background = bg; }; });
    const shadow = await renderWith(S, w, h, (three) => { const hidden = []; three.content.traverse((o) => { if (o.isMesh && !o.userData.editorOnly) { hidden.push([o, o.material]); o.material = new MeshBasicMaterial({ colorWrite: false, depthWrite: true }); } }); const sf = three.shadowFloor.visible; three.shadowFloor.visible = true; return () => { for (const [o, m] of hidden) o.material = m; three.shadowFloor.visible = sf; }; }, true);
    S.editorVisible && S.editorVisible(true); S.dirty = true;
    const layers = [['Rendu', beauty], ['Silhouette (masque)', mask], ['Profondeur', depth], ['Normales', normal], ['Ombres seules', shadow], ['Objets sur fond transparent', alpha]];
    if (toDesign) { await openInDesign(layers, w, h); return; }
    const files = []; for (const [i, [n, c]] of layers.entries()) files.push({ name: `${i + 1} ${n}.png`, data: await canvasBytes(c) });
    await saveBytes(zip(files), { name: `Studio couches ${safeName(S.sceneName())}`, ext: 'zip', project: state.source ? state.source.name : 'Studio' });
  } catch (e) { console.error(e); toast(`Les couches n’ont pas pu être rendues : ${e.message || e}`, { kind: 'bad' }); } finally { S.editorVisible && S.editorVisible(true); t.close(); }
}
// Nouveau document NEX-DESIGN avec une image par couche (calques masqués sauf le rendu).
async function openInDesign(layers, w, h) {
  const mod = await import('../../dist/chunks/chunk-SKL2UTC7.js');
  // Nom libre (#005) : « Couches du Studio », puis « (2) », « (3) »…
  const taken = new Set(((await mod.d()) || []).map((d) => String(d.name).toLowerCase()));
  let name = 'Couches du Studio'; for (let k = 2; taken.has(name.toLowerCase()); k++) name = `Couches du Studio (${k})`;
  const doc = mod.c(name, 'hd');
  const pg = doc.pages[0]; pg.w = w; pg.h = h; pg.name = 'Couches';
  pg.json = { version: '6', objects: layers.map(([n, c], i) => ({ type: 'Image', version: '6', left: 0, top: 0, width: w, height: h, scaleX: 1, scaleY: 1, src: c.toDataURL('image/png'), crossOrigin: null, id: `nx${i}${Date.now().toString(36)}`, name: n, visible: i === 0, globalCompositeOperation: i === 4 ? 'multiply' : 'source-over', opacity: 1, originX: 'left', originY: 'top', filters: [] })).reverse() };
  await mod.f(doc);
  settings.designDoc = doc.id; saveSettings();
  const { a: st } = await import('../../dist/chunks/chunk-XJMNRA7U.js');
  if (st.design) await st.design.openDoc(doc);
  toast('Couches ouvertes dans NEX-DESIGN : un calque par couche (seul le rendu est visible).', { action: 'Ouvrir NEX-DESIGN', onAction: async () => { const { setMode } = await import('../../dist/chunks/toolbar-LJFELS7F.js'); setMode('design'); } });
}

// ---------- Exports image par image : GIF et vidéo à fond transparent ----------
export async function exportFrames(S, { kind = 'gif', size = '720' }) {
  const gif = kind === 'gif'; const fps = gif ? 15 : S.anim.fps; const n = Math.max(1, Math.round(S.anim.duration * fps));
  let { w, h } = S.exportSize(size); if (gif) { const k = Math.min(1, 720 / Math.max(w, h)); w = Math.round(w * k / 2) * 2; h = Math.round(h * k / 2) * 2; }
  const out = makeCanvas(w, h); const x = out.getContext('2d', { willReadFrequently: gif });
  const t = busy(gif ? 'Rendu du GIF…' : 'Rendu de la vidéo transparente…'); const frames = []; let enc = null; let src = null; const keep = S.time;
  try {
    if (!gif) {
      const o = await import('../../dist/chunks/encoder-HG7L4JDQ.js');
      if (!(await o.canEncodeVideo('vp9', { width: w, height: h }))) throw new Error('Ce PC ne sait pas encoder de vidéo VP9 à cette taille.');
      enc = new o.Output({ format: new o.WebMOutputFormat(), target: new o.BufferTarget() });
      src = new o.CanvasSource(out, { codec: 'vp9', quality: o.QUALITY_VERY_HIGH, keyFrameInterval: 2, alpha: 'keep' });
      enc.addVideoTrack(src, { frameRate: fps }); await enc.start();
    }
    S.playing && S.togglePlay(); S.exporting = true; S.editorVisible && S.editorVisible(false);
    for (let i = 0; i < n; i++) {
      S.time = i / fps; S.applyTime(); const pr = S.applyClips && S.applyClips({ exact: true }); if (pr) await pr;
      const fr = S.three.renderOnce(w, h, { transparent: !gif });
      x.clearRect(0, 0, w, h); x.drawImage(fr, 0, 0); S.paintOverlay(out, i / fps, false);
      if (gif) frames.push(x.getImageData(0, 0, w, h)); else await src.add(i / fps, 1 / fps);
      if (i % 4 === 0) { t.update && t.update(`${gif ? 'GIF' : 'Vidéo transparente'} : ${Math.round((i + 1) / n * 100)} %`); await sleep(0); }
    }
    let bytes; let ext;
    if (gif) { t.update && t.update('Compression du GIF…'); await sleep(20); bytes = encodeGif(frames, { delay: Math.round(1000 / fps) }); ext = 'gif'; } else { src.close(); await enc.finalize(); bytes = new Uint8Array(enc.target.buffer); ext = 'webm'; }
    await saveBytes(bytes, { name: `${S.exportName()}${gif ? '' : ' (fond transparent)'}`, ext, kind: gif ? 'photo' : 'video', project: state.source ? state.source.name : 'Studio' });
  } catch (e) { console.error(e); toast(`L’export a échoué : ${e.message || e}`, { kind: 'bad' }); if (enc) { try { await enc.cancel(); } catch { /* */ } } } finally {
    S.exporting = false; S.editorVisible && S.editorVisible(true); t.close(); S.setTime(keep); S.dirty = true; S.raf || S.loop();
  }
}

// ---------- Déclinaison d'une vidéo dans d'autres formats (sujet toujours cadré) ----------
export const REFRAMES = { '16:9': 'Paysage 16:9', '9:16': 'Story 9:16', '1:1': 'Carré 1:1', '4:5': 'Portrait 4:5' };
export async function reframeExport(S, formats) {
  const env0 = { ...S.three.env }; const cam = S.three.camera; const fov0 = cam.fov; const aspect0 = S.three.size.w / Math.max(1, S.three.size.h);
  const cur = env0.aspect && env0.aspect !== 'free' ? env0.aspect.split(':').map(Number) : null; const a0 = cur ? cur[0] / cur[1] : aspect0;
  const track = S.anim.tracks.camera ? JSON.parse(JSON.stringify(S.anim.tracks.camera)) : null;
  const fit = (fov, a1) => { const hf = 2 * Math.atan(Math.tan((fov * Math.PI / 180) / 2) * a0); const v = a1 < a0 ? 2 * Math.atan(Math.tan(hf / 2) / a1) * 180 / Math.PI : fov; return clamp(v, 8, 110); };
  try {
    for (const f of formats) {
      const [a, b] = f.split(':').map(Number); const a1 = a / b;
      S.three.applyEnv({ ...env0, aspect: f }, S.bgImageEl); S.resize();
      cam.fov = fit(fov0, a1); cam.updateProjectionMatrix();
      if (track) S.anim.tracks.camera = track.map((k) => ({ ...k, v: { ...k.v, fov: fit(k.v.fov || fov0, a1) } }));
      toast(`Format ${REFRAMES[f]} : rendu en cours…`);
      await S.exportVideo(S.exportSettings());
    }
  } finally {
    if (track) S.anim.tracks.camera = track; S.three.applyEnv(env0, S.bgImageEl); cam.fov = fov0; cam.updateProjectionMatrix(); S.resize(); S.applyTime();
  }
}
export { hexRgb };
