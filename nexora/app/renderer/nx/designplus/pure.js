// NEXORA #053 : fonctions sans dépendance au navigateur (essais de scripts/test-design.mjs) : lecture CSV,
// remplissage d'un modèle, PDF d'impression, lecture des fichiers Photoshop (PSD), fichiers d'icône Windows (ICO).

export function parseCsv(text) {
  const t = String(text).replace(/^\uFEFF/, '');
  const first = t.split(/\r?\n/)[0] || '';
  const count = (ch) => first.split(ch).length - 1;
  const sep = count(';') > count(',') ? ';' : count('\t') > count(',') ? '\t' : ',';
  const rows = [];
  let row = []; let cell = ''; let q = false;
  for (let i = 0; i < t.length; i += 1) {
    const ch = t[i];
    if (q) { if (ch === '"' && t[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') q = false; else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i += 1; row.push(cell); cell = ''; if (row.some((c) => c.trim())) rows.push(row); row = []; } else cell += ch;
  }
  row.push(cell); if (row.some((c) => c.trim())) rows.push(row);
  const head = (rows.shift() || []).map((h) => h.trim());
  return { head, rows: rows.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()]))) };
}
// Copie du JSON d'une page remplie avec une ligne du tableau : {{colonne}} dans les textes, images @colonne.
export function fill(json, row) {
  const j = JSON.parse(JSON.stringify(json));
  const visit = (list) => { for (const o of list || []) {
    if (typeof o.text === 'string') o.text = o.text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (m, k) => (row[k] !== undefined ? row[k] : m));
    if (o.type && /image/i.test(o.type) && typeof o.name === 'string' && o.name.startsWith('@')) { const v = row[o.name.slice(1)]; if (v && /^(https?:|data:image\/)/.test(v)) o.src = v; }
    if (o.objects) visit(o.objects);
  } };
  visit(j.objects);
  return j;
}

