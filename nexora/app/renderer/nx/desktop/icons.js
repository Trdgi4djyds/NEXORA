// NEXORA #023 : icônes et images des logiciels de bureau (Desktop Builder), dessinées dans la page.
// - icon.ico : 16 à 48 px en bitmap 32 bits (compatibilité de l'explorateur, de la barre des tâches et de NSIS),
//   64 à 256 px en PNG, comme les icônes des logiciels de Windows ;
// - icon.png 1024 px (macOS et Linux), 256 px (fenêtre, zone de notification, pages d'état) ;
// - installerSidebar.bmp 164 × 314 (première et dernière pages de l'assistant d'installation, format imposé par NSIS).
import { loadImage, makeCanvas, canvasBytes, inkOn, mixHex } from '../core.js';

export const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];

export function initials(name) {
  const words = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[A-Za-z0-9]+/g) || ['A'];
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 1)).toUpperCase();
}

const cache = new Map();
async function sourceImage(src) {
  if (!src) return null;
  if (!cache.has(src)) cache.set(src, loadImage(src).catch(() => null));
  return cache.get(src);
}

function shapePath(ctx, s, shape) {
  ctx.beginPath();
  if (shape === 'circle') ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
  else if (shape === 'rounded') ctx.roundRect(0, 0, s, s, s * 0.22);
  else ctx.rect(0, 0, s, s);
}

