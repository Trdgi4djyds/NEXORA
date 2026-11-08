// NEXORA #011 : pages de NEX-DESIGN (redimensionnement automatique, exports ZIP, animations, présentation,
// historique visible, commentaires, coédition, règles et repères, assistant IA).
import { util, FabricObject, FabricImage, Textbox, ActiveSelection } from './fab.js';
import { a as FORMATS } from '../../dist/chunks/chunk-SKL2UTC7.js';
import { settings, saveSettings, toast, busy, esc, ico, uid, clamp, lerp, sleep, makeCanvas, canvasBytes, zip, encodeGif, saveBytes, safeName, sheet, closeSheet, sheetHtml, menu, prompt, dominantColors, $, el } from '../core.js';
import { aiChat, aiJson, aiImage, needAi, getBrand, CollabRoom, collabSheet } from '../services.js';
import { restorePatterns, fxActive } from './fx.js';
import { applyTemplate, applyBrand } from './content.js';
import { TEMPLATES } from '../library.js';

// ---------- Redimensionnement automatique ----------
export function resizeSheet(D) {
  const cur = `${D.page.w}x${D.page.h}`;
  const list = Object.entries(FORMATS).filter(([, [, w, h]]) => `${w}x${h}` !== cur);
  const s = sheet('nx-resize', sheetHtml({ icon: 'nxResize', title: 'Redimensionner en plusieurs formats', sub: `« ${esc(D.page.name)} » est décliné dans chaque format choisi : les éléments sont replacés et mis à l’échelle, les fonds s’étirent.`, body: `
    <div class="nx-checks">${list.map(([k, [label, w, h]]) => `<label class="check-row"><input type="checkbox" data-nx-fmt="${k}" ${['story', 'yt', 'og', 'portrait'].includes(k) ? 'checked' : ''}><span class="box"></span><span>${esc(label)} <small class="nx-muted">${w} × ${h}</small></span></label>`).join('')}</div>
    <div class="field-label">Où créer les versions</div>
    <div class="seg wide" data-nx-seg="dest"><button class="on" data-v="pages">Nouvelles pages de ce document</button><button data-v="docs">Un nouveau document</button></div>`, go: 'Décliner', goIcon: 'nxResize' }));
  let dest = 'pages';
  s.onclick = async (e) => {
    const b = e.target.closest('[data-nx-seg] [data-v]');
    if (b) { dest = b.dataset.v; for (const x of b.parentElement.children) x.classList.toggle('on', x === b); return; }
    if (!e.target.closest('[data-nx-go]')) return;
    const keys = [...s.querySelectorAll('[data-nx-fmt]:checked')].map((i) => i.dataset.nxFmt);
    if (!keys.length) { toast('Coche au moins un format.', { kind: 'bad' }); return; }
    closeSheet('nx-resize');
    await resizeTo(D, keys, dest);
  };
}
async function adaptPage(D, src, json, W, H, label) {
  const objs = await util.enlivenObjects(json.objects || []);
  const sx = W / src.w; const sy = H / src.h; const s = Math.min(sx, sy);
  for (const o of objs) {
    const r = o.getBoundingRect(); const c = o.getCenterPoint();
    const big = r.width >= src.w * 0.9 && r.height >= src.h * 0.9; const wide = r.width >= src.w * 0.95; const tall = r.height >= src.h * 0.95;
    if ((big || wide || tall) && !['textbox', 'i-text', 'text'].includes(o.type)) {
      const kx = wide || big ? sx : s; const ky = tall || big ? sy : s;
      if (o.type === 'rect' && !o.angle) o.set({ width: o.width * kx, height: o.height * ky }); else o.set({ scaleX: o.scaleX * kx, scaleY: o.scaleY * ky });
    } else o.set({ scaleX: o.scaleX * s, scaleY: o.scaleY * s });
    o.setPositionByOrigin({ x: (c.x / src.w) * W, y: (c.y / src.h) * H }, 'center', 'center');
    o.setCoords();
    // Les éléments restent dans la page.
    const r2 = o.getBoundingRect();
    if (r2.width < W) { if (r2.left < 0) o.left -= r2.left; if (r2.left + r2.width > W) o.left -= r2.left + r2.width - W; }
    if (r2.height < H) { if (r2.top < 0) o.top -= r2.top; if (r2.top + r2.height > H) o.top -= r2.top + r2.height - H; }
  }
  return { id: uid(), name: `${src.name} · ${label}`, w: W, h: H, bg: src.bg, json: { version: json.version, objects: objs.map((o) => o.toObject(FabricObject.customProperties)) } };
}
async function resizeTo(D, keys, dest) {
  const t = busy('Déclinaison des formats…');
  try {
    D.capturePage(); const src = D.page; const json = JSON.parse(JSON.stringify(src.json || D.pageJson()));
    const pages = [];
    for (const k of keys) { const [label, W, H] = FORMATS[k]; pages.push(await adaptPage(D, src, json, W, H, label)); }
    if (dest === 'docs') {
      const mod = await import('../../dist/chunks/chunk-SKL2UTC7.js');
      const doc = mod.c(await D.nxDocName(`${D.doc.name} (formats)`), 'post'); doc.pages = pages; doc.assets = JSON.parse(JSON.stringify(D.doc.assets || {}));
      await D.save(); await mod.f(doc); await D.openDoc(doc);
    } else {
      D.doc.pages.splice(D.pageIdx + 1, 0, ...pages); await D.openPage(D.pageIdx + 1, { save: false }); D.save();
      D.leftTab = 'pages'; D.renderLeft();
    }
    toast(`${pages.length} format${pages.length > 1 ? 's' : ''} créé${pages.length > 1 ? 's' : ''}. Vérifie les textes longs : ils gardent leur taille relative.`);
  } catch (e) { console.error(e); toast(`La déclinaison a échoué : ${e.message || e}`, { kind: 'bad' }); } finally { t.close(); }
}

