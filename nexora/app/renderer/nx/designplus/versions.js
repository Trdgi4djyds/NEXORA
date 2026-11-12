// NEXORA #053 : versions nommées du document (« Envoyée au client »…), comparaison page à page avec la version
// actuelle et retour à une version (la version actuelle est d'abord gardée).
import { esc, ico, uid, toast, btn, prompt, util, has, STD, pl } from './ui.js';
import { Canvas } from '../design/fab.js';

const MAX = 15;
export const list = (D) => (D.doc.nxVersions = D.doc.nxVersions || []);
export function save(D, name) {
  D.capturePage();
  const v = { id: uid(), name: name || `Version ${list(D).length + 1}`, at: Date.now(), thumb: (() => { try { return D.thumb(); } catch { return null; } })(), pages: JSON.parse(JSON.stringify(D.doc.pages)) };
  list(D).unshift(v);
  if (list(D).length > MAX) list(D).length = MAX;
  D.save();
  return v;
}
// NEXORA #075 : versions automatiques, gardées sur ce PC (IndexedDB, hors du document : il ne grossit pas et la
// synchronisation reste légère) : une toutes les 10 minutes de travail, 20 au plus par document.
const AUTO_EVERY = 10 * 60000; const AUTO_MAX = 20;
function autoDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('nexora-design-autoversions', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('docs', { keyPath: 'docId' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function autoTx(mode, fn) {
  const db = await autoDb();
  return new Promise((res, rej) => { const t = db.transaction('docs', mode); const req = fn(t.objectStore('docs')); t.oncomplete = () => { db.close(); res(req && 'result' in req ? req.result : undefined); }; t.onerror = () => { db.close(); rej(t.error); }; });
}
export async function autoList(D) {
  if (!D.doc) return [];
  try { const r = await autoTx('readonly', (st) => st.get(D.doc.id)); return (r && r.list) || []; } catch { return []; }
}
export async function autoSnapshot(D) {
  if (!D.doc) return null;
  D.capturePage();
  const v = { id: uid(), name: 'Version automatique', at: Date.now(), auto: true, thumb: (() => { try { return D.thumb(); } catch { return null; } })(), pages: JSON.parse(JSON.stringify(D.doc.pages)) };
  const list = [v, ...(await autoList(D))].slice(0, AUTO_MAX);
  await autoTx('readwrite', (st) => st.put({ docId: D.doc.id, list }));
  return v;
}
export function startAuto(D) {
  if (D.nxAutoVer) return;
  D.nxAutoVer = { dirty: 0, last: Date.now(), doc: D.doc && D.doc.id };
  const proto = Object.getPrototypeOf(D);
  if (!proto.nxAutoChanged) { proto.nxAutoChanged = proto.changed; proto.changed = function () { this.nxAutoChanged(); if (this.nxAutoVer && !this.loading) this.nxAutoVer.dirty = this.nxAutoVer.dirty || Date.now(); }; }
  setInterval(async () => {
    const A = D.nxAutoVer;
    if (!D.doc || !has(STD)) return;
    if (A.doc !== D.doc.id) { A.doc = D.doc.id; A.dirty = 0; A.last = Date.now(); return; }
    if (!A.dirty || Date.now() - A.last < AUTO_EVERY) return;
    try { await autoSnapshot(D); A.last = Date.now(); A.dirty = 0; } catch (e) { console.warn('[NEXORA #075] version automatique', e); }
  }, 30000);
}
// Vignette d'une page enregistrée (rendu hors écran).
async function thumbOf(pg, w = 220) {
  const el = document.createElement('canvas');
  const k = w / pg.w;
  const c = new Canvas(el, { width: Math.round(pg.w * k), height: Math.round(pg.h * k), renderOnAddRemove: false, enableRetinaScaling: false, backgroundColor: pg.bg || '#ffffff', selection: false });
  try {
    const objs = await util.enlivenObjects((pg.json && pg.json.objects) || []);
    for (const o of objs) c.add(o);
    c.setZoom(k);
    c.renderAll();
    return c.toDataURL({ format: 'jpeg', quality: 0.8, multiplier: 1 });
  } catch { return ''; } finally { c.dispose(); }
}
export function panel(D, st) {
  const L = list(D);
  const A = st.auto || [];
  const autoHtml = `<div class="dzp-sub">Versions automatiques · sur ce PC</div><p class="dzx-hint">Une version est gardée toutes les 10 minutes de travail (${AUTO_MAX} au plus par document).</p>
    ${A.length ? `<div class="dzp-list">${A.map((v) => `<div class="dzp-item"><span class="dzp-thumb">${v.thumb ? `<img src="${esc(v.thumb)}" alt="">` : ico('image', 16)}</span><span><b>${new Date(v.at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</b><small>${pl(v.pages.length, 'page', 'pages')}</small></span><button class="icon-btn" data-vcmp="${esc(v.id)}" title="Comparer avec la version actuelle">${ico('eye', 13)}</button><button class="icon-btn" data-vrestore="${esc(v.id)}" title="Revenir à cette version">${ico('restart', 13)}</button></div>`).join('')}</div>` : '<p class="dzx-hint">Aucune pour l’instant : la première sera gardée après 10 minutes de travail sur ce document.</p>'}`;
  return `<p class="dzx-hint">Gardez une version à chaque étape importante. ${MAX} versions nommées au plus par document, plus les versions automatiques ; l’historique des actions reste disponible en plus.</p>
    <div class="nx-btns">${btn('ver-save', 'plus', 'Enregistrer une version', '', 'primary')}</div>
    ${L.length ? `<div class="dzp-list">${L.map((v) => `<div class="dzp-item"><span class="dzp-thumb">${v.thumb ? `<img src="${esc(v.thumb)}" alt="">` : ico('image', 16)}</span><span><b>${esc(v.name)}</b><small>${new Date(v.at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })} · ${pl(v.pages.length, 'page', 'pages')}</small></span><button class="icon-btn" data-vcmp="${esc(v.id)}" title="Comparer avec la version actuelle">${ico('eye', 13)}</button><button class="btn small" data-vrestore="${esc(v.id)}">Revenir</button><button class="icon-btn" data-vdelv="${esc(v.id)}" title="Supprimer cette version">${ico('trash', 13)}</button></div>`).join('')}</div>` : '<p class="dzx-hint">Aucune version enregistrée.</p>'}
    ${st.cmp ? `<div class="dzp-sub">Comparaison : « ${esc(st.cmp.name)} » et maintenant</div><div class="dzp-cmp">${st.cmp.rows.map((r) => `<div class="dzp-cmp-row"><figure>${r.a ? `<img src="${r.a}" alt="">` : '<span>—</span>'}<figcaption>${esc(r.na || 'Absente')}</figcaption></figure><figure>${r.b ? `<img src="${r.b}" alt="">` : '<span>—</span>'}<figcaption>${esc(r.nb || 'Absente')}</figcaption></figure></div>`).join('')}</div>` : ''}${autoHtml}`;
}
export async function onPanel(D, e, rerender, st) {
  const t = e.target;
  if (t.closest('[data-dzx="ver-save"]')) { const n = await prompt('Enregistrer une version', { label: 'Nom de la version', value: `Version ${list(D).length + 1}`, icon: 'nxHistory', go: 'Enregistrer' }); if (n !== null) { save(D, n.trim()); toast('Version enregistrée.'); rerender(); } return true; }
  const c = t.closest('[data-vcmp]');
  if (c) {
    const v = list(D).find((x) => x.id === c.dataset.vcmp) || (st.auto || []).find((x) => x.id === c.dataset.vcmp);
    D.capturePage();
    const n = Math.max(v.pages.length, D.doc.pages.length);
    const rows = [];
    for (let i = 0; i < Math.min(n, 8); i += 1) rows.push({ a: v.pages[i] ? await thumbOf(v.pages[i]) : '', na: v.pages[i] && v.pages[i].name, b: D.doc.pages[i] ? await thumbOf(D.doc.pages[i]) : '', nb: D.doc.pages[i] && D.doc.pages[i].name });
    st.cmp = { name: v.name, rows };
    rerender(); return true;
  }
  const r = t.closest('[data-vrestore]');
  if (r) {
    const v = list(D).find((x) => x.id === r.dataset.vrestore) || (st.auto || []).find((x) => x.id === r.dataset.vrestore);
    save(D, `Avant le retour à « ${v.auto ? `la version du ${new Date(v.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}` : v.name} »`);
    D.doc.pages = JSON.parse(JSON.stringify(v.pages));
    await D.openPage(0, { save: false });
    D.save(); if (D.renderLeft) D.renderLeft();
    toast(`Retour à « ${v.name} ». La version d’avant est gardée dans la liste.`);
    st.cmp = null; rerender(); return true;
  }
  const d = t.closest('[data-vdelv]');
  if (d) { D.doc.nxVersions = list(D).filter((x) => x.id !== d.dataset.vdelv); D.save(); rerender(); return true; }
  return false;
}
