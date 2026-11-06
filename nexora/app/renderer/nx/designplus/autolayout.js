// NEXORA #053 : mise en page automatique : un groupe range ses éléments en ligne ou en colonne, avec espacement,
// marges et alignement ; le fond s'adapte au contenu (ou garde une largeur fixe) ; un élément peut remplir l'espace.
import { Group, Rect, Textbox, util, uid, isText, sec, btn, num, select, commit, esc } from './ui.js';

const DEF = { dir: 'col', gap: 12, pad: 16, align: 'start', w: 0, fill: '#f3f4f8', radius: 14 };
const kids = (g) => g.getObjects().filter((o) => !o.nxAutoBg);
const bgOf = (g) => g.getObjects().find((o) => o.nxAutoBg);

export function prepare(g) {
  g.set({ interactive: true, subTargetCheck: true });
  return g;
}

export function relayout(g) {
  if (!g || !g.nxAuto) return;
  const a = { ...DEF, ...g.nxAuto };
  const list = kids(g);
  const bg = bgOf(g);
  const row = a.dir === 'row';
  const fixedW = Number(a.w) > 0 ? Number(a.w) : 0;
  // Éléments qui remplissent : textes et formes dont la largeur suit l'espace disponible.
  if (fixedW) {
    const inner = fixedW - a.pad * 2;
    if (!row) for (const o of list) if (o.nxAutoFill) setW(o, inner);
    if (row) {
      const fills = list.filter((o) => o.nxAutoFill);
      const used = list.filter((o) => !o.nxAutoFill).reduce((s, o) => s + o.getScaledWidth(), 0) + a.gap * Math.max(0, list.length - 1);
      for (const o of fills) setW(o, Math.max(20, (inner - used) / fills.length));
    }
  }
  const sizes = list.map((o) => ({ o, w: o.getScaledWidth(), h: o.getScaledHeight() }));
  const mainSum = sizes.reduce((s, x) => s + (row ? x.w : x.h), 0) + a.gap * Math.max(0, sizes.length - 1);
  const cross = sizes.reduce((m, x) => Math.max(m, row ? x.h : x.w), 0);
  const W = fixedW || (row ? mainSum : cross) + a.pad * 2;
  const H = (row ? cross : mainSum) + a.pad * 2;
  const innerCross = (row ? H : W) - a.pad * 2;
  let p = a.pad;
  for (const x of sizes) {
    const off = a.align === 'center' ? (innerCross - (row ? x.h : x.w)) / 2 : a.align === 'end' ? innerCross - (row ? x.h : x.w) : 0;
    const lx = row ? p : a.pad + off;
    const ly = row ? a.pad + off : p;
    x.o.set({ originX: 'left', originY: 'top', left: -W / 2 + lx, top: -H / 2 + ly, angle: 0 });
    x.o.setCoords();
    p += (row ? x.w : x.h) + a.gap;
  }
  if (bg) bg.set({ originX: 'left', originY: 'top', left: -W / 2, top: -H / 2, width: W, height: H, scaleX: 1, scaleY: 1, rx: a.radius, ry: a.radius, fill: bg.nxVar && bg.nxVar.fill ? bg.fill : a.fill });
  // Le groupe garde son coin haut gauche à la même place.
  const before = g.getBoundingRect();
  if (g.triggerLayout) g.triggerLayout(); else g.set({ width: W, height: H });
  g.set({ width: W, height: H, dirty: true });
  g.setCoords();
  const after = g.getBoundingRect();
  g.set({ left: g.left + (before.left - after.left), top: g.top + (before.top - after.top) });
  g.setCoords();
}
function setW(o, w) {
  if (isText(o)) { o.set({ width: Math.max(20, w / (o.scaleX || 1)) }); if (o.initDimensions) o.initDimensions(); } else if (o.type === 'rect') o.set({ width: Math.max(4, w / (o.scaleX || 1)) });
  else o.set({ scaleX: Math.max(0.05, w / Math.max(1, o.width)) });
}

