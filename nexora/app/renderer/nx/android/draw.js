// NEXORA #017 : dessins de la fiche Play Store (bannière, captures habillées, écran de l'aperçu),
// faits dans un canvas à partir de l'icône de l'application et des cadres d'appareils de NEXORA.
import { b as layoutDevice, f as drawFrame, g as drawScreenOverlay } from '../../dist/chunks/chunk-2YDBP2EL.js';
import { nxIconSpec, nxIconCanvas } from '../../dist/chunks/android-W5CZA2A2.js';
import { makeCanvas, loadImage, canvasBlob, inkOn, mixHex, luminance } from '../core.js';

export const FONT = 'Inter, "Segoe UI", system-ui, sans-serif';

export async function blobDataUrl(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
}
export const canvasJpeg = async (c, q = 0.92) => blobDataUrl(await canvasBlob(c, 'image/jpeg', q));
export const canvasPng = async (c) => blobDataUrl(await canvasBlob(c, 'image/png'));

/* Couleurs de la marque : celles de l'icône (fond, dégradé) ou, à défaut, la couleur principale. */
export function brand(cfg) {
  const ic = cfg.icon || {};
  const a = /^#[0-9a-f]{6}$/i.test(ic.bg || '') && luminance(ic.bg) < 0.92 ? ic.bg : (cfg.accent || '#4F46E5');
  const b = ic.gradient && /^#[0-9a-f]{6}$/i.test(ic.bg2 || '') ? ic.bg2 : mixHex(a, '#000000', 0.35);
  return { a, b, ink: inkOn(mixHex(a, b, 0.5)) };
}

function wrap(ctx, text, maxW, maxLines) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width <= maxW || !cur) cur = t;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const keep = lines.slice(0, maxLines);
    let last = keep[maxLines - 1];
    while (last && ctx.measureText(`${last}…`).width > maxW) last = last.replace(/\s*\S+$/, '');
    keep[maxLines - 1] = `${last}…`;
    return keep;
  }
  return lines;
}

/* Texte sur plusieurs lignes, taille réduite jusqu'à tenir dans la zone. */
function fitText(ctx, text, { x, y, w, h, size, min = 18, weight = 700, lines = 3, align = 'left', color, lh = 1.18 }) {
  let s = size;
  let out = [];
  for (; s >= min; s -= 2) {
    ctx.font = `${weight} ${s}px ${FONT}`;
    out = wrap(ctx, text, w, lines);
    if (out.length * s * lh <= h && out.every((l) => ctx.measureText(l).width <= w)) break;
  }
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  const ax = align === 'center' ? x + w / 2 : x;
  out.forEach((l, i) => ctx.fillText(l, ax, y + i * s * lh));
  return out.length * s * lh;
}

