// NEXORA #011 : effets de calque, masque peint, réglages non destructifs et motifs de NEX-DESIGN.
import { FabricObject, FabricImage, filters, Pattern, Gradient } from './fab.js';
import { makeCanvas, hexRgb, clamp, loadImage } from '../core.js';
import { makePattern } from '../library.js';

// ---------- Effets de calque ----------
export const FX = {
  outerGlow: { label: 'Lueur externe', def: { color: '#ffd400', size: 24, opacity: 0.85 } },
  innerGlow: { label: 'Lueur interne', def: { color: '#ffffff', size: 18, opacity: 0.8 } },
  innerShadow: { label: 'Ombre intérieure', def: { color: '#000000', size: 14, x: 6, y: 6, opacity: 0.5 } },
  stroke: { label: 'Contour extérieur', def: { color: '#ffffff', size: 6, opacity: 1 } },
  bevel: { label: 'Biseau', def: { size: 8, depth: 0.7 } },
  colorOverlay: { label: 'Incrustation de couleur', def: { color: '#ff2d78', opacity: 0.6 } },
  gradientOverlay: { label: 'Incrustation de dégradé', def: { color: '#6a4cff', color2: '#ff2d78', angle: 90, opacity: 0.85 } },
  echo: { label: 'Écho', def: { color: '#ff2d78', count: 4, x: 8, y: 8, opacity: 0.8 } },
  hardShadow: { label: 'Ombre décalée', def: { color: '#14151a', x: 10, y: 10, opacity: 1 } }
};
export const fxActive = (o) => !!((o.nxFx && Object.values(o.nxFx).some((v) => v && v.on)) || o.nxMask);

const maskCache = new WeakMap();
export function maskCanvasOf(o) {
  if (!o.nxMask) return null;
  let c = maskCache.get(o);
  if (c && c.nxSrc === o.nxMask) return c.ready ? c : null;
  c = makeCanvas(1, 1); c.nxSrc = o.nxMask; c.ready = false; maskCache.set(o, c);
  loadImage(o.nxMask).then((img) => { c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0); c.ready = true; o.dirty = true; o.canvas && o.canvas.requestRenderAll(); }).catch(() => {});
  return null;
}
export function setMaskCanvas(o, c) { c.nxSrc = o.nxMask; c.ready = true; maskCache.set(o, c); }

