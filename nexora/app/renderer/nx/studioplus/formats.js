// NEXORA #055 : Studio 3D & Motion, fonctions sans navigateur (essayées par pnpm test:studio) : lecture des
// modèles OBJ, STL, PLY et SPLAT, écriture USDZ (réalité augmentée sur iPhone), animation Lottie à images,
// détection des flashs (accessibilité), bruitages synthétisés et contrôle des réponses de l'IA.

const td = new TextDecoder();

// ---------- OBJ (texte) ----------
export function parseObj(text) {
  const v = []; const vn = []; const vc = []; const out = { positions: [], normals: [], colors: [] };
  let hasN = false; let hasC = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line[0] === '#') continue;
    const p = line.split(/\s+/);
    if (p[0] === 'v') { v.push([+p[1], +p[2], +p[3]]); if (p.length >= 7) { vc.push([+p[4], +p[5], +p[6]]); hasC = true; } else vc.push(null); }
    else if (p[0] === 'vn') vn.push([+p[1], +p[2], +p[3]]);
    else if (p[0] === 'f') {
      const idx = p.slice(1).map((s) => { const [a, , c] = s.split('/'); const ia = +a; const ic = c ? +c : 0; return [ia < 0 ? v.length + ia : ia - 1, ic ? (ic < 0 ? vn.length + ic : ic - 1) : -1]; });
      for (let i = 1; i < idx.length - 1; i++) for (const [vi, ni] of [idx[0], idx[i], idx[i + 1]]) {
        const pt = v[vi]; if (!pt) throw new Error('Fichier OBJ invalide (sommet absent).');
        out.positions.push(...pt);
        if (ni >= 0 && vn[ni]) { out.normals.push(...vn[ni]); hasN = true; } else out.normals.push(0, 0, 0);
        const c = vc[vi]; out.colors.push(...(c || [1, 1, 1]));
      }
    }
  }
  if (!out.positions.length) throw new Error('Aucune face dans ce fichier OBJ.');
  return { positions: new Float32Array(out.positions), normals: hasN ? new Float32Array(out.normals) : null, colors: hasC ? new Float32Array(out.colors) : null };
}

// ---------- STL (binaire ou texte) ----------
export function parseStl(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const n = u8.length >= 84 ? dv.getUint32(80, true) : 0;
  if (n && 84 + n * 50 === u8.length) {
    const pos = new Float32Array(n * 9); const nor = new Float32Array(n * 9);
    for (let i = 0; i < n; i++) {
      const o = 84 + i * 50;
      for (let k = 0; k < 3; k++) for (let j = 0; j < 3; j++) { pos[i * 9 + k * 3 + j] = dv.getFloat32(o + 12 + k * 12 + j * 4, true); nor[i * 9 + k * 3 + j] = dv.getFloat32(o + j * 4, true); }
    }
    return { positions: pos, normals: nor };
  }
  const text = td.decode(u8);
  if (!/^\s*solid/i.test(text)) throw new Error('Fichier STL illisible.');
  const pos = []; const nor = []; let cur = [0, 0, 0];
  for (const m of text.matchAll(/facet\s+normal\s+(\S+)\s+(\S+)\s+(\S+)|vertex\s+(\S+)\s+(\S+)\s+(\S+)/gi)) {
    if (m[1] !== undefined) cur = [+m[1], +m[2], +m[3]]; else { pos.push(+m[4], +m[5], +m[6]); nor.push(...cur); }
  }
  if (!pos.length) throw new Error('Aucune face dans ce fichier STL.');
  return { positions: new Float32Array(pos), normals: new Float32Array(nor) };
}

