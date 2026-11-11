// NEXORA #011 : socle commun des fonctions ajoutées à NEX-DESIGN, au Studio 3D & Motion et aux Maquettes.
// Réutilise les briques de l'interface (notifications, menus, fenêtres, icônes, réglages, enregistrement).
import { a as toastRaw, b as popoverRaw, c as closePopoverRaw, e as sheetRaw, f as closeSheetRaw } from '../dist/chunks/chunk-6ZWS5EFO.js';
import { a as ICONS, b as iconRaw } from '../dist/chunks/chunk-S4I2LXHS.js';
import { a as settings, d as saveSettingsRaw } from '../dist/chunks/chunk-GKSXEY5K.js';
import { a as api } from '../dist/chunks/chunk-V3CX37JL.js';
import { a as state } from '../dist/chunks/chunk-XJMNRA7U.js';
import { b as saveImageRaw, c as saveBytesRaw } from '../dist/chunks/chunk-QGASN62E.js';

export { api, state, settings };

// ---------- Petits utilitaires ----------
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const fmt = (n, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toString().replace('.', ',');
export const saveSettings = () => saveSettingsRaw();
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// ---------- Icônes : on complète le jeu de NEXORA dans le même style (trait 1,6, grille 24) ----------
const MORE_ICONS = {
  nxLasso: '<path d="M12 5c-4.7 0-8 2-8 4.6 0 2.4 2.9 4.2 7 4.5"/><path d="M12 5c4.7 0 8 2 8 4.6 0 2.2-2.4 3.9-6 4.4"/><circle cx="12.5" cy="15.5" r="1.8"/><path d="M11.5 17.2c-.6 1.6-.1 3 1.5 3.8"/>',
  nxWand: '<path d="m4 20 10-10"/><path d="m13 7 1-3 1 3 3 1-3 1-1 3-1-3-3-1Z"/><path d="M19 13.5 19.5 15l1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5Z"/>',
  nxBrush: '<path d="M19.5 4.5 11 13"/><path d="M11 13c-2 0-3.5 1.4-3.5 3.3 0 1.4-1 2.4-3 2.7 4.3 1.6 8.5.3 8.5-3.6Z"/><path d="m14.5 9.5 1.8 1.8"/>',
  nxEraser: '<path d="m7 20 13-13-4-4L3 16l4 4Z"/><path d="M7 20h13"/><path d="m9.5 9.5 5 5"/>',
  nxStamp: '<path d="M9 13V9.5a3 3 0 1 1 6 0V13"/><path d="M5 13h14v3H5z"/><path d="M6 19.5h12"/>',
  nxHeal: '<rect x="3.5" y="9" width="17" height="6" rx="3" transform="rotate(-45 12 12)"/><path d="M11 11h.01M13 13h.01M11 13h.01M13 11h.01"/>',
  nxCrop: '<path d="M6.5 3v13.5H20"/><path d="M3 6.5h13.5V20"/>',
  nxNodes: '<path d="M5 18c2-8 5-12 14-13"/><rect x="3.5" y="16.5" width="3" height="3" rx=".5"/><rect x="17.5" y="3.5" width="3" height="3" rx=".5"/><circle cx="10" cy="8.5" r="1.4"/><path d="M10 8.5 6.5 5M10 8.5l3.5 3.5"/>',
  nxScissors: '<circle cx="6.5" cy="7" r="2.5"/><circle cx="6.5" cy="17" r="2.5"/><path d="M8.6 8.4 20 17M8.6 15.6 20 7"/>',
  nxBlend: '<circle cx="6" cy="12" r="3"/><circle cx="18" cy="12" r="3"/><path d="M9.5 12h1M13.5 12h1"/><circle cx="12" cy="12" r=".6"/>',
  nxRepeat: '<circle cx="12" cy="12" r="2"/><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="19" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/><circle cx="7" cy="7" r="1.2"/><circle cx="17" cy="17" r="1.2"/><circle cx="17" cy="7" r="1.2"/><circle cx="7" cy="17" r="1.2"/>',
  nxMirror: '<path d="M12 3v18" stroke-dasharray="2 2"/><path d="M9 6 4 18h5Z"/><path d="m15 6 5 12h-5Z"/>',
  nxTrace: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M7 16c1.5-4 3-6 5-6s2.5 3 5 2"/><circle cx="8.5" cy="8.5" r="1.3"/>',
  nxCurve: '<path d="M3 19C9 19 9 5 21 5"/><circle cx="3" cy="19" r="1.3"/><circle cx="21" cy="5" r="1.3"/><path d="M3 19h6M21 5h-6" stroke-dasharray="2 2"/>',
  nxComment: '<path d="M4 5.5h16v10H9l-5 4Z"/><path d="M8 9.5h8M8 12.5h5"/>',
  nxHistory: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/><path d="M12 8v4l3 2"/>',
  nxComponent: '<path d="m12 3 4 4-4 4-4-4Z"/><path d="m12 13 4 4-4 4-4-4Z"/><path d="m7 8 4 4-4 4-4-4Z"/><path d="m17 8 4 4-4 4-4-4Z"/>',
  nxChart: '<path d="M4 20V4"/><path d="M4 20h16"/><rect x="7" y="11" width="3" height="6"/><rect x="12" y="7" width="3" height="10"/><rect x="17" y="13" width="3" height="4"/>',
  nxTable: '<rect x="3.5" y="4.5" width="17" height="15" rx="1.5"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 4.5v15M15 4.5v15"/>',
  nxQr: '<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/>',
  nxSticker: '<path d="M20 12a8 8 0 1 1-8-8h8Z"/><path d="M20 12h-5a3 3 0 0 1-3-3V4"/>',
  nxResize: '<rect x="3.5" y="9.5" width="11" height="11" rx="1.5"/><path d="M13 4h7v7"/><path d="M20 4l-7 7"/>',
  nxParticles: '<circle cx="6" cy="6" r="1.3"/><circle cx="17" cy="5" r="1"/><circle cx="12" cy="11" r="1.6"/><circle cx="5" cy="16" r="1"/><circle cx="18" cy="15" r="1.4"/><circle cx="11" cy="19" r="1"/>',
  nxPhysics: '<circle cx="12" cy="7" r="3"/><path d="M4 20h16"/><path d="M12 10v3M10 15.5l2-2 2 2" stroke-dasharray="1.5 1.5"/>',
  nxPath: '<path d="M4 18c3-6 6 2 9-4s5-6 7-8"/><circle cx="4" cy="18" r="1.4"/><circle cx="20" cy="6" r="1.4"/><circle cx="13" cy="14" r="1.2"/>',
  nxAperture: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5 15 12M20.4 10 12 15M17 19 9.5 13.5M7 19.2 9 9.5M3.6 10.5 12 9"/>',
  nxGrade: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" stroke="none" opacity=".35"/>',
  nxCut: '<path d="M12 3v18"/><path d="M5 8h4M5 16h4M15 8h4M15 16h4"/>',
  nxTransition: '<rect x="3" y="6" width="8" height="12" rx="1.5"/><rect x="13" y="6" width="8" height="12" rx="1.5" opacity=".6"/><path d="m9 12 6 0M13 10l2 2-2 2"/>',
  nxSpeed: '<path d="M4.5 17a8 8 0 1 1 15 0"/><path d="m12 13 4-5"/><circle cx="12" cy="13.5" r="1.2"/>',
  nxBeat: '<path d="M3 12h3l2-6 3 12 3-9 2 3h5"/>',
  nxSubs: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M6.5 14.5h4M12.5 14.5h5M6.5 11h8"/>',
  nxInteract: '<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M12 10.5V9a1.5 1.5 0 0 1 3 0v2"/><path d="M15 11a1.5 1.5 0 0 1 3 0v3.5A5.5 5.5 0 0 1 12.5 20h-.8a5 5 0 0 1-3.9-1.9L5 14.5a1.5 1.5 0 0 1 2.2-2L9 14"/>',
  nxMaterial: '<circle cx="12" cy="12" r="8.5"/><path d="M5 9c4 2 10 2 14 0M5 15c4-2 10-2 14 0"/>',
  nxSun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  nxCombine: '<circle cx="9" cy="12" r="5.5"/><circle cx="15" cy="12" r="5.5"/>',
  nxTurntable: '<ellipse cx="12" cy="17" rx="8" ry="3"/><path d="M12 14V5"/><path d="M8.5 8.5a5 2 0 0 0 7 0"/><path d="m15 7.2.7 1.4-1.6.2"/>',
  nxPalette: '<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.3 0 1.9-.9 1.6-2-.4-1.4.5-2.5 2-2.5H18a2.5 2.5 0 0 0 2.5-2.5A8.5 8.5 0 0 0 12 3.5Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/>',
  nxBrand: '<path d="M4 7.5 12 3.5l8 4v9l-8 4-8-4Z"/><path d="m4 7.5 8 4 8-4M12 11.5v9"/>',
  nxZip: '<path d="M6 3.5h8l4 4v13H6Z"/><path d="M11 3.5v2h2v2h-2v2h2v2h-2"/><rect x="10" y="13" width="3" height="3" rx=".5"/>',
  nxRuler2: '<path d="M3 8h18v8H3Z"/><path d="M7 8v3M11 8v4M15 8v3M19 8v4"/>',
  nxGridCols: '<rect x="3.5" y="4" width="17" height="16" rx="1.5"/><path d="M8 4v16M12 4v16M16 4v16" stroke-dasharray="2 2"/>',
  nxDistort: '<path d="M4 6c5 3 11-3 16 0v12c-5-3-11 3-16 0Z"/>',
  nxOffset: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/><rect x="3.5" y="3.5" width="17" height="17" rx="4" stroke-dasharray="2 2"/>',
  nxSimplify: '<path d="M3 16 7 9l3 5 4-8 3 6 4-4" opacity=".45"/><path d="M3 16c4-6 7-6 9-3s6-3 9-7"/>',
  nxJoin: '<path d="M4 17c2-6 4-9 7-9"/><path d="M13 8c3 0 5 3 7 9"/><circle cx="12" cy="8" r="1.5"/>',
  nxPresent: '<rect x="3.5" y="4.5" width="17" height="11" rx="1.5"/><path d="M12 15.5v4M8.5 19.5h7"/><path d="m10.5 8 3.5 2-3.5 2Z"/>',
  nxAnimate: '<path d="M4 18 9 6l3 7 2-4 6 9Z" opacity=".4"/><path d="M14 4h6v6"/><path d="M20 4 13 11"/>',
  nxCloud2: '<path d="M7 18h10a4 4 0 0 0 .6-8 6 6 0 0 0-11.4 1.5A3.3 3.3 0 0 0 7 18Z"/><path d="M12 15v-5M9.8 12.2 12 10l2.2 2.2"/>',
  nxUsers: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5"/><circle cx="17" cy="9.5" r="2.4"/><path d="M15.8 14.2c2.4-.4 4.2 1.1 4.7 4"/>',
  nxFrameImg: '<rect x="3.5" y="3.5" width="17" height="17" rx="8.5"/><path d="m6 16 4-4 3 3 2-2 3 3"/>',
  nxVignette: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><ellipse cx="12" cy="12" rx="5.5" ry="4" stroke-dasharray="2 2"/>',
  nxShadowLeaf: '<path d="M5 19C5 10 10 5 19 5c0 9-5 14-14 14Z"/><path d="M5 19 14 10"/>',
  nxPointer: '<path d="M6 3.5 18 13l-5.5.8L9.5 19Z"/>',
  nxTee: '<path d="M8.5 4 4 6.5l2 4 2-1V20h8V9.5l2 1 2-4L15.5 4a3.5 3.5 0 0 1-7 0Z"/>',
  nxMug: '<path d="M5 6h11v10a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3Z"/><path d="M16 9h1.5a2.5 2.5 0 0 1 0 5H16"/>',
  nxBox: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  nxCard: '<rect x="3" y="6" width="18" height="12" rx="1.5"/><path d="M6.5 10h6M6.5 13h4"/>',
  nxPoster: '<rect x="6" y="3" width="12" height="18" rx="1"/><path d="M9 7h6M9 10h4"/><path d="m8 18 3-3 2 2 3-3"/>',
  nxHandPhone: '<rect x="8" y="3" width="8" height="13" rx="1.6"/><path d="M6 21c0-3 .5-5 2-7l1-1M18 21c0-2-.5-4-2-6"/>',
  nxDev: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4"/><path d="m13.5 5-3 14"/>',
  nxWorld: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.5 3.5 5.5 3.5 8.5s-1 6-3.5 8.5c-2.5-2.5-3.5-5.5-3.5-8.5s1-6 3.5-8.5Z"/>',
  nxQuality: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M7.5 15V9l2.5 3 2.5-3v6M15 9h2.5v6H15"/>',
  nxFolder2: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/><path d="M9 13h6"/>',
  nxSolo: '<circle cx="12" cy="12" r="3.5"/><circle cx="12" cy="12" r="8.5" stroke-dasharray="2 2.5"/>',
  nxMarker: '<path d="M7 3.5h10v11l-5 5-5-5Z"/>',
  nxTag: '<path d="M3.5 12.5v-8h8l9 9-8 8Z"/><circle cx="8" cy="8" r="1.4"/>'
};
// NEXORA #043 : les icônes Streamline Flex déjà posées (nx/icons/flex.js) ne sont pas remplacées.
for (const [k, v] of Object.entries(MORE_ICONS)) if (!ICONS[k]) ICONS[k] = v;
export const ico = (name, size = 15, cls = '') => iconRaw(name, size, cls);

// ---------- Interface ----------
export const toast = (msg, opts) => toastRaw(msg, opts);
export const busy = (msg) => toastRaw(msg, { busy: true, sticky: true });
export const popover = (anchor, html, opts) => popoverRaw(anchor, html, opts);
export const closePopover = () => closePopoverRaw();
export const sheet = (id, html, opts) => sheetRaw(id, html, opts);
export const closeSheet = (id) => closeSheetRaw(id);

// Fenêtre standard de NEXORA (en-tête, corps, pied).
export function sheetHtml({ icon = 'sparkle', title, sub = '', body = '', foot = '', go = '', goIcon = 'check' }) {
  return `<div class="sheet-head"><span class="sheet-icon">${ico(icon, 22)}</span><div><h2>${esc(title)}</h2>${sub ? `<p>${sub}</p>` : ''}</div></div>
    <div class="sheet-body nx-sheet-body">${body}</div>
    <div class="sheet-foot">${foot}<span class="grow"></span><button class="btn" data-sheet="close">Annuler</button>${go ? `<button class="btn primary" data-nx-go>${ico(goIcon, 14)}<span>${esc(go)}</span></button>` : ''}</div>`;
}

// Menu de choix rapide (popover) qui renvoie la valeur choisie.
export function menu(anchor, title, items, { width = 260, align = 'start', above = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const pop = popover(anchor, `${title ? `<div class="pop-title">${esc(title)}</div>` : ''}${items.map((it) => it === '-' ? '<div class="menu-sep"></div>' : it.head ? `<div class="pop-sub">${esc(it.head)}</div>` : `<button class="menu-item st-cm" data-nxm="${esc(it.id)}" ${it.disabled ? 'disabled' : ''}>${it.icon ? ico(it.icon, 15) : ''}<span>${esc(it.label)}${it.sub ? `<small class="nx-msub">${esc(it.sub)}</small>` : ''}</span>${it.kbd ? `<kbd>${esc(it.kbd)}</kbd>` : ''}</button>`).join('')}`, { width, align, above, onClose: () => { if (!done) resolve(null); } });
    if (!pop) { resolve(null); return; }
    pop.onclick = (e) => {
      const b = e.target.closest('[data-nxm]');
      if (!b || b.disabled) return;
      done = true;
      closePopover();
      resolve(b.dataset.nxm);
    };
  });
}