const tint = (src, color, alpha = 1) => {
  const c = makeCanvas(src.width, src.height); const x = c.getContext('2d');
  x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.globalAlpha = alpha; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  return c;
};
// Dessine uniquement l'ombre portée d'un calque (l'objet reste hors du canevas).
const shadowOnly = (x, src, color, blur, dx, dy) => {
  const far = src.width + src.height + 200;
  x.save(); x.shadowColor = color; x.shadowBlur = blur; x.shadowOffsetX = far + dx; x.shadowOffsetY = dy;
  x.drawImage(src, -far, 0); x.restore();
};
const rgba = (hex, a) => { const [r, g, b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; };
function innerLayer(src, color, blur, dx, dy, alpha) {
  // Ombre projetée vers l'intérieur : on remplit tout sauf la forme, puis on garde son ombre dans la forme.
  const W = src.width; const H = src.height;
  const hole = makeCanvas(W, H); const hx = hole.getContext('2d');
  hx.fillStyle = '#000'; hx.fillRect(0, 0, W, H); hx.globalCompositeOperation = 'destination-out'; hx.drawImage(src, 0, 0);
  const out = makeCanvas(W, H); const ox = out.getContext('2d');
  shadowOnly(ox, hole, rgba(color, alpha), blur, dx, dy);
  ox.globalCompositeOperation = 'destination-in'; ox.drawImage(src, 0, 0);
  return out;
}

// Rendu d'un calque avec ses effets : dessin hors écran dans l'espace de l'écran, puis composition.
function renderFx(o, ctx, orig) {
  const M = ctx.getTransform();
  const k = Math.hypot(M.a, M.b) || 1;
  const fx = o.nxFx || {};
  let pad = 4;
  for (const [id, v] of Object.entries(fx)) {
    if (!v || !v.on) continue;
    if (id === 'outerGlow') pad = Math.max(pad, v.size * 2.2);
    if (id === 'stroke') pad = Math.max(pad, v.size + 4);
    if (id === 'echo') pad = Math.max(pad, (Math.abs(v.x) + Math.abs(v.y)) * v.count + 4);
    if (id === 'hardShadow') pad = Math.max(pad, Math.abs(v.x) + Math.abs(v.y) + 4);
  }
  if (o.shadow) pad = Math.max(pad, (o.shadow.blur || 0) * 2 + Math.abs(o.shadow.offsetX || 0) + Math.abs(o.shadow.offsetY || 0));
  const br = o.getBoundingRect();
  const pts = [[br.left, br.top], [br.left + br.width, br.top], [br.left, br.top + br.height], [br.left + br.width, br.top + br.height]].map(([x, y]) => [M.a * x + M.c * y + M.e, M.b * x + M.d * y + M.f]);
  // Rectangle de travail en pixels de l'écran, borné au canevas.
  const cw = ctx.canvas.width; const ch = ctx.canvas.height;
  const P = pad * k;
  let x0 = Math.floor(Math.min(...pts.map((p) => p[0])) - P); let y0 = Math.floor(Math.min(...pts.map((p) => p[1])) - P);
  let x1 = Math.ceil(Math.max(...pts.map((p) => p[0])) + P); let y1 = Math.ceil(Math.max(...pts.map((p) => p[1])) + P);
  x0 = Math.max(x0, -P * 2); y0 = Math.max(y0, -P * 2); x1 = Math.min(x1, cw + P * 2); y1 = Math.min(y1, ch + P * 2);
  const W = x1 - x0; const H = y1 - y0;
  if (W < 1 || H < 1 || W * H > 36e6) return orig.call(o, ctx);
  const S = makeCanvas(W, H); const sx = S.getContext('2d');
  sx.setTransform(M.a, M.b, M.c, M.d, M.e - x0, M.f - y0);
  const keep = { opacity: o.opacity, gco: o.globalCompositeOperation };
  o.opacity = 1; o.globalCompositeOperation = 'source-over';
  try { orig.call(o, sx); } finally { o.opacity = keep.opacity; o.globalCompositeOperation = keep.gco; }
  // Masque peint : garde seulement les zones visibles.
  const mc = o.nxMask ? maskCanvasOf(o) : null;
  if (mc) {
    const m = o.calcTransformMatrix();
    sx.save();
    sx.setTransform(M.a, M.b, M.c, M.d, M.e - x0, M.f - y0);
    sx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    const isImg = o.type === 'image';
    const lw = isImg ? (o._element ? (o._element.naturalWidth || o._element.width) : o.width) : o.width;
    const lh = isImg ? (o._element ? (o._element.naturalHeight || o._element.height) : o.height) : o.height;
    const ox = isImg ? -o.width / 2 - (o.cropX || 0) : -o.width / 2;
    const oy = isImg ? -o.height / 2 - (o.cropY || 0) : -o.height / 2;
    sx.globalCompositeOperation = 'destination-in';
    sx.drawImage(mc, ox, oy, lw, lh);
    sx.restore();
  }
  const F = makeCanvas(W, H); const fxx = F.getContext('2d');
  const sc = (v) => v * k;
  const on = (id) => fx[id] && fx[id].on ? fx[id] : null;
  let e;
  if ((e = on('outerGlow'))) { for (let i = 0; i < 2; i++) shadowOnly(fxx, S, rgba(e.color, e.opacity), sc(e.size), 0, 0); }
  if ((e = on('hardShadow'))) { fxx.globalAlpha = e.opacity; fxx.drawImage(tint(S, e.color), sc(e.x), sc(e.y)); fxx.globalAlpha = 1; }
  if ((e = on('echo'))) {
    const t = tint(S, e.color);
    for (let i = e.count; i >= 1; i--) { fxx.globalAlpha = e.opacity * (1 - (i - 1) / (e.count + 1)); fxx.drawImage(t, sc(e.x) * i, sc(e.y) * i); }
    fxx.globalAlpha = 1;
  }
  if ((e = on('stroke'))) {
    const t = tint(S, e.color); const r = sc(e.size); const n = Math.max(12, Math.min(36, Math.round(r * 2)));
    fxx.globalAlpha = e.opacity;
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; fxx.drawImage(t, Math.cos(a) * r, Math.sin(a) * r); }
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; fxx.drawImage(t, Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5); }
    fxx.globalAlpha = 1;
  }
  // Calque lui-même, puis les effets qui se posent dessus.
  let body = S;
  if ((e = on('colorOverlay'))) { const c = makeCanvas(W, H); const x = c.getContext('2d'); x.drawImage(body, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = rgba(e.color, e.opacity); x.fillRect(0, 0, W, H); body = c; }
  if ((e = on('gradientOverlay'))) {
    const c = makeCanvas(W, H); const x = c.getContext('2d'); x.drawImage(body, 0, 0); x.globalCompositeOperation = 'source-atop';
    const a = (e.angle || 0) * Math.PI / 180; const cx = W / 2; const cy = H / 2; const L = Math.abs(W * Math.cos(a)) / 2 + Math.abs(H * Math.sin(a)) / 2;
    const g = x.createLinearGradient(cx - Math.cos(a) * L, cy - Math.sin(a) * L, cx + Math.cos(a) * L, cy + Math.sin(a) * L);
    g.addColorStop(0, e.color); g.addColorStop(1, e.color2 || e.color);
    x.globalAlpha = e.opacity; x.fillStyle = g; x.fillRect(0, 0, W, H); body = c;
  }
  fxx.drawImage(body, 0, 0);
  if ((e = on('innerShadow'))) fxx.drawImage(innerLayer(S, e.color, sc(e.size), sc(e.x), sc(e.y), e.opacity), 0, 0);
  if ((e = on('innerGlow'))) { const l = innerLayer(S, e.color, sc(e.size), 0, 0, e.opacity); fxx.drawImage(l, 0, 0); fxx.drawImage(l, 0, 0); }
  if ((e = on('bevel'))) {
    fxx.drawImage(innerLayer(S, '#ffffff', sc(e.size), -sc(e.size) * 0.6, -sc(e.size) * 0.6, 0.75 * e.depth), 0, 0);
    fxx.drawImage(innerLayer(S, '#000000', sc(e.size), sc(e.size) * 0.6, sc(e.size) * 0.6, 0.55 * e.depth), 0, 0);
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha *= o.opacity;
  if (o.globalCompositeOperation) ctx.globalCompositeOperation = o.globalCompositeOperation;
  ctx.drawImage(F, x0, y0);
  ctx.restore();
}

let installed = false;
export function installFx() {
  if (installed) return;
  installed = true;
  const proto = FabricObject.prototype;
  const orig = proto.render;
  proto.render = function (ctx) {
    if (!this.nxFx && !this.nxMask) return orig.call(this, ctx);
    if (!fxActive(this) || (this.isNotVisible && this.isNotVisible())) return orig.call(this, ctx);
    this.objectCaching = false;
    try { renderFx(this, ctx, orig); } catch (e) { console.warn('[effets]', e); orig.call(this, ctx); }
  };
  // Les réglages non destructifs ne sont pas enregistrés dans « filters » : ils sont recalculés depuis nxAdj.
  const toObj = FabricImage.prototype.toObject;
  FabricImage.prototype.toObject = function (props) {
    const o = toObj.call(this, props);
    if (Array.isArray(o.filters)) o.filters = o.filters.filter((f) => f && !String(f.type || '').startsWith('Nx'));
    return o;
  };
  // Motif : recréé depuis nxPattern (les tuiles générées ne sont pas des fichiers).
  const toObj2 = proto.toObject;
  proto.toObject = function (props) {
    const o = toObj2.call(this, props);
    if (this.nxPattern && o.fill && typeof o.fill === 'object' && o.fill.type === 'pattern') o.fill = this.nxPattern.bg || '#ffffff';
    return o;
  };
}

export function setFx(o, id, values) {
  o.nxFx = { ...(o.nxFx || {}) };
  o.nxFx[id] = { ...FX[id].def, ...(o.nxFx[id] || {}), ...values };
  o.objectCaching = !fxActive(o);
  o.dirty = true;
}

// ---------- Réglages non destructifs (filtres WebGL et 2D) ----------
const BaseFilter = filters.BaseFilter;
const VERT_HEAD = 'precision highp float;\nuniform sampler2D uTexture;\nvarying vec2 vTexCoord;\n';
const lum = 'float lum(vec3 c){return dot(c,vec3(0.2126,0.7152,0.0722));}\n';
const knots = (fn) => Array.from({ length: 17 }, (_, i) => clamp(fn(i / 16), 0, 1));
// Courbe monotone (Fritsch-Carlson) à travers des points de contrôle.
export function curveFn(points) {
  const p = [...points].sort((a, b) => a[0] - b[0]);
  const n = p.length; const d = []; const m = [];
  for (let i = 0; i < n - 1; i++) d[i] = (p[i + 1][1] - p[i][1]) / Math.max(1e-6, p[i + 1][0] - p[i][0]);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  return (x) => {
    if (x <= p[0][0]) return p[0][1];
    if (x >= p[n - 1][0]) return p[n - 1][1];
    let i = 0; while (i < n - 2 && x > p[i + 1][0]) i++;
    const h = p[i + 1][0] - p[i][0]; const t = (x - p[i][0]) / h;
    const t2 = t * t; const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * p[i][1] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * p[i + 1][1] + (t3 - t2) * h * m[i + 1];
  };
}
const LUT_GLSL = `float lut(float x, float k[17]){ float f = clamp(x,0.0,1.0)*16.0; float r = k[16];
  for(int i=0;i<16;i++){ if(f>=float(i) && f<=float(i+1)){ r = mix(k[i], k[i+1], f-float(i)); } } return r; }\n`;

class NxLevels extends BaseFilter {
  getFragmentSource() {
    return `${VERT_HEAD}uniform vec3 uIn; uniform vec2 uOut;
void main(){ vec4 c = texture2D(uTexture, vTexCoord); vec3 v = clamp((c.rgb - vec3(uIn.x)) / max(uIn.y - uIn.x, 0.0001), 0.0, 1.0);
 v = pow(v, vec3(1.0 / max(uIn.z, 0.01))); c.rgb = mix(vec3(uOut.x), vec3(uOut.y), v); gl_FragColor = c; }`;
  }
  applyTo2d({ imageData: { data } }) {
    const [ib, iw, g] = [this.inBlack, this.inWhite, this.gamma]; const [ob, ow] = [this.outBlack, this.outWhite];
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) { let v = clamp((i / 255 - ib) / Math.max(1e-4, iw - ib), 0, 1); v = v ** (1 / Math.max(0.01, g)); lut[i] = (ob + (ow - ob) * v) * 255; }
    for (let i = 0; i < data.length; i += 4) { data[i] = lut[data[i]]; data[i + 1] = lut[data[i + 1]]; data[i + 2] = lut[data[i + 2]]; }
  }
  sendUniformData(gl, u) { gl.uniform3f(u.uIn, this.inBlack, this.inWhite, this.gamma); gl.uniform2f(u.uOut, this.outBlack, this.outWhite); }
  isNeutralState() { return false; }
}
NxLevels.type = 'NxLevels'; NxLevels.defaults = { inBlack: 0, inWhite: 1, gamma: 1, outBlack: 0, outWhite: 1 }; NxLevels.uniformLocations = ['uIn', 'uOut'];