// ---------- Exports ZIP ----------
export async function exportZip(D, { scale = 2, format = 'png', transparent = false } = {}) {
  const t = busy('Export des pages en archive ZIP…'); const cur = D.pageIdx; const files = [];
  try {
    D.canvas.discardActiveObject();
    for (let i = 0; i < D.doc.pages.length; i++) {
      if (i !== D.pageIdx) await D.openPage(i);
      const c = await D.exportCanvas(scale, transparent && format !== 'jpg');
      files.push({ name: `${String(i + 1).padStart(2, '0')} ${safeName(D.page.name)}.${format}`, data: await canvasBytes(c, format === 'jpg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png', 0.95) });
      t.update && t.update(`Export des pages : ${i + 1} / ${D.doc.pages.length}`);
    }
    if (D.pageIdx !== cur) await D.openPage(cur);
    await saveBytes(zip(files), { name: `${safeName(D.doc.name)} (pages)`, ext: 'zip', project: 'NEX-DESIGN' });
  } catch (e) { toast(`L’export a échoué : ${e.message || e}`, { kind: 'bad' }); } finally { t.close(); }
}
export async function exportLayers(D, { scale = 2 } = {}) {
  const objs = D.canvas.getObjects().filter((o) => o.id !== '__board' && o.visible !== false);
  if (!objs.length) { toast('La page est vide.', { kind: 'bad' }); return; }
  const t = busy('Export de chaque calque…'); const files = [];
  try {
    D.canvas.discardActiveObject();
    for (const [i, o] of objs.entries()) {
      const c = o.toCanvasElement({ multiplier: scale, enableRetinaScaling: false });
      files.push({ name: `${String(i + 1).padStart(2, '0')} ${safeName(o.name || D.typeName(o))}.png`, data: await canvasBytes(c) });
    }
    await saveBytes(zip(files), { name: `${safeName(D.doc.name)} - ${safeName(D.page.name)} (calques)`, ext: 'zip', project: 'NEX-DESIGN' });
  } catch (e) { toast(`L’export a échoué : ${e.message || e}`, { kind: 'bad' }); } finally { t.close(); }
}
// Ajoute trois exports à la fenêtre « Exporter la page » de NEX-DESIGN.
// NEXORA #075 (A-041, A-044) : une seule fenêtre « Exporter » : image, PDF vectoriel, sélection seule, puis tous
// les autres exports (pages, calques, vidéo, impression, code, prototype, icônes d'application, série CSV).
export function patchExportSheet(D) {
  const proto = Object.getPrototypeOf(D);
  if (proto.nxExportSheet) return;
  proto.nxExportSheet = proto.exportSheet;
  proto.exportSheet = function () {
    const active = this.canvas.getActiveObject();
    const selN = active ? (active.type === 'activeselection' || active.type === 'activeSelection' ? active.getObjects().length : 1) : 0;
    this.nxExportSel = null;
    this.nxExportSheet();
    const s = $('#sheet'); const body = s && s.querySelector('.sheet-body');
    if (!body || body.querySelector('.nx-exmore')) return;
    const pdf = body.querySelector('[data-exf="pdf"]'); if (pdf) pdf.textContent = 'PDF (vectoriel)';
    const std = window.__nxDesignPlus && window.__nxDesignPlus.has ? window.__nxDesignPlus.has('design_extended') : true;
    const chip = std ? '' : ' <em class="dzp-pro">Pro</em>';
    const b2 = (k, icon, label, perm) => `<button class="btn small" data-nx-ex="${k}">${ico(icon, 13)}<span>${label}</span>${perm ? chip : ''}</button>`;
    body.insertAdjacentHTML('beforeend', `<div class="nx-exmore">
      ${selN ? `<label class="check-row"><input type="checkbox" data-nx-exsel><span class="box"></span><span>Seulement la sélection (${selN} calque${selN > 1 ? 's' : ''}) · PNG, JPG, WebP ou SVG</span></label>
      <div class="nx-row">${b2('copy', 'nxClipboard', 'Copier la sélection en PNG')}</div>` : ''}
      <div class="field-label">Pages et calques</div><div class="nx-row">${b2('zip', 'nxZip', 'Toutes les pages en ZIP')}${b2('layers', 'layers', 'Chaque calque (PNG, ZIP)')}${b2('anim', 'nxAnimate', 'Vidéo ou GIF animé', true)}</div>
      <div class="field-label">Impression, web et applications</div><div class="nx-row">${b2('print', 'pdf', 'PDF d’impression (fonds perdus)', true)}${b2('code', 'code', 'Code HTML et React', true)}${b2('proto', 'play', 'Prototype en page HTML', true)}${b2('spaces', 'android', 'Icônes d’application', true)}${b2('bulk', 'layers', 'Série depuis un tableur', true)}</div>
      <p class="sheet-note">SVG : les effets de calque et les masques peints sont rendus seulement dans les formats image et PDF.</p></div>`);
    const exsel = body.querySelector('[data-nx-exsel]');
    if (exsel) exsel.onchange = () => { this.nxExportSel = exsel.checked ? (selN > 1 ? active.getObjects().slice() : active) : null; };
    body.querySelector('.nx-exmore').onclick = async (e) => {
      const b = e.target.closest('[data-nx-ex]'); if (!b) return;
      e.stopPropagation();
      const k = b.dataset.nxEx;
      const st = settings.designExport || { scale: '2', format: 'png', transparent: false };
      if (k === 'copy') { await copySelectionPng(this, active); return; }
      closeSheet();
      if (k === 'zip') await exportZip(this, { scale: Number(st.scale) || 2, format: ['jpg', 'webp'].includes(st.format) ? st.format : 'png', transparent: !!st.transparent });
      if (k === 'layers') await exportLayers(this, { scale: Number(st.scale) || 2 });
      if (k === 'anim') { if (gateStd('L’export vidéo')) animExportSheet(this); }
      const tabs = { print: 'print', code: 'code', proto: 'proto', spaces: 'spaces', bulk: 'bulk' };
      if (tabs[k] && window.__nxDesignPlus) window.__nxDesignPlus.open(tabs[k]);
    };
  };
  // Export : PDF vectoriel pour tous (NEXORA #075, A-041) ; sélection seule si la case est cochée.
  if (!proto.nxExportPages) {
    proto.nxExportPages = proto.exportPages;
    proto.exportPages = async function (opts, all = false) {
      if (this.nxExportSel && opts && opts.format !== 'pdf') { const o = this.nxExportSel; this.nxExportSel = null; return exportSelection(this, o, opts); }
      this.nxExportSel = null;
      if (opts && opts.format === 'pdf') {
        const { exportScreenPdf } = await import('../designplus/print.js');
        return exportScreenPdf(this, { all, scale: Number(opts.scale) || 2 });
      }
      return this.nxExportPages(opts, all);
    };
  }
}
const gateStd = (what) => (window.__nxDesignPlus && window.__nxDesignPlus.allowed ? window.__nxDesignPlus.allowed('design_extended', what) : true);

