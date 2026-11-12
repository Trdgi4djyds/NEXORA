// NEXORA #011 : bibliothèque partagée (textures procédurales, motifs, formes, autocollants, cadres, modèles).
// Tout est généré localement : aucun téléchargement, aucune ressource externe (politique de sécurité inchangée).
import { makeCanvas, makeNoise, hexRgb, rgbHex, clamp, lerp, mixHex, esc, inkOn } from './core.js';

// ---------- Textures procédurales (couleur, relief, rugosité) ----------
export const TEXTURES = {
  bois: { label: 'Bois clair', colors: ['#c89b6d', '#8a5a33'], rough: 0.62, metal: 0 },
  noyer: { label: 'Noyer', colors: ['#7a4e2d', '#3e2412'], rough: 0.55, metal: 0 },
  marbre: { label: 'Marbre', colors: ['#f4f3f0', '#7d7f86'], rough: 0.18, metal: 0 },
  marbreNoir: { label: 'Marbre noir', colors: ['#1b1c1f', '#c9c3b6'], rough: 0.15, metal: 0 },
  beton: { label: 'Béton', colors: ['#a3a29f', '#6f6e6b'], rough: 0.9, metal: 0 },
  metal: { label: 'Métal brossé', colors: ['#c9ccd2', '#8b9099'], rough: 0.32, metal: 1 },
  cuivre: { label: 'Cuivre brossé', colors: ['#d38b5d', '#8c4d2c'], rough: 0.35, metal: 1 },
  tissu: { label: 'Tissu', colors: ['#4b5d7a', '#2c3850'], rough: 0.95, metal: 0 },
  lin: { label: 'Lin', colors: ['#e3d8c3', '#b9aa8d'], rough: 0.95, metal: 0 },
  cuir: { label: 'Cuir', colors: ['#7b3f22', '#3d1d0f'], rough: 0.55, metal: 0 },
  carbone: { label: 'Carbone', colors: ['#2a2c31', '#0d0e10'], rough: 0.3, metal: 0.2 },
  terrazzo: { label: 'Terrazzo', colors: ['#ece7df', '#d26a4d'], rough: 0.4, metal: 0 },
  papier: { label: 'Papier', colors: ['#f7f4ee', '#ddd6c8'], rough: 0.9, metal: 0 },
  liege: { label: 'Liège', colors: ['#b98b5a', '#7a5532'], rough: 0.85, metal: 0 },
  granit: { label: 'Granit', colors: ['#8d8a87', '#2b2a29'], rough: 0.35, metal: 0 },
  brique: { label: 'Brique', colors: ['#a5482f', '#d9cfc2'], rough: 0.85, metal: 0 }
};