// ---------- PLY (texte ou binaire) : maillage, nuage de points ou capture 3D (gaussian splatting) ----------
const SH_C0 = 0.28209479177387814;
export function parsePly(u8) {
  const head = td.decode(u8.subarray(0, Math.min(u8.length, 65536)));
  const end = head.indexOf('end_header');
  if (!head.startsWith('ply') || end < 0) throw new Error('Fichier PLY illisible.');
  const lines = head.slice(0, end).split(/\r?\n/);
  const format = (lines.find((l) => l.startsWith('format')) || '').split(/\s+/)[1];
  const els = []; let cur = null;
  for (const l of lines) {
    const p = l.trim().split(/\s+/);
    if (p[0] === 'element') { cur = { name: p[1], count: +p[2], props: [] }; els.push(cur); }
    else if (p[0] === 'property' && cur) cur.props.push(p[1] === 'list' ? { list: true, ct: p[2], it: p[3], name: p[4] } : { type: p[1], name: p[2] });
  }
  let off = new TextEncoder().encode(head.slice(0, head.indexOf('\n', end) + 1)).length;
  const SZ = { char: 1, uchar: 1, int8: 1, uint8: 1, short: 2, ushort: 2, int16: 2, uint16: 2, int: 4, uint: 4, int32: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8 };
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); const le = format !== 'binary_big_endian';
  const rd = (t) => { let x; switch (t) { case 'char': case 'int8': x = dv.getInt8(off); break; case 'uchar': case 'uint8': x = dv.getUint8(off); break; case 'short': case 'int16': x = dv.getInt16(off, le); break; case 'ushort': case 'uint16': x = dv.getUint16(off, le); break; case 'int': case 'int32': x = dv.getInt32(off, le); break; case 'uint': case 'uint32': x = dv.getUint32(off, le); break; case 'float': case 'float32': x = dv.getFloat32(off, le); break; default: x = dv.getFloat64(off, le); } off += SZ[t] || 4; return x; };
  let words = null; let wi = 0;
  if (format === 'ascii') { words = td.decode(u8.subarray(off)).trim().split(/\s+/); }
  else if (format !== 'binary_little_endian' && format !== 'binary_big_endian') throw new Error('Format PLY inconnu.');
  const val = (t) => (words ? +words[wi++] : rd(t));
  const out = { positions: null, colors: null, normals: null, indices: null, splat: false };
  for (const el of els) {
    if (el.name === 'vertex') {
      const names = el.props.map((p) => p.name); const at = (n) => names.indexOf(n);
      const pos = new Float32Array(el.count * 3); const hasN = at('nx') >= 0; const nor = hasN ? new Float32Array(el.count * 3) : null;
      const hasRgb = at('red') >= 0; const hasSh = at('f_dc_0') >= 0; const col = hasRgb || hasSh ? new Float32Array(el.count * 3) : null;
      out.splat = hasSh;
      const row = new Array(el.props.length);
      for (let i = 0; i < el.count; i++) {
        for (let k = 0; k < el.props.length; k++) row[k] = val(el.props[k].type);
        pos[i * 3] = row[at('x')]; pos[i * 3 + 1] = row[at('y')]; pos[i * 3 + 2] = row[at('z')];
        if (hasN) { nor[i * 3] = row[at('nx')]; nor[i * 3 + 1] = row[at('ny')]; nor[i * 3 + 2] = row[at('nz')]; }
        if (hasRgb) { const s = el.props[at('red')].type.includes('float') ? 1 : 255; col[i * 3] = row[at('red')] / s; col[i * 3 + 1] = row[at('green')] / s; col[i * 3 + 2] = row[at('blue')] / s; }
        else if (hasSh) for (let c = 0; c < 3; c++) col[i * 3 + c] = Math.min(1, Math.max(0, 0.5 + SH_C0 * row[at(`f_dc_${c}`)]));
      }
      Object.assign(out, { positions: pos, normals: nor, colors: col });
    } else if (el.name === 'face') {
      const idx = [];
      for (let i = 0; i < el.count; i++) for (const p of el.props) {
        if (!p.list) { val(p.type); continue; }
        const n = val(p.ct); const f = []; for (let k = 0; k < n; k++) f.push(val(p.it));
        if (p.name === 'vertex_indices' || p.name === 'vertex_index') for (let k = 1; k < n - 1; k++) idx.push(f[0], f[k], f[k + 1]);
      }
      out.indices = idx.length ? new Uint32Array(idx) : null;
    } else for (let i = 0; i < el.count; i++) for (const p of el.props) { if (p.list) { const n = val(p.ct); for (let k = 0; k < n; k++) val(p.it); } else val(p.type); }
  }
  if (!out.positions || !out.positions.length) throw new Error('Aucun sommet dans ce fichier PLY.');
  return out;
}

// ---------- SPLAT (captures 3D : 32 octets par point) ----------
export function parseSplat(u8) {
  if (u8.length % 32 || !u8.length) throw new Error('Fichier SPLAT illisible.');
  const n = u8.length / 32; const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const pos = new Float32Array(n * 3); const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const o = i * 32; for (let k = 0; k < 3; k++) { pos[i * 3 + k] = dv.getFloat32(o + k * 4, true); col[i * 3 + k] = u8[o + 24 + k] / 255; } }
  return { positions: pos, colors: col, splat: true };
}