function gradient(ctx, w, h, a, b, angle = 'diag') {
  const g = angle === 'down' ? ctx.createLinearGradient(0, 0, 0, h) : ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Halo léger : la bannière n'est pas un aplat.
  const r = ctx.createRadialGradient(w * 0.82, h * 0.1, 0, w * 0.82, h * 0.1, Math.max(w, h) * 0.75);
  r.addColorStop(0, 'rgba(255,255,255,0.18)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, w, h);
}

export async function appIcon(cfg, size, shape = 'squircle') {
  const spec = await nxIconSpec(cfg);
  return nxIconCanvas(spec, size, shape);
}

/* Icône de la fiche : 512 × 512, PNG 32 bits, carrée (Google Play arrondit lui-même les angles). */
export async function storeIcon(cfg) {
  return canvasPng(await appIcon(cfg, 512, 'square'));
}

/* Bannière 1024 × 500. style : logo (icône et nom), center (centré), capture (avec l'écran de l'application). */
export async function banner(cfg, { style = 'logo', title, tagline, screen } = {}) {
  const W = 1024; const H = 500;
  const c = makeCanvas(W, H); const ctx = c.getContext('2d');
  const { a, b, ink } = brand(cfg);
  gradient(ctx, W, H, a, b);
  const name = title || cfg.appName || 'Mon application';
  const sub = ink === '#ffffff' ? 'rgba(255,255,255,0.82)' : 'rgba(20,21,26,0.72)';
  const ic = await appIcon(cfg, 512, 'squircle');
  const shadow = (fn) => { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = 36; ctx.shadowOffsetY = 14; fn(); ctx.restore(); };
  if (style === 'center') {
    shadow(() => ctx.drawImage(ic, W / 2 - 80, 60, 160, 160));
    fitText(ctx, name, { x: 80, y: 252, w: W - 160, h: 80, size: 62, lines: 1, align: 'center', color: ink });
    if (tagline) fitText(ctx, tagline, { x: 120, y: 340, w: W - 240, h: 100, size: 30, weight: 500, lines: 2, align: 'center', color: sub });
  } else if (style === 'capture' && screen) {
    shadow(() => ctx.drawImage(ic, 72, 84, 112, 112));
    const th = fitText(ctx, name, { x: 72, y: 220, w: 470, h: 140, size: 58, lines: 2, color: ink });
    if (tagline) fitText(ctx, tagline, { x: 72, y: 230 + th, w: 450, h: 120, size: 27, weight: 500, lines: 3, color: sub });
    // Téléphone incliné qui sort du cadre, comme sur les bannières des grandes applications.
    const img = await loadImage(screen);
    const pw = 300; const ph = pw * (img.height / img.width);
    ctx.save();
    ctx.translate(800, 270);
    ctx.rotate(-0.12);
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 20;
    ctx.fillStyle = '#0b0b0f';
    ctx.beginPath(); ctx.roundRect(-pw / 2 - 12, -ph * 0.32 - 12, pw + 24, ph + 24, 46); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.beginPath(); ctx.roundRect(-pw / 2, -ph * 0.32, pw, ph, 36); ctx.clip();
    ctx.drawImage(img, -pw / 2, -ph * 0.32, pw, ph);
    ctx.restore();
  } else {
    shadow(() => ctx.drawImage(ic, 92, 110, 280, 280));
    const th = fitText(ctx, name, { x: 430, y: 128, w: 520, h: 150, size: 66, lines: 2, color: ink });
    if (tagline) fitText(ctx, tagline, { x: 432, y: 146 + th, w: 500, h: 360 - th, size: 30, weight: 500, lines: 3, color: sub });
  }
  return canvasJpeg(c);
}

const css = (el, k) => getComputedStyle(el)[k];
const visibleColor = (c) => c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c);

/* Redessine l'écran de l'aperçu (barre d'état, onglets, bouton flottant, barre de gestes) dans un canvas,
 * avec à la place de la webview l'image capturée de la page. Les éléments du balisage sont de simples blocs
 * colorés, des icônes SVG et du texte : on les reproduit directement, à la définition demandée. */
