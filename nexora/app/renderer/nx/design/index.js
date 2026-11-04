// NEXORA #011 : branchement des nouvelles fonctions sur l'éditeur NEX-DESIGN (instance déjà créée).
// Les méthodes de la classe sont complétées par enveloppe (prototype) : le code d'origine reste inchangé.
import { nxPickColor } from '../../dist/chunks/design-WMWE74LA.js';
import { a as ICONS } from '../../dist/chunks/chunk-S4I2LXHS.js';
import { Path, Group, FabricImage } from './fab.js';
import { installFx, FX, setFx, fxActive, ADJ, CURVE_PRESETS, HUE_RANGES, patchApplyFx, refreshAdj, applyPattern, restorePatterns } from './fx.js';
import * as V from './vector.js';
import { PixelTools, PIX_TOOLS, pixOpts } from './pixel.js';
import * as C from './content.js';
import * as PG from './pages.js';
import { SHAPES, FRAMES, GRIDS, STICKERS, stickerSvg, TEMPLATES, PATTERNS } from '../library.js';
import { getBrand, brandSheet, onBrand } from '../services.js';
import { settings, saveSettings, esc, ico, toast, menu, prompt, uid, clamp, fmt, $, el, luminance } from '../core.js';

ICONS.nxMore = '<circle cx="5.5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18.5" cy="12" r="1.4"/>';
const TEXT = ['textbox', 'i-text', 'text'];
const isText = (o) => o && TEXT.includes(o.type);

// ---------- Petits constructeurs d'interface (même balisage que NEX-DESIGN) ----------
const sec = (title, body, extra = '') => `<section class="dz-card nx-card"><div class="dz-card-h"><span>${title}</span>${extra}</div>${body}</section>`;
const range = (k, label, v, min, max, step, disp) => `<div class="st-field"><span>${label}<b data-nxv="${k}">${disp ?? fmt(v, 2)}</b></span><input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-nx="${k}"></div>`;
const seg = (k, val, map) => `<div class="seg wide small dz-seg">${Object.entries(map).map(([v, l]) => `<button class="${String(val) === v ? 'on' : ''}" data-nxs="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
const sw = (k, val, title = '') => `<button class="dz-sw${!val || val === 'transparent' ? ' none' : ''}" data-nxc="${k}" style="--c:${esc(val || 'transparent')}" title="${esc(title || val || 'Aucune')}"></button>`;
const chk = (k, label, on) => `<label class="check-row small"><input type="checkbox" data-nxk="${k}" ${on ? 'checked' : ''}><span class="box"></span><span>${label}</span></label>`;
const btn = (a, icon, label, extra = '') => `<button class="btn small" data-nxa="${a}" ${extra}>${ico(icon, 13)}<span>${label}</span></button>`;
const ib = (a, icon, title, on = false) => `<button class="dz-ib${on ? ' on' : ''}" data-nxa="${a}" title="${esc(title)}">${ico(icon, 15)}</button>`;
const sel = (k, val, map) => `<select class="input small" data-nx="${k}">${Object.entries(map).map(([v, l]) => `<option value="${esc(v)}" ${String(val) === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

export async function install(D) {
  if (D.nxInstalled) return;
  D.nxInstalled = true;
  const proto = Object.getPrototypeOf(D);
  installFx(); V.installArrows(); patchApplyFx(D); PG.patchHistory(D); PG.patchExportSheet(D);
  D.nxNodes = new V.NodeEditor(D);
  D.nxPix = new PixelTools(D);
  D.nxPix.onSel = () => { D.renderProps(); selBar(D); };
  D.nxMeta = D.hist.map((_, i) => ({ label: i === 0 ? 'Ouverture de la page' : 'Modification', t: Date.now() }));

  // Après chaque chargement de page : motifs et réglages recalculés.
  if (!proto.nxLoadPage) {
    proto.nxLoadPage = proto.loadPage;
    proto.loadPage = async function (pg, json) {
      await this.nxLoadPage(pg, json);
      try { afterLoad(this); } catch (e) { console.warn('[NEXORA #011]', e); }
    };
  }
  afterLoad(D);

  // Panneau de droite : sections ajoutées après celles de NEX-DESIGN.
  if (!proto.nxPaintProps) {
    proto.nxPaintProps = proto.paintProps;
    proto.paintProps = function () {
      const f = this.$.props;
      const focused = f && f.contains(document.activeElement) && document.activeElement.matches('input[type=number], input[type=text], select, textarea');
      this.nxPaintProps();
      if (focused || !this.page) return;
      try { const [top, rest] = propsHtml(this).split('<!--nx-split-->'); if (rest === undefined) f.insertAdjacentHTML('beforeend', top); else { if (top) f.insertAdjacentHTML('afterbegin', top); f.insertAdjacentHTML('beforeend', rest); } } catch (e) { console.warn('[NEXORA #011] panneau', e); }
      if (!this.sel().length) startOverlay(this);
    };
  }
  // Outils d'origine : on quitte proprement les outils ajoutés.
  if (!proto.nxSetTool) {
    proto.nxSetTool = proto.setTool;
    proto.setTool = function (l) {
      leaveNx(this);
      this.nxSetTool(l);
      for (const o of this.canvas.getObjects()) if (o.id !== '__board' && !o.locked) o.evented = true;
      markTools(this);
    };
  }
  // Raccourcis des nouveaux outils.
  if (!proto.nxOnKey) {
    proto.nxOnKey = proto.onKey;
    proto.onKey = async function (e) { if (await onKey(this, e)) return; return this.nxOnKey(e); };
  }
  // Repères et grille : aimantation en plus de celle de NEX-DESIGN.
  if (!proto.nxSnap) {
    proto.nxSnap = proto.snapMove;
    proto.snapMove = function (o) { this.nxSnap(o); snapExtra(this, o); };
  }
  // Image déposée sur un cadre photo vide : elle s'y place.
  if (!proto.nxAddImage) {
    proto.nxAddImage = proto.addImage;
    proto.addImage = async function (url, name, point) {
      const f = point && C.frameAt(this, point);
      if (f) return C.fillFrame(this, f, url);
      return this.nxAddImage(url, name, point);
    };
  }
  // Coédition : chaque modification est diffusée.
  if (!proto.nxChanged) {
    proto.nxChanged = proto.changed;
    proto.changed = function () { this.nxChanged(); if (this.nxRoom && !this.nxRemote && !this.loading) this.nxRoom.sendState(); };
  }
  // Onglet « Éléments » à gauche.
  if (!proto.nxRenderLeft) {
    proto.nxRenderLeft = proto.renderLeft;
    proto.renderLeft = function () {
      if (this.leftTab !== 'nxlib') return this.nxRenderLeft();
      for (const b of this.el.querySelectorAll('[data-dz-tab]')) b.classList.toggle('on', b.dataset.dzTab === 'nxlib');
      renderLibrary(this);
    };
  }
  buildToolbar(D);
  buildLeftTab(D);
  bindCanvas(D);
  bindProps(D);
  bindLeft(D);
  buildStage(D);
  onBrand(() => { if (D.leftTab === 'nxlib') renderLibrary(D); D.renderProps(); });
  D.renderLeft(); D.renderProps();
}

function afterLoad(D) {
  restorePatterns(D.canvas);
  for (const o of D.canvas.getObjects()) {
    if (o.type === 'image' && Array.isArray(o.nxAdj) && o.nxAdj.length) D.applyFx(o);
    if (fxActive(o)) o.objectCaching = false;
  }
  D.canvas.requestRenderAll();
  D.nxLayout && D.nxLayout();
  D.nxRenderComments && D.nxRenderComments();
}

// ---------- Barre d'outils ----------
function buildToolbar(D) {
  const bar = D.$.tools; if (bar.querySelector('.nx-tb')) return;
  const after = (sel, html) => { const ref = bar.querySelector(sel); ref && ref.insertAdjacentHTML('afterend', html); };
  after('[data-tool="hand"]', '<span class="dz-sep nx-tb"></span>');
  after('[data-tool="line"]', '<span class="dz-sep nx-tb"></span>');
  after('[data-tool="pencil"]', `<button class="dz-tool nx-tb" data-nxtool="nodes" title="Édition des points (A)">${ico('nxNodes', 17)}</button><span class="dz-sep nx-tb"></span>`);
  after('[data-tool="three"]', `<button class="dz-tool nx-tb" data-nxtb="retouch" title="Retouche d’image : lasso, baguette, pinceau, gomme, tampon, correcteur, masque, recadrage" aria-haspopup="true">${ico('nxBrush', 17)}</button><button class="dz-tool nx-tb" data-nxtb="elements" title="Éléments : modèles, formes, icônes, autocollants, cadres, graphiques, QR">${ico('nxSticker', 17)}</button>`);
  after('[data-dz="redo"]', `<button class="dz-tool nx-tb" data-nxtb="history" title="Historique des actions">${ico('nxHistory', 16)}</button>`);
  const exp = bar.querySelector('[data-dz="export"]');
  exp && exp.insertAdjacentHTML('beforebegin', `<button class="dz-tool nx-tb" data-nxtb="ai" title="Assistant IA : textes, mise en page, palettes, images">${ico('sparkle', 16)}</button><button class="dz-tool nx-tb" data-nxtb="more" title="Plus : formats, animation, présentation, marque, coédition, commentaires, règles" aria-haspopup="true">${ico('nxMore', 16)}</button>`);
  bar.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-nxtool]');
    if (t) { e.stopPropagation(); nxTool(D, D.tool === 'nxnodes' ? null : t.dataset.nxtool); return; }
    const b = e.target.closest('[data-nxtb]'); if (!b) return;
    e.stopPropagation();
    const a = b.dataset.nxtb;
    if (a === 'retouch') {
      const id = await menu(b, 'Retouche d’image', Object.entries(PIX_TOOLS).map(([k, [label, icon, key]]) => ({ id: k, icon, label, kbd: key })), { width: 320 });
      if (id) nxTool(D, id);
    }
    if (a === 'elements') { D.leftTab = 'nxlib'; settings.designLeftTab = 'nxlib'; saveSettings(); D.renderLeft(); }
    if (a === 'history') toggleFloat(D, 'history');
    if (a === 'ai') PG.aiMenu(D, b);
    if (a === 'more') moreMenu(D, b);
  }, true);
}
function markTools(D) {
  for (const b of D.el.querySelectorAll('[data-nxtool]')) b.classList.toggle('on', D.tool === `nx${b.dataset.nxtool}`);
  const r = D.el.querySelector('[data-nxtb="retouch"]');
  if (r) { const id = D.nxPix && D.nxPix.tool; r.classList.toggle('on', !!id); r.innerHTML = ico(id ? PIX_TOOLS[id][1] : 'nxBrush', 17); }
  if (D.tool && D.tool.startsWith('nx')) for (const b of D.el.querySelectorAll('[data-tool]')) b.classList.remove('on');
}
async function moreMenu(D, anchor) {
  const a = await menu(anchor, '', [
    { head: 'Pages' },
    { id: 'resize', icon: 'nxResize', label: 'Redimensionner en plusieurs formats…' },
    { id: 'play', icon: 'play', label: D.nxPlaying ? 'Arrêter l’animation' : 'Lire l’animation de la page' },
    { id: 'anim', icon: 'nxAnimate', label: 'Exporter l’animation (MP4, WebM, GIF)…' },
    { id: 'present', icon: 'nxPresent', label: 'Présenter en plein écran', kbd: 'F5' },
    { id: 'zip', icon: 'nxZip', label: 'Exporter toutes les pages (ZIP)' },
    { id: 'layers', icon: 'layers', label: 'Exporter chaque calque (PNG, ZIP)' },
    { head: 'Marque et équipe' },
    { id: 'brand', icon: 'nxBrand', label: 'Kit de marque…' },
    { id: 'brandApply', icon: 'nxPalette', label: 'Appliquer le kit de marque à la page' },
    { id: 'collab', icon: 'nxUsers', label: D.nxRoom ? `Coédition en direct (salle ${D.nxRoom.code})…` : 'Coéditer en direct…' },
    { id: 'comment', icon: 'nxComment', label: 'Ajouter un commentaire', kbd: 'Clic sur la page' },
    { id: 'comments', icon: 'nxComment', label: `Commentaires (${PG.comments(D).filter((c) => !c.done).length})` },
    { head: 'Affichage' },
    { id: 'rulers', icon: 'nxRuler2', label: 'Règles, repères et grille…' },
    { id: 'history', icon: 'nxHistory', label: 'Historique des actions' },
    { id: 'keys', icon: 'key', label: 'Raccourcis clavier', kbd: '?' }
  ], { width: 320, align: 'end' });
  if (a === 'resize') PG.resizeSheet(D);
  if (a === 'play') PG.playPage(D);
  if (a === 'anim') PG.animExportSheet(D);
  if (a === 'present') PG.present(D, D.pageIdx);
  if (a === 'zip') PG.exportZip(D);
  if (a === 'layers') PG.exportLayers(D);
  if (a === 'brand') brandSheet({ applyLabel: 'Enregistrer' });
  if (a === 'brandApply') C.applyBrand(D);
  if (a === 'collab') PG.collab(D);
  if (a === 'comment') nxTool(D, 'comment');
  if (a === 'comments') toggleFloat(D, 'comments');
  if (a === 'rulers') PG.rulersMenu(D, anchor);
  if (a === 'history') toggleFloat(D, 'history');
  if (a === 'keys') keysHelp(anchor);
}
function keysHelp(anchor) {
  const rows = [['V', 'Sélection'], ['H', 'Main'], ['R', 'Rectangle'], ['O', 'Ellipse'], ['Y', 'Polygone et étoile'], ['L', 'Ligne'], ['P', 'Plume'], ['B', 'Crayon'], ['A', 'Édition des points'], ['T', 'Texte'], ['I', 'Image'], ['3', 'Objet 3D'], ['Q', 'Lasso'], ['W', 'Baguette magique'], ['J', 'Pinceau de retouche'], ['E', 'Gomme'], ['S', 'Tampon'], ['X', 'Correcteur'], ['M', 'Masque au pinceau'], ['C', 'Recadrer'], ['Espace', 'Déplacer la vue'], ['Ctrl+molette', 'Zoom'], ['Maj+1', 'Tout voir'], ['Ctrl+G', 'Grouper'], ['Ctrl+D', 'Dupliquer'], ['F5', 'Présenter'], ['Échap', 'Quitter l’outil']];
  return menu(anchor || document.body, 'Raccourcis clavier', rows.map(([k, l]) => ({ id: k, label: l, kbd: k })), { width: 300, align: 'end' });
}

