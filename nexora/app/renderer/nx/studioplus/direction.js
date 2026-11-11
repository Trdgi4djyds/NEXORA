// NEXORA #055 : mise en scène par l'IA (description → appareils, animation, caméra, rendu, textes, transitions,
// uniquement avec les réglages existants du Studio), déclinaison des vidéos pour les réseaux sociaux et zones de
// sécurité des réseaux (aide d'aperçu, jamais dans les rendus).
import * as R from '../studio/render.js';
import * as A from '../studio/motion.js';
import { cleanPlan, PLAN } from './formats.js';
import { toast, busy, done, allowed, contentBox } from './ui.js';
import { aiJson, needAi } from '../services.js';

const SCENES = { duo: 'deux téléphones côte à côte', trio: 'trois appareils en présentoir', foldopen: 'pliable qui s’ouvre', laptopphone: 'ordinateur et téléphone', hero: 'un téléphone en vedette', flat: 'appareils posés à plat, vue de dessus' };
const ANIMS = { spin: 'tour complet', swing: 'balancement', enter: 'arrive et se pose', float: 'flottement', open: 'le pliable ou l’ordinateur s’ouvre', scroll: 'la page défile à l’écran', showcase: 'présentation complète' };

export async function direct(S, text) {
  if (!allowed('La mise en scène par l’IA') || !(await needAi())) return;
  const opts = { styles: Object.keys(R.STYLES), hdris: Object.keys(R.HDRIS), grades: Object.keys(R.GRADES), particles: Object.keys(R.PARTICLES) };
  const t = busy('L’IA prépare la mise en scène…');
  try {
    const raw = await aiJson(`Tu règles une vidéo 3D de présentation d'application dans NEXORA. Demande : « ${text} ».
Choisis uniquement parmi ces valeurs :
scene : ${Object.entries(SCENES).map(([k, v]) => `${k} (${v})`).join(', ')}
anim : ${Object.entries(ANIMS).map(([k, v]) => `${k} (${v})`).join(', ')}
camera : ${PLAN.camera.join(', ')}
style : ${opts.styles.join(', ')} ; hdri : ${opts.hdris.join(', ')} ; grade : ${opts.grades.join(', ')} ; particles : ${opts.particles.join(', ')} ou null
transition : ${PLAN.transition.join(', ')}
Format : {"scene":"…","anim":"…","camera":"…","style":"…","hdri":"…","grade":"…","particles":null,"transition":"…","duration":8,"color":"#rrggbb","texts":["texte court en français (2 au plus, 40 caractères)"]}`, { maxTokens: 700 });
    const plan = cleanPlan(raw, opts);
    await apply(S, plan);
    toast(`Mise en scène prête : ${SCENES[plan.scene]}, ${ANIMS[plan.anim]}, ${plan.duration} s. Tout reste modifiable.`);
    return plan;
  } catch (e) { toast(e.message || String(e), { kind: 'bad' }); } finally { done(t); }
}
export async function apply(S, plan) {
  await S.scenePreset(plan.scene);
  if (S.setDuration) S.setDuration(plan.duration);
  const dev = S.order.find((id) => S.objects.get(id).item.type === 'device');
  if (dev && plan.anim) { S.select(dev); await S.applyAnimPreset(plan.anim); }
  if (plan.camera && plan.camera !== 'none') A.cameraMove(S, plan.camera);
  const n = R.nxEnv(S);
  if (plan.style) n.style = { ...(n.style || {}), kind: plan.style };
  if (plan.hdri) n.hdri = { ...(n.hdri || {}), kind: plan.hdri };
  if (plan.grade && plan.grade !== 'aucun') n.grade = { ...(n.grade || {}), on: true, preset: plan.grade };
  if (plan.particles) n.particles = { ...(n.particles || {}), on: true, type: plan.particles };
  R.refresh(S);
  const top = contentBox(S).max.y;
  plan.texts.forEach((text, i) => S.addDecor({ kind: 'texte3d', text, font: 'inter', fontSize: i ? 3 : 5, depth: i ? 0.8 : 1.4, bevel: 0.2, color: plan.color || '#1d1d1f', finish: 'brillant', pos: [0, top + 8 - i * 6, 0] }, { select: false, history: false }));
  if (plan.transition !== 'none') { const list = A.transitions(S); if (!list.some((x) => x.edge === 'in')) list.unshift({ kind: plan.transition, edge: 'in', dur: 0.8 }); if (!list.some((x) => x.edge === 'out')) list.push({ kind: plan.transition, edge: 'out', dur: 0.8 }); }
  S.applyTime(); S.timeline && S.timeline.render(); S.dirty = true; S.commit(); S.renderProps();
}

// ---------- Réseaux sociaux ----------
export const FORMATS = R.REFRAMES;
export const socialPick = (S) => (S.nxSocial = S.nxSocial || { '9:16': true, '1:1': true, '4:5': false, '16:9': true });
export async function exportSocial(S) {
  const list = Object.entries(socialPick(S)).filter(([, v]) => v).map(([k]) => k);
  if (!list.length) { toast('Coche au moins un format.', { kind: 'bad' }); return; }
  await R.reframeExport(S, list);
  toast(`${list.length} vidéo(s) exportée(s) : le sujet reste cadré dans chaque format.`);
}
// Zones couvertes par l'interface des réseaux (légende, boutons, nom du compte) : à garder libres de texte.
export function drawSafe(S, ctx, w, h) {
  if (!S.nxSafe) return;
  const a = w / Math.max(1, h); const tall = a < 0.7; const sq = a >= 0.7 && a <= 1.3;
  const zones = tall ? [[0, 0, 1, 0.12, 'Haut : nom du compte'], [0, 0.78, 1, 0.22, 'Bas : légende et musique'], [0.86, 0.3, 0.14, 0.48, 'Boutons']] : sq ? [[0, 0.88, 1, 0.12, 'Bas : légende']] : [[0, 0.86, 1, 0.14, 'Bas : barre de lecture']];
  ctx.save();
  for (const [x, y, zw, zh, label] of zones) {
    ctx.fillStyle = 'rgba(255, 70, 90, 0.16)'; ctx.fillRect(x * w, y * h, zw * w, zh * h);
    ctx.strokeStyle = 'rgba(255, 70, 90, 0.85)'; ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5; ctx.strokeRect(x * w + 0.5, y * h + 0.5, zw * w - 1, zh * h - 1);
    ctx.setLineDash([]); ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'; ctx.font = `600 ${Math.max(10, Math.round(h * 0.018))}px Inter, system-ui, sans-serif`; ctx.fillText(label, x * w + 8, y * h + Math.max(14, h * 0.03));
  }
  const m = Math.round(Math.min(w, h) * 0.05);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'; ctx.setLineDash([4, 4]); ctx.strokeRect(m, m, w - 2 * m, h - 2 * m);
  ctx.restore();
}
