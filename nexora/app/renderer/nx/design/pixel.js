// NEXORA #011 : retouche d'image de NEX-DESIGN (sélections, pinceaux, recadrage, remplissages, IA).
import { FabricImage, Rect, apply, invert } from './fab.js';
import { setMaskCanvas, maskCanvasOf } from './fx.js';
import { replaceObj } from './vector.js';
import { settings, saveSettings, toast, busy, clamp, makeCanvas, cloneCanvas, floodMask, backgroundMask, invertMask, blurMask, polygonMask, maskCanvas, maskBounds, inpaint, traceMask, prompt, sheet, closeSheet, sheetHtml, esc, loadImage, uid } from '../core.js';
import { aiImage, needAi } from '../services.js';

export const PIX_TOOLS = {
  lasso: ['Lasso', 'nxLasso', 'Q'],
  wand: ['Baguette magique', 'nxWand', 'W'],
  brush: ['Pinceau de retouche', 'nxBrush', 'J'],
  eraser: ['Gomme', 'nxEraser', 'E'],
  stamp: ['Tampon de duplication (Alt + clic : source)', 'nxStamp', 'S'],
  heal: ['Correcteur (Alt + clic : source)', 'nxHeal', 'X'],
  maskbrush: ['Masque au pinceau', 'nxMaterial', 'M'],
  crop: ['Recadrer', 'nxCrop', 'C']
};
const OPTS = () => (settings.nxPix = { size: 40, hard: 0.6, opacity: 1, color: '#ffffff', tol: 32, contiguous: true, maskMode: 'hide', ...(settings.nxPix || {}) });
export const pixOpts = OPTS;

const elemOf = (o) => o._originalElement || (o.getElement && o.getElement());
const elemSize = (o) => { const e = elemOf(o); return [e.naturalWidth || e.width, e.naturalHeight || e.height]; };

