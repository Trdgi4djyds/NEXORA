// NEXORA #011 : interactions (survol, clic, défilement), export web autonome, mises en scène enregistrées, coédition.
import { Raycaster, Vector2, GLTFExporter, WEB_THREE } from './three.js';
import { settings, saveSettings, toast, busy, esc, uid, api, saveBytes, bytesB64, safeName, prompt, state, clamp } from '../core.js';
import { CollabRoom, collabSheet } from '../services.js';
import { nxEase as EASES } from '../../dist/chunks/chunk-2DYF2ZBK.js';

export const HOVERS = { none: 'Aucune', lift: 'Se soulève', grow: 'Grossit', spin: 'Pivote', tilt: 'S’incline' };
export const CLICKS = { none: 'Aucune', spin: 'Fait un tour', bounce: 'Rebondit', play: 'Lance l’animation', link: 'Ouvre un lien' };

// ---------- Mode « Tester les interactions » ----------
export function toggleTest(S) {
  if (S.nxTest) { S.nxTest.stop(); S.nxTest = null; toast('Test des interactions terminé.'); S.renderProps(); return; }
  const cv = S.$.canvas; const ray = new Raycaster(); const st = new Map(); let hover = null; let raf = 0;
  const hit = (e) => {
    const r = cv.getBoundingClientRect(); ray.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), S.three.camera);
    for (const h of ray.intersectObjects(S.three.content.children, true)) { let o = h.object; while (o && !o.userData.objId) o = o.parent; if (o) return o.userData.objId; }
    return null;
  };
  const move = (e) => { hover = hit(e); cv.style.cursor = hover && S.objects.get(hover) && S.objects.get(hover).item.nxInteract && S.objects.get(hover).item.nxInteract.click && S.objects.get(hover).item.nxInteract.click !== 'none' ? 'pointer' : ''; };
  const click = (e) => {
    const id = hit(e); const it = id && S.objects.get(id) && S.objects.get(id).item.nxInteract; if (!it || !it.click || it.click === 'none') return;
    e.stopPropagation();
    if (it.click === 'play') { S.toStart(); if (!S.playing) S.togglePlay(); return; }
    if (it.click === 'link') { if (it.url) api.invoke('shell:external', it.url); return; }
    const s = st.get(id) || {}; s.click = it.click; s.t0 = performance.now(); st.set(id, s);
  };
  const wheel = (e) => { if (!S.order.some((id) => (S.objects.get(id).item.nxInteract || {}).scroll)) return; e.preventDefault(); S.setTime(clamp(S.time + e.deltaY * 0.002 * S.anim.duration, 0, S.anim.duration)); };
  const tick = () => {
    raf = requestAnimationFrame(tick);
    for (const id of S.order) {
      const e = S.objects.get(id); const it = e.item.nxInteract; if (!it) continue;
      const s = st.get(id) || { h: 0 }; s.h += ((hover === id ? 1 : 0) - s.h) * 0.18; st.set(id, s);
      S.applyItemTransform(e); const root = e.model.root;
      if (it.hover === 'lift') root.position.y += s.h * 2.5;
      if (it.hover === 'grow') root.scale.multiplyScalar(1 + s.h * 0.12);
      if (it.hover === 'spin') root.rotation.y += s.h * 0.6;
      if (it.hover === 'tilt') { root.rotation.x -= s.h * 0.18; root.rotation.z += s.h * 0.08; }
      if (s.click) { const k = clamp((performance.now() - s.t0) / 800, 0, 1); const ease = 1 - (1 - k) ** 3; if (s.click === 'spin') root.rotation.y += ease * Math.PI * 2; if (s.click === 'bounce') root.position.y += Math.sin(k * Math.PI) * 6 * (1 - k * 0.3); if (k >= 1) s.click = null; }
    }
    S.dirty = true;
  };
  cv.addEventListener('pointermove', move); cv.addEventListener('click', click, true); cv.addEventListener('wheel', wheel, { passive: false });
  tick();
  S.nxTest = { stop: () => { cancelAnimationFrame(raf); cv.removeEventListener('pointermove', move); cv.removeEventListener('click', click, true); cv.removeEventListener('wheel', wheel); cv.style.cursor = ''; for (const id of S.order) S.applyItemTransform(S.objects.get(id)); S.applyTime(); } };
  toast('Test des interactions : survole et clique les objets (molette : défilement de l’animation). Clique à nouveau sur le bouton pour terminer.');
  S.renderProps();
}

