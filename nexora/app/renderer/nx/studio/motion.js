// NEXORA #013 : animation du Studio. Mouvements de caméra supplémentaires, chute avec rebonds,
// trajectoire visible, calage des clés sur le rythme de la musique, transitions en surimpression.
import { d as evalTrack, nxEase as EASES } from '../../dist/chunks/chunk-2DYF2ZBK.js';
import { Vector3, Line, LineBasicMaterial, BufferGeometry, BufferAttribute, Group, Mesh, SphereGeometry, MeshBasicMaterial } from './three.js';
import { toast, clamp } from '../core.js';

// ---------- Courbes de gravité (chute et montée d'un rebond) ----------
export function registerEases() {
  if (!EASES.nxFall) EASES.nxFall = ['Chute (gravité)', (x) => x * x];
  if (!EASES.nxRise) EASES.nxRise = ['Montée (gravité)', (x) => 1 - (1 - x) * (1 - x)];
}
const round = (a) => a.map((v) => Math.round(v * 1000) / 1000);
const push = (S, id, t, v, ease) => {
  const fps = S.anim.fps || 30; const tr = (S.anim.tracks[id] = S.anim.tracks[id] || []); const tt = Math.round(t * fps) / fps;
  const old = tr.find((k) => Math.abs(k.t - tt) < 0.5 / fps); if (old) { old.v = v; old.ease = ease; return; }
  tr.push({ t: tt, ease, v });
};

// ---------- Mouvements de caméra (complètent ceux du Studio) ----------
export const CAM_MOVES = {
  orbit360: ['Orbite complète', 'Un tour entier autour de la scène, en boucle parfaite'],
  spiral: ['Spirale', 'S’enroule autour du sujet en s’approchant'],
  dive: ['Plongée', 'Part au-dessus du sujet et descend à hauteur d’yeux'],
  vertigo: ['Effet vertigo', 'Avancez en élargissant le champ : le sujet garde sa taille, le décor s’étire']
};
export function cameraMove(S, kind) {
  const cam = S.three.camera; const T = S.controls.target.clone(); const off = cam.position.clone().sub(T);
  const D = S.anim.duration; const f0 = cam.fov; const up = new Vector3(0, 1, 0); const dist = off.length();
  const at = (o, f = f0) => ({ cpos: round(T.clone().add(o).toArray()), ctarget: round(T.toArray()), fov: Math.round(f * 100) / 100 });
  S.anim.tracks.camera = [];
  if (kind === 'orbit360') for (let i = 0; i <= 12; i++) push(S, 'camera', D * i / 12, at(off.clone().applyAxisAngle(up, Math.PI * 2 * i / 12)), 'linear');
  if (kind === 'spiral') for (let i = 0; i <= 10; i++) { const k = i / 10; const o = off.clone().applyAxisAngle(up, -Math.PI * 1.2 * (1 - k)).multiplyScalar(1.5 - 0.5 * k); o.y += dist * 0.35 * (1 - k); push(S, 'camera', D * k, at(o), i ? 'linear' : 'inOut'); }
  if (kind === 'dive') { const top = new Vector3(off.x * 0.15, dist * 1.05, off.z * 0.15); push(S, 'camera', 0, at(top), 'inOut'); push(S, 'camera', D, at(off), 'out'); }
  if (kind === 'vertigo') {
    // Effet « dolly zoom » : distance × tan(champ / 2) constant pour garder la taille du sujet.
    const f1 = Math.min(80, f0 * 1.9); const half = (f) => Math.tan((f * Math.PI) / 360);
    for (let i = 0; i <= 8; i++) { const k = (1 - Math.cos(Math.PI * i / 8)) / 2; const f = f0 + (f1 - f0) * k; push(S, 'camera', D * i / 8, at(off.clone().normalize().multiplyScalar(dist * half(f0) / half(f)), f), 'linear'); }
  }
  S.anim.tracks.camera.sort((a, b) => a.t - b.t);
  S.applyTime(); S.timeline.render(); S.commit();
  toast(`Mouvement de caméra « ${CAM_MOVES[kind][0]} » créé sur ${String(D).replace('.', ',')} s : lecture (Espace) pour le voir.`);
}

