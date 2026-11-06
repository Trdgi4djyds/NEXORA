// NEXORA #054 : PDF vectoriel de NEX-DESIGN, sans navigateur (essayé par pnpm test:design) : lecture des polices
// TrueType (et WOFF 1, converti en TrueType), texte écrit avec la vraie police intégrée (sélectionnable et
// consultable grâce à la table ToUnicode), formes en tracés, images, transparences, fonds perdus et traits de coupe.
// La compression (zlib) est fournie par l'appelant : CompressionStream dans NEXORA, zlib dans les essais.

const enc = new TextEncoder();
const f2 = (n) => (Math.abs(n) < 1e-6 ? '0' : Number(n.toFixed(3)).toString());
export const num = f2;

// ---------- Polices ----------
// Lit les tables utiles d'une police TrueType (contours « glyf ») ; renvoie null si le fichier ne convient pas.
export function parseTtf(u8) {
  if (!u8 || u8.length < 12) return null;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const tag = (o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  const sig = dv.getUint32(0);
  if (sig !== 0x00010000 && tag(0) !== 'true') return null;
  const n = dv.getUint16(4);
  const t = {};
  for (let i = 0; i < n; i++) { const o = 12 + i * 16; t[tag(o)] = { off: dv.getUint32(o + 8), len: dv.getUint32(o + 12) }; }
  if (!t.head || !t.hhea || !t.hmtx || !t.maxp || !t.cmap || !t.glyf || t['CFF ']) return null;
  const head = t.head.off;
  const unitsPerEm = dv.getUint16(head + 18) || 1000;
  const bbox = [dv.getInt16(head + 36), dv.getInt16(head + 38), dv.getInt16(head + 40), dv.getInt16(head + 42)];
  const ascent = dv.getInt16(t.hhea.off + 4);
  const descent = dv.getInt16(t.hhea.off + 6);
  const numH = dv.getUint16(t.hhea.off + 34);
  const numGlyphs = dv.getUint16(t.maxp.off + 4);
  let capHeight = ascent; let fsType = 0;
  if (t['OS/2']) { const o = t['OS/2'].off; fsType = dv.getUint16(o + 8); if (dv.getUint16(o) >= 2 && t['OS/2'].len >= 90) capHeight = dv.getInt16(o + 88) || ascent; }
  // Licence : « usage restreint » (2) ou bitmaps seulement (0x200) interdisent l'intégration.
  const embeddable = (fsType & 0x000f) !== 2 && !(fsType & 0x0200);
  // Table cmap : Windows Unicode complet (format 12) de préférence, sinon BMP (format 4).
  const cm = t.cmap.off; const subs = [];
  for (let i = 0, nt = dv.getUint16(cm + 2); i < nt; i++) subs.push({ pid: dv.getUint16(cm + 4 + i * 8), eid: dv.getUint16(cm + 6 + i * 8), off: cm + dv.getUint32(cm + 8 + i * 8) });
  const pick = subs.find((s) => s.pid === 3 && s.eid === 10 && dv.getUint16(s.off) === 12) || subs.find((s) => s.pid === 0 && dv.getUint16(s.off) === 12)
    || subs.find((s) => s.pid === 3 && s.eid === 1 && dv.getUint16(s.off) === 4) || subs.find((s) => s.pid === 0 && dv.getUint16(s.off) === 4);
  if (!pick) return null;
  const fmt = dv.getUint16(pick.off);
  const cache = new Map();
  let gidOf;
  if (fmt === 12) {
    const ng = dv.getUint32(pick.off + 12);
    gidOf = (cp) => {
      let lo = 0; let hi = ng - 1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; const g = pick.off + 16 + mid * 12; const s = dv.getUint32(g); const e = dv.getUint32(g + 4); if (cp < s) hi = mid - 1; else if (cp > e) lo = mid + 1; else return dv.getUint32(g + 8) + cp - s; }
      return 0;
    };
  } else {
    const o = pick.off; const seg = dv.getUint16(o + 6) / 2;
    const ends = o + 14; const starts = ends + seg * 2 + 2; const deltas = starts + seg * 2; const ranges = deltas + seg * 2;
    gidOf = (cp) => {
      if (cp > 0xffff) return 0;
      for (let i = 0; i < seg; i++) {
        if (cp > dv.getUint16(ends + i * 2)) continue;
        const s = dv.getUint16(starts + i * 2); if (cp < s) return 0;
        const ro = dv.getUint16(ranges + i * 2); const d = dv.getInt16(deltas + i * 2);
        if (!ro) return (cp + d) & 0xffff;
        const at = ranges + i * 2 + ro + (cp - s) * 2; const g = dv.getUint16(at);
        return g ? (g + d) & 0xffff : 0;
      }
      return 0;
    };
  }
  const gid = (cp) => { if (!cache.has(cp)) { const g = gidOf(cp); cache.set(cp, g < numGlyphs ? g : 0); } return cache.get(cp); };
  const advance = (g) => dv.getUint16(t.hmtx.off + Math.min(g, numH - 1) * 4);
  return { unitsPerEm, bbox, ascent, descent, capHeight, numGlyphs, embeddable, gid, advance };
}