class NxCurves extends BaseFilter {
  getFragmentSource() {
    return `${VERT_HEAD}uniform float uR[17]; uniform float uG[17]; uniform float uB[17];
${LUT_GLSL}void main(){ vec4 c = texture2D(uTexture, vTexCoord); c.r = lut(c.r, uR); c.g = lut(c.g, uG); c.b = lut(c.b, uB); gl_FragColor = c; }`;
  }
  get luts() { return ['r', 'g', 'b'].map((ch) => this[ch] || knots((x) => x)); }
  applyTo2d({ imageData: { data } }) {
    const L = this.luts.map((k) => { const t = new Uint8ClampedArray(256); for (let i = 0; i < 256; i++) { const f = (i / 255) * 16; const a = Math.min(15, Math.floor(f)); t[i] = (k[a] + (k[a + 1] - k[a]) * (f - a)) * 255; } return t; });
    for (let i = 0; i < data.length; i += 4) { data[i] = L[0][data[i]]; data[i + 1] = L[1][data[i + 1]]; data[i + 2] = L[2][data[i + 2]]; }
  }
  sendUniformData(gl, u) { const [r, g, b] = this.luts; gl.uniform1fv(u.uR, r); gl.uniform1fv(u.uG, g); gl.uniform1fv(u.uB, b); }
  isNeutralState() { return false; }
}
NxCurves.type = 'NxCurves'; NxCurves.defaults = { r: null, g: null, b: null }; NxCurves.uniformLocations = ['uR', 'uG', 'uB'];