// ---------- Export web autonome (un seul fichier HTML, modèle intégré) ----------
export async function buildHtml(S, title) {
  const keep = new Map(); for (const id of S.order) { const r = S.objects.get(id).model.root; keep.set(r, r.name); r.name = `nx_${id}`; }
  S.editorVisible && S.editorVisible(false);
  let glb;
  try { glb = await new GLTFExporter().parseAsync(S.three.content, { binary: true, onlyVisible: true, maxTextureSize: 2048 }); } finally { for (const [r, n] of keep) r.name = n; S.editorVisible && S.editorVisible(true); }
  const env = S.three.env; const cam = S.three.camera;
  const easeSrc = Object.fromEntries(Object.entries(EASES).map(([k, v]) => [k, String(v[1])]));
  const data = {
    title, bg: env.bg === 'transparent' ? null : env.bgColor || '#0a0a0c', exposure: env.exposure || 1,
    camera: { pos: cam.position.toArray(), target: S.controls.target.toArray(), fov: cam.fov },
    anim: { duration: S.anim.duration, tracks: S.anim.tracks },
    interact: Object.fromEntries(S.order.map((id) => [id, S.objects.get(id).item.nxInteract]).filter(([, v]) => v))
  };
  const b64 = bytesB64(new Uint8Array(glb));
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>html,body{margin:0;height:100%;background:${data.bg || 'transparent'};overflow:hidden;font-family:system-ui,sans-serif}canvas{display:block;width:100%;height:100%;touch-action:none}#nx-load{position:fixed;inset:0;display:grid;place-items:center;color:#888;font-size:14px}</style>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@${WEB_THREE}/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@${WEB_THREE}/examples/jsm/"}}</script>
</head><body><div id="nx-load">Chargement de la scène 3D…</div>
<!-- Scène exportée par NEXORA (Studio 3D & Motion). Intégration : <iframe src="ce-fichier.html" style="width:100%;height:520px;border:0"></iframe> -->
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const D = ${JSON.stringify(data)};
const EASE = Object.fromEntries(Object.entries(${JSON.stringify(easeSrc)}).map(([k, s]) => [k, new Function('return ' + s)()]));
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: !D.bg }); renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = D.exposure; renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.append(renderer.domElement);
const scene = new THREE.Scene(); if (D.bg) scene.background = new THREE.Color(D.bg);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const key = new THREE.DirectionalLight(0xffffff, 2); key.position.set(25, 45, 30); scene.add(key, new THREE.HemisphereLight(0xffffff, 0x444444, 0.6));
const camera = new THREE.PerspectiveCamera(D.camera.fov, 1, 0.5, 3000); camera.position.fromArray(D.camera.pos);
const controls = new OrbitControls(camera, renderer.domElement); controls.target.fromArray(D.camera.target); controls.enableDamping = true;
const bytes = Uint8Array.from(atob('${b64}'), (c) => c.charCodeAt(0));
const gltf = await new GLTFLoader().parseAsync(bytes.buffer, ''); scene.add(gltf.scene); document.getElementById('nx-load').remove();
const nodes = {}; gltf.scene.traverse((o) => { if (o.name && o.name.startsWith('nx_')) nodes[o.name.slice(3)] = { o, base: { p: o.position.clone(), r: o.rotation.clone(), s: o.scale.clone() } }; });
const val = (id, t) => { const tr = D.anim.tracks[id]; if (!tr || !tr.length) return null; if (t <= tr[0].t) return tr[0].v; const l = tr[tr.length - 1]; if (t >= l.t) return l.v; let i = 0; while (i < tr.length - 1 && tr[i + 1].t < t) i++; const a = tr[i]; const b = tr[i + 1]; const k = (EASE[b.ease] || EASE.inOut)((t - a.t) / Math.max(1e-6, b.t - a.t)); const out = {}; for (const n of new Set([...Object.keys(a.v), ...Object.keys(b.v)])) { const x = a.v[n] ?? b.v[n]; const y = b.v[n] ?? a.v[n]; out[n] = Array.isArray(x) ? x.map((v, j) => v + ((y[j] ?? v) - v) * k) : typeof x === 'number' ? x + (y - x) * k : y; } return out; };
const deg = Math.PI / 180; let t0 = performance.now(); let scrollT = null; const state = {}; let hover = null; const ray = new THREE.Raycaster(); const ptr = new THREE.Vector2();
const pick = (e) => { const r = renderer.domElement.getBoundingClientRect(); ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ptr, camera); for (const h of ray.intersectObject(gltf.scene, true)) { let o = h.object; while (o && !(o.name || '').startsWith('nx_')) o = o.parent; if (o) return o.name.slice(3); } return null; };
renderer.domElement.addEventListener('pointermove', (e) => { hover = pick(e); const it = hover && D.interact[hover]; renderer.domElement.style.cursor = it && it.click && it.click !== 'none' ? 'pointer' : ''; });
renderer.domElement.addEventListener('click', (e) => { const id = pick(e); const it = id && D.interact[id]; if (!it) return; if (it.click === 'play') t0 = performance.now(); else if (it.click === 'link' && it.url) window.open(it.url, '_blank'); else if (it.click && it.click !== 'none') state[id] = { click: it.click, at: performance.now() }; });
if (Object.values(D.interact).some((i) => i && i.scroll)) addEventListener('wheel', (e) => { scrollT = Math.min(D.anim.duration, Math.max(0, (scrollT ?? 0) + e.deltaY * 0.002 * D.anim.duration)); }, { passive: true });
const hv = {};
function frame(now) {
  requestAnimationFrame(frame);
  const w = innerWidth, h = innerHeight; if (renderer.domElement.width !== Math.floor(w * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  const t = scrollT ?? (((now - t0) / 1000) % D.anim.duration);
  for (const [id, n] of Object.entries(nodes)) {
    const v = val(id, t); const o = n.o; o.position.copy(n.base.p); o.rotation.copy(n.base.r); o.scale.copy(n.base.s);
    if (v) { if (v.pos) o.position.fromArray(v.pos); if (v.rot) o.rotation.set(v.rot[0] * deg, v.rot[1] * deg, v.rot[2] * deg); if (v.scale != null) o.scale.setScalar(v.scale); }
    const it = D.interact[id]; if (it) { hv[id] = (hv[id] || 0) + ((hover === id ? 1 : 0) - (hv[id] || 0)) * 0.15; const k = hv[id];
      if (it.hover === 'lift') o.position.y += k * 2.5; if (it.hover === 'grow') o.scale.multiplyScalar(1 + k * 0.12); if (it.hover === 'spin') o.rotation.y += k * 0.6; if (it.hover === 'tilt') { o.rotation.x -= k * 0.18; o.rotation.z += k * 0.08; }
      const s = state[id]; if (s) { const p = Math.min(1, (now - s.at) / 800); const e = 1 - (1 - p) ** 3; if (s.click === 'spin') o.rotation.y += e * Math.PI * 2; if (s.click === 'bounce') o.position.y += Math.sin(p * Math.PI) * 6; if (p >= 1) delete state[id]; } }
  }
  const cv = val('camera', t); if (cv && D.anim.tracks.camera && D.anim.tracks.camera.length > 1) { camera.position.fromArray(cv.cpos); controls.target.fromArray(cv.ctarget); if (cv.fov) { camera.fov = cv.fov; camera.updateProjectionMatrix(); } }
  controls.update(); renderer.render(scene, camera);
}
requestAnimationFrame(frame);
</script></body></html>`;
}
export async function exportWeb(S, dest = 'file') {
  const title = state.source && state.source.name ? `${state.source.name} en 3D` : 'Scène 3D NEXORA';
  const t = busy('Préparation de la page web 3D…');
  try {
    const html = await buildHtml(S, title);
    if (dest === 'dev') {
      const name = `nexora-3d-${safeName(S.sceneName()).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scene'}.html`;
      const r = await api.invoke('dev:write', { file: name, text: html });
      if (r && r.error) throw new Error(r.error);
      await api.invoke('clipboard:write', `<iframe src="${name}" title="${esc(title)}" style="width:100%;height:520px;border:0" loading="lazy"></iframe>`).catch(() => {});
      toast(`Page « ${name} » ajoutée au projet du Dev Lab. Le code d’intégration (iframe) est copié.`);
    } else await saveBytes(new TextEncoder().encode(html), { name: `${safeName(title)}`, ext: 'html', kind: 'photo', project: state.source ? state.source.name : 'Studio' });
  } catch (e) { toast(dest === 'dev' ? `Ouvre d’abord un projet dans le Dev Lab. (${e.message || e})` : `L’export web a échoué : ${e.message || e}`, { kind: 'bad' }); } finally { t.close(); }
}

