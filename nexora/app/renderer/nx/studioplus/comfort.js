// NEXORA #055 : confort et accessibilité : aperçu adaptatif (résolution réduite quand l'image saccade, indicateur
// d'images par seconde), contrôle des flashs dans les vidéos exportées (plus de 3 par seconde), notification de
// fin d'export quand NEXORA est en arrière-plan.
import { flashRate } from './formats.js';
import { toast, settings, saveSettings } from './ui.js';

// NEXORA #118 : outline = contour orange de la sélection dans la vue d'édition.
const opts = () => (settings.nxStudioComfort = { adaptive: true, fps: false, flash: true, outline: true, ...(settings.nxStudioComfort || {}) });
export const comfort = opts;
export function set(k, v) { opts()[k] = v; saveSettings(); }

// Mesure des images par seconde et réduction de la résolution d'aperçu (jamais pendant un rendu).
export function watch(S) {
  if (S.sxWatch) return; S.sxWatch = true;
  let last = performance.now(); let n = 0; let low = 0; let high = 0; S.sxFps = 60; S.sxScale = 1;
  const r = S.three.renderer; const base = () => (S.sxBasePr || (S.sxBasePr = r.getPixelRatio()));
  const tick = (now) => {
    requestAnimationFrame(tick); n++;
    if (now - last < 1000) return;
    S.sxFps = Math.round(n * 1000 / (now - last)); n = 0; last = now;
    const badge = S.$.frame && S.$.frame.parentElement && S.$.frame.parentElement.querySelector('.sx-fps');
    if (badge) { badge.hidden = !opts().fps; badge.textContent = `${S.sxFps} i/s${S.sxScale < 1 ? ' · aperçu allégé' : ''}`; }
    if (S.exporting || !opts().adaptive) { if (S.sxScale !== 1 && !S.exporting) { S.sxScale = 1; r.setPixelRatio(base()); S.resize && S.resize(); } return; }
    const busy = S.playing || S.sxDragging;
    if (busy && S.sxFps < 28) { low++; high = 0; } else if (S.sxFps > 50 || !busy) { high++; low = 0; }
    if (low >= 2 && S.sxScale > 0.6) { S.sxScale = Math.max(0.6, S.sxScale - 0.2); r.setPixelRatio(base() * S.sxScale); S.resize && S.resize(); low = 0; S.dirty = true; }
    if (high >= 3 && S.sxScale < 1) { S.sxScale = Math.min(1, S.sxScale + 0.2); r.setPixelRatio(base() * S.sxScale); S.resize && S.resize(); high = 0; S.dirty = true; }
  };
  requestAnimationFrame(tick);
  const cv = S.$.canvas;
  if (cv) { cv.addEventListener('pointerdown', () => { S.sxDragging = true; }); addEventListener('pointerup', () => { S.sxDragging = false; }); }
  const host = S.$.frame && S.$.frame.parentElement;
  if (host && !host.querySelector('.sx-fps')) host.insertAdjacentHTML('beforeend', '<span class="sx-fps" hidden aria-live="off"></span>');
}

// Luminosité moyenne de chaque image exportée (vignette 24 × 24), puis contrôle des flashs à la fin.
export function wrapFlash(proto) {
  if (proto.sxPaintFlash) return;
  proto.sxPaintFlash = proto.paintOverlay;
  const probe = document.createElement('canvas'); probe.width = probe.height = 24; const px = probe.getContext('2d', { willReadFrequently: true });
  proto.paintOverlay = function (cv, t, photo, ...rest) {
    const r = this.sxPaintFlash(cv, t, photo, ...rest);
    if (this.exporting && !photo && this.sxLumas) {
      try { px.drawImage(r && r.getContext ? r : cv, 0, 0, 24, 24); const d = px.getImageData(0, 0, 24, 24).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; this.sxLumas.push(s / 576); } catch { /* */ }
    }
    return r;
  };
  if (proto.sxExportFlash) return;
  proto.sxExportFlash = proto.exportVideo;
  proto.exportVideo = async function (...args) {
    this.sxLumas = opts().flash ? [] : null;
    const r = await this.sxExportFlash(...args);
    const lumas = this.sxLumas; this.sxLumas = null;
    if (r && lumas && lumas.length > 2) {
      const rate = flashRate(lumas, this.anim.fps || 30);
      if (rate > 3) toast(`Attention : la vidéo contient jusqu’à ${String(rate).replace('.', ',')} flashs par seconde. Au-delà de 3, elle peut gêner les personnes photosensibles : allongez ou espace les flashs.`, { kind: 'bad', sticky: true });
    }
    if (r && document.hidden && 'Notification' in window) { try { new Notification('Vidéo exportée', { body: 'NEXORA a terminé le rendu de votre vidéo.' }); } catch { /* */ } }
    return r;
  };
}