// Paramètres : couleurs, échelle, usure (taches), rayures, grain.
export function makeTexture(kind, { size = 512, colors = null, scale = 1, seed = 7, wear = 0, scratches = 0, grain = 0.15 } = {}) {
  const def = TEXTURES[kind] || TEXTURES.bois;
  const [ca, cb] = (colors && colors.length ? colors : def.colors).map(hexRgb);
  const N = makeNoise(seed);
  const S = size;
  const col = makeCanvas(S, S); const hgt = makeCanvas(S, S); const rgh = makeCanvas(S, S);
  const cx = col.getContext('2d'); const hx = hgt.getContext('2d'); const rx = rgh.getContext('2d');
  const ci = cx.createImageData(S, S); const hi = hx.createImageData(S, S); const ri = rx.createImageData(S, S);
  const sc = scale;
  // Motifs à cellules : préparés une fois.
  const cells = [];
  if (kind === 'cuir' || kind === 'terrazzo' || kind === 'granit') {
    const n = kind === 'cuir' ? 220 : kind === 'terrazzo' ? 90 : 600;
    for (let i = 0; i < n * sc * sc; i++) cells.push([N.rnd() * S, N.rnd() * S, N.rnd(), N.rnd()]);
  }
  const tileNoise = (x, y, f, oct = 4) => {
    // Bruit raccordable (bords qui se répètent sans couture).
    const u = x / S; const v = y / S;
    const a = N.fbm(u * f, v * f, oct); const b = N.fbm((u - 1) * f, v * f, oct);
    const c = N.fbm(u * f, (v - 1) * f, oct); const d = N.fbm((u - 1) * f, (v - 1) * f, oct);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };
  const nearest = (x, y) => {
    let d1 = 1e9; let d2 = 1e9; let id = -1;
    for (let i = 0; i < cells.length; i++) {
      let dx = Math.abs(cells[i][0] - x); let dy = Math.abs(cells[i][1] - y);
      dx = Math.min(dx, S - dx); dy = Math.min(dy, S - dy);
      const d = dx * dx + dy * dy;
      if (d < d1) { d2 = d1; d1 = d; id = i; } else if (d < d2) d2 = d;
    }
    return { d1: Math.sqrt(d1), d2: Math.sqrt(d2), id };
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let t = 0; let h = 0.5; let r = def.rough;
    let mixCol = null;
    if (kind === 'bois' || kind === 'noyer') {
      const n = tileNoise(x, y, 4 * sc);
      const ring = (y / S) * 26 * sc + n * 7 + tileNoise(x, y, 1.5 * sc, 2) * 3;
      const f = ring - Math.floor(ring);
      t = clamp(Math.pow(Math.abs(f - 0.5) * 2, 2.2) * 0.85 + tileNoise(x * 0.25, y * 6, 10 * sc, 2) * 0.35, 0, 1);
      h = 0.5 + (0.5 - t) * 0.5; r = def.rough + (t - 0.5) * 0.2;
    } else if (kind === 'marbre' || kind === 'marbreNoir') {
      const n = tileNoise(x, y, 3 * sc, 5);
      const v = Math.abs(Math.sin((x / S + y / S) * Math.PI * 4 * sc + n * 9));
      t = clamp(Math.pow(1 - v, 9) + tileNoise(x, y, 14 * sc, 3) * 0.12, 0, 1);
      h = 0.5 - t * 0.12; r = def.rough + t * 0.15;
    } else if (kind === 'beton') {
      t = tileNoise(x, y, 6 * sc, 5);
      const pit = tileNoise(x, y, 60 * sc, 2) > 0.74 ? 0.6 : 0;
      t = clamp(t * 0.9 + pit * 0.5, 0, 1); h = 0.55 - pit * 0.45 - t * 0.1; r = 0.85 + t * 0.12;
    } else if (kind === 'metal' || kind === 'cuivre') {
      const streak = N.fbm((x / S) * 2 * sc, (y / S) * 260 * sc, 3);
      t = clamp(streak * 0.9 + tileNoise(x, y, 3 * sc, 2) * 0.2, 0, 1); h = 0.5 + (streak - 0.5) * 0.12; r = def.rough + (streak - 0.5) * 0.25;
    } else if (kind === 'tissu' || kind === 'lin') {
      const k = 64 * sc;
      const wx = Math.sin((x / S) * Math.PI * 2 * k); const wy = Math.sin((y / S) * Math.PI * 2 * k);
      const over = ((Math.floor((x / S) * k * 2) + Math.floor((y / S) * k * 2)) % 2) ? wx : wy;
      t = clamp(0.5 + over * 0.3 + (tileNoise(x, y, 30 * sc, 2) - 0.5) * (kind === 'lin' ? 0.8 : 0.4), 0, 1); h = 0.5 + over * 0.35; r = 0.92;
    } else if (kind === 'cuir') {
      const c = nearest(x, y); const edge = clamp((c.d2 - c.d1) / 6, 0, 1);
      t = clamp(1 - edge * 0.8 + tileNoise(x, y, 8 * sc, 3) * 0.3, 0, 1); h = 0.3 + edge * 0.6; r = def.rough + (1 - edge) * 0.25;
    } else if (kind === 'carbone') {
      const k = 24 * sc; const u = (x / S) * k; const v = (y / S) * k;
      const cell = (Math.floor(u) + Math.floor(v / 2)) % 2;
      const along = cell ? u - Math.floor(u) : (v / 2) - Math.floor(v / 2);
      t = clamp(0.25 + Math.sin(along * Math.PI) * 0.6, 0, 1); h = 0.4 + Math.sin(along * Math.PI) * 0.4; r = 0.28 + (1 - t) * 0.2;
    } else if (kind === 'terrazzo') {
      const c = nearest(x, y); const chip = c.d1 < 6 + cells[c.id][2] * 10 * sc;
      t = chip ? 1 : tileNoise(x, y, 20 * sc, 2) * 0.15; h = chip ? 0.52 : 0.5; r = chip ? 0.25 : 0.42;
      if (chip) { const pal = [cb, [40, 52, 66], [220, 170, 60], [120, 140, 120]]; mixCol = pal[Math.floor(cells[c.id][3] * pal.length)]; }
    } else if (kind === 'papier') {
      const fib = N.fbm((x / S) * 80 * sc, (y / S) * 6 * sc, 2);
      t = clamp(tileNoise(x, y, 18 * sc, 4) * 0.6 + fib * 0.25, 0, 1); h = 0.5 + (t - 0.5) * 0.25; r = 0.92;
    } else if (kind === 'liege') {
      const sp = tileNoise(x, y, 90 * sc, 2);
      t = clamp(tileNoise(x, y, 12 * sc, 3) * 0.5 + (sp > 0.62 ? 0.7 : 0), 0, 1); h = 0.5 - (sp > 0.62 ? 0.3 : 0); r = 0.85;
    } else if (kind === 'granit') {
      const c = nearest(x, y); const sp = cells[c.id][2];
      t = clamp(sp > 0.7 ? 1 : sp < 0.25 ? 0 : 0.45 + tileNoise(x, y, 40 * sc, 2) * 0.3, 0, 1); h = 0.5 + (t - 0.5) * 0.08; r = 0.3 + sp * 0.1;
    } else if (kind === 'brique') {
      const bw = S / (4 * sc); const bh = S / (8 * sc);
      const row = Math.floor(y / bh); const off = row % 2 ? bw / 2 : 0;
      const lx = (x + off) % bw; const ly = y % bh;
      const mortar = lx < 5 || ly < 5;
      t = mortar ? 1 : tileNoise(x, y, 10 * sc, 3) * 0.5; h = mortar ? 0.2 : 0.65 + tileNoise(x, y, 30, 2) * 0.1; r = mortar ? 0.95 : 0.8;
      if (!mortar) { const shade = (Math.sin(row * 12.9 + Math.floor((x + off) / bw) * 78.2) * 43758.5) % 1; mixCol = ca.map((v) => clamp(v * (0.82 + Math.abs(shade) * 0.3), 0, 255)); }
    }
    // Usure : taches larges plus claires ; rayures : traits fins ; grain : bruit fin.
    if (wear > 0) { const w = tileNoise(x, y, 5, 3); if (w > 1 - wear * 0.6) { t = lerp(t, 0.15, 0.5); r = lerp(r, 0.95, 0.5); } }
    if (scratches > 0) { const s = N.fbm((x / S) * 400, (y / S) * 3 + x / S * 9, 1); if (s > 1 - scratches * 0.08) { h -= 0.2; r = Math.min(1, r + 0.3); t = lerp(t, 0.9, 0.4); } }
    const g = (N.rnd() - 0.5) * grain * 40;
    const base = mixCol || [lerp(ca[0], cb[0], t), lerp(ca[1], cb[1], t), lerp(ca[2], cb[2], t)];
    const i = (y * S + x) * 4;
    ci.data[i] = clamp(base[0] + g, 0, 255); ci.data[i + 1] = clamp(base[1] + g, 0, 255); ci.data[i + 2] = clamp(base[2] + g, 0, 255); ci.data[i + 3] = 255;
    const hv = clamp(h * 255, 0, 255); hi.data[i] = hv; hi.data[i + 1] = hv; hi.data[i + 2] = hv; hi.data[i + 3] = 255;
    const rv = clamp(r * 255, 0, 255); ri.data[i] = rv; ri.data[i + 1] = rv; ri.data[i + 2] = rv; ri.data[i + 3] = 255;
  }
  cx.putImageData(ci, 0, 0); hx.putImageData(hi, 0, 0); rx.putImageData(ri, 0, 0);
  return { color: col, height: hgt, rough: rgh, normal: normalFromHeight(hi, S, kind === 'metal' || kind === 'cuivre' ? 2 : 4), metal: def.metal, roughness: def.rough };
}
// Carte de normales calculée depuis le relief (filtre de Sobel, bords raccordés).
export function normalFromHeight(img, S, strength = 4) {
  const c = makeCanvas(S, S); const x = c.getContext('2d'); const o = x.createImageData(S, S); const d = img.data;
  const H = (px, py) => d[(((py + S) % S) * S + ((px + S) % S)) * 4] / 255;
  for (let y = 0; y < S; y++) for (let xx = 0; xx < S; xx++) {
    const dx = (H(xx + 1, y - 1) + 2 * H(xx + 1, y) + H(xx + 1, y + 1)) - (H(xx - 1, y - 1) + 2 * H(xx - 1, y) + H(xx - 1, y + 1));
    const dy = (H(xx - 1, y + 1) + 2 * H(xx, y + 1) + H(xx + 1, y + 1)) - (H(xx - 1, y - 1) + 2 * H(xx, y - 1) + H(xx + 1, y - 1));
    let nx = -dx * strength; let ny = -dy * strength; let nz = 1;
    const L = Math.hypot(nx, ny, nz); nx /= L; ny /= L; nz /= L;
    const i = (y * S + xx) * 4;
    o.data[i] = (nx * 0.5 + 0.5) * 255; o.data[i + 1] = (ny * 0.5 + 0.5) * 255; o.data[i + 2] = (nz * 0.5 + 0.5) * 255; o.data[i + 3] = 255;
  }
  x.putImageData(o, 0, 0);
  return c;
}

