// NEXORA #053 : socle commun des fonctions ajoutées à NEX-DESIGN (offres, calques, couleurs, fichiers).
import { api, esc, ico, toast, busy, sheet, closeSheet, sheetHtml, menu, prompt, state, settings, saveSettings, uid, pickFile, saveBytes, zip, dataUrlBytes, bytesB64, hexRgb, rgbHex, luminance } from '../core.js';
import { FabricObject, util, Group, Rect, Textbox } from '../design/fab.js';
import { current } from '../offres/status.js';
import { FALLBACK, normPlan, money } from '../offres/catalog.js';

export { api, esc, ico, toast, busy, sheet, closeSheet, sheetHtml, menu, prompt, state, settings, saveSettings, uid, pickFile, saveBytes, zip, dataUrlBytes, bytesB64, hexRgb, rgbHex, luminance, FabricObject, util, Group, Rect, Textbox };

// Propriétés des calques ajoutées par #053, enregistrées avec le document (copie, annulation, cloud).
export const DZX_PROPS = ['nxAuto', 'nxAutoBg', 'nxAutoFill', 'nxVar', 'nxVariant', 'nxProto', 'nxAlt', 'nxBulk', 'nxCons'];
for (const p of DZX_PROPS) if (!FabricObject.customProperties.includes(p)) FabricObject.customProperties.push(p);

// Offres : NEX-DESIGN limité (Gratuit), étendu (Standard), complet (Pro).
export const STD = 'design_extended';
export const PRO = 'design_full';
export function has(perm) {
  if (!perm) return true;
  const s = current();
  if (s.admin) return true;
  if (s.perms && perm in s.perms) return !!s.perms[perm];
  return !!((FALLBACK[normPlan(s.plan)] || FALLBACK.free).perms[perm]);
}
export const gate = (perm, what) => (has(perm) ? '' : `<div class="dzp-gate">${ico(perm === PRO ? 'nxCrown' : 'bolt', 18)}<div><b>${esc(what)} fait partie de l’offre Pro</b></div><button class="btn small primary" data-nxo-ask="pro">Passer à Pro · ${money(FALLBACK.pro.price_month_cents)} / mois</button></div>`);
// NEXORA #075 (A-042) : prix lus dans le catalogue des offres (nx/offres/catalog.js), plus jamais écrits en dur.
export function allowed(perm, what) {
  if (has(perm)) return true;
  toast(`${what} fait partie de l’offre Pro.`, { action: 'Voir les offres', onAction: () => { const b = document.querySelector('[data-nxo-offers]'); if (b) b.click(); } });
  return false;
}

// Briques du panneau de droite (même aspect que les sections de NEX-DESIGN).
// NEXORA #075 (A-039) : data-free : ces cartes gèrent elles-mêmes leur offre (le verrou générique ne les voile pas).
export const sec = (title, body, extra = '') => `<section class="dz-card nx-card dzx-card" data-free><div class="dz-card-h"><span>${title}</span>${extra}</div>${body}</section>`;
export const btn = (a, icon, label, extra = '', cls = '') => `<button class="btn small ${cls}" data-dzx="${a}" ${extra}>${ico(icon, 13)}<span>${esc(label)}</span></button>`;
export const num = (k, label, v, extra = '') => `<label class="dzx-num"><span>${esc(label)}</span><input class="input" type="number" data-dzxk="${k}" value="${v}" ${extra}></label>`;
export const select = (k, label, opts, v) => `<label class="dzx-num"><span>${esc(label)}</span><select class="input" data-dzxk="${k}">${opts.map(([val, l]) => `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;

// NEXORA #075 (A-043) : pluriel écrit en entier (« 2 pages créées », jamais « page(s) »).
export const pl = (n, one, many) => `${n} ${n > 1 ? many : one}`;
export const isText = (o) => o && ['textbox', 'i-text', 'text'].includes(o.type);
export const objs = (D) => D.canvas.getObjects().filter((o) => o.id !== '__board');
export function walk(list, fn) { for (const o of list) { fn(o); if (o.getObjects) walk(o.getObjects(), fn); } }
// Couleur pleine d'un remplissage (dégradé : première couleur), en #rrggbb.
export function hex(c) {
  if (!c) return null;
  if (typeof c === 'object' && c.colorStops) return hex(c.colorStops[0] && c.colorStops[0].color);
  const s = String(c).trim();
  if (/^#[0-9a-f]{3,8}$/i.test(s)) return s.length === 4 ? `#${s.slice(1).split('').map((x) => x + x).join('')}` : s.slice(0, 7).toLowerCase();
  const m = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(s);
  if (m) return rgbHex(+m[1], +m[2], +m[3]);
  if (s === 'white') return '#ffffff';
  if (s === 'black') return '#000000';
  return null;
}
export const ratio = (a, b) => { const x = luminance(a); const y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
export const slug = (s) => String(s || 'element').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'element';
export const pascal = (s) => slug(s).split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('') || 'Element';
export async function readText(exts, title) {
  const r = await pickFile({ title, name: 'Fichiers', extensions: exts, as: 'bytes' });
  if (!r || !r.data) return null;
  return { name: r.name || '', text: new TextDecoder().decode(r.data), data: r.data };
}
export const textBytes = (s) => new TextEncoder().encode(s);
// Remplace un calque par un autre à la même place dans la pile.
export function replaceObj(D, old, n) {
  const c = D.canvas;
  const i = c.getObjects().indexOf(old);
  c.remove(old);
  if (i >= 0 && c.insertAt) c.insertAt(i, n); else c.add(n);
  return n;
}
export const commit = (D, label) => { D.nxNextLabel = label; D.canvas.requestRenderAll(); D.changed(); };
