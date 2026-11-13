// NEXORA #118 : contour de sélection du Studio, orange comme dans les modeleurs 3D : la silhouette des objets
// sélectionnés est rendue dans un masque (calque 30), puis son bord est tracé par-dessus la vue d'édition.
// Aide d'édition seulement : jamais dans les rendus, les vidéos ni les exports (afterViewRender ne sert qu'à la vue).
import * as THREE from '../../dist/chunks/three-D5YSJNBV.js';

const T = THREE;
const LAYER = 30;
// Orange #ff7a1a, passé tel quel au shader (sans conversion de couleur du moteur, sinon il paraît rouge).
export const COLOR = [1, 0.478, 0.102];
let K = null;

function kit() {
  if (K) return K;
  const rt = new T.WebGLRenderTarget(2, 2);
  const mask = new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide });
  const mat = new T.ShaderMaterial({
    uniforms: { tMask: { value: rt.texture }, texel: { value: new T.Vector2(1, 1) }, color: { value: new T.Vector3(...COLOR) }, width: { value: 2.5 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tMask; uniform vec2 texel; uniform vec3 color; uniform float width; varying vec2 vUv;
      void main() {
        float c = texture2D(tMask, vUv).r;
        float m = 0.0;
        for (int i = 0; i < 16; i++) { float a = float(i) * 0.39269908; m = max(m, texture2D(tMask, vUv + vec2(cos(a), sin(a)) * texel * width).r); }
        float edge = clamp(m - c, 0.0, 1.0);
        if (edge < 0.01) discard;
        gl_FragColor = vec4(color, edge);
      }`,
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  });
  const quad = new T.Mesh(new T.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
  const scene = new T.Scene(); scene.add(quad);
  K = { rt, mask, mat, scene, cam: new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), size: new T.Vector2(), clear: new T.Color() };
  return K;
}

function rootsOf(S) {
  const ids = (S.selection ? S.selection() : [S.sel]).filter((id) => id && id !== 'camera');
  return ids.map((id) => S.objects.get(id)).filter((e) => e && e.model && !e.item.hidden && e.item.kind !== 'lumiere').map((e) => e.model.root || e.model.group).filter(Boolean);
}

export function draw(S, on = true) {
  if (!on || S.exporting || S.space === 'mockup') return;
  const roots = rootsOf(S); if (!roots.length) return;
  const r = S.three.renderer; const scene = S.three.scene; const cam = S.three.camera; const k = kit();
  const marked = [];
  for (const root of roots) root.traverse((o) => { if (o.isMesh && o.visible && !o.userData.editorOnly) { o.layers.enable(LAYER); marked.push(o); } });
  if (!marked.length) return;
  r.getDrawingBufferSize(k.size);
  if (k.rt.width !== k.size.x || k.rt.height !== k.size.y) k.rt.setSize(k.size.x, k.size.y);
  const prev = { bg: scene.background, fog: scene.fog, ov: scene.overrideMaterial, mask: cam.layers.mask, target: r.getRenderTarget(), alpha: r.getClearAlpha(), auto: r.autoClear, shadows: r.shadowMap.autoUpdate };
  r.getClearColor(k.clear);
  try {
    scene.background = null; scene.fog = null; scene.overrideMaterial = k.mask; cam.layers.set(LAYER); r.shadowMap.autoUpdate = false;
    r.setRenderTarget(k.rt); r.setClearColor(0x000000, 0); r.clear(true, true, false); r.render(scene, cam);
  } finally {
    scene.background = prev.bg; scene.fog = prev.fog; scene.overrideMaterial = prev.ov; cam.layers.mask = prev.mask; r.shadowMap.autoUpdate = prev.shadows;
    r.setRenderTarget(prev.target); r.setClearColor(k.clear, prev.alpha);
    for (const o of marked) o.layers.disable(LAYER);
  }
  k.mat.uniforms.texel.value.set(1 / k.size.x, 1 / k.size.y);
  k.mat.uniforms.width.value = 2 * Math.max(1, r.getPixelRatio());
  r.autoClear = false;
  try { r.render(k.scene, k.cam); } finally { r.autoClear = prev.auto; }
}
