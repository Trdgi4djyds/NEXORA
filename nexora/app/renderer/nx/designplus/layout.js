// NEXORA #075 : NEX-DESIGN rangé (audit #075 : A-038, A-044), sans modifier le code compilé.
//  - barre d'outils : les outils de dessin défilent si la place manque (flèche visible) ; groupe de droite toujours
//    visible : zoom, IA de design, Partager, Présenter, Exporter ; Annuler et Rétablir avec leurs vraies icônes ;
//  - menu du document = menu « Fichier » (tous les documents et corbeille, import, versions, historique,
//    accessibilité, raccourcis) ; menu du zoom = affichage (règles, repères et grille) ;
//  - un seul menu « IA de design », un menu « Partager », un menu « Présenter » ;
//  - panneau de droite : onglets Design, Prototype et Code ; sections rangées par tâche, repliables (état gardé) ;
//    les effets réunis en une seule section quand l'offre le permet ;
//  - « Tous les documents » : recherche, tri, ouverture, copie, corbeille (30 jours) ; « Supprimer ce document »
//    passe aussi par la corbeille.
import { esc, ico, toast, menu, closePopover, settings, saveSettings, el, sheet, closeSheet, sheetHtml, uid, api } from '../core.js';
import { has, allowed, STD, PRO, pl } from './ui.js';
import * as PG from '../design/pages.js';
import { keysHelp, toggleFloat, nxTool } from '../design/index.js';

let CTX = null;

// ---------- Barre d'outils ----------
function toolbar(D) {
  const bar = D.$.tools;
  if (!bar || bar.querySelector('.nx-tb-end')) return;
  bar.classList.add('nx-tb2');
  const zoom = bar.querySelector('[data-dz="zoom"]');
  const exp = bar.querySelector('[data-dz="export"]');
  const undo = bar.querySelector('[data-dz="undo"]');
  const redo = bar.querySelector('[data-dz="redo"]');
  if (undo) undo.innerHTML = ico('nxUndo', 16);
  if (redo) redo.innerHTML = ico('nxRedo', 16);
  const scroll = document.createElement('div');
  scroll.className = 'nx-tb-scroll';
  for (const c of [...bar.children]) if (c !== zoom && c !== exp) scroll.append(c);
  while (scroll.lastElementChild && scroll.lastElementChild.classList.contains('dz-sep')) scroll.lastElementChild.remove();
  const more = el(`<button class="dz-tool nx-tb-more" data-nx2="more" title="Autres outils" aria-label="Autres outils" hidden>${ico('nxChevR', 15)}</button>`);
  const end = el('<div class="nx-tb-end"><span class="dz-sep"></span></div>');
  if (zoom) end.append(zoom);
  end.insertAdjacentHTML('beforeend', `<span class="dz-sep"></span>
    <button class="dz-tool" data-nx2="ai" title="IA de design : textes, images, palettes, maquettes" aria-haspopup="true">${ico('sparkle', 16)}</button>
    <button class="dz-tool" data-nx2="share" title="Partager : validation client, lien, coédition, commentaires, bibliothèques" aria-haspopup="true">${ico('nxShare', 16)}</button>
    <button class="dz-tool" data-nx2="present" title="Présenter et tester (F5)" aria-haspopup="true">${ico('play', 16)}</button>`);
  if (exp) end.append(exp);
  bar.append(scroll, more, end);
  const atEnd = () => scroll.scrollLeft + scroll.clientWidth >= scroll.scrollWidth - 2;
  const sync = () => {
    more.hidden = scroll.scrollWidth <= scroll.clientWidth + 2;
    const back = atEnd();
    more.innerHTML = ico(back ? 'nxChevL' : 'nxChevR', 15);
    more.title = back ? 'Revenir aux premiers outils' : 'Autres outils';
  };
  const ro = new ResizeObserver(sync);
  ro.observe(bar); ro.observe(D.$.stage);
  scroll.addEventListener('scroll', sync, { passive: true });
  requestAnimationFrame(sync);
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-nx2]');
    if (!b) {
      // L'outil choisi reste visible quand la barre est trop étroite.
      const t = e.target.closest('.nx-tb-scroll > *'); if (t && t.scrollIntoView) t.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return;
    }
    e.stopPropagation();
    const k = b.dataset.nx2;
    if (k === 'more') { scroll.scrollTo({ left: atEnd() ? 0 : scroll.scrollLeft + scroll.clientWidth * 0.7, behavior: 'smooth' }); return; }
    if (k === 'ai') aiMenu(D, b);
    if (k === 'share') shareMenu(D, b);
    if (k === 'present') presentMenu(D, b);
  });
}