// Demande un texte dans une petite fenêtre.
export function prompt(title, { label = '', value = '', icon = 'text', placeholder = '', multiline = false, go = 'Valider' } = {}) {
  return new Promise((resolve) => {
    let ok = false;
    const s = sheet('nx-prompt', sheetHtml({ icon, title, body: `${label ? `<div class="field-label">${esc(label)}</div>` : ''}${multiline ? `<textarea class="input nx-ta" data-autofocus rows="6" placeholder="${esc(placeholder)}">${esc(value)}</textarea>` : `<input class="input" data-autofocus value="${esc(value)}" placeholder="${esc(placeholder)}">`}`, go }), { onClose: () => { if (!ok) resolve(null); } });
    const field = s.querySelector('input,textarea');
    if (field) { field.focus(); if (!multiline) field.select(); }
    const finish = () => { ok = true; const v = field.value; closeSheet('nx-prompt'); resolve(v); };
    s.onclick = (e) => { if (e.target.closest('[data-nx-go]')) finish(); };
    s.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter' && !multiline) { e.preventDefault(); finish(); } };
  });
}

// ---------- Fichiers ----------
export async function pickFile({ title = 'Choisir un fichier', name = 'Fichiers', extensions = ['png', 'jpg', 'jpeg', 'webp'], as = 'dataUrl' } = {}) {
  try {
    const r = await api.invoke('dialog:open-file', { title, filters: [{ name, extensions }], asDataUrl: as === 'dataUrl', asBytes: as === 'bytes' });
    if (!r || (!r.dataUrl && !r.data)) return null;
    if (r.data && !(r.data instanceof Uint8Array)) r.data = new Uint8Array(r.data);
    return r;
  } catch (e) {
    toast(e.message || String(e), { kind: 'bad' });
    return null;
  }
}

