// NEXORA #118 : mises en scène réalistes du Studio, d'après les références de l'utilisateur : appareils réalistes
// (#100) avec la capture de la page ouverte ou un écran d'exemple aux couleurs du kit de marque, roches, fond et
// lumière de studio photo, cadrage. Ajoutées à la liste « Mises en scène » du panneau de gauche ; l'appareil
// principal reste sélectionné (contour et poignées) pour être ajusté tout de suite.
import * as THREE from '../../dist/chunks/three-D5YSJNBV.js';
import { c as freshAnim } from '../../dist/chunks/chunk-2DYF2ZBK.js';
import * as DEV from './devices.js';
import * as ROCKS from './rocks.js';
import { screenCanvas } from '../design/ecrans.js';
import { getBrand } from '../services.js';
import { toast, busy, done, esc, icon } from './ui.js';
import { mixHex } from '../core.js';

export const STAGINGS = {
  rochers: ['Ordinateur entre les roches', 'laptop'],
  dessous: ['Ordinateur vu de dessous', 'laptop'],
  diagonale: ['Téléphones en diagonale', 'multi'],
  tablette: ['Tablette inclinée', 'tablet'],
};

export const listHtml = () => Object.entries(STAGINGS).map(([k, [label, ic]]) => `<button class="st-preset sx-staging" data-sx-scene="${k}" title="Mise en scène réaliste : ${esc(label)}">${icon(ic, 15)}<span>${esc(label)}</span></button>`).join('');

// Capture d'une vraie page ouverte sur un appareil de la scène (jamais le fond d'écran par défaut).
function pageShot(S) {
  for (const id of S.order || []) {
    const e = S.objects.get(id); const p = e && e.item.type === 'device' && S.pages && S.pages.get(`${id}:main`);
    const c = p && (p.canvas || p);
    if (c instanceof HTMLCanvasElement && c.width > 8) { try { return c.toDataURL('image/jpeg', 0.9); } catch { /* image d'une autre origine */ } }
  }
  return null;
}
async function device(S, key, screen, { pos, rot }) {
  const id = await S.registerGlb(await DEV.build(key, screen));
  const item = S.addDecor({ kind: 'glb', glbId: id, color: '#ffffff', nxDevice: key, nxScreen: typeof screen === 'string' ? 'scene' : 'exemple', pos, rot }, { select: false, history: false });
  if (item) item.name = DEV.DEVICES[key].name;
  return item;
}
async function rock(S, seed, { pos, rot = [0, 0, 0], size = 24, flat = 0.7 }) {
  const id = await S.registerGlb(await ROCKS.build({ seed, size, flat }));
  const item = S.addDecor({ kind: 'glb', glbId: id, color: '#ffffff', pos, rot }, { select: false, history: false });
  if (item) item.name = 'Roche';
  return item;
}

export async function apply(S, key) {
  const def = STAGINGS[key]; if (!def) return;
  const t = busy(`Mise en scène : ${def[0]}…`);
  try {
    const brand = getBrand(); const A = brand.colors[0];
    // Capture de la page ouverte (comme « Appareils réalistes »), sinon écran d'exemple du kit de marque.
    const shot = pageShot(S);
    const ex = (kind, land = false) => shot || ((aspect) => screenCanvas(kind, brand, aspect, { land }));
    for (const id of [...S.order]) S.remove(id, { history: false });
    S.anim = freshAnim();
    const env = S.three.env; let main = null; let dir = [0.2, 0.3, 1]; let zoom = 1;
    if (key === 'rochers') {
      S.three.applyEnv({ ...env, bg: 'gradient', bgColor: mixHex(A, '#ffffff', 0.12), bgColor2: mixHex(A, '#000000', 0.86), floor: 'none', light: 'contraste' });
      await rock(S, 11, { pos: [16, 0, -17], rot: [0, -30, 0], size: 26, flat: 0.9 });
      main = await device(S, 'macbook-pro-16', ex('site'), { pos: [0, 5, 2], rot: [-8, 24, 9] });
      await rock(S, 3, { pos: [-23, 0, 5], rot: [0, 20, 0], size: 20, flat: 0.62 });
      await rock(S, 7, { pos: [21, 0, 12], rot: [0, -10, 0], size: 18, flat: 0.6 });
      dir = [0.1, 0.24, 1]; zoom = 0.5;
    } else if (key === 'dessous') {
      S.three.applyEnv({ ...env, bg: 'gradient', bgColor: '#f4f4f5', bgColor2: '#c4c4c8', floor: 'none', light: 'doux' });
      main = await device(S, 'macbook-pro-16', ex('dash'), { pos: [0, 0, 0], rot: [0, 28, 0] });
      dir = [0.42, -0.32, 1]; zoom = 0.55;
    } else if (key === 'diagonale') {
      S.three.applyEnv({ ...env, bg: 'gradient', bgColor: '#f7f7f8', bgColor2: '#d2d2d6', floor: 'shadow', light: 'doux' });
      await device(S, 'iphone-18-pro', ex('app'), { pos: [8, 15, -6], rot: [6, -12, -42] });
      main = await device(S, 'iphone-18-pro', ex('app'), { pos: [-5, 4, 2], rot: [6, -12, -42] });
      dir = [0, 0.12, 1];
    } else if (key === 'tablette') {
      S.three.applyEnv({ ...env, bg: 'gradient', bgColor: '#ededef', bgColor2: '#8e8e93', floor: 'none', light: 'studio' });
      main = await device(S, 'ipad-pro-13', ex('sombre', true), { pos: [0, 14, 0], rot: [-8, -26, 84] });
      dir = [0.05, 0.12, 1];
    }
    S.time = 0; S.applyTime();
    S.frameAll(false, new THREE.Vector3(...dir));
    // Cadrage resserré (les roches débordent du cadre, comme sur une photo produit).
    if (zoom !== 1 && S.controls && main) {
      const e = S.objects.get(main.id); const root = e && e.model && e.model.root;
      const c = S.three.camera; const tg = S.controls.target; const off = c.position.clone().sub(tg).multiplyScalar(zoom);
      if (root) new THREE.Box3().setFromObject(root).getCenter(tg);
      c.position.copy(tg).add(off); S.controls.update();
    }
    if (main) S.select(main.id); else S.select(null);
    S.renderList(); if (S.timeline) S.timeline.render(); S.resize(); S.dirty = true; S.commit();
    toast(`${def[0]} : appareils réalistes à taille réelle${shot ? ' avec la capture de la page' : ' avec un écran d’exemple aux couleurs de votre marque'}. Changez l’écran dans le panneau de droite.`);
  } catch (er) { console.error('[NEXORA #118] mise en scène', er); toast(er.message || String(er), { kind: 'bad' }); } finally { done(t); }
}
