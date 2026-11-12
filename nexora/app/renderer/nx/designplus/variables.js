// NEXORA #053 : variables de design : couleurs, nombres (espacements, arrondis, tailles) et polices nommés, avec
// des modes (clair, sombre…). Un calque lié se met à jour quand la variable ou le mode change. Exports CSS,
// Tailwind et jetons JSON.
import { esc, ico, uid, toast, sec, btn, hex, walk, objs, slug, isText, commit, textBytes, saveBytes, api, pl } from './ui.js';
import { getBrand } from '../services.js';

export const store = (D) => (D.doc.nxVars = D.doc.nxVars || { modes: ['Clair', 'Sombre'], mode: 'Clair', list: [] });
export const TYPES = { color: 'Couleur', number: 'Nombre', font: 'Police' };
// Propriété du calque → type de variable.
export const BIND = { fill: 'color', stroke: 'color', fontFamily: 'font', fontSize: 'number', rx: 'number', strokeWidth: 'number', opacity: 'number' };
const LABEL = { fill: 'Remplissage', stroke: 'Contour', fontFamily: 'Police', fontSize: 'Taille du texte', rx: 'Arrondi', strokeWidth: 'Épaisseur du contour', opacity: 'Opacité' };
export const valueOf = (D, v) => (v ? (v.values[store(D).mode] ?? v.values[store(D).modes[0]]) : undefined);
export const byId = (D, id) => store(D).list.find((v) => v.id === id);

function setProp(o, k, val) {
  if (val === undefined || val === null || val === '') return;
  if (k === 'rx') o.set({ rx: Number(val), ry: Number(val) });
  else if (k === 'fontSize' || k === 'strokeWidth') o.set(k, Number(val));
  else if (k === 'opacity') o.set(k, Math.max(0, Math.min(1, Number(val) > 1 ? Number(val) / 100 : Number(val))));
  else o.set(k, val);
  if (isText(o) && o.initDimensions) o.initDimensions();
}
export function applyAll(D, list = objs(D)) {
  let n = 0;
  walk(list, (o) => { if (!o.nxVar) return; for (const [k, id] of Object.entries(o.nxVar)) { const v = byId(D, id); if (v) { setProp(o, k, valueOf(D, v)); n += 1; } } o.dirty = true; });
  // Les autres pages suivent au prochain chargement (applyAll est appelé après chaque chargement de page).
  D.canvas.requestRenderAll();
  return n;
}
export function setMode(D, mode) { store(D).mode = mode; applyAll(D); commit(D, `Mode « ${mode} »`); }
export function bindProp(D, o, k, id) {
  o.nxVar = { ...(o.nxVar || {}) };
  if (id) { o.nxVar[k] = id; const v = byId(D, id); setProp(o, k, valueOf(D, v)); } else delete o.nxVar[k];
  if (!Object.keys(o.nxVar).length) delete o.nxVar;
  commit(D, 'Variable liée');
}
export function add(D, { name, type, value }) {
  const s = store(D);
  let n = slug(name || 'variable');
  for (let i = 2; s.list.some((v) => v.name === n); i += 1) n = `${slug(name)}-${i}`;
  const v = { id: uid(), name: n, type, values: Object.fromEntries(s.modes.map((m) => [m, value])) };
  s.list.push(v);
  return v;
}
// Couleurs du document (ou du kit de marque) → variables.
export function fromDocument(D) {
  const used = new Map();
  walk(objs(D), (o) => { for (const k of ['fill', 'stroke']) { const h = hex(o[k]); if (h && typeof o[k] === 'string') used.set(h, (used.get(h) || 0) + 1); } });
  const brand = (getBrand().colors || []).map(hex).filter(Boolean);
  const colors = [...new Set([...brand, ...[...used].sort((a, b) => b[1] - a[1]).map(([h]) => h)])].slice(0, 12);
  let made = 0;
  colors.forEach((c) => { if (store(D).list.some((v) => v.type === 'color' && Object.values(v.values).includes(c))) return; const v = add(D, { name: nameFor(D, c), type: 'color', value: c }); made += 1; if (store(D).modes[1]) v.values[store(D).modes[1]] = darkOf(c); });
  if (!store(D).list.some((v) => v.type === 'number')) { add(D, { name: 'espace-s', type: 'number', value: 8 }); add(D, { name: 'espace-m', type: 'number', value: 16 }); add(D, { name: 'arrondi', type: 'number', value: 12 }); made += 3; }
  // Calques liés automatiquement à la variable de même couleur.
  walk(objs(D), (o) => { for (const k of ['fill', 'stroke']) { if (typeof o[k] !== 'string' || (o.nxVar && o.nxVar[k])) continue; const v = store(D).list.find((x) => x.type === 'color' && x.values[store(D).mode] === hex(o[k])); if (v) o.nxVar = { ...(o.nxVar || {}), [k]: v.id }; } });
  return made;
}
// Nom d'après la couleur : vives → primaire, secondaire, accent, puis couleur-N ; grises → texte (foncée),
// fond (claire), puis gris-N. Jamais deux fois le même nom.
function nameFor(D, c) {
  const n = parseInt(c.slice(1), 16); const r = n >> 16 & 255; const g = n >> 8 & 255; const b = n & 255;
  const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  const taken = new Set(store(D).list.map((v) => v.name));
  const first = (list) => list.find((x) => !taken.has(x));
  const serie = (base) => { let i = 1; while (taken.has(`${base}-${i}`)) i += 1; return `${base}-${i}`; };
  if (sat > 0.2) return first(['primaire', 'secondaire', 'accent']) || serie('couleur');
  if (l < 0.3) return first(['texte']) || serie('gris');
  if (l > 0.88) return first(['fond', 'surface']) || serie('gris');
  return serie('gris');
}
// Proposition pour le mode sombre : clair ↔ foncé, couleurs vives gardées.
function darkOf(c) {
  const n = parseInt(c.slice(1), 16); const r = n >> 16 & 255; const g = n >> 8 & 255; const b = n & 255;
  const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  if (sat > 0.35) return c;
  const k = 1 - l;
  const v = Math.round(18 + k * 220);
  return `#${[v, v, Math.min(255, v + 4)].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

// ---------- Exports ----------
const cssVal = (v, val) => (v.type === 'number' ? `${val}px` : v.type === 'font' ? `'${val}', sans-serif` : val);
export function toCss(D) {
  const s = store(D);
  const block = (m) => s.list.map((v) => `  --${v.name}: ${cssVal(v, v.values[m] ?? v.values[s.modes[0]])};`).join('\n');
  return `/* Variables de design (NEX-DESIGN) */\n:root {\n${block(s.modes[0])}\n}\n${s.modes.slice(1).map((m) => `\n[data-theme="${slug(m)}"] {\n${block(m)}\n}`).join('\n')}\n`;
}
export function toTailwind(D) {
  const s = store(D);
  const pick = (t) => Object.fromEntries(s.list.filter((v) => v.type === t).map((v) => [v.name, `var(--${v.name})`]));
  const cfg = { theme: { extend: { colors: pick('color'), spacing: pick('number'), borderRadius: pick('number'), fontFamily: Object.fromEntries(s.list.filter((v) => v.type === 'font').map((v) => [v.name, [`var(--${v.name})`]])) } } };
  return `// Thème Tailwind relié aux variables CSS de NEX-DESIGN (variables.css)\n/** @type {import('tailwindcss').Config} */\nexport default ${JSON.stringify(cfg, null, 2)};\n`;
}
export function toJson(D) {
  const s = store(D);
  const out = {};
  for (const m of s.modes) out[m] = Object.fromEntries(s.list.map((v) => [v.name, { $type: v.type === 'color' ? 'color' : v.type === 'font' ? 'fontFamily' : 'dimension', $value: v.type === 'number' ? `${v.values[m]}px` : v.values[m] }]));
  return `${JSON.stringify(out, null, 2)}\n`;
}

