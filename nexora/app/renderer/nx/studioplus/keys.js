// NEXORA #055 : frise enrichie : copier les clés d'un objet et les coller sur un autre à la tête de lecture (en
// mouvement relatif), décaler les clés, courbe d'accélération avec aperçu, repères nommés.
import { nxEase as EASES } from '../../dist/chunks/chunk-2DYF2ZBK.js';
import * as A from '../studio/motion.js';
import { toast, prompt, esc } from './ui.js';

export const track = (S, id) => (S.anim.tracks && S.anim.tracks[id]) || [];
const refresh = (S) => { S.applyTime(); S.timeline && S.timeline.render(); S.dirty = true; S.commit(); A.drawPath(S); S.renderProps(); };
let clip = null;
export const hasClip = () => Boolean(clip);
export function copy(S, id) {
  const tr = track(S, id); if (!tr.length) { toast('Cet objet n’a pas encore de clé.', { kind: 'bad' }); return; }
  clip = { from: id, keys: JSON.parse(JSON.stringify(tr)) };
  toast(`${tr.length} clé(s) copiée(s). Sélectionnez un autre objet, placez la tête de lecture puis « Coller les clés ».`);
}
// Les écarts (position, rotation, taille) sont rejoués à partir de la place actuelle de l'objet cible.
export function paste(S, id) {
  if (!clip) return;
  const t0 = clip.keys[0].t; const v0 = clip.keys[0].v || {}; const cur = S.getState(id) || {};
  const add = (a, b, c) => (Array.isArray(a) && Array.isArray(b) && Array.isArray(c) ? a.map((x, i) => x + (b[i] - c[i])) : a);
  const keys = clip.keys.map((k) => {
    const v = { ...cur, ...k.v };
    if (k.v && k.v.pos) v.pos = add(cur.pos, k.v.pos, v0.pos || k.v.pos);
    if (k.v && k.v.rot) v.rot = add(cur.rot, k.v.rot, v0.rot || k.v.rot);
    if (k.v && k.v.scale != null && v0.scale) v.scale = (cur.scale ?? 1) * (k.v.scale / v0.scale);
    return { ...k, t: Math.min(S.anim.duration, Math.round((S.time + k.t - t0) * 100) / 100), v };
  });
  const tr = (S.anim.tracks[id] = track(S, id).filter((k) => !keys.some((n) => Math.abs(n.t - k.t) < 0.01)).concat(keys).sort((a, b) => a.t - b.t));
  refresh(S); toast(`${keys.length} clé(s) collée(s) ; l’objet a maintenant ${tr.length} clé(s).`);
}
export function shift(S, id, d) {
  const tr = track(S, id); if (!tr.length) return;
  const min = Math.min(...tr.map((k) => k.t)); const max = Math.max(...tr.map((k) => k.t));
  const dd = Math.max(-min, Math.min(S.anim.duration - max, d));
  for (const k of tr) k.t = Math.round((k.t + dd) * 100) / 100;
  refresh(S);
}
export function ease(S, id, name) { for (const k of track(S, id)) k.ease = name; refresh(S); toast(`Courbe « ${EASES[name] ? EASES[name][0] : name} » appliquée aux clés de l’objet.`); }
export const EASE_NAMES = () => Object.keys(EASES);
// Petit graphique de la courbe (temps → avancement).
export function curve(name, w = 54, h = 34) {
  const f = EASES[name] && EASES[name][1]; if (typeof f !== 'function') return '';
  let d = ''; for (let i = 0; i <= 24; i++) { const x = i / 24; let y = f(x); if (!Number.isFinite(y)) y = x; d += `${i ? 'L' : 'M'}${(x * (w - 6) + 3).toFixed(1)} ${(h - 4 - y * (h - 10)).toFixed(1)}`; }
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
}
export const easeLabel = (n) => esc(EASES[n] ? EASES[n][0] : n);

// ---------- Repères ----------
export const marks = (S) => (S.anim.nxMarks = Array.isArray(S.anim.nxMarks) ? S.anim.nxMarks : []);
export async function addMark(S) {
  const label = await prompt('Nouveau repère', { label: `Nom du repère à ${S.time.toFixed(2).replace('.', ',')} s`, value: `Repère ${marks(S).length + 1}`, icon: 'nxMarker', go: 'Ajouter' });
  if (!label) return;
  marks(S).push({ t: Math.round(S.time * 100) / 100, label: label.slice(0, 40) }); marks(S).sort((a, b) => a.t - b.t);
  S.dirty = true; S.commit(); S.renderProps();
}
// Repères affichés en haut de l'aperçu (jamais dans les rendus).
export function drawMarks(S, ctx, w, h) {
  const list = marks(S); if (!list.length || !S.anim.duration) return;
  ctx.save(); ctx.font = `600 ${Math.max(10, Math.round(h * 0.016))}px Inter, system-ui, sans-serif`;
  for (const m of list) {
    const x = (m.t / S.anim.duration) * w; const near = Math.abs(S.time - m.t) < 0.15;
    ctx.fillStyle = near ? 'rgba(255, 214, 10, 0.95)' : 'rgba(255, 255, 255, 0.55)'; ctx.fillRect(Math.round(x), 0, 2, 10);
    if (near) { ctx.fillStyle = 'rgba(20, 21, 26, 0.85)'; const tw = ctx.measureText(m.label).width + 12; ctx.fillRect(Math.min(w - tw, x + 4), 12, tw, 20); ctx.fillStyle = '#fff'; ctx.fillText(m.label, Math.min(w - tw, x + 4) + 6, 27); }
  }
  ctx.restore();
}