class NxBalance extends BaseFilter {
  getFragmentSource() {
    return `${VERT_HEAD}uniform vec3 uS; uniform vec3 uM; uniform vec3 uH;
${lum}void main(){ vec4 c = texture2D(uTexture, vTexCoord); float l = lum(c.rgb);
 float ws = clamp(1.0 - l * 2.0, 0.0, 1.0); float wh = clamp(l * 2.0 - 1.0, 0.0, 1.0); float wm = 1.0 - ws - wh;
 c.rgb = clamp(c.rgb + (uS * ws + uM * wm + uH * wh) * 0.35, 0.0, 1.0); gl_FragColor = c; }`;
  }
  applyTo2d({ imageData: { data } }) {
    const S = this.shadows; const Mm = this.mids; const H = this.highs;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255; const g = data[i + 1] / 255; const b = data[i + 2] / 255; const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const ws = clamp(1 - l * 2, 0, 1); const wh = clamp(l * 2 - 1, 0, 1); const wm = 1 - ws - wh;
      for (let c = 0; c < 3; c++) data[i + c] = clamp(([r, g, b][c] + (S[c] * ws + Mm[c] * wm + H[c] * wh) * 0.35) * 255, 0, 255);
    }
  }
  sendUniformData(gl, u) { gl.uniform3fv(u.uS, this.shadows); gl.uniform3fv(u.uM, this.mids); gl.uniform3fv(u.uH, this.highs); }
  isNeutralState() { return false; }
}
NxBalance.type = 'NxBalance'; NxBalance.defaults = { shadows: [0, 0, 0], mids: [0, 0, 0], highs: [0, 0, 0] }; NxBalance.uniformLocations = ['uS', 'uM', 'uH'];