// Sélection → groupe en mise en page automatique.
export function create(D) {
  const sel = D.sel().filter((o) => o.id !== '__board');
  if (!sel.length) return null;
  const c = D.canvas;
  c.discardActiveObject();
  const r = sel.map((o) => o.getBoundingRect());
  const minX = Math.min(...r.map((b) => b.left));
  const minY = Math.min(...r.map((b) => b.top));
  const spanX = Math.max(...r.map((b) => b.left + b.width)) - minX;
  const spanY = Math.max(...r.map((b) => b.top + b.height)) - minY;
  const dir = spanX > spanY * 1.4 ? 'row' : 'col';
  const ordered = [...sel].sort((a, b) => (dir === 'row' ? a.getBoundingRect().left - b.getBoundingRect().left : a.getBoundingRect().top - b.getBoundingRect().top));
  for (const o of ordered) c.remove(o);
  const bg = new Rect({ width: 10, height: 10, fill: DEF.fill, rx: DEF.radius, ry: DEF.radius, strokeWidth: 0 });
  bg.id = uid(); bg.name = 'Fond'; bg.nxAutoBg = true;
  for (const o of ordered) if (isText(o)) o.nxAutoFill = dir === 'col';
  const g = new Group([bg, ...ordered]);
  g.id = uid(); g.name = 'Mise en page auto';
  g.nxAuto = { ...DEF, dir };
  prepare(g);
  g.set({ left: minX, top: minY });
  c.add(g);
  relayout(g);
  g.set({ left: minX, top: minY }); g.setCoords();
  c.setActiveObject(g);
  commit(D, 'Mise en page automatique');
  return g;
}
export function remove(D, g) {
  delete g.nxAuto;
  const bg = bgOf(g);
  if (bg) delete bg.nxAutoBg;
  commit(D, 'Mise en page automatique retirée');
}
export function addItem(D, g) {
  const t = new Textbox('Nouvel élément', { fontSize: 18, fill: '#1c1d22', fontFamily: 'Inter', width: 180 });
  t.id = uid(); t.name = 'Texte'; t.nxAutoFill = g.nxAuto.dir === 'col';
  g.add(t);
  relayout(g);
  commit(D, 'Élément ajouté');
}

export const groupOf = (o) => (o && o.nxAuto ? o : o && o.group && o.group.nxAuto ? o.group : null);

export function props(D, o) {
  const g = groupOf(o);
  if (!g) {
    if (!D.sel().length) return '';
    return sec('Mise en page automatique', `<p class="dzx-hint">Range les éléments en ligne ou en colonne : le bloc s’adapte quand tu ajoutes, retires ou modifies un élément.</p><div class="nx-btns">${btn('auto-new', 'nxGridCols', 'Ajouter la mise en page auto')}</div>`);
  }
  const a = { ...DEF, ...g.nxAuto };
  const child = o !== g ? o : null;
  return sec('Mise en page automatique', `<div class="dzx-grid2">
      ${select('auto.dir', 'Sens', [['col', 'En colonne'], ['row', 'En ligne']], a.dir)}
      ${select('auto.align', 'Alignement', [['start', 'Début'], ['center', 'Centre'], ['end', 'Fin']], a.align)}
      ${num('auto.gap', 'Espacement', a.gap, 'min="0" step="2"')}
      ${num('auto.pad', 'Marges', a.pad, 'min="0" step="2"')}
      ${select('auto.sizing', 'Largeur', [['hug', 'S’adapte au contenu'], ['fixed', 'Fixe']], a.w ? 'fixed' : 'hug')}
      ${a.w ? num('auto.w', 'Largeur (px)', a.w, 'min="40" step="10"') : num('auto.radius', 'Arrondi', a.radius, 'min="0"')}
    </div>
    <label class="dzx-row"><span>Fond</span><input type="color" data-dzxk="auto.fill" value="${esc(a.fill && a.fill.length === 7 ? a.fill : '#f3f4f8')}"></label>
    ${child ? `<label class="nxd-check dzx-check"><input type="checkbox" data-dzxk="auto.childFill" ${child.nxAutoFill ? 'checked' : ''}> « ${esc(child.name || child.type)} » remplit l’espace disponible</label>` : ''}
    <div class="nx-btns">${btn('auto-add', 'plus', 'Ajouter un texte')}${btn('auto-off', 'close', 'Retirer la mise en page auto')}</div>`);
}
export function onField(D, o, k, v) {
  const g = groupOf(o);
  if (!g) return false;
  const a = g.nxAuto;
  if (k === 'auto.childFill') { o.nxAutoFill = Boolean(v); if (!v && isText(o) && o.initDimensions) o.initDimensions(); }
  else if (k === 'auto.sizing') a.w = v === 'fixed' ? Math.round(g.getScaledWidth()) : 0;
  else if (['auto.gap', 'auto.pad', 'auto.w', 'auto.radius'].includes(k)) a[k.slice(5)] = Math.max(0, Number(v) || 0);
  else a[k.slice(5)] = v;
  relayout(g);
  commit(D, 'Mise en page automatique');
  return true;
}
export function bind(D) {
  const c = D.canvas;
  const again = (e) => { const t = e && (e.target || e); const g = groupOf(t); if (g) { relayout(g); c.requestRenderAll(); } };
  c.on('object:modified', again);
  c.on('text:changed', again);
  c.on('text:editing:exited', again);
}
export function afterLoad(D) {
  for (const o of D.canvas.getObjects()) if (o.nxAuto) { prepare(o); relayout(o); }
  D.canvas.requestRenderAll();
}
