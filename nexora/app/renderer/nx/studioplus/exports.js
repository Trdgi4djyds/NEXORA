// NEXORA #055 : exports du Studio : angles produit en PNG transparent (rendu accumulé), images de la fiche Play
// Store, pack web (page interactive, page au défilement, Web Component, composant React, GLB), pack de réalité
// augmentée (USDZ pour iPhone, GLB pour Android, page et code QR) et animation Lottie à images.
import * as THREE from '../../dist/chunks/three-D5YSJNBV.js';
import { GLTFExporter } from '../studio/three.js';
import * as W from '../studio/web.js';
import { buildUsdz, buildLottie } from './formats.js';
import { toast, busy, done, saveBytes, zip, dataUrlBytes, prompt, safeName, sleep, contentBox, rendering, frameAt, projectName, allowed } from './ui.js';

const enc = new TextEncoder();
const canvasBytes = (c, type = 'image/png', q) => dataUrlBytes(c.toDataURL(type, q));
const sceneSlug = (S) => safeName(S.sceneName ? S.sceneName() : 'scene').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scene';

// ---------- Angles produit ----------
export const ANGLES = [['face', 'Face', 0, 8], ['g34', 'Trois-quarts gauche', -35, 12], ['d34', 'Trois-quarts droite', 35, 12], ['profil', 'Profil', 90, 6], ['dos', 'Dos', 180, 8], ['dessus', 'Dessus', 20, 62]];
function aim(S, yaw, pitch) {
  const b = contentBox(S); const c = b.getCenter(new THREE.Vector3()); const size = b.getSize(new THREE.Vector3());
  const cam = S.three.camera; const fov = cam.fov * Math.PI / 180;
  const dist = (Math.max(size.x, size.y, size.z) * 0.62) / Math.tan(fov / 2) + Math.max(size.x, size.z) * 0.5;
  const y = yaw * Math.PI / 180; const p = pitch * Math.PI / 180;
  cam.position.set(c.x + Math.sin(y) * Math.cos(p) * dist, c.y + Math.sin(p) * dist, c.z + Math.cos(y) * Math.cos(p) * dist);
  S.controls.target.copy(c); cam.lookAt(c); cam.updateProjectionMatrix();
}
export async function batchAngles(S, { transparent = true, size = 2048 } = {}) {
  if (!allowed('Le rendu par lots')) return;
  const t = busy('Rendu des angles produit…');
  try {
    const files = await rendering(S, async () => {
      const out = [];
      for (const [key, label, yaw, pitch] of ANGLES) {
        t.update && t.update(`Angle « ${label} » (${out.length + 1} / ${ANGLES.length})…`);
        aim(S, yaw, pitch); await sleep(30);
        const c = await S.three.renderFinal(size, size, { transparent, samples: 12, hiShadows: true });
        out.push({ name: `${sceneSlug(S)}-${key}.png`, data: canvasBytes(c) });
      }
      return out;
    });
    await saveBytes(zip(files), { name: `${S.exportName ? S.exportName() : 'Studio'} (angles produit)`, ext: 'zip', kind: 'photo', project: projectName() });
    toast(`${files.length} angles enregistrés en PNG ${transparent ? 'à fond transparent ' : ''}(${size} × ${size}).`);
  } catch (e) { toast(`Le rendu des angles a échoué : ${e.message || e}`, { kind: 'bad' }); } finally { done(t); }
}

// ---------- Fiche Play Store : 4 captures portrait et la bannière 1024 × 500 ----------
export async function playStore(S) {
  const t = busy('Images de la fiche Play Store…');
  try {
    const files = await rendering(S, async () => {
      const out = []; const D = S.anim.duration || 5;
      for (const [i, k] of [0.15, 0.4, 0.65, 0.9].entries()) { await frameAt(S, D * k); out.push({ name: `capture-${i + 1}-1080x1920.png`, data: canvasBytes(await S.three.renderFinal(1080, 1920, { samples: 4 })) }); }
      await frameAt(S, D * 0.5); out.push({ name: 'banniere-1024x500.png', data: canvasBytes(await S.three.renderFinal(1024, 500, { samples: 4 })) });
      return out;
    });
    await saveBytes(zip(files), { name: `${S.exportName ? S.exportName() : 'Studio'} (fiche Play Store)`, ext: 'zip', kind: 'photo', project: projectName() });
    toast('4 captures 1080 × 1920 et la bannière 1024 × 500 enregistrées : ajoutez-les dans App Builder → Fiche Play Store.');
  } catch (e) { toast(`Les images n’ont pas pu être créées : ${e.message || e}`, { kind: 'bad' }); } finally { done(t); }
}

