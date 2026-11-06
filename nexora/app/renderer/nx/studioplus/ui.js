// NEXORA #055 : socle commun des fonctions ajoutées au Studio 3D & Motion (cartes du panneau, offres, rendus).
import { api, esc, toast, busy, settings, saveSettings, uid, pickFile, saveBytes, zip, dataUrlBytes, bytesB64, prompt, state, safeName, clamp, sleep } from '../core.js';
import { b as icon } from '../../dist/chunks/chunk-S4I2LXHS.js';
import { current } from '../offres/status.js';
import { FALLBACK, normPlan } from '../offres/catalog.js';
import { Box3, Vector3 } from '../studio/three.js';

export { api, esc, toast, busy, settings, saveSettings, uid, pickFile, saveBytes, zip, dataUrlBytes, bytesB64, prompt, state, safeName, clamp, sleep, icon };

// Offre Pro (Studio 3D avancé) ; les cartes Pro portent la classe nx-st-card, voilée sans Pro par nx/offres/locks.js.
export const PRO = 'studio_advanced';
export function has(perm = PRO) {
  const s = current();
  if (s.admin) return true;
  if (s.perms && perm in s.perms) return !!s.perms[perm];
  return !!((FALLBACK[normPlan(s.plan)] || FALLBACK.free).perms[perm]);
}
export function allowed(what) {
  if (has()) return true;
  toast(`${what} fait partie de l’offre Pro.`, { action: 'Voir les offres', onAction: () => { const b = document.querySelector('[data-nxo-offers]'); if (b) b.click(); } });
  return false;
}

// Scène ouverte : identifiant stable du Studio (#005 : settings.studioSceneCur) et nom donné par l'utilisateur.
export const sceneKey = (S) => settings.studioSceneCur || (S && S.sceneName ? S.sceneName() : 'scene');
export function sceneTitle(S) {
  const sc = Array.isArray(settings.studioScenes) && settings.studioScenes.find((x) => x && x.id === settings.studioSceneCur);
  return (sc && sc.name) || (S && S.sceneName ? S.sceneName() : '') || 'Scène';
}

// ---------- Briques du panneau (même balisage que le Studio) ----------
export const head = (t) => `<div class="st-field nx-st-title"><span>${t}</span></div>`;
export const card = (key, title, ic, body, { pro = false } = {}) => `<section class="st-card ${pro ? 'nx-st-card' : 'sx-card'}" data-sxcard="${key}">${head(`${icon(ic, 13)} ${esc(title)}${pro ? ' <em class="sx-pro">Pro</em>' : ''}`)}${body}</section>`;
export const btn = (a, label, ic, { primary = false, extra = '' } = {}) => `<button class="btn small${primary ? ' primary' : ''}" data-sx="${a}" ${extra}>${ic ? icon(ic, 13) : ''}<span>${esc(label)}</span></button>`;
export const btns = (...b) => `<div class="st-btns">${b.join('')}</div>`;
export const note = (t) => `<p class="nx-st-note">${t}</p>`;
export const field = (label, body) => `<div class="st-field"><span>${label}</span>${body}</div>`;
export const chips = (key, cur, opts) => `<div class="st-chips">${Object.entries(opts).map(([v, l]) => `<button class="st-chip${String(cur) === String(v) ? ' on' : ''}" data-sxset="${key}" data-val="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;
export const check = (label, key, on) => `<label class="check-row"><input type="checkbox" data-sxk="${key}" ${on ? 'checked' : ''}><span class="box"></span><span>${label}</span></label>`;
export const details = (title, ic, body, open = false) => `<details class="st-adv"${open ? ' open' : ''}><summary>${icon(ic, 13)}<span>${esc(title)}</span></summary>${body}</details>`;

// ---------- Scène ----------
export function contentBox(S) {
  const b = S.contentBox ? S.contentBox() : new Box3().setFromObject(S.three.content);
  return b.isEmpty() ? new Box3(new Vector3(-5, 0, -5), new Vector3(5, 10, 5)) : b;
}
// Image fixe de la vue actuelle (ou d'un appareil photo réglé), suréchantillonnée pour des bords nets.
export function still(S, w, h, { transparent = false, overlay = false, t = null } = {}) {
  const k = Math.max(w, h) > 2400 ? 1 : 2;
  const fr = S.three.renderOnce(w * k, h * k, { transparent });
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(fr, 0, 0, w, h);
  if (overlay) S.paintOverlay(c, t ?? S.time, false);
  return c;
}
// Exécute fn en préparant la scène pour un rendu (aides masquées, lecture en pause), puis rétablit l'état.
export async function rendering(S, fn) {
  const keep = S.time; const cam = S.three.camera; const c0 = { pos: cam.position.clone(), fov: cam.fov, target: S.controls.target.clone() };
  if (S.playing) S.togglePlay();
  S.exporting = true; if (S.editorVisible) S.editorVisible(false);
  try { return await fn(); } finally {
    S.exporting = false; if (S.editorVisible) S.editorVisible(true);
    cam.position.copy(c0.pos); cam.fov = c0.fov; cam.updateProjectionMatrix(); S.controls.target.copy(c0.target); cam.lookAt(c0.target);
    S.setTime(keep); S.dirty = true; if (!S.raf && S.loop) S.loop();
  }
}
export async function frameAt(S, t) { S.time = t; S.applyTime(); const p = S.applyClips && S.applyClips({ exact: true }); if (p) await p; }
export const projectName = () => (state.source ? state.source.name : 'Studio');
export const done = (t) => { if (!t) return; if (t.close) t.close(); };
