// NEXORA #053 : polices : celles installées sur le PC, une bibliothèque de polices libres (téléchargées une fois
// par NEXORA, utilisables hors ligne ensuite) et des associations titre + texte prêtes à appliquer.
import { esc, ico, toast, api, btn, isText, objs, walk, commit, settings, saveSettings } from './ui.js';

export const LIBRARY = ['Inter', 'Poppins', 'Montserrat', 'Roboto', 'Open Sans', 'Lato', 'DM Sans', 'Manrope', 'Plus Jakarta Sans', 'Outfit', 'Sora', 'Space Grotesk', 'Work Sans', 'Rubik', 'Nunito', 'Raleway', 'Mulish', 'Barlow', 'Kanit', 'Josefin Sans', 'IBM Plex Sans', 'Archivo', 'Syne', 'Oswald', 'Bebas Neue', 'Anton', 'Playfair Display', 'Merriweather', 'Lora', 'Fraunces', 'Cormorant Garamond', 'Libre Baskerville', 'Source Serif 4', 'Abril Fatface', 'JetBrains Mono', 'IBM Plex Mono', 'Caveat', 'Dancing Script', 'Pacifico', 'Quicksand'];
export const PAIRS = [['Playfair Display', 'Inter', 'Élégant'], ['Montserrat', 'Lora', 'Classique moderne'], ['Space Grotesk', 'DM Sans', 'Technologique'], ['Bebas Neue', 'Open Sans', 'Affiche'], ['Fraunces', 'Manrope', 'Éditorial'], ['Syne', 'Inter', 'Créatif'], ['Poppins', 'Nunito', 'Amical'], ['Oswald', 'Merriweather', 'Presse'], ['Sora', 'Work Sans', 'Startup'], ['Cormorant Garamond', 'Mulish', 'Luxe']];
const loaded = new Set();

export async function load(family) {
  if (loaded.has(family) || document.fonts.check(`16px "${family}"`) && !LIBRARY.includes(family)) return true;
  const r = await api.invoke('dzx:font', { family });
  for (const f of r.faces) {
    const bin = atob(f.data); const buf = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i += 1) buf[i] = bin.charCodeAt(i);
    const face = new FontFace(family, buf, { weight: String(f.weight), style: f.style });
    await face.load(); document.fonts.add(face);
  }
  loaded.add(family);
  const s = new Set(settings.nxFontsLoaded || []); s.add(family); settings.nxFontsLoaded = [...s]; saveSettings();
  return true;
}
// Polices déjà utilisées : rechargées au démarrage (copie gardée sur le PC).
export async function restore(D) {
  const used = new Set();
  walk(objs(D), (o) => { if (isText(o)) used.add(o.fontFamily); });
  for (const f of settings.nxFontsLoaded || []) if (used.has(f)) await load(f).catch(() => {});
  D.canvas.getObjects().forEach((o) => { if (isText(o) && o.initDimensions) { o.initDimensions(); o.dirty = true; } });
  D.canvas.requestRenderAll();
}
async function apply(D, family, targets) {
  try { await load(family); } catch (e) { if (!document.fonts.check(`16px "${family}"`)) { toast(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), { kind: 'bad' }); return; } }
  for (const o of targets) { o.set('fontFamily', family); if (o.initDimensions) o.initDimensions(); if (o.group) o.group.dirty = true; }
  commit(D, `Police ${family}`);
}
const texts = (list) => { const out = []; walk(list, (o) => { if (isText(o)) out.push(o); }); return out; };
export function panel(D, st) {
  const q = (st.q || '').toLowerCase();
  const lib = LIBRARY.filter((f) => f.toLowerCase().includes(q));
  const local = (st.local || []).filter((f) => f.toLowerCase().includes(q)).slice(0, 80);
  return `<p class="dzx-hint">${D.sel().length ? 'Clique sur une police pour l’appliquer aux textes sélectionnés.' : 'Sélectionne des textes, puis clique sur une police.'}</p>
    <input class="input" data-fk="q" value="${esc(st.q || '')}" placeholder="Rechercher une police" aria-label="Rechercher une police">
    <div class="dzp-sub">Associations titre + texte</div>
    <div class="dzp-pairs">${PAIRS.map(([a, b, l], i) => `<button class="dzp-pair" data-fpair="${i}"><b style="font-family:'${esc(a)}'">${esc(a)}</b><small style="font-family:'${esc(b)}'">${esc(b)} · ${esc(l)}</small></button>`).join('')}</div>
    <div class="dzp-sub">Bibliothèque de polices libres</div>
    <div class="dzp-fonts">${lib.map((f) => `<button class="dzp-font" data-ffam="${esc(f)}" style="font-family:'${esc(f)}', sans-serif">${esc(f)}${loaded.has(f) ? ` ${ico('pass', 11)}` : ''}</button>`).join('')}</div>
    <div class="dzp-sub">Installées sur ce PC</div>
    ${st.local ? `<div class="dzp-fonts">${local.map((f) => `<button class="dzp-font" data-ffam="${esc(f)}" data-local="1" style="font-family:'${esc(f)}', sans-serif">${esc(f)}</button>`).join('') || '<p class="dzx-hint">Aucune police trouvée.</p>'}</div>` : `<div class="nx-btns">${btn('font-local', 'search', 'Lister les polices de ce PC')}</div>`}`;
}
export async function onPanel(D, e, rerender, st) {
  const t = e.target;
  if (t.closest('[data-dzx="font-local"]')) {
    if (!window.queryLocalFonts) { toast('La liste des polices du PC n’est pas disponible ici.'); return true; }
    try { const fonts = await window.queryLocalFonts(); st.local = [...new Set(fonts.map((f) => f.family))].sort((a, b) => a.localeCompare(b)); } catch { toast('Autorise l’accès aux polices du PC pour les lister.'); st.local = []; }
    rerender(); return true;
  }
  const fam = t.closest('[data-ffam]');
  if (fam) { const sel = texts(D.sel()); if (!sel.length) { toast('Sélectionne d’abord un ou plusieurs textes.'); return true; } if (fam.dataset.local) { for (const o of sel) { o.set('fontFamily', fam.dataset.ffam); if (o.initDimensions) o.initDimensions(); } commit(D, 'Police'); } else await apply(D, fam.dataset.ffam, sel); rerender(); return true; }
  const pair = t.closest('[data-fpair]');
  if (pair) {
    const [a, b] = PAIRS[+pair.dataset.fpair];
    const all = texts(D.sel().length ? D.sel() : objs(D));
    if (!all.length) { toast('Aucun texte sur la page.'); return true; }
    const sizes = all.map((o) => o.fontSize * (o.scaleY || 1));
    const cut = Math.max(...sizes) * 0.62;
    await apply(D, a, all.filter((o, i) => sizes[i] >= cut));
    await apply(D, b, all.filter((o, i) => sizes[i] < cut));
    toast(`Titres en ${a}, textes en ${b}.`);
    rerender(); return true;
  }
  return false;
}
export function onPanelInput(D, e, st, rerender) { if (e.target.dataset.fk !== 'q') return false; st.q = e.target.value; rerender(true); return true; }