// ---------- Chute avec rebonds (clés aux contacts et aux sommets, courbes de gravité) ----------
export function physicsDrop(S, ids, { height = 30, bounce = 0.5, stagger = 0.2 } = {}) {
  registerEases();
  const D = S.anim.duration; const g = 980; let made = 0;
  ids.forEach((id, n) => {
    const e = S.objects.get(id); const st = S.getState(id); if (!e || !st || !st.pos) return;
    // Position de repos de l'objet (et non sa position animée) : relancer la chute ne cumule pas les hauteurs.
    if (Array.isArray(e.item.pos)) st.pos = [...e.item.pos];
    const y0 = st.pos[1]; const key = (t, y, ease) => push(S, id, Math.min(D, t), { ...st, pos: [st.pos[0], Math.round((y0 + y) * 1000) / 1000, st.pos[2]] }, ease);
    S.anim.tracks[id] = [];
    let t = n * stagger; let h = height; key(0, h, 'hold'); if (t > 0) key(t, h, 'hold');
    // Hauteurs en unités de la scène (1 = 1 cm) : temps de chute √(2h/g).
    t += Math.sqrt((2 * h) / g); key(t, 0, 'nxFall');
    for (let i = 0; i < 6 && t < D; i++) {
      h *= bounce * bounce; if (h < height * 0.01) break;
      const up = Math.sqrt((2 * h) / g); if (up < 1.5 / (S.anim.fps || 30)) break; // rebond plus court qu'une image et demie : l'objet est posé
      key(t + up, h, 'nxRise'); key(t + 2 * up, 0, 'nxFall'); t += 2 * up;
    }
    S.anim.tracks[id].sort((a, b) => a.t - b.t); made++;
  });
  if (!made) { toast('Sélectionnez d’abord un ou plusieurs objets de la scène.', { kind: 'bad' }); return; }
  S.time = 0; S.applyTime(); S.timeline.render(); S.commit(); drawPath(S);
  toast(`Chute avec rebonds créée pour ${made} objet${made > 1 ? 's' : ''} : les clés restent modifiables sur la frise.`);
}

// ---------- Trajectoire visible de l'objet sélectionné ou de la caméra ----------
export function drawPath(S) {
  const three = S.three;
  if (three.nxPath) { three.scene.remove(three.nxPath); three.nxPath.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); three.nxPath = null; }
  const id = S.sel; const tr = id && S.anim.tracks[id];
  if (!S.nxShowPath || !tr || tr.length < 2) { S.dirty = true; return; }
  const k = id === 'camera' ? 'cpos' : 'pos'; const pts = [];
  for (let i = 0; i <= 160; i++) { const v = evalTrack(S.anim, id, S.anim.duration * i / 160); if (v && v[k]) pts.push(...v[k]); }
  if (pts.length < 6) { S.dirty = true; return; }
  const g = new Group(); g.userData.editorOnly = true; g.name = 'Trajectoire';
  const geo = new BufferGeometry(); geo.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
  const line = new Line(geo, new LineBasicMaterial({ color: '#ff2d78', depthTest: false, transparent: true })); line.renderOrder = 999; line.userData.editorOnly = true; g.add(line);
  const sg = new SphereGeometry(0.5, 12, 8);
  for (const key of tr) { const p = key.v[k]; if (!p) continue; const m = new Mesh(sg, new MeshBasicMaterial({ color: '#ffffff', depthTest: false })); m.position.fromArray(p); m.renderOrder = 1000; m.userData.editorOnly = true; g.add(m); }
  three.nxPath = g; three.scene.add(g); S.dirty = true;
}