export async function saveBytes(bytes, { name, ext, kind = 'photo', project = 'NEXORA', saveAs = false, quiet = false } = {}) {
  try {
    const f = await saveBytesRaw(bytes, { kind, project, name, ext, saveAs });
    if (f && !quiet) toast(`Fichier enregistré : ${name}.${ext}`, { action: 'Afficher', onAction: () => api.invoke('shell:reveal', f) });
    if (f) state.lastFile = f;
    return f;
  } catch (e) {
    toast(`L’enregistrement a échoué : ${e.message || e}`, { kind: 'bad' });
    return null;
  }
}

export async function saveCanvas(canvas, { format = 'png', name = 'Image', project = 'NEXORA', background = '#ffffff', quiet = false } = {}) {
  try {
    const f = await saveImageRaw(canvas, { format, name, project, background });
    if (f && !quiet) toast(`Image enregistrée : ${canvas.width} × ${canvas.height} px`, { action: 'Afficher', onAction: () => api.invoke('shell:reveal', f) });
    if (f) state.lastFile = f;
    return f;
  } catch (e) {
    toast(`L’enregistrement a échoué : ${e.message || e}`, { kind: 'bad' });
    return null;
  }
}

export const canvasBlob = (c, type = 'image/png', q) => new Promise((r) => c.toBlob(r, type, q));
export async function canvasBytes(c, type = 'image/png', q) {
  const b = await canvasBlob(c, type, q);
  return new Uint8Array(await b.arrayBuffer());
}
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Image illisible.'));
    i.src = src;
  });
}
export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
export function cloneCanvas(src) {
  const c = makeCanvas(src.naturalWidth || src.width, src.naturalHeight || src.height);
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}
export function dataUrlBytes(url) {
  const b = atob(String(url).split(',')[1] || '');
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}
export function bytesB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
  return btoa(s);
}
export const safeName = (s) => String(s || 'fichier').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'fichier';