// ---------- Motifs de remplissage (NEX-DESIGN) ----------
export const PATTERNS = {
  points: 'Pois', grille: 'Quadrillage', lignes: 'Lignes', diagonales: 'Rayures diagonales', carreaux: 'Damier', chevrons: 'Chevrons',
  vagues: 'Vagues', croisillons: 'Croisillons', triangles: 'Triangles', hexagones: 'Hexagones', etoiles: 'Étoiles', trame: 'Trame', grain: 'Grain', papier: 'Papier', bois: 'Bois', marbre: 'Marbre', terrazzo: 'Terrazzo'
};
export function makePattern(kind, { fg = '#6a4cff', bg = '#ffffff', size = 40, opacity = 1 } = {}) {
  if (['papier', 'bois', 'marbre', 'terrazzo'].includes(kind)) {
    const t = makeTexture(kind, { size: 256, colors: [bg, fg] });
    return t.color;
  }
  const s = Math.max(6, Math.round(size));
  const c = makeCanvas(s, s); const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, s, s);
  x.fillStyle = fg; x.strokeStyle = fg; x.globalAlpha = opacity; x.lineWidth = Math.max(1, s / 10); x.lineCap = 'round';
  const line = (a, b, cc, d) => { x.beginPath(); x.moveTo(a, b); x.lineTo(cc, d); x.stroke(); };
  switch (kind) {
    case 'points': x.beginPath(); x.arc(s / 2, s / 2, s / 6, 0, Math.PI * 2); x.fill(); break;
    case 'grille': x.lineWidth = Math.max(1, s / 20); line(0, 0.5, s, 0.5); line(0.5, 0, 0.5, s); break;
    case 'lignes': line(0, s / 2, s, s / 2); break;
    case 'diagonales': line(-s / 2, s / 2, s / 2, -s / 2); line(0, s, s, 0); line(s / 2, s * 1.5, s * 1.5, s / 2); break;
    case 'carreaux': x.fillRect(0, 0, s / 2, s / 2); x.fillRect(s / 2, s / 2, s / 2, s / 2); break;
    case 'chevrons': x.beginPath(); x.moveTo(0, s * 0.7); x.lineTo(s / 2, s * 0.3); x.lineTo(s, s * 0.7); x.stroke(); break;
    case 'vagues': x.beginPath(); for (let i = 0; i <= s; i++) { const yy = s / 2 + Math.sin((i / s) * Math.PI * 2) * s / 5; i ? x.lineTo(i, yy) : x.moveTo(i, yy); } x.stroke(); break;
    case 'croisillons': line(0, 0, s, s); line(s, 0, 0, s); break;
    case 'triangles': x.beginPath(); x.moveTo(s / 2, s * 0.18); x.lineTo(s * 0.85, s * 0.8); x.lineTo(s * 0.15, s * 0.8); x.closePath(); x.fill(); break;
    case 'hexagones': x.lineWidth = Math.max(1, s / 18); x.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i + Math.PI / 6; const px = s / 2 + Math.cos(a) * s * 0.42; const py = s / 2 + Math.sin(a) * s * 0.42; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.closePath(); x.stroke(); break;
    case 'etoiles': x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const r = i % 2 ? s * 0.14 : s * 0.32; const px = s / 2 + Math.cos(a) * r; const py = s / 2 + Math.sin(a) * r; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.closePath(); x.fill(); break;
    case 'trame': { const r = s * 0.22; for (const [px, py] of [[0, 0], [s, 0], [0, s], [s, s], [s / 2, s / 2]]) { x.beginPath(); x.arc(px, py, r * (px === s / 2 ? 1 : 0.7), 0, Math.PI * 2); x.fill(); } break; }
    case 'grain': { const id = x.getImageData(0, 0, s, s); const [r, g, b] = hexRgb(fg); for (let i = 0; i < id.data.length; i += 4) { if (Math.random() < 0.35) { id.data[i] = r; id.data[i + 1] = g; id.data[i + 2] = b; id.data[i + 3] = 255 * opacity * Math.random(); } } x.putImageData(id, 0, 0); break; }
    default: break;
  }
  return c;
}

