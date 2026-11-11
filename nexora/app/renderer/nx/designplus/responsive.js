// NEXORA #054 : responsive dans le design : contraintes de chaque élément (gauche, droite, centre, étirer,
// proportionnel), aperçu de la page à n'importe quelle largeur, déclinaisons téléphone, tablette et ordinateur,
// et règles CSS des contraintes pour l'export de code. Sans réglage, les contraintes sont devinées.
import { esc, ico, btn, sec, select, uid, toast, busy, util, FabricObject, isText, pl } from './ui.js';
import { guessCons, constrain, fitInside, pushDown } from './pure.js';
import { Canvas } from '../design/fab.js';
import * as AL from './autolayout.js';

export const SIZES = [['phone', 'Téléphone', 390, 844], ['tablet', 'Tablette', 834, 1194], ['desktop', 'Ordinateur', 1440, 0]];
const H_OPTS = [['auto', 'Automatique'], ['left', 'Gauche'], ['right', 'Droite'], ['center', 'Centre'], ['stretch', 'Gauche et droite'], ['scale', 'Proportionnel']];
const V_OPTS = [['auto', 'Automatique'], ['top', 'Haut'], ['bottom', 'Bas'], ['center', 'Centre'], ['stretch', 'Haut et bas'], ['scale', 'Proportionnel']];
const label = (opts, v) => (opts.find(([k]) => k === v) || ['', ''])[1];

export const box = (o) => { o.setCoords(); const r = o.getBoundingRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; };
export function consOf(o, W, H) {
  const c = o.nxCons || {};
  const g = guessCons(box(o), W, H);
  return { h: c.h && c.h !== 'auto' ? c.h : g.h, v: c.v && c.v !== 'auto' ? c.v : g.v };
}
const heightFor = (D, w) => { const s = SIZES.find(([, , sw]) => sw === w); if (s && s[3]) return s[3]; return w <= 600 ? 844 : w <= 1100 ? 1194 : Math.round(w * D.page.h / D.page.w); };

// Élément amené à sa nouvelle boîte : textes et mises en page automatiques changent de largeur (retour à la
// ligne), images gardent leurs proportions, rectangles changent de taille, les autres s'étirent.
function resize(o, b, nb) {
  const text = isText(o);
  const kx = nb.width / Math.max(0.001, b.width); let ky = nb.height / Math.max(0.001, b.height);
  // Seuls les rectangles changent de forme ; images, cercles, tracés et groupes gardent leurs proportions.
  const keepRatio = !text && !o.nxAuto && !(o.type === 'rect' && !o.nxFrame);
  if (keepRatio) ky = kx;
  if (Math.abs(kx - 1) > 0.001) {
    if (o.type === 'textbox') {
      // Un mot plus large que la boîte élargirait le texte : la taille du texte est réduite jusqu'à ce qu'il tienne.
      const want = Math.max(20, o.width * kx);
      o.set({ width: want });
      for (let n = 0; n < 4 && o.initDimensions; n++) { o.initDimensions(); if (o.width <= want + 0.5) break; o.set({ fontSize: o.fontSize * want / o.width, width: want }); }
    }
    else if (o.nxAuto) { o.nxAuto = { ...o.nxAuto, w: Math.max(40, (b.width * kx) / (o.scaleX || 1)) }; AL.relayout(o); }
    else if (text || keepRatio) o.set({ scaleX: o.scaleX * kx, scaleY: o.scaleY * kx });
    else if (o.type === 'rect' && !o.angle) o.set({ width: o.width * kx });
    else o.set({ scaleX: o.scaleX * kx });
  }
  if (!text && !o.nxAuto && !keepRatio && Math.abs(ky - 1) > 0.001) {
    if (o.type === 'rect' && !o.angle) o.set({ height: o.height * ky }); else o.set({ scaleY: o.scaleY * ky });
  }
  if (o.type === 'textbox' && o.initDimensions) o.initDimensions();
  const a = box(o);
  o.set({ left: o.left + (nb.left - a.left), top: o.top + (nb.top - a.top) });
  o.setCoords();
}
// Page (src, contenu json) déclinée à la largeur W : contraintes, éléments ramenés dans la page, textes plus hauts
// qui repoussent ce qui est dessous ; la page s'allonge si le contenu dépasse.
export async function adaptPage(src, json, W, H, name) {
  const objs = await util.enlivenObjects(json.objects || []);
  const F = { w: src.w, h: src.h }; const T = { w: W, h: H };
  const items = [];
  for (const o of objs) {
    const b = box(o); const c = consOf(o, F.w, F.h);
    const flow = isText(o) || Boolean(o.nxAuto);
    let nb = constrain(b, c, F, T, { fixedH: flow });
    nb = fitInside(nb, b, F, T, { text: o.type === 'textbox' || Boolean(o.nxAuto) });
    resize(o, b, nb);
    const a = box(o);
    items.push({ o, c, before: b, after: a, grow: flow ? a.height - b.height : 0 });
  }
  const shifts = pushDown(items);
  let bottom = 0; let origBottom = 0;
  items.forEach((it, i) => {
    if (shifts[i]) { it.o.set({ top: it.o.top + shifts[i] }); it.o.setCoords(); }
    const inside = it.before.top >= -1 && it.before.top + it.before.height <= F.h + 1;
    if (inside && it.c.v !== 'stretch') { const bb = box(it.o); bottom = Math.max(bottom, bb.top + bb.height); origBottom = Math.max(origBottom, it.before.top + it.before.height); }
  });
  const H2 = Math.max(H, Math.ceil(bottom + Math.max(0, F.h - origBottom)));
  // Fonds étirés en hauteur : ils suivent la page allongée.
  if (H2 > H) for (const it of items) if (it.c.v === 'stretch' && !isText(it.o)) { const b = box(it.o); resize(it.o, b, { ...b, height: b.height + (H2 - H) }); }
  return { id: uid(), name, w: W, h: H2, bg: src.bg, json: { version: json.version, objects: objs.map((o) => o.toObject(FabricObject.customProperties)) } };
}
async function thumb(pg, w = 300) {
  const el = document.createElement('canvas');
  const k = w / pg.w;
  const c = new Canvas(el, { width: Math.round(pg.w * k), height: Math.round(pg.h * k), renderOnAddRemove: false, enableRetinaScaling: false, backgroundColor: pg.bg || '#ffffff', selection: false });
  try {
    for (const o of await util.enlivenObjects(pg.json.objects || [])) c.add(o);
    c.setZoom(k); c.renderAll();
    return c.toDataURL({ format: 'png', multiplier: 1 });
  } finally { c.dispose(); }
}