// ---------- Outils ajoutés ----------
function leaveNx(D) {
  if (D.nxNodes && D.nxNodes.active) D.nxNodes.stop();
  if (D.nxPix && D.nxPix.crop) D.nxPix.finishCrop(false);
  if (D.nxPix) D.nxPix.tool = null;
  D.nxCommentMode = false;
  D.$ && D.$.hint && D.tool && D.tool.startsWith('nx') && (D.$.hint.hidden = true);
}
export function nxTool(D, id) {
  const c = D.canvas;
  if (!id) { D.setTool('select'); return; }
  const target = c.getActiveObject();
  if (D.nxNodes.active) D.nxNodes.stop();
  if (D.nxPix.crop) D.nxPix.finishCrop(false);
  D.nxPix.tool = null; D.nxCommentMode = false;
  if (id === 'nodes') {
    if (!D.nxNodes.start(target)) { markTools(D); return; }
    D.tool = 'nxnodes';
  } else if (id === 'comment') {
    D.nxSetTool('select'); D.tool = 'nxcomment'; D.nxCommentMode = true; c.defaultCursor = 'copy';
    D.$.hint.hidden = false; D.$.hint.innerHTML = '<span>Commentaire : clique sur la page à l’endroit voulu · Échap pour annuler</span>';
  } else if (PIX_TOOLS[id]) {
    D.nxPix.target = target || D.nxPix.target;
    if (!D.nxPix.setTool(id)) { markTools(D); return; }
    if (id === 'crop') D.tool = 'nxcrop';
    else {
      D.tool = `nx${id}`; c.isDrawingMode = false; c.selection = false; c.discardActiveObject();
      for (const o of c.getObjects()) if (o.id !== '__board') { o.selectable = false; o.evented = false; }
      c.defaultCursor = 'crosshair'; c.setCursor('crosshair');
      D.$.hint.hidden = false; D.$.hint.innerHTML = `<span>${esc(PIX_TOOLS[id][0])} · Échap pour revenir à la sélection</span>`;
    }
  }
  markTools(D); D.renderProps(); c.requestRenderAll();
}
const pixActive = (D) => D.tool && D.tool.startsWith('nx') && D.nxPix.tool && D.nxPix.tool !== 'crop';

async function onKey(D, e) {
  if (settings.mode !== 'design' || !D.ready || D.typing(e) || !$('#sheetBackdrop').hidden) return false;
  const k = e.key.toLowerCase(); const ctrl = e.ctrlKey || e.metaKey;
  if (D.nxNodes.active) {
    if (k === 'escape' || k === 'enter') { e.preventDefault(); D.setTool('select'); return true; }
    if (k === 'delete' || k === 'backspace') { e.preventDefault(); D.nxNodes.removeSelected(); return true; }
    const step = e.shiftKey ? 10 : 1;
    const arrows = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] };
    if (arrows[k]) { e.preventDefault(); D.nxNodes.nudge(...arrows[k]); return true; }
    if (k === 'k') { D.nxNodes.scissors = !D.nxNodes.scissors; toast(D.nxNodes.scissors ? 'Ciseaux : clique sur le tracé pour le couper.' : 'Ciseaux désactivés.'); return true; }
  }
  if (D.nxPix.crop) {
    if (k === 'enter') { e.preventDefault(); D.nxPix.finishCrop(true); return true; }
    if (k === 'escape') { e.preventDefault(); D.nxPix.finishCrop(false); return true; }
  }
  if (D.nxPix.sel && (k === 'delete' || k === 'backspace')) { e.preventDefault(); D.nxPix.applyAlpha(false); return true; }
  if (k === 'escape' && D.tool && D.tool.startsWith('nx')) { e.preventDefault(); if (D.nxPix.sel) D.nxPix.clearSel(); D.setTool('select'); return true; }
  if (k === 'escape' && D.nxPix.sel) { D.nxPix.clearSel(); return true; }
  if (k === 'f5') { e.preventDefault(); PG.present(D, D.pageIdx); return true; }
  if (ctrl || e.altKey) return false;
  if (k === '?' || (e.shiftKey && k === '/')) { keysHelp(D.$.tools); return true; }
  const map = { a: 'nodes', q: 'lasso', w: 'wand', j: 'brush', e: 'eraser', s: 'stamp', x: 'heal', m: 'maskbrush', c: 'crop' };
  if (map[k] && !e.shiftKey) { e.preventDefault(); nxTool(D, map[k]); return true; }
  if ((k === '[' || k === ']') && pixActive(D)) { const o = pixOpts(); o.size = clamp(o.size + (k === ']' ? 6 : -6), 2, 600); saveSettings(); D.renderProps(); return true; }
  return false;
}

// ---------- Canevas : souris et dessin des aides ----------
function bindCanvas(D) {
  const c = D.canvas;
  c.on('mouse:down', (opt) => {
    if (D.space || opt.e.button === 1 || opt.e.button === 2) return;
    const p = c.getScenePoint(opt.e);
    if (D.nxCommentMode) { D.nxCommentMode = false; D.setTool('select'); PG.addComment(D, p); return; }
    if (D.nxNodes.active) { if (D.nxNodes.scissors) { D.nxNodes.cut(p); return; } D.nxNodes.down(p, opt.e); return; }
    if (pixActive(D)) D.nxPix.down(opt);
  });
  c.on('mouse:move', (opt) => {
    if (D.nxNodes.active) D.nxNodes.move(c.getScenePoint(opt.e));
    else if (pixActive(D)) D.nxPix.move(opt);
    if (pixActive(D)) brushCursor(D, opt.e);
    if (D.nxRoom) { const p = c.getScenePoint(opt.e); D.nxRoom.sendCursor(p.x, p.y, { page: D.pageIdx }); }
  });
  c.on('mouse:up', () => { if (D.nxNodes.active) D.nxNodes.up(); else if (pixActive(D)) D.nxPix.up(); });
  c.on('mouse:dblclick', (opt) => { if (D.nxNodes.active) D.nxNodes.dbl(c.getScenePoint(opt.e)); else if (opt.target && opt.target.nxFrame && opt.target.nxFrame.empty) C.pickIntoFrame(D, opt.target); });
  c.on('after:render', ({ ctx }) => {
    if (!ctx || ctx.canvas !== c.lowerCanvasEl) return;
    drawAids(D, ctx);
    D.nxNodes.draw(ctx);
    D.nxPix.draw(ctx);
    D.nxLayout && D.nxLayoutSoon();
  });
  // Libellés de l'historique.
  c.on('object:added', (e) => { if (!D.loading && e.target && e.target.id !== '__board' && e.target.id !== '__nxcrop') D.nxNextLabel = `Ajout : ${e.target.name || D.typeName(e.target)}`; });
  c.on('object:removed', (e) => { if (!D.loading && e.target && e.target.id !== '__nxcrop') D.nxNextLabel = `Suppression : ${e.target.name || D.typeName(e.target)}`; });
  c.on('object:modified', (e) => { const a = e.transform && e.transform.action; const n = e.target ? (e.target.name || D.typeName(e.target)) : ''; D.nxNextLabel = `${a === 'drag' ? 'Déplacement' : /scale/.test(a || '') ? 'Taille' : a === 'rotate' ? 'Rotation' : 'Modification'} : ${n}`; });
  c.on('text:changed', () => { D.nxNextLabel = 'Texte modifié'; });
  c.on('path:created', (e) => {
    const s = Number(settings.nxPencilSmooth || 0);
    if (!s || !e.path) return;
    setTimeout(() => { try { if (c.getObjects().includes(e.path)) V.simplify(D, e.path, 0.5 + s * 6); } catch (err) { console.warn(err); } }, 0);
  });
  // Animation des pointillés de sélection.
  setInterval(() => { if (D.nxPix.sel && D.visible !== false && settings.mode === 'design') c.requestRenderAll(); }, 140);
}
function brushCursor(D, e) {
  const st = D.$.stage; let cur = st.querySelector('.nx-brushcur');
  if (!['brush', 'eraser', 'stamp', 'heal', 'maskbrush'].includes(D.nxPix.tool)) { if (cur) cur.hidden = true; return; }
  if (!cur) { cur = el('<span class="nx-brushcur"></span>'); st.append(cur); }
  const r = st.getBoundingClientRect(); const size = pixOpts().size;
  cur.hidden = false; cur.style.width = `${size}px`; cur.style.height = `${size}px`; cur.style.left = `${e.clientX - r.left - size / 2}px`; cur.style.top = `${e.clientY - r.top - size / 2}px`;
}
function drawAids(D, ctx) {
  const c = D.canvas; const v = c.viewportTransform; const R = c.getRetinaScaling(); const pg = D.page; if (!pg) return;
  const X = (x) => x * v[0] + v[4]; const Y = (y) => y * v[3] + v[5];
  const g = pg.nxGrid;
  ctx.save(); ctx.setTransform(R, 0, 0, R, 0, 0);
  if (g) {
    const L = PG.gridLines(D); ctx.fillStyle = `${g.color || '#ff2d78'}1f`;
    for (const [a, w] of L.cols) ctx.fillRect(X(a), Y(0), w * v[0], pg.h * v[3]);
    for (const [a, h] of L.rows) ctx.fillRect(X(0), Y(a), pg.w * v[0], h * v[3]);
  }
  const gd = pg.nxGuides;
  if (gd && (gd.x.length || gd.y.length)) {
    ctx.strokeStyle = '#00b4ff'; ctx.lineWidth = 1;
    for (const x of gd.x) { ctx.beginPath(); ctx.moveTo(Math.round(X(x)) + 0.5, 0); ctx.lineTo(Math.round(X(x)) + 0.5, c.height); ctx.stroke(); }
    for (const y of gd.y) { ctx.beginPath(); ctx.moveTo(0, Math.round(Y(y)) + 0.5); ctx.lineTo(c.width, Math.round(Y(y)) + 0.5); ctx.stroke(); }
  }
  ctx.restore();
}
function snapExtra(D, o) {
  if (settings.designSnap === false) return;
  const pg = D.page; const gd = pg.nxGuides || { x: [], y: [] }; const L = PG.gridLines(D);
  const xs = [...gd.x, ...L.x]; const ys = [...gd.y, ...L.y];
  if (!xs.length && !ys.length) return;
  const th = 6 / D.canvas.getZoom(); const r = o.getBoundingRect();
  const best = (vals, edges) => { let bd = th; let off = null; let at = null; for (const v of vals) for (const e of edges) { const d = v - e; if (Math.abs(d) < bd) { bd = Math.abs(d); off = d; at = v; } } return [off, at]; };
  const [dx, ax] = best(xs, [r.left, r.left + r.width / 2, r.left + r.width]);
  const [dy, ay] = best(ys, [r.top, r.top + r.height / 2, r.top + r.height]);
  if (dx !== null) o.left += dx; if (dy !== null) o.top += dy;
  if (dx !== null || dy !== null) { o.setCoords(); D.guides = { x: dx !== null ? ax : (D.guides ? D.guides.x : null), y: dy !== null ? ay : (D.guides ? D.guides.y : null) }; }
}