// ---------- Archive ZIP (méthode « stockée », sans dépendance) ----------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(d) {
  let c = 0xffffffff;
  for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function zip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const used = new Set();
  for (const f of files) {
    let name = f.name;
    for (let k = 2; used.has(name.toLowerCase()); k++) name = f.name.replace(/(\.[^.]+)?$/, ` (${k})$1`);
    used.add(name.toLowerCase());
    const nb = enc.encode(name);
    const data = f.data instanceof Uint8Array ? f.data : enc.encode(String(f.data));
    const crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true);
    h.setUint32(22, data.length, true); h.setUint16(26, nb.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), nb, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true); c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nb.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), nb);
    offset += 30 + nb.length + data.length;
  }
  const csize = central.reduce((a, p) => a + p.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, csize, true); e.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)];
  const out = new Uint8Array(all.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}

// ---------- GIF animé (palette commune par médiane, compression LZW) ----------
function buildPalette(frames, max = 256) {
  const samples = [];
  for (const f of frames) {
    const d = f.data;
    const step = Math.max(4, Math.floor(d.length / 4 / (12000 / frames.length)) * 4);
    for (let i = 0; i < d.length; i += step) if (d[i + 3] > 127) samples.push([d[i], d[i + 1], d[i + 2]]);
  }
  if (!samples.length) samples.push([0, 0, 0]);
  let boxes = [samples];
  while (boxes.length < max - 1) {
    let bi = -1; let best = -1; let ch = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255; let hi = 0;
        for (const p of b) { if (p[c] < lo) lo = p[c]; if (p[c] > hi) hi = p[c]; }
        if (hi - lo > best) { best = hi - lo; bi = i; ch = c; }
      }
    });
    if (bi < 0 || best <= 0) break;
    const b = boxes[bi].sort((x, y) => x[ch] - y[ch]);
    const m = b.length >> 1;
    boxes.splice(bi, 1, b.slice(0, m), b.slice(m));
  }
  const pal = boxes.map((b) => { const s = [0, 0, 0]; for (const p of b) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; } return s.map((v) => Math.round(v / b.length)); });
  while (pal.length < max) pal.push([0, 0, 0]);
  return pal;
}
function lzw(indices, minSize) {
  const out = [];
  let cur = 0; let bits = 0;
  const emit = (code, size) => { cur |= code << bits; bits += size; while (bits >= 8) { out.push(cur & 255); cur >>= 8; bits -= 8; } };
  const clear = 1 << minSize; const eoi = clear + 1;
  let size = minSize + 1; let next = eoi + 1;
  let dict = new Map();
  emit(clear, size);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = prefix * 4096 + k;
    const hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    emit(prefix, size);
    if (next < 4096) { dict.set(key, next++); if (next > (1 << size) && size < 12) size++; } else { emit(clear, size); dict = new Map(); size = minSize + 1; next = eoi + 1; }
    prefix = k;
  }
  emit(prefix, size); emit(eoi, size);
  if (bits > 0) out.push(cur & 255);
  return out;
}
export function encodeGif(frames, { delay = 66, loop = true, transparent = false } = {}) {
  const w = frames[0].width; const h = frames[0].height;
  const pal = buildPalette(frames, transparent ? 255 : 256);
  if (transparent) pal.push([0, 0, 0]);
  const tIdx = transparent ? 255 : -1;
  const cache = new Map();
  const nearest = (r, g, b) => {
    const key = (r >> 2) << 12 | (g >> 2) << 6 | (b >> 2);
    let v = cache.get(key);
    if (v !== undefined) return v;
    let bd = 1e9; v = 0;
    for (let i = 0; i < (transparent ? 255 : 256); i++) { const p = pal[i]; const d = (p[0] - r) ** 2 * 2 + (p[1] - g) ** 2 * 4 + (p[2] - b) ** 2 * 3; if (d < bd) { bd = d; v = i; } }
    cache.set(key, v);
    return v;
  };
  const bytes = [];
  const push = (...a) => { for (const x of a) bytes.push(x); };
  const word = (v) => push(v & 255, (v >> 8) & 255);
  push(...'GIF89a'.split('').map((c) => c.charCodeAt(0)));
  word(w); word(h); push(0xf7, 0, 0);
  for (const p of pal) push(p[0], p[1], p[2]);
  if (loop) push(0x21, 0xff, 11, ...'NETSCAPE2.0'.split('').map((c) => c.charCodeAt(0)), 3, 1, 0, 0, 0);
  for (const f of frames) {
    push(0x21, 0xf9, 4, transparent ? 0x09 : 0x04); word(Math.round(delay / 10)); push(transparent ? tIdx : 0, 0);
    push(0x2c); word(0); word(0); word(w); word(h); push(0);
    const d = f.data; const idx = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) idx[j] = transparent && d[i + 3] < 128 ? tIdx : nearest(d[i], d[i + 1], d[i + 2]);
    push(8);
    const data = lzw(idx, 8);
    for (let i = 0; i < data.length; i += 255) { const n = Math.min(255, data.length - i); push(n); for (let k = 0; k < n; k++) bytes.push(data[i + k]); }
    push(0);
  }
  push(0x3b);
  return new Uint8Array(bytes);
}