// ---------- Menu « IA de design » (assistant du #011 et IA du #053 réunis) ----------
async function aiMenu(D, anchor) {
  const pro = has(PRO);
  const items = PG.AI_ITEMS(D);
  const pick = (ids) => items.filter((x) => ids.includes(x.id));
  const one = D.sel().length === 1 ? D.sel()[0] : null;
  const a = await menu(anchor, 'IA de design', [
    { head: 'Textes et couleurs' }, ...pick(['write', 'rewrite', 'palette', 'palimg']),
    { head: 'Images' }, ...pick(['image']),
    { id: 'retouch', icon: 'nxBrush', label: 'Retoucher l’image sélectionnée…', sub: `Effacer un objet, remplacer le fond, agrandir${pro ? '' : ' · offre Pro'}`, disabled: !(one && one.type === 'image') },
    { head: 'Maquettes' }, ...pick(['layout']),
    { id: 'design', icon: 'sparkle', label: 'Créer un design complet…', sub: `Depuis une description, aux couleurs de ta marque${pro ? '' : ' · offre Pro'}` },
    { id: 'variants', icon: 'layers', label: 'Proposer des variantes de la sélection…', sub: `Couleurs et polices${pro ? '' : ' · offre Pro'}`, disabled: !D.sel().length }
  ], { width: 330, align: 'end' });
  if (!a) return;
  if (a === 'design' || a === 'variants') { CTX.open('ai'); return; }
  if (a === 'retouch') {
    const r = await menu(anchor, 'Retoucher avec l’IA', [
      { id: 'ai-erase', icon: 'nxEraser', label: 'Effacer un objet…' },
      { id: 'ai-bg', icon: 'image', label: 'Remplacer le fond…' },
      { id: 'ai-expand', icon: 'nxResize', label: 'Agrandir au-delà des bords' },
      { id: 'ai-edit', icon: 'sparkle', label: 'Autre retouche…' },
      '-',
      { id: 'ai-upscale', icon: 'nxResize', label: 'Agrandir ×2', sub: 'Sur ce PC, sans IA' }
    ], { width: 300, align: 'end' });
    if (r) await CTX.action(r);
    return;
  }
  await PG.aiRun(D, anchor, a);
}