// ---------- Panneau du document ----------
export function panel(D) {
  const s = store(D);
  const row = (v) => `<div class="dzp-var" style="--modes:${s.modes.length}" data-var="${esc(v.id)}"><input class="input dzp-vname" data-vk="name" value="${esc(v.name)}" aria-label="Nom de la variable"><small>${esc(TYPES[v.type])}</small>${s.modes.map((m) => `<span class="dzp-vval">${v.type === 'color' ? `<input type="color" data-vk="val" data-mode="${esc(m)}" value="${esc(v.values[m] || '#000000')}" title="${esc(m)}">` : `<input class="input" ${v.type === 'number' ? 'type="number"' : ''} data-vk="val" data-mode="${esc(m)}" value="${esc(v.values[m] ?? '')}" title="${esc(m)}">`}</span>`).join('')}<button class="icon-btn" data-vdel title="Supprimer la variable">${ico('trash', 13)}</button></div>`;
  return `<div class="dzp-bar"><div class="seg">${s.modes.map((m) => `<button class="${m === s.mode ? 'on' : ''}" data-vmode="${esc(m)}">${esc(m)}</button>`).join('')}</div><button class="btn small" data-vaddmode>${ico('plus', 12)}<span>Mode</span></button></div>
    <div class="dzp-vhead" style="--modes:${s.modes.length}"><span>Nom</span><span></span>${s.modes.map((m) => `<span>${esc(m)}</span>`).join('')}<span></span></div>
    ${s.list.length ? s.list.map(row).join('') : `<p class="dzx-hint">Aucune variable. Créez-les à partir des couleurs du document et du kit de marque, ou une par une.</p>`}
    <div class="nx-btns">${btn('var-auto', 'sparkle', 'Depuis le document et la marque')}${btn('var-add-color', 'nxPalette', 'Couleur')}${btn('var-add-number', 'ruler', 'Nombre')}${btn('var-add-font', 'text', 'Police')}</div>
    <div class="dzp-sub">Exporter pour le code</div>
    <div class="nx-btns">${btn('var-css', 'code', 'CSS')}${btn('var-tw', 'code', 'Tailwind')}${btn('var-json', 'code', 'Jetons JSON')}${btn('var-devlab', 'nxDev', 'Vers le projet du Dev Lab')}</div>`;
}
export async function onPanel(D, e, rerender) {
  const s = store(D);
  const t = e.target;
  const md = t.closest('[data-vmode]');
  if (md) { setMode(D, md.dataset.vmode); rerender(); return true; }
  if (t.closest('[data-vaddmode]')) { const { prompt } = await import('../core.js'); const m = await prompt('Nouveau mode', { label: 'Par exemple : Sombre, Marque B, Contraste élevé', icon: 'nxPalette', go: 'Ajouter' }); if (m && !s.modes.includes(m.trim())) { s.modes.push(m.trim()); for (const v of s.list) v.values[m.trim()] = v.values[s.modes[0]]; D.changed(); rerender(); } return true; }
  const del = t.closest('[data-vdel]');
  if (del) { const id = del.closest('[data-var]').dataset.var; s.list = s.list.filter((v) => v.id !== id); walk(objs(D), (o) => { if (o.nxVar) for (const k of Object.keys(o.nxVar)) if (o.nxVar[k] === id) delete o.nxVar[k]; }); D.changed(); rerender(); return true; }
  const a = t.closest('[data-dzx]') && t.closest('[data-dzx]').dataset.dzx;
  if (!a || !a.startsWith('var-')) return false;
  if (a === 'var-auto') { const n = fromDocument(D); applyAll(D); commit(D, 'Variables créées'); toast(n ? `${pl(n, 'variable créée', 'variables créées')} ; les calques de même couleur y sont liés.` : 'Les couleurs du document ont déjà leur variable.'); rerender(); }
  if (a.startsWith('var-add-')) { const type = a.slice(8); add(D, { name: type === 'color' ? 'couleur' : type === 'font' ? 'police' : 'taille', type, value: type === 'color' ? '#6c5ce7' : type === 'font' ? 'Inter' : 16 }); D.changed(); rerender(); }
  const out = { 'var-css': ['variables', 'css', toCss], 'var-tw': ['tailwind.config', 'js', toTailwind], 'var-json': ['jetons', 'json', toJson] }[a];
  if (out) { const text = out[2](D); await navigator.clipboard.writeText(text).catch(() => {}); await saveBytes(textBytes(text), { name: out[0], ext: out[1], kind: 'document', project: D.doc.name || 'NEXORA' }); }
  if (a === 'var-devlab') { const { toDevLab } = await import('./code.js'); await toDevLab(D, [{ path: 'src/styles/variables.css', text: toCss(D) }, { path: 'tailwind.theme.js', text: toTailwind(D) }]); }
  return true;
}
export function onPanelInput(D, e) {
  const t = e.target;
  const r = t.closest('[data-var]');
  if (!r) return false;
  const v = byId(D, r.dataset.var);
  if (t.dataset.vk === 'name') v.name = slug(t.value) || v.name;
  if (t.dataset.vk === 'val') { v.values[t.dataset.mode] = v.type === 'number' ? Number(t.value) : t.value; if (t.dataset.mode === store(D).mode) applyAll(D); }
  D.changed();
  return true;
}