// ---------- Formes vectorielles (boîte 100 × 100) ----------
export const SHAPES = {
  etoile4: ['Étoile à 4 branches', 'M50 0 L61 39 L100 50 L61 61 L50 100 L39 61 L0 50 L39 39 Z'],
  etoile6: ['Étoile à 6 branches', 'M50 0 L62 29 L93 25 L74 50 L93 75 L62 71 L50 100 L38 71 L7 75 L26 50 L7 25 L38 29 Z'],
  eclat: ['Éclat', 'M50 0 L58 30 L85 10 L70 40 L100 45 L72 58 L92 85 L62 72 L55 100 L45 72 L15 92 L30 62 L0 55 L30 42 L10 15 L40 30 Z'],
  sceau: ['Sceau dentelé', 'M50 2 L57 10 L67 6 L71 16 L82 15 L82 26 L92 30 L88 40 L96 48 L88 56 L92 66 L82 70 L82 81 L71 80 L67 90 L57 86 L50 94 L43 86 L33 90 L29 80 L18 81 L18 70 L8 66 L12 56 L4 48 L12 40 L8 30 L18 26 L18 15 L29 16 L33 6 L43 10 Z'],
  fleche2: ['Flèche double', 'M0 50 L22 28 L22 40 L78 40 L78 28 L100 50 L78 72 L78 60 L22 60 L22 72 Z'],
  flecheCourbe: ['Flèche courbe', 'M10 80 C10 40 40 20 72 20 L72 6 L96 30 L72 54 L72 40 C50 40 30 52 30 80 Z'],
  chevron: ['Chevron', 'M0 10 L60 10 L100 50 L60 90 L0 90 L40 50 Z'],
  bulleRonde: ['Bulle ronde', 'M50 6 C77 6 96 23 96 44 C96 65 77 82 50 82 C44 82 39 81 34 80 L14 94 L19 74 C9 66 4 56 4 44 C4 23 23 6 50 6 Z'],
  nuage: ['Nuage', 'M26 80 C12 80 4 70 4 60 C4 48 14 40 25 41 C26 26 38 16 52 16 C66 16 76 25 79 37 C91 38 98 48 98 59 C98 71 89 80 77 80 Z'],
  goutte: ['Goutte', 'M50 2 C50 2 86 44 86 64 C86 84 70 98 50 98 C30 98 14 84 14 64 C14 44 50 2 50 2 Z'],
  eclair: ['Éclair', 'M58 0 L18 56 L46 56 L38 100 L84 38 L54 38 L66 0 Z'],
  croissant: ['Croissant', 'M62 4 C36 10 18 30 18 54 C18 80 40 98 66 98 C78 98 88 94 96 86 C86 90 76 90 66 86 C46 78 36 60 38 40 C40 22 50 10 62 4 Z'],
  ruban: ['Ruban', 'M0 25 L100 25 L88 50 L100 75 L0 75 L12 50 Z'],
  etiquette: ['Étiquette', 'M30 10 L96 10 L96 90 L30 90 L4 50 Z M26 44 A6 6 0 1 0 26 56 A6 6 0 1 0 26 44 Z'],
  losange: ['Losange', 'M50 0 L100 50 L50 100 L0 50 Z'],
  octogone: ['Octogone', 'M30 0 L70 0 L100 30 L100 70 L70 100 L30 100 L0 70 L0 30 Z'],
  anneau: ['Anneau', 'M50 0 A50 50 0 1 1 49.9 0 Z M50 24 A26 26 0 1 0 50.1 24 Z'],
  demiCercle: ['Demi-cercle', 'M0 75 A50 50 0 0 1 100 75 Z'],
  croix: ['Croix', 'M35 0 L65 0 L65 35 L100 35 L100 65 L65 65 L65 100 L35 100 L35 65 L0 65 L0 35 L35 35 Z'],
  blob1: ['Forme organique', 'M52 4 C74 2 96 18 96 44 C96 68 84 96 54 96 C26 96 4 80 4 54 C4 28 28 6 52 4 Z'],
  blob2: ['Forme fluide', 'M60 6 C82 10 98 30 92 54 C86 78 66 98 40 92 C16 86 2 66 8 42 C14 18 36 2 60 6 Z'],
  arche: ['Arche', 'M8 100 L8 46 C8 22 27 4 50 4 C73 4 92 22 92 46 L92 100 Z']
};