// ---------- Mes mises en scène ----------
export const myPresets = () => (settings.nxStudioPresets = Array.isArray(settings.nxStudioPresets) ? settings.nxStudioPresets : []);
export async function savePreset(S) {
  const name = await prompt('Enregistrer la mise en scène', { label: 'Nom de la mise en scène', value: `Ma mise en scène ${myPresets().length + 1}`, icon: 'star', go: 'Enregistrer' });
  if (!name) return;
  const data = S.serialize(); let names = myPresets().map((p) => p.name.toLowerCase()); let n = name; for (let k = 2; names.includes(n.toLowerCase()); k++) n = `${name} (${k})`;
  myPresets().push({ id: uid(), name: n, data, at: Date.now(), thumb: S.nxSceneThumb ? S.nxSceneThumb() : '' }); saveSettings();
  toast(`Mise en scène « ${n} » enregistrée dans « Mes mises en scène ».`);
}
export async function applyPreset(S, id) { const p = myPresets().find((x) => x.id === id); if (!p) return; await S.load(JSON.parse(JSON.stringify(p.data))); S.commit(); toast(`Mise en scène « ${p.name} » appliquée.`); }
export function deletePreset(id) { settings.nxStudioPresets = myPresets().filter((p) => p.id !== id); saveSettings(); }

// ---------- Coédition du Studio ----------
export function collab(S) {
  collabSheet({
    current: S.nxRoom ? { code: S.nxRoom.code, peers: S.nxRoom.peers } : null,
    onStop: async () => { await S.nxRoom.leave(); S.nxRoom = null; toast('Tu as quitté la salle de coédition.'); },
    onStart: async (code, created) => {
      const room = new CollabRoom({ kind: 'studio', code, getState: () => S.serialize(), onState: async (st) => { S.nxRemote = true; try { await S.restore(JSON.stringify(st)); } finally { S.nxRemote = false; } }, onPeers: (p) => toast(p.length ? `${p.length} personne${p.length > 1 ? 's' : ''} dans la salle ${code}.` : `Salle ${code} : tu es seul pour l’instant.`) });
      const t = busy('Connexion à la salle…');
      try { await room.join(); S.nxRoom = room; toast(created ? `Salle créée : ${code}. Donne ce code à tes coéquipiers.` : `Tu as rejoint la salle ${code}.`); } catch (e) { toast(e.message || String(e), { kind: 'bad' }); } finally { t.close(); }
    }
  });
}