// WOFF 1 → TrueType (tables décompressées une par une).
export async function woffToSfnt(u8, inflate) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint32(0) !== 0x774f4646) return u8;
  const n = dv.getUint16(12);
  const tables = [];
  for (let i = 0; i < n; i++) {
    const o = 44 + i * 20;
    const off = dv.getUint32(o + 4); const comp = dv.getUint32(o + 8); const orig = dv.getUint32(o + 12);
    const raw = u8.subarray(off, off + comp);
    const data = comp < orig ? await inflate(raw) : raw;
    if (data.length !== orig) throw new Error('Police WOFF illisible.');
    tables.push({ tag: dv.getUint32(o), sum: dv.getUint32(o + 16), data });
  }
  let size = 12 + n * 16;
  for (const t of tables) size += (t.data.length + 3) & ~3;
  const out = new Uint8Array(size); const ov = new DataView(out.buffer);
  ov.setUint32(0, dv.getUint32(4)); ov.setUint16(4, n);
  let p2 = 1; let e = 0; while (p2 * 2 <= n) { p2 *= 2; e++; }
  ov.setUint16(6, p2 * 16); ov.setUint16(8, e); ov.setUint16(10, n * 16 - p2 * 16);
  let pos = 12 + n * 16;
  tables.forEach((t, i) => {
    const o = 12 + i * 16;
    ov.setUint32(o, t.tag); ov.setUint32(o + 4, t.sum); ov.setUint32(o + 8, pos); ov.setUint32(o + 12, t.data.length);
    out.set(t.data, pos); pos += (t.data.length + 3) & ~3;
  });
  return out;
}

// Police à intégrer : clé de ressource (F1…), nom, fichier et glyphes utilisés (pour les largeurs et ToUnicode).
export function makeFont(key, name, bytes) {
  const ttf = parseTtf(bytes);
  if (!ttf || !ttf.embeddable) return null;
  return { key, name: String(name || key).replace(/[^A-Za-z0-9-]/g, '') || key, bytes, ttf, used: new Map() };
}
// Glyphes d'un texte ; null si un caractère manque dans la police (le texte est alors rendu en image).
export function glyphs(font, chars) {
  const out = [];
  for (const ch of chars) {
    if (/^\s$/.test(ch) && ch !== ' ' && ch !== '\u00a0') { out.push(null); continue; }
    const cp = ch.codePointAt(0); const g = font.ttf.gid(cp === 0xa0 ? 0x20 : cp);
    if (!g && !/\s/.test(ch)) return null;
    out.push(g);
  }
  return out;
}
// Opérateurs d'une ligne de texte : chaque caractère à la position calculée par NEX-DESIGN (lefts, en unités du
// texte), avec des corrections TJ quand l'avance de la police diffère (approche, justification).
export function textRun(font, chars, gids, lefts, size) {
  const upm = font.ttf.unitsPerEm;
  let s = '['; let open = false; let pen = 0;
  for (let i = 0; i < chars.length; i++) {
    const g = gids[i]; if (g === null || g === undefined) continue;
    const gap = (lefts[i] - pen) * 1000 / size;
    if (Math.abs(gap) > 0.5) { if (open) { s += '>'; open = false; } s += ` ${f2(-gap)} `; }
    if (!open) { s += '<'; open = true; }
    s += g.toString(16).padStart(4, '0');
    if (!font.used.has(g)) font.used.set(g, chars[i] === '\u00a0' ? ' ' : chars[i]);
    pen = lefts[i] + font.ttf.advance(g) * size / upm;
  }
  if (open) s += '>';
  return `${s}] TJ`;
}

