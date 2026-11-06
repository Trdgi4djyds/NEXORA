// NEXORA #053 : fonctions ajoutées à NEX-DESIGN, branchées sur l'éditeur déjà créé (state.design) comme le
// module #011, sans modifier le code compilé :
//  - panneau « Design » à onglets (variables, prototype, code, accessibilité, polices, série, impression,
//    import, IA, icônes et espaces, versions, validation, équipe) ;
//  - sections du panneau de droite (mise en page automatique, variables liées, variantes, prototype,
//    inspection, texte de remplacement, retouche intelligente) ; Maj+A ; mesures avec Alt.
// NEXORA #054 : onglet « Responsive » et section « Contraintes », bibliothèques d'équipe tenues à jour,
// nouveaux avis de validation signalés à l'ouverture du document.
import { esc, ico, toast, prompt, has, allowed, gate, STD, PRO, api, isText } from './ui.js';
import * as AL from './autolayout.js';
import * as VAR from './variables.js';
import * as VNT from './variants.js';
import * as PROTO from './proto.js';
import * as CODE from './code.js';
import * as A11Y from './a11y.js';
import * as AI from './ai.js';
import * as MEASURE from './measure.js';
import * as FONTS from './fonts.js';
import * as RESP from './responsive.js';
import * as LIB from './library.js';

const TABS = [
  ['variables', 'Variables', 'nxPalette', STD, () => VAR],
  ['proto', 'Prototype', 'play', STD, () => PROTO],
  ['code', 'Code', 'code', STD, () => CODE],
  ['responsive', 'Tailles d’écran', 'nxResize', STD, () => RESP],
  ['a11y', 'Accessibilité', 'eye', '', () => A11Y],
  ['fonts', 'Polices', 'text', '', () => FONTS],
  ['bulk', 'Série', 'layers', STD, () => import('./bulk.js')],
  ['print', 'Impression', 'pdf', STD, () => import('./print.js')],
  ['import', 'Importer', 'download', '', () => import('./importers.js')],
  ['ai', 'IA', 'sparkle', PRO, () => AI],
  ['spaces', 'Icônes et espaces', 'android', STD, () => import('./spaces.js')],
  ['versions', 'Versions', 'nxHistory', STD, () => import('./versions.js')],
  ['review', 'Validation', 'pass', PRO, () => REVIEW],
  ['team', 'Équipe', 'group', PRO, () => TEAM],
];
const states = {};
const st = (id) => (states[id] = states[id] || {});
const clean = (e) => String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