// Limite les nuages de points trop lourds pour l'aperçu (un point sur k).
export function thin(model, max = 400000) {
  const n = model.positions.length / 3; if (n <= max || model.indices) return model;
  const k = Math.ceil(n / max); const m = Math.floor(n / k);
  const take = (a) => { if (!a) return null; const o = new Float32Array(m * 3); for (let i = 0; i < m; i++) o.set(a.subarray(i * k * 3, i * k * 3 + 3), i * 3); return o; };
  return { ...model, positions: take(model.positions), colors: take(model.colors), normals: take(model.normals), thinned: k };
}

// ---------- ZIP sans compression (USDZ : données alignées sur 64 octets) ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function storeZip(files, align = 64) {
  const enc = new TextEncoder(); const parts = []; const central = []; let pos = 0;
  for (const f of files) {
    const name = enc.encode(f.name); const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data; const crc = crc32(data);
    const pad = (align - ((pos + 30 + name.length + 4) % align)) % align; // champ « extra » : 4 octets d'en-tête + bourrage
    const extra = new Uint8Array(4 + pad); new DataView(extra.buffer).setUint16(0, 0x1986, true); new DataView(extra.buffer).setUint16(2, pad, true);
    const h = new Uint8Array(30); const dv = new DataView(h.buffer);
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint32(14, crc, true); dv.setUint32(18, data.length, true); dv.setUint32(22, data.length, true); dv.setUint16(26, name.length, true); dv.setUint16(28, extra.length, true);
    central.push({ name, crc, size: data.length, off: pos });
    parts.push(h, name, extra, data); pos += 30 + name.length + extra.length + data.length;
  }
  const cstart = pos;
  for (const c of central) {
    const h = new Uint8Array(46); const dv = new DataView(h.buffer);
    dv.setUint32(0, 0x02014b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 20, true); dv.setUint32(16, c.crc, true); dv.setUint32(20, c.size, true); dv.setUint32(24, c.size, true); dv.setUint16(28, c.name.length, true); dv.setUint32(42, c.off, true);
    parts.push(h, c.name); pos += 46 + c.name.length;
  }
  const e = new Uint8Array(22); const ev = new DataView(e.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, central.length, true); ev.setUint16(10, central.length, true); ev.setUint32(12, pos - cstart, true); ev.setUint32(16, cstart, true);
  parts.push(e); pos += 22;
  const out = new Uint8Array(pos); let k = 0; for (const p of parts) { out.set(p, k); k += p.length; }
  return out;
}

// ---------- USDZ (réalité augmentée sur iPhone et iPad, Quick Look) ----------
// meshes : [{ name, points: Float32Array (mètres, Y vers le haut), normals?, uvs?, indices?, color: [r, g, b], opacity, roughness, metallic, texture?: 'textures/t0.png' }]
const fmt = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(`(${Array.from(a.subarray(i, i + n), (x) => Number(x.toFixed(5))).join(', ')})`); return o.join(', '); };
const safeId = (s, i) => `${String(s || 'Objet').replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1') || 'Objet'}_${i}`;
export function usda(meshes) {
  let body = '';
  meshes.forEach((m, i) => {
    const id = safeId(m.name, i); const n = m.points.length / 3;
    const idx = m.indices ? Array.from(m.indices) : Array.from({ length: n }, (_, k) => k);
    const mat = `M_${id}`;
    body += `
    def Xform "${id}"
    {
        def Mesh "geo" (prepend apiSchemas = ["MaterialBindingAPI"])
        {
            int[] faceVertexCounts = [${new Array(idx.length / 3).fill(3).join(', ')}]
            int[] faceVertexIndices = [${idx.join(', ')}]
            point3f[] points = [${fmt(m.points, 3)}]${m.normals ? `
            normal3f[] normals = [${fmt(m.normals, 3)}] (interpolation = "vertex")` : ''}${m.uvs ? `
            texCoord2f[] primvars:st = [${fmt(m.uvs, 2)}] (interpolation = "vertex")` : ''}
            uniform token subdivisionScheme = "none"
            rel material:binding = </Root/Materials/${mat}>
        }
    }`;
  });
  const mats = meshes.map((m, i) => {
    const id = `M_${safeId(m.name, i)}`; const c = m.color || [0.8, 0.8, 0.8];
    const tex = m.texture ? `
            def Shader "uv"
            {
                uniform token info:id = "UsdPrimvarReader_float2"
                token inputs:varname = "st"
                float2 outputs:result
            }
            def Shader "tex"
            {
                uniform token info:id = "UsdUVTexture"
                asset inputs:file = @${m.texture}@
                float2 inputs:st.connect = </Root/Materials/${id}/uv.outputs:result>
                float3 outputs:rgb
            }` : '';
    return `
        def Material "${id}"
        {
            token outputs:surface.connect = </Root/Materials/${id}/pbr.outputs:surface>
            def Shader "pbr"
            {
                uniform token info:id = "UsdPreviewSurface"
                ${m.texture ? `color3f inputs:diffuseColor.connect = </Root/Materials/${id}/tex.outputs:rgb>` : `color3f inputs:diffuseColor = (${c.map((x) => Number(x.toFixed(4))).join(', ')})`}
                float inputs:opacity = ${Number((m.opacity ?? 1).toFixed(3))}
                float inputs:roughness = ${Number((m.roughness ?? 0.5).toFixed(3))}
                float inputs:metallic = ${Number((m.metallic ?? 0).toFixed(3))}
                token outputs:surface
            }${tex}
        }`;
  }).join('');
  return `#usda 1.0
(
    defaultPrim = "Root"
    metersPerUnit = 1
    upAxis = "Y"
    doc = "Exporté par NEXORA (Studio 3D & Motion)"
)

def Xform "Root"
{${body}
    def Scope "Materials"
    {${mats}
    }
}
`;
}
export function buildUsdz(meshes, textures = []) {
  return storeZip([{ name: 'scene.usda', data: usda(meshes) }, ...textures]);
}