// ---------- Panneau de droite : contraintes ----------
export function props(D, o) {
  if (!o || o.group || o.id === '__board') return '';
  const c = o.nxCons || {}; const g = guessCons(box(o), D.page.w, D.page.h);
  const opts = (list, guess) => list.map(([k, l]) => [k, k === 'auto' ? `Auto : ${label(list, guess).toLowerCase()}` : l]);
  return sec('Contraintes', `<p class="dzx-hint">Place de l’élément quand la page change de largeur : déclinaisons téléphone, tablette, ordinateur et code exporté.</p>
    <div class="dzx-stack">${select('cons-h', 'Horizontal', opts(H_OPTS, g.h), c.h || 'auto')}${select('cons-v', 'Vertical', opts(V_OPTS, g.v), c.v || 'auto')}</div>
    <div class="nx-btns">${btn('open-responsive', 'nxResize', 'Aperçu des tailles d’écran')}</div>`).replace('dzx-card"', 'dzx-card dzx-cons"');
}
export function onField(D, o, k, v) {
  if (k !== 'cons-h' && k !== 'cons-v') return false;
  const c = { ...(o.nxCons || {}) }; c[k === 'cons-h' ? 'h' : 'v'] = v;
  o.nxCons = c.h === 'auto' && c.v === 'auto' ? null : c;
  D.changed();
  return true;
}