// ---------- Sélection seule : image, SVG, presse-papiers (NEXORA #075) ----------
function selectionCanvas(D, o, scale = 2, background = null) {
  const c = o.toCanvasElement({ multiplier: scale, enableRetinaScaling: false });
  if (!background) return c;
  const out = makeCanvas(c.width, c.height); const x = out.getContext('2d');
  x.fillStyle = background; x.fillRect(0, 0, out.width, out.height); x.drawImage(c, 0, 0);
  return out;
}
function selectionSvg(o) {
  const pts = o.getCoords();
  const xs = pts.map((p) => p.x); const ys = pts.map((p) => p.y);
  const l = Math.min(...xs); const t = Math.min(...ys); const w = Math.max(...xs) - l; const h = Math.max(...ys) - t;
  const inner = o.type === 'activeselection' || o.type === 'activeSelection' ? o.getObjects().map((x) => x.toSVG()).join('\n') : o.toSVG();
  // Les calques d'une sélection multiple sont dessinés dans le repère de la sélection : on la replace sur la page.
  const m = o.type === 'activeselection' || o.type === 'activeSelection' ? o.calcTransformMatrix() : null;
  const g = m ? `<g transform="matrix(${m.map((v) => +v.toFixed(5)).join(' ')})">${inner}</g>` : inner;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${l.toFixed(2)} ${t.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}" width="${Math.round(w)}" height="${Math.round(h)}">\n${g}\n</svg>`;
}
export async function exportSelection(D, sel, { format = 'png', scale = 2, transparent = false } = {}) {
  const name = `${D.doc.name || 'Design'} (sélection)`;
  // Sélection multiple : refaite à l'identique (la fenêtre a pu la défaire), puis défaite après l'export.
  let o = sel; let temp = false;
  if (Array.isArray(sel)) { o = new ActiveSelection(sel.filter((x) => D.canvas.getObjects().includes(x)), { canvas: D.canvas }); D.canvas.setActiveObject(o); temp = true; }
  try {
    if (format === 'svg') { await saveBytes(new TextEncoder().encode(selectionSvg(o)), { name, ext: 'svg', kind: 'photo', project: D.doc.name || 'NEXORA' }); return; }
    const bg = format === 'jpg' || !transparent ? (D.page.bg || '#ffffff') : null;
    const c = selectionCanvas(D, o, Number(scale) || 2, format === 'jpg' ? (D.page.bg || '#ffffff') : bg);
    const type = format === 'jpg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
    await saveBytes(await canvasBytes(c, type, 0.92), { name, ext: format === 'jpg' ? 'jpg' : format, kind: 'photo', project: D.doc.name || 'NEXORA' });
  } catch (e) { console.error(e); toast(`L’export de la sélection a échoué : ${e.message || e}`, { kind: 'bad' }); } finally { if (temp) { D.canvas.discardActiveObject(); D.canvas.requestRenderAll(); } }
}
export async function copySelectionPng(D, o = D.canvas.getActiveObject()) {
  if (!o) { toast('Sélectionne d’abord ce que tu veux copier.'); return false; }
  try {
    const c = selectionCanvas(D, o, 2);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    toast('Sélection copiée en PNG : colle-la dans un autre logiciel.');
    return true;
  } catch (e) { toast('La copie dans le presse-papiers a échoué ici : exporte la sélection depuis « Exporter ».', { kind: 'bad' }); return false; }
}

