// NEXORA #011 : Studio 3D & Motion. Rendu avancé (style, environnement, profondeur de champ, étalonnage,
// particules, qualité), matières à relief, répétition, vague, formes combinées, interactions,
// page web 3D, couches, GIF, vidéo transparente et « Mes mises en scène ».
// NEXORA #013 : mouvements de caméra, chute avec rebonds, trajectoire, rythme de la musique, transitions.
// NEXORA #014 : navigation caméra de la vue 3D réduite par défaut.
import { esc, toast, settings, saveSettings } from '../core.js';
import { b as icon } from '../../dist/chunks/chunk-S4I2LXHS.js';
import * as R from './render.js';
import * as M from './matter.js';
import * as W from './web.js';
import * as A from './motion.js';
import { Box3, Vector3 } from './three.js';

const pct = (v) => `${Math.round(v * 100)} %`;
const num = (v) => String(Math.round(v * 100) / 100).replace('.', ',');
const sec = (v) => `${num(v)} s`;
const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
function setPath(o, p, v) { const ks = p.split('.'); let a = o; for (const k of ks.slice(0, -1)) a = a[k] && typeof a[k] === 'object' ? a[k] : (a[k] = {}); a[ks[ks.length - 1]] = v; }

// ---------- Composants du panneau (balisage identique au Studio) ----------
const head = (t) => `<div class="st-field nx-st-title"><span>${t}</span></div>`;
const chips = (key, cur, opts) => `<div class="st-chips">${Object.entries(opts).map(([v, l]) => `<button class="st-chip${String(cur) === v ? ' on' : ''}" data-nx="${key}" data-val="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;
const seg = (key, cur, opts) => `<div class="seg wide" role="radiogroup">${Object.entries(opts).map(([v, l]) => `<button role="radio" aria-checked="${String(cur) === v}" class="${String(cur) === v ? 'on' : ''}" data-nx="${key}" data-val="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;
const field = (label, body) => `<div class="st-field"><span>${label}</span>${body}</div>`;
const range = (label, key, v, min, max, step, f = pct) => `<div class="st-field"><span>${label}<b data-nxv="${key}">${f(v)}</b></span><input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-nxr="${key}" data-fmt="${f === pct ? 'pct' : f === num ? 'num' : f === sec ? 'sec' : 'int'}"></div>`;
const check = (label, key, on) => `<label class="check-row"><input type="checkbox" data-nxc="${key}" ${on ? 'checked' : ''}><span class="box"></span><span>${label}</span></label>`;
const color = (label, key, v) => `<div class="st-field"><span>${label}</span><div class="st-colors"><label class="st-color custom" style="--c:${esc(v)}"><input type="color" value="${esc(v)}" data-nxk="${key}"></label></div></div>`;
const btn = (action, label, ic, extra = '') => `<button class="btn small${extra}" data-nxa="${action}">${ic ? icon(ic, 13) : ''}<span>${label}</span></button>`;
const FMT = { pct, num, sec, int: (v) => String(Math.round(v)) };

