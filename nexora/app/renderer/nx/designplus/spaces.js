// NEXORA #053 : vers les autres espaces : icônes d'application à toutes les tailles (Android adaptative,
// Windows .ico, PWA, Play Store) depuis la sélection ou la page ; icône envoyée à l'App Builder ou au Desktop
// Builder ; maquette 3D de la page sur un téléphone ; prototype pour le Responsive Lab.
import { esc, ico, toast, busy, btn, state, saveBytes, zip, dataUrlBytes } from './ui.js';
import { buildIco } from './pure.js';

const done = (t) => { if (!t) return; if (t.close) t.close(); else if (t.remove) t.remove(); };
const until = async (test, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = test(); if (v) return v; await new Promise((r) => setTimeout(r, 100)); } return null; };
const go = (mode) => { const b = document.querySelector(`#modeSeg button[data-mode="${mode}"]`); if (b) b.click(); };

// Image source carrée (sélection ou page entière), sans les poignées de sélection.
async function source(D, st) {
  const c = D.canvas;
  const sel = D.sel();
  let el;
  if (sel.length) {
    const r = sel.reduce((a, o) => { const b = o.getBoundingRect(); return { l: Math.min(a.l, b.left), t: Math.min(a.t, b.top), r: Math.max(a.r, b.left + b.width), b: Math.max(a.b, b.top + b.height) }; }, { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity });
    const keep = c.getActiveObject();
    c.discardActiveObject(); c.renderAll();
    const hide = c.getObjects().filter((o) => !sel.includes(o) && o.visible !== false);
    for (const o of hide) o.visible = false;
    try { el = c.toCanvasElement(4, { left: r.l, top: r.t, width: r.r - r.l, height: r.b - r.t }); } finally { for (const o of hide) o.visible = true; if (keep) c.setActiveObject(keep); c.requestRenderAll(); }
  } else el = await D.exportCanvas(2, true);
  const s = Math.max(el.width, el.height);
  const sq = document.createElement('canvas'); sq.width = s; sq.height = s;
  const x = sq.getContext('2d');
  if (st.bg) { x.fillStyle = st.bgColor || '#ffffff'; x.fillRect(0, 0, s, s); }
  x.drawImage(el, (s - el.width) / 2, (s - el.height) / 2);
  return sq;
}
function sized(src, size, { pad = 0, round = false, bg = null } = {}) {
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  if (round) { x.beginPath(); x.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); x.clip(); }
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, size, size); }
  const inner = size * (1 - pad * 2);
  // Réduction par étapes : contours nets aux petites tailles.
  let cur = src;
  while (cur.width / 2 > inner) { const h = document.createElement('canvas'); h.width = Math.round(cur.width / 2); h.height = Math.round(cur.height / 2); const hx = h.getContext('2d'); hx.imageSmoothingQuality = 'high'; hx.drawImage(cur, 0, 0, h.width, h.height); cur = h; }
  x.drawImage(cur, size * pad, size * pad, inner, inner);
  return c;
}
const png = (c) => dataUrlBytes(c.toDataURL('image/png'));