// ---------- Onglet « Validation » ----------
const seenOf = (D) => (D.doc.nxReviewSeen = D.doc.nxReviewSeen || {});
const unseen = (D, l) => (l.design_reviews || []).filter((r) => String(r.created_at) > String(seenOf(D)[l.token] || '')).length;
const REVIEW = {
  panel(D, s) {
    const L = s.links;
    // Les avis affichés comptent comme lus à l'affichage suivant.
    if (L && L.length) setTimeout(() => { let ch = false; for (const l of L) { const last = (l.design_reviews || []).map((r) => String(r.created_at)).sort().pop(); if (last && last !== seenOf(D)[l.token]) { seenOf(D)[l.token] = last; ch = true; } } if (ch) { D.changed(); news(D); } }, 0);
    return `<p class="dzx-hint">Envoie un lien à ton client : il voit les pages sans compte, épingle ses commentaires et choisit « Approuver » ou « Demander des changements ». Les pages sont publiées en images au moment de la création du lien.</p>
      <div class="nx-btns"><button class="btn small primary" data-dzx="rv-new">${ico('link', 13)}<span>Créer un lien de validation</span></button><button class="icon-btn" data-dzx="rv-load" title="Actualiser">${ico('refreshCw', 13)}</button></div>
      ${L === null ? '<p class="dzx-hint">Connecte-toi à ton compte NEXORA pour utiliser la validation.</p>' : L ? (L.length ? `<div class="dzp-list">${L.map((l) => { const rv = l.design_reviews || []; const last = rv.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]; return `<div class="dzp-item ${last && last.decision === 'approve' ? 'ok' : last && last.decision === 'changes' ? 'bad' : ''}"><span><b>${esc(l.name)}${unseen(D, l) ? ` <em class="dzp-new">${unseen(D, l)} nouveau${unseen(D, l) > 1 ? 'x' : ''}</em>` : ''}</b><small>${new Date(l.created_at).toLocaleDateString('fr-FR')} · ${rv.length} avis${last ? ` · dernier : ${esc(last.author)} (${esc({ approve: 'approuvé', changes: 'changements demandés', comment: 'commentaire' }[last.decision] || '')})` : ''}${l.active ? '' : ' · fermé'}</small>${rv.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 4).map((r) => `<small class="dzp-quote">« ${esc(r.comment || '—')} » — ${esc(r.author)}, page ${r.page + 1}</small>`).join('')}</span>${l.active ? `<button class="icon-btn" data-rvcopy="${esc(l.token)}" title="Copier le lien">${ico('copy', 13)}</button><button class="icon-btn" data-rvclose="${esc(l.token)}" title="Fermer le lien">${ico('lock', 13)}</button>` : ''}</div>`; }).join('')}</div>` : '<p class="dzx-hint">Aucun lien pour ce document.</p>') : ''}`;
  },
  async onPanel(D, e, rerender, s) {
    const SH = await import('./share.js');
    const t = e.target;
    if (t.closest('[data-dzx="rv-load"]')) { s.links = await SH.links(D); rerender(); return true; }
    if (t.closest('[data-dzx="rv-new"]')) {
      try {
        const url = await SH.createLink(D, async () => (await PROTO.build(D, 1)).map((p) => ({ name: p.name, w: p.w, h: p.h, img: p.img })));
        await api.invoke('clipboard:write', url).catch(() => navigator.clipboard.writeText(url));
        toast('Lien de validation copié : envoie-le à ton client.');
        s.links = await SH.links(D); rerender();
      } catch (er) { toast(clean(er), { kind: 'bad' }); }
      return true;
    }
    const cp = t.closest('[data-rvcopy]');
    if (cp) { const url = `${SH.webUrl()}#/revue/${cp.dataset.rvcopy}`; await api.invoke('clipboard:write', url).catch(() => navigator.clipboard.writeText(url)); toast('Lien copié.'); return true; }
    const cl = t.closest('[data-rvclose]');
    if (cl) { await SH.closeLink(cl.dataset.rvclose); s.links = await SH.links(D); rerender(); return true; }
    return false;
  },
};
// ---------- Onglet « Équipe » ----------
const KINDS = LIB.KINDS;
const TEAM = {
  panel(D, s) {
    const L = s.libs;
    const up = L ? LIB.pending(D, L) : [];
    const mine = D.doc.nxLibs || {};
    return `<p class="dzx-hint">Partage tes composants, variables et kit de marque avec les membres de ton espace : ils les importent dans leurs documents. Après chaque nouvelle publication, les documents qui les utilisent proposent la mise à jour à leur ouverture, copies des composants comprises.</p>
      ${up.length ? `<div class="dzp-gate dzp-update">${ico('refreshCw', 16)}<div><b>${up.length === 1 ? `« ${esc(up[0].name)} » a une nouvelle version` : `${up.length} bibliothèques ont une nouvelle version`}</b><small>Publiée par ton équipe depuis ton import.</small></div><button class="btn small primary" data-dzx="tm-update-all">Mettre à jour</button></div>` : ''}
      <div class="nx-btns"><button class="btn small primary" data-dzx="tm-pub-components">${ico('upload', 13)}<span>Publier les composants</span></button><button class="btn small" data-dzx="tm-pub-variables">${ico('upload', 13)}<span>Publier les variables</span></button><button class="btn small" data-dzx="tm-pub-brand">${ico('upload', 13)}<span>Publier le kit de marque</span></button><button class="icon-btn" data-dzx="tm-load" title="Actualiser">${ico('refreshCw', 13)}</button></div>
      ${L === null ? '<p class="dzx-hint">Connecte-toi à ton compte NEXORA pour partager avec ton équipe.</p>' : L ? (L.length ? `<div class="dzp-list">${L.map((l) => `<div class="dzp-item"><span><b>${esc(l.name)}</b><small>${esc(KINDS[l.kind] || l.kind)} · mis à jour le ${new Date(l.updated_at).toLocaleDateString('fr-FR')}${mine[l.id] ? (up.includes(l) ? ' · nouvelle version' : ' · à jour dans ce document') : ''}</small></span>${up.includes(l) ? `<button class="btn small primary" data-tmimport="${esc(l.id)}" title="${esc(`Mettre à jour « ${l.name} »`)}">Mettre à jour</button>` : `<button class="btn small" data-tmimport="${esc(l.id)}" title="${esc(`${mine[l.id] ? 'Réimporter' : 'Importer'} « ${l.name} »`)}">${mine[l.id] ? 'Réimporter' : 'Importer'}</button>`}</div>`).join('')}</div>` : '<p class="dzx-hint">Rien n’est encore partagé dans ton espace.</p>') : ''}`;
  },
  async onPanel(D, e, rerender, s) {
    const SH = await import('./share.js');
    const t = e.target;
    if (t.closest('[data-dzx="tm-load"]')) { s.libs = await SH.libraries(); rerender(); return true; }
    const pub = t.closest('[data-dzx^="tm-pub-"]');
    if (pub) {
      const kind = pub.dataset.dzx.slice(7);
      const name = await prompt(`Publier : ${KINDS[kind]}`, { label: 'Nom dans la bibliothèque de l’équipe', value: D.doc.name || KINDS[kind], icon: 'group', go: 'Publier' });
      if (!name) return true;
      const { getBrand } = await import('../services.js');
      const data = kind === 'components' ? { components: D.doc.nxComponents || {}, sets: D.doc.nxSets || {} } : kind === 'variables' ? VAR.store(D) : getBrand();
      try {
        await SH.publish(kind, name.trim(), data);
        s.libs = await SH.libraries();
        // Le document qui publie est à jour de sa propre publication.
        const l = (s.libs || []).find((x) => x.kind === kind && x.name === name.trim()); if (l) { LIB.remember(D, l); D.changed(); }
        toast('Publié dans la bibliothèque de l’équipe : les documents qui l’utilisent proposeront la mise à jour.'); rerender(); news(D);
      } catch (er) { toast(clean(er), { kind: 'bad' }); }
      return true;
    }
    if (t.closest('[data-dzx="tm-update-all"]')) {
      const list = LIB.pending(D, s.libs || []); const msgs = [];
      for (const l of list) msgs.push(await LIB.apply(D, l));
      toast(msgs.join(' ') || 'Tout est déjà à jour.'); rerender(); news(D);
      return true;
    }
    const im = t.closest('[data-tmimport]');
    if (im) {
      const l = (s.libs || []).find((x) => x.id === im.dataset.tmimport);
      if (!l) return true;
      toast(await LIB.apply(D, l)); rerender(); news(D);
      return true;
    }
    return false;
  },
};