// ---------- PDF : une image JPEG par page, boîtes de coupe et de fond perdu, traits de coupe ----------
const enc = new TextEncoder();
export function buildPdf(pages) {
  const body = [];
  const add = (o) => { body.push(o); return body.length + 2; };
  const kids = [];
  for (const p of pages) {
    const img = add({ dict: `<< /Type /XObject /Subtype /Image /Width ${p.pw} /Height ${p.ph} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpg.length} >>`, stream: p.jpg });
    const W = p.mw; const H = p.mh; const m = p.margin; const b = p.bleedPt;
    let s = `q ${p.iw.toFixed(2)} 0 0 ${p.ih.toFixed(2)} ${(m - b).toFixed(2)} ${(m - b).toFixed(2)} cm /Im0 Do Q\n`;
    if (p.marks) {
      s += '0 0 0 RG 0.25 w\n';
      const L = m - b - 2; const g = b + 2;
      for (const [x, y, sx, sy] of [[m, m, -1, -1], [W - m, m, 1, -1], [m, H - m, -1, 1], [W - m, H - m, 1, 1]]) {
        s += `${x.toFixed(2)} ${(y + sy * g).toFixed(2)} m ${x.toFixed(2)} ${(y + sy * (g + L)).toFixed(2)} l S\n`;
        s += `${(x + sx * g).toFixed(2)} ${y.toFixed(2)} m ${(x + sx * (g + L)).toFixed(2)} ${y.toFixed(2)} l S\n`;
      }
    }
    const sb = enc.encode(s);
    const content = add({ dict: `<< /Length ${sb.length} >>`, stream: sb });
    kids.push(add({ dict: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W.toFixed(2)} ${H.toFixed(2)}] /TrimBox [${m.toFixed(2)} ${m.toFixed(2)} ${(W - m).toFixed(2)} ${(H - m).toFixed(2)}] /BleedBox [${(m - b).toFixed(2)} ${(m - b).toFixed(2)} ${(W - m + b).toFixed(2)} ${(H - m + b).toFixed(2)}] /Resources << /XObject << /Im0 ${img} 0 R >> >> /Contents ${content} 0 R >>` }));
  }
  const all = [{ dict: '<< /Type /Catalog /Pages 2 0 R >>' }, { dict: `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>` }, ...body];
  const parts = []; const offsets = []; let pos = 0;
  const push = (u) => { parts.push(u); pos += u.length; };
  push(enc.encode('%PDF-1.4\n'));
  all.forEach((o, i) => {
    offsets.push(pos);
    push(enc.encode(`${i + 1} 0 obj\n${o.dict}\n`));
    if (o.stream) { push(enc.encode('stream\n')); push(o.stream); push(enc.encode('\nendstream\n')); }
    push(enc.encode('endobj\n'));
  });
  const xref = pos;
  push(enc.encode(`xref\n0 ${all.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${all.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  const out = new Uint8Array(pos);
  let k = 0;
  for (const p of parts) { out.set(p, k); k += p.length; }
  return out;
}

// ---------- Photoshop (PSD, RVB 8 bits) : calques avec nom, position, opacité, visibilité ----------
export function parsePsd(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let p = 0;
  const u1 = () => u8[p++];
  const u2 = () => { const v = dv.getUint16(p); p += 2; return v; };
  const s2 = () => { const v = dv.getInt16(p); p += 2; return v; };
  const u4 = () => { const v = dv.getUint32(p); p += 4; return v; };
  const s4 = () => { const v = dv.getInt32(p); p += 4; return v; };
  const str = (n) => { let s = ''; for (let i = 0; i < n; i += 1) s += String.fromCharCode(u8[p + i]); p += n; return s; };
  if (str(4) !== '8BPS') throw new Error('Ce fichier n’est pas un document Photoshop (PSD).');
  if (u2() !== 1) throw new Error('Les très grands documents (PSB) ne sont pas pris en charge : enregistre-le en PSD.');
  p += 6;
  const channels = u2(); const H = u4(); const W = u4(); const depth = u2(); const mode = u2();
  if (depth !== 8 || mode !== 3) throw new Error('NEXORA lit les PSD en couleurs RVB 8 bits : convertis le document (Image > Mode > Couleurs RVB, 8 bits).');
  { const n = u4(); p += n; }
  { const n = u4(); p += n; }
  const decode = (comp, w, h, rowCounts) => {
    const out = new Uint8Array(w * h);
    if (comp === 0) { out.set(u8.subarray(p, p + w * h)); p += w * h; return out; }
    if (comp !== 1) throw new Error('Compression du PSD non prise en charge (enregistre-le avec « Optimiser la compatibilité »).');
    const counts = rowCounts || Array.from({ length: h }, () => u2());
    let o = 0;
    for (let y = 0; y < h; y += 1) {
      const end = p + counts[y];
      let x = 0;
      while (p < end) {
        let n = u8[p++];
        if (n > 127) n -= 256;
        if (n >= 0) { for (let k = 0; k <= n && x < w; k += 1, x += 1) out[o + x] = u8[p++]; if (n + 1 > 0 && x >= w) p = Math.min(end, p); } else if (n !== -128) { const v = u8[p++]; for (let k = 0; k < 1 - n && x < w; k += 1, x += 1) out[o + x] = v; }
      }
      p = end;
      o += w;
    }
    return out;
  };
  const layers = [];
  const lmLen = u4();
  const lmEnd = p + lmLen;
  if (lmLen > 0) {
    const liLen = u4();
    if (liLen > 0) {
      const count = Math.abs(s2());
      const recs = [];
      for (let i = 0; i < count; i += 1) {
        const top = s4(); const left = s4(); const bottom = s4(); const right = s4();
        const nc = u2(); const chans = [];
        for (let c = 0; c < nc; c += 1) chans.push({ id: s2(), len: u4() });
        p += 4; const blend = str(4); const opacity = u1(); p += 1; const flags = u1(); p += 1;
        const extraLen = u4(); const extraEnd = p + extraLen;
        { const n = u4(); p += n; } { const n = u4(); p += n; }
        const nl = u1(); let name = ''; for (let k = 0; k < nl; k += 1) name += String.fromCharCode(u8[p + k]); p += nl;
        p += (4 - ((nl + 1) % 4)) % 4;
        let divider = 0;
        while (p + 12 <= extraEnd) {
          const sig = str(4); if (sig !== '8BIM' && sig !== '8B64') break;
          const key = str(4); const len = u4(); const s0 = p;
          if (key === 'luni') { const n = u4(); let t = ''; for (let k = 0; k < n; k += 1) t += String.fromCharCode(u2()); name = t.replace(/\0+$/, ''); }
          if (key === 'lsct' || key === 'lsdk') divider = u4();
          p = s0 + len + (len % 2);
        }
        p = extraEnd;
        recs.push({ top, left, bottom, right, chans, opacity, hidden: Boolean(flags & 2), name, divider, blend });
      }
      for (const r of recs) {
        const w = r.right - r.left; const h = r.bottom - r.top;
        const rgba = w > 0 && h > 0 && !r.divider ? new Uint8Array(w * h * 4).fill(255) : null;
        for (const ch of r.chans) {
          const end = p + ch.len;
          const comp = u2();
          if (rgba && ch.id >= -1 && ch.id <= 2) {
            const plane = decode(comp, w, h);
            const off = ch.id === -1 ? 3 : ch.id;
            for (let i = 0; i < w * h; i += 1) rgba[i * 4 + off] = plane[i];
          }
          p = end;
        }
        if (rgba) layers.push({ name: r.name || 'Calque', left: r.left, top: r.top, width: w, height: h, opacity: r.opacity / 255, visible: !r.hidden, rgba });
      }
    }
  }
  p = lmEnd;
  // Image fusionnée (utilisée quand le document n'a pas de calques).
  let composite = null;
  if (p + 2 <= u8.length) {
    try {
      const comp = u2();
      const counts = comp === 1 ? Array.from({ length: channels * H }, () => u2()) : null;
      const rgba = new Uint8Array(W * H * 4).fill(255);
      for (let c = 0; c < Math.min(channels, 4); c += 1) {
        const plane = decode(comp, W, H, counts ? counts.slice(c * H, (c + 1) * H) : null);
        for (let i = 0; i < W * H; i += 1) rgba[i * 4 + c] = plane[i];
      }
      composite = rgba;
    } catch { composite = null; }
  }
  return { width: W, height: H, layers, composite };
}

// ---------- Icône Windows (ICO) : images PNG de 16 à 256 px ----------
export function buildIco(images) {
  const head = 6 + images.length * 16;
  const total = head + images.reduce((s, i) => s + i.png.length, 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, 0, true); dv.setUint16(2, 1, true); dv.setUint16(4, images.length, true);
  let off = head;
  images.forEach((img, i) => {
    const e = 6 + i * 16;
    out[e] = img.size >= 256 ? 0 : img.size; out[e + 1] = img.size >= 256 ? 0 : img.size;
    dv.setUint16(e + 4, 1, true); dv.setUint16(e + 6, 32, true);
    dv.setUint32(e + 8, img.png.length, true); dv.setUint32(e + 12, off, true);
    out.set(img.png, off); off += img.png.length;
  });
  return out;
}

// ---------- Contraste (WCAG) ----------
const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export const lum = (hex) => { const n = parseInt(String(hex).slice(1, 7), 16); return 0.2126 * lin(n >> 16 & 255) + 0.7152 * lin(n >> 8 & 255) + 0.0722 * lin(n & 255); };
export const contrast = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// ---------- NEXORA #054 : responsive (contraintes des éléments) ----------
// Contraintes devinées d'après la place d'un élément dans la page (b : boîte { left, top, width, height }).
export function guessCons(b, W, H) {
  // Décor qui déborde volontairement de la page : il suit la page en proportion (place et taille).
  if (b.left < -W * 0.02 || b.top < -H * 0.02 || b.left + b.width > W * 1.02 || b.top + b.height > H * 1.02) return { h: 'scale', v: 'scale' };
  const cx = b.left + b.width / 2; const cy = b.top + b.height / 2;
  const h = b.width >= W * 0.9 ? 'stretch' : Math.abs(cx - W / 2) <= W * 0.03 ? 'center' : W - (b.left + b.width) < b.left ? 'right' : 'left';
  const v = b.height >= H * 0.9 ? 'stretch' : Math.abs(cy - H / 2) <= H * 0.03 ? 'center' : H - (b.top + b.height) < b.top ? 'bottom' : 'top';
  return { h, v };
}
// Nouvelle boîte d'un élément quand la page passe de F { w, h } à T { w, h }. fixedH : hauteur imposée par le
// contenu (textes) : « étirer » et « proportionnel » ne changent alors que la position verticale.
export function constrain(b, c, F, T, { fixedH = false } = {}) {
  const axis = (mode, start, size, from, to, fixed) => {
    const d = to - from;
    if (mode === 'right' || mode === 'bottom') return [start + d, size];
    if (mode === 'center') return [start + d / 2, size];
    if (mode === 'stretch') return fixed ? [start, size] : [start, Math.max(1, size + d)];
    if (mode === 'scale') return fixed ? [start * to / from, size] : [start * to / from, size * to / from];
    return [start, size];
  };
  const [left, width] = axis(c.h, b.left, b.width, F.w, T.w, false);
  const [top, height] = axis(c.v, b.top, b.height, F.h, T.h, fixedH);
  return { left, top, width, height };
}
// Élément qui tenait dans la page mais déborde à la nouvelle taille : ramené dans la page (marge gardée).
// text : la largeur seule est réduite (le texte revient à la ligne) ; sinon réduction proportionnelle.
export function fitInside(nb, b, F, T, { text = false } = {}) {
  const inside = b.left >= -1 && b.left + b.width <= F.w + 1;
  if (!inside || (nb.left >= 0 && nb.left + nb.width <= T.w)) return nb;
  const m = Math.max(0, Math.min(b.left, F.w - b.left - b.width, T.w * 0.06));
  const room = Math.max(1, T.w - 2 * m);
  if (nb.width > room) {
    if (text) return { ...nb, left: m, width: room };
    const k = room / nb.width;
    return { left: m, top: nb.top, width: room, height: nb.height * k };
  }
  return { ...nb, left: Math.min(Math.max(nb.left, m), T.w - m - nb.width) };
}
// Textes devenus plus hauts : les éléments placés dessous (qui commencent sous le milieu du texte et se chevauchent
// en largeur) descendent d'autant.
// items : [{ before: boîte d'origine, after: nouvelle boîte, grow: hausse de hauteur (textes) }]. Renvoie le décalage
// vertical de chaque élément.
export function pushDown(items) {
  return items.map((it) => items.reduce((s, t) => (t !== it && t.grow > 0 && it.before.top >= t.before.top + t.before.height / 2
    && t.after.left < it.after.left + it.after.width && it.after.left < t.after.left + t.after.width ? s + t.grow : s), 0));
}
