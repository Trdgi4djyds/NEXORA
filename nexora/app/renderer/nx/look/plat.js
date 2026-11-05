// NEXORA #045 : interface plate. Demande de l'utilisateur : « retirer tous les effets d'ombres des UI, dans les
// cards » et « corriger les effets de dégradé et lumineux ».
// Ce module parcourt les feuilles de style chargées (et celles que les modules ajoutent ensuite) et retire de chaque
// déclarations box-shadow les ombres portées, lueurs et reliefs (décalage ou flou non nuls) : seuls restent les
// contours et les anneaux de focus ou de sélection (0 0 0 Npx, inset compris), indispensables pour voir l'élément
// choisi. Il retire aussi les ombres de texte et les drop-shadow(), et filtre de la même façon les variables
// d'ombre (--card-shadow, --panel-shadow, --nx2-pop…). Les écrans d'appareils simulés de l'App Builder (contenu,
// règle #004) gardent les leurs. Module autonome : chargé par index.html et par le back office (admin/src/main.tsx).
const KEEP = /\b(ab-phone|ab-wall|ab-sp-|ab-home|nxh-)/;
const VAR_NAME = /(shadow|glow|lift|raise|pop)/i;
const LEN = /^-?(\d*\.?\d+)(px|r?em|%|vh|vw|ch)?$/;

// Découpe au premier niveau (hors parenthèses).
function splitTop(s, sep) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && (sep === ' ' ? /\s/.test(ch) : ch === sep)) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

// Garde les contours et anneaux (décalages et flou nuls), retire tout le reste.
export function flatShadow(v) {
  if (!v || /^\s*none\s*$/i.test(v)) return v;
  const keep = [];
  for (const part of splitTop(v, ',')) {
    if (/^var\([^()]*\)$/.test(part)) { keep.push(part); continue; }
    const lens = splitTop(part, ' ').filter((t) => LEN.test(t)).map(parseFloat);
    if (lens.length < 2) { keep.push(part); continue; }
    const [x, y, blur = 0] = lens;
    if (x === 0 && y === 0 && blur === 0) keep.push(part);
  }
  return keep.length ? keep.join(', ') : 'none';
}

const noDrop = (v) => v.replace(/drop-shadow\((?:[^()]|\([^()]*\))*\)/g, '').replace(/\s+/g, ' ').trim() || 'none';

function fixStyle(st, sel) {
  if (!st || KEEP.test(sel || '')) return;
  const set = (name, value) => { if (value !== st.getPropertyValue(name)) st.setProperty(name, value, st.getPropertyPriority(name)); };
  const bs = st.getPropertyValue('box-shadow');
  if (bs) set('box-shadow', flatShadow(bs));
  if (st.getPropertyValue('text-shadow')) set('text-shadow', 'none');
  for (const name of ['filter', '-webkit-filter']) {
    const v = st.getPropertyValue(name);
    if (v && v.includes('drop-shadow(')) set(name, noDrop(v));
  }
  for (let i = 0; i < st.length; i++) {
    const name = st[i];
    if (!name.startsWith('--') || !VAR_NAME.test(name)) continue;
    const v = st.getPropertyValue(name).trim();
    if (/\d(px|r?em)\b/.test(v) && !/gradient\(/.test(v)) set(name, flatShadow(v));
  }
}

function walk(rules) {
  for (const r of rules) {
    if (r.style) fixStyle(r.style, r.selectorText || '');
    if (r.cssRules && r.cssRules.length) walk(r.cssRules);
  }
}

const done = new WeakMap();
function scan() {
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    if (!rules || done.get(sheet) === rules.length) continue;
    walk(rules);
    done.set(sheet, rules.length);
  }
}

let timer = 0;
const later = () => { if (!timer) timer = setTimeout(() => { timer = 0; scan(); }, 0); };

export function installPlat() {
  if (window.__nxPlat) return;
  window.__nxPlat = true;
  scan();
  // Feuilles ajoutées ensuite (modules, éditeur de code…) : traitées dès leur chargement.
  new MutationObserver((list) => {
    for (const m of list) for (const n of m.addedNodes) {
      if (n.tagName === 'LINK') n.addEventListener('load', later, { once: true });
      if (n.tagName === 'STYLE' || n.tagName === 'LINK') later();
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('load', (e) => { if (e.target && e.target.tagName === 'LINK') later(); }, true);
}

installPlat();