// ---------- Lottie à images (une image par étape, intégrée en base64) ----------
export function buildLottie({ w, h, fps, frames, name = 'NEXORA' }) {
  const assets = frames.map((src, i) => ({ id: `img_${i}`, w, h, u: '', p: src, e: 1 }));
  const layers = frames.map((_, i) => ({ ddd: 0, ind: i + 1, ty: 2, nm: `Image ${i + 1}`, refId: `img_${i}`, sr: 1, ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [w / 2, h / 2, 0] }, a: { a: 0, k: [w / 2, h / 2, 0] }, s: { a: 0, k: [100, 100, 100] } }, ao: 0, ip: i, op: i + 1, st: 0, bm: 0 }));
  return { v: '5.7.4', fr: fps, ip: 0, op: frames.length, w, h, nm: name, ddd: 0, assets, layers };
}

// ---------- Accessibilité : flashs (écart de luminosité d'au moins 10 %, plus de 3 par seconde) ----------
export function flashRate(lumas, fps, delta = 0.1) {
  const changes = []; let ref = lumas[0]; let dir = 0;
  for (let i = 1; i < lumas.length; i++) {
    const d = lumas[i] - ref;
    if (Math.abs(d) >= delta) { const s = Math.sign(d); if (s !== dir) changes.push(i); dir = s; ref = lumas[i]; }
    else if (dir > 0 && lumas[i] > ref) ref = lumas[i];
    else if (dir < 0 && lumas[i] < ref) ref = lumas[i];
  }
  // Un flash = deux changements opposés ; pire fenêtre d'une seconde.
  let worst = 0;
  for (let a = 0, b = 0; b < changes.length; b++) { while (changes[b] - changes[a] >= fps) a++; worst = Math.max(worst, Math.floor((b - a + 1) / 2)); }
  return worst;
}