// ---------- Cadres photo (forme de découpe, boîte 100 × 100) ----------
export const FRAMES = {
  cercle: ['Cercle', 'M50 0 A50 50 0 1 1 49.99 0 Z'],
  arrondi: ['Carré arrondi', 'M16 0 H84 Q100 0 100 16 V84 Q100 100 84 100 H16 Q0 100 0 84 V16 Q0 0 16 0 Z'],
  arche: ['Arche', SHAPES.arche[1]],
  blob: ['Forme organique', SHAPES.blob1[1]],
  hexagone: ['Hexagone', 'M25 4 L75 4 L100 50 L75 96 L25 96 L0 50 Z'],
  etoile: ['Étoile', 'M50 0 L62 36 L100 38 L70 60 L80 98 L50 76 L20 98 L30 60 L0 38 L38 36 Z'],
  coeur: ['Cœur', 'M50 92 C20 70 2 52 2 30 C2 14 14 4 28 4 C38 4 46 10 50 18 C54 10 62 4 72 4 C86 4 98 14 98 30 C98 52 80 70 50 92 Z'],
  goutte: ['Goutte', SHAPES.goutte[1]],
  diagonale: ['Diagonale', 'M20 0 H100 L80 100 H0 Z'],
  polaroid: ['Polaroïd', 'M6 6 H94 V76 H6 Z'],
  telephone: ['Écran de téléphone', 'M14 0 H86 Q100 0 100 14 V86 Q100 100 86 100 H14 Q0 100 0 86 V14 Q0 0 14 0 Z']
};
export const GRIDS = {
  deux: ['2 colonnes', [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]]],
  trois: ['3 colonnes', [[0, 0, 1 / 3, 1], [1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 1 / 3, 1]]],
  quatre: ['2 × 2', [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]]],
  unDeux: ['1 + 2', [[0, 0, 0.6, 1], [0.6, 0, 0.4, 0.5], [0.6, 0.5, 0.4, 0.5]]],
  unTrois: ['1 + 3', [[0, 0, 1, 0.6], [0, 0.6, 1 / 3, 0.4], [1 / 3, 0.6, 1 / 3, 0.4], [2 / 3, 0.6, 1 / 3, 0.4]]],
  mosaique: ['Mosaïque', [[0, 0, 0.5, 0.62], [0.5, 0, 0.5, 0.38], [0.5, 0.38, 0.5, 0.62], [0, 0.62, 0.5, 0.38]]]
};