// ---------- Scène : rendu avancé, exports, mises en scène ----------
function sceneCards(S) {
  const n = R.nxEnv(S);
  const style = (n.style && n.style.kind) || 'normal'; const hdri = n.hdri || {}; const dof = n.dof || {}; const gr = n.grade || {}; const pt = n.particles || {};
  const q = R.QUALITY[S.nxQuality()] ? S.nxQuality() : 'normal';
  let h = `<section class="st-card nx-st-card" data-nxcard="rendu">${head(`${icon('nxAperture', 13)} Rendu avancé`)}
    ${field('Style de rendu', chips('env:style.kind', style, R.STYLES))}
    ${field('Environnement d’éclairage', chips('env:hdri.kind', hdri.kind || 'defaut', R.HDRIS))}`;
  if (hdri.kind && hdri.kind !== 'defaut') h += check('Afficher l’environnement en arrière-plan', 'env:hdri.bg', !!hdri.bg) + (hdri.bg ? range('Flou de l’arrière-plan', 'env:hdri.blur', hdri.blur ?? 0.4, 0, 1, 0.01) : '');
  h += `<details class="st-adv"${dof.on ? ' open' : ''}><summary>${icon('nxAperture', 13)}<span>Profondeur de champ</span></summary>
      ${check('Flou d’arrière-plan photographique', 'env:dof.on', !!dof.on)}
      ${dof.on ? range('Ouverture', 'env:dof.aperture', dof.aperture ?? 0.6, 0.1, 3, 0.05, num) + range('Flou maximal', 'env:dof.blur', dof.blur ?? 0.6, 0.1, 2, 0.05) + check('Mise au point sur l’objet sélectionné', 'env:dof.auto', dof.auto !== false) + (dof.auto === false ? range('Distance de mise au point', 'env:dof.focus', dof.focus ?? 60, 5, 400, 1, FMT.int) : '') : ''}
    </details>
    <details class="st-adv"${gr.on ? ' open' : ''}><summary>${icon('nxGrade', 13)}<span>Étalonnage des couleurs</span></summary>
      ${check('Étalonner l’image', 'env:grade.on', !!gr.on)}
      ${gr.on ? field('Ambiance', chips('env:grade.preset', gr.preset || 'aucun', Object.fromEntries(Object.entries(R.GRADES).map(([k, v]) => [k, v[0]])))) + range('Contraste', 'env:grade.contrast', gr.contrast ?? 1, 0.5, 1.6, 0.01) + range('Saturation', 'env:grade.sat', gr.sat ?? 1, 0, 2, 0.01) + range('Température', 'env:grade.temp', gr.temp ?? 0, -1, 1, 0.01, num) + range('Luminosité', 'env:grade.exposure', gr.exposure ?? 0, -1.5, 1.5, 0.05, num) : ''}
    </details>
    <details class="st-adv"${pt.on ? ' open' : ''}><summary>${icon('nxParticles', 13)}<span>Particules</span></summary>
      ${check('Ajouter des particules', 'env:particles.on', !!pt.on)}
      ${pt.on ? field('Type', chips('env:particles.type', pt.type || 'poussiere', R.PARTICLES)) + range('Nombre', 'env:particles.count', pt.count ?? 300, 20, 3000, 10, FMT.int) + range('Vitesse', 'env:particles.speed', pt.speed ?? 1, 0, 3, 0.05) + range('Taille', 'env:particles.size', pt.size ?? 1, 0.3, 3, 0.05) + (pt.type === 'confettis' ? '' : color('Couleur', 'env:particles.color', pt.color || '#ffffff')) : ''}
    </details>
    ${field('Qualité de l’aperçu', seg('quality', q, { brouillon: 'Brouillon', normal: 'Normale', fine: 'Fine' }))}
  </section>`;
  h += `<section class="st-card nx-st-card" data-nxcard="exports">${head(`${icon('download', 13)} Exports supplémentaires`)}
    <div class="st-btns">${btn('gif', 'GIF animé', 'film')}${btn('webm', 'Vidéo à fond transparent', 'video')}${btn('passes-zip', 'Couches de rendu (ZIP)', 'layers')}${btn('passes-design', 'Couches dans NEX-DESIGN', 'palette')}</div>
  </section>
  <section class="st-card nx-st-card" data-nxcard="web">${head(`${icon('globe', 13)} Page web 3D`)}
    <p class="nx-st-note">Une page HTML autonome : la scène tourne à la souris, joue son animation et réagit aux interactions réglées sur chaque objet.</p>
    <div class="st-btns">${btn('test', S.nxTest ? 'Terminer le test' : 'Tester les interactions', 'nxPointer', S.nxTest ? ' primary' : '')}${btn('web-file', 'Exporter la page', 'download')}${btn('web-dev', 'Ajouter au projet du Dev Lab', 'code')}</div>
  </section>`;
  h += montageCard(S);
  const mine = W.myPresets();
  h += `<section class="st-card nx-st-card" data-nxcard="presets">${head(`${icon('star', 13)} Mes mises en scène`)}
    ${mine.length ? `<div class="nx-st-presets">${mine.map((p) => `<div class="nx-st-preset"><button class="nx-st-preset-go" data-nxa="preset-apply" data-id="${esc(p.id)}" title="Appliquer « ${esc(p.name)} »">${p.thumb ? `<img src="${esc(p.thumb)}" alt="">` : `<span class="nx-st-preset-ph">${icon('cube', 16)}</span>`}<span>${esc(p.name)}</span></button><button class="nx-st-preset-del" data-nxa="preset-del" data-id="${esc(p.id)}" title="Supprimer « ${esc(p.name)} »" aria-label="Supprimer « ${esc(p.name)} »">${icon('trash', 13)}</button></div>`).join('')}</div>` : '<p class="nx-st-note">Enregistre la scène actuelle (objets, lumières, rendu, animation) pour la réutiliser dans une autre scène.</p>'}
    <div class="st-btns">${btn('preset-save', 'Enregistrer cette mise en scène', 'plus')}</div>
  </section>`;
  return h;
}