// ---------- Animations des pages ----------
export const ANIMS = { none: 'Aucune', fade: 'Fondu', rise: 'Monte', drop: 'Descend', slideL: 'Glisse depuis la gauche', slideR: 'Glisse depuis la droite', zoom: 'Zoom', pop: 'Rebond', blur: 'Flou vers net', spin: 'Rotation', type: 'Machine à écrire' };
export const LOOPS = { none: 'Aucune', pulse: 'Pulsation', float: 'Flottement', shake: 'Tremblement', spin: 'Rotation continue' };
export const TRANS = { none: 'Coupe franche', fade: 'Fondu', slide: 'Glissement', zoom: 'Zoom', wipe: 'Volet' };
export const pageAnim = (pg) => ({ dur: 4, trans: 'fade', ...(pg.nxAnim || {}) });
const easeOut = (t) => 1 - (1 - t) ** 3; const back = (t) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
function stateAt(o, t) {
  const a = o.nxAnim; if (!a) return null;
  const st = { alpha: 1, dx: 0, dy: 0, k: 1, rot: 0, blur: 0, chars: null };
  const p = clamp((t - (a.delay || 0)) / Math.max(0.05, a.dur || 0.8), 0, 1); const e = easeOut(p);
  const dist = Math.max(40, (o.getScaledHeight() || 100) * 0.6);
  switch (a.in) {
    case 'fade': st.alpha = e; break;
    case 'rise': st.alpha = e; st.dy = (1 - e) * dist; break;
    case 'drop': st.alpha = e; st.dy = -(1 - e) * dist; break;
    case 'slideL': st.alpha = e; st.dx = -(1 - e) * dist * 2; break;
    case 'slideR': st.alpha = e; st.dx = (1 - e) * dist * 2; break;
    case 'zoom': st.alpha = e; st.k = 0.6 + 0.4 * e; break;
    case 'pop': st.alpha = clamp(p * 3, 0, 1); st.k = Math.max(0.01, back(p)); break;
    case 'blur': st.alpha = e; st.blur = (1 - e) * 12; break;
    case 'spin': st.alpha = e; st.rot = (1 - e) * -90; st.k = 0.7 + 0.3 * e; break;
    case 'type': st.alpha = p > 0 ? 1 : 0; st.chars = p; break;
    default: break;
  }
  if (a.loop && a.loop !== 'none' && t > (a.delay || 0) + (a.dur || 0.8)) {
    const lt = t - (a.delay || 0) - (a.dur || 0.8);
    if (a.loop === 'pulse') st.k *= 1 + Math.sin(lt * Math.PI * 1.6) * 0.04;
    if (a.loop === 'float') st.dy += Math.sin(lt * Math.PI) * 8;
    if (a.loop === 'shake') st.rot += Math.sin(lt * 30) * 2.2 * (Math.sin(lt * 2) > 0.6 ? 1 : 0);
    if (a.loop === 'spin') st.rot += lt * 90;
  }
  return st;
}
function applyStates(D, t) {
  const saved = [];
  for (const o of D.canvas.getObjects()) {
    const st = stateAt(o, t); if (!st) continue;
    saved.push([o, { opacity: o.opacity, left: o.left, top: o.top, scaleX: o.scaleX, scaleY: o.scaleY, angle: o.angle, text: o.text, shadow: o.shadow }]);
    const c = o.getCenterPoint();
    o.set({ opacity: (o.opacity ?? 1) * st.alpha, scaleX: o.scaleX * st.k, scaleY: o.scaleY * st.k, angle: (o.angle || 0) + st.rot });
    o.setPositionByOrigin({ x: c.x + st.dx, y: c.y + st.dy }, 'center', 'center');
    if (st.chars !== null && typeof o.text === 'string') o.set('text', o.text.slice(0, Math.round(o.text.length * st.chars)));
    if (st.blur) o.set('shadow', { color: 'rgba(0,0,0,0)', blur: 0 });
    o.dirty = true;
  }
  return () => { for (const [o, v] of saved) { o.set(v); o.setCoords(); o.dirty = true; } };
}
export const hasAnim = (D) => D.canvas.getObjects().some((o) => o.nxAnim && o.nxAnim.in && o.nxAnim.in !== 'none');
export async function playPage(D) {
  if (D.nxPlaying) { D.nxPlaying = false; return; }
  if (!hasAnim(D)) { toast('Aucune animation sur cette page : sélectionne un calque et choisis son animation d’entrée dans le panneau de droite.'); return; }
  D.canvas.discardActiveObject(); D.nxPlaying = true;
  const dur = pageAnim(D.page).dur; const t0 = performance.now();
  await new Promise((resolve) => {
    const step = () => {
      const t = (performance.now() - t0) / 1000;
      if (!D.nxPlaying || t > dur) { D.nxPlaying = false; D.canvas.requestRenderAll(); resolve(); return; }
      const undo = applyStates(D, t); D.canvas.renderAll(); undo();
      requestAnimationFrame(step);
    };
    step();
  });
}
// Image d'une page à l'instant t (page déjà ouverte).
function frameAt(D, t, scale, transparent = false) { const undo = applyStates(D, t); try { return D.renderPage(scale, { transparent }); } finally { undo(); } }
function drawTrans(x, W, H, a, b, k, kind) {
  x.clearRect(0, 0, W, H);
  if (kind === 'fade') { x.globalAlpha = 1; x.drawImage(a, 0, 0, W, H); x.globalAlpha = k; x.drawImage(b, 0, 0, W, H); x.globalAlpha = 1; return; }
  if (kind === 'slide') { const e = easeOut(k); x.drawImage(a, -W * e, 0, W, H); x.drawImage(b, W * (1 - e), 0, W, H); return; }
  if (kind === 'zoom') { const e = easeOut(k); x.globalAlpha = 1 - e; const s = 1 + e * 0.25; x.drawImage(a, (W - W * s) / 2, (H - H * s) / 2, W * s, H * s); x.globalAlpha = e; const s2 = 0.85 + 0.15 * e; x.drawImage(b, (W - W * s2) / 2, (H - H * s2) / 2, W * s2, H * s2); x.globalAlpha = 1; return; }
  if (kind === 'wipe') { x.drawImage(a, 0, 0, W, H); x.save(); x.beginPath(); x.rect(0, 0, W * easeOut(k), H); x.clip(); x.drawImage(b, 0, 0, W, H); x.restore(); return; }
  x.drawImage(k < 0.5 ? a : b, 0, 0, W, H);
}
export function animExportSheet(D) {
  const pa = pageAnim(D.page);
  const s = sheet('nx-anim', sheetHtml({ icon: 'nxAnimate', title: 'Exporter l’animation', sub: 'Les pages s’enchaînent avec leurs animations et leurs transitions. Durée et transition se règlent pour chaque page (panneau de droite, sans calque sélectionné).', body: `
    <div class="field-label">Format</div><div class="seg wide" data-nx-seg="fmt"><button class="on" data-v="mp4">MP4 (H.264)</button><button data-v="webm">WebM (VP9)</button><button data-v="gif">GIF animé</button></div>
    <div class="field-label">Pages</div><div class="seg wide" data-nx-seg="pages"><button class="on" data-v="all">Toutes (${D.doc.pages.length})</button><button data-v="cur">Page actuelle</button></div>
    <div class="field-label">Largeur</div><div class="seg wide" data-nx-seg="w"><button data-v="480">480 px</button><button class="on" data-v="1080">1080 px</button><button data-v="1920">1920 px</button></div>
    <p class="sheet-note">Page actuelle : ${pa.dur} s, transition « ${TRANS[pa.trans]} ». Le GIF est limité à 15 images par seconde et 720 px de large.</p>`, go: 'Exporter', goIcon: 'film' }));
  const v = { fmt: 'mp4', pages: 'all', w: '1080' };
  s.onclick = async (e) => {
    const b = e.target.closest('[data-nx-seg] [data-v]');
    if (b) { v[b.parentElement.dataset.nxSeg] = b.dataset.v; for (const x of b.parentElement.children) x.classList.toggle('on', x === b); return; }
    if (e.target.closest('[data-nx-go]')) { closeSheet('nx-anim'); await exportAnim(D, v); }
  };
}
async function exportAnim(D, v) {
  const gif = v.fmt === 'gif'; const fps = gif ? 15 : 30;
  const idx = v.pages === 'all' ? D.doc.pages.map((_, i) => i) : [D.pageIdx];
  const first = D.doc.pages[idx[0]];
  let W = Math.min(Number(v.w), gif ? 720 : 3840); W -= W % 2; let H = Math.round(W * first.h / first.w); H -= H % 2;
  const out = makeCanvas(W, H); const x = out.getContext('2d', { willReadFrequently: gif });
  const cur = D.pageIdx; const t = busy('Rendu de l’animation…');
  let enc = null; let src = null; const frames = [];
  try {
    if (!gif) {
      const o = await import('../../dist/chunks/encoder-HG7L4JDQ.js');
      let codec = v.fmt === 'webm' ? 'vp9' : 'avc';
      if (!(await o.canEncodeVideo(codec, { width: W, height: H }))) codec = codec === 'avc' ? 'vp9' : 'avc';
      if (!(await o.canEncodeVideo(codec, { width: W, height: H }))) throw new Error('Ce PC ne sait pas encoder de vidéo à cette taille.');
      enc = new o.Output({ format: codec === 'avc' ? new o.Mp4OutputFormat({ fastStart: 'in-memory' }) : new o.WebMOutputFormat(), target: new o.BufferTarget() });
      src = new o.CanvasSource(out, { codec, quality: o.QUALITY_VERY_HIGH, keyFrameInterval: 2 });
      enc.addVideoTrack(src, { frameRate: fps }); await enc.start(); enc.nxCodec = codec;
    }
    D.canvas.discardActiveObject();
    let time = 0; let prevLast = null;
    for (const [n, i] of idx.entries()) {
      if (i !== D.pageIdx) await D.openPage(i);
      const pa = pageAnim(D.page); const total = Math.max(0.5, pa.dur); const count = Math.round(total * fps);
      const scale = W / D.page.w; const transN = prevLast && pa.trans !== 'none' ? Math.round(0.5 * fps) : 0;
      for (let f = 0; f < count; f++) {
        const fr = frameAt(D, f / fps, scale);
        if (f < transN) drawTrans(x, W, H, prevLast, fr, (f + 1) / transN, pa.trans); else { x.clearRect(0, 0, W, H); x.fillStyle = D.page.bg || '#ffffff'; x.fillRect(0, 0, W, H); x.drawImage(fr, 0, 0, W, H); }
        if (gif) frames.push(x.getImageData(0, 0, W, H)); else await src.add(time, 1 / fps);
        time += 1 / fps;
        if (f % 6 === 0) { t.update && t.update(`Rendu de l’animation : page ${n + 1} / ${idx.length}, ${Math.round(f / count * 100)} %`); await sleep(0); }
      }
      prevLast = makeCanvas(W, H); prevLast.getContext('2d').drawImage(out, 0, 0);
    }
    if (D.pageIdx !== cur) await D.openPage(cur);
    let bytes; let ext;
    if (gif) { t.update && t.update('Compression du GIF…'); await sleep(20); bytes = encodeGif(frames, { delay: Math.round(1000 / fps) }); ext = 'gif'; } else { src.close(); await enc.finalize(); bytes = new Uint8Array(enc.target.buffer); ext = enc.nxCodec === 'avc' ? 'mp4' : 'webm'; }
    await saveBytes(bytes, { name: `${safeName(D.doc.name)} (animation)`, ext, kind: gif ? 'photo' : 'video', project: 'NEX-DESIGN' });
  } catch (e) {
    console.error(e); toast(`L’export de l’animation a échoué : ${e.message || e}`, { kind: 'bad' });
    if (enc) { try { await enc.cancel(); } catch { /* déjà fermé */ } }
  } finally { t.close(); if (D.pageIdx !== cur) await D.openPage(cur); }
}