/** Icône à une grande taille (référence), avant réduction. */
function drawMaster(icon, img, name, s = 1024) {
  const c = makeCanvas(s, s);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  const shape = icon.shape || (img ? 'none' : 'rounded');
  const bg = icon.bg || '#2563eb';
  if (shape !== 'none') {
    shapePath(ctx, s, shape);
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, mixHex(bg, '#ffffff', 0.12));
    g.addColorStop(1, mixHex(bg, '#000000', 0.12));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    shapePath(ctx, s, shape);
    ctx.clip();
  }
  const pad = (shape === 'none' ? Number(icon.padding) || 0 : Math.max(12, Number(icon.padding) || 16)) / 100;
  const box = s * (1 - pad * 2);
  if (img) {
    const iw = img.naturalWidth || img.width || 1;
    const ih = img.naturalHeight || img.height || 1;
    const k = Math.min(box / iw, box / ih);
    ctx.drawImage(img, (s - iw * k) / 2, (s - ih * k) / 2, iw * k, ih * k);
  } else {
    const text = (icon.letter || initials(name)).slice(0, 2);
    ctx.fillStyle = shape === 'none' ? bg : inkOn(bg);
    ctx.font = `700 ${Math.round(s * (text.length > 1 ? 0.42 : 0.56))}px Inter, "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, s / 2, s / 2 + s * 0.03);
  }
  if (shape !== 'none') ctx.restore();
  return c;
}

/** Réduction par moitiés successives : les petites tailles (16, 24, 32 px) restent nettes. */
function downscale(src, size) {
  let cur = src;
  while (cur.width / 2 >= size) {
    const n = makeCanvas(Math.max(size, Math.round(cur.width / 2)), Math.max(size, Math.round(cur.height / 2)));
    const x = n.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(cur, 0, 0, n.width, n.height);
    cur = n;
  }
  if (cur.width === size) return cur;
  const out = makeCanvas(size, size);
  const x = out.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(cur, 0, 0, size, size);
  return out;
}

export async function iconCanvases(icon = {}, name = '', sizes = [256]) {
  const img = await sourceImage(icon.image);
  const master = drawMaster(icon, img, name);
  return Object.fromEntries(sizes.map((s) => [s, s === 1024 ? master : downscale(master, s)]));
}

export async function iconDataUrl(icon, name, size = 128) {
  const c = (await iconCanvases(icon, name, [size]))[size];
  return c.toDataURL('image/png');
}

// Entrée bitmap d'un fichier .ico : en-tête BITMAPINFOHEADER, pixels BGRA de bas en haut, masque 1 bit.
function dibEntry(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const px = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const maskRow = Math.ceil(w / 32) * 4;
  const size = 40 + w * h * 4 + maskRow * h;
  const buf = new Uint8Array(size);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, 40, true);
  dv.setInt32(4, w, true);
  dv.setInt32(8, h * 2, true);
  dv.setUint16(12, 1, true);
  dv.setUint16(14, 32, true);
  dv.setUint32(20, w * h * 4 + maskRow * h, true);
  let o = 40;
  for (let y = h - 1; y >= 0; y--) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      buf[o++] = px[i + 2]; buf[o++] = px[i + 1]; buf[o++] = px[i]; buf[o++] = px[i + 3];
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] < 128) buf[o + (x >> 3)] |= 0x80 >> (x & 7);
    o += maskRow;
  }
  return buf;
}

export async function icoBytes(icon, name) {
  const cv = await iconCanvases(icon, name, ICO_SIZES);
  const parts = [];
  for (const s of ICO_SIZES) parts.push(s <= 48 ? dibEntry(cv[s]) : await canvasBytes(cv[s], 'image/png'));
  const head = new Uint8Array(6 + 16 * parts.length);
  const dv = new DataView(head.buffer);
  dv.setUint16(2, 1, true);
  dv.setUint16(4, parts.length, true);
  let off = head.length;
  ICO_SIZES.forEach((s, i) => {
    const e = 6 + 16 * i;
    head[e] = s >= 256 ? 0 : s;
    head[e + 1] = s >= 256 ? 0 : s;
    dv.setUint16(e + 4, 1, true);
    dv.setUint16(e + 6, 32, true);
    dv.setUint32(e + 8, parts[i].length, true);
    dv.setUint32(e + 12, off, true);
    off += parts[i].length;
  });
  const out = new Uint8Array(off);
  out.set(head, 0);
  let at = head.length;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

// Bitmap 24 bits (format demandé par l'assistant d'installation NSIS).
function bmp24(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const px = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const row = Math.ceil((w * 3) / 4) * 4;
  const buf = new Uint8Array(54 + row * h);
  const dv = new DataView(buf.buffer);
  buf[0] = 0x42; buf[1] = 0x4d;
  dv.setUint32(2, buf.length, true);
  dv.setUint32(10, 54, true);
  dv.setUint32(14, 40, true);
  dv.setInt32(18, w, true);
  dv.setInt32(22, h, true);
  dv.setUint16(26, 1, true);
  dv.setUint16(28, 24, true);
  dv.setUint32(34, row * h, true);
  dv.setInt32(38, 2835, true);
  dv.setInt32(42, 2835, true);
  for (let y = 0; y < h; y++) {
    let o = 54 + (h - 1 - y) * row;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      buf[o++] = px[i + 2]; buf[o++] = px[i + 1]; buf[o++] = px[i];
    }
  }
  return buf;
}

function wrap(ctx, text, max, lines = 3) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const out = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= max || !cur) cur = next;
    else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  if (out.length > lines) { out.length = lines; out[lines - 1] = `${out[lines - 1].replace(/.{0,2}$/, '')}…`; }
  return out;
}

/** Image de l'assistant d'installation : couleur du logiciel, icône, nom, version et éditeur. */
export async function sidebarCanvas(app) {
  const w = 164;
  const h = 314;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const base = (app.window && app.window.accent) || (app.icon && app.icon.bg) || '#2563eb';
  const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
  g.addColorStop(0, mixHex(base, '#ffffff', 0.08));
  g.addColorStop(1, mixHex(base, '#000000', 0.38));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Halo discret derrière l'icône.
  const r = ctx.createRadialGradient(w / 2, 96, 6, w / 2, 96, 96);
  r.addColorStop(0, 'rgba(255,255,255,0.28)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, w, h);
  const ink = inkOn(mixHex(base, '#000000', 0.2));
  const icon = (await iconCanvases(app.icon || {}, app.name, [256]))[256];
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 5;
  // Icône transparente sur fond coloré : plaque blanche arrondie pour qu'elle reste lisible.
  if ((app.icon && app.icon.shape) === 'none' || (app.icon && app.icon.image && !app.icon.shape)) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(w / 2 - 44, 52, 88, 88, 20);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.drawImage(icon, w / 2 - 34, 62, 68, 68);
  } else ctx.drawImage(icon, w / 2 - 44, 52, 88, 88);
  ctx.restore();
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = '700 17px "Segoe UI", Inter, system-ui, sans-serif';
  const lines = wrap(ctx, app.name || 'Logiciel', w - 24);
  lines.forEach((l, i) => ctx.fillText(l, w / 2, 160 + i * 22));
  ctx.globalAlpha = 0.82;
  ctx.font = '500 11.5px "Segoe UI", Inter, system-ui, sans-serif';
  ctx.fillText(`Version ${app.version || '1.0.0'}`, w / 2, 166 + lines.length * 22);
  if (app.publisher) {
    ctx.globalAlpha = 0.7;
    ctx.textBaseline = 'bottom';
    wrap(ctx, app.publisher, w - 24, 2).reverse().forEach((l, i) => ctx.fillText(l, w / 2, h - 16 - i * 15));
  }
  ctx.globalAlpha = 1;
  return c;
}

/** Toutes les images nécessaires à la construction. */
export async function buildAssets(app) {
  const cv = await iconCanvases(app.icon || {}, app.name, [1024, 256]);
  return {
    ico: await icoBytes(app.icon || {}, app.name),
    png: await canvasBytes(cv[1024], 'image/png'),
    png256: await canvasBytes(cv[256], 'image/png'),
    sidebar: bmp24(await sidebarCanvas(app)),
  };
}
