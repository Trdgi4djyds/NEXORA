// NEXORA #011 : contenus de NEX-DESIGN (éléments, cadres photo, graphiques, tableaux, codes QR, modèles,
// kit de marque, composants, styles de texte, objets dynamiques).
import { Path, Rect, Ellipse, Textbox, Group, FabricImage, FabricObject, util, apply, invert, loadSVGFromString } from './fab.js';
import { replaceObj } from './vector.js';
import { SHAPES, FRAMES, GRIDS, stickerSvg, TEMPLATES, templateSpec } from '../library.js';
import { getBrand } from '../services.js';
import { a as ICONS } from '../../dist/chunks/chunk-S4I2LXHS.js';
import { toast, uid, esc, clamp, mixHex, luminance, hexRgb, makeCanvas, loadImage, pickFile, sheet, closeSheet, sheetHtml, ico, inkOn, state } from '../core.js';

const page = (D) => D.page;
const center = (D) => ({ x: page(D).w / 2, y: page(D).h / 2 });
function place(D, o, { name, select = true } = {}) {
  o.id = uid(); if (name) o.name = name;
  D.canvas.add(o); D.setTool('select');
  if (select) D.canvas.setActiveObject(o);
  D.canvas.requestRenderAll();
  return o;
}
// Tracé d'une boîte 100 × 100 posé dans un rectangle de la page.
export function boxPath(d, x, y, w, h, opts = {}) {
  const p = new Path(d, opts);
  p.set({ scaleX: w / Math.max(1, p.width), scaleY: h / Math.max(1, p.height) });
  p.setPositionByOrigin({ x: x + w / 2, y: y + h / 2 }, 'center', 'center');
  return p;
}

// ---------- Formes, icônes, autocollants ----------
export function addShape(D, key) {
  const s = SHAPES[key]; if (!s) return;
  const pg = page(D); const size = Math.min(pg.w, pg.h) * 0.32; const st = D.shapeStyle();
  return place(D, boxPath(s[1], pg.w / 2 - size / 2, pg.h / 2 - size / 2, size, size, { ...st, fillRule: 'evenodd' }), { name: s[0] });
}
export async function addIcon(D, name) {
  const st = D.shapeStyle(); const col = (st.fill && typeof st.fill === 'string') ? st.fill : '#1d1d1f';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="240" height="240" fill="none" stroke="${col}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  await D.addSvg(svg, `Icône ${name}`);
}
export async function addSticker(D, kind, opts = {}) {
  const b = getBrand();
  await D.addSvg(stickerSvg(kind, { c1: b.colors[0], c2: b.colors[2], ...opts }), 'Autocollant');
}

