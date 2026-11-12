// NEXORA #053 : prototype cliquable : liens entre pages (clic), retour, adresse web, transitions ; lecture dans
// un cadre de téléphone ou en plein écran ; export en page HTML autonome.
// NEXORA #113 (Motion, d'après desigma) : pages animées jouées à l'arrivée (images calculées une fois, aussi dans la
// page HTML exportée) ; action « Contrôler l'animation » (lire, depuis le début, pause, recommencer, lire ou pause) ;
// déclencheurs pendant le survol et pendant l'appui (retour à l'état de départ ensuite), après un délai, touche du
// clavier ; transition « Smart Animate » : les calques de même nom passent en douceur d'une page à l'autre.
import { esc, ico, toast, busy, sec, btn, objs, walk, textBytes, saveBytes, pl } from './ui.js';
import { Canvas, util } from '../design/fab.js';
import * as PG from '../design/pages.js';
import * as M from './motion-model.js';

const TRANS = [['fade', 'Fondu'], ['slide', 'Glissement'], ['smart', 'Smart Animate (mêmes calques)'], ['none', 'Immédiat']];
const done = (t) => { if (!t) return; if (t.close) t.close(); else if (t.remove) t.remove(); };
// NEXORA #075 : déclencheur au survol, ouverture d'une page en superposition (fenêtre, menu) et fermeture,
// passage automatique à une autre page après un délai (réglage de la page).
// NEXORA #113 : pendant le survol, pendant l'appui, après un délai, touche du clavier.
const TRIGGERS = [['click', 'Au clic'], ['hover', 'Au survol'], ['while-hover', 'Pendant le survol'], ['press', 'Pendant l’appui'], ['delay', 'Après un délai'], ['key', 'Touche du clavier']];
const OPS = [['play', 'Lire'], ['start', 'Lire depuis le début'], ['pause', 'Pause'], ['restart', 'Recommencer'], ['toggle', 'Lire ou mettre en pause']];
export function props(D, o) {
  if (!o) return '';
  const p = o.nxProto || {};
  const pages = D.doc.pages.map((pg, i) => [pg.id, pg.name || `Page ${i + 1}`]);
  const val = p.to === 'page' ? `page:${p.page}` : p.to === 'overlay' ? `overlay:${p.page}` : p.to || '';
  const on = p.on || 'click';
  return sec('Prototype', `<label class="dzx-row"><span>Déclencheur</span><select class="input" data-dzxk="proto.on">${TRIGGERS.map(([v, l]) => `<option value="${v}" ${on === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    ${on === 'delay' ? `<label class="dzx-row"><span>Délai (s)</span><input class="input" type="number" min="0" max="60" step="0.1" data-dzxk="proto.delay" value="${p.delay ?? 1}"></label>` : ''}
    ${on === 'key' ? `<label class="dzx-row"><span>Touche</span><input class="input" maxlength="12" data-dzxk="proto.key" value="${esc(p.key || '')}" placeholder="Ex. : Entrée, a, ArrowDown"></label>` : ''}
    <label class="dzx-row"><span>Action</span><select class="input" data-dzxk="proto.to"><option value="">Aucune action</option><optgroup label="Aller à une page">${pages.map(([id, l]) => `<option value="page:${esc(id)}" ${`page:${id}` === val ? 'selected' : ''}>${esc(l)}</option>`).join('')}</optgroup><optgroup label="Ouvrir par-dessus (fenêtre, menu)">${pages.map(([id, l]) => `<option value="overlay:${esc(id)}" ${`overlay:${id}` === val ? 'selected' : ''}>${esc(l)}</option>`).join('')}</optgroup><optgroup label="Autres"><option value="anim" ${val === 'anim' ? 'selected' : ''}>Contrôler l’animation de la page</option><option value="close" ${val === 'close' ? 'selected' : ''}>Fermer la page ouverte par-dessus</option><option value="back" ${val === 'back' ? 'selected' : ''}>Revenir à la page précédente</option><option value="url" ${val === 'url' ? 'selected' : ''}>Ouvrir une adresse web</option></optgroup></select></label>
    ${p.to === 'url' ? `<label class="dzx-row"><span>Adresse</span><input class="input" data-dzxk="proto.url" value="${esc(p.url || '')}" placeholder="https://"></label>` : ''}
    ${p.to === 'anim' ? `<label class="dzx-row"><span>Animation</span><select class="input" data-dzxk="proto.op">${OPS.map(([v, l]) => `<option value="${v}" ${(p.op || 'play') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><p class="dzx-hint">Une page qui a cette action attend d’être lancée ; les autres pages animées se jouent dès l’arrivée. Pendant le survol ou l’appui, l’animation revient au départ ensuite.</p>` : ''}
    ${p.to && !['url', 'close', 'anim'].includes(p.to) ? `<label class="dzx-row"><span>Transition</span><select class="input" data-dzxk="proto.trans">${TRANS.map(([v, l]) => `<option value="${v}" ${(p.trans || 'fade') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
    <div class="nx-btns">${btn('proto-play', 'play', 'Tester le prototype')}</div>`);
}
// Réglage de la page (panneau de droite sans sélection) : passage automatique.
export function pageProps(D) {
  const a = D.page.nxProtoAuto || {};
  const pages = D.doc.pages.filter((pg) => pg.id !== D.page.id).map((pg) => [pg.id, pg.name || 'Page']);
  return sec('Prototype de la page', `<label class="dzx-row"><span>Ensuite</span><select class="input" data-dzxk="protoauto.page"><option value="">Rester sur cette page</option>${pages.map(([id, l]) => `<option value="${esc(id)}" ${a.page === id ? 'selected' : ''}>Aller à : ${esc(l)}</option>`).join('')}</select></label>
    ${a.page ? `<label class="dzx-row"><span>Après</span><input class="input" type="number" min="0.5" max="60" step="0.5" data-dzxk="protoauto.delay" value="${a.delay || 3}"></label><p class="dzx-hint">Secondes : écran d’accueil, annonce, démonstration qui avance seule.</p>` : ''}`);
}
export function onField(D, o, k, v) {
  if (k.startsWith('protoauto.')) {
    const a = { delay: 3, ...(D.page.nxProtoAuto || {}) };
    if (k === 'protoauto.page') { if (!v) { delete D.page.nxProtoAuto; D.changed(); D.renderProps(); return true; } a.page = v; }
    if (k === 'protoauto.delay') a.delay = Math.max(0.5, Math.min(60, Number(v) || 3));
    D.page.nxProtoAuto = a; D.nxNextLabel = 'Prototype de la page'; D.changed(); D.renderProps();
    return true;
  }
  if (!o || !k.startsWith('proto.')) return false;
  const p = { ...(o.nxProto || {}) };
  if (k === 'proto.to') {
    if (!v) { delete o.nxProto; D.changed(); D.renderProps(); return true; }
    if (v.startsWith('page:')) { p.to = 'page'; p.page = v.slice(5); } else if (v.startsWith('overlay:')) { p.to = 'overlay'; p.page = v.slice(8); } else { p.to = v; delete p.page; }
    if (p.to === 'anim' && !p.op) p.op = 'play';
  }
  if (k === 'proto.on') { p.on = v; if (!p.to) { o.nxProto = p; D.renderProps(); return true; } }
  if (k === 'proto.url') p.url = v;
  if (k === 'proto.trans') p.trans = v;
  if (k === 'proto.op') p.op = v;
  if (k === 'proto.delay') p.delay = Math.max(0, Math.min(60, Number(String(v).replace(',', '.')) || 0));
  if (k === 'proto.key') p.key = String(v || '').trim().slice(0, 12);
  o.nxProto = p;
  D.nxNextLabel = 'Lien du prototype'; D.changed(); D.renderProps();
  return true;
}

// NEXORA #113 : Smart Animate : images de la transition d'une page à l'autre ; chaque calque qui porte le même nom
// (ou, sans nom, le même identifiant : page dupliquée) et le même type sur les deux pages glisse de sa place à l'autre (position, taille, rotation, opacité, couleur),
// les autres disparaissent ou apparaissent en fondu. Null s'il n'y a aucun calque en commun.
async function smartFrames(from, to, scale) {
  if (!from.json || !to.json) return null;
  let a; let b;
  try {
    const enl = async (pg) => (await util.enlivenObjects((pg.json.objects || []).filter((x) => x.id !== '__board')));
    [a, b] = await Promise.all([enl(from), enl(to)]);
  } catch { return null; }
  // Même nom de calque, sinon même identifiant (page dupliquée).
  const keyOf = (o) => (o.name ? `n:${o.name}` : o.id ? `i:${o.id}` : '');
  const used = new Set(); const pairs = [];
  for (const x of a) { const kx = keyOf(x); if (!kx) continue; const y = b.find((o) => !used.has(o) && keyOf(o) === kx && o.type === x.type); if (y) { used.add(y); pairs.push([x, y]); } }
  if (!pairs.length) return null;
  const W = Math.max(2, Math.round(to.w * scale)); const H = Math.max(2, Math.round(to.h * scale));
  const el = document.createElement('canvas');
  const c = new Canvas(el, { width: W, height: H, renderOnAddRemove: false, enableRetinaScaling: false, selection: false, skipOffscreen: false });
  c.setZoom(scale);
  const st = (o) => ({ c: o.getCenterPoint(), sx: o.scaleX, sy: o.scaleY, w: o.getScaledWidth() || 1, h: o.getScaledHeight() || 1, angle: o.angle || 0, opacity: o.opacity ?? 1, fill: o.fill });
  const anim = pairs.map(([x, y]) => [x, st(x), st(y)]);
  const gone = a.filter((x) => !pairs.some((p) => p[0] === x)).map((o) => [o, o.opacity ?? 1]);
  const fresh = b.filter((y) => !used.has(y)).map((o) => [o, o.opacity ?? 1]);
  for (const [o] of gone) c.add(o);
  for (const o of b) { const p = pairs.find((q) => q[1] === o); c.add(p ? p[0] : o); }
  const frames = []; const n = 14;
  try {
    for (let i = 0; i <= n; i += 1) {
      const k = M.ease('inout', i / n);
      for (const [x, s, e] of anim) {
        x.set({ scaleX: s.sx * (1 + (e.w / s.w - 1) * k), scaleY: s.sy * (1 + (e.h / s.h - 1) * k), angle: s.angle + (e.angle - s.angle) * k, opacity: s.opacity + (e.opacity - s.opacity) * k });
        if (typeof s.fill === 'string' && typeof e.fill === 'string' && s.fill && e.fill) x.set('fill', M.lerpValue('color', s.fill, e.fill, k));
        x.setPositionByOrigin({ x: s.c.x + (e.c.x - s.c.x) * k, y: s.c.y + (e.c.y - s.c.y) * k }, 'center', 'center');
        x.setCoords(); x.dirty = true;
      }
      for (const [o, op] of gone) o.set('opacity', op * (1 - k));
      for (const [o, op] of fresh) o.set('opacity', op * k);
      c.backgroundColor = M.lerpValue('color', from.bg || '#ffffff', to.bg || '#ffffff', k);
      c.renderAll();
      frames.push(el.toDataURL('image/jpeg', 0.85));
    }
  } finally { try { c.dispose(); } catch { /* déjà libéré */ } }
  return frames;
}

// Images des pages et zones cliquables.
export async function build(D, scale = 1) {
  const t = busy('Préparation du prototype…');
  const cur = D.pageIdx;
  const out = [];
  try {
    D.canvas.discardActiveObject();
    D.capturePage();
    for (let i = 0; i < D.doc.pages.length; i += 1) {
      if (i !== D.pageIdx) await D.openPage(i, { save: false });
      const c = await D.exportCanvas(scale, false);
      const hot = [];
      let wait = false;
      walk(objs(D), (o) => { if (o.nxProto && o.nxProto.to) { const r = o.getBoundingRect(); hot.push({ x: r.left, y: r.top, w: r.width, h: r.height, ...o.nxProto }); if (o.nxProto.to === 'anim') wait = true; } });
      // NEXORA #113 : page animée : images de toute la frise (24 images par seconde au plus, 720 px au plus).
      let anim = null;
      if (PG.hasAnim(D)) {
        const tl = PG.pageTimeline(D.page); const fps = Math.min(24, tl.fps); const n = M.frameCount(tl.ms, fps);
        const k = Math.min(scale, 720 / Math.max(D.page.w, D.page.h));
        const frames = [];
        for (let f = 0; f < n; f += 1) {
          frames.push(PG.renderAt(D, (f / fps), k).toDataURL('image/jpeg', 0.82));
          if (f % 8 === 0 && t.update) t.update(`Préparation du prototype : animation de la page ${i + 1}, ${Math.round((f / n) * 100)} %`);
        }
        anim = { frames, fps, loop: tl.loop, wait };
      }
      out.push({ id: D.page.id, name: D.page.name, w: D.page.w, h: D.page.h, img: c.toDataURL('image/jpeg', 0.9), hot, anim, auto: D.page.nxProtoAuto && D.page.nxProtoAuto.page ? { page: D.page.nxProtoAuto.page, delay: D.page.nxProtoAuto.delay || 3 } : null });
    }
    if (D.pageIdx !== cur) await D.openPage(cur, { save: false });
    // NEXORA #113 : transitions Smart Animate, une par lien.
    for (const p of out) {
      for (const h of p.hot) {
        if (h.trans !== 'smart' || !h.page || (p.smart && p.smart[h.page])) continue;
        const from = D.doc.pages.find((pg) => pg.id === p.id); const to = D.doc.pages.find((pg) => pg.id === h.page);
        if (!from || !to) continue;
        const frames = await smartFrames(from, to, Math.min(scale, 720 / Math.max(to.w, to.h))).catch(() => null);
        if (frames) { p.smart = p.smart || {}; p.smart[h.page] = frames; }
      }
    }
  } finally { done(t); }
  return out;
}
// Lecteur : même fonction dans NEXORA (appel direct) et dans la page HTML exportée (son code source, toString),
// sans évaluation de texte : la CSP de NEXORA interdit eval et new Function.
function player(P, host) {
  var hist = [], cur = 0, timer = 0, over = null, timers = [], ctl = null, keys = [];
  var view = document.createElement('div'); view.className = 'pp-view'; host.appendChild(view);
  // Animation d'une page (NEXORA #113) : images jouées selon le temps écoulé.
  function animate(p, img) {
    var a = p.anim, t = 0, playing = false, last = 0, raf = 0, n = a.frames.length, dur = n / a.fps;
    function draw() { var i = a.loop ? Math.floor(t * a.fps) % n : Math.min(n - 1, Math.floor(t * a.fps)); img.src = a.frames[i]; }
    function tick(now) { if (!playing || !img.isConnected) return; t += (now - last) / 1000; last = now; if (!a.loop && t >= dur) { t = dur; playing = false; } draw(); if (playing) raf = requestAnimationFrame(tick); }
    var c = {
      play: function () { if (playing) return; if (!a.loop && t >= dur) t = 0; playing = true; last = performance.now(); raf = requestAnimationFrame(tick); },
      pause: function () { playing = false; cancelAnimationFrame(raf); },
      seek: function (x) { t = x; draw(); },
      start: function () { c.seek(0); c.play(); },
      restart: function () { c.pause(); c.seek(0); c.play(); },
      toggle: function () { if (playing) c.pause(); else c.play(); }
    };
    draw();
    if (!a.wait) c.play();
    return c;
  }
  function clear() { timers.forEach(clearTimeout); timers = []; keys = []; }
  function screen(p, trans, top) {
    var el = document.createElement('div'); el.className = 'pp-screen pp-' + (trans || 'none'); el.style.aspectRatio = p.w + '/' + p.h;
    var img = document.createElement('img'); img.src = p.img; img.alt = p.name; el.appendChild(img);
    var c = p.anim && p.anim.frames.length ? animate(p, img) : null;
    if (top) ctl = c;
    p.hot.forEach(function (h) {
      var a = document.createElement('button'); a.className = 'pp-hot'; a.setAttribute('aria-label', h.to === 'url' ? h.url : h.to === 'anim' ? 'Animation' : 'Lien');
      a.style.left = (h.x / p.w * 100) + '%'; a.style.top = (h.y / p.h * 100) + '%'; a.style.width = (h.w / p.w * 100) + '%'; a.style.height = (h.h / p.h * 100) + '%';
      var revert = function () { if (h.to === 'anim' && c) { c.pause(); c.seek(0); } else if (h.to === 'overlay') closeOver(); };
      if (h.on === 'hover') a.onmouseenter = function () { go(h, c); };
      else if (h.on === 'while-hover') { a.onmouseenter = function () { go(h, c); }; a.onmouseleave = revert; }
      else if (h.on === 'press') { a.onpointerdown = function (e) { e.stopPropagation(); go(h, c); }; a.onpointerup = revert; a.onpointerleave = revert; }
      else if (h.on === 'delay') { a.tabIndex = -1; timers.push(setTimeout(function () { if (el.isConnected) go(h, c); }, (h.delay || 0) * 1000)); }
      else if (h.on === 'key') { a.tabIndex = -1; keys.push({ key: String(h.key || '').toLowerCase(), h: h, c: c }); }
      else a.onclick = function (e) { e.stopPropagation(); go(h, c); };
      el.appendChild(a);
    });
    el.onclick = function (e) { if (e.target === img) { el.classList.add('pp-hint'); setTimeout(function () { el.classList.remove('pp-hint'); }, 700); } };
    return el;
  }
  function closeOver() { if (over) { over.remove(); over = null; } }
  function show(i, trans) {
    var p = P[i]; if (!p) return;
    clearTimeout(timer); clear(); closeOver();
    view.innerHTML = ''; view.appendChild(screen(p, trans, true)); cur = i;
    if (p.auto) timer = setTimeout(function () { go({ to: 'page', page: p.auto.page, trans: 'fade' }); }, p.auto.delay * 1000);
  }
  // Transition Smart Animate : images calculées par NEXORA, puis la page d'arrivée.
  function smart(frames, then) {
    clearTimeout(timer); clear(); closeOver();
    var el = document.createElement('div'); el.className = 'pp-screen'; el.style.aspectRatio = P[cur].w + '/' + P[cur].h;
    var img = document.createElement('img'); img.alt = ''; el.appendChild(img);
    view.innerHTML = ''; view.appendChild(el);
    var i = 0, start = performance.now();
    (function step(now) { i = Math.min(frames.length - 1, Math.floor((now - start) / (1000 / 30))); img.src = frames[i]; if (i < frames.length - 1) requestAnimationFrame(step); else then(); })(start);
  }
  function openOver(j, trans) {
    closeOver();
    over = document.createElement('div'); over.className = 'pp-over';
    over.onclick = function (e) { if (e.target === over) closeOver(); };
    var el = screen(P[j], trans || 'fade', false); el.classList.add('pp-over-screen');
    el.style.width = Math.min(100, P[j].w / P[cur].w * 100) + '%';
    over.appendChild(el); view.firstChild.appendChild(over);
  }
  function go(h, c) {
    if (h.to === 'url') { if (/^https?:\/\//i.test(h.url || '')) window.open(h.url, '_blank', 'noopener'); return; }
    if (h.to === 'anim') { var k = c || ctl; if (k && k[h.op || 'play']) k[h.op || 'play'](); return; }
    if (h.to === 'close') { closeOver(); return; }
    if (h.to === 'back') { if (over) { closeOver(); return; } if (hist.length) show(hist.pop(), h.trans === 'smart' ? 'fade' : h.trans); return; }
    var j = P.findIndex(function (p) { return p.id === h.page; }); if (j < 0) return;
    if (h.to === 'overlay') { openOver(j, h.trans === 'smart' ? 'fade' : h.trans); return; }
    hist.push(cur);
    var f = h.trans === 'smart' && P[cur].smart && P[cur].smart[h.page];
    if (f) smart(f, function () { show(j, 'none'); }); else show(j, h.trans === 'smart' ? 'fade' : h.trans);
  }
  var names = { entrée: 'enter', espace: ' ', échap: 'escape', haut: 'arrowup', bas: 'arrowdown', gauche: 'arrowleft', droite: 'arrowright' };
  function key(e) {
    if (!host.isConnected) { host.ownerDocument.removeEventListener('keydown', key); clearTimeout(timer); clear(); return; }
    var k = String(e.key || '').toLowerCase();
    var hit = keys.find(function (x) { return x.key && (x.key === k || names[x.key] === k); });
    if (hit) { e.preventDefault(); go(hit.h, hit.c); return; }
    if (e.key === 'ArrowRight' && cur < P.length - 1) { hist.push(cur); show(cur + 1, 'slide'); }
    if (e.key === 'ArrowLeft' && hist.length) show(hist.pop(), 'fade');
  }
  host.ownerDocument.addEventListener('keydown', key);
  show(0);
}
const CSS = '.pp-view{position:relative;display:grid;place-items:center;width:100%;height:100%}.pp-screen{position:relative;max-width:100%;max-height:100%;overflow:hidden;background:#fff}.pp-phone .pp-screen{width:100%;height:100%}.pp-screen img{display:block;width:100%;height:100%;object-fit:contain;user-select:none}.pp-hot{position:absolute;background:transparent;border:0;padding:0;cursor:pointer}.pp-hint .pp-hot{outline:2px solid #4f7cff;background:rgba(79,124,255,.18)}.pp-fade{animation:ppf .25s ease}.pp-slide{animation:pps .3s ease}.pp-over{position:absolute;inset:0;display:grid;place-items:center;background:rgba(10,10,14,.45)}.pp-over-screen{max-height:96%}@keyframes ppf{from{opacity:0}}@keyframes pps{from{transform:translateX(30%);opacity:.2}}.pp-phone{height:min(78vh,820px);aspect-ratio:9/19.5;padding:12px;border-radius:44px;background:#111;border:1px solid #333;box-sizing:border-box}.pp-phone .pp-screen{border-radius:32px}.pp-full{width:min(92vw,1400px);height:78vh}';

export async function play(D) {
  if (!D.doc.pages.length) return;
  const P = await build(D, 1);
  if (!P.some((p) => p.hot.length || p.auto || p.anim)) toast('Aucun lien pour l’instant : sélectionnez un bouton, puis réglez son action dans l’onglet « Prototype » du panneau de droite.');
  const ov = document.createElement('div');
  ov.className = 'dzx-player';
  ov.innerHTML = `<style>${CSS}</style><div class="dzx-player-bar"><b>Prototype · ${esc(D.doc.name || '')}</b><div class="seg"><button class="on" data-pmode="phone">${ico('phone', 13)} Téléphone</button><button data-pmode="full">${ico('display', 13)} Plein écran</button></div><span class="grow"></span><button class="btn small" data-pexport>${ico('download', 13)}<span>Exporter (HTML)</span></button><button class="icon-btn" data-pclose title="Fermer (Échap)">${ico('close', 15)}</button></div><div class="dzx-player-stage"><div class="pp-phone" data-pframe></div></div><p class="dzx-player-tip">Cliquez sur les zones liées · flèches du clavier pour avancer ou revenir · un clic ailleurs montre les zones</p>`;
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
  return `<p class="dzx-hint">Sélectionnez un élément (bouton, image, texte), puis réglez son action dans l’onglet « Prototype » du panneau de droite (au clic, au survol, pendant l’appui, après un délai, touche du clavier) : aller à une page, ouvrir une page par-dessus, revenir, ouvrir une adresse, contrôler l’animation de la page. Sans sélection, la page peut aussi avancer seule après un délai. ${links ? pl(links, 'lien', 'liens') : 'Aucun lien'} sur cette page.</p>
    <div class="nx-btns">${btn('proto-play', 'play', 'Tester le prototype', '', 'primary')}${btn('proto-export', 'download', 'Exporter en page HTML')}</div>
    <p class="dzx-hint">La page exportée s’ouvre dans n’importe quel navigateur, y compris sur téléphone : idéale pour faire tester un parcours. Les pages animées et les transitions Smart Animate y sont jouées.</p>`;
}
export async function onPanel(D, e) {
  const b = e.target.closest('[data-dzx]');
  if (!b) return false;
  if (b.dataset.dzx === 'proto-play') { await play(D); return true; }
  if (b.dataset.dzx === 'proto-export') { await exportHtml(D); return true; }
  return false;
}