export class PixelTools {
  constructor(D) { this.D = D; this.tool = null; this.sel = null; this.stroke = null; this.src = null; this.crop = null; }
  get o() { const a = this.D.canvas.getActiveObject(); return a && a.type === 'image' ? a : (this.target && this.D.canvas.getObjects().includes(this.target) ? this.target : null); }
  // Point de la page vers pixel de l'image d'origine.
  toElem(o, p) {
    const m = invert(o.calcTransformMatrix()); const l = apply(m, p.x, p.y);
    return { x: l.x + o.width / 2 + (o.cropX || 0), y: l.y + o.height / 2 + (o.cropY || 0) };
  }
  toScene(o, x, y) { return apply(o.calcTransformMatrix(), x - o.width / 2 - (o.cropX || 0), y - o.height / 2 - (o.cropY || 0)); }
  // Image sous le pointeur (les calques ne sont pas cliquables pendant ces outils).
  pickImage(e) {
    const p = this.D.canvas.getScenePoint(e);
    const hit = this.D.canvas.getObjects().filter((o) => o.type === 'image' && o.visible !== false).reverse().find((o) => o.containsPoint(p));
    return hit || (this.target && this.target.type === 'image' && this.D.canvas.getObjects().includes(this.target) ? this.target : null);
  }
  setTool(id) {
    this.finishCrop(false);
    this.tool = id;
    if (id === 'crop') { const o = this.o; if (!o) { toast('Sélectionnez d’abord une image à recadrer.', { kind: 'bad' }); this.tool = null; return false; } this.startCrop(o); return true; }
    const a = this.D.canvas.getActiveObject();
    if (a) this.target = a;
    if ((id === 'maskbrush') && !a) { toast('Sélectionnez d’abord le calque à masquer.', { kind: 'bad' }); this.tool = null; return false; }
    if (id !== 'maskbrush' && (!a || a.type !== 'image')) toast('Cliquez sur une image pour l’utiliser avec cet outil.');
    return true;
  }
  // ---------- Événements de la souris ----------
  down(opt) {
    const e = opt.e; const D = this.D; const p = D.canvas.getScenePoint(e);
    if (this.tool === 'maskbrush') {
      const o = this.target; if (!o) return;
      this.stroke = { o, mask: this.maskWork(o), last: null };
      this.dabMask(p); D.canvas.requestRenderAll();
      return;
    }
    const o = this.pickImage(e);
    if (!o) { toast('Cliquez sur une image.', { kind: 'bad' }); return; }
    this.target = o;
    if (this.tool === 'lasso') { this.stroke = { o, pts: [p] }; return; }
    if (this.tool === 'wand') { this.wand(o, p, e); return; }
    if ((this.tool === 'stamp' || this.tool === 'heal') && e.altKey) { this.src = { o, ...this.toElem(o, p) }; toast('Source définie : peignez maintenant là où corriger.'); return; }
    if ((this.tool === 'stamp' || this.tool === 'heal') && (!this.src || this.src.o !== o)) { toast('Alt + clic d’abord sur la zone à copier (source).', { kind: 'bad' }); return; }
    if (['brush', 'eraser', 'stamp', 'heal'].includes(this.tool)) {
      const work = cloneCanvas(elemOf(o));
      const at = this.toElem(o, p);
      this.stroke = { o, work, ctx: work.getContext('2d', { willReadFrequently: true }), last: null, off: this.src ? { x: this.src.x - at.x, y: this.src.y - at.y } : null, ref: this.tool === 'heal' || this.tool === 'stamp' ? cloneCanvas(elemOf(o)) : null };
      o.nxPainting = true;
      this.dab(p);
    }
  }
  move(opt) {
    const s = this.stroke; if (!s) return;
    const p = this.D.canvas.getScenePoint(opt.e);
    if (this.tool === 'lasso') { s.pts.push(p); this.D.canvas.requestRenderAll(); return; }
    if (this.tool === 'maskbrush') { this.dabMask(p); this.D.canvas.requestRenderAll(); return; }
    this.dab(p);
  }
  up() {
    const s = this.stroke; this.stroke = null; if (!s) return;
    if (this.tool === 'lasso') {
      if (s.pts.length < 3) return;
      const [w, h] = elemSize(s.o);
      const m = polygonMask(s.pts.map((q) => { const e = this.toElem(s.o, q); return [e.x, e.y]; }), w, h);
      this.setSelection(s.o, m, opt0.shift ? 'add' : 'new');
      return;
    }
    if (this.tool === 'maskbrush') { const o = s.o; o.nxMask = s.mask.toDataURL('image/png'); setMaskCanvas(o, s.mask); o.dirty = true; this.D.changed(); return; }
    if (s.work) { s.o.nxPainting = false; this.commit(s.o, s.work); }
  }
  // ---------- Pinceaux ----------
  dab(p) {
    const s = this.stroke; const o = s.o; const O = OPTS(); const at = this.toElem(o, p);
    const k = Math.abs(o.scaleX) || 1; const r = Math.max(1, O.size / 2 / k);
    const pts = [];
    if (s.last) { const d = Math.hypot(at.x - s.last.x, at.y - s.last.y); const n = Math.max(1, Math.ceil(d / Math.max(1, r / 4))); for (let i = 1; i <= n; i++) pts.push({ x: s.last.x + (at.x - s.last.x) * i / n, y: s.last.y + (at.y - s.last.y) * i / n }); } else pts.push(at);
    s.last = at;
    const x = s.ctx;
    for (const q of pts) {
      if (this.tool === 'brush' || this.tool === 'eraser') {
        const g = x.createRadialGradient(q.x, q.y, r * O.hard, q.x, q.y, r);
        const col = this.tool === 'eraser' ? '0,0,0' : hexToRgbStr(O.color);
        g.addColorStop(0, `rgba(${col},${O.opacity})`); g.addColorStop(1, `rgba(${col},0)`);
        x.save(); x.globalCompositeOperation = this.tool === 'eraser' ? 'destination-out' : 'source-over'; x.fillStyle = g; x.beginPath(); x.arc(q.x, q.y, r, 0, Math.PI * 2); x.fill(); x.restore();
      } else {
        // Tampon et correcteur : copie depuis la source (décalage constant), fondu circulaire.
        const sx = q.x + s.off.x; const sy = q.y + s.off.y; const d = Math.ceil(r * 2);
        const patch = makeCanvas(d, d); const px = patch.getContext('2d', { willReadFrequently: true });
        px.drawImage(s.ref, sx - r, sy - r, d, d, 0, 0, d, d);
        if (this.tool === 'heal') {
          const dst = s.ref.getContext('2d', { willReadFrequently: true }).getImageData(Math.round(q.x - r), Math.round(q.y - r), d, d);
          const src = px.getImageData(0, 0, d, d); const mean = (im) => { const m = [0, 0, 0]; let n = 0; for (let i = 0; i < im.data.length; i += 16) { m[0] += im.data[i]; m[1] += im.data[i + 1]; m[2] += im.data[i + 2]; n++; } return m.map((v) => v / Math.max(1, n)); };
          const md = mean(dst); const ms = mean(src);
          for (let i = 0; i < src.data.length; i += 4) for (let c = 0; c < 3; c++) src.data[i + c] = clamp(src.data[i + c] + (md[c] - ms[c]), 0, 255);
          px.putImageData(src, 0, 0);
        }
        px.globalCompositeOperation = 'destination-in';
        const g = px.createRadialGradient(r, r, r * O.hard, r, r, r); g.addColorStop(0, `rgba(0,0,0,${O.opacity})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        px.fillStyle = g; px.fillRect(0, 0, d, d);
        x.drawImage(patch, q.x - r, q.y - r);
      }
    }
    o._element = s.work; o.dirty = true; this.D.canvas.requestRenderAll();
  }
  maskWork(o) {
    const cur = maskCanvasOf(o);
    const w = o.type === 'image' ? elemSize(o)[0] : Math.max(8, Math.round(o.width * 2));
    const h = o.type === 'image' ? elemSize(o)[1] : Math.max(8, Math.round(o.height * 2));
    const c = makeCanvas(w, h); const x = c.getContext('2d');
    if (cur) x.drawImage(cur, 0, 0, w, h); else { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); }
    return c;
  }
  dabMask(p) {
    const s = this.stroke; const o = s.o; const O = OPTS(); const c = s.mask;
    const m = invert(o.calcTransformMatrix()); const l = apply(m, p.x, p.y);
    const isImg = o.type === 'image';
    const ex = isImg ? l.x + o.width / 2 + (o.cropX || 0) : (l.x + o.width / 2) * (c.width / o.width);
    const ey = isImg ? l.y + o.height / 2 + (o.cropY || 0) : (l.y + o.height / 2) * (c.height / o.height);
    const k = isImg ? Math.abs(o.scaleX) || 1 : (Math.abs(o.scaleX) || 1) * (o.width / c.width);
    const r = Math.max(1, O.size / 2 / k);
    const x = c.getContext('2d'); const g = x.createRadialGradient(ex, ey, r * O.hard, ex, ey, r);
    g.addColorStop(0, `rgba(255,255,255,${O.opacity})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.save(); x.globalCompositeOperation = O.maskMode === 'hide' ? 'destination-out' : 'source-over'; x.fillStyle = g; x.beginPath(); x.arc(ex, ey, r, 0, Math.PI * 2); x.fill(); x.restore();
    o.nxMask = o.nxMask || 'pending'; setMaskCanvas(o, c); o.objectCaching = false; o.dirty = true;
  }
  // Remplace l'image (garde position, recadrage et filtres ; l'original reste disponible).
  commit(o, canvas) {
    if (!o.nxOrig) { try { o.nxOrig = o.getSrc(); } catch { /* source inconnue */ } }
    const keep = { width: o.width, height: o.height, cropX: o.cropX, cropY: o.cropY };
    const same = (canvas.width === elemSize(o)[0] && canvas.height === elemSize(o)[1]);
    o.setElement(canvas);
    if (same) o.set(keep);
    this.D.applyFx(o); o.dirty = true; o.setCoords();
    this.D.canvas.requestRenderAll(); this.D.changed();
  }
  async restoreOriginal(o) {
    if (!o.nxOrig) { toast('Cette image n’a pas été retouchée.'); return; }
    const keepW = o.getScaledWidth(); const c = o.getCenterPoint();
    await o.setSrc(o.nxOrig); o.nxOrig = null; o.scaleToWidth(keepW); o.setPositionByOrigin(c, 'center', 'center');
    this.D.applyFx(o); this.D.canvas.requestRenderAll(); this.D.changed(); toast('Image d’origine rétablie.');
  }
  // ---------- Sélections ----------
  wand(o, p, e) {
    const O = OPTS(); const at = this.toElem(o, p); const [w, h] = elemSize(o);
    const c = cloneCanvas(elemOf(o)); const img = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h);
    const m = floodMask(img, at.x, at.y, O.tol, O.contiguous);
    this.setSelection(o, m, e.shiftKey ? 'add' : e.altKey ? 'sub' : 'new');
  }
  setSelection(o, m, mode = 'new') {
    const [w, h] = elemSize(o);
    if (this.sel && this.sel.o === o && mode !== 'new') {
      const a = this.sel.mask; for (let i = 0; i < m.length; i++) m[i] = mode === 'add' ? Math.max(a[i], m[i]) : Math.min(a[i], 255 - m[i]);
    }
    this.sel = { o, mask: m, w, h };
    this.sel.overlay = this.selOverlay();
    this.D.canvas.requestRenderAll();
    this.onSel && this.onSel();
  }
  selOverlay() {
    const s = this.sel; const c = maskCanvas(s.mask, s.w, s.h); const x = c.getContext('2d');
    x.globalCompositeOperation = 'source-in'; x.fillStyle = 'rgba(10,132,255,0.32)'; x.fillRect(0, 0, s.w, s.h);
    // Contour de la sélection (pointillés), calculé sur une version réduite.
    const k = Math.min(1, 360 / Math.max(s.w, s.h)); const sw = Math.max(4, Math.round(s.w * k)); const sh = Math.max(4, Math.round(s.h * k));
    const small = makeCanvas(sw, sh); const sx = small.getContext('2d', { willReadFrequently: true }); sx.drawImage(maskCanvas(s.mask, s.w, s.h), 0, 0, sw, sh);
    const d = sx.getImageData(0, 0, sw, sh).data; const mm = new Uint8Array(sw * sh); for (let i = 0; i < mm.length; i++) mm[i] = d[i * 4 + 3];
    s.contours = traceMask(mm, sw, sh, { minArea: 2, tolerance: 0.8 }).map((pts) => pts.map(([px, py]) => [px / k, py / k]));
    return c;
  }
  clearSel() { this.sel = null; this.D.canvas.requestRenderAll(); this.onSel && this.onSel(); }
  subject(o, mode = 'select') {
    const [w, h] = elemSize(o); const c = cloneCanvas(elemOf(o)); const img = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h);
    let bg = backgroundMask(img, OPTS().tol + 6);
    bg = blurMask(bg, w, h, Math.max(1, Math.round(Math.min(w, h) / 400)));
    if (mode === 'remove') {
      const x = c.getContext('2d'); const d = x.getImageData(0, 0, w, h);
      for (let i = 0; i < bg.length; i++) d.data[i * 4 + 3] = d.data[i * 4 + 3] * (1 - bg[i] / 255);
      x.putImageData(d, 0, 0); this.commit(o, c);
      toast('Arrière-plan retiré. « Revenir à l’original » le rétablit.');
      return;
    }
    this.setSelection(o, invertMask(bg));
    toast('Sujet sélectionné. Ajustez avec la baguette (Maj : ajouter, Alt : retirer).');
  }
  invertSel() { if (this.sel) this.setSelection(this.sel.o, invertMask(this.sel.mask)); }
  featherSel(r = 3) { if (this.sel) this.setSelection(this.sel.o, blurMask(this.sel.mask, this.sel.w, this.sel.h, r)); }
  applyAlpha(keep) {
    const s = this.sel; if (!s) return;
    const c = cloneCanvas(elemOf(s.o)); const x = c.getContext('2d'); const d = x.getImageData(0, 0, s.w, s.h);
    for (let i = 0; i < s.mask.length; i++) d.data[i * 4 + 3] = d.data[i * 4 + 3] * (keep ? s.mask[i] / 255 : 1 - s.mask[i] / 255);
    x.putImageData(d, 0, 0); const o = s.o; this.clearSel(); this.commit(o, c);
  }
  async copyToLayer() {
    const s = this.sel; if (!s) return;
    const b = maskBounds(s.mask, s.w, s.h); if (!b) { toast('La sélection est vide.', { kind: 'bad' }); return; }
    const src = elemOf(s.o); const c = makeCanvas(b.w, b.h); const x = c.getContext('2d');
    x.drawImage(src, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    x.globalCompositeOperation = 'destination-in'; x.drawImage(maskCanvas(s.mask, s.w, s.h), b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    const img = new FabricImage(c, { scaleX: s.o.scaleX, scaleY: s.o.scaleY, angle: s.o.angle, flipX: s.o.flipX, flipY: s.o.flipY });
    const center = this.toScene(s.o, b.x + b.w / 2, b.y + b.h / 2);
    img.setPositionByOrigin(center, 'center', 'center'); img.id = uid(); img.name = `${s.o.name || 'Image'} (extrait)`;
    const D = this.D; const at = D.canvas.getObjects().indexOf(s.o);
    D.canvas.insertAt(at + 1, img); this.clearSel(); D.canvas.setActiveObject(img); D.changed();
    toast('Zone copiée dans un nouveau calque.');
  }
  fillContent() {
    const s = this.sel; if (!s) return;
    const t = busy('Remplissage selon le contenu…');
    setTimeout(() => {
      try {
        const c = cloneCanvas(elemOf(s.o)); const x = c.getContext('2d', { willReadFrequently: true });
        const out = inpaint(x.getImageData(0, 0, s.w, s.h), blurMask(s.mask, s.w, s.h, 2));
        x.putImageData(out, 0, 0); const o = s.o; this.clearSel(); this.commit(o, c);
      } finally { t.close(); }
    }, 30);
  }
  async aiFill() {
    const s = this.sel; if (!s) { toast('Faites d’abord une sélection (lasso, baguette ou sujet).', { kind: 'bad' }); return; }
    if (!(await needAi())) return;
    const what = await prompt('Remplissage génératif', { label: 'Que faut-il mettre dans la zone sélectionnée ? Laissez vide pour effacer naturellement.', icon: 'sparkle', placeholder: 'un ciel au coucher du soleil, une plante verte…', go: 'Générer' });
    if (what === null) return;
    const t = busy('Génération par l’IA…');
    try {
      const res = await this.aiEdit(s.o, s.mask, what || 'Effacez l’objet de cette zone et complétez l’image naturellement, en continuité avec le reste.');
      const c = cloneCanvas(elemOf(s.o)); const x = c.getContext('2d');
      const piece = makeCanvas(s.w, s.h); const px = piece.getContext('2d'); px.drawImage(res, 0, 0, s.w, s.h);
      px.globalCompositeOperation = 'destination-in'; px.drawImage(maskCanvas(blurMask(s.mask, s.w, s.h, 3), s.w, s.h), 0, 0);
      x.drawImage(piece, 0, 0);
      const o = s.o; this.clearSel(); this.commit(o, c);
      toast('Zone générée par l’IA.');
    } catch (e) { toast(e.message || String(e), { kind: 'bad' }); } finally { t.close(); }
  }
  // Envoie l'image et le masque (zones transparentes = à modifier) au fournisseur d'IA.
  async aiEdit(o, mask, text) {
    const [w, h] = elemSize(o); const r = w / h;
    const [tw, th] = r > 1.25 ? [1536, 1024] : r < 0.8 ? [1024, 1536] : [1024, 1024];
    const im = makeCanvas(tw, th); im.getContext('2d').drawImage(elemOf(o), 0, 0, tw, th);
    const mk = makeCanvas(tw, th); const mx = mk.getContext('2d'); mx.fillStyle = '#000'; mx.fillRect(0, 0, tw, th);
    mx.globalCompositeOperation = 'destination-out'; mx.drawImage(maskCanvas(mask, w, h), 0, 0, tw, th);
    const url = await aiImage({ prompt: text, image: im.toDataURL('image/png'), mask: mk.toDataURL('image/png'), size: `${tw}x${th}` });
    return loadImage(url);
  }
  // Agrandir l'image (bords complétés selon le contenu ou par l'IA).
  expandSheet(o) {
    const s = sheet('nx-expand', sheetHtml({ icon: 'nxResize', title: 'Agrandir l’image', sub: 'Ajoutez de la place autour de l’image : les bords sont complétés selon le contenu, ou inventés par l’IA.', body: `
      <div class="field-label">Agrandissement</div><div class="seg wide" data-nx-seg="amt">${[['15', '+15 %'], ['30', '+30 %'], ['50', '+50 %'], ['100', '×2']].map(([v, l], i) => `<button class="${i === 1 ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>
      <div class="field-label">Côtés</div><div class="seg wide" data-nx-seg="side">${[['all', 'Tous'], ['h', 'Gauche et droite'], ['v', 'Haut et bas'], ['r', 'Droite'], ['b', 'Bas']].map(([v, l], i) => `<button class="${i === 0 ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>
      <label class="check-row" style="margin-top:10px"><input type="checkbox" data-nx-ai><span class="box"></span><span>Inventer les bords avec l’IA (sinon, prolongement selon le contenu)</span></label>`, go: 'Agrandir', goIcon: 'nxResize' }));
    const v = { amt: '30', side: 'all' };
    s.onclick = async (e) => {
      const b = e.target.closest('[data-nx-seg] [data-v]');
      if (b) { v[b.parentElement.dataset.nxSeg] = b.dataset.v; for (const x of b.parentElement.children) x.classList.toggle('on', x === b); return; }
      if (e.target.closest('[data-nx-go]')) { const ai = s.querySelector('[data-nx-ai]').checked; closeSheet('nx-expand'); await this.expand(o, Number(v.amt) / 100, v.side, ai); }
    };
  }
  async expand(o, amt, side, useAi) {
    const [w, h] = elemSize(o);
    const ax = ['all', 'h'].includes(side) ? Math.round(w * amt / 2) : 0; const ay = ['all', 'v'].includes(side) ? Math.round(h * amt / 2) : 0;
    const L = ax; const T = ay; const R = side === 'r' ? Math.round(w * amt) : ax; const B = side === 'b' ? Math.round(h * amt) : ay;
    const W = w + L + R; const H = h + T + B;
    const c = makeCanvas(W, H); const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(elemOf(o), L, T);
    const mask = new Uint8Array(W * H);
    for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) if (xx < L || yy < T || xx >= L + w || yy >= T + h) mask[yy * W + xx] = 255;
    const t = busy(useAi ? 'L’IA complète les bords…' : 'Prolongement des bords…');
    try {
      if (useAi && await needAi()) {
        const fake = { _originalElement: c, getElement: () => c, width: W, height: H };
        const res = await this.aiEdit(fake, mask, 'Prolongez l’image dans les zones transparentes, en continuité parfaite avec le contenu existant.');
        const piece = makeCanvas(W, H); const px = piece.getContext('2d'); px.drawImage(res, 0, 0, W, H);
        px.globalCompositeOperation = 'destination-in'; px.drawImage(maskCanvas(blurMask(mask, W, H, 4), W, H), 0, 0);
        x.drawImage(piece, 0, 0);
      } else {
        x.putImageData(inpaint(x.getImageData(0, 0, W, H), mask), 0, 0);
      }
      const center = this.toScene(o, W / 2 - L, H / 2 - T);
      if (!o.nxOrig) { try { o.nxOrig = o.getSrc(); } catch { /* */ } }
      o.setElement(c); o.set({ cropX: 0, cropY: 0, width: W, height: H });
      o.setPositionByOrigin(center, 'center', 'center');
      this.D.applyFx(o); o.setCoords(); this.D.canvas.requestRenderAll(); this.D.changed();
      toast(`Image agrandie : ${W} × ${H} px.`);
    } catch (e) { toast(e.message || String(e), { kind: 'bad' }); } finally { t.close(); }
  }
  // ---------- Recadrage ----------
  startCrop(o) {
    const D = this.D;
    const r = new Rect({ width: o.getScaledWidth(), height: o.getScaledHeight(), angle: o.angle || 0, fill: 'rgba(0,0,0,0)', stroke: '#ffffff', strokeWidth: 2, strokeDashArray: [6, 4], strokeUniform: true, cornerColor: '#ffffff', cornerStrokeColor: '#6a4cff', transparentCorners: false, lockRotation: true, hasRotatingPoint: false });
    r.setPositionByOrigin(o.getCenterPoint(), 'center', 'center');
    r.setControlVisible && r.setControlVisible('mtr', false);
    r.id = '__nxcrop'; r.excludeFromExport = true;
    this.crop = { o, r };
    o.selectable = false; o.evented = false;
    D.loading = true; D.canvas.add(r); D.loading = false; D.canvas.setActiveObject(r);
    D.$.hint.hidden = false; D.$.hint.innerHTML = '<span>Recadrage : ajustez le cadre blanc · Entrée pour valider · Échap pour annuler</span>';
    D.canvas.requestRenderAll();
  }
  finishCrop(ok) {
    const c = this.crop; if (!c) return;
    this.crop = null;
    const D = this.D; const { o, r } = c;
    if (ok) {
      r.setCoords();
      const m = invert(o.calcTransformMatrix());
      const pts = (r.getCoords ? r.getCoords() : Object.values(r.aCoords)).map((p) => apply(m, p.x, p.y));
      const hw = o.width / 2; const hh = o.height / 2;
      const lx0 = clamp(Math.min(...pts.map((p) => p.x)), -hw, hw); const lx1 = clamp(Math.max(...pts.map((p) => p.x)), -hw, hw);
      const ly0 = clamp(Math.min(...pts.map((p) => p.y)), -hh, hh); const ly1 = clamp(Math.max(...pts.map((p) => p.y)), -hh, hh);
      if (lx1 - lx0 > 2 && ly1 - ly0 > 2) {
        const center = apply(o.calcTransformMatrix(), (lx0 + lx1) / 2, (ly0 + ly1) / 2);
        o.set({ cropX: (o.cropX || 0) + lx0 + hw, cropY: (o.cropY || 0) + ly0 + hh, width: lx1 - lx0, height: ly1 - ly0 });
        o.setPositionByOrigin(center, 'center', 'center'); o.setCoords();
      }
    }
    D.loading = true; D.canvas.remove(r); D.loading = false;
    o.selectable = true; o.evented = true; D.canvas.setActiveObject(o);
    D.$.hint.hidden = true; this.tool = null;
    D.setTool('select');
    D.canvas.requestRenderAll(); if (ok) D.changed();
  }
  resetCrop(o) {
    const [w, h] = elemSize(o); const c = o.getCenterPoint();
    o.set({ cropX: 0, cropY: 0, width: w, height: h }); o.setPositionByOrigin(c, 'center', 'center'); o.setCoords();
    this.D.canvas.requestRenderAll(); this.D.changed();
  }
  // ---------- Pixelliser un calque (pour le retoucher comme une image) ----------
  async rasterize(o) {
    const k = 2;
    const el = o.toCanvasElement({ multiplier: k, enableRetinaScaling: false });
    const br = o.getBoundingRect();
    const img = new FabricImage(el, { scaleX: br.width / el.width, scaleY: br.height / el.height, left: br.left, top: br.top });
    img.name = `${o.name || this.D.typeName(o)} (pixels)`;
    return replaceObj(this.D, o, img, { keepName: false });
  }
  // ---------- Affichage ----------
  draw(ctx) {
    const c = this.D.canvas; const v = c.viewportTransform; const R = c.getRetinaScaling();
    const s = this.sel;
    if (s && c.getObjects().includes(s.o)) {
      const m = s.o.calcTransformMatrix();
      ctx.save(); ctx.setTransform(R, 0, 0, R, 0, 0); ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5]); ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
      ctx.drawImage(s.overlay, -s.o.width / 2 - (s.o.cropX || 0), -s.o.height / 2 - (s.o.cropY || 0));
      ctx.restore();
      ctx.save(); ctx.setTransform(R, 0, 0, R, 0, 0); ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
      const S = (x, y) => { const p = this.toScene(s.o, x, y); return [p.x * v[0] + v[4], p.y * v[3] + v[5]]; };
      for (const pass of [['#ffffff', 0], ['#0a84ff', 4.5]]) {
        ctx.strokeStyle = pass[0]; ctx.lineDashOffset = pass[1] + (performance.now() / 60) % 9;
        for (const pts of s.contours || []) { ctx.beginPath(); pts.forEach(([x, y], i) => { const [a, b] = S(x, y); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.closePath(); ctx.stroke(); }
      }
      ctx.restore();
    }
    const st = this.stroke;
    if (st && this.tool === 'lasso' && st.pts.length > 1) {
      ctx.save(); ctx.setTransform(R, 0, 0, R, 0, 0); ctx.strokeStyle = '#0a84ff'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.beginPath();
      st.pts.forEach((p, i) => { const a = p.x * v[0] + v[4]; const b = p.y * v[3] + v[5]; i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.stroke(); ctx.restore();
    }
    if (this.crop) {
      const { o, r } = this.crop; const pts = r.getCoords ? r.getCoords() : Object.values(r.aCoords);
      const ib = o.getCoords ? o.getCoords() : Object.values(o.aCoords);
      ctx.save(); ctx.setTransform(R, 0, 0, R, 0, 0); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath();
      ib.forEach((p, i) => { const a = p.x * v[0] + v[4]; const b = p.y * v[3] + v[5]; i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.closePath();
      [...pts].reverse().forEach((p, i) => { const a = p.x * v[0] + v[4]; const b = p.y * v[3] + v[5]; i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.closePath();
      ctx.fill('evenodd'); ctx.restore();
    }
  }
}
let opt0 = { shift: false };
document.addEventListener('pointerdown', (e) => { opt0 = { shift: e.shiftKey }; }, true);
const hexToRgbStr = (hex) => { let h = String(hex || '#fff').replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); const n = parseInt(h, 16) || 0; return `${n >> 16 & 255},${n >> 8 & 255},${n & 255}`; };
export { esc, saveSettings };