// ---------- Menu « Partager » ----------
async function shareMenu(D, anchor) {
  const n = CTX.news();
  const open = PG.comments(D).filter((c) => !c.done).length;
  const pro = has(PRO);
  const a = await menu(anchor, 'Partager', [
    { head: 'Avec ton client' },
    { id: 'review', icon: 'pass', label: n.reviews ? `Validation client · ${pl(n.reviews, 'nouvel avis', 'nouveaux avis')}` : 'Validation client…', sub: `Lien sans compte : avis épinglés, approbation${pro ? '' : ' · offre Pro'}` },
    { id: 'view', icon: 'link', label: 'Copier un lien en lecture seule', sub: 'Toutes les pages, sans compte, sans avis' },
    { head: 'Avec ton équipe' },
    ...(D.nxRoom ? [{ id: 'collab', icon: 'nxUsers', label: `Coédition en direct (salle ${D.nxRoom.code})…`, sub: 'Voir les personnes connectées, quitter' }]
      : [{ id: 'collab-doc', icon: 'nxUsers', label: 'Coéditer ce document en direct', sub: 'Toute l’équipe qui ouvre ce document rejoint la même salle' }, { id: 'collab', icon: 'nxUsers', label: 'Coéditer avec un code de salle…' }]),
    { id: 'comment', icon: 'nxComment', label: 'Ajouter un commentaire', kbd: 'Clic sur la page' },
    { id: 'comments', icon: 'nxComment', label: open ? `Commentaires (${open})` : 'Commentaires', sub: 'Équipe et clients réunis' },
    { id: 'team', icon: 'group', label: n.libs ? `Bibliothèques de l’équipe · ${pl(n.libs, 'mise à jour', 'mises à jour')}` : 'Bibliothèques de l’équipe…', sub: `Composants, variables, kit de marque${pro ? '' : ' · offre Pro'}` }
  ], { width: 330, align: 'end' });
  if (!a) return;
  if (a === 'review') CTX.open('review');
  if (a === 'team') CTX.open('team');
  if (a === 'collab') PG.collab(D);
  if (a === 'collab-doc') await PG.startRoom(D, PG.docRoomCode(D), 'doc');
  if (a === 'comment') nxTool(D, 'comment');
  if (a === 'comments') { await CTX.loadReviews().catch(() => null); toggleFloat(D, 'comments'); D.nxRenderComments && D.nxRenderComments(); }
  if (a === 'view') await viewLink(D);
}
async function viewLink(D) {
  const t = toast('Création du lien en lecture seule…', { busy: true, sticky: true });
  try {
    const PROTO = await import('./proto.js');
    const SH = await import('./share.js');
    const url = await SH.createLink(D, async () => (await PROTO.build(D, 1)).map((p) => ({ name: p.name, w: p.w, h: p.h, img: p.img })), { mode: 'view' });
    await api.invoke('clipboard:write', url).catch(() => navigator.clipboard.writeText(url));
    toast('Lien copié : toute personne qui l’a voit toutes les pages, sans pouvoir les modifier. Liste des liens : Partager → Validation client.');
  } catch (e) { toast(String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), { kind: 'bad' }); } finally { if (t && t.close) t.close(); }
}

// ---------- Menu « Présenter » ----------
async function presentMenu(D, anchor) {
  const a = await menu(anchor, 'Présenter et tester', [
    { id: 'present', icon: 'nxPresent', label: 'Présenter en plein écran', kbd: 'F5' },
    { id: 'proto', icon: 'play', label: 'Tester le prototype', sub: `Liens et actions au clic${has(STD) ? '' : ' · offre Pro'}` },
    { id: 'anim', icon: 'nxAnimate', label: D.nxPlaying ? 'Arrêter l’animation' : 'Lire l’animation de la page' }
  ], { width: 300, align: 'end' });
  if (a === 'present') PG.present(D, D.pageIdx);
  if (a === 'proto' && allowed(STD, 'Le prototype')) await CTX.action('proto-play');
  if (a === 'anim') PG.playPage(D);
}

