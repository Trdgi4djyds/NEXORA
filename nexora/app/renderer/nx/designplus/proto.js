// NEXORA #053 : prototype cliquable : liens entre pages (clic), retour, adresse web, transitions ; lecture dans
// un cadre de téléphone ou en plein écran ; export en page HTML autonome.
import { esc, ico, toast, busy, sec, btn, objs, walk, textBytes, saveBytes } from './ui.js';

const TRANS = [['fade', 'Fondu'], ['slide', 'Glissement'], ['none', 'Immédiat']];
const done = (t) => { if (!t) return; if (t.close) t.close(); else if (t.remove) t.remove(); };
export function props(D, o) {
  if (!o) return '';
  const p = o.nxProto || {};
  const pages = D.doc.pages.map((pg, i) => [`page:${pg.id}`, `Aller à : ${pg.name || `Page ${i + 1}`}`]);
  const val = p.to === 'page' ? `page:${p.page}` : p.to || '';
  return sec('Prototype', `<label class="dzx-row"><span>Au clic</span><select class="input" data-dzxk="proto.to"><option value="">Aucune action</option>${pages.map(([v, l]) => `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(l)}</option>`).join('')}<option value="back" ${val === 'back' ? 'selected' : ''}>Revenir à la page précédente</option><option value="url" ${val === 'url' ? 'selected' : ''}>Ouvrir une adresse web</option></select></label>
    ${p.to === 'url' ? `<label class="dzx-row"><span>Adresse</span><input class="input" data-dzxk="proto.url" value="${esc(p.url || '')}" placeholder="https://"></label>` : ''}
    ${p.to && p.to !== 'url' ? `<label class="dzx-row"><span>Transition</span><select class="input" data-dzxk="proto.trans">${TRANS.map(([v, l]) => `<option value="${v}" ${(p.trans || 'fade') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
    <div class="nx-btns">${btn('proto-play', 'play', 'Tester le prototype')}</div>`);
}
export function onField(D, o, k, v) {
  if (!k.startsWith('proto.')) return false;
  const p = { ...(o.nxProto || {}) };
  if (k === 'proto.to') { if (!v) { delete o.nxProto; D.changed(); D.renderProps(); return true; } if (v.startsWith('page:')) { p.to = 'page'; p.page = v.slice(5); } else p.to = v; }
  if (k === 'proto.url') p.url = v;
  if (k === 'proto.trans') p.trans = v;
  o.nxProto = p;
  D.nxNextLabel = 'Lien du prototype'; D.changed(); D.renderProps();
  return true;
}
// Images des pages et zones cliquables.
export async function build(D, scale = 1) {
  const t = busy('Préparation du prototype…');
  const cur = D.pageIdx;
  const out = [];
  try {
    D.canvas.discardActiveObject();
    for (let i = 0; i < D.doc.pages.length; i += 1) {
      if (i !== D.pageIdx) await D.openPage(i, { save: false });
      const c = await D.exportCanvas(scale, false);
      const hot = [];
      walk(objs(D), (o) => { if (o.nxProto && o.nxProto.to) { const r = o.getBoundingRect(); hot.push({ x: r.left, y: r.top, w: r.width, h: r.height, ...o.nxProto }); } });
      out.push({ id: D.page.id, name: D.page.name, w: D.page.w, h: D.page.h, img: c.toDataURL('image/jpeg', 0.9), hot });
    }
    if (D.pageIdx !== cur) await D.openPage(cur, { save: false });
  } finally { done(t); }
  return out;
}
// Lecteur : même fonction dans NEXORA (appel direct) et dans la page HTML exportée (son code source, toString),
// sans évaluation de texte : la CSP de NEXORA interdit eval et new Function.
function player(P, host) {
  var hist = [], cur = 0;
  var view = document.createElement('div'); view.className = 'pp-view'; host.appendChild(view);
  function show(i, trans) {
    var p = P[i]; if (!p) return;
    var el = document.createElement('div'); el.className = 'pp-screen pp-' + (trans || 'none'); el.style.aspectRatio = p.w + '/' + p.h;
    var img = document.createElement('img'); img.src = p.img; img.alt = p.name; el.appendChild(img);
    p.hot.forEach(function (h) {
      var a = document.createElement('button'); a.className = 'pp-hot'; a.setAttribute('aria-label', h.to === 'url' ? h.url : 'Lien');
      a.style.left = (h.x / p.w * 100) + '%'; a.style.top = (h.y / p.h * 100) + '%'; a.style.width = (h.w / p.w * 100) + '%'; a.style.height = (h.h / p.h * 100) + '%';
      a.onclick = function () { go(h); }; el.appendChild(a);
    });
    el.onclick = function (e) { if (e.target === img) { el.classList.add('pp-hint'); setTimeout(function () { el.classList.remove('pp-hint'); }, 700); } };
    view.innerHTML = ''; view.appendChild(el); cur = i;
  }
  function go(h) {
    if (h.to === 'url') { if (/^https?:\/\//i.test(h.url || '')) window.open(h.url, '_blank', 'noopener'); return; }
    if (h.to === 'back') { if (hist.length) show(hist.pop(), h.trans); return; }
    var j = P.findIndex(function (p) { return p.id === h.page; }); if (j >= 0) { hist.push(cur); show(j, h.trans); }
  }
  function key(e) {
    if (!host.isConnected) { host.ownerDocument.removeEventListener('keydown', key); return; }
    if (e.key === 'ArrowRight' && cur < P.length - 1) { hist.push(cur); show(cur + 1, 'slide'); }
    if (e.key === 'ArrowLeft' && hist.length) show(hist.pop(), 'fade');
  }
  host.ownerDocument.addEventListener('keydown', key);
  show(0);
}
const CSS = '.pp-view{position:relative;display:grid;place-items:center;width:100%;height:100%}.pp-screen{position:relative;max-width:100%;max-height:100%;overflow:hidden;background:#fff}.pp-phone .pp-screen{width:100%;height:100%}.pp-screen img{display:block;width:100%;height:100%;object-fit:contain;user-select:none}.pp-hot{position:absolute;background:transparent;border:0;padding:0;cursor:pointer}.pp-hint .pp-hot{outline:2px solid #4f7cff;background:rgba(79,124,255,.18)}.pp-fade{animation:ppf .25s ease}.pp-slide{animation:pps .3s ease}@keyframes ppf{from{opacity:0}}@keyframes pps{from{transform:translateX(30%);opacity:.2}}.pp-phone{height:min(78vh,820px);aspect-ratio:9/19.5;padding:12px;border-radius:44px;background:#111;border:1px solid #333;box-sizing:border-box}.pp-phone .pp-screen{border-radius:32px}.pp-full{width:min(92vw,1400px);height:78vh}';

export async function play(D) {
  if (!D.doc.pages.length) return;
  const P = await build(D, 1);
  if (!P.some((p) => p.hot.length)) toast('Aucun lien pour l’instant : sélectionne un bouton, puis « Au clic » dans la section Prototype.');
  const ov = document.createElement('div');
  ov.className = 'dzx-player';
  ov.innerHTML = `<style>${CSS}</style><div class="dzx-player-bar"><b>Prototype · ${esc(D.doc.name || '')}</b><div class="seg"><button class="on" data-pmode="phone">${ico('phone', 13)} Téléphone</button><button data-pmode="full">${ico('display', 13)} Plein écran</button></div><span class="grow"></span><button class="btn small" data-pexport>${ico('download', 13)}<span>Exporter (HTML)</span></button><button class="icon-btn" data-pclose title="Fermer (Échap)">${ico('close', 15)}</button></div><div class="dzx-player-stage"><div class="pp-phone" data-pframe></div></div><p class="dzx-player-tip">Clique sur les zones liées · flèches du clavier pour avancer ou revenir · un clic ailleurs montre les zones</p>`;
  document.body.append(ov);
  const frame = ov.querySelector('[data-pframe]');
  const start = () => { frame.innerHTML = ''; const host = document.createElement('div'); host.style.cssText = 'width:100%;height:100%'; frame.append(host); player(P, host); };
  start();
  const close = () => { ov.remove(); window.removeEventListener('keydown', onEsc, true); };
  const onEsc = (e) => { if (e.key === 'Escape') close(); };
  window.addEventListener('keydown', onEsc, true);
  ov.addEventListener('click', async (e) => {
    if (e.target.closest('[data-pclose]')) close();
    const m = e.target.closest('[data-pmode]');
    if (m) { for (const b of ov.querySelectorAll('[data-pmode]')) b.classList.toggle('on', b === m); frame.className = m.dataset.pmode === 'phone' ? 'pp-phone' : 'pp-full'; start(); }
    if (e.target.closest('[data-pexport]')) await exportHtml(D, P);
  });
}
export async function exportHtml(D, P) {
  P = P || await build(D, 1);
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(D.doc.name || 'Prototype')}</title><style>html,body{margin:0;height:100%;background:#16171c;font-family:system-ui,sans-serif}#app{height:100vh;display:grid;place-items:center}${CSS}</style></head><body><div id="app"><div class="pp-phone" id="f"></div></div><script>var P=${JSON.stringify(P).replace(/</g, '\\u003c')};(${player.toString()})(P,document.getElementById('f'));<\/script></body></html>`;
  await saveBytes(textBytes(html), { name: `${D.doc.name || 'prototype'} (prototype)`, ext: 'html', kind: 'document', project: D.doc.name || 'NEXORA' });
}
export function panel(D) {
  let links = 0;
  walk(objs(D), (o) => { if (o.nxProto) links += 1; });
  return `<p class="dzx-hint">Sélectionne un élément (bouton, image, texte), puis choisis « Au clic » dans la section Prototype du panneau de droite : aller à une page, revenir ou ouvrir une adresse. ${links} lien(s) sur cette page.</p>
    <div class="nx-btns">${btn('proto-play', 'play', 'Tester le prototype', '', 'primary')}${btn('proto-export', 'download', 'Exporter en page HTML')}</div>
    <p class="dzx-hint">La page exportée s’ouvre dans n’importe quel navigateur, y compris sur téléphone : idéale pour faire tester un parcours.</p>`;
}
export async function onPanel(D, e) {
  const b = e.target.closest('[data-dzx]');
  if (!b) return false;
  if (b.dataset.dzx === 'proto-play') { await play(D); return true; }
  if (b.dataset.dzx === 'proto-export') { await exportHtml(D); return true; }
  return false;
}