// ---------- Couleurs ----------
export function hexRgb(hex) {
  let h = String(hex || '#000').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16) || 0;
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
export const rgbHex = (r, g, b) => `#${[r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
export function mixHex(a, b, t) {
  const x = hexRgb(a); const y = hexRgb(b);
  return rgbHex(lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t));
}
export function luminance(hex) {
  const [r, g, b] = hexRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const inkOn = (hex) => luminance(hex) > 0.4 ? '#14151a' : '#ffffff';
export function hslHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbHex(f(0) * 255, f(8) * 255, f(4) * 255);
}
export function hexHsl(hex) {
  let [r, g, b] = hexRgb(hex).map((v) => v / 255);
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const l = (mx + mn) / 2;
  let h = 0; let s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}
// Couleurs dominantes d'une image (boîtes médianes sur un échantillon).
export function dominantColors(src, n = 5) {
  const c = makeCanvas(64, 64);
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, 0, 0, 64, 64);
  const pal = buildPalette([x.getImageData(0, 0, 64, 64)], Math.max(2, n));
  const uniq = [];
  for (const p of pal) { const hx = rgbHex(...p); if (!uniq.some((u) => Math.abs(luminance(u) - luminance(hx)) < 0.02 && mixHex(u, hx, 0.5) === u)) uniq.push(hx); }
  return uniq.slice(0, n);
}

// ---------- Traitements d'image (sélections, retouche) ----------
// Masque par remplissage (baguette magique) : tolérance 0-255, contigu ou global.
export function floodMask(img, x, y, tol = 32, contiguous = true) {
  const { width: w, height: h, data: d } = img;
  const m = new Uint8Array(w * h);
  x = clamp(Math.round(x), 0, w - 1); y = clamp(Math.round(y), 0, h - 1);
  const i0 = (y * w + x) * 4;
  const r0 = d[i0]; const g0 = d[i0 + 1]; const b0 = d[i0 + 2]; const a0 = d[i0 + 3];
  const t2 = tol * tol * 3;
  const near = (p) => { const i = p * 4; const dr = d[i] - r0; const dg = d[i + 1] - g0; const db = d[i + 2] - b0; const da = d[i + 3] - a0; return dr * dr + dg * dg + db * db + da * da * 0.5 <= t2; };
  if (!contiguous) { for (let p = 0; p < w * h; p++) if (near(p)) m[p] = 255; return m; }
  const stack = [y * w + x];
  m[stack[0]] = 255;
  while (stack.length) {
    const p = stack.pop(); const px = p % w; const py = (p - px) / w;
    for (const q of [px > 0 ? p - 1 : -1, px < w - 1 ? p + 1 : -1, py > 0 ? p - w : -1, py < h - 1 ? p + w : -1]) {
      if (q >= 0 && !m[q] && near(q)) { m[q] = 255; stack.push(q); }
    }
  }
  return m;
}
// Arrière-plan estimé : tout ce qui touche les bords et ressemble à leurs couleurs (fonds unis ou dégradés doux).
export function backgroundMask(img, tol = 38) {
  const { width: w, height: h, data: d } = img;
  const m = new Uint8Array(w * h);
  const t2 = tol * tol * 3;
  const stack = [];
  const seed = (p) => { if (!m[p] && d[p * 4 + 3] > 8) { m[p] = 255; stack.push(p); } else if (d[p * 4 + 3] <= 8) m[p] = 255; };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (stack.length) {
    const p = stack.pop(); const px = p % w; const py = (p - px) / w; const i = p * 4;
    for (const q of [px > 0 ? p - 1 : -1, px < w - 1 ? p + 1 : -1, py > 0 ? p - w : -1, py < h - 1 ? p + w : -1]) {
      if (q < 0 || m[q]) continue;
      const j = q * 4;
      const dr = d[j] - d[i]; const dg = d[j + 1] - d[i + 1]; const db = d[j + 2] - d[i + 2];
      if (dr * dr + dg * dg + db * db <= t2 / 6 || d[j + 3] < 8) { m[q] = 255; stack.push(q); }
    }
  }
  return m;
}
export function invertMask(m) { const o = new Uint8Array(m.length); for (let i = 0; i < m.length; i++) o[i] = 255 - m[i]; return o; }
// Flou de boîte séparable (masques et canaux).
export function blurMask(m, w, h, r = 2) {
  if (r < 1) return m;
  const tmp = new Float32Array(w * h); const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let acc = 0; const row = y * w;
    for (let x = -r; x <= r; x++) acc += m[row + clamp(x, 0, w - 1)];
    for (let x = 0; x < w; x++) { tmp[row + x] = acc / (2 * r + 1); acc += m[row + clamp(x + r + 1, 0, w - 1)] - m[row + clamp(x - r, 0, w - 1)]; }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[clamp(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = acc / (2 * r + 1); acc += tmp[clamp(y + r + 1, 0, h - 1) * w + x] - tmp[clamp(y - r, 0, h - 1) * w + x]; }
  }
  return out;
}
// Masque d'un polygone (lasso), coordonnées en pixels de l'image.
export function polygonMask(points, w, h) {
  const c = makeCanvas(w, h); const x = c.getContext('2d', { willReadFrequently: true });
  x.fillStyle = '#fff'; x.beginPath();
  points.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
  x.closePath(); x.fill();
  const d = x.getImageData(0, 0, w, h).data; const m = new Uint8Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3];
  return m;
}
export function maskCanvas(m, w, h) {
  const c = makeCanvas(w, h); const x = c.getContext('2d'); const im = x.createImageData(w, h);
  for (let i = 0; i < m.length; i++) { im.data[i * 4] = 255; im.data[i * 4 + 1] = 255; im.data[i * 4 + 2] = 255; im.data[i * 4 + 3] = m[i]; }
  x.putImageData(im, 0, 0);
  return c;
}
export function maskBounds(m, w, h) {
  let x0 = w; let y0 = h; let x1 = -1; let y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
// Remplissage selon le contenu : diffusion pyramidale des pixels voisins, puis léger grain pour éviter l'aplat.
export function inpaint(img, mask) {
  const { width: w, height: h } = img;
  const levels = [];
  let cw = w; let ch = h; let cd = new Float32Array(img.data); let cm = Float32Array.from(mask, (v) => (v > 20 ? 0 : 1));
  levels.push({ w: cw, h: ch, d: cd, m: cm });
  while (cw > 8 && ch > 8 && levels.length < 9) {
    const nw = Math.ceil(cw / 2); const nh = Math.ceil(ch / 2); const nd = new Float32Array(nw * nh * 4); const nm = new Float32Array(nw * nh);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      let s = [0, 0, 0, 0]; let k = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const sx = Math.min(cw - 1, x * 2 + dx); const sy = Math.min(ch - 1, y * 2 + dy); const p = sy * cw + sx;
        if (cm[p] > 0) { for (let c = 0; c < 4; c++) s[c] += cd[p * 4 + c] * cm[p]; k += cm[p]; }
      }
      const q = y * nw + x;
      if (k > 0) { for (let c = 0; c < 4; c++) nd[q * 4 + c] = s[c] / k; nm[q] = 1; }
    }
    cw = nw; ch = nh; cd = nd; cm = nm;
    levels.push({ w: cw, h: ch, d: cd, m: cm });
  }
  for (let L = levels.length - 2; L >= 0; L--) {
    const lo = levels[L + 1]; const hi = levels[L];
    for (let y = 0; y < hi.h; y++) for (let x = 0; x < hi.w; x++) {
      const p = y * hi.w + x;
      if (hi.m[p] > 0) continue;
      const fx = Math.min(lo.w - 1, (x + 0.5) / 2 - 0.5); const fy = Math.min(lo.h - 1, (y + 0.5) / 2 - 0.5);
      const x0 = Math.max(0, Math.floor(fx)); const y0 = Math.max(0, Math.floor(fy)); const x1 = Math.min(lo.w - 1, x0 + 1); const y1 = Math.min(lo.h - 1, y0 + 1);
      const tx = clamp(fx - x0, 0, 1); const ty = clamp(fy - y0, 0, 1);
      for (let c = 0; c < 4; c++) {
        const a = lo.d[(y0 * lo.w + x0) * 4 + c]; const b = lo.d[(y0 * lo.w + x1) * 4 + c]; const e = lo.d[(y1 * lo.w + x0) * 4 + c]; const f = lo.d[(y1 * lo.w + x1) * 4 + c];
        hi.d[p * 4 + c] = lerp(lerp(a, b, tx), lerp(e, f, tx), ty);
      }
    }
    // Quelques passes de lissage dans la zone remplie.
    for (let it = 0; it < 3; it++) for (let y = 1; y < hi.h - 1; y++) for (let x = 1; x < hi.w - 1; x++) {
      const p = y * hi.w + x;
      if (hi.m[p] > 0) continue;
      for (let c = 0; c < 4; c++) hi.d[p * 4 + c] = (hi.d[(p - 1) * 4 + c] + hi.d[(p + 1) * 4 + c] + hi.d[(p - hi.w) * 4 + c] + hi.d[(p + hi.w) * 4 + c]) / 4;
    }
  }
  const out = new ImageData(w, h);
  const base = levels[0].d;
  for (let p = 0; p < w * h; p++) {
    const fill = mask[p] > 20; const n = fill ? (Math.random() - 0.5) * 6 : 0;
    for (let c = 0; c < 3; c++) out.data[p * 4 + c] = clamp(base[p * 4 + c] + n, 0, 255);
    out.data[p * 4 + 3] = base[p * 4 + 3];
  }
  return out;
}

// Contours d'un masque : arêtes de bord orientées (plein à droite) chaînées en boucles, puis simplifiées.
export function traceMask(m, w, h, { threshold = 128, minArea = 12, tolerance = 1.2 } = {}) {
  const full = (x, y) => x >= 0 && y >= 0 && x < w && y < h && m[y * w + x] >= threshold;
  const W = w + 1; const n1 = new Int32Array(W * (h + 1)).fill(-1); const n2 = new Int32Array(W * (h + 1)).fill(-1);
  const add = (a, b) => { if (n1[a] < 0) n1[a] = b; else n2[a] = b; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!full(x, y)) continue;
    if (!full(x, y - 1)) add(y * W + x, y * W + x + 1);
    if (!full(x + 1, y)) add(y * W + x + 1, (y + 1) * W + x + 1);
    if (!full(x, y + 1)) add((y + 1) * W + x + 1, (y + 1) * W + x);
    if (!full(x - 1, y)) add((y + 1) * W + x, y * W + x);
  }
  const take = (v) => { let t = n1[v]; if (t >= 0) { n1[v] = n2[v]; n2[v] = -1; } return t; };
  const paths = [];
  for (let s0 = 0; s0 < n1.length; s0++) {
    while (n1[s0] >= 0) {
      const pts = []; let cur = s0; let guard = 0;
      do { pts.push([cur % W, Math.floor(cur / W)]); const nx = take(cur); if (nx < 0) break; cur = nx; } while (cur !== s0 && ++guard < 4e6);
      if (pts.length < 4) continue;
      let area = 0;
      for (let i = 0; i < pts.length; i++) { const p = pts[i]; const q = pts[(i + 1) % pts.length]; area += p[0] * q[1] - q[0] * p[1]; }
      if (Math.abs(area / 2) < minArea) continue;
      paths.push(rdp([...pts, pts[0]], tolerance).slice(0, -1));
    }
  }
  return paths;
}
export function rdp(pts, eps, closed = false) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = 1; keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let dm = 0; let idx = -1;
    const [ax, ay] = pts[a]; const [bx, by] = pts[b]; const L = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((by - ay) * pts[i][0] - (bx - ax) * pts[i][1] + bx * ay - by * ax) / L; if (d > dm) { dm = d; idx = i; } }
    if (dm > eps && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  const out = pts.filter((_, i) => keep[i]);
  return closed && out.length > 3 ? out : out;
}
// Points lissés en commandes de courbes SVG (Catmull-Rom vers Bézier).
export function smoothPathD(pts, closed = true, k = 0.5) {
  if (pts.length < 3) return `M ${pts.map((p) => p.join(' ')).join(' L ')}${closed ? ' Z' : ''}`;
  const n = pts.length; const P = (i) => pts[closed ? (i + n) % n : clamp(i, 0, n - 1)];
  let d = `M ${f2(pts[0][0])} ${f2(pts[0][1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = P(i - 1); const p1 = P(i); const p2 = P(i + 1); const p3 = P(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) * k / 3, p1[1] + (p2[1] - p0[1]) * k / 3];
    const c2 = [p2[0] - (p3[0] - p1[0]) * k / 3, p2[1] - (p3[1] - p1[1]) * k / 3];
    d += ` C ${f2(c1[0])} ${f2(c1[1])} ${f2(c2[0])} ${f2(c2[1])} ${f2(p2[0])} ${f2(p2[1])}`;
  }
  return closed ? `${d} Z` : d;
}
const f2 = (v) => Math.round(v * 100) / 100;