// ---------- Menu du document = « Fichier » ; menu du zoom = affichage ----------
function addItems(D, items, { title } = {}) {
  const pop = document.getElementById('popover');
  if (!pop || pop.hidden) return null;
  if (title) { const t = pop.querySelector('.pop-title'); if (t) t.textContent = title; }
  pop.insertAdjacentHTML('beforeend', items.map((it) => (it === '-' ? '<div class="menu-sep"></div>' : it.head ? `<div class="pop-sub">${esc(it.head)}</div>` : `<button class="menu-item st-cm" data-nx74="${esc(it.id)}">${ico(it.icon, 14)}<span>${esc(it.label)}${it.chip ? ` <em class="dzp-pro">${esc(it.chip)}</em>` : ''}</span>${it.kbd ? `<kbd>${esc(it.kbd)}</kbd>` : ''}</button>`)).join(''));
  // La fenêtre a déjà été placée : elle défile si elle dépasse le bas de l'écran.
  const r = pop.getBoundingClientRect();
  if (r.bottom > innerHeight - 8) { pop.style.maxHeight = `${Math.max(200, innerHeight - r.top - 12)}px`; pop.style.overflowY = 'auto'; }
  return pop;
}
function patchMenus(D) {
  const proto = Object.getPrototypeOf(D);
  if (!proto.nx74Docs) {
    proto.nx74Docs = proto.docsMenu;
    proto.docsMenu = async function (anchor) {
      await this.nx74Docs(anchor);
      const std = has(STD);
      const pop = addItems(this, ['-', { head: 'Fichier' },
        { id: 'gallery', icon: 'nxFolder', label: 'Tous les documents et corbeille…' },
        { id: 'import', icon: 'nxImport', label: 'Importer un fichier PSD ou Figma…' },
        { id: 'versions', icon: 'nxHistory', label: 'Versions du document…', chip: std ? '' : 'Pro' },
        { id: 'history', icon: 'nxHistory', label: 'Historique des actions' },
        { id: 'a11y', icon: 'nxCheck', label: 'Vérifier l’accessibilité…' },
        { id: 'keys', icon: 'key', label: 'Raccourcis clavier', kbd: '?' }], { title: 'Fichier' });
      if (!pop) return;
      // L'ancien lien (une seule vignette) est remplacé par « Partager → Copier un lien en lecture seule ».
      const oldShare = pop.querySelector('[data-dact="share"]'); if (oldShare) oldShare.remove();
      for (const b of pop.querySelectorAll('[data-nx74]')) b.onclick = (e) => {
        e.stopPropagation(); closePopover();
        const k = b.dataset.nx74;
        if (k === 'gallery') gallery(this);
        if (k === 'import' || k === 'versions' || k === 'a11y') CTX.open(k);
        if (k === 'history') toggleFloat(this, 'history');
        if (k === 'keys') keysHelp(this.$.tools);
      };
    };
  }
  if (!proto.nx74Zoom) {
    proto.nx74Zoom = proto.zoomMenu;
    proto.zoomMenu = function (anchor) {
      const r = this.nx74Zoom(anchor);
      const pop = addItems(this, ['-', { id: 'rulers', icon: 'nxRuler2', label: 'Règles, repères et grille…' }]);
      if (pop) for (const b of pop.querySelectorAll('[data-nx74]')) b.onclick = (e) => { e.stopPropagation(); closePopover(); PG.rulersMenu(this, anchor || this.$.tools); };
      return r;
    };
  }
  // « Supprimer ce document » : copie gardée 30 jours dans la corbeille.
  if (!proto.nx74DocAction) {
    proto.nx74DocAction = proto.docAction;
    proto.docAction = async function (l, anchor) {
      if (l === 'del' && this.doc) {
        try { await this.save(); await trash.put(JSON.parse(JSON.stringify(this.doc))); } catch (e) { console.warn('[NEXORA #075] corbeille', e); }
        const name = this.doc.name; const id = this.doc.id;
        await this.nx74DocAction(l, anchor);
        toast(`« ${name} » est dans la corbeille (30 jours).`, { action: 'Annuler', onAction: () => restore(this, id, true) });
        return;
      }
      return this.nx74DocAction(l, anchor);
    };
  }
}