// ---------- Scène : règles, aides flottantes, curseurs, commentaires, démarrage ----------
function buildStage(D) {
  const st = D.$.stage; if (st.querySelector('.nx-ruler')) return;
  st.insertAdjacentHTML('beforeend', `<canvas class="nx-ruler h" hidden></canvas><canvas class="nx-ruler v" hidden></canvas><span class="nx-ruler-corner" hidden></span>
    <div class="nx-pins"></div><div class="nx-cursors"></div><div class="nx-selbar" hidden></div><div class="nx-start" hidden></div>`);
  const rh = st.querySelector('.nx-ruler.h'); const rv = st.querySelector('.nx-ruler.v');
  let t = 0;
  D.nxLayoutSoon = () => { if (t) return; t = requestAnimationFrame(() => { t = 0; D.nxLayout(); }); };
  D.nxLayout = () => {
    const on = !!settings.nxRulers; rh.hidden = !on; rv.hidden = !on; st.querySelector('.nx-ruler-corner').hidden = !on;
    if (on) drawRulers(D, rh, rv);
    renderPins(D); renderCursors(D);
  };
  // Poser un repère en glissant depuis une règle ; le ramener sur la règle le supprime.
  const dragGuide = (axis, startIdx = -1) => (e) => {
    if (settings.nxGuidesLock) { toast('Les repères sont verrouillés (menu « Règles et repères »).'); return; }
    e.preventDefault(); e.stopPropagation();
    const g = PG.guides(D); const arr = g[axis]; let i = startIdx;
    if (i < 0) { arr.push(0); i = arr.length - 1; }
    const move = (ev) => { const p = D.canvas.getScenePoint(ev); arr[i] = Math.round(axis === 'x' ? p.x : p.y); D.canvas.requestRenderAll(); };
    const up = (ev) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      const r = st.getBoundingClientRect();
      if ((axis === 'x' ? ev.clientX - r.left : ev.clientY - r.top) < 24) arr.splice(i, 1);
      D.nxNextLabel = 'Repère'; D.changed(); D.canvas.requestRenderAll();
    };
    move(e); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  rh.addEventListener('pointerdown', dragGuide('y'));
  rv.addEventListener('pointerdown', dragGuide('x'));
  st.addEventListener('pointerdown', (e) => {
    if (D.tool !== 'select' || !D.page.nxGuides || settings.nxGuidesLock || e.button !== 0) return;
    const p = D.canvas.getScenePoint(e); const th = 4 / D.canvas.getZoom(); const g = D.page.nxGuides;
    const hitTarget = D.canvas.getObjects().some((o) => o.id !== '__board' && o.evented !== false && o.visible !== false && o.containsPoint(p));
    if (hitTarget && !e.altKey) return;
    const ix = g.x.findIndex((x) => Math.abs(x - p.x) < th); const iy = g.y.findIndex((y) => Math.abs(y - p.y) < th);
    if (ix >= 0) dragGuide('x', ix)(e); else if (iy >= 0) dragGuide('y', iy)(e);
  }, true);
  D.nxRenderComments = () => renderPins(D);
  D.nxRenderCursors = () => renderCursors(D);
  D.nxRenderHistory = () => { const f = st.querySelector('.nx-float.history'); if (f) renderFloat(D, 'history', f); };
  D.nxLayout();
}
function drawRulers(D, rh, rv) {
  const st = D.$.stage; const r = st.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1; const v = D.canvas.viewportTransform; const z = v[0];
  const dark = document.documentElement.dataset.theme === 'dark';
  const bg = dark ? '#1c1d22' : '#ffffff'; const ink = dark ? '#9497aa' : '#686b7d'; const line = dark ? '#34353d' : '#d9dbe3';
  const step = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000].find((s) => s * z >= 48) || 5000;
  for (const [cv, horiz] of [[rh, true], [rv, false]]) {
    const W = horiz ? r.width : 22; const H = horiz ? 22 : r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = `${W}px`; cv.style.height = `${H}px`;
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.fillStyle = bg; x.fillRect(0, 0, W, H); x.strokeStyle = line; x.beginPath();
    if (horiz) { x.moveTo(0, H - 0.5); x.lineTo(W, H - 0.5); } else { x.moveTo(W - 0.5, 0); x.lineTo(W - 0.5, H); }
    x.stroke(); x.fillStyle = ink; x.strokeStyle = ink; x.font = '9px Inter, sans-serif';
    const off = horiz ? v[4] : v[5]; const len = horiz ? W : H;
    const s0 = Math.floor(-off / z / step) * step;
    for (let u = s0; u * z + off < len; u += step / 5) {
      const px = Math.round(u * z + off) + 0.5; const major = Math.abs(u / step - Math.round(u / step)) < 1e-6;
      x.beginPath();
      if (horiz) { x.moveTo(px, major ? 8 : 15); x.lineTo(px, 22); } else { x.moveTo(major ? 8 : 15, px); x.lineTo(22, px); }
      x.stroke();
      if (major) { if (horiz) x.fillText(String(Math.round(u)), px + 3, 9); else { x.save(); x.translate(9, px + 3); x.rotate(-Math.PI / 2); x.fillText(String(Math.round(u)), 0, 0); x.restore(); } }
    }
  }
}
function renderPins(D) {
  const box = D.$.stage.querySelector('.nx-pins'); if (!box || !D.page) return;
  const v = D.canvas.viewportTransform;
  const list = PG.comments(D).filter((c) => c.page === D.page.id && !c.done);
  box.innerHTML = list.map((c, i) => `<button class="nx-pin" data-pin="${esc(c.id)}" style="left:${c.x * v[0] + v[4]}px;top:${c.y * v[3] + v[5]}px" title="${esc(c.author)} : ${esc(c.text.slice(0, 60))}">${i + 1}</button>`).join('');
  box.onclick = (e) => { const b = e.target.closest('[data-pin]'); if (b) commentPop(D, b, b.dataset.pin); };
}
async function commentPop(D, anchor, id) {
  const c = PG.comments(D).find((x) => x.id === id); if (!c) return;
  const a = await menu(anchor, `${c.author} · ${new Date(c.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}`, [
    { head: c.text }, ...c.replies.map((r) => ({ head: `${r.author} : ${r.text}` })), '-',
    { id: 'reply', icon: 'nxComment', label: 'Répondre…' }, { id: 'done', icon: 'check', label: 'Marquer comme résolu' }, { id: 'del', icon: 'trash', label: 'Supprimer' }
  ], { width: 300 });
  if (a === 'reply') { const t = await prompt('Répondre', { icon: 'nxComment', multiline: true, go: 'Répondre' }); if (t && t.trim()) c.replies.push({ author: 'Moi', text: t.trim(), at: Date.now() }); }
  if (a === 'done') c.done = true;
  if (a === 'del') D.doc.nxComments = PG.comments(D).filter((x) => x.id !== id);
  if (a) { D.save(); renderPins(D); const f = D.$.stage.querySelector('.nx-float.comments'); if (f) renderFloat(D, 'comments', f); }
}
function renderCursors(D) {
  const box = D.$.stage.querySelector('.nx-cursors'); if (!box) return;
  if (!D.nxRoom || !D.nxCursors) { box.innerHTML = ''; return; }
  const v = D.canvas.viewportTransform; const now = Date.now();
  box.innerHTML = [...D.nxCursors.values()].filter((c) => now - c.at < 8000 && c.page === D.pageIdx).map((c) => `<span class="nx-cursor" style="left:${c.x * v[0] + v[4]}px;top:${c.y * v[3] + v[5]}px;--c:${esc(c.color)}">${ico('nxPointer', 16)}<b>${esc(c.name)}</b></span>`).join('');
}
function startOverlay(D) {
  const box = D.$.stage.querySelector('.nx-start'); if (!box) return;
  const empty = D.canvas.getObjects().filter((o) => o.id !== '__board').length === 0;
  const show = empty && !D.page.nxStartDone && D.tool === 'select';
  box.hidden = !show; if (!show) return;
  if (box.dataset.page === D.page.id && box.innerHTML) return;
  box.dataset.page = D.page.id;
  const ids = Object.keys(TEMPLATES).slice(0, 8);
  box.innerHTML = `<div class="nx-start-card"><div class="nx-start-h"><b>Commence avec un modèle</b><span>Aux couleurs de ton kit de marque · tous les formats</span></div>
    <div class="nx-start-grid">${ids.map((id) => `<button class="nx-tpl" data-start="${id}" title="${esc(TEMPLATES[id].label)}"><img src="${C.templateThumb(id, 110)}" alt=""><span>${esc(TEMPLATES[id].label)}</span></button>`).join('')}</div>
    <div class="nx-row"><button class="btn small" data-start-act="all">${ico('nxSticker', 13)}<span>Tous les modèles et éléments</span></button><button class="btn small" data-start-act="brand">${ico('nxBrand', 13)}<span>Kit de marque…</span></button><span class="grow"></span><button class="btn small" data-start-act="blank">Page vierge</button></div></div>`;
  box.onclick = async (e) => {
    const t = e.target.closest('[data-start]');
    if (t) { box.hidden = true; await C.applyTemplate(D, t.dataset.start); return; }
    const a = e.target.closest('[data-start-act]'); if (!a) return;
    if (a.dataset.startAct === 'blank') { D.page.nxStartDone = true; box.hidden = true; D.save(); }
    if (a.dataset.startAct === 'all') { D.leftTab = 'nxlib'; D.renderLeft(); }
    if (a.dataset.startAct === 'brand') brandSheet({ onApply: () => { box.innerHTML = ''; startOverlay(D); } });
  };
}
// Barre d'actions de la sélection de pixels.
function selBar(D) {
  const bar = D.$.stage.querySelector('.nx-selbar'); if (!bar) return;
  const s = D.nxPix.sel; bar.hidden = !s; if (!s) return;
  bar.innerHTML = `<span>${ico('nxLasso', 14)} Sélection</span>
    ${btn('sel-del', 'trash', 'Supprimer')}${btn('sel-keep', 'nxCrop', 'Détourer')}${btn('sel-copy', 'copy', 'Nouveau calque')}
    ${btn('sel-fill', 'nxHeal', 'Remplir selon le contenu')}${btn('sel-ai', 'sparkle', 'Remplissage génératif…')}
    ${btn('sel-inv', 'sync', 'Inverser')}${btn('sel-feather', 'nxVignette', 'Adoucir')}${btn('sel-none', 'close', 'Désélectionner')}`;
  bar.onclick = (e) => { const b = e.target.closest('[data-nxa]'); if (b) action(D, b.dataset.nxa, b); };
}
// Panneaux flottants : historique et commentaires.
function toggleFloat(D, kind) {
  const st = D.$.stage; let f = st.querySelector(`.nx-float.${kind}`);
  if (f) { f.remove(); return; }
  for (const o of st.querySelectorAll('.nx-float')) o.remove();
  f = el(`<div class="nx-float ${kind}"></div>`); st.append(f); renderFloat(D, kind, f);
}
function renderFloat(D, kind, f) {
  if (kind === 'history') {
    const meta = D.nxMeta || []; const fut = [...(D.nxFutMeta || [])].reverse();
    f.innerHTML = `<div class="nx-float-h"><b>${ico('nxHistory', 14)} Historique</b><button class="icon-btn small" data-fl="close" title="Fermer">${ico('close', 12)}</button></div>
      <div class="nx-float-list">${meta.map((m, i) => `<button class="nx-hrow${i === meta.length - 1 ? ' on' : ''}" data-h="${i}"><span>${esc(m.label)}</span><small>${new Date(m.t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</small></button>`).reverse().join('')}
      ${fut.length ? `<div class="pop-sub">Annulé (cliquer pour rétablir)</div>${fut.map((m, i) => `<button class="nx-hrow off" data-r="${i + 1}"><span>${esc(m ? m.label : 'Modification')}</span></button>`).join('')}` : ''}</div>`;
    f.onclick = async (e) => {
      if (e.target.closest('[data-fl="close"]')) { f.remove(); return; }
      const h = e.target.closest('[data-h]'); if (h) { await PG.jumpHistory(D, Number(h.dataset.h)); return; }
      const r = e.target.closest('[data-r]'); if (r) { for (let k = 0; k < Number(r.dataset.r); k++) await D.redo(); }
    };
  }
  if (kind === 'comments') {
    const list = PG.comments(D);
    f.innerHTML = `<div class="nx-float-h"><b>${ico('nxComment', 14)} Commentaires</b><button class="btn small" data-fl="add">${ico('plus', 12)}<span>Ajouter</span></button><button class="icon-btn small" data-fl="close" title="Fermer">${ico('close', 12)}</button></div>
      <div class="nx-float-list">${list.length ? list.map((c) => { const pi = D.doc.pages.findIndex((p) => p.id === c.page); return `<div class="nx-crow${c.done ? ' off' : ''}"><b>${esc(c.author)}</b><small>Page ${pi + 1} · ${new Date(c.at).toLocaleDateString('fr-FR')}</small><p>${esc(c.text)}</p>${c.replies.map((r) => `<p class="nx-reply"><b>${esc(r.author)}</b> ${esc(r.text)}</p>`).join('')}<div class="nx-row"><button class="btn small" data-cgo="${esc(c.id)}">Voir</button>${c.done ? '' : `<button class="btn small" data-cdone="${esc(c.id)}">Résolu</button>`}</div></div>`; }).join('') : '<p class="nx-muted" style="padding:10px">Aucun commentaire. Clique sur « Ajouter », puis sur la page.</p>'}</div>`;
    f.onclick = async (e) => {
      if (e.target.closest('[data-fl="close"]')) { f.remove(); return; }
      if (e.target.closest('[data-fl="add"]')) { nxTool(D, 'comment'); return; }
      const g = e.target.closest('[data-cgo]'); if (g) { const c = list.find((x) => x.id === g.dataset.cgo); const pi = D.doc.pages.findIndex((p) => p.id === c.page); if (pi >= 0 && pi !== D.pageIdx) await D.openPage(pi); renderPins(D); return; }
      const d = e.target.closest('[data-cdone]'); if (d) { const c = list.find((x) => x.id === d.dataset.cdone); c.done = true; D.save(); renderPins(D); renderFloat(D, 'comments', f); }
    };
  }
}

// ---------- Onglet « Éléments » ----------
function buildLeftTab(D) {
  const tabs = D.el.querySelector('.dz-tabs'); if (!tabs || tabs.querySelector('[data-dz-tab="nxlib"]')) return;
  tabs.insertAdjacentHTML('beforeend', '<button data-dz-tab="nxlib">Éléments</button>');
  tabs.classList.add('nx-4tabs');
  if (settings.designLeftTab === 'nxlib') D.leftTab = 'nxlib';
}
const svgThumb = (d, fill = 'currentColor') => `<svg viewBox="-4 -4 108 108" width="34" height="34"><path d="${d}" fill="${fill}" fill-rule="evenodd"/></svg>`;
const stickerThumbs = new Map();
function renderLibrary(D) {
  const b = getBrand(); const q = (D.nxLibQ || '').toLowerCase();
  const m = (s) => !q || String(s).toLowerCase().includes(q);
  const comps = Object.entries(C.comps(D));
  const iconNames = Object.keys(ICONS).filter((k) => !k.startsWith('nx') && m(k)).slice(0, q ? 120 : 48);
  const stick = (k) => { if (!stickerThumbs.has(k)) stickerThumbs.set(k, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(stickerSvg(k, { c1: b.colors[0], c2: b.colors[2] }))}`); return stickerThumbs.get(k); };
  const block = (title, html) => (html ? `<div class="st-head">${title}</div>${html}` : '');
  D.$.left.innerHTML = `<div class="nx-lib">
    <input class="input small nx-lib-q" type="search" placeholder="Rechercher un élément" value="${esc(D.nxLibQ || '')}">
    ${block('Modèles', `<div class="nx-tpls">${Object.entries(TEMPLATES).filter(([, t]) => m(t.label) || m(t.usage)).map(([id, t]) => `<button class="nx-tpl" data-nxl="tpl:${id}" title="${esc(t.label)} · ${esc(t.usage)}"><img src="${C.templateThumb(id, 104)}" alt=""><span>${esc(t.label)}</span></button>`).join('')}</div>`)}
    ${!q ? `<div class="st-head">Kit de marque</div><div class="nx-brandbar"><div class="nx-chips">${b.colors.map((c) => `<button class="dz-sw" data-nxl="color:${esc(c)}" style="--c:${esc(c)}" title="Appliquer ${esc(c)} à la sélection"></button>`).join('')}</div>
      <div class="nx-row">${b.logo ? `<button class="btn small" data-nxl="logo">${ico('image', 13)}<span>Logo</span></button>` : ''}<button class="btn small" data-nxl="brand-apply">${ico('nxPalette', 13)}<span>Appliquer</span></button><button class="btn small" data-nxl="brand-edit">${ico('nxBrand', 13)}<span>Modifier</span></button></div></div>` : ''}
    ${block('Formes', `<div class="nx-gridlib">${Object.entries(SHAPES).filter(([, s]) => m(s[0])).map(([k, s]) => `<button class="nx-libbtn" data-nxl="shape:${k}" title="${esc(s[0])}">${svgThumb(s[1])}</button>`).join('')}</div>`)}
    ${block('Autocollants', `<div class="nx-gridlib big">${Object.entries(STICKERS).filter(([, l]) => m(l)).map(([k, l]) => `<button class="nx-libbtn" data-nxl="sticker:${k}" title="${esc(l)}"><img src="${stick(k)}" alt=""></button>`).join('')}</div>`)}
    ${block('Cadres photo', `<div class="nx-gridlib">${Object.entries(FRAMES).filter(([, f]) => m(f[0]) || m('cadre photo')).map(([k, f]) => `<button class="nx-libbtn" data-nxl="frame:${k}" title="Cadre ${esc(f[0])}">${svgThumb(f[1], 'var(--text-3)')}</button>`).join('')}</div>`)}
    ${block('Grilles de photos', `<div class="nx-gridlib">${Object.entries(GRIDS).filter(([, g]) => m(g[0]) || m('grille')).map(([k, g]) => `<button class="nx-libbtn" data-nxl="grid:${k}" title="${esc(g[0])}"><svg viewBox="0 0 100 100" width="34" height="34">${g[1].map(([x, y, w, h]) => `<rect x="${x * 100 + 3}" y="${y * 100 + 3}" width="${w * 100 - 6}" height="${h * 100 - 6}" rx="6" fill="var(--text-3)"/>`).join('')}</svg></button>`).join('')}</div>`)}
    ${block('Données', (m('graphique') || m('tableau') || m('qr') || !q) ? `<div class="nx-list">${Object.entries(C.CHARTS).map(([k, l]) => `<button class="menu-item" data-nxl="chart:${k}">${ico('nxChart', 14)}<span>Graphique · ${esc(l)}</span></button>`).join('')}<button class="menu-item" data-nxl="table">${ico('nxTable', 14)}<span>Tableau</span></button><button class="menu-item" data-nxl="qr">${ico('nxQr', 14)}<span>Code QR (lien de ton site)</span></button></div>` : '')}
    ${block('Motifs (remplissage de la sélection)', `<div class="nx-gridlib">${Object.entries(PATTERNS).filter(([, l]) => m(l) || m('motif')).map(([k, l]) => `<button class="nx-libbtn nx-pat" data-nxl="pattern:${k}" title="${esc(l)}" style="--pat:url(${patThumb(k, b)})"></button>`).join('')}</div>`)}
    ${block('Icônes', `<div class="nx-gridlib">${iconNames.map((k) => `<button class="nx-libbtn" data-nxl="icon:${k}" title="${esc(k)}">${ico(k, 20)}</button>`).join('')}</div>`)}
    ${block('Composants du document', comps.length ? `<div class="nx-list">${comps.filter(([, c]) => m(c.name)).map(([id, c]) => `<button class="menu-item" data-nxl="comp:${id}">${ico('nxComponent', 14)}<span>${esc(c.name)}</span></button>`).join('')}</div>` : (q ? '' : '<p class="nx-muted nx-pad">Sélectionne des calques puis « Créer un composant » (panneau de droite) pour les réutiliser.</p>'))}
  </div>`;
  const input = D.$.left.querySelector('.nx-lib-q');
  input.oninput = () => { D.nxLibQ = input.value; const pos = input.selectionStart; renderLibrary(D); const i2 = D.$.left.querySelector('.nx-lib-q'); i2.focus(); i2.setSelectionRange(pos, pos); };
  input.onkeydown = (e) => e.stopPropagation();
}
const patCache = new Map();
function patThumb(k, b) {
  const key = `${k}:${b.colors[0]}`;
  if (!patCache.has(key)) { import('../library.js').then(({ makePattern }) => { const t = makePattern(k, { fg: b.colors[0], bg: '#ffffff', size: 18 }); patCache.set(key, t.toDataURL()); }); return ''; }
  return patCache.get(key);
}
function bindLeft(D) {
  D.$.left.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-nxl]'); if (!b) return;
    e.stopPropagation();
    const [kind, arg] = b.dataset.nxl.split(/:(.*)/s);
    const s = D.sel(); const one = s.length === 1 ? s[0] : null;
    try {
      if (kind === 'tpl') { const empty = D.canvas.getObjects().filter((o) => o.id !== '__board').length === 0; await C.applyTemplate(D, arg, { onNewPage: !empty }); }
      if (kind === 'shape') C.addShape(D, arg);
      if (kind === 'sticker') await C.addSticker(D, arg);
      if (kind === 'frame') C.addFrame(D, arg);
      if (kind === 'grid') C.addGrid(D, arg);
      if (kind === 'chart') C.addChart(D, arg);
      if (kind === 'table') C.addTable(D);
      if (kind === 'qr') await C.addQr(D);
      if (kind === 'icon') await C.addIcon(D, arg);
      if (kind === 'comp') await C.insertComponent(D, arg);
      if (kind === 'pattern') { if (!s.length) { toast('Sélectionne d’abord une forme à remplir.', { kind: 'bad' }); return; } const br = getBrand(); for (const o of s) if (!isText(o) && o.type !== 'image') applyPattern(o, { kind: arg, fg: br.colors[0], bg: '#ffffff', size: 40 }); D.changed(); }
      if (kind === 'color') { if (!s.length) { toast('Sélectionne d’abord un calque à colorer.'); return; } for (const o of s) o.set('fill', arg); D.canvas.requestRenderAll(); D.changed(); }
      if (kind === 'logo') { const br = getBrand(); const img = await FabricImage.fromURL(br.logo); const pg = D.page; const k = Math.min(pg.w * 0.2 / img.width, pg.h * 0.12 / img.height); img.set({ scaleX: k, scaleY: k, left: pg.w * 0.05, top: pg.h * 0.05 }); img.id = uid(); img.name = 'Logo'; img.nxKind = 'logo'; D.canvas.add(img); D.canvas.setActiveObject(img); D.changed(); }
      if (kind === 'brand-apply') await C.applyBrand(D);
      if (kind === 'brand-edit') brandSheet({});
      void one;
    } catch (err) { console.error(err); toast(err.message || String(err), { kind: 'bad' }); }
  });
}

// ---------- Panneau de droite ----------
function propsHtml(D) {
  const s = D.sel(); const o = s.length === 1 ? s[0] : null;
  if (!s.length) return pageProps(D);
  let h = '';
  if (s.length > 1) {
    const shapes = s.filter(V.isShape); const texts = s.filter(isText); const imgs = s.filter((x) => x.type === 'image'); const frames = s.filter((x) => x.nxFrame && x.nxFrame.empty);
    h += sec('Vectoriel', `<div class="nx-btns">
      ${shapes.length >= 2 ? btn('divide', 'nxCut', 'Diviser') + btn('join', 'nxJoin', 'Joindre') + btn('blend', 'nxBlend', 'Dégradé de formes') : ''}
      ${texts.length === 1 && shapes.length >= 1 ? btn('textpath', 'nxPath', 'Texte sur le tracé') : ''}
      ${imgs.length === 1 && frames.length === 1 ? btn('toframe', 'nxFrameImg', 'Placer l’image dans le cadre') : ''}
      ${btn('comp-new', 'nxComponent', 'Créer un composant')}</div>
      ${shapes.length >= 2 ? range('blendSteps', 'Étapes du dégradé', settings.nxBlendSteps || 6, 1, 40, 1, String(settings.nxBlendSteps || 6)) : ''}`);
    return h;
  }
  // Calque seul.
  if (o.nxFrame && o.nxFrame.empty) h += sec('Cadre photo', `<div class="nx-btns">${btn('frame-pick', 'image', 'Choisir une image…')}</div><p class="nx-note">Astuce : dépose une image directement sur le cadre.</p>`);
  if (o.type === 'image' && o.nxFrame && !o.nxFrame.empty) {
    const f = o.nxFrame;
    h += sec('Cadre photo', `${range('frameZoom', 'Zoom dans le cadre', f.zoom || 1, 1, 4, 0.01, `${Math.round((f.zoom || 1) * 100)} %`)}${range('frameDx', 'Décalage horizontal', f.dx || 0, -0.5, 0.5, 0.01, `${Math.round((f.dx || 0) * 100)} %`)}${range('frameDy', 'Décalage vertical', f.dy || 0, -0.5, 0.5, 0.01, `${Math.round((f.dy || 0) * 100)} %`)}
      <div class="nx-btns">${btn('frame-pick', 'image', 'Changer l’image…')}${btn('frame-out', 'close', 'Sortir du cadre')}</div>`);
  }
  if (o.nxChart) h += sec('Graphique', `${seg('chartType', o.nxChart.type, { bar: 'Barres', line: 'Courbe', pie: 'Camembert', donut: 'Anneau' })}<div class="nx-btns">${btn('chart-edit', 'nxChart', 'Modifier les données…')}</div>`);
  if (o.nxTable) h += sec('Tableau', `<div class="nx-btns">${btn('table-edit', 'nxTable', 'Modifier le contenu…')}</div>`);
  if (o.nxQr) h += sec('Code QR', `<div class="st-field"><span>Lien</span><input class="input small" data-nx="qrText" value="${esc(o.nxQr.text)}"></div><div class="dz-row"><span class="dz-lab">Couleur</span>${sw('qrColor', o.nxQr.color)}<span class="dz-lab">Fond</span>${sw('qrBg', o.nxQr.bg)}</div>`);
  if (o.nxRepeat) {
    const r = o.nxRepeat;
    h += sec(o.nxRepeat.mode === 'radial' ? 'Répétition circulaire' : 'Répétition en grille', r.mode === 'radial' ? `${range('rep:count', 'Nombre', r.count || 8, 2, 48, 1, String(r.count || 8))}${range('rep:radius', 'Rayon', Math.round(r.radius || 200), 10, 2000, 1, `${Math.round(r.radius || 200)} px`)}${chk('rep:rotate', 'Orienter les copies', r.rotate !== false)}` : `${range('rep:cols', 'Colonnes', r.cols || 3, 1, 20, 1, String(r.cols || 3))}${range('rep:rows', 'Rangées', r.rows || 3, 1, 20, 1, String(r.rows || 3))}${range('rep:gapX', 'Espace horizontal', Math.round(r.gapX ?? 20), 0, 600, 1, `${Math.round(r.gapX ?? 20)} px`)}${range('rep:gapY', 'Espace vertical', Math.round(r.gapY ?? 20), 0, 600, 1, `${Math.round(r.gapY ?? 20)} px`)}${chk('rep:stagger', 'Décaler une rangée sur deux', !!r.stagger)}`);
  }
  if (o.nxComp) h += sec('Composant', o.nxComp.master ? `<p class="nx-note">Composant principal : modifie-le puis mets à jour ses copies, sur toutes les pages.</p><div class="nx-btns">${btn('comp-update', 'sync', 'Mettre à jour les copies')}${btn('comp-detach', 'close', 'Détacher')}</div>` : `<p class="nx-note">Copie d’un composant : elle suit le principal.</p><div class="nx-btns">${btn('comp-detach', 'close', 'Détacher la copie')}</div>`);
  if (isText(o)) h += textCards(D, o);
  if (V.isShape(o) && o.type !== 'group') h += vectorCards(D, o);
  if (o.type === 'group' && !o.nxChart && !o.nxTable && !o.nxQr) h += sec('Vectoriel', `<div class="nx-btns">${btn('repeat-radial', 'nxRepeat', 'Répéter en cercle')}${btn('repeat-grid', 'grid', 'Répéter en grille')}${btn('mirror', 'nxMirror', 'Symétrie')}${o.nxComp ? '' : btn('comp-new', 'nxComponent', 'Créer un composant')}</div>`);
  if (o.type === 'image') h += imageCards(D, o);
  h += fxCard(o);
  h += animCard(o);
  return h;
}
function pageProps(D) {
  let h = '';
  const t = D.tool;
  if (t && t.startsWith('nx') && D.nxPix.tool && D.nxPix.tool !== 'crop') {
    const id = D.nxPix.tool; const O = pixOpts();
    h += sec(`Outil : ${PIX_TOOLS[id][0]}`, `${['lasso', 'wand'].includes(id) ? '' : `${range('pix:size', 'Taille', O.size, 2, 600, 1, `${O.size} px`)}${range('pix:hard', 'Dureté', O.hard, 0, 0.99, 0.01, `${Math.round(O.hard * 100)} %`)}${range('pix:opacity', 'Opacité', O.opacity, 0.05, 1, 0.01, `${Math.round(O.opacity * 100)} %`)}`}
      ${id === 'brush' ? `<div class="dz-row"><span class="dz-lab">Couleur</span>${sw('pixColor', O.color)}</div>` : ''}
      ${id === 'wand' ? `${range('pix:tol', 'Tolérance', O.tol, 0, 160, 1, String(O.tol))}${chk('pix:contiguous', 'Pixels contigus seulement', O.contiguous)}<p class="nx-note">Maj : ajouter · Alt : retirer</p>` : ''}
      ${id === 'lasso' ? '<p class="nx-note">Entoure une zone de l’image en gardant le bouton enfoncé. Maj : ajouter à la sélection.</p>' : ''}
      ${id === 'maskbrush' ? `${seg('pix:maskMode', O.maskMode, { hide: 'Masquer', reveal: 'Révéler' })}<p class="nx-note">Le calque n’est pas modifié : le masque se retire à tout moment.</p>` : ''}
      ${['stamp', 'heal'].includes(id) ? '<p class="nx-note">Alt + clic sur la zone à copier, puis peins sur la zone à corriger.</p>' : ''}
      <p class="nx-note">Raccourcis : [ et ] pour la taille · Échap pour quitter.</p>`);
  }
  if (t === 'nxnodes') h += sec('Édition des points', `<p class="nx-note">Glisse les points et les poignées · double-clic sur le trait : ajouter un point · double-clic sur un point : lisse ou angle · Suppr : retirer · K : ciseaux.</p><div class="nx-btns">${btn('nodes-scissors', 'nxScissors', D.nxNodes.scissors ? 'Ciseaux : actifs' : 'Ciseaux (K)')}${btn('nodes-done', 'check', 'Terminer')}</div>`);
  h += '<!--nx-split-->';
  if (t === 'pencil') h += sec('Lissage du crayon', range('pencilSmooth', 'Lissage', Number(settings.nxPencilSmooth || 0), 0, 1, 0.05, Number(settings.nxPencilSmooth || 0) ? `${Math.round(settings.nxPencilSmooth * 100)} %` : 'Aucun'));
  const pa = PG.pageAnim(D.page);
  h += sec('Animation de la page', `${range('pageDur', 'Durée', pa.dur, 1, 30, 0.5, `${fmt(pa.dur)} s`)}<div class="st-field"><span>Transition vers cette page</span>${sel('pageTrans', pa.trans, PG.TRANS)}</div><div class="nx-btns">${btn('play', 'play', 'Lire')}${btn('anim-export', 'film', 'Exporter…')}${btn('present', 'nxPresent', 'Présenter')}</div>`);
  const b = getBrand();
  h += sec('Kit de marque', `<div class="nx-chips">${b.colors.map((c) => `<span class="nx-chip" style="--c:${esc(c)}" title="${esc(c)}"></span>`).join('')}<b class="nx-brandname">${esc(b.name || 'Sans nom')}</b></div><div class="nx-btns">${btn('brand-apply', 'nxPalette', 'Appliquer à la page')}${btn('brand-edit', 'nxBrand', 'Modifier…')}${btn('resize', 'nxResize', 'Autres formats…')}</div>`);
  return h;
}
function textCards(D, o) {
  const fx = o.nxFx || {}; const on = (k) => fx[k] && fx[k].on;
  const preset = on('outerGlow') && !on('stroke') ? 'neon' : on('echo') ? 'echo' : on('hardShadow') ? 'hard' : on('bevel') ? 'relief' : o.paintFirst === 'stroke' && o.stroke ? 'outline' : o.textBackgroundColor ? 'mark' : 'none';
  const styles = C.textStyles(D);
  return sec('Effets de texte', `<div class="dz-presets">${[['none', 'Aucun'], ['neon', 'Néon'], ['outline', 'Contour'], ['echo', 'Écho'], ['mark', 'Surligné'], ['hard', 'Ombre décalée'], ['relief', 'Relief']].map(([k, l]) => `<button class="st-chip${preset === k ? ' on' : ''}" data-nxa="tfx:${k}">${l}</button>`).join('')}</div>
    ${range('curve', 'Courbure', o.nxCurve ? o.nxCurve.amount : 0, -100, 100, 1, o.nxCurve ? `${o.nxCurve.amount}` : 'Droit')}
    <div class="nx-btns">${btn('text-paths', 'nxTrace', 'Vectoriser le texte')}</div>`) +
    sec('Styles de texte', `<div class="st-field"><span>Style</span><select class="input small" data-nx="textStyle"><option value="">Choisir un style…</option>${styles.map((s) => `<option value="${esc(s.id)}" ${o.nxStyle === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div><div class="nx-btns">${btn('style-save', 'check', o.nxStyle ? 'Mettre à jour le style' : 'Enregistrer comme style…')}</div>`);
}
function vectorCards(D, o) {
  const open = o.type === 'line' || (o.type === 'path' && (() => { try { return V.toNodes(o).some((s) => !s.closed); } catch { return false; } })());
  const ar = o.nxArrows || {};
  let h = sec('Vectoriel', `<div class="nx-icons">${ib('nodes', 'nxNodes', 'Édition des points (A)')}${ib('simplify', 'nxSimplify', 'Simplifier le tracé')}${ib('smooth', 'nxCurve', 'Lisser')}${ib('reverse', 'sync', 'Inverser le sens')}${ib('close', 'nxJoin', open ? 'Fermer le tracé' : 'Ouvrir le tracé')}${ib('separate', 'layers', 'Séparer les parties')}${ib('outline-stroke', 'nxOffset', 'Contour vers tracé')}${ib('mirror', 'nxMirror', 'Symétrie (copie miroir)')}</div>
    <div class="dz-grid2">${range('offset', 'Décalage', settings.nxOffset ?? 12, -200, 200, 1, `${settings.nxOffset ?? 12} px`)}<div class="nx-btns" style="align-self:end">${btn('offset', 'nxOffset', 'Décaler')}</div></div>
    <div class="st-field"><span>Déformation</span><div class="dz-grid2">${sel('distortKind', settings.nxDistort || 'arc', V.DISTORT)}${btn('distort', 'nxDistort', 'Appliquer')}</div></div>
    ${range('distortAmt', 'Intensité de la déformation', settings.nxDistortAmt ?? 0.5, -1, 1, 0.05, `${Math.round((settings.nxDistortAmt ?? 0.5) * 100)} %`)}
    <div class="nx-btns">${btn('repeat-radial', 'nxRepeat', 'Répéter en cercle')}${btn('repeat-grid', 'grid', 'Répéter en grille')}${btn('comp-new', 'nxComponent', 'Créer un composant')}</div>`);
  if (open && o.stroke) h += sec('Extrémités', `<div class="dz-grid2"><div class="st-field"><span>Début</span>${sel('arrowStart', ar.start || 'none', V.ARROWS)}</div><div class="st-field"><span>Fin</span>${sel('arrowEnd', ar.end || 'none', V.ARROWS)}</div></div>${range('arrowSize', 'Taille des flèches', ar.size || 3.2, 1.5, 8, 0.1, `${fmt(ar.size || 3.2)}×`)}`);
  if (!['line'].includes(o.type)) {
    const p = o.nxPattern;
    h += sec('Motif', `<div class="st-field"><span>Remplissage en motif</span>${sel('pattern', p ? p.kind : '', { '': 'Aucun (couleur unie)', ...PATTERNS })}</div>${p ? `<div class="dz-row"><span class="dz-lab">Motif</span>${sw('patFg', p.fg)}<span class="dz-lab">Fond</span>${sw('patBg', p.bg)}</div>${range('patSize', 'Échelle', p.size || 40, 8, 200, 1, `${p.size || 40} px`)}` : ''}`);
  }
  return h;
}
function imageCards(D, o) {
  let h = sec('Retouche avancée', `<div class="nx-btns">${btn('crop', 'nxCrop', 'Recadrer')}${o.cropX || o.cropY ? btn('crop-reset', 'restart', 'Recadrage d’origine') : ''}${btn('subject', 'nxWand', 'Sélectionner le sujet')}${btn('bg-remove', 'nxEraser', 'Retirer l’arrière-plan')}${btn('expand', 'nxResize', 'Agrandir l’image…')}${btn('ai-fill', 'sparkle', 'Remplissage génératif…')}${btn('trace', 'nxTrace', 'Vectoriser…')}
    ${o.nxMask ? btn('mask-clear', 'close', 'Retirer le masque') : btn('mask-paint', 'nxMaterial', 'Peindre un masque')}
    ${o.nxLink ? btn('link-replace', 'sync', 'Remplacer toutes les copies…') : btn('link', 'link', 'Objet dynamique')}
    ${o.nxOrig ? btn('orig', 'restart', 'Revenir à l’original') : ''}</div>`);
  const adj = Array.isArray(o.nxAdj) ? o.nxAdj : [];
  h += sec('Réglages non destructifs', `${adj.length ? adj.map((a, i) => adjRow(a, i, adj.length)).join('') : '<p class="nx-note">Ajoute des réglages : ils se modifient, se masquent ou se suppriment sans toucher à l’image.</p>'}<div class="nx-btns">${btn('adj-add', 'plus', 'Ajouter un réglage')}</div>`);
  return h;
}
function adjRow(a, i, n) {
  const p = a.params; const k = (x) => `adj:${i}:${x}`;
  let body = '';
  if (a.type === 'levels') body = `${range(k('inBlack'), 'Noirs (entrée)', p.inBlack, 0, 0.9, 0.01, `${Math.round(p.inBlack * 255)}`)}${range(k('inWhite'), 'Blancs (entrée)', p.inWhite, 0.1, 1, 0.01, `${Math.round(p.inWhite * 255)}`)}${range(k('gamma'), 'Tons moyens (gamma)', p.gamma, 0.2, 3, 0.01, fmt(p.gamma, 2))}${range(k('outBlack'), 'Noirs (sortie)', p.outBlack, 0, 0.9, 0.01, `${Math.round(p.outBlack * 255)}`)}${range(k('outWhite'), 'Blancs (sortie)', p.outWhite, 0.1, 1, 0.01, `${Math.round(p.outWhite * 255)}`)}`;
  if (a.type === 'curves') body = `<div class="st-field"><span>Courbe</span>${sel(k('preset'), p.preset, Object.fromEntries(Object.entries(CURVE_PRESETS).map(([x, [l]]) => [x, l])))}</div>${seg(k('channel'), p.channel || 'rgb', { rgb: 'RVB', r: 'Rouge', g: 'Vert', b: 'Bleu' })}${p.preset === 'libre' ? `${range(k('shadows'), 'Ombres', p.shadows, 0, 0.6, 0.01, fmt(p.shadows, 2))}${range(k('mids'), 'Tons moyens', p.mids, 0.2, 0.8, 0.01, fmt(p.mids, 2))}${range(k('highs'), 'Hautes lumières', p.highs, 0.4, 1, 0.01, fmt(p.highs, 2))}` : ''}`;
  if (a.type === 'balance') { const rk = p.range || 'mids'; const arr = p[rk[0]] || [0, 0, 0]; body = `${seg(k('range'), rk, { shadows: 'Ombres', mids: 'Tons moyens', highs: 'Hautes lumières' })}${range(k('bal0'), 'Cyan ↔ Rouge', arr[0], -1, 1, 0.01, fmt(arr[0], 2))}${range(k('bal1'), 'Magenta ↔ Vert', arr[1], -1, 1, 0.01, fmt(arr[1], 2))}${range(k('bal2'), 'Jaune ↔ Bleu', arr[2], -1, 1, 0.01, fmt(arr[2], 2))}`; }
  if (a.type === 'huesat') body = `<div class="st-field"><span>Couleurs visées</span>${sel(k('range'), p.range, Object.fromEntries(Object.entries(HUE_RANGES).map(([x, [l]]) => [x, l])))}</div>${range(k('hue'), 'Teinte', p.hue, -0.5, 0.5, 0.005, `${Math.round(p.hue * 360)}°`)}${range(k('sat'), 'Saturation', p.sat, -1, 1, 0.01, `${Math.round(p.sat * 100)} %`)}${range(k('light'), 'Luminosité', p.light, -1, 1, 0.01, `${Math.round(p.light * 100)} %`)}`;
  if (a.type === 'gradmap') body = `<div class="dz-row"><span class="dz-lab">Ombres</span>${sw(k('a'), p.a)}<span class="dz-lab">Lumières</span>${sw(k('b'), p.b)}</div>${range(k('amount'), 'Intensité', p.amount, 0, 1, 0.01, `${Math.round(p.amount * 100)} %`)}`;
  return `<details class="nx-adj" ${a.open !== false ? 'open' : ''} data-adj="${i}"><summary><span>${esc(ADJ[a.type].label)}</span><span class="grow"></span>
    <button class="icon-btn small" data-nxa="adj-vis:${i}" title="${a.on === false ? 'Afficher' : 'Masquer'}">${ico(a.on === false ? 'eyeOff' : 'eye', 13)}</button>
    ${i > 0 ? `<button class="icon-btn small" data-nxa="adj-up:${i}" title="Monter">${ico('chevronUp', 13)}</button>` : ''}${i < n - 1 ? `<button class="icon-btn small" data-nxa="adj-down:${i}" title="Descendre">${ico('chevronDown', 13)}</button>` : ''}
    <button class="icon-btn small" data-nxa="adj-del:${i}" title="Supprimer">${ico('trash', 13)}</button></summary>${body}</details>`;
}
function fxCard(o) {
  const fx = o.nxFx || {};
  const rows = Object.entries(FX).map(([id, def]) => {
    const v = { ...def.def, ...(fx[id] || {}) }; const on = fx[id] && fx[id].on; const k = (x) => `fx:${id}:${x}`;
    let body = '';
    if (on) {
      if ('color' in v) body += `<div class="dz-row"><span class="dz-lab">Couleur</span>${sw(k('color'), v.color)}${'color2' in v ? sw(k('color2'), v.color2) : ''}</div>`;
      if ('size' in v) body += range(k('size'), id === 'bevel' ? 'Taille' : id === 'stroke' ? 'Épaisseur' : 'Flou', v.size, 0, 120, 1, `${v.size} px`);
      if ('x' in v) body += `<div class="dz-grid2">${range(k('x'), 'Décalage X', v.x, -80, 80, 1, `${v.x}`)}${range(k('y'), 'Décalage Y', v.y, -80, 80, 1, `${v.y}`)}</div>`;
      if ('count' in v) body += range(k('count'), 'Copies', v.count, 1, 12, 1, String(v.count));
      if ('angle' in v) body += range(k('angle'), 'Angle', v.angle, 0, 360, 1, `${v.angle}°`);
      if ('depth' in v) body += range(k('depth'), 'Profondeur', v.depth, 0.1, 1.5, 0.01, `${Math.round(v.depth * 100)} %`);
      if ('opacity' in v) body += range(k('opacity'), 'Opacité', v.opacity, 0, 1, 0.01, `${Math.round(v.opacity * 100)} %`);
    }
    return `<div class="nx-fx${on ? ' on' : ''}">${chk(`fxon:${id}`, def.label, on)}${body}</div>`;
  }).join('');
  return sec('Effets de calque', rows);
}
function animCard(o) {
  const a = o.nxAnim || { in: 'none', dur: 0.8, delay: 0, loop: 'none' };
  return sec('Animation', `<div class="st-field"><span>Entrée</span>${sel('animIn', a.in || 'none', PG.ANIMS)}</div>${a.in && a.in !== 'none' ? `${range('animDur', 'Durée', a.dur || 0.8, 0.1, 4, 0.1, `${fmt(a.dur || 0.8)} s`)}${range('animDelay', 'Délai', a.delay || 0, 0, 10, 0.1, `${fmt(a.delay || 0)} s`)}` : ''}<div class="st-field"><span>En boucle</span>${sel('animLoop', a.loop || 'none', PG.LOOPS)}</div><div class="nx-btns">${btn('play', 'play', 'Lire l’animation de la page')}</div>`);
}

// ---------- Événements du panneau de droite ----------
function bindProps(D) {
  const f = D.$.props;
  f.addEventListener('input', (e) => { const t = e.target; if (t.dataset.nx && t.type === 'range') onRange(D, t, false); });
  f.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.nxk) { onCheck(D, t); return; }
    if (t.dataset.nx) { if (t.type === 'range') onRange(D, t, true); else onField(D, t); }
  });
  f.addEventListener('click', (e) => {
    const s = e.target.closest('[data-nxs]'); if (s) { onSeg(D, s.dataset.nxs, s.dataset.v); return; }
    const c = e.target.closest('[data-nxc]'); if (c) { e.preventDefault(); pickColor(D, c); return; }
    const a = e.target.closest('[data-nxa]'); if (a) { e.preventDefault(); action(D, a.dataset.nxa, a); }
  });
  // Les « détails » des réglages se souviennent de leur état.
  f.addEventListener('toggle', (e) => { const d = e.target.closest && e.target.closest('details[data-adj]'); const o = D.canvas.getActiveObject(); if (d && o && o.nxAdj && o.nxAdj[Number(d.dataset.adj)]) o.nxAdj[Number(d.dataset.adj)].open = d.open; }, true);
}
const act = (D, label) => { D.nxNextLabel = label; };
function onRange(D, t, done) {
  const k = t.dataset.nx; const v = Number(t.value); const o = D.canvas.getActiveObject();
  const show = (txt) => { const b = D.$.props.querySelector(`[data-nxv="${CSS.escape(k)}"]`); if (b) b.textContent = txt; };
  if (k.startsWith('pix:')) { const O = pixOpts(); const key = k.slice(4); O[key] = v; show(key === 'size' ? `${v} px` : key === 'tol' ? String(v) : `${Math.round(v * 100)} %`); if (done) saveSettings(); return; }
  if (k === 'pencilSmooth') { settings.nxPencilSmooth = v; show(v ? `${Math.round(v * 100)} %` : 'Aucun'); if (done) saveSettings(); return; }
  if (k === 'pageDur') { D.page.nxAnim = { ...PG.pageAnim(D.page), dur: v }; show(`${fmt(v)} s`); if (done) D.changed(); return; }
  if (k === 'blendSteps') { settings.nxBlendSteps = v; show(String(v)); if (done) saveSettings(); return; }
  if (k === 'offset') { settings.nxOffset = v; show(`${v} px`); if (done) saveSettings(); return; }
  if (k === 'distortAmt') { settings.nxDistortAmt = v; show(`${Math.round(v * 100)} %`); if (done) saveSettings(); return; }
  if (!o) return;
  if (k.startsWith('fx:')) { const [, id, p] = k.split(':'); setFx(o, id, { [p]: v }); show(p === 'size' ? `${v} px` : p === 'opacity' || p === 'depth' ? `${Math.round(v * 100)} %` : p === 'angle' ? `${v}°` : String(v)); D.canvas.requestRenderAll(); if (done) { act(D, `Effet : ${FX[id].label}`); D.changed(); } return; }
  if (k.startsWith('adj:')) {
    const [, i, p] = k.split(':'); const a = o.nxAdj[Number(i)];
    if (p.startsWith('bal')) { const rk = a.params.range || 'mids'; const arr = [...(a.params[rk[0]] || [0, 0, 0])]; arr[Number(p.slice(3))] = v; a.params[rk[0]] = arr; } else a.params[p] = v;
    show(fmt(v, 2));
    clearTimeout(D.nxAdjT); D.nxAdjT = setTimeout(() => refreshAdj(D, o), done ? 0 : 60);
    if (done) { act(D, `Réglage : ${ADJ[a.type].label}`); D.changed(); }
    return;
  }
  if (k === 'curve') { show(v ? String(v) : 'Droit'); if (done && isText(o)) { act(D, 'Texte courbé'); V.curveText(D, o, v); } return; }
  if (k.startsWith('frame')) { const key = { frameZoom: 'zoom', frameDx: 'dx', frameDy: 'dy' }[k]; C.reframe(D, o, { [key]: v }); show(key === 'zoom' ? `${Math.round(v * 100)} %` : `${Math.round(v * 100)} %`); if (done) { act(D, 'Cadrage dans le cadre'); D.changed(); } return; }
  if (k.startsWith('rep:')) { const key = k.slice(4); o.nxRepeat[key] = v; show(String(v)); if (done) { act(D, 'Répétition'); V.repeat(D, o, o.nxRepeat); } return; }
  if (k === 'arrowSize') { o.nxArrows = { ...(o.nxArrows || {}), size: v }; show(`${fmt(v)}×`); D.canvas.requestRenderAll(); if (done) D.changed(); return; }
  if (k === 'patSize') { applyPattern(o, { ...o.nxPattern, size: v }); show(`${v} px`); D.canvas.requestRenderAll(); if (done) D.changed(); return; }
  if (k === 'animDur' || k === 'animDelay') { o.nxAnim = { in: 'fade', dur: 0.8, delay: 0, ...(o.nxAnim || {}), [k === 'animDur' ? 'dur' : 'delay']: v }; show(`${fmt(v)} s`); if (done) D.changed(); }
}
async function onField(D, t) {
  const k = t.dataset.nx; const v = t.value; const o = D.canvas.getActiveObject();
  if (k === 'pageTrans') { D.page.nxAnim = { ...PG.pageAnim(D.page), trans: v }; D.changed(); return; }
  if (k === 'distortKind') { settings.nxDistort = v; saveSettings(); return; }
  if (!o) return;
  if (k === 'animIn' || k === 'animLoop') { o.nxAnim = { in: 'none', dur: 0.8, delay: 0, loop: 'none', ...(o.nxAnim || {}), [k === 'animIn' ? 'in' : 'loop']: v }; act(D, 'Animation'); D.changed(); D.renderProps(); return; }
  if (k === 'qrText') { await C.rebuildQr(D, o, { text: v }); return; }
  if (k === 'textStyle' && v) { const st = C.textStyles(D).find((s) => s.id === v); if (st) { act(D, `Style : ${st.name}`); C.applyTextStyle(D, o, st); D.canvas.requestRenderAll(); D.changed(); } return; }
  if (k === 'arrowStart' || k === 'arrowEnd') { o.nxArrows = { size: 3.2, ...(o.nxArrows || {}), [k === 'arrowStart' ? 'start' : 'end']: v }; D.canvas.requestRenderAll(); D.changed(); return; }
  if (k === 'pattern') { const br = getBrand(); applyPattern(o, v ? { kind: v, fg: (o.nxPattern && o.nxPattern.fg) || br.colors[0], bg: (o.nxPattern && o.nxPattern.bg) || '#ffffff', size: (o.nxPattern && o.nxPattern.size) || 40 } : null); D.canvas.requestRenderAll(); act(D, 'Motif'); D.changed(); D.renderProps(); return; }
  if (k.startsWith('adj:')) { const [, i, p] = k.split(':'); o.nxAdj[Number(i)].params[p] = v; refreshAdj(D, o); D.changed(); D.renderProps(); }
}
function onCheck(D, t) {
  const k = t.dataset.nxk; const o = D.canvas.getActiveObject();
  if (k === 'pix:contiguous') { pixOpts().contiguous = t.checked; saveSettings(); return; }
  if (!o) return;
  if (k.startsWith('fxon:')) { const id = k.slice(5); setFx(o, id, { on: t.checked }); act(D, `Effet : ${FX[id].label}`); D.canvas.requestRenderAll(); D.changed(); D.renderProps(); return; }
  if (k.startsWith('rep:')) { o.nxRepeat[k.slice(4)] = t.checked; V.repeat(D, o, o.nxRepeat); }
}
async function onSeg(D, k, v) {
  const o = D.canvas.getActiveObject();
  if (k === 'pix:maskMode') { pixOpts().maskMode = v; saveSettings(); D.renderProps(); return; }
  if (!o) return;
  if (k === 'chartType') { C.rebuild(D, o, (w, h) => C.buildChart({ ...o.nxChart, type: v }, w, h)); return; }
  if (k.startsWith('adj:')) { const [, i, p] = k.split(':'); o.nxAdj[Number(i)].params[p] = v; refreshAdj(D, o); D.changed(); D.renderProps(); }
}
function pickColor(D, b) {
  const k = b.dataset.nxc; const o = D.canvas.getActiveObject();
  const cur = getComputedStyle(b).getPropertyValue('--c').trim();
  const apply = (c) => {
    b.style.setProperty('--c', c); b.classList.remove('none');
    if (k === 'pixColor') { pixOpts().color = c; return; }
    if (!o) return;
    if (k.startsWith('fx:')) { const [, id, p] = k.split(':'); setFx(o, id, { [p]: c }); }
    if (k.startsWith('adj:')) { const [, i, p] = k.split(':'); o.nxAdj[Number(i)].params[p] = c; clearTimeout(D.nxAdjT); D.nxAdjT = setTimeout(() => refreshAdj(D, o), 60); }
    if (k === 'patFg' || k === 'patBg') applyPattern(o, { ...o.nxPattern, [k === 'patFg' ? 'fg' : 'bg']: c });
    D.canvas.requestRenderAll();
  };
  nxPickColor(b, cur === 'transparent' ? '#000000' : cur, {
    onInput: apply,
    onChange: async () => {
      if (k === 'pixColor') { saveSettings(); return; }
      if (o && (k === 'qrColor' || k === 'qrBg')) { await C.rebuildQr(D, o, { [k === 'qrColor' ? 'color' : 'bg']: getComputedStyle(b).getPropertyValue('--c').trim() }); return; }
      act(D, 'Couleur'); D.changed();
    },
    docColors: D.docColors(), title: 'Couleur'
  });
}

// ---------- Actions ----------
async function action(D, a, btnEl) {
  const s = D.sel(); const o = s.length === 1 ? s[0] : D.canvas.getActiveObject();
  const [name, arg] = a.split(':');
  try {
    switch (name) {
      case 'play': PG.playPage(D); return;
      case 'present': PG.present(D, D.pageIdx); return;
      case 'anim-export': PG.animExportSheet(D); return;
      case 'resize': PG.resizeSheet(D); return;
      case 'brand-apply': act(D, 'Kit de marque'); await C.applyBrand(D); return;
      case 'brand-edit': brandSheet({}); return;
      case 'nodes': nxTool(D, 'nodes'); return;
      case 'nodes-done': D.setTool('select'); return;
      case 'nodes-scissors': D.nxNodes.scissors = !D.nxNodes.scissors; D.renderProps(); return;
      case 'simplify': act(D, 'Simplifier'); V.simplify(D, o, 2.5); return;
      case 'smooth': act(D, 'Lisser'); V.smooth(D, o); return;
      case 'reverse': act(D, 'Inverser le sens'); V.reverse(D, o); return;
      case 'close': act(D, 'Ouvrir ou fermer le tracé'); V.toggleClosed(D, o); D.renderProps(); return;
      case 'separate': act(D, 'Séparer'); V.separate(D, o); return;
      case 'outline-stroke': act(D, 'Contour vers tracé'); V.outlineStroke(D, o); return;
      case 'offset': act(D, 'Décaler le tracé'); V.offset(D, o, settings.nxOffset ?? 12); return;
      case 'distort': act(D, `Déformation : ${V.DISTORT[settings.nxDistort || 'arc']}`); V.distort(D, o, settings.nxDistort || 'arc', settings.nxDistortAmt ?? 0.5); return;
      case 'mirror': act(D, 'Symétrie'); await V.mirror(D, o); return;
      case 'repeat-radial': act(D, 'Répétition circulaire'); await V.repeat(D, o, { mode: 'radial', count: 8, rotate: true, radius: Math.max(o.getScaledWidth(), o.getScaledHeight()) * 1.1 }); return;
      case 'repeat-grid': act(D, 'Répétition en grille'); await V.repeat(D, o, { mode: 'grid', cols: 3, rows: 3, gapX: Math.round(o.getScaledWidth() * 0.25), gapY: Math.round(o.getScaledHeight() * 0.25) }); return;
      case 'divide': act(D, 'Diviser'); V.divide(D, s); return;
      case 'join': act(D, 'Joindre'); V.join(D, s); return;
      case 'blend': act(D, 'Dégradé de formes'); await V.blendShapes(D, s, settings.nxBlendSteps || 6); return;
      case 'textpath': act(D, 'Texte sur tracé'); V.textOnPath(D, s); return;
      case 'text-paths': act(D, 'Vectoriser le texte'); await V.textToPaths(D, o); return;
      case 'tfx': textPreset(D, o, arg); return;
      case 'style-save': { const n = o.nxStyle ? (C.textStyles(D).find((x) => x.id === o.nxStyle) || {}).name : await prompt('Enregistrer comme style', { label: 'Nom du style', value: 'Mon style', icon: 'text' }); if (n) C.saveTextStyle(D, o, n); return; }
      case 'comp-new': act(D, 'Composant'); await C.makeComponent(D); return;
      case 'comp-update': await C.updateComponent(D, o); return;
      case 'comp-detach': o.nxComp = null; D.changed(); D.renderProps(); toast('Composant détaché.'); return;
      case 'frame-pick': await C.pickIntoFrame(D, o.nxFrame && o.nxFrame.empty ? o : o); return;
      case 'frame-out': o.clipPath = null; o.nxFrame = null; o.dirty = true; D.canvas.requestRenderAll(); D.changed(); D.renderProps(); return;
      case 'toframe': { const img = s.find((x) => x.type === 'image'); const fr = s.find((x) => x.nxFrame && x.nxFrame.empty); const el2 = img.getElement(); const cv = document.createElement('canvas'); cv.width = el2.naturalWidth || el2.width; cv.height = el2.naturalHeight || el2.height; cv.getContext('2d').drawImage(el2, 0, 0); D.loading = true; D.canvas.remove(img); D.loading = false; await C.fillFrame(D, fr, cv.toDataURL('image/png')); return; }
      case 'chart-edit': C.editChartSheet(D, o); return;
      case 'table-edit': C.editTableSheet(D, o); return;
      case 'crop': nxTool(D, 'crop'); return;
      case 'crop-reset': D.nxPix.resetCrop(o); return;
      case 'subject': D.nxPix.target = o; D.nxPix.subject(o, 'select'); return;
      case 'bg-remove': act(D, 'Retirer l’arrière-plan'); D.nxPix.subject(o, 'remove'); return;
      case 'expand': D.nxPix.expandSheet(o); return;
      case 'ai-fill': if (!D.nxPix.sel) { D.nxPix.target = o; toast('Sélectionne d’abord la zone à remplir (lasso Q, baguette W ou « Sélectionner le sujet »).'); nxTool(D, 'lasso'); return; } await D.nxPix.aiFill(); return;
      case 'trace': { const r = await menu(btnEl, 'Vectoriser l’image', [{ id: 'c2', label: 'Logo (2 couleurs)' }, { id: 'c4', label: 'Illustration (4 couleurs)' }, { id: 'c8', label: 'Détaillée (8 couleurs)' }, { id: 'bw', label: 'Noir et blanc (trait)' }]); if (!r) return; act(D, 'Vectoriser l’image'); await V.traceImage(D, o, r === 'bw' ? { mode: 'bw', detail: 0.7 } : { colors: Number(r.slice(1)), detail: r === 'c8' ? 0.85 : 0.6 }); return; }
      case 'mask-paint': nxTool(D, 'maskbrush'); return;
      case 'mask-clear': o.nxMask = null; o.objectCaching = !fxActive(o); o.dirty = true; D.canvas.requestRenderAll(); D.changed(); D.renderProps(); return;
      case 'link': C.linkImage(D, o); D.renderProps(); return;
      case 'link-replace': await C.replaceLinked(D, o); return;
      case 'orig': await D.nxPix.restoreOriginal(o); D.renderProps(); return;
      case 'adj-add': { const id = await menu(btnEl, 'Ajouter un réglage', Object.entries(ADJ).map(([k, v]) => ({ id: k, label: v.label }))); if (!id) return; o.nxAdj = [...(o.nxAdj || []), { id: uid(), type: id, on: true, params: JSON.parse(JSON.stringify(ADJ[id].def)) }]; refreshAdj(D, o); act(D, `Réglage : ${ADJ[id].label}`); D.changed(); D.renderProps(); return; }
      case 'adj-vis': { const x = o.nxAdj[Number(arg)]; x.on = x.on === false; refreshAdj(D, o); D.changed(); D.renderProps(); return; }
      case 'adj-del': o.nxAdj.splice(Number(arg), 1); refreshAdj(D, o); D.changed(); D.renderProps(); return;
      case 'adj-up': case 'adj-down': { const i = Number(arg); const j = name === 'adj-up' ? i - 1 : i + 1; [o.nxAdj[i], o.nxAdj[j]] = [o.nxAdj[j], o.nxAdj[i]]; refreshAdj(D, o); D.changed(); D.renderProps(); return; }
      case 'sel-del': D.nxPix.applyAlpha(false); return;
      case 'sel-keep': D.nxPix.applyAlpha(true); return;
      case 'sel-copy': await D.nxPix.copyToLayer(); return;
      case 'sel-fill': D.nxPix.fillContent(); return;
      case 'sel-ai': await D.nxPix.aiFill(); return;
      case 'sel-inv': D.nxPix.invertSel(); return;
      case 'sel-feather': D.nxPix.featherSel(3); return;
      case 'sel-none': D.nxPix.clearSel(); return;
      default: break;
    }
  } catch (e) { console.error(e); toast(e.message || String(e), { kind: 'bad' }); }
}
function textPreset(D, o, k) {
  const keepColor = typeof o.fill === 'string' ? o.fill : '#1d1d1f';
  o.nxFx = {}; o.set({ stroke: null, strokeWidth: 0, paintFirst: 'fill', textBackgroundColor: '' });
  const b = getBrand();
  if (k === 'neon') { const dark = luminance(typeof keepColor === 'string' && keepColor.startsWith('#') ? keepColor : '#1d1d1f') < 0.3; setFx(o, 'outerGlow', { on: true, color: dark ? b.colors[0] : keepColor, size: 22, opacity: 0.9 }); if (!dark) setFx(o, 'innerGlow', { on: true, color: '#ffffff', size: 6, opacity: 0.6 }); }
  if (k === 'outline') o.set({ stroke: b.colors[3] === keepColor ? b.colors[0] : b.colors[3], strokeWidth: Math.max(2, o.fontSize / 18), paintFirst: 'stroke', strokeLineJoin: 'round' });
  if (k === 'echo') setFx(o, 'echo', { on: true, color: b.colors[1], count: 3, x: Math.round(o.fontSize / 18), y: Math.round(o.fontSize / 18), opacity: 0.9 });
  if (k === 'mark') o.set({ textBackgroundColor: b.colors[2] });
  if (k === 'hard') setFx(o, 'hardShadow', { on: true, color: b.colors[0], x: Math.round(o.fontSize / 14), y: Math.round(o.fontSize / 14), opacity: 1 });
  if (k === 'relief') { setFx(o, 'bevel', { on: true, size: Math.max(3, o.fontSize / 16), depth: 0.8 }); setFx(o, 'hardShadow', { on: true, color: '#000000', x: 0, y: Math.round(o.fontSize / 22), opacity: 0.35 }); }
  o.objectCaching = !fxActive(o); o.dirty = true;
  act(D, 'Effet de texte'); D.canvas.requestRenderAll(); D.changed(); D.renderProps();
}
export { Path, Group };
