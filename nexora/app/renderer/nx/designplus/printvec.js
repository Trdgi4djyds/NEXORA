// NEXORA #054 : page NEX-DESIGN → page de PDF vectoriel. Formes, tracés, groupes et textes restent vectoriels
// (textes avec la vraie police, sélectionnables) ; ce qu'un PDF simple ne sait pas rendre (photos, dégradés,
// ombres, effets, masques, police introuvable) est placé en image à la résolution d'impression.
import { api, dataUrlBytes } from './ui.js';
import { woffToSfnt, makeFont, glyphs, textRun, rectPath, ellipsePath, pathOps, cropMarks, num } from './pdfvec.js';

const stream = (u8, t) => new Response(new Blob([u8]).stream().pipeThrough(t)).arrayBuffer().then((b) => new Uint8Array(b));
export const deflate = (u8) => stream(u8, new CompressionStream('deflate'));
const inflate = (u8) => stream(u8, new DecompressionStream('deflate'));

// Polices livrées avec NEXORA (renderer/fonts/3d, WOFF) : disponibles sans connexion.
const BUNDLED = { 'inter|400|normal': 'inter-latin-400-normal', 'inter|800|normal': 'inter-latin-800-normal', 'playfair display|700|normal': 'playfair-display-latin-700-normal', 'space grotesk|700|normal': 'space-grotesk-latin-700-normal', 'fredoka|600|normal': 'fredoka-latin-600-normal' };
const STYLE_NAMES = { 100: ['thin'], 200: ['extralight', 'ultralight'], 300: ['light'], 400: ['regular', 'normal', 'book', ''], 500: ['medium'], 600: ['semibold', 'demibold'], 700: ['bold'], 800: ['extrabold', 'ultrabold'], 900: ['black', 'heavy'] };
export const weightOf = (w) => { const s = String(w || '400').toLowerCase(); if (s === 'normal') return 400; if (s === 'bold') return 700; const n = parseInt(s, 10); return Number.isFinite(n) ? Math.min(900, Math.max(100, Math.round(n / 100) * 100)) : 400; };
// Les polices livrées sont déclarées sous un nom préfixé « NX » (« NX Inter ») : même famille.
const familyOf = (f) => String(f || 'Inter').split(',')[0].trim().replace(/^['"]|['"]$/g, '').replace(/^NX\s+/, '');
const ALIAS = { playfair: 'Playfair Display' };
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export class FontBook {
  constructor() { this.map = new Map(); this.list = []; this.local = null; }
  async get(family, weight, style) {
    const fam = ALIAS[familyOf(family).toLowerCase()] || familyOf(family); const w = weightOf(weight); const st = style === 'italic' || style === 'oblique' ? 'italic' : 'normal';
    const id = `${fam.toLowerCase()}|${w}|${st}`;
    if (!this.map.has(id)) this.map.set(id, this.load(fam, w, st, id));
    return this.map.get(id);
  }
  async load(fam, w, st, id) {
    const name = `${fam}-${w}${st === 'italic' ? 'Italic' : ''}`;
    const tryBytes = async (bytes) => { if (!bytes) return null; const f = makeFont(`F${this.list.length + 1}`, name, bytes); if (f) this.list.push(f); return f; };
    try { if (BUNDLED[id]) { const r = await fetch(new URL(`../../fonts/3d/${BUNDLED[id]}.woff`, import.meta.url)); if (r.ok) { const f = await tryBytes(await woffToSfnt(new Uint8Array(await r.arrayBuffer()), inflate)); if (f) return f; } } } catch {}
    // Police libre téléchargée par NEXORA (gardée sur le PC après le premier export).
    try { const r = await api.invoke('dzx:font-ttf', { family: fam, weight: w, style: st }); if (r && r.data) { const f = await tryBytes(b64(r.data)); if (f) return f; } } catch {}
    // Police installée sur le PC.
    try {
      if (window.queryLocalFonts) {
        this.local = this.local || await window.queryLocalFonts();
        const want = (STYLE_NAMES[w] || ['']).map((s) => (st === 'italic' ? `${s}italic` : s));
        const hit = this.local.find((f) => f.family.toLowerCase() === fam.toLowerCase() && want.includes(f.style.toLowerCase().replace(/[\s-]/g, '')));
        if (hit) { const f = await tryBytes(new Uint8Array(await (await hit.blob()).arrayBuffer())); if (f) return f; }
      }
    } catch {}
    return null;
  }
}

// ---------- Couleurs ----------
const cctx = document.createElement('canvas').getContext('2d');
export function color(c) {
  if (c === null || c === undefined || c === '' || c === 'transparent' || c === 'none') return null;
  if (typeof c !== 'string') return false;
  cctx.fillStyle = '#000000'; cctx.fillStyle = c;
  const v = cctx.fillStyle;
  if (v[0] === '#') { const n = parseInt(v.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255, 1]; }
  const m = v.match(/rgba?\(([^)]+)\)/); if (!m) return false;
  const p = m[1].split(',').map(Number);
  if (p.length > 3 && p[3] === 0) return null;
  return [p[0] / 255, p[1] / 255, p[2] / 255, p.length > 3 ? p[3] : 1];
}
const rgb = (c) => c.slice(0, 3).map(num).join(' ');

// ---------- Éléments pris en charge ----------
const EFFECTS = ['nxFx', 'nxMask', 'nxFrame', 'nxAdj', 'nxPattern'];
const hasEffect = (o) => EFFECTS.some((k) => { const v = o[k]; return v && (typeof v !== 'object' || Object.keys(v).length); });
const isText = (o) => ['textbox', 'i-text', 'text'].includes(o.type);
function plainVector(o) {
  if (o.shadow || o.clipPath || hasEffect(o) || (o.globalCompositeOperation && o.globalCompositeOperation !== 'source-over') || o.strokeUniform || (o.filters && o.filters.length)) return false;
  if (color(o.fill) === false || color(o.stroke) === false) return false;
  if (o.type === 'group') return o.getObjects().every((c) => c.visible === false || plainVector(c));
  if (isText(o)) return !o.path && o.direction !== 'rtl' && !o.textBackgroundColor && !(o.stroke && o.strokeWidth);
  if (o.type === 'circle') return Math.abs((o.endAngle ?? 360) - (o.startAngle ?? 0)) % 360 === 0;
  return ['rect', 'ellipse', 'triangle', 'line', 'polyline', 'polygon', 'path'].includes(o.type);
}

// Une page : contenu PDF, images et transparences, avec le compte des éléments vectoriels et en image.
export class PageWriter {
  constructor(fonts, { mult }) { this.fonts = fonts; this.mult = mult; this.s = ''; this.images = []; this.gsMap = new Map(); this.stats = { vector: 0, text: 0, image: 0 }; }
  gs(ca, CA = ca) { const k = `${num(ca)}|${num(CA)}`; if (!this.gsMap.has(k)) this.gsMap.set(k, { key: `G${this.gsMap.size + 1}`, ca, CA }); return this.gsMap.get(k).key; }
  alphaOf(o) { let a = o.opacity ?? 1; for (let g = o.group; g; g = g.group) a *= g.opacity ?? 1; return a; }
  matrix(o) { return `${o.calcTransformMatrix().map(num).join(' ')} cm\n`; }
  // Peinture d'un tracé (local à l'objet) avec son remplissage et son contour.
  paint(o, path, { fillable = true } = {}) {
    if (!path) return false;
    const fill = fillable ? color(o.fill) : null; const stroke = o.strokeWidth > 0 ? color(o.stroke) : null;
    if (!fill && !stroke) return true;
    const a = this.alphaOf(o);
    let s = `q ${this.matrix(o)}`;
    const ca = fill ? fill[3] * a : 1; const CA = stroke ? stroke[3] * a : 1;
    if (ca < 0.999 || CA < 0.999) s += `/${this.gs(ca, CA)} gs\n`;
    if (fill) s += `${rgb(fill)} rg\n`;
    if (stroke) {
      s += `${rgb(stroke)} RG ${num(o.strokeWidth)} w ${({ round: 1, square: 2 })[o.strokeLineCap] || 0} J ${({ round: 1, bevel: 2 })[o.strokeLineJoin] || 0} j ${num(o.strokeMiterLimit || 4)} M\n`;
      if (o.strokeDashArray && o.strokeDashArray.length) s += `[${o.strokeDashArray.map(num).join(' ')}] ${num(o.strokeDashOffset || 0)} d\n`;
    }
    const eo = o.fillRule === 'evenodd' ? '*' : '';
    if (fill && stroke && o.paintFirst === 'stroke') s += `${path}S\n${path}f${eo}\n`;
    else s += `${path}${fill && stroke ? `B${eo}` : fill ? `f${eo}` : 'S'}\n`;
    this.s += `${s}Q\n`;
    this.stats.vector += 1;
    return true;
  }
  shape(o) {
    const w = o.width; const h = o.height;
    switch (o.type) {
      case 'rect': return this.paint(o, rectPath(-w / 2, -h / 2, w, h, o.rx || 0, o.ry || o.rx || 0));
      case 'circle': return this.paint(o, ellipsePath(0, 0, o.radius, o.radius));
      case 'ellipse': return this.paint(o, ellipsePath(0, 0, o.rx, o.ry));
      case 'triangle': return this.paint(o, `${num(-w / 2)} ${num(h / 2)} m 0 ${num(-h / 2)} l ${num(w / 2)} ${num(h / 2)} l h\n`);
      case 'line': { const p = o.calcLinePoints(); return this.paint(o, `${num(p.x1)} ${num(p.y1)} m ${num(p.x2)} ${num(p.y2)} l\n`, { fillable: false }); }
      case 'polyline': case 'polygon': {
        const off = o.pathOffset || { x: 0, y: 0 }; const pts = o.points || [];
        if (!pts.length) return true;
        return this.paint(o, `${pts.map((p, i) => `${num(p.x - off.x)} ${num(p.y - off.y)} ${i ? 'l' : 'm'}`).join('\n')}${o.type === 'polygon' ? '\nh' : ''}\n`);
      }
      case 'path': { const off = o.pathOffset || { x: 0, y: 0 }; return this.paint(o, pathOps(o.path || [], -off.x, -off.y)); }
      default: return false;
    }
  }
  // Texte : police de chaque morceau (famille, graisse, style, taille, couleur), caractères aux positions de NEX-DESIGN.
  async text(o) {
    const lines = o._textLines || []; const bounds = o.__charBounds || [];
    if (!lines.length) return true;
    const left = o._getLeftOffset(); const top = o._getTopOffset(); const frac = o._fontSizeFraction ?? 0.222;
    const a = this.alphaOf(o);
    const prop = (i, j, k) => (o.getValueOfPropertyAt ? o.getValueOfPropertyAt(i, j, k) : o[k]);
    let body = ''; let acc = 0;
    for (let i = 0; i < lines.length; i++) {
      const hl = o.getHeightOfLine(i); const maxH = hl / o.lineHeight;
      const base = top + acc + maxH * (1 - frac); const x0 = left + o._getLineLeftOffset(i);
      const line = lines[i]; let j = 0;
      while (j < line.length) {
        const st = { fam: prop(i, j, 'fontFamily'), w: prop(i, j, 'fontWeight'), it: prop(i, j, 'fontStyle'), size: prop(i, j, 'fontSize'), fill: prop(i, j, 'fill') };
        if (prop(i, j, 'deltaY') || prop(i, j, 'textBackgroundColor') || (prop(i, j, 'stroke') && prop(i, j, 'strokeWidth'))) return false;
        let k = j + 1;
        while (k < line.length && prop(i, k, 'fontFamily') === st.fam && prop(i, k, 'fontWeight') === st.w && prop(i, k, 'fontStyle') === st.it && prop(i, k, 'fontSize') === st.size && prop(i, k, 'fill') === st.fill) k++;
        const chars = line.slice(j, k);
        if (chars.some((c) => /\S/.test(c))) {
          const font = await this.fonts.get(st.fam, st.w, st.it); if (!font) return false;
          const g = glyphs(font, chars); if (!g) return false;
          const fill = color(st.fill); if (fill === false) return false;
          if (fill) {
            const lefts = chars.map((_, n) => x0 + bounds[i][j + n].left);
            const ca = fill[3] * a;
            body += `${ca < 0.999 ? `/${this.gs(ca)} gs ` : ''}${rgb(fill)} rg BT /${font.key} ${num(st.size)} Tf 1 0 0 -1 0 ${num(base)} Tm ${textRun(font, chars, g, lefts, st.size)} ET\n`;
          }
        }
        j = k;
      }
      // Soulignement, barré, surligné (même calcul que NEX-DESIGN).
      for (const [k, off, sh] of [['underline', 0.1, 0], ['linethrough', -0.28167, 0.5], ['overline', -0.81333, 1]]) {
        if (!o[k] || !line.length) continue;
        const fill = color(o.textDecorationColor || o.fill); if (!fill) continue;
        const B = o.fontSize * (o.textDecorationThickness ?? 66.667) / 1000;
        body += `${rgb(fill)} rg ${num(x0)} ${num(base + off * o.fontSize - sh * B)} ${num(o.getLineWidth(i))} ${num(B)} re f\n`;
      }
      acc += hl;
    }
    this.s += `q ${this.matrix(o)}${body}Q\n`;
    this.stats.text += 1;
    return true;
  }
  async vector(o) {
    if (o.visible === false) return true;
    if (o.type === 'group') { for (const c of o.getObjects()) if (!(await this.vector(c))) return false; return true; }
    if (isText(o)) return this.text(o);
    return this.shape(o);
  }
  // Élément entier en image, à la résolution d'impression.
  raster(o) {
    const big = Math.max(o.getScaledWidth(), o.getScaledHeight(), 1) * this.mult;
    const mult = big > 6000 ? this.mult * 6000 / big : this.mult;
    const cv = o.toCanvasElement({ multiplier: mult, enableRetinaScaling: false });
    if (!cv.width || !cv.height) return;
    const c = o.getCenterPoint(); const w = cv.width / mult; const h = cv.height / mult;
    const px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let opaque = true; for (let i = 3; i < px.length; i += 4) if (px[i] < 255) { opaque = false; break; }
    const key = `Im${this.images.length + 1}`;
    if (opaque) this.images.push({ key, w: cv.width, h: cv.height, jpg: dataUrlBytes(cv.toDataURL('image/jpeg', 0.92)) });
    else {
      const n = cv.width * cv.height; const rgbB = new Uint8Array(n * 3); const al = new Uint8Array(n);
      for (let i = 0; i < n; i++) { rgbB[i * 3] = px[i * 4]; rgbB[i * 3 + 1] = px[i * 4 + 1]; rgbB[i * 3 + 2] = px[i * 4 + 2]; al[i] = px[i * 4 + 3]; }
      this.images.push({ key, w: cv.width, h: cv.height, rgb: rgbB, alpha: al });
    }
    this.s += `q ${num(w)} 0 0 ${num(-h)} ${num(c.x - w / 2)} ${num(c.y + h / 2)} cm /${key} Do Q\n`;
    this.stats.image += 1;
  }
  async object(o) {
    if (o.visible === false || (o.id && String(o.id).startsWith('__'))) return;
    if (plainVector(o)) {
      const mark = this.s.length; const st = { ...this.stats };
      if (await this.vector(o)) return;
      this.s = this.s.slice(0, mark); this.stats = st;
    }
    this.raster(o);
  }
}

// Page ouverte → page PDF (taille réelle en mm, fonds perdus, traits de coupe).
export async function pageVector(D, cfg, fonts) {
  const pt = (mm) => mm / 25.4 * 72;
  const tw = pt(cfg.wmm); const th = pt(cfg.hmm); const b = pt(cfg.bleed); const m = cfg.marks ? pt(cfg.bleed + 7) : b;
  const W = tw + 2 * m; const H = th + 2 * m;
  const kx = tw / D.page.w; const ky = th / D.page.h;
  const pw = new PageWriter(fonts, { mult: (cfg.wmm / 25.4 * cfg.dpi) / D.page.w });
  const bpx = cfg.bleed / cfg.wmm * D.page.w; const bpy = cfg.bleed / cfg.hmm * D.page.h;
  const bg = color(D.page.bg || '#ffffff');
  let head = `q ${num(m - b)} ${num(m - b)} ${num(tw + 2 * b)} ${num(th + 2 * b)} re W n\n${num(kx)} 0 0 ${num(-ky)} ${num(m)} ${num(m + th)} cm\n`;
  if (bg) head += `${rgb(bg)} rg ${num(-bpx)} ${num(-bpy)} ${num(D.page.w + 2 * bpx)} ${num(D.page.h + 2 * bpy)} re f\n`;
  D.canvas.discardActiveObject();
  for (const o of D.canvas.getObjects()) await pw.object(o);
  const content = `${head}${pw.s}Q\n${cfg.marks ? cropMarks(W, H, m, b) : ''}`;
  return { page: { W, H, trim: [m, m, W - m, H - m], bleed: [m - b, m - b, W - m + b, H - m + b], content, images: pw.images, gs: [...pw.gsMap.values()] }, stats: pw.stats };
}