// ---------- Objet sélectionné : matière à relief, répétition, vague, interactions ----------
function decorCards(S, item) {
  const m = item.nxMat || {}; const a = item.nxArr || {}; const wv = item.nxWave || {}; const it = item.nxInteract || {};
  const kinds = { none: 'Aucune', ...Object.fromEntries(Object.entries(M.TEXTURES).map(([k, v]) => [k, v.label])) };
  const on = m.kind && m.kind !== 'none';
  let h = `<section class="st-card nx-st-card" data-nxcard="matiere">${head(`${icon('nxMaterial', 13)} Matière à relief`)}
    ${field('Matière réaliste', chips('item:nxMat.kind', m.kind || 'none', kinds))}`;
  if (on) h += range('Échelle du motif', 'item:nxMat.scale', m.scale ?? 1, 0.25, 4, 0.05, num) + range('Usure', 'item:nxMat.wear', m.wear ?? 0, 0, 1, 0.01) + range('Rayures', 'item:nxMat.scratches', m.scratches ?? 0, 0, 1, 0.01) + check('Placage sans raccord (triplanaire)', 'item:nxMat.triplanar', !!m.triplanar);
  h += check('Liseré lumineux sur les bords', 'item:nxMat.fresnel.on', !!(m.fresnel && m.fresnel.on));
  if (m.fresnel && m.fresnel.on) h += color('Couleur du liseré', 'item:nxMat.fresnel.color', m.fresnel.color || '#6a4cff') + range('Finesse du liseré', 'item:nxMat.fresnel.power', m.fresnel.power ?? 4, 0.5, 8, 0.1, num);
  h += check('Variation de teinte naturelle', 'item:nxMat.noise.on', !!(m.noise && m.noise.on));
  if (m.noise && m.noise.on) h += range('Intensité de la variation', 'item:nxMat.noise.amount', m.noise.amount ?? 0.35, 0.05, 1, 0.01);
  h += `</section>
  <section class="st-card nx-st-card" data-nxcard="repetition">${head(`${icon('nxRepeat', 13)} Répétition et déformation`)}
    ${field('Répéter l’objet', chips('item:nxArr.mode', a.mode || 'none', { none: 'Non', line: 'En ligne', grid: 'En grille', circle: 'En cercle', mirror: 'Miroir' }))}`;
  if (a.mode && a.mode !== 'none' && a.mode !== 'mirror') h += range(a.mode === 'grid' ? 'Copies par côté' : 'Nombre d’exemplaires', 'item:nxArr.count', a.count ?? 3, 2, a.mode === 'grid' ? 8 : 24, 1, FMT.int);
  if (a.mode === 'circle') h += range('Rayon du cercle', 'item:nxArr.radius', a.radius ?? 30, 5, 200, 1, FMT.int);
  if (a.mode && a.mode !== 'none' && a.mode !== 'circle') h += range('Écart', 'item:nxArr.gap', a.gap ?? 0.2, 0, 2, 0.01);
  if (a.mode === 'mirror') h += field('Axe du miroir', seg('item:nxArr.axis', a.axis || 'x', { x: 'Gauche / droite', z: 'Avant / arrière' }));
  h += range('Vague', 'item:nxWave.amp', wv.amp ?? 0, 0, 1, 0.01);
  if (wv.amp) h += range('Nombre d’ondulations', 'item:nxWave.freq', wv.freq ?? 2, 0.5, 6, 0.1, num) + field('Sens de la vague', seg('item:nxWave.axis', wv.axis || 'x', { x: 'Largeur', z: 'Profondeur' }));
  h += `</section>
  <section class="st-card nx-st-card" data-nxcard="interactions">${head(`${icon('nxInteract', 13)} Interactions (page web 3D)`)}
    ${field('Au survol', chips('item:nxInteract.hover', it.hover || 'none', W.HOVERS))}
    ${field('Au clic', chips('item:nxInteract.click', it.click || 'none', W.CLICKS))}
    ${it.click === 'link' ? field('Adresse du lien', `<input class="input" data-nxt="item:nxInteract.url" value="${esc(it.url || '')}" placeholder="https://monsite.fr" spellcheck="false">`) : ''}
    ${check('La molette fait défiler l’animation', 'item:nxInteract.scroll', !!it.scroll)}
    <div class="st-btns">${btn('test', S.nxTest ? 'Terminer le test' : 'Tester les interactions', 'nxPointer', S.nxTest ? ' primary' : '')}</div>
  </section>`;
  return h;
}
function montageCard(S) {
  const D = S.anim.duration; const list = A.transitions(S);
  let h = `<section class="st-card nx-st-card" data-nxcard="montage">${head(`${icon('nxTransition', 13)} Transitions et rythme`)}`;
  if (!list.length) h += '<p class="nx-st-note">Fondus et volets dessinés par-dessus l’image : visibles dans l’aperçu, les vidéos et les GIF (pas sur les photos).</p>';
  list.forEach((tr, i) => {
    const where = tr.edge === 'in' ? 'Ouverture de la vidéo' : tr.edge === 'out' ? 'Fin de la vidéo' : `Transition à ${sec(tr.t)}`;
    h += `<div class="nx-st-trans"><div class="st-field nx-st-row"><span>${where}</span><button class="icon-btn small" data-nxa="trans-del" data-i="${i}" title="Retirer cette transition" aria-label="Retirer cette transition">${icon('trash', 13)}</button></div>
      ${chips(`trans:${i}.kind`, tr.kind, A.TRANSITIONS)}
      ${tr.edge ? '' : range('Position', `trans:${i}.t`, tr.t, 0, D, 0.05, sec)}
      ${range('Durée', `trans:${i}.dur`, tr.dur ?? 0.6, 0.1, 3, 0.05, sec)}</div>`;
  });
  h += `<div class="st-btns">${btn('trans-add', 'Ajouter à la tête de lecture', 'plus')}${list.some((x) => x.edge === 'in') ? '' : btn('trans-in', 'Ouverture en fondu', 'nxTransition')}${list.some((x) => x.edge === 'out') ? '' : btn('trans-out', 'Fin en fondu', 'nxTransition')}</div>`;
  const m = A.musicBuffer(S);
  h += field('Rythme de la musique', m
    ? `${S.anim.nxBpm ? `<p class="nx-st-note">${S.anim.nxBpm} battements par minute · ${(S.anim.nxBeats || []).length} temps dans la vidéo.</p>` : ''}<div class="st-btns">${btn('beats', S.anim.nxBpm ? 'Analyser à nouveau' : 'Détecter le rythme', 'nxBeat')}${S.anim.nxBeats && S.anim.nxBeats.length ? btn('beats-snap', 'Caler les clés sur les temps', 'keyframe') + btn('beats-cut', 'Flash sur chaque mesure', 'nxTransition') : ''}</div>`
    : '<p class="nx-st-note">Ajoute une musique (carte « Musique des vidéos ») pour caler l’animation sur son rythme.</p>');
  return h + '</section>';
}
function animCard(S, ids) {
  const d = (S.nxDrop = S.nxDrop || { height: 30, bounce: 0.5 });
  return `<section class="st-card nx-st-card" data-nxcard="animation">${head(`${icon('nxPhysics', 13)} Animation physique`)}
    ${range('Hauteur de chute', 'drop:height', d.height, 5, 120, 1, FMT.int)}
    ${range('Rebond', 'drop:bounce', d.bounce, 0, 0.85, 0.01)}
    <div class="st-btns">${btn('drop', ids.length > 1 ? `Faire tomber les ${ids.length} objets` : 'Créer une chute avec rebonds', 'nxPhysics')}</div>
    ${check('Afficher la trajectoire sur la scène', 'path:on', !!S.nxShowPath)}
  </section>`;
}
function combineCard(S, ids) {
  return `<section class="st-card nx-st-card" data-nxcard="combiner">${head(`${icon('nxCombine', 13)} Combiner les deux formes`)}
    <p class="nx-st-note">Crée un nouvel objet à partir des deux formes sélectionnées. Les originaux sont masqués, pas supprimés.</p>
    <div class="st-btns">${Object.entries(M.BOOLS).map(([op, l]) => btn(`combine-${op}`, l.split(' (')[0], 'nxCombine')).join('')}</div>
  </section>`;
}