// ---------- Tracés ----------
export const rectPath = (x, y, w, h, rx = 0, ry = rx) => {
  rx = Math.min(Math.abs(rx), Math.abs(w) / 2); ry = Math.min(Math.abs(ry), Math.abs(h) / 2);
  if (!rx || !ry) return `${f2(x)} ${f2(y)} ${f2(w)} ${f2(h)} re\n`;
  const k = 0.5522847498; const cx = rx * k; const cy = ry * k; const r = x + w; const b = y + h;
  return `${f2(x + rx)} ${f2(y)} m ${f2(r - rx)} ${f2(y)} l ${f2(r - rx + cx)} ${f2(y)} ${f2(r)} ${f2(y + ry - cy)} ${f2(r)} ${f2(y + ry)} c ${f2(r)} ${f2(b - ry)} l ${f2(r)} ${f2(b - ry + cy)} ${f2(r - rx + cx)} ${f2(b)} ${f2(r - rx)} ${f2(b)} c ${f2(x + rx)} ${f2(b)} l ${f2(x + rx - cx)} ${f2(b)} ${f2(x)} ${f2(b - ry + cy)} ${f2(x)} ${f2(b - ry)} c ${f2(x)} ${f2(y + ry)} l ${f2(x)} ${f2(y + ry - cy)} ${f2(x + rx - cx)} ${f2(y)} ${f2(x + rx)} ${f2(y)} c h\n`;
};
export const ellipsePath = (cx, cy, rx, ry) => {
  const k = 0.5522847498; const ox = rx * k; const oy = ry * k;
  return `${f2(cx + rx)} ${f2(cy)} m ${f2(cx + rx)} ${f2(cy + oy)} ${f2(cx + ox)} ${f2(cy + ry)} ${f2(cx)} ${f2(cy + ry)} c ${f2(cx - ox)} ${f2(cy + ry)} ${f2(cx - rx)} ${f2(cy + oy)} ${f2(cx - rx)} ${f2(cy)} c ${f2(cx - rx)} ${f2(cy - oy)} ${f2(cx - ox)} ${f2(cy - ry)} ${f2(cx)} ${f2(cy - ry)} c ${f2(cx + ox)} ${f2(cy - ry)} ${f2(cx + rx)} ${f2(cy - oy)} ${f2(cx + rx)} ${f2(cy)} c h\n`;
};
// Commandes M, L, H, V, C, S, Q, T, Z absolues (forme simplifiée des tracés de NEX-DESIGN) ; null si inconnues.
export function pathOps(cmds, dx = 0, dy = 0) {
  let s = ''; let x = 0; let y = 0; let sx = 0; let sy = 0; let lc = null;
  const P = (a, b) => `${f2(a + dx)} ${f2(b + dy)}`;
  for (const c of cmds) {
    const k = c[0];
    if (k === 'M') { x = c[1]; y = c[2]; sx = x; sy = y; s += `${P(x, y)} m\n`; lc = null; }
    else if (k === 'L') { x = c[1]; y = c[2]; s += `${P(x, y)} l\n`; lc = null; }
    else if (k === 'H') { x = c[1]; s += `${P(x, y)} l\n`; lc = null; }
    else if (k === 'V') { y = c[1]; s += `${P(x, y)} l\n`; lc = null; }
    else if (k === 'C') { s += `${P(c[1], c[2])} ${P(c[3], c[4])} ${P(c[5], c[6])} c\n`; lc = [c[3], c[4]]; x = c[5]; y = c[6]; }
    else if (k === 'S') { const a = lc ? [2 * x - lc[0], 2 * y - lc[1]] : [x, y]; s += `${P(a[0], a[1])} ${P(c[1], c[2])} ${P(c[3], c[4])} c\n`; lc = [c[1], c[2]]; x = c[3]; y = c[4]; }
    else if (k === 'Q' || k === 'T') {
      const q = k === 'Q' ? [c[1], c[2]] : (lc && lc.q ? [2 * x - lc[0], 2 * y - lc[1]] : [x, y]);
      const ex = k === 'Q' ? c[3] : c[1]; const ey = k === 'Q' ? c[4] : c[2];
      s += `${P(x + 2 / 3 * (q[0] - x), y + 2 / 3 * (q[1] - y))} ${P(ex + 2 / 3 * (q[0] - ex), ey + 2 / 3 * (q[1] - ey))} ${P(ex, ey)} c\n`;
      lc = Object.assign([q[0], q[1]], { q: true }); x = ex; y = ey;
    } else if (k === 'Z' || k === 'z') { s += 'h\n'; x = sx; y = sy; lc = null; }
    else return null;
  }
  return s;
}