// ---------- Cadres photo ----------
export function addFrame(D, key, box = null) {
  const f = FRAMES[key]; if (!f) return null;
  const pg = page(D); const s = Math.min(pg.w, pg.h) * 0.5;
  const b = box || { x: pg.w / 2 - s / 2, y: pg.h / 2 - s / 2, w: s, h: key === 'polaroid' ? s * 1.2 : s };
  const p = boxPath(f[1], b.x, b.y, b.w, b.h, { fill: '#e7e7ee', stroke: '#b9b9c6', strokeWidth: 2, strokeDashArray: [10, 8], strokeUniform: true });
  p.nxFrame = { shape: key, empty: true };
  return place(D, p, { name: `Cadre photo · ${f[0]}`, select: !box });
}
export function addGrid(D, key) {
  const g = GRIDS[key]; if (!g) return;
  const pg = page(D); const m = Math.min(pg.w, pg.h) * 0.06; const gap = Math.min(pg.w, pg.h) * 0.02;
  const made = g[1].map(([x, y, w, h]) => addFrame(D, 'arrondi', { x: m + x * (pg.w - 2 * m) + gap / 2, y: m + y * (pg.h - 2 * m) + gap / 2, w: w * (pg.w - 2 * m) - gap, h: h * (pg.h - 2 * m) - gap }));
  D.selectList(made.filter(Boolean)); D.changed();
  toast('Grille ajoutée : dépose une image sur chaque cadre ou utilise « Choisir une image ».');
}
// Boîte du cadre (en coordonnées de la page) pour un cadre vide ou une image découpée.
export function frameBox(o) {
  if (o.nxFrame && o.nxFrame.empty) { const r = o.getBoundingRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
  const c = o.clipPath; if (!c) return null;
  const m = o.calcTransformMatrix(); const cm = util.multiplyTransformMatrices(m, c.calcTransformMatrix());
  const hw = c.width / 2; const hh = c.height / 2;
  const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => apply(cm, x, y));
  const xs = pts.map((p) => p.x); const ys = pts.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
// Place une image dans un cadre (remplissage, zoom et décalage réglables ensuite).
export async function fillFrame(D, frame, dataUrl, { zoom = 1, dx = 0, dy = 0 } = {}) {
  const box = frameBox(frame); if (!box) return null;
  const shape = frame.nxFrame.shape;
  const img = dataUrl instanceof HTMLCanvasElement ? new FabricImage(dataUrl) : await FabricImage.fromURL(dataUrl);
  layoutInFrame(img, box, shape, { zoom, dx, dy });
  img.name = frame.name && frame.name.startsWith('Cadre') ? frame.name.replace('Cadre photo', 'Photo') : 'Photo';
  if (frame.type === 'image') { img.nxAdj = frame.nxAdj; img.nxFx = frame.nxFx; }
  return replaceObj(D, frame, img, { keepName: false });
}
export function layoutInFrame(img, box, shape, { zoom = 1, dx = 0, dy = 0 } = {}) {
  const ew = img.width; const eh = img.height;
  const s = Math.max(box.w / ew, box.h / eh) * zoom;
  img.set({ scaleX: s, scaleY: s, angle: 0, flipX: false, flipY: false });
  img.setPositionByOrigin({ x: box.x + box.w / 2 + dx * box.w, y: box.y + box.h / 2 + dy * box.h }, 'center', 'center');
  img.setCoords();
  // Forme du cadre en coordonnées locales de l'image.
  const inv = invert(img.calcTransformMatrix());
  const tmp = new Path(FRAMES[shape][1]);
  const sx = box.w / tmp.width; const sy = box.h / tmp.height; const po = tmp.pathOffset;
  const d = tmp.path.map((seg) => {
    const out = [seg[0]];
    for (let i = 1; i < seg.length; i += 2) { const sxp = box.x + (seg[i] - po.x + tmp.width / 2) * sx; const syp = box.y + (seg[i + 1] - po.y + tmp.height / 2) * sy; const l = apply(inv, sxp, syp); out.push(l.x, l.y); }
    return out;
  });
  const clip = new Path(d, { fill: '#000' });
  img.clipPath = clip;
  img.nxFrame = { shape, zoom, dx, dy };
  img.dirty = true;
}
export function reframe(D, img, patch) {
  const box = frameBox(img); if (!box || !img.nxFrame) return;
  const f = { ...img.nxFrame, ...patch };
  layoutInFrame(img, box, f.shape, f);
  D.canvas.requestRenderAll();
}
export async function pickIntoFrame(D, frame) {
  const f = await pickFile({ title: 'Image du cadre', name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'] });
  if (f && f.dataUrl) await fillFrame(D, frame, f.dataUrl);
}
// Image déposée sur un cadre vide : elle s'y place.
export function frameAt(D, p) {
  const list = D.canvas.getObjects().filter((o) => o.nxFrame && o.nxFrame.empty).reverse();
  return list.find((o) => o.containsPoint(p)) || null;
}

// ---------- Graphiques ----------
export const CHARTS = { bar: 'Barres', barh: 'Barres horizontales', line: 'Courbe', area: 'Aire', pie: 'Camembert', donut: 'Anneau' };
export function defaultChart(type = 'bar') {
  const b = getBrand();
  return { type, title: 'Ventes par trimestre', labels: ['T1', 'T2', 'T3', 'T4'], values: [12, 19, 15, 26], colors: [b.colors[0], b.colors[1], b.colors[2], mixHex(b.colors[0], '#ffffff', 0.45)], showValues: true, text: b.colors[3], font: b.fonts.body };
}
export function buildChart(spec, W = 720, H = 480) {
  const items = []; const pad = W * 0.06; const titleH = spec.title ? H * 0.12 : 0;
  const font = spec.font || 'NX Inter'; const ink = spec.text || '#14151a';
  const T = (text, left, top, size, o = {}) => new Textbox(String(text), { left, top, width: o.w || W * 0.3, fontSize: size, fontFamily: font, fontWeight: o.weight || 500, fill: o.color || ink, textAlign: o.align || 'left' });
  items.push(new Rect({ left: 0, top: 0, width: W, height: H, fill: 'rgba(0,0,0,0)', strokeWidth: 0 }));
  if (spec.title) items.push(T(spec.title, pad, pad * 0.5, H * 0.065, { weight: 800, w: W - 2 * pad }));
  const vals = spec.values.map((v) => Number(v) || 0); const max = Math.max(1, ...vals.map(Math.abs));
  const col = (i) => spec.colors[i % spec.colors.length];
  const x0 = pad; const y0 = pad + titleH; const cw = W - 2 * pad; const chh = H - y0 - pad * 1.6;
  if (spec.type === 'pie' || spec.type === 'donut') {
    const total = vals.reduce((a, b) => a + Math.max(0, b), 0) || 1; const r = Math.min(cw * 0.55, chh) / 2; const cx = x0 + r + 4; const cy = y0 + chh / 2 + pad * 0.3;
    let a0 = -Math.PI / 2;
    vals.forEach((v, i) => {
      const a1 = a0 + (Math.max(0, v) / total) * Math.PI * 2; const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a, rr) => `${(cx + Math.cos(a) * rr).toFixed(2)} ${(cy + Math.sin(a) * rr).toFixed(2)}`;
      const ri = spec.type === 'donut' ? r * 0.58 : 0;
      const d = ri ? `M ${p(a0, r)} A ${r} ${r} 0 ${large} 1 ${p(a1, r)} L ${p(a1, ri)} A ${ri} ${ri} 0 ${large} 0 ${p(a0, ri)} Z` : `M ${cx} ${cy} L ${p(a0, r)} A ${r} ${r} 0 ${large} 1 ${p(a1, r)} Z`;
      items.push(new Path(d, { fill: col(i), stroke: '#ffffff', strokeWidth: 2 }));
      a0 = a1;
    });
    spec.labels.forEach((l, i) => {
      const ly = y0 + pad * 0.3 + i * H * 0.075; const lx = x0 + r * 2 + pad;
      items.push(new Rect({ left: lx, top: ly + H * 0.012, width: H * 0.035, height: H * 0.035, rx: 4, ry: 4, fill: col(i) }));
      items.push(T(`${l}${spec.showValues ? ` · ${vals[i]}` : ''}`, lx + H * 0.05, ly, H * 0.045, { w: W - lx - pad }));
    });
  } else if (spec.type === 'barh') {
    const n = vals.length; const bh = chh / n * 0.62; const labW = cw * 0.2;
    vals.forEach((v, i) => {
      const y = y0 + i * (chh / n) + (chh / n - bh) / 2; const w = (Math.abs(v) / max) * (cw - labW - pad);
      items.push(T(spec.labels[i] || '', x0, y + bh * 0.15, Math.min(bh * 0.6, H * 0.05), { w: labW - 8, align: 'right' }));
      items.push(new Rect({ left: x0 + labW, top: y, width: Math.max(1, w), height: bh, rx: Math.min(8, bh / 3), ry: Math.min(8, bh / 3), fill: col(i) }));
      if (spec.showValues) items.push(T(String(v), x0 + labW + w + 8, y + bh * 0.15, Math.min(bh * 0.6, H * 0.05), { weight: 700, w: pad * 2 }));
    });
  } else {
    const n = vals.length; const base = y0 + chh;
    items.push(new Rect({ left: x0, top: base, width: cw, height: 2, fill: mixHex(ink, '#ffffff', 0.75) }));
    for (let g = 1; g <= 3; g++) items.push(new Rect({ left: x0, top: base - chh * g / 3.3, width: cw, height: 1, fill: mixHex(ink, '#ffffff', 0.88) }));
    if (spec.type === 'bar') {
      const bw = cw / n * 0.6;
      vals.forEach((v, i) => {
        const x = x0 + i * (cw / n) + (cw / n - bw) / 2; const h = (Math.abs(v) / max) * chh * 0.88;
        items.push(new Rect({ left: x, top: base - h, width: bw, height: Math.max(1, h), rx: Math.min(10, bw / 4), ry: Math.min(10, bw / 4), fill: col(i) }));
        items.push(T(spec.labels[i] || '', x - bw * 0.2, base + 8, H * 0.045, { w: bw * 1.4, align: 'center' }));
        if (spec.showValues) items.push(T(String(v), x - bw * 0.2, base - h - H * 0.07, H * 0.045, { w: bw * 1.4, align: 'center', weight: 700 }));
      });
    } else {
      const pts = vals.map((v, i) => [x0 + (n === 1 ? cw / 2 : i * cw / (n - 1)), base - (Math.abs(v) / max) * chh * 0.88]);
      const line = pts.map((p, i) => `${i ? 'L' : 'M'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
      if (spec.type === 'area') items.push(new Path(`${line} L ${pts[pts.length - 1][0]} ${base} L ${pts[0][0]} ${base} Z`, { fill: mixHex(col(0), '#ffffff', 0.6), strokeWidth: 0 }));
      items.push(new Path(line, { fill: '', stroke: col(0), strokeWidth: Math.max(3, H * 0.008), strokeLineJoin: 'round', strokeLineCap: 'round' }));
      pts.forEach((p, i) => {
        items.push(new Ellipse({ left: p[0] - H * 0.014, top: p[1] - H * 0.014, rx: H * 0.014, ry: H * 0.014, fill: '#ffffff', stroke: col(0), strokeWidth: 3 }));
        items.push(T(spec.labels[i] || '', p[0] - cw / n / 2, base + 8, H * 0.045, { w: cw / n, align: 'center' }));
        if (spec.showValues) items.push(T(String(vals[i]), p[0] - cw / n / 2, p[1] - H * 0.08, H * 0.042, { w: cw / n, align: 'center', weight: 700 }));
      });
    }
  }
  const g = new Group(items, { subTargetCheck: false, interactive: false });
  g.nxChart = JSON.parse(JSON.stringify(spec));
  return g;
}
export function addChart(D, type) {
  const pg = page(D); const W = pg.w * 0.7; const H = W * 0.66;
  const g = buildChart(defaultChart(type), W, H);
  g.setPositionByOrigin(center(D), 'center', 'center');
  return place(D, g, { name: `Graphique · ${CHARTS[type]}` });
}
// Les modifications (données, type, couleurs) reconstruisent le graphique à la même place.
export function rebuild(D, o, build) {
  const c = o.getCenterPoint(); const w = o.getScaledWidth(); const h = o.getScaledHeight();
  const n = build(w, h);
  n.setPositionByOrigin(c, 'center', 'center'); n.angle = o.angle || 0;
  return replaceObj(D, o, n);
}
export function editChartSheet(D, o) {
  const s0 = o.nxChart;
  const body = `<div class="field-label">Type</div><div class="seg wide" data-nx-seg="type">${Object.entries(CHARTS).map(([k, v]) => `<button class="${s0.type === k ? 'on' : ''}" data-v="${k}">${v}</button>`).join('')}</div>
    <div class="field-label">Titre</div><input class="input" data-nx-f="title" value="${esc(s0.title || '')}">
    <div class="field-label">Données (une ligne par valeur : libellé ; nombre)</div>
    <textarea class="input nx-ta" data-nx-f="data" rows="7">${esc(s0.labels.map((l, i) => `${l} ; ${s0.values[i] ?? 0}`).join('\n'))}</textarea>
    <label class="check-row"><input type="checkbox" data-nx-f="showValues" ${s0.showValues ? 'checked' : ''}><span class="box"></span><span>Afficher les valeurs</span></label>
    <div class="field-label">Couleurs</div><div class="nx-row">${s0.colors.map((c, i) => `<input type="color" data-nx-col="${i}" value="${esc(c)}">`).join('')}</div>`;
  const s = sheet('nx-chart', sheetHtml({ icon: 'nxChart', title: 'Modifier le graphique', body, go: 'Appliquer' }));
  const spec = JSON.parse(JSON.stringify(s0));
  s.onclick = (e) => {
    const b = e.target.closest('[data-nx-seg] [data-v]');
    if (b) { spec.type = b.dataset.v; for (const x of b.parentElement.children) x.classList.toggle('on', x === b); return; }
    if (e.target.closest('[data-nx-go]')) {
      spec.title = s.querySelector('[data-nx-f="title"]').value;
      spec.showValues = s.querySelector('[data-nx-f="showValues"]').checked;
      const rows = s.querySelector('[data-nx-f="data"]').value.split('\n').map((l) => l.split(/[;\t]/)).filter((r) => r[0] && r[0].trim());
      spec.labels = rows.map((r) => r[0].trim()); spec.values = rows.map((r) => Number(String(r[1] || '0').replace(',', '.').trim()) || 0);
      s.querySelectorAll('[data-nx-col]').forEach((i) => { spec.colors[Number(i.dataset.nxCol)] = i.value; });
      closeSheet('nx-chart');
      rebuild(D, o, (w, h) => buildChart(spec, w, h));
    }
  };
}

// ---------- Tableaux ----------
export function defaultTable() {
  const b = getBrand();
  return { rows: [['Offre', 'Prix', 'Délai'], ['Essentiel', '19 €', '48 h'], ['Pro', '49 €', '24 h'], ['Entreprise', 'Sur devis', 'Sur mesure']], header: true, head: b.colors[0], stripe: mixHex(b.colors[0], '#ffffff', 0.9), text: b.colors[3], font: b.fonts.body };
}
export function buildTable(spec, W = 720, H = 360) {
  const rows = spec.rows.length ? spec.rows : [['']]; const nc = Math.max(...rows.map((r) => r.length)); const nr = rows.length;
  const cw = W / nc; const rh = H / nr; const items = [];
  rows.forEach((r, ri) => {
    const head = spec.header && ri === 0;
    items.push(new Rect({ left: 0, top: ri * rh, width: W, height: rh, fill: head ? spec.head : ri % 2 ? spec.stripe : '#ffffff', strokeWidth: 0 }));
    for (let ci = 0; ci < nc; ci++) {
      items.push(new Textbox(String(r[ci] ?? ''), { left: ci * cw + cw * 0.08, top: ri * rh + rh * 0.28, width: cw * 0.84, fontSize: Math.min(rh * 0.38, cw * 0.16), fontFamily: spec.font || 'NX Inter', fontWeight: head ? 800 : 500, fill: head ? inkOn(spec.head) : spec.text }));
    }
  });
  for (let ri = 1; ri < nr; ri++) items.push(new Rect({ left: 0, top: ri * rh - 0.5, width: W, height: 1, fill: mixHex(spec.text, '#ffffff', 0.82) }));
  const g = new Group(items, { subTargetCheck: false, interactive: false });
  g.nxTable = JSON.parse(JSON.stringify(spec));
  return g;
}
export function addTable(D) {
  const pg = page(D); const W = pg.w * 0.76; const H = W * 0.5;
  const g = buildTable(defaultTable(), W, H); g.setPositionByOrigin(center(D), 'center', 'center');
  return place(D, g, { name: 'Tableau' });
}
export function editTableSheet(D, o) {
  const s0 = o.nxTable;
  const s = sheet('nx-table', sheetHtml({ icon: 'nxTable', title: 'Modifier le tableau', body: `<div class="field-label">Contenu (une ligne par rangée, cellules séparées par « ; »)</div>
    <textarea class="input nx-ta" data-nx-f="rows" rows="8">${esc(s0.rows.map((r) => r.join(' ; ')).join('\n'))}</textarea>
    <label class="check-row"><input type="checkbox" data-nx-f="header" ${s0.header ? 'checked' : ''}><span class="box"></span><span>Première ligne en en-tête</span></label>
    <div class="nx-row"><label class="nx-colf">En-tête <input type="color" data-nx-c="head" value="${esc(s0.head)}"></label><label class="nx-colf">Lignes alternées <input type="color" data-nx-c="stripe" value="${esc(s0.stripe)}"></label><label class="nx-colf">Texte <input type="color" data-nx-c="text" value="${esc(s0.text)}"></label></div>`, go: 'Appliquer' }));
  s.onclick = (e) => {
    if (!e.target.closest('[data-nx-go]')) return;
    const spec = { ...s0 };
    spec.rows = s.querySelector('[data-nx-f="rows"]').value.split('\n').filter((l) => l.trim()).map((l) => l.split(/[;\t]/).map((c) => c.trim()));
    spec.header = s.querySelector('[data-nx-f="header"]').checked;
    s.querySelectorAll('[data-nx-c]').forEach((i) => { spec[i.dataset.nxC] = i.value; });
    closeSheet('nx-table');
    rebuild(D, o, (w, h) => buildTable(spec, w, h));
  };
}

// ---------- Codes QR ----------
export async function buildQr(spec, size = 400) {
  const qrmod = await import('../../dist/chunks/qrcode-CLK456NR.js');
  const qr = (qrmod.default || qrmod)(0, 'M'); qr.addData(spec.text || 'https://'); qr.make();
  const n = qr.getModuleCount(); const q = size / (n + 4); let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) { const x = (c + 2) * q; const y = (r + 2) * q; d += `M ${x.toFixed(2)} ${y.toFixed(2)} h ${(q + 0.3).toFixed(2)} v ${(q + 0.3).toFixed(2)} h ${(-q - 0.3).toFixed(2)} Z `; }
  const bg = new Rect({ left: 0, top: 0, width: size, height: size, fill: spec.bg || '#ffffff', rx: size * 0.04, ry: size * 0.04 });
  const fg = new Path(d, { fill: spec.color || '#14151a' });
  const g = new Group([bg, fg], { subTargetCheck: false, interactive: false });
  g.nxQr = { ...spec };
  return g;
}
export async function addQr(D, text) {
  const url = text || (state.source && (state.source.url || state.source.baseUrl)) || 'https://nexora.app';
  const pg = page(D); const size = Math.min(pg.w, pg.h) * 0.36;
  const g = await buildQr({ text: url, color: getBrand().colors[3], bg: '#ffffff' }, size);
  g.setPositionByOrigin(center(D), 'center', 'center');
  place(D, g, { name: 'Code QR' });
  if (!text && !(state.source && state.source.url)) toast('Code QR créé : change son lien dans le panneau de droite.');
}
export async function rebuildQr(D, o, patch) {
  const spec = { ...o.nxQr, ...patch }; const c = o.getCenterPoint(); const w = o.getScaledWidth();
  const n = await buildQr(spec, w); n.setPositionByOrigin(c, 'center', 'center');
  return replaceObj(D, o, n);
}

// ---------- Modèles de départ ----------
export async function applyTemplate(D, id, { onNewPage = false } = {}) {
  const b = getBrand(); const spec = templateSpec(id, b);
  if (onNewPage) {
    const { b: newPage } = await import('../../dist/chunks/chunk-SKL2UTC7.js');
    D.capturePage(); D.doc.pages.push(newPage(`${TEMPLATES[id].label}`, TEMPLATES[id].format)); await D.openPage(D.doc.pages.length - 1, { save: false });
  }
  const pg = page(D); const W = pg.w; const H = pg.h; const m = Math.min(W, H);
  pg.bg = spec.bg; D.updateBoard && D.updateBoard();
  D.loading = true;
  const made = [];
  for (const it of spec.items) {
    let o = null;
    const x = it.x * W; const y = it.y * H; const w = it.w * W; const h = (it.h || 0) * H;
    if (it.type === 'rect') o = new Rect({ left: x, top: y, width: w, height: h, fill: it.fill, rx: (it.r || 0) * Math.min(w, h), ry: (it.r || 0) * Math.min(w, h), strokeWidth: 0 });
    if (it.type === 'ellipse') o = new Ellipse({ left: x, top: y, rx: w / 2, ry: h / 2, fill: it.fill, strokeWidth: 0 });
    if (it.type === 'shape') o = boxPath(SHAPES[it.shape][1], x, y, w, h, { fill: it.fill, strokeWidth: 0, fillRule: 'evenodd' });
    if (it.type === 'text') { o = new Textbox(it.text, { left: x, top: y, width: w, fontSize: it.size * m, fontFamily: it.font, fontWeight: it.weight, fill: it.color, textAlign: it.align, lineHeight: it.lh, charSpacing: it.spacing }); o.name = it.text.split('\n')[0].slice(0, 24); }
    if (it.type === 'frame') { o = boxPath(FRAMES[it.shape][1], x, y, w, h, { fill: mixHex(b.colors[4], '#000000', 0.08), stroke: mixHex(b.colors[4], '#000000', 0.25), strokeWidth: 2, strokeDashArray: [10, 8], strokeUniform: true }); o.nxFrame = { shape: it.shape, empty: true }; o.name = 'Cadre photo'; }
    if (it.type === 'sticker') {
      D.loading = false;
      const svg = stickerSvg(it.kind, { c1: it.c1, c2: it.c2 });
      const res = await loadSVGFromString(svg); const grp = util.groupSVGElements(res.objects.filter(Boolean), res.options);
      grp.set({ scaleX: w / grp.width, scaleY: h / grp.height, left: x, top: y }); o = grp; o.name = 'Autocollant';
      D.loading = true;
    }
    if (it.type === 'logo') {
      if (b.logo) { const img = await FabricImage.fromURL(b.logo); const s = Math.min(w / img.width, h / img.height); img.set({ scaleX: s, scaleY: s, left: x + (w - img.width * s) / 2, top: y + (h - img.height * s) / 2 }); o = img; } else { o = new Textbox(b.name || 'Logo', { left: x, top: y + h * 0.15, width: w, fontSize: h * 0.6, fontFamily: b.fonts.title, fontWeight: 800, fill: luminance(spec.bg) > 0.4 ? b.colors[3] : '#ffffff', textAlign: 'right' }); }
      o.name = 'Logo'; o.nxKind = 'logo';
    }
    if (o) { o.id = uid(); o.name = o.name || D.typeName(o); D.canvas.add(o); made.push(o); }
  }
  D.loading = false;
  D.canvas.requestRenderAll(); D.changed(); D.renderLeft(); D.renderProps();
  toast(`Modèle « ${TEMPLATES[id].label} » appliqué${b.name ? ` avec la marque ${b.name}` : ''}. Remplace les textes et dépose tes photos dans les cadres.`);
  return made;
}
// Aperçu d'un modèle (rendu simplifié dans une petite image).
const thumbCache = new Map();
export function templateThumb(id, w = 132) {
  const key = `${id}:${JSON.stringify(getBrand())}`;
  if (thumbCache.has(key)) return thumbCache.get(key);
  const fmt = { post: [1080, 1080], story: [1080, 1920], portrait: [1080, 1350], yt: [1280, 720], banner: [1440, 480], card: [1050, 600], a4: [2480, 3508], flyer: [1748, 2480], hd: [1920, 1080], og: [1200, 630] }[TEMPLATES[id].format] || [1080, 1080];
  const h = Math.round(w * fmt[1] / fmt[0]); const W = fmt[0]; const H = fmt[1]; const m = Math.min(W, H); const k = w / W;
  const c = makeCanvas(w * 2, h * 2); const x = c.getContext('2d'); x.scale(2 * k, 2 * k);
  const spec = templateSpec(id, getBrand());
  x.fillStyle = spec.bg; x.fillRect(0, 0, W, H);
  for (const it of spec.items) {
    const X = it.x * W; const Y = it.y * H; const w2 = it.w * W; const h2 = (it.h || 0) * H;
    x.save();
    if (it.type === 'rect') { x.fillStyle = it.fill; x.beginPath(); x.roundRect(X, Y, w2, h2, (it.r || 0) * Math.min(w2, h2)); x.fill(); }
    if (it.type === 'ellipse') { x.fillStyle = it.fill; x.beginPath(); x.ellipse(X + w2 / 2, Y + h2 / 2, Math.abs(w2 / 2), Math.abs(h2 / 2), 0, 0, Math.PI * 2); x.fill(); }
    if (it.type === 'shape' || it.type === 'frame') { const p = new Path2D(SHAPES[it.shape] ? SHAPES[it.shape][1] : FRAMES[it.shape][1]); x.translate(X, Y); x.scale(w2 / 100, h2 / 100); x.fillStyle = it.type === 'frame' ? 'rgba(120,120,140,0.25)' : it.fill; x.fill(p, 'evenodd'); }
    if (it.type === 'sticker') { x.fillStyle = it.c1; x.beginPath(); x.arc(X + w2 / 2, Y + h2 / 2, Math.min(w2, h2) / 2, 0, Math.PI * 2); x.fill(); }
    if (it.type === 'logo') { x.fillStyle = 'rgba(128,128,128,0.35)'; x.fillRect(X, Y + h2 * 0.3, w2, h2 * 0.4); }
    if (it.type === 'text') {
      x.fillStyle = it.color; const fs = it.size * m; x.font = `${it.weight} ${fs}px '${it.font}', Inter, sans-serif`; x.textBaseline = 'top'; x.textAlign = it.align === 'center' ? 'center' : it.align === 'right' ? 'right' : 'left';
      const tx = it.align === 'center' ? X + w2 / 2 : it.align === 'right' ? X + w2 : X;
      let yy = Y; for (const line of wrap(x, it.text, w2)) { x.fillText(line, tx, yy); yy += fs * (it.lh || 1.1); }
    }
    x.restore();
  }
  const url = c.toDataURL('image/png');
  thumbCache.set(key, url);
  return url;
}
function wrap(x, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) { let cur = ''; for (const w of para.split(/\s+/)) { const t = cur ? `${cur} ${w}` : w; if (x.measureText(t).width > maxW && cur) { out.push(cur); cur = w; } else cur = t; } out.push(cur); }
  return out;
}

// ---------- Kit de marque appliqué au document ----------
export async function applyBrand(D, b = getBrand()) {
  const objs = []; const walk = (l) => { for (const o of l) { if (o.id === '__board') continue; objs.push(o); if (o.type === 'group' && o.getObjects) walk(o.getObjects()); } };
  walk(D.canvas.getObjects());
  // Couleurs : les plus présentes deviennent celles de la marque (le clair et le foncé restent clair et foncé).
  const weight = new Map();
  for (const o of objs) for (const k of ['fill', 'stroke']) { const v = o[k]; if (typeof v === 'string' && /^#|rgb/.test(v)) { const hx = toHex(v); const a = (o.getScaledWidth() * o.getScaledHeight()) || 1; weight.set(hx, (weight.get(hx) || 0) + a); } }
  const pg = page(D); const bgHex = toHex(pg.bg || '#ffffff');
  const colorful = [...weight.entries()].filter(([c]) => { const l = luminance(c); return l > 0.06 && l < 0.85; }).sort((a, z) => z[1] - a[1]).map(([c]) => c);
  const map = new Map(); colorful.forEach((c, i) => map.set(c, b.colors[i % 3]));
  const remap = (c) => { if (typeof c !== 'string') return c; const hx = toHex(c); if (map.has(hx)) return map.get(hx); const l = luminance(hx); if (l <= 0.06) return b.colors[3]; if (l >= 0.85) return hx === '#ffffff' ? hx : b.colors[4]; return c; };
  for (const o of objs) { if (o.fill) o.set('fill', remap(o.fill)); if (o.stroke) o.set('stroke', remap(o.stroke)); o.dirty = true; }
  if (luminance(bgHex) >= 0.85) pg.bg = b.colors[4]; else if (luminance(bgHex) <= 0.06) pg.bg = b.colors[3]; else if (map.has(bgHex)) pg.bg = map.get(bgHex);
  // Polices : les plus grands textes prennent la police des titres.
  const texts = objs.filter((o) => ['textbox', 'i-text', 'text'].includes(o.type));
  const sizes = texts.map((t) => t.fontSize * (t.scaleY || 1)).sort((a, z) => z - a);
  const cut = sizes[Math.min(1, sizes.length - 1)] || 0;
  for (const t of texts) t.set('fontFamily', t.fontSize * (t.scaleY || 1) >= cut ? b.fonts.title : b.fonts.body);
  // Logo : remplace celui du document ou en ajoute un.
  if (b.logo) {
    const cur = objs.find((o) => o.nxKind === 'logo');
    const img = await FabricImage.fromURL(b.logo);
    if (cur) { const r = cur.getBoundingRect(); const s = Math.min(r.width / img.width, r.height / img.height); img.set({ scaleX: s, scaleY: s, left: r.left + (r.width - img.width * s) / 2, top: r.top + (r.height - img.height * s) / 2 }); img.nxKind = 'logo'; replaceObj(D, cur, img); } else {
      const s = Math.min(pg.w * 0.16 / img.width, pg.h * 0.1 / img.height); img.set({ scaleX: s, scaleY: s, left: pg.w - img.width * s - pg.w * 0.05, top: pg.h * 0.05 }); img.nxKind = 'logo'; img.id = uid(); img.name = 'Logo'; D.canvas.add(img);
    }
  }
  D.updateBoard && D.updateBoard(); D.canvas.requestRenderAll(); D.changed();
  toast(`Kit de marque${b.name ? ` « ${b.name} »` : ''} appliqué à la page.`);
}
function toHex(c) { if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase(); if (/^#[0-9a-f]{3}$/i.test(c)) return `#${c.slice(1).split('').map((x) => x + x).join('')}`.toLowerCase(); const m = String(c).match(/rgba?\(([^)]+)\)/); if (m) { const [r, g, bb] = m[1].split(',').map((v) => Number(v.trim())); return `#${[r, g, bb].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}`; } return c; }

// ---------- Composants (éléments réutilisables) ----------
export const comps = (D) => (D.doc.nxComponents = D.doc.nxComponents || {});
export async function makeComponent(D) {
  let sel = D.sel(); if (!sel.length) { toast('Sélectionne d’abord les calques du composant.', { kind: 'bad' }); return; }
  if (sel.length > 1) { D.group(); sel = D.sel(); }
  const o = sel[0]; const id = uid();
  o.nxComp = { id, master: true };
  comps(D)[id] = { name: o.name && o.name !== 'Groupe' ? o.name : `Composant ${Object.keys(comps(D)).length + 1}`, json: o.toObject(FabricObject.customProperties), updated: Date.now() };
  o.name = comps(D)[id].name;
  D.changed(); D.renderProps();
  toast('Composant créé : insère des copies depuis l’onglet « Éléments ». Modifie le principal puis « Mettre à jour les copies ».');
}
export async function insertComponent(D, id) {
  const c = comps(D)[id]; if (!c) return;
  const [o] = await util.enlivenObjects([c.json]);
  o.nxComp = { id }; o.name = c.name;
  o.setPositionByOrigin({ x: page(D).w / 2 + 30, y: page(D).h / 2 + 30 }, 'center', 'center');
  place(D, o);
}
export async function updateComponent(D, master) {
  const id = master.nxComp.id; const c = comps(D)[id];
  c.json = master.toObject(FabricObject.customProperties); c.updated = Date.now(); c.name = master.name || c.name;
  let count = 0;
  const fresh = async (old) => {
    const [n] = await util.enlivenObjects([c.json]);
    n.nxComp = { id }; n.name = c.name;
    n.set({ scaleX: n.scaleX * (old.getScaledWidth() / Math.max(1, n.getScaledWidth())), scaleY: n.scaleY * (old.getScaledWidth() / Math.max(1, n.getScaledWidth())), angle: old.angle });
    n.setPositionByOrigin(old.getCenterPoint(), 'center', 'center');
    return n;
  };
  for (const o of D.canvas.getObjects().filter((x) => x.nxComp && x.nxComp.id === id && !x.nxComp.master)) { const n = await fresh(o); replaceObj(D, o, n, { select: false }); count++; }
  // Autres pages : leurs copies sont remplacées dans le document enregistré.
  D.capturePage();
  for (const [i, pg] of D.doc.pages.entries()) {
    if (i === D.pageIdx || !pg.json || !pg.json.objects) continue;
    for (let k = 0; k < pg.json.objects.length; k++) {
      const j = pg.json.objects[k];
      if (j.nxComp && j.nxComp.id === id && !j.nxComp.master) {
        const [old] = await util.enlivenObjects([j]); const n = await fresh(old);
        pg.json.objects[k] = n.toObject(FabricObject.customProperties); count++;
      }
    }
  }
  D.save(); D.canvas.requestRenderAll();
  toast(count ? `${count} copie${count > 1 ? 's' : ''} mise${count > 1 ? 's' : ''} à jour.` : 'Composant enregistré (aucune copie pour l’instant).');
}

// ---------- Styles de texte ----------
export function textStyles(D) {
  const b = getBrand();
  const base = [{ id: 'titre', name: 'Titre', font: b.fonts.title, size: 96, weight: 800, color: b.colors[3], lh: 1.05, ls: 0 }, { id: 'sous', name: 'Sous-titre', font: b.fonts.title, size: 48, weight: 700, color: b.colors[0], lh: 1.1, ls: 0 }, { id: 'corps', name: 'Corps', font: b.fonts.body, size: 28, weight: 400, color: b.colors[3], lh: 1.35, ls: 0 }];
  return [...base.filter((s) => !(D.doc.nxStyles || []).some((x) => x.id === s.id)), ...(D.doc.nxStyles || [])];
}
export function applyTextStyle(D, t, st) {
  t.set({ fontFamily: st.font, fontSize: st.size * (page(D).w / 1080), fontWeight: st.weight, fill: st.color, lineHeight: st.lh, charSpacing: st.ls || 0 });
  t.nxStyle = st.id; t.initDimensions && t.initDimensions(); t.dirty = true;
}
export function saveTextStyle(D, t, name) {
  const st = { id: t.nxStyle && !['titre', 'sous', 'corps'].includes(t.nxStyle) ? t.nxStyle : uid(), name, font: t.fontFamily, size: Math.round(t.fontSize / (page(D).w / 1080)), weight: Number(t.fontWeight) || 400, color: typeof t.fill === 'string' ? t.fill : '#1d1d1f', lh: t.lineHeight, ls: t.charSpacing || 0 };
  D.doc.nxStyles = [...(D.doc.nxStyles || []).filter((s) => s.id !== st.id), st];
  t.nxStyle = st.id;
  // Tous les textes qui suivent ce style dans le document sont mis à jour.
  let n = 0;
  for (const o of D.canvas.getObjects()) if (o !== t && o.nxStyle === st.id) { applyTextStyle(D, o, st); n++; }
  D.capturePage();
  for (const [i, pg] of D.doc.pages.entries()) { if (i === D.pageIdx || !pg.json || !pg.json.objects) continue; for (const j of pg.json.objects) if (j.nxStyle === st.id) { Object.assign(j, { fontFamily: st.font, fontWeight: st.weight, fill: st.color, lineHeight: st.lh, charSpacing: st.ls }); n++; } }
  D.changed(); D.save();
  toast(n ? `Style « ${name} » enregistré et appliqué à ${n} autre${n > 1 ? 's' : ''} texte${n > 1 ? 's' : ''}.` : `Style « ${name} » enregistré.`);
}

// ---------- Objets dynamiques (images liées) ----------
export function linkImage(D, o) { if (!o.nxLink) o.nxLink = uid(); D.changed(); toast('Objet dynamique : les copies de cette image (Ctrl+D, copier-coller) se mettent à jour ensemble.'); }
export async function replaceLinked(D, o) {
  const f = await pickFile({ title: 'Nouvelle image (toutes les copies liées)', name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif'] });
  if (!f || !f.dataUrl) return;
  const id = o.nxLink; let n = 0;
  for (const x of D.canvas.getObjects()) if (x.type === 'image' && x.nxLink === id) { const w = x.getScaledWidth(); const c = x.getCenterPoint(); await x.setSrc(f.dataUrl); x.scaleToWidth(w); x.setPositionByOrigin(c, 'center', 'center'); D.applyFx(x); n++; }
  D.capturePage();
  for (const [i, pg] of D.doc.pages.entries()) { if (i === D.pageIdx || !pg.json || !pg.json.objects) continue; for (const j of pg.json.objects) if (j.type && /image/i.test(j.type) && j.nxLink === id) { j.src = f.dataUrl; n++; } }
  D.canvas.requestRenderAll(); D.changed(); D.save();
  toast(`${n} image${n > 1 ? 's' : ''} liée${n > 1 ? 's' : ''} remplacée${n > 1 ? 's' : ''}.`);
}
export { ico, hexRgb, loadImage };