// ---------- Application des réglages ----------
const HEAVY = new Set(['nxMat.wear', 'nxMat.scratches']);
function applyEnvKey(S, path, v, final) {
  setPath(R.nxEnv(S), path, v);
  if (path.startsWith('dof.auto') && v === false && R.nxEnv(S).dof.focus == null) R.nxEnv(S).dof.focus = Math.round(S.three.nxFocus ? S.three.nxFocus() : 60);
  R.refresh(S); S.dirty = true;
  if (final) S.commit();
}
function applyItemKey(S, path, v, final) {
  const e = S.sel && S.objects.get(S.sel); if (!e) return;
  if (path === 'nxMat.kind' && v !== 'none' && !(e.item.nxMat && e.item.nxMat.scale)) setPath(e.item, 'nxMat.scale', 1);
  // Cercle : rayon de départ calculé d’après la taille de l’objet, affiché tel quel dans le panneau.
  if (path === 'nxArr.mode' && v === 'circle' && !(e.item.nxArr && e.item.nxArr.radius)) { const s = new Box3().setFromObject(e.model.root).getSize(new Vector3()); setPath(e.item, 'nxArr.radius', Math.max(5, Math.min(200, Math.round(Math.max(s.x, s.z) * 1.3)))); }
  setPath(e.item, path, v);
  if (path.startsWith('nxMat.') && (final || !HEAVY.has(path))) M.applyMatter(e);
  if (path.startsWith('nxArr.') || path.startsWith('nxWave.')) M.applyArray(e);
  S.dirty = true;
  if (final) S.commit();
}
function apply(S, key, v, final) {
  const [scope, path] = key.split(':');
  if (scope === 'env') applyEnvKey(S, path, v, final); else if (scope === 'item') applyItemKey(S, path, v, final);
  else if (scope === 'drop') { S.nxDrop[path] = v; }
  else if (scope === 'path') { S.nxShowPath = !!v; A.drawPath(S); }
  else if (scope === 'trans') { const [i, f] = path.split('.'); const tr = A.transitions(S)[Number(i)]; if (!tr) return; tr[f] = v; S.dirty = true; S.drawOverlay(); if (final) S.commit(); }
}
const parse = (raw) => (raw === 'true' ? true : raw === 'false' ? false : raw !== '' && !Number.isNaN(Number(raw)) && !/^#/.test(raw) ? Number(raw) : raw);
// Réglages qui changent les commandes affichées : on redessine le panneau.
const RESHAPE = /(\.on|\.kind|\.mode|\.bg|\.auto|nxInteract\.click|particles\.type|nxWave\.amp)$/;

async function onAction(S, el) {
  const a = el.dataset.nxa;
  if (a === 'gif') return R.exportFrames(S, { kind: 'gif' });
  if (a === 'webm') return R.exportFrames(S, { kind: 'webm' });
  if (a === 'passes-zip') return R.exportPasses(S);
  if (a === 'passes-design') return R.exportPasses(S, { toDesign: true });
  if (a === 'web-file') return W.exportWeb(S, 'file');
  if (a === 'web-dev') return W.exportWeb(S, 'dev');
  if (a === 'test') { W.toggleTest(S); return S.renderProps(); }
  if (a === 'preset-save') { await W.savePreset(S); return S.renderProps(); }
  if (a === 'preset-apply') return W.applyPreset(S, el.dataset.id);
  if (a === 'preset-del') { const p = W.myPresets().find((x) => x.id === el.dataset.id); W.deletePreset(el.dataset.id); toast(`Mise en scène « ${p ? p.name : ''} » supprimée.`); return S.renderProps(); }
  if (a.startsWith('combine-')) return M.combine(S, S.selection(), a.slice(8));
  if (a === 'drop') return A.physicsDrop(S, S.selection(), S.nxDrop);
  if (a.startsWith('trans-')) {
    const list = A.transitions(S);
    if (a === 'trans-add') list.push({ kind: 'black', t: Math.round(S.time * 100) / 100, dur: 0.6 });
    if (a === 'trans-in') list.unshift({ kind: 'black', edge: 'in', dur: 0.8 });
    if (a === 'trans-out') list.push({ kind: 'black', edge: 'out', dur: 0.8 });
    if (a === 'trans-del') list.splice(Number(el.dataset.i), 1);
    S.dirty = true; S.drawOverlay(); S.commit(); return S.renderProps();
  }
  if (a === 'beats') { const r = A.analyseBeats(S); if (r) toast(`Rythme détecté : ${r.bpm} battements par minute, ${S.anim.nxBeats.length} temps dans la vidéo.`); S.commit(); return S.renderProps(); }
  if (a === 'beats-snap') { const n = A.snapKeysToBeats(S); S.applyTime(); S.timeline.render(); S.commit(); A.drawPath(S); toast(n ? `${n} clé${n > 1 ? 's' : ''} calée${n > 1 ? 's' : ''} sur les temps de la musique.` : 'Aucune clé à moins de 0,6 s d’un temps : rien à caler.'); return; }
  if (a === 'beats-cut') { const b = S.anim.nxBeats || []; const list = A.transitions(S); let n = 0; for (let i = 4; i < b.length; i += 4) { if (!list.some((x) => !x.edge && Math.abs(x.t - b[i]) < 0.05)) { list.push({ kind: 'white', t: b[i], dur: 0.25 }); n++; } } list.sort((x, y) => (x.edge === 'in' ? -1 : y.edge === 'in' ? 1 : x.edge === 'out' ? 1 : y.edge === 'out' ? -1 : x.t - y.t)); S.dirty = true; S.drawOverlay(); S.commit(); toast(n ? `${n} flash ajouté${n > 1 ? 's' : ''}, un toutes les 4 temps.` : 'La vidéo est trop courte pour une mesure complète.'); return S.renderProps(); }
}

// ---------- Navigation caméra (bas à droite de la vue) : réduite par défaut ----------
// Le Studio mémorise déjà l'état dans settings.camNavFolded ; sans choix enregistré, le bloc est réduit
// à son bouton caméra. Un clic sur ce bouton l'ouvre ou le referme, et ce choix reste mémorisé.
function camNavLabel(nav) {
  const b = nav && nav.querySelector('.cn-fold'); if (!b) return;
  const folded = nav.classList.contains('folded');
  const t = folded ? 'Afficher la navigation caméra' : 'Réduire la navigation caméra';
  b.title = t; b.setAttribute('aria-label', t); b.setAttribute('aria-expanded', String(!folded));
}
function foldCamNav(S) {
  if (settings.camNavFolded === undefined) { settings.camNavFolded = true; saveSettings(); }
  const nav = S.$.frame && S.$.frame.parentElement && S.$.frame.parentElement.querySelector('.st-camnav');
  if (!nav) return;
  nav.classList.toggle('folded', !!settings.camNavFolded);
  camNavLabel(nav);
  if (!nav.dataset.nxFold) { nav.dataset.nxFold = '1'; new MutationObserver(() => camNavLabel(nav)).observe(nav, { attributes: true, attributeFilter: ['class'] }); }
}

export async function install(S) {
  if (S.nxInstalled) return; S.nxInstalled = true;
  R.installRender(S);
  A.registerEases();
  foldCamNav(S);
  const proto = Object.getPrototypeOf(S);
  // Mouvements de caméra ajoutés au menu existant (même bouton, même gestion du clic).
  const camMove = proto.cameraMove; const camMenu = proto.cameraMovesMenu;
  proto.cameraMove = function (kind, ...rest) { return A.CAM_MOVES[kind] ? A.cameraMove(this, kind) : camMove.call(this, kind, ...rest); };
  proto.cameraMovesMenu = function (...args) {
    const r = camMenu.apply(this, args);
    const pops = [...document.querySelectorAll('.popover')].filter((p) => p.querySelector('[data-mv]'));
    const pop = pops[pops.length - 1];
    if (pop && !pop.querySelector('[data-mv="orbit360"]')) {
      const html = Object.entries(A.CAM_MOVES).map(([k, [n, l]]) => `<button class="menu-item" data-mv="${k}">${icon('video', 15)}<span><b>${esc(n)}</b><small>${esc(l)}</small></span></button>`).join('');
      const note = pop.querySelector('.pop-note'); if (note) note.insertAdjacentHTML('beforebegin', html); else pop.insertAdjacentHTML('beforeend', html);
    }
    return r;
  };
  // Transitions : aperçu (calque de surimpression) et images des vidéos / GIF (pas les photos).
  const paint = proto.paintOverlay; const drawOv = proto.drawOverlay;
  proto.paintOverlay = function (cv, t, photo, ...rest) {
    const r = paint.call(this, cv, t, photo, ...rest);
    if (!photo) { const c = r && r.getContext ? r : cv; try { A.drawTransitions(this, c.getContext('2d'), c.width, c.height, t); } catch (err) { console.warn('[NEXORA #013] transitions', err); } }
    return r;
  };
  proto.drawOverlay = function (...args) {
    const r = drawOv.apply(this, args); const c = this.$.overlay;
    if (c && this.anim.nxTrans && this.anim.nxTrans.length) { const x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); A.drawTransitions(this, x, c.width, c.height, this.time); }
    return r;
  };
  // La trajectoire est une aide d'édition : masquée dans les rendus comme les autres aides.
  // Le Studio redéfinit setEditorHelpers sur l'instance (grille) : on enveloppe cette fonction-là.
  const helpers = S.three.setEditorHelpers;
  S.three.setEditorHelpers = function (v, ...rest) { const r = helpers.call(this, v, ...rest); if (S.three.nxPath) S.three.nxPath.visible = !!v; return r; };
  const commit = proto.commit;
  proto.commit = function (...args) { const r = commit.apply(this, args); if (this.nxShowPath) A.drawPath(this); return r; };
  S.nxQuality = () => R.QUALITY[R.qualityName()] ? R.qualityName() : 'normal';
  // Matières, répétitions et vagues sont réappliquées chaque fois qu'un objet est reconstruit
  // (changement de finition, annulation, réouverture de la scène, duplication).
  const build = proto.build;
  proto.build = function (item, ...rest) {
    const r = build.call(this, item, ...rest);
    const e = this.objects.get(item.id);
    if (e && (item.nxMat || item.nxArr || item.nxWave)) { try { M.applyMatter(e); M.applyArray(e); } catch (err) { console.warn('[NEXORA #011] matière', err); } }
    return r;
  };
  for (const id of S.order) { const e = S.objects.get(id); if (e && (e.item.nxMat || e.item.nxArr || e.item.nxWave)) { M.applyMatter(e); M.applyArray(e); } }
  const rp0 = proto.renderProps0;
  proto.renderProps0 = function (...args) {
    const r = rp0.apply(this, args);
    if (this.space !== 'scene' || !this.nxInstalled) return r;
    try {
      const ids = this.selection(); let extra = '';
      if (ids.length >= 2) extra = (ids.length === 2 && ids.every((id) => M.canMatter(this.objects.get(id).item)) ? combineCard(this, ids) : '') + animCard(this, ids);
      else if (ids.length === 1) { const e = this.objects.get(ids[0]); extra = (e && M.canMatter(e.item) ? decorCards(this, e.item) : '') + (e ? animCard(this, ids) : ''); }
      else if (!this.sel) extra = sceneCards(this);
      A.drawPath(this);
      if (extra) this.$.props.insertAdjacentHTML('beforeend', extra);
    } catch (err) { console.error('[NEXORA #011] panneau du Studio', err); }
    return r;
  };
  const P = S.$.props;
  P.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-nx],[data-nxa]'); if (!el || !P.contains(el)) return;
    ev.stopPropagation();
    try {
      if (el.dataset.nxa) { await onAction(S, el); return; }
      if (el.dataset.nx === 'quality') { R.setQuality(S, el.dataset.val); S.renderProps(); return; }
      apply(S, el.dataset.nx, parse(el.dataset.val), true); S.renderProps();
    } catch (err) { console.error(err); toast(err.message || String(err), { kind: 'bad' }); }
  }, true);
  const onInput = (ev, final) => {
    const el = ev.target; const d = el.dataset || {};
    const key = d.nxr || d.nxc || d.nxk || d.nxt; if (!key) return;
    ev.stopPropagation();
    const v = d.nxc ? el.checked : d.nxr ? Number(el.value) : el.value;
    if (d.nxt && !final) return;
    apply(S, key, v, final);
    if (d.nxr) { const b = P.querySelector(`[data-nxv="${key}"]`); if (b) b.textContent = FMT[d.fmt](v); }
    if (d.nxk) { const lab = el.closest('.st-color'); if (lab) lab.style.setProperty('--c', v); }
    if (final && (d.nxc || RESHAPE.test(key))) S.renderProps();
  };
  P.addEventListener('input', (ev) => onInput(ev, false), true);
  P.addEventListener('change', (ev) => onInput(ev, true), true);
  S.renderProps();
}