// ---------- Panneau « Design » ----------
let current = 'variables';
function host(D) {
  let el = D.$.stage.querySelector('.dzp');
  if (el) return el;
  el = document.createElement('section');
  el.className = 'dzp';
  el.hidden = true;
  el.setAttribute('aria-label', 'Fonctions de design');
  D.$.stage.append(el);
  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-dzp-close]')) { el.hidden = true; return; }
    const tab = e.target.closest('[data-dzp-tab]');
    if (tab) { current = tab.dataset.dzpTab; render(D); return; }
    const T = TABS.find((x) => x[0] === current);
    if (T[3] && !has(T[3]) && current !== 'import') return;
    const mod = await T[4]();
    try { if (mod.onPanel) await mod.onPanel(D, e, () => render(D), st(current)); } catch (er) { toast(clean(er), { kind: 'bad' }); console.error('[NEXORA #053]', er); }
  });
  const onInput = async (e) => {
    const mod = await TABS.find((x) => x[0] === current)[4]();
    if (mod.onPanelInput) await mod.onPanelInput(D, e, st(current), (keep) => render(D, keep));
  };
  el.addEventListener('input', onInput);
  el.addEventListener('change', onInput);
  return el;
}
export async function render(D, keepFocus = false) {
  const el = host(D);
  const T = TABS.find((x) => x[0] === current);
  const mod = await T[4]();
  const s = st(current);
  if (current === 'review' && s.links === undefined && has(PRO)) { const SH = await import('./share.js'); s.links = await SH.links(D); }
  if (current === 'team' && s.libs === undefined && has(PRO)) { const SH = await import('./share.js'); s.libs = await SH.libraries(); }
  if (current === 'import' && s.figmaToken === undefined) s.figmaToken = await api.invoke('dzx:figma-token', {}).then((r) => Boolean(r && r.saved)).catch(() => false);
  const focus = keepFocus && document.activeElement && el.contains(document.activeElement) ? [...document.activeElement.attributes].find((a) => a.name.startsWith('data-'))?.name : null;
  let body;
  if (T[3] && !has(T[3])) body = gate(T[3], T[1] === 'IA' ? 'L’IA de NEX-DESIGN' : `L’onglet « ${T[1]} »`);
  else body = current === 'import' ? mod.panel(D, s, { std: has(STD), pro: has(PRO) }) : mod.panel(D, s);
  el.innerHTML = `<header class="dzp-top"><b>${ico(T[2], 15)} ${esc(T[1])}</b><button class="icon-btn" data-dzp-close title="Fermer" aria-label="Fermer">${ico('close', 14)}</button></header>
    <nav class="dzp-tabs">${TABS.map(([id, label, icon, perm]) => `<button class="${id === current ? 'on' : ''}" data-dzp-tab="${id}" title="${esc(id === 'ai' ? 'IA de NEX-DESIGN' : label)}">${ico(icon, 14)}<span>${esc(label)}</span>${perm === PRO && !has(PRO) ? '<em class="dzp-pro">Pro</em>' : perm === STD && !has(STD) ? '<em class="dzp-pro">Standard</em>' : ''}</button>`).join('')}</nav>
    <div class="dzp-body">${body}</div>`;
  const bar = D.$.tools;
  if (bar) el.style.setProperty('--dzp-top', `${bar.offsetTop + bar.offsetHeight + 8}px`);
  el.hidden = false;
  if (focus) { const f = el.querySelector(`[${focus}]`); if (f) { f.focus(); if (f.setSelectionRange && f.value) f.setSelectionRange(f.value.length, f.value.length); } }
}
export function open(D, tab) { if (tab) current = tab; render(D); }