const HSL_GLSL = `vec3 rgb2hsl(vec3 c){ float mx=max(c.r,max(c.g,c.b)), mn=min(c.r,min(c.g,c.b)); float l=(mx+mn)/2.0; float h=0.0, s=0.0;
 if(mx>mn){ float d=mx-mn; s = l>0.5 ? d/(2.0-mx-mn) : d/(mx+mn);
  if(mx==c.r) h=(c.g-c.b)/d+(c.g<c.b?6.0:0.0); else if(mx==c.g) h=(c.b-c.r)/d+2.0; else h=(c.r-c.g)/d+4.0; h/=6.0; } return vec3(h,s,l); }
float h2r(float p,float q,float t){ if(t<0.0)t+=1.0; if(t>1.0)t-=1.0; if(t<1.0/6.0)return p+(q-p)*6.0*t; if(t<0.5)return q; if(t<2.0/3.0)return p+(q-p)*(2.0/3.0-t)*6.0; return p; }
vec3 hsl2rgb(vec3 c){ if(c.y<=0.0) return vec3(c.z); float q = c.z<0.5 ? c.z*(1.0+c.y) : c.z+c.y-c.z*c.y; float p=2.0*c.z-q;
 return vec3(h2r(p,q,c.x+1.0/3.0), h2r(p,q,c.x), h2r(p,q,c.x-1.0/3.0)); }\n`;
