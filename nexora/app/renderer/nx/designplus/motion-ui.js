// NEXORA #113 : Motion de NEX-DESIGN, interface (d'après le mode Motion de desigma, MIT ou Apache-2.0) :
//  - frise sous le canevas (bouton « Animation » de la barre d'outils) : durée, images par seconde, boucle,
//    enregistrement automatique, tête de lecture à faire glisser, une ligne par calque animé, pistes des propriétés,
//    images clés à déplacer (Alt : copier), clips à décaler et à étirer, raccourcis (Espace, Suppr, flèches) ;
//  - onglet « Animation » du panneau de droite : valeurs à la tête de lecture avec ◇ (image clé), animations toutes
//    faites (41, en clips modifiables), courbe de l'image clé choisie ; code CSS, SwiftUI et Compose (onglet Code) ;
//  - éditeur de courbe (maintien, courbes, ressorts, poignées à faire glisser) et éditeur de clip ;
//  - trajectoire de la position dessinée sur la page.
import { esc, ico, toast, popover, closePopover, sheet, sheetHtml, settings, saveSettings, el, api } from '../core.js';
import { a as ICONS } from '../../dist/chunks/chunk-S4I2LXHS.js';
import { has, allowed, STD, sec } from './ui.js';
import * as M from './motion-model.js';
import * as ML from './motion-live.js';
import * as PG from '../design/pages.js';

Object.assign(ICONS, {
  nxMoKey: ICONS.nxMoKey || '<path d="M12 3.6 20.4 12 12 20.4 3.6 12Z"/>',
  nxToStart: ICONS.nxToStart || '<path d="M6.5 5v14"/><path d="M18.5 5.5 9.5 12l9 6.5Z"/>',
  nxMoPrev: ICONS.nxMoPrev || '<path d="m14.5 6-6 6 6 6"/><path d="M19 12h-9"/>',
  nxMoNext: ICONS.nxMoNext || '<path d="m9.5 6 6 6-6 6"/><path d="M5 12h9"/>'
});

const ST = new WeakMap();
const S = (D) => { let s = ST.get(D); if (!s) { s = { open: false, t: 0, playing: false, raf: 0, sel: null, exp: new Set(), el: null }; ST.set(D, s); } return s; };
const tlOf = (D) => M.timeline(PG.pageAnim(D.page || {}));
const autoKey = () => Boolean(settings.nxMotionAutoKey);
const canEdit = (what = 'L’animation (Motion)') => allowed(STD, what);
const byId = (D, id) => ML.objs(D).find((o) => String(o.id) === String(id)) || null;
const selected = (D) => (D.sel ? D.sel() : []).filter((o) => !o.group || o.group.type === 'activeselection');
const fmtS = (ms) => M.formatTime(ms);
const secStr = (ms) => String(Math.round(ms) / 1000).replace('.', ',');
const num = (v, d = 2) => { const r = Math.round(v * 10 ** d) / 10 ** d; return String(Object.is(r, -0) ? 0 : r); };
const clean = (e) => String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const CLIP_SHORT = { position: 'position', scale: 'échelle', rotation: 'rotation', size: 'taille', opacity: 'opacité' };

// ---------- Ouverture, tête de lecture, lecture ----------
export const isOpen = (D) => S(D).open;
export function time(D) { return S(D).t; }
export function toggle(D) { if (S(D).open) close(D); else open(D); }
export function open(D) {
  const s = S(D);
  if (s.open) return;
  const main = D.$.stage && D.$.stage.parentElement;
  if (!main) return;
  s.open = true;
  s.t = Math.min(s.t, tlOf(D).ms);
  if (!s.el) {
    s.el = el('<div class="nxm" tabindex="-1" role="region" aria-label="Frise de l’animation"></div>');
    bindTimeline(D, s.el);
  }
  s.el.style.setProperty('--nxm-h', `${Math.max(160, Math.min(480, settings.nxMotionH || 236))}px`);
  D.$.stage.after(s.el);
  const a = D.canvas.getActiveObject();
  if (a && a.type === 'activeselection') D.canvas.discardActiveObject();
  ML.showFrame(D, s.t);
  paint(D);
  toolbarState(D);
  D.renderProps();
}
export function close(D) {
  const s = S(D);
  if (!s.open) return;
  stop(D);
  s.open = false;
  ML.stopLive(D);
  if (s.el) s.el.remove();
  toolbarState(D);
  D.renderProps();
}
function toolbarState(D) {
  const b = D.$.tools && D.$.tools.querySelector('[data-nx2="motion"]');
  if (b) { b.classList.toggle('on', S(D).open); b.setAttribute('aria-pressed', String(S(D).open)); }
}
export function seek(D, t, { props = true } = {}) {
  const s = S(D); const tl = tlOf(D);
  s.t = Math.max(0, Math.min(tl.ms, Math.round(t)));
  if (s.open) { ML.showFrame(D, s.t); head(D); }
  if (props) propsSoon(D);
}
let propsT = 0;
function propsSoon(D) { clearTimeout(propsT); propsT = setTimeout(() => { const f = D.$.props; if (!(f && f.contains(document.activeElement) && document.activeElement.matches('input, select, textarea'))) D.renderProps(); }, 120); }
export function togglePlay(D) { if (S(D).playing) stop(D); else play(D); }
function play(D) {
  const s = S(D);
  if (!s.open) open(D);
  const tl = tlOf(D);
  const a = D.canvas.getActiveObject();
  if (a && a.type === 'activeselection') D.canvas.discardActiveObject();
  if (!tl.loop && s.t >= tl.ms - 1) s.t = 0;
  s.playing = true;
  const start = performance.now() - s.t;
  const step = () => {
    if (!s.playing || !s.open) return;
    const elapsed = performance.now() - start;
    seek(D, M.playbackTime(elapsed, tl.ms, tl.loop), { props: false });
    if (!tl.loop && elapsed >= tl.ms) { stop(D); propsSoon(D); return; }
    s.raf = requestAnimationFrame(step);
  };
  s.raf = requestAnimationFrame(step);
  barState(D);
}
function stop(D) { const s = S(D); s.playing = false; cancelAnimationFrame(s.raf); barState(D); }
function barState(D) {
  const s = S(D); if (!s.el) return;
  const b = s.el.querySelector('[data-mo="play"]');
  if (b) { b.innerHTML = ico(s.playing ? 'pause' : 'play', 15); b.title = s.playing ? 'Pause (Espace)' : 'Lire (Espace)'; b.setAttribute('aria-label', b.title); }
}
function head(D) {
  const s = S(D); if (!s.el) return;
  const tl = tlOf(D);
  const c = s.el.querySelector('.nxm-content');
  if (c) c.style.setProperty('--p', String(Math.min(1, s.t / tl.ms)));
  const lab = s.el.querySelector('[data-mo-time]');
  if (lab) lab.textContent = fmtS(s.t);
}