export async function rasterScreen(screenEl, { scale, k, page, skip = '.ab-loadbar, .ab-drawer, .ab-onb, .ab-modal-prev' }) {
  const root = screenEl.getBoundingClientRect();
  const W = Math.round(screenEl.offsetWidth * k); const H = Math.round(screenEl.offsetHeight * k);
  const c = makeCanvas(W, H); const ctx = c.getContext('2d');
  const pos = (r) => ({ x: ((r.left - root.left) / scale) * k, y: ((r.top - root.top) / scale) * k, w: (r.width / scale) * k, h: (r.height / scale) * k });
  ctx.fillStyle = visibleColor(css(screenEl, 'backgroundColor')) ? css(screenEl, 'backgroundColor') : '#ffffff';
  ctx.fillRect(0, 0, W, H);
  const walk = async (el) => {
    if (el.matches && el.matches(skip)) return;
    if (css(el, 'display') === 'none' || css(el, 'visibility') === 'hidden') return;
    const r = pos(el.getBoundingClientRect());
    if (el.tagName === 'WEBVIEW' || el.classList.contains('ab-wv-box')) {
      if (page) { ctx.drawImage(page, r.x, r.y, r.w, r.h); return; }
    }
    const bg = css(el, 'backgroundColor');
    if (visibleColor(bg) && r.w && r.h && el !== screenEl) {
      ctx.save();
      ctx.globalAlpha = Number(css(el, 'opacity')) || 1;
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, Math.min(r.h / 2, ((parseFloat(css(el, 'borderTopLeftRadius')) || 0) / 1) * k));
      ctx.fill();
      ctx.restore();
    }
    if (el.tagName === 'svg' || el.tagName === 'SVG') {
      const color = css(el, 'color');
      const xml = new XMLSerializer().serializeToString(el).replace(/currentColor/g, color);
      const svg = xml.includes('xmlns=') ? xml : xml.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      try { const im = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`); ctx.drawImage(im, r.x, r.y, r.w, r.h); } catch { /* icône ignorée */ }
      return;
    }
    if (el.tagName === 'IMG' && el.complete && el.naturalWidth) { try { ctx.drawImage(el, r.x, r.y, r.w, r.h); } catch { /* image d'une autre origine */ } return; }
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.textContent.trim()) {
        const range = document.createRange(); range.selectNodeContents(n);
        const tr = pos(range.getBoundingClientRect());
        ctx.fillStyle = css(el, 'color');
        ctx.font = `${css(el, 'fontWeight')} ${parseFloat(css(el, 'fontSize')) * k}px ${css(el, 'fontFamily')}`;
        ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.fillText(n.textContent.trim(), tr.x, tr.y + tr.h / 2);
      } else if (n.nodeType === 1) await walk(n);
    }
  };
  for (const n of screenEl.children) await walk(n);
  return c;
}

/* Capture habillée 1080 × 1920 : fond aux couleurs de la marque, légende, appareil de l'aperçu avec l'écran. */
export async function framedShot(cfg, screen, { device, color, state, caption, bg = 'brand' } = {}) {
  const W = 1080; const H = 1920;
  const c = makeCanvas(W, H); const ctx = c.getContext('2d');
  const br = brand(cfg);
  const pal = { brand: [br.a, br.b], light: ['#f5f5f7', '#e4e4ea'], dark: ['#1b1c22', '#050507'] }[bg] || [br.a, br.b];
  gradient(ctx, W, H, pal[0], pal[1], 'down');
  const ink = bg === 'light' ? '#14151a' : bg === 'dark' ? '#ffffff' : br.ink;
  const top = caption ? 150 + fitText(ctx, caption, { x: 90, y: 120, w: W - 180, h: 300, size: 76, lines: 3, align: 'center', color: ink }) : 110;
  const u = layoutDevice(device, state, { framesOn: true, statusBar: false, skin: false, color, land: false });
  const s = Math.min((W * 0.8) / u.TW, (H - top - 70) / u.TH);
  const x = (W - u.TW * s) / 2; const y = top + 20;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  drawFrame(ctx, u, { px: s, shadow: true, screenFill: '#000' });
  ctx.save();
  ctx.beginPath();
  const [r0, r1, r2, r3] = u.sr;
  ctx.roundRect(u.screen.x, u.screen.y, u.W, u.H, [r0, r1, r2, r3]);
  ctx.clip();
  const img = screen instanceof HTMLCanvasElement ? screen : await loadImage(screen);
  // L'écran remplit la surface de l'appareil (recadrage centré si les proportions diffèrent).
  const k = Math.max(u.W / img.width, u.H / img.height);
  ctx.drawImage(img, u.screen.x + (u.W - img.width * k) / 2, u.screen.y, img.width * k, img.height * k);
  ctx.restore();
  ctx.translate(u.screen.x, u.screen.y);
  drawScreenOverlay(ctx, u);
  ctx.restore();
  return canvasJpeg(c);
}

/* Écran seul : Google Play refuse un grand côté de plus du double du petit (les écrans 20:9 dépassent) :
 * on garde le haut de l'écran au format 9:18. */
export async function plainShot(screen) {
  const img = screen instanceof HTMLCanvasElement ? screen : await loadImage(screen);
  let w = img.width; let h = img.height;
  const sw = w; const sh = Math.min(h, w * 2);
  const k = Math.min(1, 3840 / Math.max(sw, sh));
  w = Math.round(sw * k); h = Math.round(sh * k);
  if (Math.min(w, h) < 320) throw new Error('Image trop petite : 320 pixels au moins de chaque côté.');
  const c = makeCanvas(w, h);
  c.getContext('2d').drawImage(img, 0, 0, sw, sh, 0, 0, w, h);
  return canvasJpeg(c);
}

/* Image importée remise aux dimensions d'un emplacement (recadrage centré), sans transparence. */
export async function fitImage(src, w, h, { png = false } = {}) {
  const img = await loadImage(src);
  const c = makeCanvas(w, h); const ctx = c.getContext('2d');
  if (!png) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
  const k = Math.max(w / img.width, h / img.height);
  ctx.drawImage(img, (w - img.width * k) / 2, (h - img.height * k) / 2, img.width * k, img.height * k);
  return png ? canvasPng(c) : canvasJpeg(c);
}

/* Capture de tablette importée : gardée à sa taille si elle respecte les règles, sinon refusée avec la raison. */
export async function tabletShot(src) {
  const img = await loadImage(src);
  const lo = Math.min(img.width, img.height); const hi = Math.max(img.width, img.height);
  if (lo < 1080) throw new Error(`Capture de tablette trop petite (${img.width} × ${img.height}) : 1080 pixels au moins de chaque côté.`);
  if (hi > lo * 2) throw new Error('Capture de tablette trop allongée : le grand côté ne doit pas dépasser le double du petit.');
  const k = Math.min(1, 3840 / hi);
  const c = makeCanvas(Math.round(img.width * k), Math.round(img.height * k));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return canvasJpeg(c);
}