// ---------- Nouveautés du document (bibliothèques d'équipe, avis de validation) ----------
// Point sur le bouton de la barre d'outils tant qu'il reste une mise à jour ou un avis non lu.
const newsState = { libs: [], reviews: 0, doc: null };
function dot(D) { const b = D.$.tools && D.$.tools.querySelector('[data-dzxtb]'); if (b) b.classList.toggle('dzx-news', Boolean(newsState.libs.length || newsState.reviews)); }
async function news(D, { announce = false } = {}) {
  if (!has(PRO) || !D.doc) return;
  try {
    const SH = await import('./share.js');
    // Bibliothèques lues seulement si le document en a importé ; sinon l'onglet Équipe les lira à l'ouverture.
    const libs = D.doc.nxLibs && Object.keys(D.doc.nxLibs).length ? await SH.libraries() : null;
    newsState.libs = libs ? LIB.pending(D, libs) : [];
    const links = await SH.links(D);
    newsState.reviews = (links || []).reduce((n, l) => n + unseen(D, l), 0);
    if (libs) st('team').libs = libs;
    st('review').links = links;
    if (announce) {
      if (newsState.libs.length) await LIB.check(D, { libraries: async () => libs, onOpen: () => open(D, 'team') });
      else if (newsState.reviews) toast(`${newsState.reviews} nouvel${newsState.reviews > 1 ? 's' : ''} avis sur la validation de ce document.`, { action: 'Voir', onAction: () => open(D, 'review') });
    }
  } catch (e) { console.warn('[NEXORA #054]', e); }
  dot(D);
}