// ---------- Frise ----------
const pctOf = (t, ms) => Math.max(0, Math.min(1, t / ms));
function rulerTicks(ms, width) {
  const steps = [50, 100, 250, 500, 1000, 2000, 5000, 10000, 30000, 60000];
  const step = steps.find((x) => (width * x) / ms >= 64) || 60000;
  const out = [];
  for (let t = 0; t <= ms + 1; t += step) out.push(`<span class="nxm-tick" style="--x:${pctOf(t, ms)}"><em>${secStr(t)} s</em></span>`);
  return out.join('');
}
function keyBtn(o, p, k, ms, sel, sum = false) {
  const on = sel && String(sel.oid) === String(o.id) && sel.prop === p && sel.t === k.t;
  const ease = k.e && k.e !== 'linear' ? ` · courbe : ${M.easeName(k.e)}` : '';
  const label = sum ? `Images clés à ${fmtS(k.t)}` : `${M.PROP[p].name} à ${fmtS(k.t)}${ease}`;
  return `<button class="nxm-key${sum ? ' sum' : ''}${on ? ' on' : ''}${k.t > ms ? ' out' : ''}" style="--x:${pctOf(k.t, ms)}" data-key data-oid="${esc(o.id)}" data-prop="${esc(p)}" data-t="${k.t}" title="${esc(label)}" aria-label="${esc(label)}">${ico('nxMoKey', 11)}</button>`;
}
function clipBar(o, c, ms, thin = false) {
  const end = M.clipEnd(c, ms);
  const inf = c.repeat === M.INFINITE;
  const name = c.preset ? (M.findPreset(c.preset) || {}).name || M.clipLabel(c) : M.clipLabel(c);
  return `<div class="nxm-clip${thin ? ' thin' : ''}${inf ? ' inf' : ''}${c.visible ? '' : ' off'}" style="--a:${pctOf(c.delay, ms)};--b:${pctOf(end, ms)}" data-clip data-oid="${esc(o.id)}" data-cid="${c.id}" title="${esc(`${name} : ${M.clipLabel(c)}, ${fmtS(c.delay)} → ${inf ? 'fin de la frise' : fmtS(end)}`)}">${thin ? '' : `<span>${esc(M.clipLabel(c))}</span><i class="nxm-edge" data-edge title="Étirer la durée"></i>`}</div>`;
}
function rowsHtml(D, tl, s) {
  const sel = selected(D);
  const list = ML.objs(D).slice().reverse().filter((o) => ML.animated(o) || sel.includes(o));
  if (!list.length) return `<div class="nxm-empty">${ico('nxAnimate', 18)}<span>Sélectionne un calque, puis ajoute une animation toute faite (bouton « Animation ») ou une image clé (◇ dans l’onglet Animation du panneau de droite). La page est montrée à la tête de lecture : un calque déplacé ici reçoit une image clé si sa position en a déjà.</span></div>`;
  let h = '';
  for (const o of list) {
    const m = ML.motionOf(o) || M.emptyMotion();
    const legacy = o.nxAnim && o.nxAnim.in && o.nxAnim.in !== 'none' ? o.nxAnim : null;
    const opened = s.exp.has(String(o.id)) || (sel.length === 1 && sel[0] === o);
    const keys = M.keyTimes(m);
    h += `<div class="nxm-row lay${sel.includes(o) ? ' sel' : ''}" data-oid="${esc(o.id)}"><div class="nxm-name"><button class="nxm-caret" data-mo="exp" title="${opened ? 'Replier' : 'Déplier les pistes'}" aria-expanded="${opened}">${ico(opened ? 'chevronDown' : 'chevronRight', 12)}</button><button class="nxm-lname" data-mo="pick" title="Sélectionner ce calque">${esc(ML.layerName(D, o))}</button></div><div class="nxm-lane"><div class="nxm-in">${m.clips.map((c) => clipBar(o, c, tl.ms, true)).join('')}${keys.map((t) => keyBtn(o, '*', { t }, tl.ms, null, true)).join('')}</div></div></div>`;
    if (!opened) continue;
    for (const [p] of M.PROPS) {
      const keysP = m.tracks[p]; if (!keysP) continue;
      h += `<div class="nxm-row trk" data-oid="${esc(o.id)}" data-prop="${p}"><div class="nxm-name"><span>${esc(M.PROP[p].name)}</span><button class="nxm-mini" data-mo="trkdel" title="Supprimer cette piste" aria-label="Supprimer la piste ${esc(M.PROP[p].name)}">${ico('trash', 11)}</button></div><div class="nxm-lane"><div class="nxm-in"><i class="nxm-span" style="--a:${pctOf(keysP[0].t, tl.ms)};--b:${pctOf(keysP[keysP.length - 1].t, tl.ms)}"></i>${keysP.map((k) => keyBtn(o, p, k, tl.ms, s.sel)).join('')}</div></div></div>`;
    }
    for (const c of m.clips) {
      const name = c.preset ? (M.findPreset(c.preset) || {}).name : '';
      h += `<div class="nxm-row clp" data-oid="${esc(o.id)}"><div class="nxm-name"><span>${esc(name ? `${name} · ${CLIP_SHORT[c.kind]}` : M.clipLabel(c))}</span><button class="nxm-mini" data-mo="clipvis" data-cid="${c.id}" title="${c.visible ? 'Masquer ce clip' : 'Afficher ce clip'}">${ico(c.visible ? 'eye' : 'eyeOff', 11)}</button></div><div class="nxm-lane"><div class="nxm-in">${clipBar(o, c, tl.ms)}</div></div></div>`;
    }
    if (legacy) h += `<div class="nxm-row clp" data-oid="${esc(o.id)}"><div class="nxm-name"><span>Entrée rapide · ${esc(PG.ANIMS[legacy.in] || legacy.in)}</span></div><div class="nxm-lane"><div class="nxm-in"><div class="nxm-clip legacy" style="--a:${pctOf((legacy.delay || 0) * 1000, tl.ms)};--b:${pctOf(((legacy.delay || 0) + (legacy.dur || 0.8)) * 1000, tl.ms)}" title="Entrée réglée dans la section « Entrée rapide » de l’onglet Animation"><span>${esc(PG.ANIMS[legacy.in] || '')}</span></div></div></div></div>`;
  }
  return h;
}
function paint(D) {
  const s = S(D); const root = s.el; if (!root || !s.open) return;
  const tl = tlOf(D);
  const sel = selected(D);
  const fps = [12, 24, 25, 30, 48, 50, 60];
  const prev = root.querySelector('.nxm-rows');
  const keepScroll = prev ? prev.scrollTop : 0;
  root.innerHTML = `<div class="nxm-grip" data-mo="grip" title="Faire glisser pour agrandir la frise"></div>
    <div class="nxm-bar">
      <button class="icon-btn" data-mo="start" title="Revenir au début (Début)" aria-label="Revenir au début">${ico('nxToStart', 15)}</button>
      <button class="icon-btn nxm-play" data-mo="play" title="${s.playing ? 'Pause (Espace)' : 'Lire (Espace)'}" aria-label="${s.playing ? 'Pause' : 'Lire'}">${ico(s.playing ? 'pause' : 'play', 15)}</button>
      <button class="icon-btn" data-mo="kprev" title="Image clé précédente" aria-label="Image clé précédente">${ico('nxMoPrev', 15)}</button>
      <button class="icon-btn" data-mo="knext" title="Image clé suivante" aria-label="Image clé suivante">${ico('nxMoNext', 15)}</button>
      <span class="nxm-time"><b data-mo-time>${fmtS(s.t)}</b><span>/</span><label title="Durée de la frise de cette page (secondes)"><input class="input small" type="number" min="0.1" max="600" step="0.1" value="${num(tl.ms / 1000)}" data-mo-dur aria-label="Durée en secondes"><span>s</span></label></span>
      <label class="nxm-sel" title="Images par seconde (lecture pas à pas, aimantation, export)"><select class="input small" data-mo-fps aria-label="Images par seconde">${fps.map((f) => `<option value="${f}" ${f === tl.fps ? 'selected' : ''}>${f} im./s</option>`).join('')}${fps.includes(tl.fps) ? '' : `<option value="${tl.fps}" selected>${tl.fps} im./s</option>`}</select></label>
      <button class="nxm-tog${tl.loop ? ' on' : ''}" data-mo="loop" aria-pressed="${tl.loop}" aria-label="Boucle" title="Lecture en boucle (aussi dans la présentation et le prototype)">${ico('nxRepeat', 14)}<span>Boucle</span></button>
      <button class="nxm-tog rec${autoKey() ? ' on' : ''}" data-mo="auto" aria-pressed="${autoKey()}" aria-label="Enregistrement automatique" title="Enregistrement automatique : toute modification à la tête de lecture devient une image clé">${ico('record', 14)}<span>Enregistrer</span></button>
      <span class="grow"></span>
      <button class="btn small" data-mo="lib" ${sel.length ? '' : 'disabled'} title="${sel.length ? 'Ajouter une animation toute faite au calque sélectionné, à la tête de lecture' : 'Sélectionne d’abord un calque'}" aria-label="Ajouter une animation toute faite">${ico('plus', 13)}<span>Animation</span></button>
      <button class="icon-btn" data-mo="code" title="Code de l’animation (CSS, SwiftUI, Compose)" aria-label="Code de l’animation">${ico('code', 15)}</button>
      <button class="icon-btn" data-mo="export" title="Exporter la vidéo, le GIF ou les images" aria-label="Exporter l’animation">${ico('film', 15)}</button>
      <button class="icon-btn" data-mo="close" title="Fermer la frise" aria-label="Fermer la frise">${ico('close', 15)}</button>
    </div>
    <div class="nxm-rows"><div class="nxm-content" style="--p:${pctOf(s.t, tl.ms)}">
      <div class="nxm-row nxm-rrow"><div class="nxm-name nxm-h"><span>${sel.length === 1 ? esc(ML.layerName(D, sel[0])) : 'Calques'}</span></div><div class="nxm-lane nxm-ruler" data-ruler title="Cliquer ou faire glisser pour déplacer la tête de lecture (Maj : sans aimantation)"><div class="nxm-in">${rulerTicks(tl.ms, Math.max(200, root.clientWidth - 230))}<i class="nxm-knob"></i></div></div></div>
      ${rowsHtml(D, tl, s)}
      <i class="nxm-head" aria-hidden="true"></i>
    </div></div>`;
  const rows = root.querySelector('.nxm-rows'); if (rows) rows.scrollTop = keepScroll;
}
let paintT = 0;
export function paintSoon(D) { clearTimeout(paintT); paintT = setTimeout(() => paint(D), 60); }
function rulerRect(D) { return S(D).el.querySelector('.nxm-ruler .nxm-in').getBoundingClientRect(); }
function tAt(D, clientX) {
  const tl = tlOf(D); const r = rulerRect(D);
  return Math.max(0, Math.min(tl.ms, ((clientX - r.left) / Math.max(1, r.width)) * tl.ms));
}
// Aimantation : images, tête de lecture et autres images clés à moins de 6 px (Maj : sans aimantation).
function snapT(D, t, skip = null, free = false) {
  if (free) return Math.round(t);
  const tl = tlOf(D); const s = S(D); const r = rulerRect(D);
  const px = (ms) => (ms / tl.ms) * r.width;
  const cands = [s.t, 0, tl.ms];
  for (const o of ML.objs(D)) { const m = ML.motionOf(o); if (m) for (const k of M.keyTimes(m)) if (k !== skip) cands.push(k); }
  for (const c of cands) if (Math.abs(px(c) - px(t)) < 6) return Math.round(c);
  return Math.round(M.snapToFrame(t, tl.fps));
}
function commit(D, o, m, label) {
  const n = M.normalizeMotion(m);
  if (M.isEmpty(n)) delete o.nxMotion; else o.nxMotion = n;
  const s = S(D);
  if (s.open) ML.showFrame(D, s.t);
  D.nxNextLabel = label;
  D.changed();
  paintSoon(D);
}
function track(move, up) {
  const onMove = (ev) => move(ev);
  const onUp = (ev) => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp); up(ev); };
  window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
}
function bindTimeline(D, root) {
  new ResizeObserver(() => paintSoon(D)).observe(root);
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-mo-dur]')) { const v = Math.max(0.1, Math.min(600, Number(String(t.value).replace(',', '.')) || 4)); setTimeline(D, { dur: Math.round(v * 100) / 100 }); }
    if (t.matches('[data-mo-fps]')) setTimeline(D, { fps: Number(t.value) || 30 });
  });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mo]'); if (!b || b.disabled) return;
    const k = b.dataset.mo;
    if (k === 'play') togglePlay(D);
    if (k === 'start') { stop(D); seek(D, 0); }
    if (k === 'kprev' || k === 'knext') jumpKey(D, k === 'knext' ? 1 : -1);
    if (k === 'loop') setTimeline(D, { loop: !tlOf(D).loop });
    if (k === 'auto') { settings.nxMotionAutoKey = !autoKey(); saveSettings(); paint(D); D.renderProps(); toast(autoKey() ? 'Enregistrement automatique : chaque modification à la tête de lecture crée une image clé (et une au début si la propriété n’en avait pas).' : 'Enregistrement automatique arrêté : seules les propriétés qui ont déjà des images clés en reçoivent.'); }
    if (k === 'lib') library(D, b);
    if (k === 'code') codeSheet(D);
    if (k === 'export') { if (allowed(STD, 'L’export vidéo')) PG.animExportSheet(D); }
    if (k === 'close') close(D);
    if (k === 'exp') { const id = b.closest('[data-oid]').dataset.oid; if (S(D).exp.has(id)) S(D).exp.delete(id); else S(D).exp.add(id); paint(D); }
    if (k === 'pick') { const o = byId(D, b.closest('[data-oid]').dataset.oid); if (o) { D.canvas.setActiveObject(o); D.canvas.requestRenderAll(); D.renderProps(); paintSoon(D); } }
    if (k === 'trkdel') { if (!canEdit()) return; const row = b.closest('[data-oid]'); const o = byId(D, row.dataset.oid); if (!o) return; const m = M.normalizeMotion(o.nxMotion); delete m.tracks[row.dataset.prop]; commit(D, o, m, 'Piste supprimée'); }
    if (k === 'clipvis') { if (!canEdit()) return; const o = byId(D, b.closest('[data-oid]').dataset.oid); if (!o) return; const m = M.normalizeMotion(o.nxMotion); const c = m.clips.find((x) => x.id === Number(b.dataset.cid)); if (c) { c.visible = !c.visible; commit(D, o, m, c.visible ? 'Clip affiché' : 'Clip masqué'); } }
  });
  root.addEventListener('dblclick', (e) => {
    const k = e.target.closest('[data-key]');
    if (k && k.dataset.prop !== '*') { const o = byId(D, k.dataset.oid); if (o) easeEditor(D, k, { kind: 'key', oid: o.id, prop: k.dataset.prop, t: Number(k.dataset.t) }); }
  });
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const s = S(D);
    if (e.target.closest('[data-mo="grip"]')) { dragResize(D, e); return; }
    if (e.target.closest('[data-ruler]')) {
      e.preventDefault(); stop(D);
      const move = (ev) => seek(D, snapT(D, tAt(D, ev.clientX), null, ev.shiftKey), { props: false });
      move(e); track(move, () => propsSoon(D)); return;
    }
    const key = e.target.closest('[data-key]');
    if (key) { e.preventDefault(); dragKey(D, key, e); return; }
    const clip = e.target.closest('[data-clip]');
    if (clip && clip.dataset.cid) { e.preventDefault(); dragClip(D, clip, e); return; }
    if (e.target.closest('.nxm-lane')) s.sel = null;
  });
}
function dragResize(D, e) {
  const s = S(D); const y0 = e.clientY; const h0 = s.el.getBoundingClientRect().height;
  track((ev) => { const h = Math.max(160, Math.min(480, h0 + (y0 - ev.clientY))); s.el.style.setProperty('--nxm-h', `${h}px`); settings.nxMotionH = Math.round(h); }, () => saveSettings());
}
function dragKey(D, btnEl, e) {
  const s = S(D); const o = byId(D, btnEl.dataset.oid); if (!o) return;
  const prop = btnEl.dataset.prop; const t0 = Number(btnEl.dataset.t); const x0 = e.clientX;
  const tl = tlOf(D);
  let moved = false; let t1 = t0;
  stop(D);
  track((ev) => {
    if (!moved && Math.abs(ev.clientX - x0) < 3) return;
    if (!moved && !canEdit()) return;
    moved = true;
    const r = rulerRect(D);
    t1 = snapT(D, Math.max(0, Math.min(tl.ms, t0 + ((ev.clientX - x0) / r.width) * tl.ms)), t0, ev.shiftKey);
    btnEl.style.setProperty('--x', String(pctOf(t1, tl.ms)));
    btnEl.title = fmtS(t1);
    btnEl.classList.toggle('copy', ev.altKey);
  }, (ev) => {
    if (!moved) {
      s.sel = prop === '*' ? null : { oid: o.id, prop, t: t0 };
      seek(D, t0);
      if (D.canvas.getActiveObject() !== o) { D.canvas.setActiveObject(o); D.canvas.requestRenderAll(); }
      paint(D);
      D.renderProps();
      return;
    }
    if (t1 === t0) { paint(D); return; }
    const m = M.normalizeMotion(o.nxMotion);
    const props = prop === '*' ? Object.keys(m.tracks).filter((p) => M.keyAt(m, p, t0)) : [prop];
    for (const p of props) M.moveKey(m, p, t0, t1, ev.altKey);
    if (prop !== '*') s.sel = { oid: o.id, prop, t: t1 };
    commit(D, o, m, ev.altKey ? 'Image clé copiée' : 'Image clé déplacée');
  });
}
function dragClip(D, clipEl, e) {
  const s = S(D); const o = byId(D, clipEl.dataset.oid); if (!o) return;
  const cid = Number(clipEl.dataset.cid); const edge = Boolean(e.target.closest('[data-edge]'));
  const c0 = M.normalizeMotion(o.nxMotion).clips.find((c) => c.id === cid); if (!c0) return;
  const tl = tlOf(D); const x0 = e.clientX; let moved = false; let m = null;
  stop(D);
  track((ev) => {
    if (!moved && Math.abs(ev.clientX - x0) < 3) return;
    if (!moved && !canEdit()) return;
    moved = true;
    const d = ((ev.clientX - x0) / rulerRect(D).width) * tl.ms;
    m = M.normalizeMotion(o.nxMotion); const c = m.clips.find((x) => x.id === cid);
    if (edge) { const cycles = c0.repeat === M.INFINITE ? 1 : c0.repeat; c.dur = Math.max(20, Math.round(M.snapToFrame(c0.dur + d / cycles, tl.fps))); }
    else c.delay = Math.max(0, snapT(D, c0.delay + d, null, ev.shiftKey));
    clipEl.style.setProperty('--a', String(pctOf(c.delay, tl.ms))); clipEl.style.setProperty('--b', String(pctOf(M.clipEnd(c, tl.ms), tl.ms)));
    o.nxMotion = m; ML.showFrame(D, s.t);
  }, () => {
    if (!moved) { clipEditor(D, clipEl, o.id, cid); return; }
    commit(D, o, m, edge ? 'Durée du clip' : 'Clip déplacé');
  });
}
function jumpKey(D, dir) {
  const s = S(D); const sel = selected(D);
  const list = (sel.length ? sel : ML.objs(D)).map((o) => ML.motionOf(o)).filter(Boolean);
  const times = [...new Set(list.flatMap((m) => [...M.keyTimes(m), ...m.clips.flatMap((c) => [c.delay, M.clipEnd(c, tlOf(D).ms)])]))].sort((a, b) => a - b);
  const next = dir > 0 ? times.find((t) => t > s.t + 0.5) : times.reverse().find((t) => t < s.t - 0.5);
  if (next !== undefined) { stop(D); seek(D, next); }
}
function setTimeline(D, patch) {
  if (!D.page) return;
  if (!canEdit('Régler la frise')) { paint(D); return; }
  D.page.nxAnim = { ...PG.pageAnim(D.page), ...patch };
  const tl = tlOf(D); const s = S(D);
  if (s.t > tl.ms) s.t = tl.ms;
  D.nxNextLabel = 'Frise de la page';
  D.changed();
  if (s.open) { ML.showFrame(D, s.t); paint(D); }
}
// Raccourcis quand la frise a le focus (avant ceux de NEX-DESIGN : Suppr ne doit pas effacer le calque).
export function onKey(D, e) {
  const s = S(D);
  if (!s.open || !s.el || !s.el.contains(document.activeElement) || (e.target && e.target.matches && e.target.matches('input, select, textarea'))) return false;
  const tl = tlOf(D); const f = M.frameMs(tl.fps);
  if (e.key === ' ') { e.preventDefault(); togglePlay(D); return true; }
  if (e.key === 'Home') { e.preventDefault(); stop(D); seek(D, 0); return true; }
  if (e.key === 'End') { e.preventDefault(); stop(D); seek(D, tl.ms); return true; }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); stop(D); seek(D, s.t + (e.key === 'ArrowRight' ? 1 : -1) * f * (e.shiftKey ? 10 : 1)); return true; }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    if (!s.sel || !canEdit()) return true;
    const o = byId(D, s.sel.oid); if (!o) return true;
    const m = M.normalizeMotion(o.nxMotion); M.removeKey(m, s.sel.prop, s.sel.t); s.sel = null;
    commit(D, o, m, 'Image clé supprimée');
    return true;
  }
  return false;
}
// Trajectoire de la position du calque sélectionné (images clés en losanges).
function drawPath(D, ctx) {
  const s = S(D); if (!s.open || s.playing) return;
  const sel = selected(D); if (sel.length !== 1) return;
  const o = sel[0]; const m = ML.motionOf(o);
  if (!m || !((m.tracks.position && m.tracks.position.length > 1) || m.clips.some((c) => c.visible && c.kind === 'position'))) return;
  const tl = tlOf(D); const base = ML.baseFromRaw(o); const n = Math.min(240, M.frameCount(tl.ms, tl.fps));
  const v = D.canvas.viewportTransform; const r = D.canvas.getRetinaScaling ? D.canvas.getRetinaScaling() : 1;
  const z = D.canvas.getZoom() || 1;
  ctx.save();
  ctx.setTransform(v[0] * r, v[1] * r, v[2] * r, v[3] * r, v[4] * r, v[5] * r);
  ctx.lineWidth = 1.5 / z; ctx.setLineDash([5 / z, 4 / z]); ctx.strokeStyle = '#6a4cff';
  ctx.beginPath();
  for (let i = 0; i <= n; i += 1) { const p = M.valueAt(m, base, 'position', (tl.ms * i) / n); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }
  ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#ffffff';
  for (const k of m.tracks.position || []) { const p = M.valueAt(m, base, 'position', k.t); const d = 5 / z; ctx.beginPath(); ctx.moveTo(p.x, p.y - d); ctx.lineTo(p.x + d, p.y); ctx.lineTo(p.x, p.y + d); ctx.lineTo(p.x - d, p.y); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  ctx.restore();
}

// ---------- Bibliothèque des animations toutes faites ----------
function demoFrames(p) {
  const m = M.emptyMotion(); M.applyPreset(m, p.id, 0);
  const loop = p.group === 'cycle';
  const end = loop ? Math.max(...m.clips.map((c) => (c.yoyo ? c.dur * 2 : c.dur))) * 2 : M.motionEnd(m, 1000) + 250;
  const base = { position: { x: 0, y: 0 }, rotation: 0, width: 1, height: 1, opacity: 1, scale: { x: 1, y: 1 } };
  const frames = [];
  for (let i = 0; i <= 40; i += 1) {
    const ev = M.evaluate(m, base, (end * i) / 40);
    const pos = ev.position || base.position; const sc = ev.scale || base.scale;
    frames.push({ transform: `translate(${num(pos.x * 0.16)}px, ${num(pos.y * 0.16)}px) rotate(${num(ev.rotation || 0)}deg) scale(${num(sc.x * (ev.width ?? 1), 3)}, ${num(sc.y * (ev.height ?? 1), 3)})`, opacity: ev.opacity ?? 1 });
  }
  return { frames, end };
}
function library(D, anchor) {
  if (!canEdit()) return;
  const s = S(D);
  let group = settings.nxMotionGroup || 'enter';
  const body = () => `<div class="nxm-lib"><div class="seg wide small" role="tablist">${Object.entries(M.GROUPS).map(([g, l]) => `<button role="tab" class="${g === group ? 'on' : ''}" aria-selected="${g === group}" data-lg="${g}">${l} <em>${M.presetsIn(g).length}</em></button>`).join('')}</div>
    <div class="nxm-lib-grid">${M.presetsIn(group).map((p) => `<button class="nxm-tile" data-preset="${p.id}" title="${esc(`${p.name} : ${M.instantiate(p).map((c) => M.clipLabel(c).toLowerCase()).join(', ')}`)}"><span class="nxm-demo"><i></i></span><b>${esc(p.name)}</b><small>${p.speed ? esc(M.SPEEDS[p.speed]) : '500 ms'}</small></button>`).join('')}</div>
    <p class="nxm-hint">Ajoutée à ${esc(fmtS(s.t))} (tête de lecture) sur ${selected(D).length > 1 ? 'chaque calque sélectionné' : 'le calque sélectionné'}. Survole une vignette pour la voir. Chaque animation devient des clips modifiables : direction, quantité, délai, durée, courbe, répétition.</p></div>`;
  const pop = popover(anchor, `<div class="pop-title">Animations toutes faites</div>${body()}`, { width: 420, align: 'end', above: true });
  if (!pop) return;
  const anim = (tile) => { const p = M.findPreset(tile.dataset.preset); const d = tile.querySelector('.nxm-demo i'); if (!p || !d || d.nxAnim) return; const { frames, end } = demoFrames(p); d.nxAnim = d.animate(frames, { duration: Math.max(300, end), iterations: Infinity }); };
  const still = (tile) => { const d = tile.querySelector('.nxm-demo i'); if (d && d.nxAnim) { d.nxAnim.cancel(); d.nxAnim = null; } };
  pop.addEventListener('pointerover', (e) => { const t = e.target.closest('[data-preset]'); if (t) anim(t); });
  pop.addEventListener('pointerout', (e) => { const t = e.target.closest('[data-preset]'); if (t && !t.contains(e.relatedTarget)) still(t); });
  pop.addEventListener('focusin', (e) => { const t = e.target.closest('[data-preset]'); if (t) anim(t); });
  pop.addEventListener('focusout', (e) => { const t = e.target.closest('[data-preset]'); if (t) still(t); });
  pop.addEventListener('click', (e) => {
    const g = e.target.closest('[data-lg]');
    if (g) { group = g.dataset.lg; settings.nxMotionGroup = group; saveSettings(); pop.querySelector('.nxm-lib').outerHTML = body(); return; }
    const t = e.target.closest('[data-preset]'); if (!t) return;
    const list = selected(D);
    if (!list.length) { toast('Sélectionne d’abord un calque.'); return; }
    const p = M.findPreset(t.dataset.preset);
    for (const o of list) { const m = M.normalizeMotion(o.nxMotion); M.applyPreset(m, p.id, s.t); o.nxMotion = M.normalizeMotion(m); }
    closePopover();
    // La frise s'allonge si l'animation dépasse sa fin (sauf une boucle, qui va jusqu'au bout).
    const tl = tlOf(D); const need = Math.max(...list.map((o) => M.motionEnd(o.nxMotion, 0)));
    if (p.group !== 'cycle' && need > tl.ms) D.page.nxAnim = { ...PG.pageAnim(D.page), dur: Math.ceil(need / 100) / 10 };
    for (const o of list) s.exp.add(String(o.id));
    if (!s.open) open(D); else ML.showFrame(D, s.t);
    D.nxNextLabel = `Animation « ${p.name} »`; D.changed(); paint(D);
    const n = M.instantiate(p).length;
    toast(`« ${p.name} » ajoutée${list.length > 1 ? ` à ${list.length} calques` : ''} : ${n > 1 ? `${n} clips` : '1 clip'} à retoucher dans la frise. Appuie sur Lecture pour la voir.`);
  });
}

// ---------- Éditeur de clip ----------
function clipEditor(D, anchor, oid, cid) {
  const o = byId(D, oid); if (!o) return;
  const get = () => { const m = M.normalizeMotion(o.nxMotion); return { m, c: m.clips.find((x) => x.id === cid) }; };
  let { c } = get(); if (!c) return;
  const pctKind = (k) => k === 'scale' || k === 'size' || k === 'opacity';
  const unit = { position: 'px', rotation: '°', scale: '%', size: '%', opacity: '%' }[c.kind];
  const html = () => `<div class="nxm-ce">
    ${c.mode !== 'custom' ? `<div class="dzx-row"><span>Sens</span><div class="seg small"><button class="${c.mode === 'in' ? 'on' : ''}" data-cm="in">Entrée</button><button class="${c.mode === 'out' ? 'on' : ''}" data-cm="out">Sortie</button></div></div>` : ''}
    ${M.KIND_DIRS[c.kind].length && c.mode !== 'custom' ? `<label class="dzx-row"><span>Direction</span><select class="input small" data-cf="dir">${M.KIND_DIRS[c.kind].map((d) => `<option value="${d}" ${d === c.dir ? 'selected' : ''}>${esc(M.DIRS[d])}</option>`).join('')}</select></label>` : ''}
    ${c.mode !== 'custom' ? `<label class="dzx-row"><span>${c.kind === 'opacity' ? 'Opacité de départ ou d’arrivée' : 'Quantité'} (${unit})</span><input class="input small" type="number" step="1" data-cf="amount" value="${pctKind(c.kind) ? num(c.amount * 100, 1) : num(c.amount, 1)}"></label>` : '<p class="dzx-hint">Trajectoire personnalisée (animation « Orbite »).</p>'}
    <label class="dzx-row"><span>Délai (s)</span><input class="input small" type="number" min="0" step="0.05" data-cf="delay" value="${num(c.delay / 1000, 3)}"></label>
    <label class="dzx-row"><span>Durée d’un cycle (s)</span><input class="input small" type="number" min="0.02" step="0.05" data-cf="dur" value="${num(c.dur / 1000, 3)}"></label>
    <div class="dzx-row"><span>Courbe</span><button class="btn small" data-ce="ease">${ico('nxCurve', 13)}<span>${esc(M.easeName(c.ease))}</span></button></div>
    <label class="dzx-row"><span>Répétition</span><select class="input small" data-cf="repeat">${[1, 2, 3, 4, 5, 10].map((n) => `<option value="${n}" ${c.repeat === n ? 'selected' : ''}>${n === 1 ? 'Une fois' : `${n} fois`}</option>`).join('')}<option value="-1" ${c.repeat === M.INFINITE ? 'selected' : ''}>Jusqu’à la fin de la frise</option></select></label>
    <label class="check-row small"><input type="checkbox" data-cf="yoyo" ${c.yoyo ? 'checked' : ''}><span class="box"></span><span>Aller-retour (un cycle sur deux à l’envers)</span></label>
    <div class="nx-btns"><button class="btn small" data-ce="vis">${ico(c.visible ? 'eyeOff' : 'eye', 13)}<span>${c.visible ? 'Masquer' : 'Afficher'}</span></button><button class="btn small" data-ce="del">${ico('trash', 13)}<span>Supprimer le clip</span></button></div></div>`;
  const p = c.preset ? M.findPreset(c.preset) : null;
  const pop = popover(anchor, `<div class="pop-title">${esc(p ? `${p.name} · ${M.clipLabel(c)}` : M.clipLabel(c))}</div><div data-ce-body>${html()}</div>`, { width: 330, align: 'start', above: true });
  if (!pop) return;
  const apply = (fn, label) => {
    if (!canEdit()) return;
    const r = get(); if (!r.c) return;
    fn(r.c);
    Object.assign(r.c, M.sanitizeClip(r.c));
    o.nxMotion = M.normalizeMotion(r.m); c = o.nxMotion.clips.find((x) => x.id === cid) || r.c;
    ML.showFrame(D, S(D).t); paintSoon(D);
    D.nxNextLabel = label; D.changed();
  };
  pop.addEventListener('change', (e) => {
    const f = e.target.dataset.cf; if (!f) return;
    const v = e.target.type === 'checkbox' ? e.target.checked : Number(String(e.target.value).replace(',', '.'));
    apply((x) => {
      if (f === 'dir') x.dir = e.target.value;
      if (f === 'amount' && Number.isFinite(v)) x.amount = pctKind(x.kind) ? v / 100 : v;
      if (f === 'delay' && Number.isFinite(v)) x.delay = Math.max(0, v * 1000);
      if (f === 'dur' && Number.isFinite(v)) x.dur = Math.max(20, v * 1000);
      if (f === 'repeat') x.repeat = v;
      if (f === 'yoyo') x.yoyo = v;
    }, 'Clip modifié');
  });
  pop.addEventListener('click', (e) => {
    const m2 = e.target.closest('[data-cm]');
    if (m2) { apply((x) => { x.mode = m2.dataset.cm; }, 'Clip modifié'); pop.querySelector('[data-ce-body]').innerHTML = html(); return; }
    const b = e.target.closest('[data-ce]'); if (!b) return;
    if (b.dataset.ce === 'ease') { closePopover(); easeEditor(D, anchor, { kind: 'clip', oid, cid }); return; }
    if (b.dataset.ce === 'vis') { apply((x) => { x.visible = !x.visible; }, 'Clip masqué'); pop.querySelector('[data-ce-body]').innerHTML = html(); return; }
    if (b.dataset.ce === 'del') { if (!canEdit()) return; const r = get(); r.m.clips = r.m.clips.filter((x) => x.id !== cid); closePopover(); commit(D, o, r.m, 'Clip supprimé'); D.renderProps(); }
  });
}

// ---------- Éditeur de courbe ----------
function easeEditor(D, anchor, target) {
  const o = byId(D, target.oid); if (!o) return;
  const read = () => {
    const m = M.normalizeMotion(o.nxMotion);
    if (target.kind === 'clip') { const c = m.clips.find((x) => x.id === target.cid); return { m, e: c ? c.ease : 'linear', set: (e) => { if (c) c.ease = e; } }; }
    const k = (m.tracks[target.prop] || []).find((x) => x.t === target.t);
    return { m, e: k ? k.e : 'linear', set: (e) => { if (k) k.e = e; } };
  };
  let e0 = read().e;
  let fam = M.easeFamily(e0);
  const graph = (e) => {
    const pts = M.sampleEase(e, 60);
    const cp = fam === 'curve' ? M.controlPoints(e) : null;
    // Échelle verticale : courbe et poignées (une poignée au-dessus de 1 reste visible).
    const ys = [...pts.map((p) => p[1]), ...(cp ? [cp[1], cp[3]] : [])]; const lo = Math.min(0, ...ys); const hi = Math.max(1, ...ys); const span = hi - lo || 1;
    const X = (x) => 10 + x * 140; const Y = (y) => 150 - ((y - lo) / span) * 140;
    return `<svg class="nxm-graph" viewBox="0 0 160 160" data-lo="${lo}" data-span="${span}" role="img" aria-label="Courbe : ${esc(M.easeName(e))}"><rect x="10" y="10" width="140" height="140" rx="6"/><line class="nxm-g0" x1="10" y1="${Y(0)}" x2="150" y2="${Y(0)}"/><line class="nxm-g0" x1="10" y1="${Y(1)}" x2="150" y2="${Y(1)}"/>${cp ? `<line class="nxm-gh" x1="${X(0)}" y1="${Y(0)}" x2="${X(cp[0])}" y2="${Y(cp[1])}"/><line class="nxm-gh" x1="${X(1)}" y1="${Y(1)}" x2="${X(cp[2])}" y2="${Y(cp[3])}"/>` : ''}<polyline points="${pts.map((p) => `${num(X(p[0]), 1)},${num(Y(p[1]), 1)}`).join(' ')}"/>${cp ? `<circle class="nxm-gp" data-h="1" cx="${X(cp[0])}" cy="${Y(cp[1])}" r="5"/><circle class="nxm-gp" data-h="2" cx="${X(cp[2])}" cy="${Y(cp[3])}" r="5"/>` : ''}</svg>`;
  };
  const presets = () => M.EASES.filter(([id]) => M.easeFamily(id) === fam);
  const html = (e) => `<div class="nxm-ease">
    <div class="seg wide small">${[['hold', 'Maintien'], ['curve', 'Courbe'], ['spring', 'Ressort']].map(([f, l]) => `<button class="${f === fam ? 'on' : ''}" data-ef="${f}">${l}</button>`).join('')}</div>
    <div class="nxm-ease-main">${graph(e)}<div class="nxm-ease-list">${presets().map(([id, l]) => `<button class="${id === e ? 'on' : ''}" data-ep="${id}">${esc(l)}</button>`).join('')}${fam === 'curve' ? `<button class="${e && e.bezier ? 'on' : ''}" data-ep="custom">Personnalisée</button>` : fam === 'spring' ? `<button class="${e && typeof e === 'object' && 'spring' in e ? 'on' : ''}" data-ep="custom">Personnalisé</button>` : ''}</div></div>
    ${fam === 'curve' && M.controlPoints(e) ? `<div class="nxm-bez">${M.controlPoints(e).map((v, i) => `<label><span>${['x1', 'y1', 'x2', 'y2'][i]}</span><input class="input small" type="number" step="0.01" ${i % 2 === 0 ? 'min="0" max="1"' : ''} data-eb="${i}" value="${num(v)}"></label>`).join('')}</div><p class="nxm-hint">Fais glisser les deux poignées. CSS : ${esc(M.timingFunction(e))}</p>` : ''}
    ${fam === 'spring' ? `<div class="st-field"><span>Rebond <b>${num(M.bounceOf(e) ?? M.DEFAULT_BOUNCE)}</b></span><input type="range" min="-0.8" max="0.9" step="0.01" value="${M.bounceOf(e) ?? M.DEFAULT_BOUNCE}" data-es></div><p class="nxm-hint">Le ressort dure exactement le segment : plus de rebond, plus de dépassement ; en dessous de 0, il arrive en douceur.</p>` : ''}
    ${fam === 'hold' ? '<p class="nxm-hint">La valeur reste fixe jusqu’à l’image clé suivante, puis saute (animation image par image).</p>' : ''}
    <div class="nxm-ease-demo"><i></i></div></div>`;
  const title = target.kind === 'clip' ? 'Courbe du clip' : `Courbe · ${M.PROP[target.prop].name} à ${fmtS(target.t)}`;
  const pop = popover(anchor, `<div class="pop-title">${esc(title)}</div><div data-ee>${html(e0)}</div>`, { width: 360, align: 'start', above: true });
  if (!pop) return;
  const demo = (e) => { const d = pop.querySelector('.nxm-ease-demo i'); if (!d) return; if (d.nxA) d.nxA.cancel(); d.nxA = d.animate(M.sampleEase(e, 40).map(([, y]) => ({ transform: `translateX(${num(y * 230, 1)}px)` })), { duration: 1100, iterations: Infinity, endDelay: 400 }); };
  const rerender = (e) => { pop.querySelector('[data-ee]').innerHTML = html(e); demo(e); const on = pop.querySelector('.nxm-ease-list .on'); if (on) on.scrollIntoView({ block: 'nearest' }); };
  const set = (e, done = true) => {
    if (!canEdit()) return;
    const r = read(); r.set(M.sanitizeEase(e)); o.nxMotion = M.normalizeMotion(r.m); e0 = M.sanitizeEase(e);
    ML.showFrame(D, S(D).t); paintSoon(D);
    if (done) { D.nxNextLabel = 'Courbe'; D.changed(); }
  };
  demo(e0);
  { const on = pop.querySelector('.nxm-ease-list .on'); if (on) on.scrollIntoView({ block: 'nearest' }); }
  pop.addEventListener('click', (ev) => {
    const f = ev.target.closest('[data-ef]');
    if (f) { fam = f.dataset.ef; const e = fam === 'hold' ? 'hold' : fam === 'spring' ? 'gentle' : 'out'; set(e); rerender(e); return; }
    const p = ev.target.closest('[data-ep]');
    if (p) { const e = p.dataset.ep === 'custom' ? M.toCustom(fam === 'spring' ? (M.bounceOf(e0) !== null ? e0 : 'gentle') : (M.controlPoints(e0) ? e0 : 'out')) : p.dataset.ep; set(e); rerender(e); }
  });
  pop.addEventListener('change', (ev) => {
    const b = ev.target.dataset.eb;
    if (b !== undefined) { const c = (M.controlPoints(e0) || [0, 0, 1, 1]).slice(); c[Number(b)] = Number(String(ev.target.value).replace(',', '.')) || 0; const e = { bezier: c }; set(e); rerender(e); }
    if (ev.target.matches('[data-es]')) { D.nxNextLabel = 'Courbe'; D.changed(); }
  });
  pop.addEventListener('input', (ev) => {
    if (!ev.target.matches('[data-es]')) return;
    const e = { spring: Number(ev.target.value) }; set(e, false);
    const svg = pop.querySelector('.nxm-graph'); if (svg) svg.outerHTML = graph(e);
    const lab = ev.target.parentElement.querySelector('b'); if (lab) lab.textContent = num(e.spring);
    demo(e);
  });
  // Poignées de la courbe à faire glisser.
  pop.addEventListener('pointerdown', (ev) => {
    const h = ev.target.closest('[data-h]'); if (!h || !canEdit()) return;
    ev.preventDefault();
    const svg = h.ownerSVGElement; const lo = Number(svg.dataset.lo); const span = Number(svg.dataset.span);
    const idx = h.dataset.h === '1' ? 0 : 2;
    track((mv) => {
      const r = svg.getBoundingClientRect(); const sx = 160 / r.width; const sy = 160 / r.height;
      const x = Math.max(0, Math.min(1, ((mv.clientX - r.left) * sx - 10) / 140));
      const y = Math.round((lo + ((150 - (mv.clientY - r.top) * sy) / 140) * span) * 100) / 100;
      const c = (M.controlPoints(e0) || [0, 0, 1, 1]).slice(); c[idx] = Math.round(x * 100) / 100; c[idx + 1] = y;
      const e = { bezier: c }; set(e, false);
      const s2 = pop.querySelector('.nxm-graph'); if (s2) s2.outerHTML = graph(e);
      pop.querySelectorAll('[data-eb]').forEach((inp, i) => { inp.value = num(c[i]); });
    }, () => { D.nxNextLabel = 'Courbe'; D.changed(); rerender(e0); });
  });
}

// ---------- Code ----------
function codeSheet(D, only = null) {
  const tl = tlOf(D);
  const layers = ML.codeLayers(D, only);
  if (!layers.length) { toast(only ? 'Ce calque n’a pas d’animation Motion (images clés ou animations toutes faites).' : 'Aucun calque animé avec Motion sur cette page.'); return; }
  const code = { css: M.cssAnimation(layers, tl), swift: M.swiftuiAnimation(layers, tl), compose: M.composeAnimation(layers, tl) };
  let cur = settings.nxMotionCode || 'css';
  const n = layers.length;
  const s = sheet('nx-mocode', sheetHtml({ icon: 'code', title: 'Code de l’animation', sub: `${only ? 'Calque sélectionné' : `${n} calque${n > 1 ? 's' : ''} animé${n > 1 ? 's' : ''} de la page`} · frise de ${fmtS(tl.ms)}${tl.loop ? ', en boucle' : ''}. CSS : une règle @keyframes par propriété ; SwiftUI (iOS 17) : keyframeAnimator ; Jetpack Compose : keyframes.`, body: `<div class="seg wide" data-mc>${[['css', 'CSS'], ['swift', 'SwiftUI'], ['compose', 'Jetpack Compose']].map(([k, l]) => `<button class="${k === cur ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}</div><pre class="nxm-code"><code>${esc(code[cur] || '// Rien à générer pour ce langage.')}</code></pre>`, foot: `<button class="btn" data-mcopy>${ico('copy', 14)}<span>Copier</span></button>` }));
  if (!s) return;
  s.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-mc] [data-v]');
    if (b) { cur = b.dataset.v; settings.nxMotionCode = cur; saveSettings(); for (const x of b.parentElement.children) x.classList.toggle('on', x === b); s.querySelector('.nxm-code code').textContent = code[cur] || '// Rien à générer pour ce langage.'; return; }
    if (e.target.closest('[data-mcopy]')) { await api.invoke('clipboard:write', code[cur]).catch(() => navigator.clipboard.writeText(code[cur])); toast('Code copié.'); }
  });
}

// ---------- Panneau de droite (onglet Animation ; carte de code dans l'onglet Code) ----------
function valueInputs(p, v) {
  const info = M.PROP[p];
  if (info.kind === 'color') { const c = M.parseColor(v); return `<input type="color" data-mok="${p}" value="${M.colorString([c[0], c[1], c[2], 1])}" aria-label="${esc(info.name)}">`; }
  if (info.kind === 'vec2') return ['x', 'y'].map((a) => `<input class="input small" type="number" step="1" data-mok="${p}.${a}" value="${num(v[a] * info.factor, 1)}" aria-label="${esc(`${info.name} ${a.toUpperCase()}`)}" title="${a.toUpperCase()}">`).join('');
  return `<input class="input small" type="number" step="1" data-mok="${p}" value="${num(v * info.factor, 1)}" aria-label="${esc(info.name)}">`;
}
export function props(D, o) {
  const s = S(D);
  const sel = selected(D);
  if (!o) {
    if (sel.length < 2) return '';
    return sec('Mouvement', `<p class="dzx-hint">${sel.length} calques sélectionnés : une animation toute faite s’ajoute à chacun, à la tête de lecture.</p><div class="nx-btns"><button class="btn small" data-mo="lib">${ico('plus', 13)}<span>Animation toute faite…</span></button></div>`);
  }
  const m = ML.motionOf(o) || M.emptyMotion();
  const base = ML.baseFromRaw(o);
  const t = s.t;
  const ev = M.evaluate(m, base, t);
  const rows = ML.propsOf(o).map((p) => {
    const v = p in ev ? ev[p] : base[p];
    const key = M.keyAt(m, p, t); const tr = m.tracks[p];
    const title = key ? `Supprimer l’image clé ${M.PROP[p].name} à ${fmtS(t)}` : `Ajouter une image clé ${M.PROP[p].name} à ${fmtS(t)}`;
    return `<div class="nxm-prop${tr ? ' anim' : ''}"><button class="nxm-k${key ? ' on' : tr ? ' trk' : ''}" data-mo="key" data-p="${p}" title="${esc(title)}" aria-label="${esc(title)}" aria-pressed="${Boolean(key)}">${ico('nxMoKey', 11)}</button><span class="nxm-pl">${esc(M.PROP[p].name)}${M.PROP[p].unit ? ` <em>${M.PROP[p].unit}</em>` : ''}</span><span class="nxm-pv">${valueInputs(p, v)}</span></div>`;
  }).join('');
  const selKey = s.sel && String(s.sel.oid) === String(o.id) ? (m.tracks[s.sel.prop] || []).find((k) => k.t === s.sel.t) : null;
  const clips = m.clips.map((c) => { const p = c.preset ? M.findPreset(c.preset) : null; return `<div class="nxm-clipline${c.visible ? '' : ' off'}"><button class="nxm-clipbtn" data-mo="clip" data-cid="${c.id}" title="Modifier ce clip"><span>${esc(p ? `${p.name} · ${CLIP_SHORT[c.kind]}` : M.clipLabel(c))}</span><small>${esc(`${M.clipLabel(c)} · à ${fmtS(c.delay)}, ${fmtS(c.dur)}${c.repeat === M.INFINITE ? ', sans fin' : c.repeat > 1 ? `, ${c.repeat} fois` : ''}`)}</small></button><button class="nxm-mini" data-mo="clipdel" data-cid="${c.id}" title="Supprimer ce clip" aria-label="Supprimer ce clip">${ico('trash', 11)}</button></div>`; }).join('');
  const lock = has(STD) ? '' : `<p class="dzx-hint">${ico('nxCrown', 12)} Créer et modifier des animations fait partie de l’offre Pro ; les animations existantes se lisent avec toutes les offres.</p>`;
  return sec('Mouvement', `${lock}<div class="nxm-ptime"><button class="icon-btn small" data-mo="pkprev" title="Image clé précédente" aria-label="Image clé précédente">${ico('nxMoPrev', 13)}</button><span title="Tête de lecture">À <b>${esc(fmtS(t))}</b></span><button class="icon-btn small" data-mo="pknext" title="Image clé suivante" aria-label="Image clé suivante">${ico('nxMoNext', 13)}</button><span class="grow"></span><button class="btn small${s.open ? ' on' : ''}" data-mo="popen" aria-pressed="${s.open}" title="${s.open ? 'Fermer la frise' : 'Ouvrir la frise sous la page'}">${ico('wave', 13)}<span>Frise</span></button></div>
    <div class="nxm-props">${rows}</div>
    ${selKey ? `<div class="nxm-keybox"><span>Image clé ${esc(M.PROP[s.sel.prop].name)} à ${esc(fmtS(s.sel.t))}</span><button class="btn small" data-mo="pease">${ico('nxCurve', 13)}<span>${esc(M.easeName(selKey.e))}</span></button></div>` : ''}
    <p class="dzx-hint">◇ : image clé à la tête de lecture. Une valeur changée ici (ou un déplacement sur la page, frise ouverte) devient une image clé si la propriété en a déjà${autoKey() ? ' ; en enregistrement automatique, dans tous les cas' : ', sinon elle change le calque'}.</p>`)
    + sec('Animations toutes faites', `${clips ? `<div class="nxm-cliplist">${clips}</div>` : '<p class="dzx-hint">Aucune pour ce calque : 41 animations d’entrée, de sortie et en boucle, à retoucher ensuite.</p>'}<div class="nx-btns"><button class="btn small" data-mo="lib">${ico('plus', 13)}<span>Ajouter une animation…</span></button>${m.clips.length || Object.keys(m.tracks).length ? `<button class="btn small" data-mo="clear">${ico('trash', 13)}<span>Tout retirer</span></button>` : ''}</div>`);
}
export function codeProps(D, o) {
  if (!o || !ML.motionOf(o)) return '';
  return sec('Code de l’animation', `<p class="dzx-hint">Images clés et animations toutes faites de ce calque, en code prêt à coller.</p><div class="nx-btns"><button class="btn small" data-mo="pcode">${ico('code', 13)}<span>CSS, SwiftUI, Compose…</span></button></div>`);
}
async function onPropsClick(D, b) {
  const s = S(D); const sel = selected(D); const o = sel.length === 1 ? sel[0] : null;
  const k = b.dataset.mo;
  if (k === 'lib') { library(D, b); return; }
  if (k === 'popen') { toggle(D); return; }
  if (k === 'pkprev' || k === 'pknext') { jumpKey(D, k === 'pknext' ? 1 : -1); return; }
  if (k === 'pcode' && o) { codeSheet(D, [o]); return; }
  if (!o) return;
  if (k === 'key') {
    if (!canEdit()) return;
    const p = b.dataset.p; const m = M.normalizeMotion(o.nxMotion); const base = ML.baseFromRaw(o);
    if (M.keyAt(m, p, s.t)) M.removeKey(m, p, s.t); else M.setKey(m, p, s.t, M.keyedValueAt(m, base, p, s.t));
    s.exp.add(String(o.id));
    if (!s.open) open(D);
    commit(D, o, m, 'Image clé');
    D.renderProps();
    return;
  }
  if (k === 'pease' && s.sel) { easeEditor(D, b, { kind: 'key', oid: o.id, prop: s.sel.prop, t: s.sel.t }); return; }
  if (k === 'clip') { clipEditor(D, b, o.id, Number(b.dataset.cid)); return; }
  if (k === 'clipdel') { if (!canEdit()) return; const m = M.normalizeMotion(o.nxMotion); m.clips = m.clips.filter((c) => c.id !== Number(b.dataset.cid)); commit(D, o, m, 'Clip supprimé'); D.renderProps(); return; }
  if (k === 'clear') { if (!canEdit()) return; commit(D, o, M.emptyMotion(), 'Animation retirée'); D.renderProps(); }
}
function onPropsChange(D, input) {
  const s = S(D); const sel = selected(D); const o = sel.length === 1 ? sel[0] : null; if (!o) return;
  if (!canEdit()) { D.renderProps(); return; }
  const [p, axis] = input.dataset.mok.split('.');
  const info = M.PROP[p]; if (!info) return;
  const m = M.normalizeMotion(o.nxMotion); const base = ML.baseFromRaw(o);
  const shown = M.valueAt(m, base, p, s.t);
  let v;
  if (info.kind === 'color') v = input.value;
  else if (info.kind === 'vec2') { const n = Number(String(input.value).replace(',', '.')); if (!Number.isFinite(n)) return; v = { ...shown, [axis]: n / info.factor }; }
  else { v = Number(String(input.value).replace(',', '.')); if (!Number.isFinite(v)) return; v /= info.factor; }
  const keyed = M.keyedValueAt(m, base, p, s.t);
  // Valeur affichée → valeur de la piste (les clips s'ajoutent ou multiplient par-dessus).
  const toKey = (x) => {
    if (info.kind === 'color') return x;
    if (p === 'position') return { x: keyed.x + x.x - shown.x, y: keyed.y + x.y - shown.y };
    if (p === 'rotation') return keyed + x - shown;
    if (p === 'scale') return { x: shown.x ? keyed.x * (x.x / shown.x) : x.x, y: shown.y ? keyed.y * (x.y / shown.y) : x.y };
    if (['opacity', 'width', 'height'].includes(p)) return shown ? keyed * (x / shown) : x;
    return x;
  };
  if (m.tracks[p] || (autoKey() && s.t > 0)) {
    if (!m.tracks[p]) M.setKey(m, p, 0, M.keyedValueAt(m, base, p, 0));
    M.setKey(m, p, s.t, toKey(v));
    s.exp.add(String(o.id));
    commit(D, o, m, 'Image clé');
  } else {
    // Sans piste : la valeur du calque change (échelle : facteur appliqué au calque, qui reste à 100 %).
    let bv = toKey(v);
    if (p === 'scale') bv = { x: keyed.x ? bv.x / keyed.x : 1, y: keyed.y ? bv.y / keyed.y : 1 };
    ML.setBase(o, p, bv, s.open ? s.t : null);
    D.nxNextLabel = M.PROP[p].name; D.changed();
    D.canvas.requestRenderAll();
  }
  D.renderProps();
}

// ---------- Branchement ----------
export function install(D) {
  if (D.nxMotionUi) return;
  if (!document.querySelector('link[data-nxm-css]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('./motion.css', import.meta.url).href; l.dataset.nxmCss = '1'; document.head.append(l); }
  D.nxMotionUi = { isOpen: () => isOpen(D), togglePlay: () => togglePlay(D), time: () => time(D), seek: (t) => seek(D, t), toggle: () => toggle(D), open: () => open(D) };
  const proto = Object.getPrototypeOf(D);
  // Toute modification faite à la tête de lecture : image clé ou nouvel état de base, avant l'enregistrement.
  if (!proto.nxMoChanged) {
    proto.nxMoChanged = proto.changed;
    proto.changed = function () {
      const s = ST.get(this);
      if (s && s.open && !s.playing && !this.loading) {
        try { if (ML.reconcile(this, s.t, { autoKey: autoKey() })) paintSoon(this); } catch (e) { console.warn('[NEXORA #113]', e); }
      }
      return this.nxMoChanged();
    };
  }
  // Page rechargée (annuler, rétablir, autre page) : la frise remontre la tête de lecture.
  if (!proto.nxMoLoadPage) {
    proto.nxMoLoadPage = proto.loadPage;
    proto.loadPage = async function (pg, json) {
      const s = ST.get(this);
      if (s && s.playing) stop(this);
      await this.nxMoLoadPage(pg, json);
      if (s && s.open) { s.t = Math.min(s.t, tlOf(this).ms); s.sel = null; ML.showFrame(this, s.t); paintSoon(this); }
    };
  }
  // Exports d'images fixes et vignettes : état de base des calques, quelle que soit la tête de lecture.
  for (const k of ['exportCanvas', 'toSvg', 'thumb']) {
    const key = `nxMo_${k}`;
    if (typeof proto[k] === 'function' && !proto[key]) { proto[key] = proto[k]; proto[k] = function (...a) { return ML.withBase(this, () => this[key](...a)); }; }
  }
  if (!proto.nxMoOnKey) {
    proto.nxMoOnKey = proto.onKey;
    proto.onKey = function (e) { if (onKey(this, e)) return undefined; return this.nxMoOnKey(e); };
  }
  const c = D.canvas;
  const resel = () => {
    const s = S(D); if (!s.open) return;
    // Une sélection multiple défaite : les calques retrouvent leur place absolue, la modification est prise en compte.
    try { if (!s.playing && ML.reconcile(D, s.t, { autoKey: autoKey() })) D.changed(); } catch (e) { console.warn('[NEXORA #113]', e); }
    s.sel = s.sel && selected(D).some((o) => String(o.id) === String(s.sel.oid)) ? s.sel : null;
    if (!s.playing) ML.showFrame(D, s.t);
    paintSoon(D);
  };
  c.on('selection:created', resel); c.on('selection:updated', resel); c.on('selection:cleared', resel);
  c.on('object:added', () => { if (S(D).open) paintSoon(D); });
  c.on('object:removed', () => { if (S(D).open) paintSoon(D); });
  c.on('after:render', (opt) => { try { if (opt && opt.ctx) drawPath(D, opt.ctx); } catch { /* trajectoire facultative */ } });
  D.$.props.addEventListener('click', (e) => { const b = e.target.closest('[data-mo]'); if (!b || b.disabled || !D.$.props.contains(b)) return; e.stopPropagation(); onPropsClick(D, b).catch((er) => toast(clean(er), { kind: 'bad' })); });
  D.$.props.addEventListener('change', (e) => { const t = e.target; if (t.dataset && t.dataset.mok) { try { onPropsChange(D, t); } catch (er) { toast(clean(er), { kind: 'bad' }); } } });
}