export async function iconSet(D, st) {
  const src = await source(D, st);
  const bg = st.bg ? st.bgColor || '#ffffff' : null;
  const files = [];
  // Android : icônes classiques, rondes et adaptatives (premier plan dans la zone sûre de 66/108).
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(dens)) {
    files.push({ name: `android/res/mipmap-${d}/ic_launcher.png`, data: png(sized(src, 48 * k, { bg })) });
    files.push({ name: `android/res/mipmap-${d}/ic_launcher_round.png`, data: png(sized(src, 48 * k, { round: true, bg })) });
    files.push({ name: `android/res/mipmap-${d}/ic_launcher_foreground.png`, data: png(sized(src, 108 * k, { pad: 21 / 108 })) });
  }
  files.push({ name: 'android/res/mipmap-anydpi-v26/ic_launcher.xml', data: '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n  <background android:drawable="@color/ic_launcher_background"/>\n  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n' });
  files.push({ name: 'android/res/values/ic_launcher_background.xml', data: `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <color name="ic_launcher_background">${st.bgColor || '#FFFFFF'}</color>\n</resources>\n` });
  files.push({ name: 'android/play-store-512.png', data: png(sized(src, 512, { bg: bg || '#ffffff' })) });
  // Windows
  files.push({ name: 'windows/app.ico', data: buildIco([16, 24, 32, 48, 64, 128, 256].map((s) => ({ size: s, png: png(sized(src, s, { bg })) }))) });
  // Web (PWA)
  files.push({ name: 'web/icon-192.png', data: png(sized(src, 192, { bg })) });
  files.push({ name: 'web/icon-512.png', data: png(sized(src, 512, { bg })) });
  files.push({ name: 'web/icon-512-maskable.png', data: png(sized(src, 512, { pad: 0.1, bg: bg || '#ffffff' })) });
  files.push({ name: 'web/apple-touch-icon.png', data: png(sized(src, 180, { bg: bg || '#ffffff' })) });
  files.push({ name: 'web/favicon.ico', data: buildIco([16, 32, 48].map((s) => ({ size: s, png: png(sized(src, s, { bg })) }))) });
  files.push({ name: 'web/manifest-icons.json', data: JSON.stringify({ icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }, { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] }, null, 2) });
  return { files, png512: sized(src, 512, { bg }).toDataURL('image/png') };
}
export async function toAndroid(D, st) {
  const { png512 } = await iconSet(D, st);
  go('android');
  const a = await until(() => state.android && state.android.set && state.android.cfg && state.android);
  if (!a) { toast('Ouvre l’App Builder et choisis une application, puis réessaie.'); return; }
  a.set('icon.image', png512, { rerender: true });
  toast('Icône envoyée à l’application ouverte dans l’App Builder.');
}
export async function toDesktop(D, st) {
  const { png512 } = await iconSet(D, st);
  go('desktop');
  const d = await until(() => state.desktop && state.desktop.cfg && state.desktop);
  if (!d) { toast('Crée d’abord un logiciel dans le Desktop Builder, puis réessaie.'); return; }
  // Même enregistrement que l'import d'image du Desktop Builder (nx/desktop/index.js).
  const a = d.cfg;
  a.icon = { ...(a.icon || {}), image: png512, shape: st.bg ? 'rounded' : 'none', padding: st.bg ? 0 : 4 };
  d.iconUrl = null;
  d.save();
  if (d.section === 'icon') d.renderForm();
  if (d.renderPreview) d.renderPreview();
  toast('Icône envoyée au logiciel ouvert dans le Desktop Builder.');
}
// Maquette 3D : la page devient l'écran d'un téléphone en 3D, sur une nouvelle page.
export async function mockup3d(D) {
  const t = busy('Préparation de la maquette 3D…');
  try {
    D.canvas.discardActiveObject();
    const shot = (await D.exportCanvas(1, false)).toDataURL('image/jpeg', 0.92);
    const src = D.page;
    D.capturePage();
    const { uid } = await import('./ui.js');
    D.doc.pages.splice(D.pageIdx + 1, 0, { id: uid(), name: `${src.name} · maquette 3D`, w: 1080, h: 1080, bg: '#eef0f6', json: { version: '6', objects: [] } });
    await D.openPage(D.pageIdx + 1, { save: false });
    const screen = D.addAsset('image', shot, src.name);
    await D.add3d({ kind: 'device', deviceId: 'iphone-18-pro', screen });
    D.save();
  } catch (e) { toast(String(e.message || e), { kind: 'bad' }); } finally { done(t); }
}
export function panel(D, st) {
  return `<p class="dzx-hint">${D.sel().length ? 'Source : la sélection.' : 'Source : la page entière (sélectionne un logo pour n’utiliser que lui).'}</p>
    <label class="nxd-check dzx-check"><input type="checkbox" data-spk="bg" ${st.bg ? 'checked' : ''}> Fond plein</label>${st.bg ? `<input type="color" data-spk="bgColor" value="${esc(st.bgColor || '#ffffff')}" aria-label="Couleur du fond">` : ''}
    <div class="dzp-sub">Icônes d’application</div>
    <p class="dzx-hint">Android (classique, ronde, adaptative), Play Store 512 px, Windows (.ico 16 à 256 px), web (PWA, favicon, Apple).</p>
    <div class="nx-btns">${btn('sp-zip', 'nxZip', 'Toutes les icônes (ZIP)', '', 'primary')}${btn('sp-android', 'android', 'Icône de l’app Android')}${btn('sp-desktop', 'display', 'Icône du logiciel Windows')}</div>
    <div class="dzp-sub">Maquettes et appareils</div>
    <div class="nx-btns">${btn('sp-3d', 'cube', 'Maquette 3D de la page')}${btn('sp-proto', 'phone', 'Prototype sur un téléphone')}</div>
    <p class="dzx-hint">Pour le Responsive Lab, exporte le prototype en page HTML (onglet Prototype) et ouvre-la dans un appareil.</p>`;
}
export async function onPanel(D, e, rerender, st) {
  const b = e.target.closest('[data-dzx]');
  if (!b) return false;
  const a = b.dataset.dzx;
  if (a === 'sp-zip') { const t = busy('Création des icônes…'); try { const { files } = await iconSet(D, st); await saveBytes(zip(files), { name: `${D.doc.name || 'icones'} (icônes)`, ext: 'zip', kind: 'document', project: D.doc.name || 'NEXORA' }); } finally { done(t); } return true; }
  if (a === 'sp-android') { await toAndroid(D, st); return true; }
  if (a === 'sp-desktop') { await toDesktop(D, st); return true; }
  if (a === 'sp-3d') { await mockup3d(D); return true; }
  if (a === 'sp-proto') { (await import('./proto.js')).play(D); return true; }
  return false;
}
export function onPanelInput(D, e, st, rerender) {
  const k = e.target.dataset.spk;
  if (!k) return false;
  st[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  if (k === 'bg') rerender();
  return true;
}
export { ico };