// ---------- Présentation plein écran ----------
export async function present(D, start = 0) {
  D.capturePage(); D.canvas.discardActiveObject();
  const back = D.pageIdx;
  const ov = el(`<div class="nx-present" tabindex="0"><canvas></canvas><div class="nx-present-bar"><button class="btn small" data-p="prev" title="Page précédente">${ico('chevronLeft', 14)}</button><span data-p="n"></span><button class="btn small" data-p="next" title="Page suivante">${ico('chevronRight', 14)}</button><button class="btn small" data-p="close">${ico('close', 14)}<span>Quitter (Échap)</span></button></div></div>`);
  document.body.append(ov);
  const cv = ov.querySelector('canvas'); const cx = cv.getContext('2d');
  let i = start; let anim = 0; let closed = false;
  const size = () => { cv.width = Math.round(window.innerWidth * (window.devicePixelRatio || 1)); cv.height = Math.round(window.innerHeight * (window.devicePixelRatio || 1)); };
  size();
  const show = async (k, prev) => {
    i = clamp(k, 0, D.doc.pages.length - 1);
    ov.querySelector('[data-p="n"]').textContent = `${i + 1} / ${D.doc.pages.length}`;
    if (i !== D.pageIdx) await D.openPage(i);
    D.canvas.discardActiveObject();
    const pg = D.page; const s = Math.min(cv.width / pg.w, cv.height / pg.h); const W = Math.round(pg.w * s); const H = Math.round(pg.h * s); const ox = (cv.width - W) / 2; const oy = (cv.height - H) / 2;
    const pa = pageAnim(pg); const t0 = performance.now(); const my = ++anim;
    const tick = () => {
      if (closed || my !== anim) return;
      const t = (performance.now() - t0) / 1000;
      const fr = frameAt(D, Math.min(t, pa.dur), s);
      cx.fillStyle = '#000'; cx.fillRect(0, 0, cv.width, cv.height);
      if (prev && t < 0.5 && pa.trans !== 'none') { const tmp = makeCanvas(W, H); drawTrans(tmp.getContext('2d'), W, H, prev, fr, t / 0.5, pa.trans); cx.drawImage(tmp, ox, oy); } else cx.drawImage(fr, ox, oy, W, H);
      ov.nxLast = fr;
      if (t < pa.dur + 0.1) requestAnimationFrame(tick);
    };
    tick();
  };
  const go = (d) => { if (i + d < 0 || i + d >= D.doc.pages.length) return; const prev = ov.nxLast || null; show(i + d, prev); };
  const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } else if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); go(1); } else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); go(-1); } e.stopPropagation(); };
  const onResize = () => { if (!closed) { size(); show(i); } };
  const close = async () => { closed = true; ov.remove(); document.removeEventListener('keydown', key, true); window.removeEventListener('resize', onResize); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); if (D.pageIdx !== back) await D.openPage(back); };
  document.addEventListener('keydown', key, true);
  window.addEventListener('resize', onResize);
  ov.onclick = (e) => { const b = e.target.closest('[data-p]'); if (b) { if (b.dataset.p === 'close') close(); if (b.dataset.p === 'prev') go(-1); if (b.dataset.p === 'next') go(1); return; } go(1); };
  try { await ov.requestFullscreen(); } catch { /* fenêtre seulement */ }
  ov.focus();
  show(i);
}

// ---------- Historique visible ----------
export function patchHistory(D) {
  const proto = Object.getPrototypeOf(D);
  if (proto.nxPush) return;
  proto.nxPush = proto.pushHistory; proto.nxUndo = proto.undo; proto.nxRedo = proto.redo;
  proto.pushHistory = function () {
    const n = this.hist.length; const last = this.hist[n - 1];
    this.nxPush();
    this.nxMeta = this.nxMeta || [];
    if (this.hist[this.hist.length - 1] !== last) {
      if (this.hist.length <= n) this.nxMeta.shift();
      this.nxMeta.push({ label: n === 0 ? 'Ouverture de la page' : (this.nxNextLabel || 'Modification'), t: Date.now() });
      this.nxFutMeta = [];
    }
    while (this.nxMeta.length > this.hist.length) this.nxMeta.shift();
    while (this.nxMeta.length < this.hist.length) this.nxMeta.unshift({ label: 'Modification', t: Date.now() });
    this.nxNextLabel = null;
    this.nxRenderHistory && this.nxRenderHistory();
  };
  proto.undo = async function () {
    if (this.hist.length >= 2 && this.nxMeta && this.nxMeta.length) (this.nxFutMeta = this.nxFutMeta || []).push(this.nxMeta.pop());
    await this.nxUndo(); this.nxRenderHistory && this.nxRenderHistory();
  };
  proto.redo = async function () {
    if (this.fut.length && this.nxFutMeta && this.nxFutMeta.length) (this.nxMeta = this.nxMeta || []).push(this.nxFutMeta.pop());
    await this.nxRedo(); this.nxRenderHistory && this.nxRenderHistory();
  };
}
export async function jumpHistory(D, i) {
  if (i < 0 || i >= D.hist.length - 1) return;
  while (D.hist.length - 1 > i) { D.fut.push(D.hist.pop()); (D.nxFutMeta = D.nxFutMeta || []).push((D.nxMeta || []).pop()); }
  await D.restore(D.hist[D.hist.length - 1]);
  D.nxRenderHistory && D.nxRenderHistory();
}

