// NEXORA #053 : import de fichiers : Photoshop (PSD, calques séparés) sur ce PC ; fichiers Figma par l'API
// officielle avec le jeton de l'utilisateur (cadres importés en vecteurs modifiables).
import { esc, ico, uid, toast, busy, api, btn, pickFile, util, pl } from './ui.js';
import { parsePsd } from './pure.js';
import { FabricImage, Group, loadSVGFromString } from '../design/fab.js';

const done = (t) => { if (!t) return; if (t.close) t.close(); else if (t.remove) t.remove(); };
const clean = (e) => String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
async function newPage(D, name, w, h) {
  D.capturePage();
  D.doc.pages.splice(D.pageIdx + 1, 0, { id: uid(), name: name.slice(0, 80), w: Math.round(w), h: Math.round(h), bg: '#ffffff', json: { version: '6', objects: [] } });
  await D.openPage(D.pageIdx + 1, { save: false });
}
function rgbaUrl(rgba, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.length), w, h), 0, 0);
  return c.toDataURL('image/png');
}
export async function importPsd(D) {
  const f = await pickFile({ title: 'Document Photoshop', name: 'Photoshop', extensions: ['psd'], as: 'bytes' });
  if (!f || !f.data) return;
  const t = busy('Lecture du document Photoshop…');
  try {
    const psd = parsePsd(f.data);
    const name = (f.name || 'Photoshop').split(/[\\/]/).pop().replace(/\.psd$/i, '');
    await newPage(D, name, psd.width, psd.height);
    const list = psd.layers.length ? psd.layers : psd.composite ? [{ name, left: 0, top: 0, width: psd.width, height: psd.height, opacity: 1, visible: true, rgba: psd.composite }] : [];
    for (const l of list) {
      const img = await FabricImage.fromURL(rgbaUrl(l.rgba, l.width, l.height));
      img.set({ left: l.left, top: l.top, originX: 'left', originY: 'top', opacity: l.opacity, visible: l.visible });
      img.id = uid(); img.name = l.name;
      D.canvas.add(img);
    }
    D.canvas.requestRenderAll(); D.nxNextLabel = 'Import Photoshop'; D.changed(); D.save();
    if (D.renderLeft) D.renderLeft();
    toast(`${pl(list.length, 'calque importé', 'calques importés')} de « ${name} » sur une nouvelle page.`);
  } catch (e) { toast(clean(e), { kind: 'bad' }); } finally { done(t); }
}
export async function importFigma(D, st, rerender) {
  const url = (st.figmaUrl || '').trim();
  if (!url) { toast('Colle l’adresse du fichier Figma.'); return; }
  const t = busy('Lecture du fichier Figma…');
  try { st.figma = await api.invoke('dzx:figma-file', { url }); st.pick = new Set(); } catch (e) { toast(clean(e), { kind: 'bad' }); st.figma = null; } finally { done(t); }
  rerender();
}
export async function importFigmaFrames(D, st) {
  const ids = [...(st.pick || [])];
  if (!ids.length) { toast('Choisis au moins un cadre.'); return; }
  const t = busy(`Import de ${pl(ids.length, 'cadre', 'cadres')}…`);
  try {
    const svgs = await api.invoke('dzx:figma-svg', { key: st.figma.key, ids });
    for (const id of ids) {
      const fr = st.figma.frames.find((x) => x.id === id);
      if (!svgs[id]) continue;
      const { objects } = await loadSVGFromString(svgs[id]);
      await newPage(D, fr.name, fr.w, fr.h);
      const objs = objects.filter(Boolean);
      for (const o of objs) { o.id = uid(); if (!o.name) o.name = o.type === 'text' ? 'Texte' : 'Forme'; D.canvas.add(o); }
      D.canvas.requestRenderAll(); D.changed();
    }
    D.save(); if (D.renderLeft) D.renderLeft();
    toast(`${pl(ids.length, 'cadre importé', 'cadres importés')}, chacun sur une nouvelle page, en vecteurs modifiables.`);
  } catch (e) { toast(clean(e), { kind: 'bad' }); } finally { done(t); }
}
export function panel(D, st, has) {
  const f = st.figma;
  return `<div class="dzp-sub">Photoshop (PSD)</div>
    <p class="dzx-hint">Chaque calque devient un calque NEX-DESIGN, avec son nom, sa position, son opacité et sa visibilité (RVB 8 bits).</p>
    <div class="nx-btns">${btn('imp-psd', 'download', 'Importer un fichier PSD', has.std ? '' : 'disabled', 'primary')}</div>
    <div class="dzp-sub">Figma ${has.pro ? '' : '<em class="dzp-pro">Pro</em>'}</div>
    <p class="dzx-hint">Avec ton jeton d’accès personnel Figma (Réglages du compte Figma → Jetons d’accès), chiffré sur ce PC.</p>
    <label class="dzx-row"><span>Jeton</span><input class="input" type="password" data-figk="token" placeholder="${st.figmaToken ? 'Enregistré : laisse vide pour le garder' : 'figd_…'}" ${has.pro ? '' : 'disabled'}></label>
    <label class="dzx-row"><span>Fichier</span><input class="input" data-figk="url" value="${esc(st.figmaUrl || '')}" placeholder="https://www.figma.com/design/…" ${has.pro ? '' : 'disabled'}></label>
    <div class="nx-btns">${btn('imp-figma', 'search', 'Lire le fichier', has.pro ? '' : 'disabled')}</div>
    ${f ? `<p class="dzx-hint"><b>${esc(f.name)}</b> · ${pl(f.frames.length, 'cadre', 'cadres')}</p><div class="dzp-list">${f.frames.slice(0, 60).map((fr) => `<label class="dzp-item"><input type="checkbox" data-figpick="${esc(fr.id)}" ${st.pick && st.pick.has(fr.id) ? 'checked' : ''}><span><b>${esc(fr.name)}</b><small>${esc(fr.page)} · ${Math.round(fr.w)} × ${Math.round(fr.h)}</small></span></label>`).join('')}</div><div class="nx-btns">${btn('imp-figma-go', 'download', 'Importer les cadres choisis', '', 'primary')}</div>` : ''}
    <div class="dzp-sub">PDF</div>
    <p class="dzx-hint">${ico('info', 12)} L’import de PDF modifiable n’est pas encore disponible : exporte la page en SVG depuis ton logiciel, puis dépose le fichier sur la page.</p>`;
}
export async function onPanel(D, e, rerender, st) {
  const b = e.target.closest('[data-dzx]');
  if (!b) return false;
  if (b.dataset.dzx === 'imp-psd') { await importPsd(D); return true; }
  if (b.dataset.dzx === 'imp-figma') { await importFigma(D, st, rerender); return true; }
  if (b.dataset.dzx === 'imp-figma-go') { await importFigmaFrames(D, st); return true; }
  return false;
}
export async function onPanelInput(D, e, st, rerender) {
  const t = e.target;
  if (t.dataset.figk === 'url') { st.figmaUrl = t.value; return true; }
  if (t.dataset.figk === 'token' && e.type === 'change' && t.value.trim()) { try { await api.invoke('dzx:figma-token', { token: t.value.trim() }); st.figmaToken = true; toast('Jeton Figma enregistré sur ce PC.'); rerender(); } catch (er) { toast(clean(er), { kind: 'bad' }); } return true; }
  if (t.dataset.figpick) { st.pick = st.pick || new Set(); if (t.checked) st.pick.add(t.dataset.figpick); else st.pick.delete(t.dataset.figpick); return true; }
  return false;
}
export { Group, util };
