// NEXORA #055 : fonctions ajoutées au Studio 3D & Motion, posées après le module #011 (nx/studio) sur l'instance
// state.studio, sans modifier le code compilé : création par l'IA, import OBJ/STL/PLY/SPLAT, réseaux sociaux et
// zones de sécurité, bruitages, repères et clés, rendus par lots, packs web et réalité augmentée, Lottie,
// validation des vidéos, versions, bibliothèque d'équipe, écran depuis NEX-DESIGN, confort et accessibilité.
import { esc, toast, busy, done, has, card, btn, btns, note, field, chips, check, details, icon, sleep } from './ui.js';
import * as MODELS from './models.js';
import * as DIR from './direction.js';
import * as AUDIO from './audio.js';
import * as KEYS from './keys.js';
import * as EXP from './exports.js';
import * as REVIEW from './review.js';
import * as TEAM from './team.js';
import * as BR from './bridges.js';
import * as COMFORT from './comfort.js';
import * as DEV from './devices.js';
// NEXORA #118 : contour de sélection et mises en scène réalistes.
import * as OUTLINE from './outline.js';
import * as STAGE from './stagings.js';

const DECISION = { approve: 'approuvé', changes: 'changements demandés', comment: 'commentaire' };
const fmtT = (t) => `${(Math.round(t * 100) / 100).toString().replace('.', ',')} s`;