// ---------- Rythme de la musique ----------
export function detectBeats(buffer) {
  const sr = buffer.sampleRate; const data = buffer.getChannelData(0); const hop = Math.round(sr * 0.01); const n = Math.floor(data.length / hop);
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < hop; j++) { const v = data[i * hop + j] || 0; s += v * v; } env[i] = Math.sqrt(s / hop); }
  const flux = new Float32Array(n); for (let i = 1; i < n; i++) flux[i] = Math.max(0, env[i] - env[i - 1]);
  // Tempo par autocorrélation du flux d'énergie (60 à 180 battements par minute).
  let best = 0; let lag = 50;
  for (let L = 33; L <= 100; L++) { let s = 0; for (let i = L; i < n; i++) s += flux[i] * flux[i - L]; if (s > best) { best = s; lag = L; } }
  let phase = 0; let bp = -1; for (let p = 0; p < lag; p++) { let s = 0; for (let i = p; i < n; i += lag) s += flux[i]; if (s > bp) { bp = s; phase = p; } }
  const beats = []; for (let i = phase; i < n; i += lag) beats.push(Math.round((i * hop / sr) * 1000) / 1000);
  return { bpm: Math.round(6000 / lag), beats };
}
export function musicBuffer(S) { const m = S.musicBase || S.music; return m && m.buffer ? m : null; }
export function analyseBeats(S) {
  const m = musicBuffer(S); if (!m) return null;
  const r = detectBeats(m.buffer); const off = m.offset || 0;
  S.anim.nxBeats = r.beats.map((b) => Math.round((b - off) * 1000) / 1000).filter((b) => b >= 0 && b <= S.anim.duration);
  S.anim.nxBpm = r.bpm;
  return r;
}
export function snapKeysToBeats(S) {
  const b = S.anim.nxBeats || []; if (!b.length) return 0; let n = 0; const fps = S.anim.fps || 30;
  for (const tr of Object.values(S.anim.tracks)) {
    const used = new Set();
    for (const k of tr) {
      let best = k.t; let bd = 1e9;
      for (const t of b) { const d = Math.abs(t - k.t); if (d < bd && !used.has(t)) { bd = d; best = t; } }
      if (bd < 0.6 && bd > 1e-6) { k.t = Math.round(Math.min(S.anim.duration, best) * fps) / fps; n++; }
      used.add(best);
    }
    tr.sort((x, y) => x.t - y.t);
  }
  return n;
}

// ---------- Transitions en surimpression (mêmes dans l'aperçu, les vidéos et les GIF) ----------
export const TRANSITIONS = { black: 'Fondu au noir', white: 'Flash blanc', iris: 'Iris', wipe: 'Volet', bars: 'Bandes cinéma' };
export const transitions = (S) => (S.anim.nxTrans = Array.isArray(S.anim.nxTrans) ? S.anim.nxTrans : []);
export function drawTransitions(S, ctx, W, H, t) {
  const list = S.anim.nxTrans; if (!list || !list.length) return;
  for (const tr of list) {
    const d = Math.max(0.1, tr.dur || 0.6); const T = tr.edge === 'in' ? 0 : tr.edge === 'out' ? S.anim.duration : tr.t; const a = T - d / 2; const b = T + d / 2;
    // Début et fin de vidéo : fondu d'ouverture (de t à t + d) ou de fermeture (de t - d à t).
    let k;
    if (tr.edge === 'in') { if (t < T || t > T + d) continue; k = 1 - (t - T) / d; }
    else if (tr.edge === 'out') { if (t < T - d || t > T) continue; k = 1 - (T - t) / d; }
    else { if (t < a || t > b) continue; k = 1 - Math.abs(t - T) / (d / 2); }
    k = clamp(k, 0, 1); const e = k * k * (3 - 2 * k);
    ctx.save();
    if (tr.kind === 'black' || tr.kind === 'white') { ctx.globalAlpha = e; ctx.fillStyle = tr.kind === 'black' ? '#000' : '#fff'; ctx.fillRect(0, 0, W, H); }
    if (tr.kind === 'iris') { const R = Math.hypot(W, H) / 2 * (1 - e); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(W / 2, H / 2, Math.max(0, R), 0, Math.PI * 2, true); ctx.fill('evenodd'); }
    if (tr.kind === 'wipe') { ctx.fillStyle = '#000'; const x = (tr.edge !== 'in' && t <= T) || tr.edge === 'out' ? 0 : W * (1 - e); ctx.fillRect(x, 0, W * e, H); }
    if (tr.kind === 'bars') { ctx.fillStyle = '#000'; const h = H / 2 * e; ctx.fillRect(0, 0, W, h); ctx.fillRect(0, H - h, W, h); }
    ctx.restore();
  }
}