// ---------- Traits de coupe ----------
export function cropMarks(W, H, m, b) {
  let s = '0 0 0 RG 0.25 w\n';
  const L = m - b - 2; const g = b + 2;
  if (L <= 0) return '';
  for (const [x, y, sx, sy] of [[m, m, -1, -1], [W - m, m, 1, -1], [m, H - m, -1, 1], [W - m, H - m, 1, 1]]) {
    s += `${f2(x)} ${f2(y + sy * g)} m ${f2(x)} ${f2(y + sy * (g + L))} l S\n`;
    s += `${f2(x + sx * g)} ${f2(y)} m ${f2(x + sx * (g + L))} ${f2(y)} l S\n`;
  }
  return s;
}

// ---------- Fichier PDF ----------
function cmap(font) {
  const hex16 = (s) => { let h = ''; for (const u of s) { const cp = u.codePointAt(0); if (cp > 0xffff) { const v = cp - 0x10000; h += (0xd800 + (v >> 10)).toString(16).padStart(4, '0') + (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0'); } else h += cp.toString(16).padStart(4, '0'); } return h; };
  const list = [...font.used].sort((a, b) => a[0] - b[0]);
  let body = '';
  for (let i = 0; i < list.length; i += 100) {
    const part = list.slice(i, i + 100);
    body += `${part.length} beginbfchar\n${part.map(([g, ch]) => `<${g.toString(16).padStart(4, '0')}> <${hex16(ch)}>`).join('\n')}\nendbfchar\n`;
  }
  return `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${body}endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n`;
}
// pages : [{ W, H, trim: [x0, y0, x1, y1], bleed: [...], content, images: [{ key, w, h, jpg } | { key, w, h, rgb, alpha }], gs: [{ key, ca }] }]
// fonts : polices créées par makeFont (glyphes utilisés déjà relevés par textRun).
export async function buildVectorPdf(pages, fonts, { deflate, title = '' } = {}) {
  const body = [];
  const add = (o) => { body.push(o); return body.length + 2; };
  const flate = async (bytes, extra = '') => { const z = await deflate(bytes); return { dict: `<< /Length ${z.length} /Filter /FlateDecode${extra} >>`, stream: z }; };
  const fontRefs = {};
  for (const f of fonts) {
    if (!f.used.size) continue;
    const k = 1000 / f.ttf.unitsPerEm; const sc = (v) => Math.round(v * k);
    const file = add(await flate(f.bytes, ` /Length1 ${f.bytes.length}`));
    const desc = add({ dict: `<< /Type /FontDescriptor /FontName /${f.name} /Flags 32 /FontBBox [${f.ttf.bbox.map(sc).join(' ')}] /ItalicAngle 0 /Ascent ${sc(f.ttf.ascent)} /Descent ${sc(f.ttf.descent)} /CapHeight ${sc(f.ttf.capHeight)} /StemV 80 /FontFile2 ${file} 0 R >>` });
    const widths = [...f.used.keys()].sort((a, b) => a - b).map((g) => `${g} [${sc(f.ttf.advance(g))}]`).join(' ');
    const cid = add({ dict: `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${f.name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${desc} 0 R /DW ${sc(f.ttf.advance(0))} /W [${widths}] /CIDToGIDMap /Identity >>` });
    const tu = add(await flate(enc.encode(cmap(f))));
    fontRefs[f.key] = add({ dict: `<< /Type /Font /Subtype /Type0 /BaseFont /${f.name} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${tu} 0 R >>` });
  }
  const kids = [];
  for (const p of pages) {
    const xo = [];
    for (const im of p.images || []) {
      let ref;
      if (im.jpg) ref = add({ dict: `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.jpg.length} >>`, stream: im.jpg });
      else {
        let smask = '';
        if (im.alpha) { const z = await deflate(im.alpha); smask = ` /SMask ${add({ dict: `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${z.length} >>`, stream: z })} 0 R`; }
        const z = await deflate(im.rgb);
        ref = add({ dict: `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode${smask} /Length ${z.length} >>`, stream: z });
      }
      xo.push(`/${im.key} ${ref} 0 R`);
    }
    const content = add(await flate(enc.encode(p.content)));
    const res = [
      Object.keys(fontRefs).length ? `/Font << ${Object.entries(fontRefs).map(([k, r]) => `/${k} ${r} 0 R`).join(' ')} >>` : '',
      xo.length ? `/XObject << ${xo.join(' ')} >>` : '',
      (p.gs || []).length ? `/ExtGState << ${p.gs.map((g) => `/${g.key} << /ca ${f2(g.ca)} /CA ${f2(g.CA ?? g.ca)} >>`).join(' ')} >>` : '',
    ].filter(Boolean).join(' ');
    const box = (b) => `[${b.map(f2).join(' ')}]`;
    kids.push(add({ dict: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f2(p.W)} ${f2(p.H)}] /TrimBox ${box(p.trim)} /BleedBox ${box(p.bleed)} /Resources << ${res} >> /Contents ${content} 0 R >>` }));
  }
  const pdfStr = (s) => `(${String(s).replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7e]/g, '')})`;
  const info = add({ dict: `<< /Producer (NEXORA) /Title ${pdfStr(title)} >>` });
  const all = [{ dict: '<< /Type /Catalog /Pages 2 0 R >>' }, { dict: `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>` }, ...body];
  const parts = []; const offsets = []; let pos = 0;
  const push = (u) => { parts.push(u); pos += u.length; };
  push(enc.encode('%PDF-1.6\n%\xe2\xe3\xcf\xd3\n'));
  all.forEach((o, i) => {
    offsets.push(pos);
    push(enc.encode(`${i + 1} 0 obj\n${o.dict}\n`));
    if (o.stream) { push(enc.encode('stream\n')); push(o.stream); push(enc.encode('\nendstream\n')); }
    push(enc.encode('endobj\n'));
  });
  const xref = pos;
  push(enc.encode(`xref\n0 ${all.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${all.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  const out = new Uint8Array(pos);
  let k = 0;
  for (const p of parts) { out.set(p, k); k += p.length; }
  return out;
}
