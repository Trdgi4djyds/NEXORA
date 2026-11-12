// NEXORA #053 : accessibilité : contraste de chaque texte (AA, AAA) mesuré sur le fond réellement affiché,
// tailles minimales, zones cliquables trop petites, images sans texte de remplacement, simulation des
// daltonismes ; correction du contraste en un clic.
import { esc, ico, toast, api, sec, btn, hex, ratio, isText, objs, walk, commit, rgbHex, hexRgb, pl } from './ui.js';

const SIMS = { none: ['Normale', 'Vision normale'], deuter: ['Vert', 'Deutéranopie (rouge-vert)'], protan: ['Rouge', 'Protanopie (rouge)'], tritan: ['Bleu', 'Tritanopie (bleu-jaune)'], achroma: ['Gris', 'Sans couleurs'] };
const MATRIX = {
  deuter: '0.625 0.375 0 0 0 0.7 0.3 0 0 0 0 0.3 0.7 0 0 0 0 0 1 0',
  protan: '0.567 0.433 0 0 0 0.558 0.442 0 0 0 0 0.242 0.758 0 0 0 0 0 1 0',
  tritan: '0.95 0.05 0 0 0 0 0.433 0.567 0 0 0 0.475 0.525 0 0 0 0 0 1 0',
  achroma: '0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0.299 0.587 0.114 0 0 0 0 0 1 0',
};
function ensureFilters() {
  if (document.getElementById('dzx-sims')) return;
  document.body.insertAdjacentHTML('beforeend', `<svg id="dzx-sims" width="0" height="0" style="position:absolute" aria-hidden="true">${Object.entries(MATRIX).map(([k, m]) => `<filter id="dzx-${k}"><feColorMatrix type="matrix" values="${m}"/></filter>`).join('')}</svg>`);
}
export function simulate(D, kind) {
  ensureFilters();
  const el = D.canvas.wrapperEl || D.canvas.lowerCanvasEl.parentElement;
  el.style.filter = kind && kind !== 'none' ? `url(#dzx-${kind})` : '';
  D.nxSim = kind;
}
// Fond derrière un texte : la zone est rendue sans ce texte, puis la couleur la plus fréquente est relevée.
async function backgroundOf(D, o) {
  const c = D.canvas;
  const r = o.getBoundingRect();
  const was = o.visible;
  o.visible = false;
  if (o.group) o.group.dirty = true;
  let el;
  try { el = c.toCanvasElement(1, { left: r.left, top: r.top, width: Math.max(1, r.width), height: Math.max(1, r.height) }); } finally { o.visible = was; if (o.group) o.group.dirty = true; }
  const d = el.getContext('2d').getImageData(0, 0, el.width, el.height).data;
  const counts = new Map();
  const step = Math.max(4, Math.floor(d.length / 4 / 4000) * 4);
  for (let i = 0; i < d.length; i += step) { if (d[i + 3] < 128) continue; const k = rgbHex(d[i] & 0xf8, d[i + 1] & 0xf8, d[i + 2] & 0xf8); counts.set(k, (counts.get(k) || 0) + 1); }
  let best = hex(D.page.bg) || '#ffffff'; let n = 0;
  for (const [k, v] of counts) if (v > n) { n = v; best = k; }
  return best;
}
export async function audit(D) {
  const items = [];
  const scene = [];
  walk(objs(D), (o) => scene.push(o));
  for (const o of scene) {
    if (o.visible === false) continue;
    if (isText(o) && o.text && o.text.trim()) {
      const fg = hex(o.fill);
      if (!fg) continue;
      const bg = await backgroundOf(D, o);
      const size = o.fontSize * (o.scaleY || 1) * (o.group ? o.group.scaleY || 1 : 1);
      const bold = Number(o.fontWeight) >= 700 || o.fontWeight === 'bold';
      const large = size >= 24 || (size >= 18.66 && bold);
      const rt = ratio(fg, bg);
      const aa = large ? 3 : 4.5; const aaa = large ? 4.5 : 7;
      items.push({ o, kind: 'contrast', fg, bg, ratio: rt, level: rt >= aaa ? 'AAA' : rt >= aa ? 'AA' : 'insuffisant', ok: rt >= aa, label: o.text.trim().slice(0, 40) });
      if (size < 12) items.push({ o, kind: 'size', ok: false, label: `Texte de ${Math.round(size)} px : trop petit pour être lu facilement (12 px au moins)` });
    }
    if (o.type === 'image' && !o.nxAlt) items.push({ o, kind: 'alt', ok: false, label: `Image « ${o.name || 'sans nom'} » sans texte de remplacement` });
    if (o.nxProto && o.nxProto.to) { const r = o.getBoundingRect(); if (r.width < 44 || r.height < 44) items.push({ o, kind: 'target', ok: false, label: `Zone cliquable de ${Math.round(r.width)} × ${Math.round(r.height)} px : 44 × 44 px au moins sur mobile` }); }
  }
  D.canvas.requestRenderAll();
  return items;
}
// Couleur de texte la plus proche qui atteint le contraste voulu.
export function fixColor(fg, bg, target = 4.5) {
  const [r, g, b] = hexRgb(fg);
  const darker = ratio('#000000', bg) >= ratio('#ffffff', bg);
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const c = darker ? rgbHex(r * (1 - t), g * (1 - t), b * (1 - t)) : rgbHex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
    if (ratio(c, bg) >= target) return c;
  }
  return darker ? '#000000' : '#ffffff';
}
export function panel(D, st) {
  const items = st.items;
  const bad = items ? items.filter((i) => !i.ok) : [];
  return `<div class="dzp-sub">Simuler une vision différente</div><div class="dzp-bar"><div class="seg">${Object.entries(SIMS).map(([k, [s, l]]) => `<button class="${(D.nxSim || 'none') === k ? 'on' : ''}" data-sim="${k}" title="${esc(l)}">${esc(s)}</button>`).join('')}</div></div>
    <div class="nx-btns">${btn('a11y-run', 'audit', items ? 'Vérifier de nouveau' : 'Vérifier la page', '', 'primary')}</div>
    ${items ? `<p class="dzx-hint">${bad.length ? `${pl(bad.length, 'point à corriger', 'points à corriger')} sur ${pl(items.length, 'contrôle', 'contrôles')}.` : `${ico('pass', 12)} Tout est lisible : ${pl(items.length, 'contrôle réussi', 'contrôles réussis')}.`}</p>
    <div class="dzp-list">${items.map((i, n) => `<div class="dzp-item ${i.ok ? 'ok' : 'bad'}"><button class="dzp-item-main" data-a11y-go="${n}" title="${esc(`Sélectionner « ${i.label} »`)}">${i.kind === 'contrast' ? `<span class="dzp-sw" style="background:${esc(i.bg)};color:${esc(i.fg)}">Aa</span>` : ico(i.kind === 'alt' ? 'image' : i.kind === 'target' ? 'target' : 'text', 14)}<span><b>${esc(i.kind === 'contrast' ? `« ${i.label} »` : i.label)}</b>${i.kind === 'contrast' ? `<small>Contraste ${i.ratio.toFixed(2).replace('.', ',')} : 1 · ${esc(i.level)}</small>` : ''}</span></button>${i.kind === 'contrast' && !i.ok ? `<button class="btn small" data-a11y-fix="${n}">Corriger</button>` : ''}</div>`).join('')}</div>` : '<p class="dzx-hint">Contraste des textes (niveaux AA et AAA, mesuré sur le fond réel), tailles, zones cliquables et textes de remplacement des images.</p>'}`;
}
export async function onPanel(D, e, rerender, st) {
  const t = e.target;
  const sim = t.closest('[data-sim]');
  if (sim) { simulate(D, sim.dataset.sim); rerender(); return true; }
  if (t.closest('[data-dzx="a11y-run"]')) { st.items = await audit(D); rerender(); return true; }
  const go = t.closest('[data-a11y-go]');
  if (go) { const i = st.items[+go.dataset.a11yGo]; const target = i.o.group && !i.o.group.interactive ? i.o.group : i.o; D.canvas.setActiveObject(target); D.canvas.requestRenderAll(); D.renderProps(); return true; }
  const fx = t.closest('[data-a11y-fix]');
  if (fx) {
    const i = st.items[+fx.dataset.a11yFix];
    const size = i.o.fontSize * (i.o.scaleY || 1);
    const c = fixColor(i.fg, i.bg, size >= 24 ? 3 : 4.5);
    if (i.o.nxVar && i.o.nxVar.fill) { delete i.o.nxVar.fill; toast('Ce texte n’est plus lié à sa variable de couleur.'); }
    i.o.set('fill', c);
    if (i.o.group) i.o.group.dirty = true;
    commit(D, 'Contraste corrigé');
    st.items = await audit(D); rerender();
    return true;
  }
  return false;
}
// Texte de remplacement d'une image (panneau de droite), avec proposition de l'IA.
export function altProps(D, o) {
  if (!o || o.type !== 'image') return '';
  return sec('Texte de remplacement', `<textarea class="input nx-ta" rows="2" data-dzxk="alt" placeholder="Décrivez l’image pour les personnes qui ne la voient pas">${esc(o.nxAlt || '')}</textarea><div class="nx-btns">${btn('alt-ai', 'sparkle', 'Proposer avec l’IA')}</div>`);
}
export async function altAi(D, o) {
  const near = [];
  walk(objs(D), (x) => { if (isText(x) && x.text) near.push(x.text.slice(0, 80)); });
  try {
    const r = await api.invoke('ai:chat', { id: `alt${Date.now()}`, system: 'Vous écrivez des textes de remplacement d’images (attribut alt) en français, en une phrase de 15 mots au plus, sans « image de ».', messages: [{ role: 'user', content: `Nom du calque : ${o.name || 'image'}. Textes de la page : ${near.slice(0, 8).join(' | ')}. Proposez le texte de remplacement.` }], maxTokens: 120 });
    o.nxAlt = String(r.text || '').trim().replace(/^["«\s]+|["»\s]+$/g, '');
    commit(D, 'Texte de remplacement'); D.renderProps();
  } catch (e) { toast(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), { kind: 'bad' }); }
}