// ---------- Cartes de la scène ----------
function sceneCards(S) {
  const pro = has();
  let h = card('ia', 'Créer avec l’IA', 'sparkle', `${note('Décrivez la vidéo : l’IA choisit la mise en scène, l’animation, la caméra, le rendu, les textes et les transitions. Tout reste modifiable.')}
    <textarea class="input sx-area" rows="3" data-sxt="ia" placeholder="Ex. : présentation dynamique de mon app de livraison, ambiance soirée, 10 secondes">${esc(S.sxPrompt || '')}</textarea>
    ${btns(btn('ia-direct', 'Créer la mise en scène', 'sparkle', { primary: true }))}
    ${details('Objet composé par l’IA', 'cube', `${note('L’IA assemble un objet à partir de formes simples (boîtes, sphères, cylindres…), ajouté comme un modèle importé.')}<input class="input" data-sxt="obj" value="${esc(S.sxObjPrompt || '')}" placeholder="Ex. : une tasse de café avec sa soucoupe">${btns(btn('ia-object', 'Composer l’objet', 'cube'))}`)}`, { pro: true });
  // NEXORA #100 : appareils réalistes (react-3d-mockups, MIT), à taille réelle, écran habillé.
  h += card('devices', 'Appareils réalistes', 'phone', `${note('Modèles détaillés à taille réelle (aluminium, verre, caméras, clavier). L’écran reprend la capture de la scène s’il y en a une, sinon un fond NEXORA ; changez-le ensuite depuis le panneau de l’appareil.')}
    ${DEV.GROUPS.map(([g, keys]) => field(esc(g), `<div class="sx-devs">${keys.map((k) => `<button class="btn small" data-sx="dev-add" data-k="${k}" title="Ajouter ${esc(DEV.DEVICES[k].name)} à la scène">${icon('plus', 12)}<span>${esc(DEV.DEVICES[k].name)}</span></button>`).join('')}</div>`)).join('')}`);
  h += card('import', 'Importer un modèle', 'upload', `${note('OBJ, STL et PLY (maillages) ; PLY et SPLAT des applications de capture 3D (affichés en nuage de points). Le modèle est centré, posé au sol et mis à l’échelle. Pour un GLB, utilisez « Importer » de la barre du bas.')}${btns(btn('import-model', 'OBJ, STL, PLY ou SPLAT', 'upload'))}`);
  const pick = DIR.socialPick(S);
  h += card('social', 'Réseaux sociaux et stores', 'phone', `${field('Formats', `<div class="sx-checks">${Object.entries(DIR.FORMATS).map(([k, l]) => check(esc(l), `social:${k}`, !!pick[k])).join('')}</div>`)}
    ${btns(btn('social-export', 'Exporter les vidéos (MP4)', 'video', { primary: true }))}
    ${btns(btn('safe', S.nxSafe ? 'Masquer les zones de sécurité' : 'Afficher les zones de sécurité', 'eye', { extra: `aria-pressed="${!!S.nxSafe}"` }))}
    ${note('Les zones rouges sont couvertes par la légende, les boutons ou le nom du compte : gardez-y le décor, pas le texte. Elles n’apparaissent jamais dans les rendus.')}
    ${btns(btn('play-store', 'Images de la fiche Play Store', 'android'))}`);
  const sfx = AUDIO.list(S);
  h += card('sfx', 'Bruitages', 'music', `${note('Ajoutés à la tête de lecture, mêlés à la musique et à la voix off dans les vidéos MP4. Sons créés par NEXORA, libres de droits.')}
    <div class="sx-sfx">${Object.entries(AUDIO.SFX).map(([k, l]) => `<div class="sx-sfx-row"><button class="icon-btn small" data-sx="sfx-listen" data-k="${k}" title="Écouter « ${esc(l)} »" aria-label="Écouter « ${esc(l)} »">${icon('play', 12)}</button><span>${esc(l)}</span><button class="btn small" data-sx="sfx-add" data-k="${k}" title="Ajouter « ${esc(l)} » à la tête de lecture">${icon('plus', 12)}<span>Ajouter</span></button></div>`).join('')}</div>
    ${sfx.length ? `<div class="sx-list">${sfx.map((s, i) => `<div class="sx-row"><button class="sx-link" data-sx="go" data-t="${s.t}">${fmtT(s.t)}</button><span>${esc(AUDIO.SFX[s.kind] || s.kind)}</span><button class="icon-btn small" data-sx="sfx-del" data-i="${i}" title="Retirer ce bruitage" aria-label="Retirer ce bruitage">${icon('trash', 12)}</button></div>`).join('')}</div>` : ''}`);
  const mk = KEYS.marks(S);
  h += card('marks', 'Repères', 'nxMarker', `${note('Points de repère nommés sur la frise (changement de plan, arrivée du texte…), affichés en haut de l’aperçu.')}
    ${mk.length ? `<div class="sx-list">${mk.map((m, i) => `<div class="sx-row"><button class="sx-link" data-sx="go" data-t="${m.t}">${fmtT(m.t)}</button><span>${esc(m.label)}</span><button class="icon-btn small" data-sx="mark-del" data-i="${i}" title="Retirer ce repère" aria-label="Retirer ce repère">${icon('trash', 12)}</button></div>`).join('')}</div>` : ''}
    ${btns(btn('mark-add', 'Repère à la tête de lecture', 'plus'))}`);
  h += card('exports', 'Rendus et intégrations', 'download', `${btns(btn('angles', 'Angles produit (PNG transparents)', 'image'), btn('lottie', 'Animation Lottie', 'film'))}
    ${btns(btn('web-pack', 'Pack web interactif', 'globe'), btn('ar-pack', 'Réalité augmentée', 'cube'))}
    ${note('Angles : six vues en rendu accumulé (ombres fines). Lottie : une image par étape (12 i/s, 480 px). Pack web : page interactive, page au défilement, Web Component, composant React et GLB. Réalité augmentée : USDZ pour Quick Look, GLB pour Scene Viewer, page et code QR.')}`, { pro: true });
  h += reviewCard(S, pro);
  h += versionsCard(S);
  h += teamCard(S, pro);
  const c = COMFORT.comfort();
  h += card('comfort', 'Aperçu et accessibilité', 'eye', `${check('Aperçu adaptatif (résolution réduite quand l’image saccade)', 'cf:adaptive', c.adaptive)}${check('Afficher les images par seconde', 'cf:fps', c.fps)}${check('Signaler les flashs rapides dans les vidéos exportées', 'cf:flash', c.flash)}${check('Contour orange autour de l’objet sélectionné (jamais dans les rendus)', 'cf:outline', c.outline)}
    ${note(`Aperçu : ${S.sxFps || '…'} i/s${S.sxScale && S.sxScale < 1 ? ', résolution allégée' : ''}. Les pages web exportées restent immobiles quand le système demande moins d’animations.`)}`);
  return h;
}
function reviewCard(S, pro) {
  const L = S.sxReview;
  if (pro && L === undefined && !S.sxReviewLoading) { S.sxReviewLoading = true; REVIEW.links(S).then((r) => { S.sxReview = r; S.sxReviewLoading = false; S.renderProps(); }).catch(() => { S.sxReview = []; S.sxReviewLoading = false; }); }
  const list = L === null ? '<p class="nx-st-note">Connectez-vous à votre compte NEXORA pour envoyer une vidéo à valider.</p>' : L && L.length ? `<div class="sx-list">${L.map((l) => { const rv = (l.design_reviews || []).slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))); return `<div class="sx-review"><div class="sx-row"><b>${esc(l.name)}</b><span class="grow"></span>${l.active ? `<button class="icon-btn small" data-sx="rv-copy" data-k="${esc(l.token)}" title="Copier le lien" aria-label="Copier le lien">${icon('copy', 12)}</button><button class="icon-btn small" data-sx="rv-close" data-k="${esc(l.token)}" title="Fermer le lien" aria-label="Fermer le lien">${icon('lock', 12)}</button>` : '<small>fermé</small>'}</div>${rv.slice(0, 4).map((r) => `<small class="sx-quote">${r.t != null ? `<button class="sx-link" data-sx="go" data-t="${r.t}">${REVIEW.at(r.t)}</button> ` : ''}${esc(r.author)} (${esc(DECISION[r.decision] || '')}) : « ${esc(r.comment || '—')} »</small>`).join('') || '<small class="sx-quote">Aucun avis pour l’instant.</small>'}</div>`; }).join('')}</div>` : '<p class="nx-st-note">Aucun lien pour cette scène.</p>';
  return card('review', 'Validation client', 'pass', `${note('La vidéo (MP4 720p) est envoyée avec un lien : votre client la regarde sans compte, commente à une seconde précise et choisit « Approuver » ou « Demander des changements ». Chaque avis vous est notifié.')}${btns(btn('rv-new', 'Envoyer la vidéo à valider', 'link', { primary: true }), btn('rv-load', 'Actualiser', 'refreshCw'))}${pro ? list : ''}`, { pro: true });
}
function versionsCard(S) {
  const V = TEAM.versions(S);
  return card('versions', 'Versions de la scène', 'nxHistory', `${V.length ? `<div class="sx-list">${V.map((v) => `<div class="sx-row">${v.thumb ? `<img class="sx-thumb" src="${esc(v.thumb)}" alt="">` : ''}<span><b>${esc(v.name)}</b><small>${new Date(v.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</small></span><span class="grow"></span><button class="icon-btn small" data-sx="v-cmp" data-k="${esc(v.id)}" title="Comparer avec la scène actuelle" aria-label="Comparer avec la scène actuelle">${icon('eye', 12)}</button><button class="btn small" data-sx="v-restore" data-k="${esc(v.id)}">Revenir</button><button class="icon-btn small" data-sx="v-del" data-k="${esc(v.id)}" title="Supprimer cette version" aria-label="Supprimer cette version">${icon('trash', 12)}</button></div>`).join('')}</div>` : note('Gardez une version à chaque étape importante (12 au plus par scène).')}
    ${S.sxCompare ? TEAM.compareHtml(S, S.sxCompare) : ''}
    ${btns(btn('v-save', 'Enregistrer une version', 'plus'))}`);
}
function teamCard(S, pro) {
  const L = S.sxLibs;
  if (pro && L === undefined && !S.sxLibsLoading) { S.sxLibsLoading = true; TEAM.libs().then((r) => { S.sxLibs = r; S.sxLibsLoading = false; S.renderProps(); }).catch(() => { S.sxLibs = []; S.sxLibsLoading = false; }); }
  const list = L === null ? '<p class="nx-st-note">Connectez-vous à votre compte NEXORA pour partager avec votre équipe.</p>' : L && L.length ? `<div class="sx-list">${L.map((l) => { const f = TEAM.fresh(l); return `<div class="sx-row">${l.data && l.data.thumb ? `<img class="sx-thumb" src="${esc(l.data.thumb)}" alt="">` : ''}<span><b>${esc(l.name)}</b><small>mise à jour le ${new Date(l.updated_at).toLocaleDateString('fr-FR')}${f ? ' · nouvelle version' : f === false ? ' · dans Mes mises en scène' : ''}</small></span><span class="grow"></span><button class="btn small${f ? ' primary' : ''}" data-sx="tm-take" data-k="${esc(l.id)}" title="${f === null ? 'Ajouter' : 'Mettre à jour'} « ${esc(l.name)} »">${f === null ? 'Ajouter' : f ? 'Mettre à jour' : 'Reprendre'}</button></div>`; }).join('')}</div>` : '<p class="nx-st-note">Rien n’est encore partagé dans votre espace.</p>';
  return card('team', 'Bibliothèque d’équipe 3D', 'group', `${note('Partagez la scène (appareils, lumières, rendu, animation) avec les membres de votre espace ; ils la retrouvent dans « Mes mises en scène ».')}${btns(btn('tm-publish', 'Partager cette scène', 'upload', { primary: true }), btn('tm-load', 'Actualiser', 'refreshCw'))}${pro ? list : ''}`, { pro: true });
}

