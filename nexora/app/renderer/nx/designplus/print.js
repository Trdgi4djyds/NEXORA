// NEXORA #053 : impression : PDF à 300 dpi avec fonds perdus (bords prolongés) et traits de coupe, taille
// réelle en millimètres, couleurs vives difficiles à reproduire en quadrichromie signalées.
// NEXORA #054 : PDF vectoriel par défaut (formes en tracés, textes avec leur police, sélectionnables) ; le PDF
// image (rendu identique à l'écran) reste au choix.
import { esc, ico, busy, btn, hex, walk, objs, saveBytes, dataUrlBytes, toast, pl } from './ui.js';
import { buildPdf } from './pure.js';
import { buildVectorPdf } from './pdfvec.js';
import { FontBook, pageVector, deflate } from './printvec.js';

const done = (t) => { if (!t) return; if (t.close) t.close(); else if (t.remove) t.remove(); };
export const defaults = (D) => {
  const p = D.page;
  p.nxPrint = p.nxPrint || { wmm: Math.round(p.w * 25.4 / 96), hmm: Math.round(p.h * 25.4 / 96), bleed: 3, marks: true, dpi: 300 };
  if (!p.nxPrint.mode) p.nxPrint.mode = 'vector';
  return p.nxPrint;
};
// Couleurs RVB saturées et lumineuses : hors de la gamme habituelle de l'impression.
export function risky(D) {
  const out = new Map();
  walk(objs(D), (o) => {
    for (const k of ['fill', 'stroke']) {
      const h = hex(o[k]); if (!h) continue;
      const n = parseInt(h.slice(1), 16); const r = (n >> 16 & 255) / 255; const g = (n >> 8 & 255) / 255; const b = (n & 255) / 255;
      const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const s = mx ? (mx - mn) / mx : 0;
      let hue = 0; if (mx !== mn) hue = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4; hue = (hue * 60 + 360) % 360;
      if (s > 0.75 && mx > 0.8 && ((hue > 90 && hue < 300) || hue > 300 || hue < 15)) out.set(h, (out.get(h) || []).concat(o.name || o.type));
    }
  });
  return [...out];
}
// Bords prolongés : la dernière rangée de pixels est étirée sur la largeur des fonds perdus.
function withBleed(src, b) {
  const c = document.createElement('canvas');
  c.width = src.width + b * 2; c.height = src.height + b * 2;
  const x = c.getContext('2d');
  const W = src.width; const H = src.height;
  x.drawImage(src, b, b);
  if (b > 0) {
    x.drawImage(src, 0, 0, W, 1, b, 0, W, b); x.drawImage(src, 0, H - 1, W, 1, b, H + b, W, b);
    x.drawImage(src, 0, 0, 1, H, 0, b, b, H); x.drawImage(src, W - 1, 0, 1, H, W + b, b, b, H);
    x.drawImage(src, 0, 0, 1, 1, 0, 0, b, b); x.drawImage(src, W - 1, 0, 1, 1, W + b, 0, b, b); x.drawImage(src, 0, H - 1, 1, 1, 0, H + b, b, b); x.drawImage(src, W - 1, H - 1, 1, 1, W + b, H + b, b, b);
  }
  return c;
}
// PDF vectoriel : une police par famille et graisse, intégrée une seule fois pour toutes les pages.
export async function renderVector(D, { all = false, cfgOf = defaults } = {}) {
  const cur = D.pageIdx;
  const fonts = new FontBook();
  const pages = []; const stats = { vector: 0, text: 0, image: 0 };
  const idx = all ? D.doc.pages.map((_, i) => i) : [D.pageIdx];
  for (const i of idx) {
    if (i !== D.pageIdx) await D.openPage(i, { save: false });
    const r = await pageVector(D, cfgOf(D), fonts);
    pages.push(r.page);
    for (const k of Object.keys(stats)) stats[k] += r.stats[k];
  }
  if (D.pageIdx !== cur) await D.openPage(cur, { save: false });
  return { pdf: await buildVectorPdf(pages, fonts.list, { deflate, title: D.doc.name || '' }), stats };
}
export async function render(D, { all = false } = {}) {
  const cur = D.pageIdx;
  const pages = [];
  D.canvas.discardActiveObject();
  const idx = all ? D.doc.pages.map((_, i) => i) : [D.pageIdx];
  for (const i of idx) {
    if (i !== D.pageIdx) await D.openPage(i, { save: false });
    const cfg = defaults(D);
    const scale = Math.round(cfg.wmm / 25.4 * cfg.dpi) / D.page.w;
    const src = await D.exportCanvas(scale, false);
    const c = withBleed(src, Math.round(cfg.bleed / 25.4 * cfg.dpi));
    const pt = (mm) => mm / 25.4 * 72;
    const margin = cfg.marks ? pt(cfg.bleed + 7) : pt(cfg.bleed);
    pages.push({ jpg: dataUrlBytes(c.toDataURL('image/jpeg', 0.95)), pw: c.width, ph: c.height, iw: pt(cfg.wmm + cfg.bleed * 2), ih: pt(cfg.hmm + cfg.bleed * 2), mw: pt(cfg.wmm) + margin * 2, mh: pt(cfg.hmm) + margin * 2, margin, bleedPt: pt(cfg.bleed), marks: cfg.marks });
  }
  if (D.pageIdx !== cur) await D.openPage(cur, { save: false });
  return buildPdf(pages);
}
export async function exportPdf(D, opts) {
  const t = busy('Préparation du PDF d’impression…');
  let pdf; let stats = null;
  try { if (defaults(D).mode === 'image') pdf = await render(D, opts); else ({ pdf, stats } = await renderVector(D, opts)); } finally { done(t); }
  await saveBytes(pdf, { name: `${D.doc.name || 'impression'} (impression)`, ext: 'pdf', kind: 'document', project: D.doc.name || 'NEXORA' });
  if (stats && stats.image) toast(`PDF vectoriel : ${pl(stats.text, 'texte', 'textes')} et ${pl(stats.vector, 'forme vectorielle', 'formes vectorielles')} ; ${pl(stats.image, 'élément', 'éléments')} en image (photos, effets, dégradés ou police introuvable).`);
  return stats;
}
// NEXORA #075 (A-041) : PDF de la fenêtre « Exporter » : vectoriel, à la taille de la page (96 pixels par pouce),
// sans fonds perdus ni traits de coupe ; les éléments placés en image le sont à la résolution choisie (×1 à ×4).
const screenCfg = (scale) => (D) => ({ wmm: D.page.w * 25.4 / 96, hmm: D.page.h * 25.4 / 96, bleed: 0, marks: false, dpi: 96 * scale, mode: 'vector' });
export async function exportScreenPdf(D, { all = false, scale = 2 } = {}) {
  const t = busy('Préparation du PDF…');
  let pdf; let stats;
  try { ({ pdf, stats } = await renderVector(D, { all, cfgOf: screenCfg(Math.max(1, Math.min(4, scale))) })); } catch (e) { toast(`Le PDF n’a pas pu être créé : ${e.message || e}`, { kind: 'bad' }); return null; } finally { done(t); }
  await saveBytes(pdf, { name: D.doc.name || 'Design', ext: 'pdf', kind: 'document', project: D.doc.name || 'NEXORA' });
  if (stats && stats.image) toast(`PDF vectoriel : ${pl(stats.text, 'texte', 'textes')} et ${pl(stats.vector, 'forme vectorielle', 'formes vectorielles')} ; ${pl(stats.image, 'élément', 'éléments')} en image (photos, effets, dégradés ou police introuvable).`);
  return stats;
}
export function panel(D) {
  const c = defaults(D);
  const r = risky(D);
  return `<div class="dzp-sub">Type de PDF</div><div class="dzp-bar"><div class="seg"><button class="${c.mode !== 'image' ? 'on' : ''}" data-pmode="vector">Vectoriel</button><button class="${c.mode === 'image' ? 'on' : ''}" data-pmode="image">Image</button></div></div>
    <p class="dzx-hint">${c.mode === 'image' ? 'Chaque page devient une image à la résolution choisie : rendu identique à l’écran, textes non sélectionnables.' : 'Formes et textes restent nets à toutes les tailles ; les textes gardent leur police et se sélectionnent. Photos, dégradés, ombres et effets sont placés en image à la résolution choisie.'}</p>
    <div class="dzx-grid2"><label class="dzx-num"><span>Largeur (mm)</span><input class="input" type="number" data-pk="wmm" value="${c.wmm}" min="10"></label><label class="dzx-num"><span>Hauteur (mm)</span><input class="input" type="number" data-pk="hmm" value="${c.hmm}" min="10"></label>
    <label class="dzx-num"><span>Fonds perdus (mm)</span><input class="input" type="number" data-pk="bleed" value="${c.bleed}" min="0" max="10"></label><label class="dzx-num"><span>Résolution (dpi)</span><input class="input" type="number" data-pk="dpi" value="${c.dpi}" min="150" max="600" step="50"></label></div>
    <label class="nxd-check dzx-check"><input type="checkbox" data-pk="marks" ${c.marks ? 'checked' : ''}> Traits de coupe</label>
    <p class="dzx-hint">Les fonds perdus prolongent les bords de la page : garde les textes à 5 mm au moins du bord. Formats courants : carte de visite 85 × 55, A5 148 × 210, A4 210 × 297.</p>
    <div class="dzp-sub">Couleurs à vérifier</div>
    ${r.length ? `<div class="dzp-list">${r.map(([h, names]) => `<div class="dzp-item bad"><span class="dzp-sw" style="background:${esc(h)}"></span><span><b>${esc(h)}</b><small>Couleur très vive : elle paraîtra plus terne à l’impression · ${esc(names.slice(0, 3).join(', '))}</small></span></div>`).join('')}</div>` : `<p class="dzx-hint">${ico('pass', 12)} Aucune couleur hors de portée de l’impression courante.</p>`}
    <div class="nx-btns">${btn('print-pdf', 'pdf', 'PDF de cette page', '', 'primary')}${btn('print-all', 'pdf', 'PDF de toutes les pages')}</div>`;
}
export async function onPanel(D, e, rerender) {
  const pm = e.target.closest('[data-pmode]');
  if (pm) { defaults(D).mode = pm.dataset.pmode; D.changed(); if (rerender) rerender(); return true; }
  const b = e.target.closest('[data-dzx]');
  if (!b) return false;
  if (b.dataset.dzx === 'print-pdf') { await exportPdf(D); return true; }
  if (b.dataset.dzx === 'print-all') { await exportPdf(D, { all: true }); return true; }
  return false;
}
export function onPanelInput(D, e) {
  const k = e.target.dataset.pk;
  if (!k) return false;
  defaults(D)[k] = e.target.type === 'checkbox' ? e.target.checked : Math.max(0, Number(e.target.value) || 0);
  D.changed();
  return true;
}