class NxHueSat extends BaseFilter {
  getFragmentSource() {
    return `${VERT_HEAD}uniform vec4 uP; uniform float uR;
${HSL_GLSL}void main(){ vec4 c = texture2D(uTexture, vTexCoord); vec3 h = rgb2hsl(c.rgb);
 float w = 1.0; if(uR >= 0.0){ float d = abs(h.x - uR); d = min(d, 1.0 - d); w = (1.0 - smoothstep(0.06, 0.13, d)) * smoothstep(0.05, 0.2, h.y); }
 h.x = fract(h.x + uP.x * w); h.y = clamp(h.y * (1.0 + uP.y * w), 0.0, 1.0); h.z = clamp(h.z + uP.z * 0.5 * w, 0.0, 1.0);
 c.rgb = hsl2rgb(h); gl_FragColor = c; }`;
  }
  applyTo2d({ imageData: { data } }) {
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255; const g = data[i + 1] / 255; const b = data[i + 2] / 255;
      const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); let h = 0; let s = 0; const l = (mx + mn) / 2;
      if (mx > mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = (mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6; }
      let w = 1;
      if (this.range >= 0) { let d = Math.abs(h - this.range); d = Math.min(d, 1 - d); w = (1 - clamp((d - 0.06) / 0.07, 0, 1)) * clamp((s - 0.05) / 0.15, 0, 1); }
      const H = (h + this.hue * w + 1) % 1; const S2 = clamp(s * (1 + this.sat * w), 0, 1); const L2 = clamp(l + this.light * 0.5 * w, 0, 1);
      const q = L2 < 0.5 ? L2 * (1 + S2) : L2 + S2 - L2 * S2; const p = 2 * L2 - q;
      const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
      if (S2 <= 0) { data[i] = data[i + 1] = data[i + 2] = L2 * 255; } else { data[i] = f(H + 1 / 3) * 255; data[i + 1] = f(H) * 255; data[i + 2] = f(H - 1 / 3) * 255; }
    }
  }
  sendUniformData(gl, u) { gl.uniform4f(u.uP, this.hue, this.sat, this.light, 0); gl.uniform1f(u.uR, this.range); }
  isNeutralState() { return false; }
}
NxHueSat.type = 'NxHueSat'; NxHueSat.defaults = { hue: 0, sat: 0, light: 0, range: -1 }; NxHueSat.uniformLocations = ['uP', 'uR'];

class NxGradMap extends BaseFilter {
  getFragmentSource() {
    return `${VERT_HEAD}uniform vec3 uA; uniform vec3 uB; uniform float uAmt;
${lum}void main(){ vec4 c = texture2D(uTexture, vTexCoord); vec3 m = mix(uA, uB, lum(c.rgb)); c.rgb = mix(c.rgb, m, uAmt); gl_FragColor = c; }`;
  }
  applyTo2d({ imageData: { data } }) {
    const a = hexRgb(this.a); const b = hexRgb(this.b);
    for (let i = 0; i < data.length; i += 4) { const l = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255; for (let c = 0; c < 3; c++) data[i + c] = data[i + c] + ((a[c] + (b[c] - a[c]) * l) - data[i + c]) * this.amount; }
  }
  sendUniformData(gl, u) { const a = hexRgb(this.a).map((v) => v / 255); const b = hexRgb(this.b).map((v) => v / 255); gl.uniform3fv(u.uA, a); gl.uniform3fv(u.uB, b); gl.uniform1f(u.uAmt, this.amount); }
  isNeutralState() { return false; }
}
NxGradMap.type = 'NxGradMap'; NxGradMap.defaults = { a: '#1b1340', b: '#ffd27a', amount: 1 }; NxGradMap.uniformLocations = ['uA', 'uB', 'uAmt'];

export const ADJ = {
  levels: { label: 'Niveaux', def: { inBlack: 0, inWhite: 1, gamma: 1, outBlack: 0, outWhite: 1 } },
  curves: { label: 'Courbes', def: { preset: 'douce', shadows: 0.25, mids: 0.5, highs: 0.75, channel: 'rgb' } },
  balance: { label: 'Balance des couleurs', def: { range: 'mids', cr: 0, mg: 0, yb: 0, s: [0, 0, 0], m: [0, 0, 0], h: [0, 0, 0] } },
  huesat: { label: 'Teinte et saturation', def: { range: 'all', hue: 0, sat: 0, light: 0 } },
  gradmap: { label: 'Mappage de dégradé', def: { a: '#1b1340', b: '#ffd27a', amount: 0.8 } }
};
export const CURVE_PRESETS = {
  douce: ['Contraste doux', [[0, 0], [0.25, 0.2], [0.5, 0.5], [0.75, 0.8], [1, 1]]],
  forte: ['Contraste fort', [[0, 0], [0.25, 0.13], [0.5, 0.5], [0.75, 0.88], [1, 1]]],
  claire: ['Éclaircir', [[0, 0], [0.25, 0.35], [0.5, 0.64], [0.75, 0.86], [1, 1]]],
  sombre: ['Assombrir', [[0, 0], [0.25, 0.15], [0.5, 0.38], [0.75, 0.66], [1, 1]]],
  fondu: ['Fondu (noirs relevés)', [[0, 0.12], [0.25, 0.3], [0.5, 0.54], [0.75, 0.78], [1, 0.95]]],
  libre: ['Personnalisée', null]
};
export const HUE_RANGES = { all: ['Toutes', -1], red: ['Rouges', 0], yellow: ['Jaunes', 1 / 6], green: ['Verts', 2 / 6], cyan: ['Cyans', 3 / 6], blue: ['Bleus', 4 / 6], magenta: ['Magentas', 5 / 6] };