// ---------- Commentaires ----------
export const comments = (D) => (D.doc.nxComments = D.doc.nxComments || []);
export async function addComment(D, p) {
  const text = await prompt('Nouveau commentaire', { label: 'Ton commentaire', icon: 'nxComment', multiline: true, go: 'Publier' });
  if (!text || !text.trim()) return;
  let author = 'Moi';
  try { const { e: cloud } = await import('../../dist/chunks/chunk-EZKHFSAB.js'); if (cloud && cloud.user) author = (cloud.profile && cloud.profile.full_name) || cloud.user.email || author; } catch { /* hors ligne */ }
  comments(D).push({ id: uid(), page: D.page.id, x: p.x, y: p.y, text: text.trim(), author, at: Date.now(), done: false, replies: [] });
  D.save(); D.nxRenderComments && D.nxRenderComments();
}

// ---------- Coédition ----------
// NEXORA #075 : coédition élément par élément (seuls les calques modifiés partent, chacun garde ses autres
// changements) et salle rattachée au document (même code pour toute l'équipe qui ouvre ce document).
const liveObjs = (D) => D.canvas.getObjects().filter((o) => o.id !== '__board' && o.id !== '__nxcrop');
function snapshot(D) {
  const map = new Map();
  for (const o of liveObjs(D)) { if (!o.id) o.id = uid(); map.set(o.id, JSON.stringify(o.toObject(FabricObject.customProperties))); }
  D.nxSent = { page: D.pageIdx, map, order: liveObjs(D).map((o) => o.id).join('|') };
}
function diff(D) {
  const prev = D.nxSent && D.nxSent.page === D.pageIdx ? D.nxSent : null;
  if (!prev) { snapshot(D); return 'full'; }
  const objs = liveObjs(D);
  const map = new Map();
  for (const o of objs) { if (!o.id) o.id = uid(); map.set(o.id, JSON.stringify(o.toObject(FabricObject.customProperties))); }
  const upserts = []; for (const [id, j] of map) if (prev.map.get(id) !== j) upserts.push(JSON.parse(j));
  const removes = [...prev.map.keys()].filter((id) => !map.has(id));
  const order = objs.map((o) => o.id);
  D.nxSent = { page: D.pageIdx, map, order: order.join('|') };
  if (!upserts.length && !removes.length && order.join('|') === prev.order) return null;
  return { page: D.pageIdx, w: D.page.w, h: D.page.h, bg: D.page.bg, upserts, removes, order };
}
async function applyPatch(D, p) {
  const pg = D.doc.pages[p.page];
  if (!pg) return;
  if (p.page !== D.pageIdx) {
    const list = (pg.json && pg.json.objects) || [];
    const byId = new Map(list.map((j) => [j.id, j]));
    for (const id of p.removes || []) byId.delete(id);
    for (const u of p.upserts || []) byId.set(u.id, u);
    pg.json = { ...(pg.json || {}), objects: (p.order || []).map((id) => byId.get(id)).filter(Boolean) };
    return;
  }
  const c = D.canvas;
  const active = c.getActiveObject();
  D.nxRemote = true;
  try {
    const byId = () => new Map(c.getObjects().map((o) => [o.id, o]));
    let map = byId();
    for (const id of p.removes || []) { const o = map.get(id); if (o) c.remove(o); }
    // Un texte en cours de saisie ici garde la main jusqu'à la fin de la saisie.
    const ups = (p.upserts || []).filter((u) => !(active && active.id === u.id && active.isEditing));
    const live = await util.enlivenObjects(ups);
    map = byId();
    for (const n of live) {
      const old = map.get(n.id);
      if (old) { const k = c.getObjects().indexOf(old); if (old === active) c.discardActiveObject(); c.remove(old); c.insertAt(k, n); } else c.add(n);
    }
    const base = c.getObjects().findIndex((o) => o.id === '__board') + 1;
    (p.order || []).forEach((id, k) => { const o = c.getObjects().find((x) => x.id === id); if (o && c.moveObjectTo) c.moveObjectTo(o, base + k); });
    restorePatterns(c);
    for (const o of live) { if (o.type === 'image' && Array.isArray(o.nxAdj) && o.nxAdj.length) D.applyFx(o); if (fxActive(o)) o.objectCaching = false; }
    if (p.bg && p.bg !== D.page.bg) { D.page.bg = p.bg; D.updateBoard && D.updateBoard(); }
    c.requestRenderAll(); D.renderLayers && D.renderLayers();
    snapshot(D);
  } finally { D.nxRemote = false; }
}
export async function startRoom(D, code, created) {
  const room = new CollabRoom({
    kind: 'design', code,
    getState: () => { snapshot(D); return { page: D.pageIdx, w: D.page.w, h: D.page.h, bg: D.page.bg, name: D.page.name, json: D.pageJson() }; },
    getPatch: () => diff(D),
    onPatch: (p) => applyPatch(D, p).catch((e) => console.warn('[NEXORA #075] coédition', e)),
    onState: async (st) => {
      const pg = st && D.doc.pages[st.page];
      if (!pg) return;
      Object.assign(pg, { w: st.w, h: st.h, bg: st.bg, json: st.json });
      if (st.page === D.pageIdx) { D.nxRemote = true; await D.loadPage(D.page, st.json); D.updateBoard && D.updateBoard(); D.nxRemote = false; D.renderLayers(); snapshot(D); }
    },
    onCursor: (c) => { D.nxCursors = D.nxCursors || new Map(); D.nxCursors.set(c.by, { ...c, at: Date.now() }); D.nxRenderCursors && D.nxRenderCursors(); },
    onPeers: (peers) => { D.nxPeers = peers; toast(peers.length ? `${peers.length} personne${peers.length > 1 ? 's' : ''} dans la salle ${code}.` : `Salle ${code} : tu es seul pour l’instant.`); }
  });
  const t = busy('Connexion à la salle…');
  try { await room.join(); D.nxRoom = room; snapshot(D); toast(created === 'doc' ? `Coédition de ce document ouverte (salle ${code}) : tes coéquipiers qui ouvrent ce document et choisissent « Coéditer ce document » te rejoignent.` : created ? `Salle créée : ${code}. Donne ce code à tes coéquipiers.` : `Tu as rejoint la salle ${code}.`); } catch (e) { toast(e.message || String(e), { kind: 'bad' }); } finally { t.close(); }
}
// Code de salle tiré de l'identifiant du document : le même pour toute l'équipe.
export function docRoomCode(D) {
  let h = 2166136261;
  for (const ch of String(D.doc.id)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36).toUpperCase().padStart(6, '0').slice(-6);
}
export async function leaveRoom(D) { if (!D.nxRoom) return; await D.nxRoom.leave(); D.nxRoom = null; D.nxSent = null; D.nxCursors = new Map(); D.nxRenderCursors && D.nxRenderCursors(); toast('Tu as quitté la salle de coédition.'); }
export function collab(D) {
  collabSheet({
    current: D.nxRoom ? { code: D.nxRoom.code, peers: D.nxRoom.peers } : null,
    onStop: () => leaveRoom(D),
    onStart: (code, created) => startRoom(D, code, created)
  });
}

