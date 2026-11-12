// NEXORA #055 : passerelles avec les autres espaces : une page d'un document NEX-DESIGN affichée sur l'écran de
// l'appareil sélectionné (rendue en image, comme « Image » de la section Écran).
import { d as listDocs, e as getDoc } from '../../dist/chunks/chunk-SKL2UTC7.js';
import { Canvas, util } from '../design/fab.js';
import { toast, busy, done } from './ui.js';

export async function designPages() {
  const docs = await listDocs();
  return docs.slice(0, 20);
}
async function renderPage(pg, max = 1600) {
  const k = Math.min(1, max / Math.max(pg.w, pg.h));
  const el = document.createElement('canvas');
  const c = new Canvas(el, { width: Math.round(pg.w * k), height: Math.round(pg.h * k), renderOnAddRemove: false, enableRetinaScaling: false, backgroundColor: pg.bg || '#ffffff', selection: false });
  try {
    for (const o of await util.enlivenObjects((pg.json && pg.json.objects) || [])) c.add(o);
    c.setZoom(k); c.renderAll();
    return c.toDataURL({ format: 'png', multiplier: 1 });
  } finally { c.dispose(); }
}
// NEXORA #100 : la même page en image (data:), pour l'écran d'un appareil réaliste (GLB).
export async function pageImage(docId, pageIdx = 0) {
  const doc = await getDoc(docId); const pg = doc && doc.pages[pageIdx];
  if (!pg) throw new Error('Page introuvable.');
  return { image: await renderPage(pg), label: `« ${doc.name} · ${pg.name} » affichée sur l’écran.` };
}
export async function toScreen(S, docId, pageIdx = 0) {
  const e = S.sel && S.objects.get(S.sel);
  if (!e || e.item.type !== 'device') { toast('Sélectionnez d’abord un appareil.', { kind: 'bad' }); return; }
  const t = busy('Rendu de la page NEX-DESIGN…');
  try {
    const doc = await getDoc(docId); const pg = doc && doc.pages[pageIdx];
    if (!pg) throw new Error('Page introuvable.');
    const id = await S.registerImage(await renderPage(pg));
    e.item.main = { src: 'image', imageId: id }; S.build(e.item); S.renderProps(); S.commit();
    toast(`« ${doc.name} · ${pg.name} » affichée sur l’écran.`);
  } catch (er) { toast(er.message || String(er), { kind: 'bad' }); } finally { done(t); }
}