// ---------- Panneau de droite ----------
function propsHtml(D) {
  const s = D.sel();
  if (!s.length) return '';
  const o = s.length === 1 ? s[0] : null;
  let h = AL.props(D, o || s[0]);
  if (!o) return h;
  if (has(STD)) h += VNT.props(D, o) + VAR.props(D, o) + RESP.props(D, o) + PROTO.props(D, o) + CODE.inspect(D, o);
  h += A11Y.altProps(D, o) + AI.imageProps(D, o, has(PRO));
  return h;
}
async function onField(D, k, v) {
  const s = D.sel(); const o = s.length === 1 ? s[0] : s[0];
  if (!o) return;
  if (k === 'alt') { o.nxAlt = v; D.changed(); return; }
  if (AL.onField(D, o, k, v)) { D.renderProps(); return; }
  if (RESP.onField(D, o, k, v)) { D.renderProps(); return; }
  if (VAR.onField(D, o, k, v)) { D.renderProps(); return; }
  if (await VNT.onField(D, o, k, v)) { D.renderProps(); return; }
  PROTO.onField(D, o, k, v);
}
async function onAction(D, a) {
  const s = D.sel(); const o = s.length === 1 ? s[0] : null;
  if (a === 'auto-new') { AL.create(D); D.renderProps(); return; }
  if (a === 'auto-add' && o) { AL.addItem(D, AL.groupOf(o)); D.renderProps(); return; }
  if (a === 'auto-off' && o) { AL.remove(D, AL.groupOf(o)); D.renderProps(); return; }
  if (a === 'open-variables') { open(D, 'variables'); return; }
  if (a === 'open-code') { open(D, 'code'); return; }
  if (a === 'open-responsive') { open(D, 'responsive'); return; }
  if (a === 'proto-play') { PROTO.play(D); return; }
  if (a === 'css-copy' && o) { await navigator.clipboard.writeText(CODE.cssLines(D, o).join('\n')).catch(() => {}); toast('CSS copié.'); return; }
  if (a === 'alt-ai' && o) { await A11Y.altAi(D, o); return; }
  if (o && await VNT.onAction(D, o, a)) { D.renderProps(); return; }
  if (a === 'ai-upscale' && o) { await AI.retouch(D, o, 'upscale'); return; }
  if (a.startsWith('ai-') && o) {
    if (!allowed(PRO, 'La retouche par l’IA')) return;
    const ask = { 'ai-erase': ['Effacer un objet', 'Que faut-il effacer ? (ex. : la personne à gauche, le texte en bas)'], 'ai-bg': ['Remplacer le fond', 'Nouveau fond (ex. : plage au coucher du soleil, studio blanc)'], 'ai-edit': ['Autre retouche', 'Décris la retouche (ex. : rendre la photo plus lumineuse, ajouter de la neige)'] }[a];
    let text = '';
    if (ask) { text = await prompt(ask[0], { label: ask[1], icon: 'sparkle', go: 'Retoucher' }); if (!text) return; }
    await AI.retouch(D, o, { 'ai-erase': 'erase', 'ai-bg': 'background', 'ai-expand': 'expand', 'ai-edit': 'edit' }[a], text);
  }
}