// ---------- Pack web : page interactive, page au défilement, Web Component, React, GLB ----------
async function glbOf(S, maxTextureSize = 2048) {
  if (S.editorVisible) S.editorVisible(false);
  try { return new Uint8Array(await new GLTFExporter().parseAsync(S.three.content, { binary: true, onlyVisible: true, maxTextureSize })); } finally { if (S.editorVisible) S.editorVisible(true); }
}
const COMPONENT = `// Web Component exporté par NEXORA : <nexora-scene src="scene.html" height="520"></nexora-scene>
class NexoraScene extends HTMLElement {
  static get observedAttributes() { return ['src', 'height']; }
  connectedCallback() { this.render(); }
  attributeChangedCallback() { this.render(); }
  render() {
    const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
    const src = this.getAttribute('src') || 'scene.html'; const h = this.getAttribute('height') || '520';
    root.innerHTML = '<style>:host{display:block}iframe{width:100%;border:0;display:block}</style>';
    const f = document.createElement('iframe'); f.src = src; f.title = this.getAttribute('title') || 'Scène 3D'; f.loading = 'lazy'; f.style.height = /^\\d+$/.test(h) ? h + 'px' : h;
    root.append(f);
  }
}
if (!customElements.get('nexora-scene')) customElements.define('nexora-scene', NexoraScene);
`;
const REACT = `// Composant React exporté par NEXORA : <NexoraScene src="/scene.html" height={520} />
export default function NexoraScene({ src = '/scene.html', height = 520, title = 'Scène 3D' }) {
  return <iframe src={src} title={title} loading="lazy" style={{ width: '100%', height, border: 0, display: 'block' }} />;
}
`;
export async function webPack(S) {
  if (!allowed('Le pack web interactif')) return;
  const t = busy('Préparation du pack web…');
  try {
    const title = projectName() === 'Studio' ? 'Scène 3D NEXORA' : `${projectName()} en 3D`;
    const files = [
      { name: 'scene.html', data: await W.buildHtml(S, title, { maxTexture: 1024 }) },
      { name: 'scene-defilement.html', data: await W.buildHtml(S, title, { scroll: true, glbUrl: 'scene.glb' }) },
      { name: 'scene.glb', data: await glbOf(S, 1024) },
      { name: 'nexora-scene.js', data: COMPONENT },
      { name: 'NexoraScene.jsx', data: REACT },
      { name: 'LISEZ-MOI.txt', data: `Scène 3D exportée par NEXORA.\n\n- scene.html : la scène interactive (souriez, animation, interactions), autonome.\n- scene-defilement.html : la même scène dont l'animation suit le défilement de la page ; elle charge scene.glb, posé à côté (à publier sur un site : un navigateur ne lit pas un fichier voisin ouvert d'un double-clic).\n- nexora-scene.js : balise <nexora-scene src="scene.html" height="520"></nexora-scene> (ajoute <script type="module" src="nexora-scene.js"></script>).\n- NexoraScene.jsx : composant React (<NexoraScene src="/scene.html" height={520} />).\n- scene.glb : le modèle 3D seul (Blender, three.js, Spline…).\n\nLes pages chargent three.js depuis un CDN public (jsDelivr) : une connexion Internet est nécessaire à l'affichage.\nQuand le système demande moins d'animations, la scène reste immobile.\n` },
    ];
    await saveBytes(zip(files), { name: `${title} (pack web)`, ext: 'zip', kind: 'photo', project: projectName() });
    toast('Pack web enregistré : page interactive, page au défilement, Web Component, composant React et modèle GLB.');
  } catch (e) { toast(`Le pack web n’a pas pu être créé : ${e.message || e}`, { kind: 'bad' }); } finally { done(t); }
}