// ---------- Cartes de l'objet sélectionné ----------
function itemCards(S, id) {
  const e = S.objects.get(id); if (!e) return '';
  const tr = KEYS.track(S, id); let h = '';
  h += card('keys', 'Clés de l’animation', 'keyframe', `${note(tr.length ? `${tr.length} clé(s) sur cet objet.` : 'Aucune clé sur cet objet : ajoutez-en avec « Ajouter une clé » ou une animation toute faite.')}
    ${btns(btn('k-copy', 'Copier les clés', 'copy', { extra: tr.length ? '' : 'disabled' }), btn('k-paste', 'Coller à la tête de lecture', 'paste', { extra: KEYS.hasClip() ? '' : 'disabled' }))}
    ${tr.length ? `${btns(btn('k-shift', '− 0,25 s', 'chevronLeft', { extra: 'data-d="-0.25"' }), btn('k-shift', '+ 0,25 s', 'chevronRight', { extra: 'data-d="0.25"' }))}
    ${field('Courbe d’accélération', `<div class="sx-eases">${KEYS.EASE_NAMES().map((n) => `<button class="sx-ease${tr.every((k) => k.ease === n) ? ' on' : ''}" data-sx="k-ease" data-k="${esc(n)}" title="${KEYS.easeLabel(n)}">${KEYS.curve(n)}<span>${KEYS.easeLabel(n)}</span></button>`).join('')}</div>`)}` : ''}`);
  if (e.item.type === 'device') {
    const docs = S.sxDocs;
    if (docs === undefined && !S.sxDocsLoading) { S.sxDocsLoading = true; BR.designPages().then((d) => { S.sxDocs = d; S.sxDocsLoading = false; S.renderProps(); }).catch(() => { S.sxDocs = []; S.sxDocsLoading = false; }); }
    h += card('design', 'Écran depuis NEX-DESIGN', 'palette', docs && docs.length ? `${note('Affichez une page de vos documents NEX-DESIGN sur l’écran de cet appareil.')}<div class="sx-list">${docs.map((d) => `<div class="sx-row">${d.thumb ? `<img class="sx-thumb" src="${esc(d.thumb)}" alt="">` : ''}<span><b>${esc(d.name)}</b><small>${d.pages} page(s)</small></span><span class="grow"></span><button class="btn small" data-sx="design-screen" data-k="${esc(d.id)}" title="Afficher « ${esc(d.name)} » sur l’écran">Afficher</button></div>`).join('')}</div>` : note(docs ? 'Aucun document NEX-DESIGN pour l’instant : créez une page dans NEX-DESIGN, elle apparaîtra ici.' : 'Chargement de vos documents…'));
  }
  if (e.item.nxDevice) {
    const docs = S.sxDocs;
    if (docs === undefined && !S.sxDocsLoading) { S.sxDocsLoading = true; BR.designPages().then((d) => { S.sxDocs = d; S.sxDocsLoading = false; S.renderProps(); }).catch(() => { S.sxDocs = []; S.sxDocsLoading = false; }); }
    const name = (DEV.DEVICES[e.item.nxDevice] || {}).name || 'Appareil';
    h += card('dev-screen', `Écran · ${name}`, 'display', `${note('Modèle réaliste : l’image est recadrée au format exact de l’écran, sans déformation.')}
      ${btns(btn('dev-pick', 'Choisir une image…', 'image', { primary: true }), btn('dev-reset', 'Fond NEXORA', 'refreshCw'))}
      ${docs && docs.length ? field('Page NEX-DESIGN', `<div class="sx-list">${docs.map((d) => `<div class="sx-row">${d.thumb ? `<img class="sx-thumb" src="${esc(d.thumb)}" alt="">` : ''}<span><b>${esc(d.name)}</b><small>${d.pages} page(s)</small></span><span class="grow"></span><button class="btn small" data-sx="dev-design" data-k="${esc(d.id)}" title="Afficher « ${esc(d.name)} » sur l’écran">Afficher</button></div>`).join('')}</div>`) : ''}`);
  }
  if (e.item.nxPoints) h += card('points', 'Nuage de points', 'nxParticles', `<div class="st-field"><span>Taille des points<b data-sxv="pts">${e.item.nxPoints.toFixed(2).replace('.', ',')}</b></span><input type="range" min="0.02" max="0.6" step="0.01" value="${e.item.nxPoints}" data-sxr="pts"></div>${note('Capture 3D affichée en points colorés (pas de rendu « gaussian splatting » complet).')}`);
  return h;
}