export async function install(D) {
  if (D.dzxInstalled) return;
  D.dzxInstalled = true;
  if (!document.querySelector('link[data-dzx-css]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('./designplus.css', import.meta.url).href; l.dataset.dzxCss = '1'; document.head.append(l); }
  const proto = Object.getPrototypeOf(D);
  if (!proto.dzxPaintProps) {
    proto.dzxPaintProps = proto.paintProps;
    proto.paintProps = function () {
      this.dzxPaintProps();
      const f = this.$.props;
      const focused = f && f.contains(document.activeElement) && document.activeElement.matches('input, select, textarea');
      if (focused || !this.page) return;
      try { f.insertAdjacentHTML('beforeend', propsHtml(this)); } catch (e) { console.warn('[NEXORA #053]', e); }
    };
  }
  if (!proto.dzxLoadPage) {
    proto.dzxLoadPage = proto.loadPage;
    proto.loadPage = async function (pg, json) {
      await this.dzxLoadPage(pg, json);
      try { AL.afterLoad(this); if (this.doc.nxVars && this.doc.nxVars.list.length) VAR.applyAll(this); FONTS.restore(this).catch(() => {}); } catch (e) { console.warn('[NEXORA #053]', e); }
      // NEXORA #054 : nouveautés vérifiées une fois à l'ouverture de chaque document.
      if (this.doc && newsState.doc !== this.doc.id) { newsState.doc = this.doc.id; st('team').libs = undefined; st('review').links = undefined; news(this, { announce: true }); }
    };
  }
  if (!proto.dzxOnKey) {
    proto.dzxOnKey = proto.onKey;
    proto.onKey = async function (e) {
      const typing = e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
      const a = this.canvas.getActiveObject();
      if (!typing && !(a && a.isEditing) && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'a' && this.sel().length) { e.preventDefault(); AL.create(this); this.renderProps(); return; }
      return this.dzxOnKey(e);
    };
  }
  const f = D.$.props;
  f.addEventListener('change', (e) => { const t = e.target; if (t.dataset.dzxk) onField(D, t.dataset.dzxk, t.type === 'checkbox' ? t.checked : t.value).catch((er) => toast(clean(er), { kind: 'bad' })); });
  f.addEventListener('click', (e) => { const b = e.target.closest('[data-dzx]'); if (!b || b.disabled) return; e.stopPropagation(); onAction(D, b.dataset.dzx).catch((er) => toast(clean(er), { kind: 'bad' })); });
  // Bouton de la barre d'outils.
  const bar = D.$.tools;
  const ref = bar.querySelector('[data-nxtb="more"]') || bar.querySelector('[data-dz="export"]');
  if (ref && !bar.querySelector('[data-dzxtb]')) ref.insertAdjacentHTML('afterend', `<button class="dz-tool nx-tb" data-dzxtb title="Fonctions de design" aria-label="Fonctions de design : variables, prototype, code, accessibilité, polices, série, impression, import, IA, icônes, versions, validation, équipe">${ico('nxGridCols', 16)}</button>`);
  bar.addEventListener('click', (e) => { if (!e.target.closest('[data-dzxtb]')) return; e.stopPropagation(); const el = host(D); if (!el.hidden) el.hidden = true; else render(D); });
  AL.bind(D);
  MEASURE.bind(D);
  AL.afterLoad(D);
  if (D.doc.nxVars && D.doc.nxVars.list.length) VAR.applyAll(D);
  FONTS.restore(D).catch(() => {});
  window.__nxDesignPlus = { open: (tab) => open(D, tab) };
  if (D.doc) { newsState.doc = D.doc.id; news(D, { announce: true }); }
  D.renderProps();
  void isText;
}