// ---------- Règles, repères et grille de colonnes ----------
export const guides = (D) => (D.page.nxGuides = D.page.nxGuides || { x: [], y: [] });
export async function rulersMenu(D, anchor) {
  const g = guides(D); const grid = D.page.nxGrid || {};
  const a = await menu(anchor, 'Règles et repères', [
    { id: 'rulers', icon: 'nxRuler2', label: settings.nxRulers ? 'Masquer les règles' : 'Afficher les règles', sub: 'Glisse depuis une règle pour poser un repère' },
    { id: 'center', icon: 'target', label: 'Repères au centre de la page' },
    { id: 'grid', icon: 'nxGridCols', label: grid.cols || grid.rows ? `Grille de colonnes (${grid.cols || 0} × ${grid.rows || 0})…` : 'Grille de colonnes…' },
    { id: 'lock', icon: settings.nxGuidesLock ? 'unlock' : 'lock', label: settings.nxGuidesLock ? 'Déverrouiller les repères' : 'Verrouiller les repères' },
    { id: 'clear', icon: 'trash', label: `Effacer les repères (${g.x.length + g.y.length})`, disabled: !(g.x.length + g.y.length) }
  ], { width: 300 });
  if (a === 'rulers') { settings.nxRulers = !settings.nxRulers; saveSettings(); D.nxLayout && D.nxLayout(); }
  if (a === 'center') { g.x.push(D.page.w / 2); g.y.push(D.page.h / 2); D.changed(); }
  if (a === 'clear') { g.x = []; g.y = []; D.changed(); }
  if (a === 'lock') { settings.nxGuidesLock = !settings.nxGuidesLock; saveSettings(); }
  if (a === 'grid') gridSheet(D);
  D.canvas.requestRenderAll();
}
function gridSheet(D) {
  const g = { cols: 12, gutter: 20, margin: 60, rows: 0, color: '#ff2d78', ...(D.page.nxGrid || {}) };
  const s = sheet('nx-grid', sheetHtml({ icon: 'nxGridCols', title: 'Grille de colonnes', sub: 'Grille de mise en page visible seulement dans l’éditeur : les calques s’y aimantent.', body: `
    <div class="nx-grid2"><label class="field"><span>Colonnes (0 : aucune)</span><input class="input" type="number" min="0" max="24" data-g="cols" value="${g.cols}"></label><label class="field"><span>Gouttière (px)</span><input class="input" type="number" min="0" data-g="gutter" value="${g.gutter}"></label>
    <label class="field"><span>Marges (px)</span><input class="input" type="number" min="0" data-g="margin" value="${g.margin}"></label><label class="field"><span>Rangées (0 : aucune)</span><input class="input" type="number" min="0" max="24" data-g="rows" value="${g.rows}"></label></div>
    <label class="field"><span>Couleur</span><input type="color" data-g="color" value="${esc(g.color)}"></label>`, go: 'Appliquer' }));
  s.onclick = (e) => {
    if (!e.target.closest('[data-nx-go]')) return;
    s.querySelectorAll('[data-g]').forEach((i) => { g[i.dataset.g] = i.type === 'number' ? Number(i.value) || 0 : i.value; });
    D.page.nxGrid = g.cols || g.rows ? g : null; closeSheet('nx-grid'); D.changed(); D.canvas.requestRenderAll();
  };
}
export function gridLines(D) {
  const g = D.page.nxGrid; if (!g) return { x: [], y: [], cols: [], rows: [] };
  const W = D.page.w; const H = D.page.h; const x = []; const y = []; const cols = []; const rows = [];
  if (g.cols) { const cw = (W - 2 * g.margin - (g.cols - 1) * g.gutter) / g.cols; for (let i = 0; i < g.cols; i++) { const a = g.margin + i * (cw + g.gutter); cols.push([a, cw]); x.push(a, a + cw); } }
  if (g.rows) { const rh = (H - 2 * g.margin - (g.rows - 1) * g.gutter) / g.rows; for (let i = 0; i < g.rows; i++) { const a = g.margin + i * (rh + g.gutter); rows.push([a, rh]); y.push(a, a + rh); } }
  return { x, y, cols, rows };
}