// ---------- Actions ----------
async function onAction(S, el) {
  const a = el.dataset.sx; const k = el.dataset.k; const sel = S.sel && S.sel !== 'camera' ? S.sel : null;
  if (a === 'ia-direct') { const t = (S.$.props.querySelector('[data-sxt="ia"]') || {}).value || ''; if (!t.trim()) { toast('Décrivez d’abord la vidéo voulue.', { kind: 'bad' }); return; } S.sxPrompt = t; await DIR.direct(S, t.trim()); return; }
  if (a === 'ia-object') { const t = (S.$.props.querySelector('[data-sxt="obj"]') || {}).value || ''; if (!t.trim()) { toast('Décrivez d’abord l’objet voulu.', { kind: 'bad' }); return; } S.sxObjPrompt = t; await MODELS.aiObject(S, t.trim()); return; }
  if (a === 'import-model') return MODELS.importModel(S);
  if (a === 'social-export') return DIR.exportSocial(S);
  if (a === 'play-store') return EXP.playStore(S);
  if (a === 'safe') { S.nxSafe = !S.nxSafe; S.dirty = true; S.drawOverlay(); return S.renderProps(); }
  if (a === 'sfx-listen') return AUDIO.listen(k);
  if (a === 'sfx-add') { AUDIO.add(S, k); return S.renderProps(); }
  if (a === 'sfx-del') { AUDIO.list(S).splice(+el.dataset.i, 1); S.commit(); return S.renderProps(); }
  if (a === 'go') { S.setTime(+el.dataset.t); return; }
  if (a === 'mark-add') return KEYS.addMark(S);
  if (a === 'mark-del') { KEYS.marks(S).splice(+el.dataset.i, 1); S.dirty = true; S.commit(); return S.renderProps(); }
  if (a === 'angles') return EXP.batchAngles(S);
  if (a === 'lottie') return EXP.lottie(S);
  if (a === 'web-pack') return EXP.webPack(S);
  if (a === 'ar-pack') return EXP.arPack(S);
  if (a === 'rv-new') { const l = await REVIEW.create(S); if (l) { S.sxReview = undefined; S.renderProps(); } return; }
  if (a === 'rv-load') { S.sxReview = undefined; return S.renderProps(); }
  if (a === 'rv-copy') { const { webUrl } = await import('../designplus/share.js'); const u = `${webUrl()}#/revue/${k}`; const { api } = await import('./ui.js'); await api.invoke('clipboard:write', u).catch(() => navigator.clipboard.writeText(u)); toast('Lien copié.'); return; }
  if (a === 'rv-close') { await REVIEW.close(k); S.sxReview = undefined; return S.renderProps(); }
  if (a === 'v-save') { await TEAM.save(S); return S.renderProps(); }
  if (a === 'v-restore') { S.sxCompare = null; return TEAM.restore(S, k); }
  if (a === 'v-del') { TEAM.remove(S, k); if (S.sxCompare === k) S.sxCompare = null; return S.renderProps(); }
  if (a === 'v-cmp') { S.sxCompare = S.sxCompare === k ? null : k; return S.renderProps(); }
  if (a === 'tm-publish') { if (await TEAM.publish(S)) { S.sxLibs = undefined; S.renderProps(); } return; }
  if (a === 'tm-load') { S.sxLibs = undefined; return S.renderProps(); }
  if (a === 'tm-take') { const l = (S.sxLibs || []).find((x) => x.id === k); if (l) { TEAM.take(l); S.renderProps(); } return; }
  if (a === 'k-copy' && sel) return KEYS.copy(S, sel);
  if (a === 'k-paste' && sel) return KEYS.paste(S, sel);
  if (a === 'k-shift' && sel) return KEYS.shift(S, sel, Number(el.dataset.d));
  if (a === 'k-ease' && sel) return KEYS.ease(S, sel, k);
  if (a === 'design-screen') return BR.toScreen(S, k);
  if (a === 'dev-add') { await DEV.add(S, k); return; }
  if (a === 'dev-pick') return DEV.pickScreen(S);
  if (a === 'dev-reset') return DEV.setScreen(S, null, 'Fond NEXORA rétabli.');
  if (a === 'dev-design') { const t = busy('Rendu de la page NEX-DESIGN…'); try { const r = await BR.pageImage(k); await DEV.setScreen(S, r.image, r.label); } finally { done(t); } return; }
}
function onInput(S, el, final) {
  const d = el.dataset;
  if (d.sxk) {
    const v = el.checked;
    if (d.sxk.startsWith('social:')) DIR.socialPick(S)[d.sxk.slice(7)] = v;
    else if (d.sxk.startsWith('cf:')) { COMFORT.set(d.sxk.slice(3), v); S.dirty = true; }
    return true;
  }
  if (d.sxr === 'pts') {
    const e = S.sel && S.objects.get(S.sel); if (!e) return true;
    e.item.nxPoints = Number(el.value); MODELS.dressPoints(S, e.item);
    const b = S.$.props.querySelector('[data-sxv="pts"]'); if (b) b.textContent = e.item.nxPoints.toFixed(2).replace('.', ',');
    if (final) S.commit();
    return true;
  }
  if (d.sxt) { if (d.sxt === 'ia') S.sxPrompt = el.value; if (d.sxt === 'obj') S.sxObjPrompt = el.value; return true; }
  return false;
}