// ---------- Corbeille (IndexedDB de ce PC, 30 jours) ----------
const DAY = 86400000;
function trashDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('nexora-design-trash', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('docs', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const db = await trashDb();
  return new Promise((res, rej) => {
    const t = db.transaction('docs', mode); const req = fn(t.objectStore('docs'));
    t.oncomplete = () => { db.close(); res(req && 'result' in req ? req.result : undefined); };
    t.onerror = () => { db.close(); rej(t.error); };
  });
}
export const trash = {
  put: (doc) => tx('readwrite', (s) => s.put({ ...doc, trashedAt: Date.now() })),
  get: (id) => tx('readonly', (s) => s.get(id)),
  del: (id) => tx('readwrite', (s) => s.delete(id)),
  async list() {
    const all = (await tx('readonly', (s) => s.getAll())) || [];
    const old = all.filter((d) => Date.now() - d.trashedAt > 30 * DAY);
    for (const d of old) await trash.del(d.id);
    return all.filter((d) => !old.includes(d)).sort((a, b) => b.trashedAt - a.trashedAt);
  }
};
const store = () => import('../../dist/chunks/chunk-SKL2UTC7.js');
async function restore(D, id, openIt = false) {
  const d = await trash.get(id);
  if (!d) { toast('Ce document n’est plus dans la corbeille.'); return; }
  const { trashedAt, ...doc } = d; void trashedAt;
  const S = await store();
  await S.f(doc); await trash.del(id);
  if (openIt) { await D.save(); await D.openDoc(await S.e(id)); }
  toast(`« ${doc.name} » est de retour dans tes documents.`);
}

// ---------- Tous les documents ----------
async function gallery(D) {
  const S = await store();
  const st = { q: '', sort: settings.nxDocSort || 'recent', tab: 'docs' };
  const s = sheet('nx-docs', sheetHtml({ icon: 'nxFolder', title: 'Tous les documents', sub: 'Documents NEX-DESIGN gardés sur ce PC (ceux du cloud de l’équipe sont dans le menu du document).', body: '<div class="nx-docs-ui"></div>' }));
  if (!s) return;
  s.classList.add('nx-docs-sheet');
  const closeBtn = s.querySelector('[data-sheet="close"]'); if (closeBtn) closeBtn.textContent = 'Fermer';
  const box = s.querySelector('.nx-docs-ui');
  const paint = async () => {
    const docs = await S.d();
    const bin = await trash.list();
    const q = st.q.trim().toLowerCase();
    const list = (st.tab === 'docs' ? docs : bin).filter((d) => !q || String(d.name || '').toLowerCase().includes(q))
      .sort((a, b) => (st.sort === 'name' ? String(a.name).localeCompare(String(b.name), 'fr') : (st.tab === 'docs' ? b.updated - a.updated : b.trashedAt - a.trashedAt)));
    const date = (t) => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    box.innerHTML = `<div class="nx-docs-bar"><div class="seg"><button class="${st.tab === 'docs' ? 'on' : ''}" data-dtab="docs">Documents (${docs.length})</button><button class="${st.tab === 'bin' ? 'on' : ''}" data-dtab="bin">Corbeille (${bin.length})</button></div>
      <input class="input small" type="search" data-dq placeholder="Rechercher un document" value="${esc(st.q)}">
      <div class="seg"><button class="${st.sort === 'recent' ? 'on' : ''}" data-dsort="recent">Récents</button><button class="${st.sort === 'name' ? 'on' : ''}" data-dsort="name">Nom</button></div></div>
      ${list.length ? `<div class="nx-docs-grid">${list.map((d) => {
        const pages = Array.isArray(d.pages) ? d.pages.length : d.pages;
        const cur = D.doc && d.id === D.doc.id;
        return `<div class="nx-doc-card${cur ? ' on' : ''}"><button class="nx-doc-th" ${st.tab === 'docs' ? `data-dopen="${esc(d.id)}"` : ''} title="${esc(d.name)}">${d.thumb ? `<img src="${esc(d.thumb)}" alt="">` : ico('palette', 22)}</button>
          <div class="nx-doc-meta"><b>${esc(d.name || 'Sans titre')}</b><small>${pl(pages || 1, 'page', 'pages')} · ${st.tab === 'docs' ? date(d.updated) : `supprimé le ${date(d.trashedAt)}, encore ${Math.max(1, 30 - Math.floor((Date.now() - d.trashedAt) / DAY))} j`}${cur ? ' · ouvert' : ''}</small></div>
          <div class="nx-doc-acts">${st.tab === 'docs' ? `<button class="icon-btn small" data-ddup="${esc(d.id)}" title="Dupliquer">${ico('copy', 13)}</button><button class="icon-btn small" data-ddel="${esc(d.id)}" title="Mettre à la corbeille">${ico('trash', 13)}</button>`
            : `<button class="btn small" data-drest="${esc(d.id)}">${ico('nxRestore', 13)}<span>Restaurer</span></button><button class="icon-btn small" data-dpurge="${esc(d.id)}" title="Supprimer définitivement">${ico('trash', 13)}</button>`}</div></div>`;
      }).join('')}</div>` : `<p class="nx-muted nx-pad">${q ? 'Aucun document ne correspond à cette recherche.' : st.tab === 'docs' ? 'Aucun document pour l’instant.' : 'La corbeille est vide. Les documents supprimés y restent 30 jours.'}</p>`}`;
    const input = box.querySelector('[data-dq]');
    input.oninput = () => { const pos = input.selectionStart; st.q = input.value; paint().then(() => { const i2 = box.querySelector('[data-dq]'); i2.focus(); i2.setSelectionRange(pos, pos); }); };
    input.onkeydown = (e) => e.stopPropagation();
  };
  box.onclick = async (e) => {
    const t = (sel) => e.target.closest(sel);
    let b;
    if ((b = t('[data-dtab]'))) { st.tab = b.dataset.dtab; return paint(); }
    if ((b = t('[data-dsort]'))) { st.sort = b.dataset.dsort; settings.nxDocSort = st.sort; saveSettings(); return paint(); }
    if ((b = t('[data-dopen]'))) { closeSheet('nx-docs'); if (!D.doc || b.dataset.dopen !== D.doc.id) { await D.save(); await D.openDoc(await S.e(b.dataset.dopen)); } return; }
    if ((b = t('[data-ddup]'))) { await D.save(); const doc = JSON.parse(JSON.stringify(await S.e(b.dataset.ddup))); doc.id = uid(); doc.name = await D.nxDocName(`${doc.name} (copie)`); await S.f(doc); toast(`« ${doc.name} » créé.`); return paint(); }
    if ((b = t('[data-ddel]'))) {
      const id = b.dataset.ddel;
      if (D.doc && id === D.doc.id) { closeSheet('nx-docs'); await D.docAction('del'); return; }
      const doc = await S.e(id); if (!doc) return paint();
      await trash.put(doc); await S.g(id);
      const cm = await D.cloudMod().catch(() => null); if (cm && cm.designCloud.enabled()) cm.designCloud.remove(id).catch(() => {});
      toast(`« ${doc.name} » est dans la corbeille (30 jours).`, { action: 'Annuler', onAction: () => restore(D, id).then(paint) });
      return paint();
    }
    if ((b = t('[data-drest]'))) { await restore(D, b.dataset.drest); return paint(); }
    if ((b = t('[data-dpurge]'))) { await trash.del(b.dataset.dpurge); toast('Document supprimé définitivement.'); return paint(); }
    return undefined;
  };
  await paint();
}

// ---------- Panneau de droite : onglets, ordre par tâche, sections repliables ----------
const PTABS = [['design', 'Design'], ['proto', 'Prototype'], ['code', 'Code']];
const ORDER = [
  'Page', 'Déclinaisons', 'Style des nouvelles formes', 'Kit de marque',
  'Disposition', 'Contraintes', 'Mise en page automatique', 'Composant', 'Variantes', 'Cadre photo', 'Graphique', 'Tableau', 'Code QR', 'Répétition circulaire', 'Répétition en grille',
  'Remplissage', 'Couleur du texte', 'Texte', 'Styles de texte', 'Contour', 'Extrémités', 'Motif', 'Vectoriel',
  'Effets', 'Effets avancés', 'Calque',
  'Retouche', 'Retouche avancée', 'Retouche intelligente', 'Réglages non destructifs', 'Variables',
  'Prototype', 'Animation', 'Animation de la page', 'Prototype de la page',
  'Inspection', 'Texte de remplacement'
];
const TAB_OF = { Prototype: 'proto', Animation: 'proto', 'Animation de la page': 'proto', Inspection: 'code', 'Texte de remplacement': 'code' };
const FOLD_DEFAULT = ['Styles de texte', 'Motif', 'Extrémités', 'Variables', 'Réglages non destructifs'];
const titleOf = (c) => { const h = c.querySelector(':scope > .dz-card-h > span'); return h ? h.textContent.trim() : ''; };
const rank = (t) => (/^(Outil :|Édition des points|Lissage du crayon)/.test(t) ? -1 : ORDER.includes(t) ? ORDER.indexOf(t) : 400);
const folded = (t) => { const f = settings.nxDzFold || {}; return t in f ? Boolean(f[t]) : FOLD_DEFAULT.includes(t); };

export function organize(D) {
  const f = D.$.props;
  if (!f) return;
  let cards = [...f.children].filter((c) => c.classList && c.classList.contains('dz-card'));
  if (!cards.length) return;
  // Effets réunis : l'ombre portée d'origine rejoint les effets avancés quand l'offre les ouvre.
  if (has(STD)) {
    const orig = cards.find((c) => titleOf(c) === 'Effets' && !c.classList.contains('nx-card'));
    const adv = cards.find((c) => titleOf(c) === 'Effets avancés');
    if (orig && adv && !orig.contains(document.activeElement)) {
      const head = adv.querySelector(':scope > .dz-card-h');
      const moved = [...orig.children].filter((x) => !x.classList.contains('dz-card-h'));
      head.after(...moved);
      head.querySelector('span').textContent = 'Effets';
      orig.remove();
      cards = cards.filter((c) => c !== orig);
    }
  }
  // Ordre par tâche (tri stable : les sections inconnues gardent leur ordre, après les autres).
  const want = cards.map((c, i) => ({ c, i, r: rank(titleOf(c)) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.c);
  if (want.some((c, i) => c !== cards[i]) && !want.some((c) => c.contains(document.activeElement))) for (const c of want) f.append(c);
  // Sections repliables.
  for (const c of want) {
    const t = titleOf(c);
    const h = c.querySelector(':scope > .dz-card-h');
    if (h && !h.querySelector('.nx-fold')) { h.insertAdjacentHTML('beforeend', `<span class="nx-fold" aria-hidden="true">${ico('chevronDown', 12)}</span>`); h.setAttribute('role', 'button'); h.tabIndex = 0; h.title = 'Replier ou déplier'; }
    c.toggleAttribute('data-fold', folded(t));
    c.dataset.ptab = TAB_OF[t] || 'design';
  }
  // Onglets Design, Prototype et Code (seulement avec une sélection).
  let bar = f.querySelector(':scope > .nx-ptabs');
  if (!D.sel().length) { if (bar) bar.remove(); delete f.dataset.ptab; return; }
  const counts = Object.fromEntries(PTABS.map(([id]) => [id, want.filter((c) => c.dataset.ptab === id).length]));
  let cur = settings.nxDzPtab || 'design';
  if (!counts[cur]) cur = 'design';
  if (!bar) {
    bar = el(`<div class="seg wide nx-ptabs" role="tablist">${PTABS.map(([id, l]) => `<button role="tab" data-ptab-go="${id}">${l}</button>`).join('')}</div>`);
  }
  if (bar.nextElementSibling !== want[0]) want[0].before(bar);
  for (const b of bar.querySelectorAll('[data-ptab-go]')) { const id = b.dataset.ptabGo; b.hidden = !counts[id]; b.classList.toggle('on', id === cur); b.setAttribute('aria-selected', String(id === cur)); }
  bar.hidden = Object.values(counts).filter(Boolean).length < 2;
  f.dataset.ptab = bar.hidden ? 'all' : cur;
}
function bindProps(D) {
  const f = D.$.props;
  const toggle = (h) => {
    const c = h.closest('.dz-card'); const t = titleOf(c);
    const fold = !c.hasAttribute('data-fold');
    c.toggleAttribute('data-fold', fold);
    settings.nxDzFold = { ...(settings.nxDzFold || {}), [t]: fold }; saveSettings();
  };
  f.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-ptab-go]');
    if (tab) { e.stopPropagation(); settings.nxDzPtab = tab.dataset.ptabGo; saveSettings(); organize(D); f.scrollTop = 0; return; }
    const h = e.target.closest('.dz-card > .dz-card-h');
    if (!h || e.target.closest('button:not(.nx-fold), input, select, textarea, a, label')) return;
    toggle(h);
  });
  f.addEventListener('keydown', (e) => { const h = e.target.closest && e.target.closest('.dz-card > .dz-card-h'); if (h && e.target === h && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(h); } });
}

// ---------- Commentaires : avis des clients montrés avec ceux de l'équipe ----------
function clientReviews() {
  const links = (CTX && CTX.reviews()) || [];
  const out = [];
  for (const l of links) if (l.mode !== 'view') for (const r of l.design_reviews || []) out.push({ ...r, link: l.name });
  return out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

export function install(D, ctx) {
  CTX = ctx;
  toolbar(D);
  patchMenus(D);
  bindProps(D);
  D.nxClientReviews = clientReviews;
}