// ---------- Section du calque sélectionné ----------
export function props(D, o) {
  if (!o) return '';
  const s = store(D);
  const keys = Object.keys(BIND).filter((k) => (k === 'fontFamily' || k === 'fontSize' ? isText(o) : k === 'rx' ? o.type === 'rect' : true));
  const rows = keys.map((k) => { const opts = s.list.filter((v) => v.type === BIND[k]); const cur = o.nxVar && o.nxVar[k]; return opts.length || cur ? `<label class="dzx-row"><span>${LABEL[k]}</span><select class="input" data-dzxk="var.${k}"><option value="">— Valeur libre —</option>${opts.map((v) => `<option value="${esc(v.id)}" ${cur === v.id ? 'selected' : ''}>${esc(v.name)}${v.type === 'color' ? ` (${esc(valueOf(D, v))})` : ` · ${esc(valueOf(D, v))}`}</option>`).join('')}</select></label>` : ''; }).join('');
  return sec('Variables', rows ? rows : `<p class="dzx-hint">Lie les couleurs, polices et tailles à des variables : changer une variable ou passer en mode sombre met à jour tout le document.</p>`, `<button class="icon-btn" data-dzx="open-variables" title="Gérer les variables">${ico('nxPalette', 13)}</button>`);
}
export function onField(D, o, k, v) { if (!k.startsWith('var.')) return false; bindProp(D, o, k.slice(4), v); return true; }
export { api };