// Quantification des couleurs d'une image (vectorisation par couleurs).
export function quantize(img, n = 6) {
  const pal = buildPalette([img], n).slice(0, n);
  const { width: w, height: h, data: d } = img;
  const lab = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (d[i + 3] < 100) { lab[p] = 255; continue; }
    let bd = 1e9; let bi = 0;
    for (let k = 0; k < pal.length; k++) { const q = pal[k]; const dd = (q[0] - d[i]) ** 2 + (q[1] - d[i + 1]) ** 2 + (q[2] - d[i + 2]) ** 2; if (dd < bd) { bd = dd; bi = k; } }
    lab[p] = bi;
  }
  return { palette: pal.map((p) => rgbHex(...p)), labels: lab };
}

// Image dessinée dans un quadrilatère quelconque (perspective approchée par triangles).
export function drawQuad(ctx, img, quad, steps = 16) {
  const sw = img.naturalWidth || img.videoWidth || img.width; const sh = img.naturalHeight || img.videoHeight || img.height;
  const [p0, p1, p2, p3] = quad;
  const bil = (u, v) => {
    // Interpolation projective simple (homographie) pour garder la perspective.
    return homography(quad, u, v);
  };
  for (let j = 0; j < steps; j++) for (let i = 0; i < steps; i++) {
    const u0 = i / steps; const u1 = (i + 1) / steps; const v0 = j / steps; const v1 = (j + 1) / steps;
    const a = bil(u0, v0); const b = bil(u1, v0); const c = bil(u1, v1); const d = bil(u0, v1);
    tri(ctx, img, a, b, c, [u0 * sw, v0 * sh], [u1 * sw, v0 * sh], [u1 * sw, v1 * sh]);
    tri(ctx, img, a, c, d, [u0 * sw, v0 * sh], [u1 * sw, v1 * sh], [u0 * sw, v1 * sh]);
  }
  void p0; void p1; void p2; void p3;
}
function homography(q, u, v) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2; const dx2 = x3 - x2; const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2; const dy2 = y3 - y2; const dy3 = y0 - y1 + y2 - y3;
  let g = 0; let h = 0;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) > 1e-9) { g = (dx3 * dy2 - dx2 * dy3) / den; h = (dx1 * dy3 - dx3 * dy1) / den; }
  const a = x1 - x0 + g * x1; const b = x3 - x0 + h * x3; const c = x0;
  const d = y1 - y0 + g * y1; const e = y3 - y0 + h * y3; const f = y0;
  const w = g * u + h * v + 1;
  return [(a * u + b * v + c) / w, (d * u + e * v + f) / w];
}
function tri(ctx, img, a, b, c, ta, tb, tc) {
  ctx.save();
  ctx.beginPath();
  // Léger débord pour masquer les jointures entre triangles.
  const cx = (a[0] + b[0] + c[0]) / 3; const cy = (a[1] + b[1] + c[1]) / 3;
  const grow = (p) => [p[0] + (p[0] - cx) * 0.02, p[1] + (p[1] - cy) * 0.02];
  const A = grow(a); const B = grow(b); const C = grow(c);
  ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(C[0], C[1]); ctx.closePath(); ctx.clip();
  const den = ta[0] * (tb[1] - tc[1]) + tb[0] * (tc[1] - ta[1]) + tc[0] * (ta[1] - tb[1]);
  if (Math.abs(den) < 1e-9) { ctx.restore(); return; }
  const m11 = (a[0] * (tb[1] - tc[1]) + b[0] * (tc[1] - ta[1]) + c[0] * (ta[1] - tb[1])) / den;
  const m12 = (a[1] * (tb[1] - tc[1]) + b[1] * (tc[1] - ta[1]) + c[1] * (ta[1] - tb[1])) / den;
  const m21 = (a[0] * (tc[0] - tb[0]) + b[0] * (ta[0] - tc[0]) + c[0] * (tb[0] - ta[0])) / den;
  const m22 = (a[1] * (tc[0] - tb[0]) + b[1] * (ta[0] - tc[0]) + c[1] * (tb[0] - ta[0])) / den;
  const dx = (a[0] * (tb[0] * tc[1] - tc[0] * tb[1]) + b[0] * (tc[0] * ta[1] - ta[0] * tc[1]) + c[0] * (ta[0] * tb[1] - tb[0] * ta[1])) / den;
  const dy = (a[1] * (tb[0] * tc[1] - tc[0] * tb[1]) + b[1] * (tc[0] * ta[1] - ta[0] * tc[1]) + c[1] * (ta[0] * tb[1] - tb[0] * ta[1])) / den;
  ctx.transform(m11, m12, m21, m22, dx, dy);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

// Bruit de valeur lisse (textures procédurales, déformations).
export function makeNoise(seed = 1) {
  let s = seed >>> 0 || 1;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const perm = new Uint8Array(512); const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; vals[i] = rnd(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const sm = (t) => t * t * (3 - 2 * t);
  const n2 = (x, y) => {
    const xi = Math.floor(x); const yi = Math.floor(y); const xf = x - xi; const yf = y - yi;
    const X = xi & 255; const Y = yi & 255;
    const v00 = vals[perm[X + perm[Y]]]; const v10 = vals[perm[X + 1 + perm[Y]]]; const v01 = vals[perm[X + perm[Y + 1]]]; const v11 = vals[perm[X + 1 + perm[Y + 1]]];
    const u = sm(xf); const v = sm(yf);
    return lerp(lerp(v00, v10, u), lerp(v01, v11, u), v);
  };
  const fbm = (x, y, oct = 4) => { let a = 0; let amp = 0.5; let f = 1; for (let i = 0; i < oct; i++) { a += n2(x * f, y * f) * amp; f *= 2; amp *= 0.5; } return a; };
  return { n2, fbm, rnd };
}

// Attend qu'une condition soit vraie (instances créées à l'ouverture d'un espace).
export function waitFor(test, { every = 300, timeout = 0 } = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      let v = null;
      try { v = test(); } catch { v = null; }
      if (v) { resolve(v); return; }
      if (timeout && Date.now() - t0 > timeout) { resolve(null); return; }
      setTimeout(tick, every);
    };
    tick();
  });
}