// ---------- Bruitages synthétisés (aucun fichier, aucun droit d'auteur) ----------
export const SFX = { swoosh: 'Swoosh', pop: 'Pop', clic: 'Clic', impact: 'Impact', montee: 'Montée', cloche: 'Notification', whoosh: 'Passage rapide' };
export function synth(kind, rate = 48000) {
  const len = { swoosh: 0.55, pop: 0.18, clic: 0.05, impact: 0.9, montee: 1.6, cloche: 1.2, whoosh: 0.35 }[kind];
  if (!len) throw new Error('Bruitage inconnu.');
  const n = Math.round(len * rate); const out = new Float32Array(n);
  let seed = 1234567; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x3fffffff - 1; };
  let lp = 0; let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate; const k = t / len; let s = 0;
    if (kind === 'swoosh' || kind === 'whoosh') { const cut = kind === 'swoosh' ? 0.02 + 0.25 * Math.sin(Math.PI * k) : 0.05 + 0.4 * Math.sin(Math.PI * k); lp += cut * (rnd() - lp); s = lp * 2.2 * Math.sin(Math.PI * k); }
    else if (kind === 'pop') { ph += 2 * Math.PI * (900 - 650 * k) / rate; s = Math.sin(ph) * Math.exp(-k * 9); }
    else if (kind === 'clic') { s = rnd() * Math.exp(-k * 30) * 0.8; }
    else if (kind === 'impact') { ph += 2 * Math.PI * (70 - 30 * k) / rate; lp += 0.08 * (rnd() - lp); s = (Math.sin(ph) * 0.9 + lp * 1.5) * Math.exp(-k * 5); }
    else if (kind === 'montee') { ph += 2 * Math.PI * (180 + 900 * k * k) / rate; lp += (0.02 + 0.3 * k) * (rnd() - lp); s = (Math.sin(ph) * 0.35 + lp * 1.4) * (k < 0.92 ? k : (1 - k) / 0.08); }
    else if (kind === 'cloche') { for (const [f, a] of [[880, 0.5], [1320, 0.25], [2217, 0.15]]) s += a * Math.sin(2 * Math.PI * f * t); s *= Math.exp(-k * 6) * Math.min(1, t * 400); }
    out[i] = s;
  }
  let peak = 0; for (const x of out) peak = Math.max(peak, Math.abs(x));
  if (peak > 0) for (let i = 0; i < n; i++) out[i] = (out[i] / peak) * 0.9;
  return out;
}
// Ajoute un bruitage (mono) dans des canaux de sortie, à partir de l'échantillon start, avec un gain.
export function mixInto(channels, sample, start, gain = 1) {
  for (const ch of channels) for (let i = 0; i < sample.length; i++) { const j = start + i; if (j < 0 || j >= ch.length) continue; ch[j] = Math.max(-1, Math.min(1, ch[j] + sample[i] * gain)); }
}

// ---------- Réponses de l'IA : mise en scène et objet composé ----------
export const PLAN = {
  scene: ['duo', 'trio', 'foldopen', 'laptopphone', 'hero', 'flat'],
  anim: ['spin', 'swing', 'enter', 'float', 'open', 'scroll', 'showcase'],
  camera: ['orbit360', 'spiral', 'dive', 'vertigo', 'none'],
  transition: ['black', 'white', 'none'],
};
const choose = (v, list, def) => (list.includes(v) ? v : def);
export function cleanPlan(raw, { styles = [], hdris = [], grades = [], particles = [] } = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const n = (v, a, b, d) => { const x = Number(v); return Number.isFinite(x) ? Math.min(b, Math.max(a, x)) : d; };
  const texts = (Array.isArray(r.texts) ? r.texts : []).map((t) => String(t || '').trim().slice(0, 40)).filter(Boolean).slice(0, 2);
  return {
    scene: choose(r.scene, PLAN.scene, 'hero'), anim: choose(r.anim, PLAN.anim, 'showcase'), camera: choose(r.camera, PLAN.camera, 'none'),
    style: choose(r.style, styles, null), hdri: choose(r.hdri, hdris, null), grade: choose(r.grade, grades, null), particles: choose(r.particles, particles, null),
    transition: choose(r.transition, PLAN.transition, 'none'), duration: n(r.duration, 3, 30, 8),
    color: /^#[0-9a-f]{6}$/i.test(r.color || '') ? r.color.toLowerCase() : null, texts,
  };
}
export const SHAPES = ['box', 'sphere', 'cylinder', 'cone', 'torus', 'capsule'];
export function cleanParts(raw) {
  const list = Array.isArray(raw && raw.parts) ? raw.parts : Array.isArray(raw) ? raw : [];
  const v3 = (a, d, lo, hi) => (Array.isArray(a) && a.length === 3 ? a.map((x, i) => { const v = Number(x); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d[i]; }) : d);
  const parts = list.slice(0, 40).map((p) => ({
    shape: choose(p && p.shape, SHAPES, 'box'), pos: v3(p && p.pos, [0, 0, 0], -50, 50), rot: v3(p && p.rot, [0, 0, 0], -360, 360), size: v3(p && p.size, [1, 1, 1], 0.05, 50),
    color: /^#[0-9a-f]{6}$/i.test((p && p.color) || '') ? p.color.toLowerCase() : '#cccccc',
    metal: Math.min(1, Math.max(0, Number(p && p.metal) || 0)), rough: Math.min(1, Math.max(0, p && p.rough != null ? Number(p.rough) : 0.5)),
  }));
  if (!parts.length) throw new Error('L’IA n’a proposé aucune forme. Reformule ta description.');
  return { name: String((raw && raw.name) || 'Objet IA').slice(0, 40), parts };
}