// ---------- Onglet « Responsive » ----------
let timer = null;
async function refresh(D, s) {
  if (!document.querySelector('.dzp [data-rprev]')) return;
  D.capturePage();
  const w = s.w; const pg = await adaptPage(D.page, D.page.json, w, heightFor(D, w), '');
  if (s.w !== w) return;
  s.img = await thumb(pg, 300); s.imgW = w; s.imgH = pg.h;
  const el = document.querySelector('.dzp [data-rprev]');
  if (el) el.innerHTML = `<img src="${s.img}" alt="Aperçu de la page à ${w} px de large"><small>${w} × ${pg.h} px</small>`;
}
const schedule = (D, s, ms = 120) => { clearTimeout(timer); timer = setTimeout(() => refresh(D, s).catch((e) => console.warn('[NEXORA #054]', e)), ms); };
// NEXORA #075 : déclinaisons liées à leur page d'origine (pg.nxVariantOf) : quand l'original change, NEXORA le
// signale et « Mettre à jour les déclinaisons » les refait (une version du document est gardée avant).
export function track(D) {
  const proto = Object.getPrototypeOf(D);
  if (proto.nxRespChanged) return;
  proto.nxRespChanged = proto.changed;
  proto.changed = function () {
    this.nxRespChanged();
    if (!this.loading && this.page && this.doc && this.doc.pages.some((p) => p.nxVariantOf && p.nxVariantOf.src === this.page.id)) this.page.nxEditedAt = Date.now();
  };
}
const variantsOf = (D, pg) => D.doc.pages.filter((p) => p.nxVariantOf && p.nxVariantOf.src === pg.id);
function linkHtml(D) {
  const mine = D.page.nxVariantOf; const src = mine && D.doc.pages.find((p) => p.id === mine.src);
  const vars = variantsOf(D, D.page);
  const stale = vars.filter((v) => (D.page.nxEditedAt || 0) > (v.nxVariantOf.at || 0));
  if (src) return `<div class="dzp-gate dzp-update">${ico('link', 16)}<div><b>Déclinaison de « ${esc(src.name)} »</b><small>${(src.nxEditedAt || 0) > (mine.at || 0) ? 'L’original a changé depuis.' : 'À jour avec l’original.'} La mise à jour remplace les retouches faites sur cette page.</small></div><button class="btn small" data-dzx="resp-sync-one">Mettre à jour depuis l’original</button></div>`;
  if (vars.length) return `<div class="dzp-gate ${stale.length ? 'dzp-update' : ''}">${ico('link', 16)}<div><b>${pl(vars.length, 'déclinaison liée', 'déclinaisons liées')} à cette page</b><small>${stale.length ? `La page a changé depuis : ${stale.length} sur ${vars.length} à mettre à jour.` : 'Toutes à jour.'}</small></div>${stale.length ? '<button class="btn small primary" data-dzx="resp-sync">Mettre à jour les déclinaisons</button>' : ''}</div>`;
  return '';
}
async function syncVariants(D, srcPage, targets) {
  const V = await import('./versions.js');
  V.save(D, `Avant la mise à jour des déclinaisons de « ${srcPage.name} »`);
  D.capturePage();
  const json = JSON.parse(JSON.stringify(srcPage.json || (srcPage === D.page ? D.pageJson() : { objects: [] })));
  for (const v of targets) {
    const n = await adaptPage(srcPage, json, v.w, heightFor(D, v.w), v.name);
    Object.assign(v, { w: n.w, h: n.h, json: n.json, bg: n.bg });
    v.nxVariantOf = { ...v.nxVariantOf, at: Date.now() };
  }
  const i = D.pageIdx; await D.openPage(i, { save: false }); D.save(); if (D.renderLeft) D.renderLeft();
  toast(`${pl(targets.length, 'déclinaison mise', 'déclinaisons mises')} à jour. La version d’avant est gardée (Fichier → Versions).`);
}
export function panel(D, s) {
  s.w = s.w || 390; s.pick = s.pick || { phone: true, tablet: true, desktop: false };
  if (s.imgW !== s.w || s.pageId !== D.page.id) { s.pageId = D.page.id; schedule(D, s, 30); }
  return `${linkHtml(D)}<div class="nx-btns"><button class="btn small" data-dzx="resp-formats">${ico('nxResize', 13)}<span>Autres formats (story, bannière, miniature…)</span></button></div><p class="dzx-hint">Chaque élément suit ses contraintes (panneau de droite, section « Contraintes ») ; sans réglage, NEXORA les devine d’après sa place. Les textes reviennent à la ligne, les éléments trop larges rentrent dans la page et ce qui est dessous descend.</p>
    <div class="dzp-sub">Aperçu</div>
    <div class="dzp-bar"><div class="seg">${SIZES.map(([, l, w]) => `<button class="${s.w === w ? 'on' : ''}" data-rsize="${w}">${esc(l)}</button>`).join('')}</div></div>
    <label class="dzx-num dzx-range"><span>Largeur : <b data-rw>${s.w}</b> px</span><input type="range" min="320" max="1920" step="10" value="${s.w}" data-rk="w" aria-label="Largeur de l’aperçu"></label>
    <div class="dzx-resp-prev" data-rprev>${s.img && s.imgW === s.w ? `<img src="${s.img}" alt="Aperçu de la page à ${s.w} px de large"><small>${s.w} × ${s.imgH} px</small>` : '<span class="dzx-hint">Préparation de l’aperçu…</span>'}</div>
    <div class="dzp-sub">Déclinaisons</div>
    <div class="dzx-checks">${SIZES.map(([k, l, w, h]) => `<label class="nxd-check dzx-check"><input type="checkbox" data-rpick="${k}" ${s.pick[k] ? 'checked' : ''}> ${esc(l)} <small>${w} × ${h || 'auto'}</small></label>`).join('')}</div>
    <div class="nx-btns">${btn('resp-make', 'layers', 'Créer les pages', '', 'primary')}${btn('resp-guess', 'nxGridCols', 'Fixer les contraintes devinées')}</div>`;
}
export async function onPanel(D, e, rerender, s) {
  const sz = e.target.closest('[data-rsize]');
  if (sz) { s.w = Number(sz.dataset.rsize); rerender(); return true; }
  const b = e.target.closest('[data-dzx]');
  if (!b) return false;
  if (b.dataset.dzx === 'resp-formats') { const PGm = await import('../design/pages.js'); PGm.resizeSheet(D); return true; }
  if (b.dataset.dzx === 'resp-sync') { await syncVariants(D, D.page, variantsOf(D, D.page)); rerender(); return true; }
  if (b.dataset.dzx === 'resp-sync-one') {
    const src = D.doc.pages.find((p) => p.id === D.page.nxVariantOf.src); if (!src) return true;
    const me = D.page; const at = D.pageIdx;
    D.capturePage();
    await D.openPage(D.doc.pages.indexOf(src), { save: false });
    await syncVariants(D, D.page, [me]);
    await D.openPage(at, { save: false }); rerender(); return true;
  }
  if (b.dataset.dzx === 'resp-guess') {
    let n = 0;
    for (const o of D.canvas.getObjects()) if (o.id !== '__board' && !(o.nxCons && o.nxCons.h && o.nxCons.v)) { o.nxCons = consOf(o, D.page.w, D.page.h); n += 1; }
    D.changed(); D.renderProps(); toast(n ? `Contraintes fixées pour ${pl(n, 'élément', 'éléments')} : modifie-les dans le panneau de droite.` : 'Tous les éléments ont déjà leurs contraintes.');
    return true;
  }
  if (b.dataset.dzx === 'resp-make') {
    const list = SIZES.filter(([k]) => s.pick[k]);
    if (!list.length) { toast('Coche au moins une déclinaison.', { kind: 'bad' }); return true; }
    const t = busy('Déclinaison de la page…');
    try {
      D.capturePage(); const src = D.page; const json = JSON.parse(JSON.stringify(src.json || D.pageJson()));
      const pages = [];
      for (const [k, l, w] of list) { const pg = await adaptPage(src, json, w, heightFor(D, w), `${src.name} · ${l}`); pg.nxVariantOf = { src: src.id, size: k, at: Date.now() }; pages.push(pg); }
      D.doc.pages.splice(D.pageIdx + 1, 0, ...pages);
      await D.openPage(D.pageIdx + 1, { save: false }); D.save();
      D.leftTab = 'pages'; D.renderLeft();
      toast(`${pl(pages.length, 'page créée', 'pages créées')}. Vérifie-les : tu peux ajuster chaque déclinaison à la main.`);
    } finally { if (t && t.close) t.close(); }
    return true;
  }
  return false;
}
export function onPanelInput(D, e, s) {
  const k = e.target.dataset;
  if (k.rk === 'w') { s.w = Number(e.target.value); const l = document.querySelector('.dzp [data-rw]'); if (l) l.textContent = s.w; for (const x of document.querySelectorAll('.dzp [data-rsize]')) x.classList.toggle('on', Number(x.dataset.rsize) === s.w); schedule(D, s); return true; }
  if (k.rpick) { s.pick[k.rpick] = e.target.checked; return true; }
  return false;
}

// ---------- Code : règles CSS des contraintes (élément de premier niveau, page de W × H) ----------
const px = (n) => `${Math.round(n * 100) / 100}px`;
const pct = (n) => `${Math.round(n * 10000) / 100}%`;
export function consCss(o, W, H) {
  const r = box(o); const c = consOf(o, W, H); const st = {};
  if (c.h === 'right') st.right = px(W - r.left - r.width);
  else if (c.h === 'center') st.left = `calc(50% - ${px(W / 2 - r.left)})`;
  else if (c.h === 'stretch') { st.left = px(r.left); st.right = px(W - r.left - r.width); st.width = 'auto'; }
  else if (c.h === 'scale') { st.left = pct(r.left / W); st.width = pct(r.width / W); }
  else st.left = px(r.left);
  if (c.v === 'bottom') st.bottom = px(H - r.top - r.height);
  else if (c.v === 'center') st.top = `calc(50% - ${px(H / 2 - r.top)})`;
  else if (c.v === 'stretch' && !isText(o)) { st.top = px(r.top); st.bottom = px(H - r.top - r.height); st.height = 'auto'; }
  else if (c.v === 'scale') st.top = pct(r.top / H);
  else st.top = px(r.top);
  return st;
}