// ---------- Réalité augmentée ----------
export function usdMeshes(S) {
  const meshes = []; const textures = []; const seen = new Map();
  const nm = new THREE.Matrix3(); const v = new THREE.Vector3();
  S.three.content.updateMatrixWorld(true);
  S.three.content.traverse((o) => {
    if (!o.isMesh || !o.visible || !o.geometry || !o.geometry.attributes.position) return;
    let vis = true; for (let p = o.parent; p; p = p.parent) if (p.visible === false) vis = false; if (!vis) return;
    const g = o.geometry; const pos = g.attributes.position; const nor = g.attributes.normal; const uv = g.attributes.uv;
    const n = pos.count; if (n > 300000) return;
    const pts = new Float32Array(n * 3); const nrm = nor ? new Float32Array(n * 3) : null; nm.getNormalMatrix(o.matrixWorld);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).multiplyScalar(0.01); pts.set([v.x, v.y, v.z], i * 3);
      if (nrm) { v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); nrm.set([v.x, v.y, v.z], i * 3); }
    }
    const uvs = uv ? new Float32Array(n * 2) : null; if (uvs) for (let i = 0; i < n; i++) { uvs[i * 2] = uv.getX(i); uvs[i * 2 + 1] = uv.getY(i); }
    const m = Array.isArray(o.material) ? o.material[0] : o.material; const col = m && m.color ? [m.color.r, m.color.g, m.color.b] : [0.8, 0.8, 0.8];
    let texture = null;
    const img = m && m.map && m.map.image;
    if (img && uvs && (img.width || img.videoWidth)) {
      if (!seen.has(img)) {
        const w0 = img.width || img.videoWidth; const h0 = img.height || img.videoHeight; const k = Math.min(1, 1024 / Math.max(w0, h0));
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
        try { c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); const name = `textures/t${textures.length}.png`; textures.push({ name, data: canvasBytes(c) }); seen.set(img, name); } catch { seen.set(img, null); }
      }
      texture = seen.get(img);
    }
    if (texture && m.map && m.map.flipY === false) for (let i = 0; i < n; i++) uvs[i * 2 + 1] = 1 - uvs[i * 2 + 1];
    meshes.push({ name: o.name || 'objet', points: pts, normals: nrm, uvs: texture ? uvs : null, indices: g.index ? new Uint32Array(g.index.array) : null, color: texture ? [1, 1, 1] : col, opacity: m && m.transparent ? m.opacity : 1, roughness: m && m.roughness != null ? m.roughness : 0.5, metallic: m && m.metalness != null ? m.metalness : 0, texture });
  });
  return { meshes, textures };
}
export async function arPack(S) {
  if (!allowed('Le pack de réalité augmentée')) return;
  const base = await prompt('Pack de réalité augmentée', { label: 'Adresse où vous publierez ces fichiers (facultatif, pour le code QR et Android) : https://…', value: '', icon: 'cube', go: 'Créer le pack' });
  if (base === null || base === undefined) return;
  const url = /^https:\/\//i.test(String(base).trim()) ? String(base).trim().replace(/\/?$/, '/') : '';
  const t = busy('Préparation de la réalité augmentée…');
  try {
    if (S.editorVisible) S.editorVisible(false);
    let usdz; let preview;
    try { const { meshes, textures } = usdMeshes(S); if (!meshes.length) throw new Error('Aucun objet visible à exporter.'); usdz = buildUsdz(meshes, textures); } finally { if (S.editorVisible) S.editorVisible(true); }
    const glb = await glbOf(S);
    await rendering(S, async () => { preview = canvasBytes(await S.three.renderFinal(800, 800, { samples: 4 }), 'image/jpeg', 0.88); });
    const android = url ? `intent://arvr.google.com/scene-viewer/1.2?file=${encodeURIComponent(`${url}scene.glb`)}&mode=ar_preferred#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;S.browser_fallback_url=${encodeURIComponent(`${url}scene.glb`)};end;` : '';
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Voir en réalité augmentée</title>
<style>body{margin:0;font-family:system-ui,sans-serif;background:#f5f5f7;color:#14151a;display:grid;place-items:center;min-height:100vh}main{max-width:420px;padding:24px;text-align:center}img{width:100%;border-radius:16px;background:#fff}a.btn{display:block;margin-top:12px;padding:14px;border-radius:12px;background:#14151a;color:#fff;text-decoration:none;font-weight:600}small{color:#5b5d66}</style></head>
<body><main><h1>Voir chez vous en 3D</h1><a rel="ar" href="scene.usdz"><img src="apercu.jpg" alt="Aperçu de l’objet"></a>
<a class="btn" rel="ar" href="scene.usdz">iPhone et iPad</a>${android ? `<a class="btn" href="${android}">Android</a>` : ''}
<p><small>Sur iPhone et iPad, l’objet s’ouvre dans Quick Look. ${android ? 'Sur Android, il s’ouvre dans Scene Viewer.' : 'Pour Android, publiez ces fichiers puis indiquez leur adresse lors de l’export.'}</small></p></main></body></html>`;
    const files = [{ name: 'scene.usdz', data: usdz }, { name: 'scene.glb', data: glb }, { name: 'apercu.jpg', data: preview }, { name: 'index.html', data: html }];
    if (url) {
      const q = await import('../../dist/chunks/qrcode-CLK456NR.js'); const qr = (q.default || q)(0, 'M'); qr.addData(`${url}index.html`); qr.make();
      const n = qr.getModuleCount(); const s = 12; const c = document.createElement('canvas'); c.width = c.height = (n + 8) * s; const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#14151a';
      for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) x.fillRect((k + 4) * s, (r + 4) * s, s, s);
      files.push({ name: 'code-qr.png', data: canvasBytes(c) });
    }
    await saveBytes(zip(files), { name: `${S.exportName ? S.exportName() : 'Studio'} (réalité augmentée)`, ext: 'zip', kind: 'photo', project: projectName() });
    toast(url ? 'Pack de réalité augmentée enregistré, avec le code QR à imprimer ou à partager.' : 'Pack de réalité augmentée enregistré (iPhone et iPad). Indiquez une adresse de publication pour Android et le code QR.');
  } catch (e) { toast(`Le pack de réalité augmentée n’a pas pu être créé : ${e.message || e}`, { kind: 'bad' }); } finally { done(t); }
}

// ---------- Lottie à images ----------
export async function lottie(S, { fps = 12, size = 480 } = {}) {
  if (!allowed('L’export Lottie')) return;
  const t = busy('Rendu de l’animation Lottie…');
  try {
    const { w: W0, h: H0 } = S.exportSize ? S.exportSize('720') : { w: 720, h: 720 };
    const k = size / Math.max(W0, H0); const w = Math.round(W0 * k / 2) * 2; const h = Math.round(H0 * k / 2) * 2;
    const n = Math.min(Math.round(Math.min(S.anim.duration, 12) * fps), 144);
    const frames = await rendering(S, async () => {
      const out = [];
      for (let i = 0; i < n; i++) {
        await frameAt(S, i / fps);
        const fr = S.three.renderOnce(w, h, {}); const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(fr, 0, 0); S.paintOverlay(c, i / fps, false);
        out.push(c.toDataURL('image/jpeg', 0.82));
        if (i % 6 === 0) { t.update && t.update(`Lottie : ${Math.round((i + 1) / n * 100)} %`); await sleep(0); }
      }
      return out;
    });
    const json = JSON.stringify(buildLottie({ w, h, fps, frames, name: S.sceneName ? S.sceneName() : 'NEXORA' }));
    await saveBytes(enc.encode(json), { name: `${S.exportName ? S.exportName() : 'Studio'} (Lottie)`, ext: 'json', kind: 'video', project: projectName() });
    toast(`Animation Lottie enregistrée : ${n} images de ${w} × ${h}, ${(json.length / 1048576).toFixed(1).replace('.', ',')} Mo.`);
  } catch (e) { toast(`L’export Lottie a échoué : ${e.message || e}`, { kind: 'bad' }); } finally { done(t); }
}