function adjFilter(a) {
  const p = a.params;
  if (a.type === 'levels') return new NxLevels({ ...p });
  if (a.type === 'curves') {
    const pts = p.preset && p.preset !== 'libre' && CURVE_PRESETS[p.preset] ? CURVE_PRESETS[p.preset][1] : [[0, 0], [0.25, p.shadows], [0.5, p.mids], [0.75, p.highs], [1, 1]];
    const k = knots(curveFn(pts)); const id = knots((x) => x);
    const ch = p.channel || 'rgb';
    return new NxCurves({ r: ch === 'rgb' || ch === 'r' ? k : id, g: ch === 'rgb' || ch === 'g' ? k : id, b: ch === 'rgb' || ch === 'b' ? k : id });
  }
  if (a.type === 'balance') return new NxBalance({ shadows: p.s || [0, 0, 0], mids: p.m || [0, 0, 0], highs: p.h || [0, 0, 0] });
  if (a.type === 'huesat') return new NxHueSat({ hue: p.hue, sat: p.sat, light: p.light, range: (HUE_RANGES[p.range] || HUE_RANGES.all)[1] });
  if (a.type === 'gradmap') return new NxGradMap({ a: p.a, b: p.b, amount: p.amount });
  return null;
}
export const adjFilters = (o) => (Array.isArray(o.nxAdj) ? o.nxAdj.filter((a) => a.on !== false).map(adjFilter).filter(Boolean) : []);

// Les filtres de NEX-DESIGN puis les réglages de NEXORA #011, dans l'ordre de la pile.
export function patchApplyFx(D) {
  const proto = Object.getPrototypeOf(D);
  if (proto.nxApplyFx) return;
  proto.nxApplyFx = proto.applyFx;
  proto.applyFx = function (o) {
    this.nxApplyFx(o);
    const extra = adjFilters(o);
    if (extra.length) { o.filters = [...(o.filters || []).filter((f) => !String(f.constructor.type || '').startsWith('Nx')), ...extra]; o.applyFilters(); o.dirty = true; }
  };
}
export function refreshAdj(D, o) {
  if (o.type !== 'image') return;
  D.applyFx(o);
  if (!adjFilters(o).length && !(o.fx && Object.keys(o.fx).length)) { o.filters = (o.filters || []).filter((f) => !String(f.constructor.type || '').startsWith('Nx')); o.applyFilters(); }
  o.dirty = true;
  D.canvas.requestRenderAll();
}

// ---------- Motifs ----------
export function applyPattern(o, spec) {
  if (!spec) { o.nxPattern = null; o.set('fill', o.nxPatternPrev || '#6a4cff'); return; }
  if (!o.nxPattern && typeof o.fill === 'string') o.nxPatternPrev = o.fill;
  o.nxPattern = { ...spec };
  const tile = makePattern(spec.kind, spec);
  o.set('fill', new Pattern({ source: tile, repeat: 'repeat' }));
  o.dirty = true;
}
export function restorePatterns(canvas) {
  const walk = (list) => { for (const o of list) { if (o.nxPattern) applyPattern(o, o.nxPattern); if (o.type === 'group' && o.getObjects) walk(o.getObjects()); } };
  walk(canvas.getObjects());
}
void Gradient;