// ---------- Autocollants (SVG vectoriels, recolorables) ----------
export const STICKERS = {
  nouveau: 'Nouveau', promo: 'Promo', top: 'Top vente', gratuit: 'Gratuit', exclusif: 'Exclusif', bientot: 'Bientôt',
  merci: 'Merci', note: 'Note 5 étoiles', valide: 'Validé', prix: 'Prix', coeur: 'Coup de cœur', ruban: 'Ruban'
};
export function stickerSvg(kind, { c1 = '#6a4cff', c2 = '#ffcc00', text = '' } = {}) {
  const ink = inkOn(c1); const ink2 = inkOn(c2);
  const T = (t, y, size, fill, w = 900) => `<text x="100" y="${y}" text-anchor="middle" font-family="Inter, Segoe UI, Arial, sans-serif" font-weight="${w}" font-size="${size}" fill="${fill}">${esc(t)}</text>`;
  const star = (cx, cy, r, f) => { let d = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const rr = i % 2 ? r * 0.45 : r; d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)} `; } return `<path d="${d}Z" fill="${f}"/>`; };
  const burst = (r1, r2, n, f) => { let d = ''; for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n; const rr = i % 2 ? r2 : r1; d += `${i ? 'L' : 'M'}${(100 + Math.cos(a) * rr).toFixed(1)} ${(100 + Math.sin(a) * rr).toFixed(1)} `; } return `<path d="${d}Z" fill="${f}"/>`; };
  let body = '';
  switch (kind) {
    case 'nouveau': body = `${burst(96, 80, 18, c1)}${T(text || 'NOUVEAU', 112, 34, ink)}`; break;
    case 'promo': body = `<circle cx="100" cy="100" r="92" fill="${c2}"/><circle cx="100" cy="100" r="80" fill="none" stroke="${ink2}" stroke-width="3" stroke-dasharray="6 6"/>${T(text || '−20 %', 112, 52, ink2)}${T('PROMO', 146, 20, ink2, 800)}`; break;
    case 'top': body = `<path d="M100 8 L188 56 V144 L100 192 L12 144 V56 Z" fill="${c1}"/>${star(100, 70, 26, c2)}${T(text || 'TOP VENTE', 135, 26, ink)}`; break;
    case 'gratuit': body = `<rect x="10" y="60" width="180" height="80" rx="40" fill="${c1}"/>${T(text || 'GRATUIT', 113, 36, ink)}`; break;
    case 'exclusif': body = `<rect x="14" y="54" width="172" height="92" rx="14" fill="${c1}" transform="rotate(-8 100 100)"/><rect x="22" y="62" width="156" height="76" rx="10" fill="none" stroke="${ink}" stroke-width="3" transform="rotate(-8 100 100)"/><g transform="rotate(-8 100 100)">${T(text || 'EXCLUSIF', 113, 32, ink)}</g>`; break;
    case 'bientot': body = `<circle cx="100" cy="100" r="90" fill="${c1}"/><circle cx="100" cy="74" r="22" fill="none" stroke="${ink}" stroke-width="6"/><path d="M100 62 V75 L108 82" stroke="${ink}" stroke-width="6" fill="none" stroke-linecap="round"/>${T(text || 'BIENTÔT', 136, 28, ink)}`; break;
    case 'merci': body = `<path d="M100 178 C40 136 10 104 10 66 C10 38 32 18 58 18 C76 18 92 28 100 42 C108 28 124 18 142 18 C168 18 190 38 190 66 C190 104 160 136 100 178 Z" fill="${c1}"/>${T(text || 'MERCI', 98, 34, ink)}`; break;
    case 'note': body = `<rect x="8" y="62" width="184" height="76" rx="38" fill="${c1}"/>${[40, 70, 100, 130, 160].map((x) => star(x, 100, 15, c2)).join('')}`; break;
    case 'valide': body = `<circle cx="100" cy="100" r="88" fill="${c1}"/><path d="M60 102 L88 130 L142 74" stroke="${ink}" stroke-width="16" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`; break;
    case 'prix': body = `<path d="M60 20 H180 V180 H60 L12 100 Z" fill="${c2}"/><circle cx="48" cy="100" r="9" fill="${inkOn(c2) === '#ffffff' ? '#ffffff' : '#14151a'}" opacity=".35"/>${T(text || '9,99 €', 112, 38, ink2)}`; break;
    case 'coeur': body = `${burst(94, 84, 24, c2)}<path d="M100 150 C62 124 44 104 44 82 C44 66 56 54 72 54 C84 54 94 60 100 70 C106 60 116 54 128 54 C144 54 156 66 156 82 C156 104 138 124 100 150 Z" fill="${c1}"/>`; break;
    case 'ruban': body = `<path d="M6 70 H194 L178 100 L194 130 H6 L22 100 Z" fill="${c1}"/>${T(text || 'ÉDITION LIMITÉE', 108, 22, ink)}`; break;
    default: body = `<circle cx="100" cy="100" r="90" fill="${c1}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">${body}</svg>`;
}

// ---------- Modèles de départ (positions relatives à la page, adaptés à tout format) ----------
// Chaque élément : rect, ellipse, text, frame (cadre photo), shape (forme), sticker, logo.
export const TEMPLATES = {
  promo: { label: 'Publication promo', format: 'post', usage: 'Réseaux sociaux' },
  story: { label: 'Story lancement', format: 'story', usage: 'Réseaux sociaux' },
  citation: { label: 'Citation', format: 'portrait', usage: 'Réseaux sociaux' },
  youtube: { label: 'Miniature YouTube', format: 'yt', usage: 'Vidéo' },
  linkedin: { label: 'Bannière LinkedIn', format: 'banner', usage: 'Professionnel' },
  carte: { label: 'Carte de visite', format: 'card', usage: 'Impression' },
  affiche: { label: 'Affiche événement', format: 'a4', usage: 'Impression' },
  flyer: { label: 'Flyer produit', format: 'flyer', usage: 'Impression' },
  appli: { label: 'Présentation d’appli', format: 'hd', usage: 'Présentation' },
  partage: { label: 'Image de partage (lien)', format: 'og', usage: 'Web' },
  soldes: { label: 'Soldes', format: 'post', usage: 'Réseaux sociaux' },
  recrute: { label: 'On recrute', format: 'portrait', usage: 'Professionnel' }
};
export function templateSpec(id, brand) {
  const [c1, c2, c3, dark, light] = brand.colors;
  const tf = brand.fonts.title; const bf = brand.fonts.body; const name = brand.name || 'Ma marque';
  const t = (text, x, y, w, size, o = {}) => ({ type: 'text', text, x, y, w, size, font: o.font || tf, weight: o.weight ?? 800, color: o.color || dark, align: o.align || 'left', lh: o.lh || 1.05, spacing: o.spacing || 0 });
  switch (id) {
    case 'promo': return { bg: light, items: [{ type: 'ellipse', x: 0.52, y: -0.18, w: 0.8, h: 0.8, fill: c1 }, { type: 'frame', shape: 'cercle', x: 0.5, y: 0.08, w: 0.46, h: 0.46 }, t('Nouvelle collection', 0.08, 0.6, 0.8, 0.085), t('Jusqu’à −30 % cette semaine seulement.', 0.08, 0.8, 0.7, 0.04, { font: bf, weight: 400 }), { type: 'sticker', kind: 'promo', x: 0.08, y: 0.1, w: 0.26, h: 0.26, c1, c2: c3 }, { type: 'logo', x: 0.78, y: 0.88, w: 0.14, h: 0.08 }] };
    case 'story': return { bg: c1, items: [{ type: 'rect', x: 0.06, y: 0.05, w: 0.88, h: 0.56, fill: light, r: 0.06 }, { type: 'frame', shape: 'telephone', x: 0.1, y: 0.07, w: 0.8, h: 0.52 }, t('C’est le jour J', 0.08, 0.66, 0.84, 0.1, { color: inkOn(c1) }), t('Découvrez la nouveauté dans le lien.', 0.08, 0.84, 0.84, 0.042, { font: bf, weight: 400, color: inkOn(c1) }), { type: 'shape', shape: 'flecheCourbe', x: 0.72, y: 0.9, w: 0.16, h: 0.08, fill: c3 }] };
    case 'citation': return { bg: dark, items: [t('“', 0.08, 0.06, 0.3, 0.28, { color: c1, font: 'NX Playfair' }), t('La simplicité est la sophistication suprême.', 0.08, 0.3, 0.84, 0.085, { color: light, font: 'NX Playfair', weight: 700, lh: 1.15 }), { type: 'rect', x: 0.08, y: 0.76, w: 0.12, h: 0.008, fill: c1 }, t('Léonard de Vinci', 0.08, 0.8, 0.8, 0.04, { color: light, font: bf, weight: 500 }), { type: 'logo', x: 0.78, y: 0.9, w: 0.14, h: 0.06 }] };
    case 'youtube': return { bg: c1, items: [{ type: 'frame', shape: 'arrondi', x: 0.52, y: 0.1, w: 0.44, h: 0.8 }, t('5 ASTUCES', 0.05, 0.14, 0.5, 0.16, { color: inkOn(c1), weight: 900 }), t('que personne ne vous dit', 0.05, 0.5, 0.45, 0.075, { color: inkOn(c1) }), { type: 'sticker', kind: 'nouveau', x: 0.4, y: 0.66, w: 0.16, h: 0.28, c1: c3, c2: c2 }] };
    case 'linkedin': return { bg: light, items: [{ type: 'rect', x: 0, y: 0, w: 0.36, h: 1, fill: c1 }, { type: 'shape', shape: 'blob1', x: 0.22, y: 0.2, w: 0.24, h: 0.6, fill: c2 }, t(name, 0.42, 0.28, 0.54, 0.16), t('Design, produit et croissance.', 0.42, 0.58, 0.54, 0.08, { font: bf, weight: 400 })] };
    case 'carte': return { bg: light, items: [{ type: 'rect', x: 0, y: 0, w: 0.34, h: 1, fill: c1 }, { type: 'logo', x: 0.05, y: 0.36, w: 0.24, h: 0.28 }, t('Camille Martin', 0.4, 0.2, 0.56, 0.1), t('Directrice artistique', 0.4, 0.36, 0.56, 0.055, { font: bf, weight: 500, color: c1 }), t('06 12 34 56 78\ncamille@marque.fr\nmarque.fr', 0.4, 0.56, 0.56, 0.05, { font: bf, weight: 400, lh: 1.4 })] };
    case 'affiche': return { bg: c1, items: [{ type: 'ellipse', x: -0.2, y: 0.42, w: 0.9, h: 0.6, fill: c2 }, { type: 'ellipse', x: 0.4, y: -0.1, w: 0.8, h: 0.5, fill: c3 }, t('FESTIVAL\nD’ÉTÉ', 0.07, 0.08, 0.86, 0.14, { color: inkOn(c1), weight: 900, lh: 0.95 }), t('12 — 14 juillet', 0.07, 0.42, 0.8, 0.05, { color: inkOn(c1), font: bf }), { type: 'frame', shape: 'arche', x: 0.3, y: 0.52, w: 0.6, h: 0.4 }, { type: 'logo', x: 0.07, y: 0.9, w: 0.18, h: 0.06 }] };
    case 'flyer': return { bg: light, items: [{ type: 'frame', shape: 'blob', x: 0.12, y: 0.06, w: 0.76, h: 0.5 }, t('Le produit qu’il vous faut', 0.08, 0.6, 0.84, 0.075, { align: 'center' }), t('Simple, rapide et pensé pour vous.', 0.08, 0.77, 0.84, 0.035, { font: bf, weight: 400, align: 'center' }), { type: 'rect', x: 0.32, y: 0.86, w: 0.36, h: 0.06, fill: c1, r: 0.5 }, t('Commander', 0.32, 0.873, 0.36, 0.03, { color: inkOn(c1), align: 'center', font: bf, weight: 700 })] };
    case 'appli': return { bg: dark, items: [{ type: 'ellipse', x: 0.55, y: -0.3, w: 0.7, h: 1.3, fill: c1 }, t(name, 0.06, 0.18, 0.5, 0.05, { color: c3, font: bf, weight: 700 }), t('Votre appli,\npartout.', 0.06, 0.28, 0.5, 0.12, { color: light, lh: 1 }), t('Disponible sur Android et sur le Web.', 0.06, 0.6, 0.44, 0.035, { color: light, font: bf, weight: 400 }), { type: 'frame', shape: 'telephone', x: 0.6, y: 0.1, w: 0.22, h: 0.82 }] };
    case 'partage': return { bg: c1, items: [{ type: 'rect', x: 0.04, y: 0.07, w: 0.92, h: 0.86, fill: light, r: 0.04 }, t(name, 0.1, 0.18, 0.8, 0.06, { color: c1, font: bf, weight: 700 }), t('Le titre de votre article ou de votre page', 0.1, 0.32, 0.6, 0.1), { type: 'logo', x: 0.78, y: 0.76, w: 0.14, h: 0.12 }] };
    case 'soldes': return { bg: c2, items: [{ type: 'shape', shape: 'sceau', x: 0.18, y: 0.12, w: 0.64, h: 0.64, fill: c3 }, t('SOLDES', 0.1, 0.32, 0.8, 0.16, { align: 'center', weight: 900, color: inkOn(c3) }), t('−50 %', 0.1, 0.5, 0.8, 0.1, { align: 'center', color: inkOn(c3) }), t('Sur une sélection d’articles', 0.1, 0.84, 0.8, 0.045, { align: 'center', color: inkOn(c2), font: bf, weight: 500 })] };
    case 'recrute': return { bg: light, items: [{ type: 'rect', x: 0, y: 0, w: 1, h: 0.42, fill: c1 }, t('ON RECRUTE', 0.08, 0.12, 0.84, 0.1, { color: inkOn(c1), weight: 900 }), t('Développeur ou développeuse front-end', 0.08, 0.5, 0.84, 0.065), t('CDI · Télétravail possible · Paris', 0.08, 0.7, 0.84, 0.04, { font: bf, weight: 400, color: c1 }), { type: 'logo', x: 0.08, y: 0.86, w: 0.2, h: 0.08 }] };
    default: return { bg: light, items: [] };
  }
}
export function shade(hex, k) { return k >= 0 ? mixHex(hex, '#ffffff', k) : mixHex(hex, '#000000', -k); }
export { rgbHex };