export async function install(S) {
  if (S.sxInstalled) return; S.sxInstalled = true;
  if (!document.querySelector('link[data-sx-css]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('./studioplus.css', import.meta.url).href; l.dataset.sxCss = '1'; document.head.append(l); }
  const proto = Object.getPrototypeOf(S);
  AUDIO.wrapExport(proto);
  COMFORT.wrapFlash(proto);
  COMFORT.watch(S);
  // Aides d'aperçu (zones de sécurité, repères) : calque de surimpression seulement, jamais dans les rendus.
  if (!proto.sxDrawOverlay) {
    proto.sxDrawOverlay = proto.drawOverlay;
    proto.drawOverlay = function (...args) {
      const r = this.sxDrawOverlay(...args); const c = this.$.overlay;
      if (c && (this.nxSafe || (this.anim.nxMarks && this.anim.nxMarks.length))) { const x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); try { DIR.drawSafe(this, x, c.width, c.height); KEYS.drawMarks(this, x, c.width, c.height); } catch (e) { console.warn('[NEXORA #055]', e); } }
      return r;
    };
  }
  // Nuages de points : taille des points rétablie à chaque reconstruction de l'objet.
  if (!proto.sxBuild) {
    proto.sxBuild = proto.build;
    proto.build = function (item, ...rest) { const r = this.sxBuild(item, ...rest); if (item && item.nxPoints) { try { MODELS.dressPoints(this, item); } catch { /* */ } } return r; };
  }
  for (const id of S.order) { const e = S.objects.get(id); if (e && e.item.nxPoints) MODELS.dressPoints(S, e.item); }
  // NEXORA #118 : contour de la sélection tracé après chaque rendu de la vue d'édition (jamais dans les rendus).
  if (!proto.sxAfterView) {
    proto.sxAfterView = proto.afterViewRender || null;
    proto.afterViewRender = function (...args) {
      try { OUTLINE.draw(this, COMFORT.comfort().outline); } catch (e) { console.warn('[NEXORA #118] contour', e); }
      return this.sxAfterView ? this.sxAfterView(...args) : undefined;
    };
    proto.sxSelect = proto.select;
    proto.select = function (...args) { const r = this.sxSelect(...args); this.dirty = true; return r; };
  }
  // NEXORA #118 : mises en scène réalistes ajoutées à la liste « Mises en scène » du panneau de gauche.
  if (!proto.sxRenderPresets && proto.renderPresets) {
    proto.sxRenderPresets = proto.renderPresets;
    proto.renderPresets = function (...args) { const r = this.sxRenderPresets(...args); try { this.$.presets.insertAdjacentHTML('beforeend', STAGE.listHtml()); } catch (e) { console.warn('[NEXORA #118]', e); } return r; };
  }
  if (S.$.presets && !S.$.presets.dataset.sxStage) {
    S.$.presets.dataset.sxStage = '1';
    S.$.presets.addEventListener('click', (ev) => { const b = ev.target.closest('[data-sx-scene]'); if (!b) return; ev.stopPropagation(); STAGE.apply(S, b.dataset.sxScene); }, true);
    if (S.renderPresets) S.renderPresets();
  }
  const rp = proto.renderProps0;
  proto.renderProps0 = function (...args) {
    const r = rp.apply(this, args);
    if (this.space !== 'scene' || !this.sxInstalled) return r;
    try {
      const ids = this.selection(); let extra = '';
      if (ids.length === 1 && ids[0] !== 'camera') extra = itemCards(this, ids[0]);
      else if (!this.sel) extra = sceneCards(this);
      if (extra) this.$.props.insertAdjacentHTML('beforeend', extra);
    } catch (err) { console.error('[NEXORA #055] panneau du Studio', err); }
    return r;
  };
  const P = S.$.props;
  P.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-sx]'); if (!el || !P.contains(el) || el.disabled) return;
    ev.stopPropagation();
    try { await onAction(S, el); } catch (err) { console.error(err); toast(err.message || String(err), { kind: 'bad' }); }
  }, true);
  P.addEventListener('input', (ev) => { if (onInput(S, ev.target, false)) ev.stopPropagation(); }, true);
  P.addEventListener('change', (ev) => { if (onInput(S, ev.target, true)) ev.stopPropagation(); }, true);
  window.__nxStudioPlus = { S, apply: (plan) => DIR.apply(S, plan) };
  await sleep(0);
  S.renderProps();
}