// ---------- Assistant IA ----------
const TEXT = ['textbox', 'i-text', 'text'];
// NEXORA #075 : entrées réutilisées par le menu « IA de design » unique (nx/designplus/layout.js).
export const AI_ITEMS = (D) => [
  { id: 'write', icon: 'text', label: 'Rédiger les textes de la page…' },
  { id: 'rewrite', icon: 'sync', label: 'Reformuler le texte sélectionné…', disabled: !D.sel().some((o) => TEXT.includes(o.type)) },
  { id: 'layout', icon: 'grid', label: 'Choisir un modèle avec l’IA…', sub: 'Un modèle de NEX-DESIGN, titre et texte rédigés' },
  { id: 'palette', icon: 'nxPalette', label: 'Créer une palette de couleurs…' },
  { id: 'palimg', icon: 'image', label: 'Palette tirée de l’image sélectionnée', sub: 'Sans IA, directement sur ce PC', disabled: !D.sel().some((o) => o.type === 'image') },
  { id: 'image', icon: 'sparkle', label: 'Générer une image…', sub: 'Avec ta clé OpenAI ou Google Gemini' }
];
export async function aiMenu(D, anchor) {
  const a = await menu(anchor, 'IA de design', AI_ITEMS(D), { width: 300 });
  return aiRun(D, anchor, a);
}
export async function aiRun(D, anchor, a) {
  if (!a) return;
  if (a === 'palimg') { const img = D.sel().find((o) => o.type === 'image'); await paletteChoice(D, dominantColors(img.getElement(), 5)); return; }
  if (!(await needAi())) return;
  const sys = 'Tu es un directeur artistique et rédacteur publicitaire francophone. Tu tutoies. Réponses courtes, percutantes, sans emoji.';
  try {
    if (a === 'write') {
      const topic = await prompt('Rédiger les textes', { label: 'Sujet, produit ou message (une phrase suffit)', icon: 'text', placeholder: 'Lancement de notre appli de recettes, offre de bienvenue', go: 'Rédiger' });
      if (!topic) return;
      const t = busy('Rédaction…');
      let j; try { j = await aiJson(`Rédige les textes d'un visuel (${D.page.w}×${D.page.h} px) sur : « ${topic} ». Donne {"titre": "...", "sousTitre": "...", "texte": "...", "bouton": "..."} ; titre de 6 mots maximum.`, { system: sys }); } finally { t.close(); }
      const texts = D.canvas.getObjects().filter((o) => TEXT.includes(o.type)).sort((x, y) => y.fontSize * y.scaleY - x.fontSize * x.scaleY);
      const vals = [j.titre, j.sousTitre, j.texte, j.bouton].filter(Boolean);
      if (texts.length) texts.slice(0, vals.length).forEach((o, i) => { o.set('text', String(vals[i])); o.initDimensions && o.initDimensions(); });
      else {
        const b = getBrand(); const W = D.page.w; let y = D.page.h * 0.12;
        for (const [i, v] of vals.entries()) { const size = [0.09, 0.05, 0.035, 0.035][i] * Math.min(W, D.page.h) * 1.4; const tb = new Textbox(String(v), { left: W * 0.08, top: y, width: W * 0.84, fontSize: size, fontFamily: i ? b.fonts.body : b.fonts.title, fontWeight: i ? 500 : 800, fill: b.colors[3] }); tb.id = uid(); tb.name = ['Titre', 'Sous-titre', 'Texte', 'Bouton'][i]; D.canvas.add(tb); y += size * 2.2; }
      }
      D.canvas.requestRenderAll(); D.changed(); toast('Textes rédigés par l’IA.');
    }
    if (a === 'rewrite') {
      const t0 = D.sel().find((o) => TEXT.includes(o.type));
      const how = await menu(anchor, 'Reformuler', [{ id: 'court', label: 'Plus court' }, { id: 'fort', label: 'Plus percutant' }, { id: 'pro', label: 'Plus professionnel' }, { id: 'fun', label: 'Plus décontracté' }, { id: 'fix', label: 'Corriger l’orthographe' }, { id: 'en', label: 'Traduire en anglais' }]);
      if (!how) return;
      const instr = { court: 'Raccourcis de moitié', fort: 'Rends-le plus percutant', pro: 'Rends-le plus professionnel', fun: 'Rends-le plus décontracté', fix: 'Corrige seulement l’orthographe et la grammaire', en: 'Traduis en anglais' }[how];
      const t = busy('Reformulation…');
      try { const r = await aiChat(`${instr} ce texte de visuel. Réponds seulement avec le nouveau texte, sans guillemets :\n\n${t0.text}`, { system: sys, maxTokens: 400 }); t0.set('text', r.replace(/^["«\s]+|["»\s]+$/g, '')); t0.initDimensions && t0.initDimensions(); D.canvas.requestRenderAll(); D.changed(); } finally { t.close(); }
    }
    if (a === 'layout') {
      const topic = await prompt('Proposer une mise en page', { label: 'De quoi parle le visuel ?', icon: 'grid', placeholder: 'Soirée de lancement le 12 juin au Studio 21', go: 'Proposer' });
      if (!topic) return;
      const t = busy('L’IA compose la mise en page…');
      let j; try { j = await aiJson(`Choisis le meilleur modèle parmi ${JSON.stringify(Object.fromEntries(Object.entries(TEMPLATES).map(([k, v]) => [k, v.label])))} pour : « ${topic} ». Donne {"modele": "<identifiant>", "titre": "...", "texte": "..."} ; titre de 5 mots maximum.`, { system: sys }); } finally { t.close(); }
      const id = TEMPLATES[j.modele] ? j.modele : 'promo';
      const made = await applyTemplate(D, id, { onNewPage: true });
      const texts = made.filter((o) => o.type === 'textbox').sort((x, y) => y.fontSize - x.fontSize);
      if (texts[0] && j.titre) texts[0].set('text', String(j.titre));
      if (texts[1] && j.texte) texts[1].set('text', String(j.texte));
      D.canvas.requestRenderAll(); D.changed();
    }
    if (a === 'palette') {
      const mood = await prompt('Palette de couleurs', { label: 'Ambiance recherchée', icon: 'nxPalette', placeholder: 'Nature apaisante, tech premium, été pop…', go: 'Créer' });
      if (!mood) return;
      const t = busy('Création de la palette…');
      let j; try { j = await aiJson(`Crée une palette de 5 couleurs hexadécimales pour l'ambiance « ${mood} » : principale, secondaire, accent, texte foncé, fond clair. Donne {"colors": ["#...", "#...", "#...", "#...", "#..."]}.`, { system: sys }); } finally { t.close(); }
      const cols = (j.colors || []).filter((c) => /^#[0-9a-f]{6}$/i.test(c));
      if (cols.length < 3) throw new Error('Palette incomplète : réessaie.');
      await paletteChoice(D, cols);
    }
    if (a === 'image') {
      const what = await prompt('Générer une image', { label: 'Décris l’image', icon: 'sparkle', multiline: true, placeholder: 'Une tasse de café fumante sur une table en bois, lumière du matin, photo réaliste', go: 'Générer' });
      if (!what) return;
      const t = busy('Génération de l’image…');
      try { const url = await aiImage({ prompt: what, size: D.page.w > D.page.h * 1.2 ? '1536x1024' : D.page.h > D.page.w * 1.2 ? '1024x1536' : '1024x1024' }); await D.addImage(url, 'Image générée'); D.changed(); } finally { t.close(); }
    }
  } catch (e) { toast(e.message || String(e), { kind: 'bad' }); }
}
async function paletteChoice(D, cols) {
  const s = sheet('nx-pal', sheetHtml({ icon: 'nxPalette', title: 'Palette proposée', body: `<div class="nx-palette">${cols.map((c) => `<span style="--c:${esc(c)}"><i></i><code>${esc(c)}</code></span>`).join('')}</div>
    <div class="nx-row"><button class="btn small" data-pal="brand">${ico('nxBrand', 13)}<span>Enregistrer dans le kit de marque</span></button><button class="btn small" data-pal="doc">${ico('nxPalette', 13)}<span>Recolorer la page</span></button></div>` }));
  s.onclick = async (e) => {
    const b = e.target.closest('[data-pal]'); if (!b) return;
    const brand = getBrand(); const colors = [...cols, ...brand.colors].slice(0, 5);
    if (b.dataset.pal === 'brand') { const { setBrand } = await import('../services.js'); setBrand({ colors }); toast('Palette enregistrée dans le kit de marque.'); }
    if (b.dataset.pal === 'doc') await applyBrand(D, { ...brand, colors, logo: null });
    closeSheet('nx-pal');
  };
}
export { lerp, FabricImage };

// Essais (scripts/test-design.mjs et aperçu) : calcul et application des changements de la coédition.
export { diff as collabDiff, applyPatch as collabApply, snapshot as collabSnapshot };
