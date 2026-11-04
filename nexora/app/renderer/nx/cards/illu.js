// NEXORA #033 : illustrations de fond des cartes (application Windows, version web et back office).
// Chaque carte reçoit une composition dessinée à la volée en SVG, sans image : anneau, creux, ticket,
// éclat, méandre, boucle, pilules, onde, soleil ou trame, plus parfois un petit accent. Le tirage
// change à chaque lancement (graine de session) et reste le même pour une carte pendant la session ;
// deux cartes voisines n'ont jamais le même motif ni la même teinte (sauf teinte imposée).
// Lisibilité (#007) : les textes et icônes de la carte sont mesurés. Une forme posée sous un texte
// prend la teinte la plus vive qui garde le contraste AA (4,5:1 ; 3:1 pour les grands textes et les
// icônes), sinon elle est écartée ; plusieurs placements sont essayés et le plus lisible est gardé.
// Teintes : variables CSS --nxi-s (douce), --nxi-m (moyenne), --nxi-d (vive), --nxi-a (vive, autre
// couleur), posées par cards.css selon data-nxi-tone et le thème.
// Module autonome (aucune dépendance) : importé aussi par le back office (admin/src/ui.tsx).

const TAU = Math.PI * 2;
const HALF = Math.PI / 2;
const f = (n) => Math.round(n * 10) / 10;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (r, a, b) => a + (b - a) * r();
const rint = (r, a, b) => Math.floor(rnd(r, a, b + 1 - 1e-9));
const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];

export function hash(s) {
  let h = 2166136261 >>> 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Générateur pseudo-aléatoire (mulberry32) : même graine, même dessin.
export function rng(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, r) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Graine de la session : un nouveau tirage à chaque lancement.
export const SESSION = (() => {
  try { const b = new Uint32Array(2); crypto.getRandomValues(b); return b[0].toString(36) + b[1].toString(36); }
  catch { return Math.random().toString(36).slice(2); }
})();

export const TONES = ['bleu', 'violet', 'rose', 'corail', 'orange', 'jaune', 'menthe', 'turquoise'];
export const KINDS = ['anneau', 'creux', 'ticket', 'eclat', 'meandre', 'boucle', 'pilules', 'onde', 'soleil', 'trame'];

// ---------- Tracés : arcs convertis en courbes de Bézier, pour transformer des points seulement ----------
class Path {
  constructor(map) { this.map = map || ((x, y) => [x, y]); this.d = ''; }
  pt(x, y) { const p = this.map(x, y); return `${f(p[0])} ${f(p[1])}`; }
  M(x, y) { this.d += `M${this.pt(x, y)}`; return this; }
  L(x, y) { this.d += `L${this.pt(x, y)}`; return this; }
  C(a, b, c, d, x, y) { this.d += `C${this.pt(a, b)} ${this.pt(c, d)} ${this.pt(x, y)}`; return this; }
  Z() { this.d += 'Z'; return this; }
  arc(cx, cy, rad, a0, a1, move) {
    const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / HALF - 1e-9));
    const da = (a1 - a0) / n, k = (4 / 3) * Math.tan(da / 4);
    let x = cx + rad * Math.cos(a0), y = cy + rad * Math.sin(a0);
    if (move) this.M(x, y); else this.L(x, y);
    for (let i = 0; i < n; i++) {
      const t0 = a0 + i * da, t1 = t0 + da;
      const x1 = cx + rad * Math.cos(t1), y1 = cy + rad * Math.sin(t1);
      this.C(x - k * rad * Math.sin(t0), y + k * rad * Math.cos(t0), x1 + k * rad * Math.sin(t1), y1 - k * rad * Math.cos(t1), x1, y1);
      x = x1; y = y1;
    }
    return this;
  }
  circle(cx, cy, rad) { return this.arc(cx, cy, rad, 0, TAU, true).Z(); }
  rrect(x, y, w, h, rx) {
    rx = Math.min(rx, w / 2, h / 2);
    return this.M(x + rx, y).L(x + w - rx, y).arc(x + w - rx, y + rx, rx, -HALF, 0)
      .L(x + w, y + h - rx).arc(x + w - rx, y + h - rx, rx, 0, HALF)
      .L(x + rx, y + h).arc(x + rx, y + h - rx, rx, HALF, Math.PI)
      .L(x, y + rx).arc(x + rx, y + rx, rx, Math.PI, Math.PI * 1.5).Z();
  }
  // Courbe lisse passant par les points (Catmull-Rom).
  smooth(pts, move = true) {
    if (move) this.M(pts[0][0], pts[0][1]); else this.L(pts[0][0], pts[0][1]);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      this.C(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
    }
    return this;
  }
}

// Repère local : la forme s'appuie sur le bord droit (x = W), y de 0 à H ; puis bord choisi et miroir.
// short : bord court de préférence (bande verticale sur une carte en largeur, comme les affiches).
function frame(r, w, h, edges, short) {
  if (short) edges = w >= h * 1.4 ? ['right', 'right', 'left'] : w >= h ? ['right', 'right', 'left', 'bottom'] : ['bottom', 'bottom', 'top', 'right'];
  const e = pick(r, edges), flip = r() < 0.5;
  if (e === 'right') return { W: w, H: h, map: (x, y) => [x, flip ? h - y : y] };
  if (e === 'left') return { W: w, H: h, map: (x, y) => [w - x, flip ? h - y : y] };
  if (e === 'bottom') return { W: h, H: w, map: (x, y) => [flip ? w - y : y, x] };
  return { W: h, H: w, map: (x, y) => [flip ? w - y : y, h - x] };
}

// Point d'ancrage sur le pourtour (de préférence à droite, côté opposé aux textes), un peu en dehors.
function edgePoint(r, w, h, out) {
  const s = r(), t = r(), o = rnd(r, -0.25, 1) * out;
  if (s < 0.4) return [w + o, t * h];
  if (s < 0.62) return [t * w, h + o];
  if (s < 0.86) return [t * w, -o];
  return [-o, t * h];
}

const fill = (d, lvl, o = {}) => ({ d, mode: 'fill', lvl, ...o });
const line = (d, lvl, sw, o = {}) => ({ d, mode: 'stroke', lvl, sw, ...o });
const lv = (r) => (r() < 0.5 ? 'd' : 'm');
// Remplissage en dégradé de deux couleurs vives, parfois (comme les rubans des références).
function tint(r, lvl, x1, y1, x2, y2) {
  if (lvl === 'd' && r() < 0.4) return { grad: { x1, y1, x2, y2, stops: [['d', 0, 1], ['a', 1, 1]] } };
  return { lvl };
}

// Arc mineur de (x0, y0) à (x1, y1) dont le centre est du côté opposé à la forme : bord concave.
function concave(p, x0, y0, x1, y1, k) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, rad = (L / 2) * k;
  const m = Math.sqrt(Math.max(0, rad * rad - (L / 2) ** 2));
  const cx = (x0 + x1) / 2 - (dy / L) * m, cy = (y0 + y1) / 2 + (dx / L) * m;
  const a0 = Math.atan2(y0 - cy, x0 - cx);
  let da = Math.atan2(y1 - cy, x1 - cx) - a0;
  while (da > Math.PI) da -= TAU;
  while (da < -Math.PI) da += TAU;
  p.arc(cx, cy, rad, a0, a0 + da, false);
}

// ---------- Motifs principaux ----------
const MOTIFS = {
  // Anneau épais, plein, « de progression » (piste douce et arc arrondi) ou avec une pastille.
  anneau(r, w, h) {
    const M = Math.min(w, h), R = M * rnd(r, 0.46, 0.9), th = R * rnd(r, 0.3, 0.48), ri = R - th;
    const [cx, cy] = edgePoint(r, w, h, R * 0.6);
    const ring = new Path().circle(cx, cy, R).circle(cx, cy, ri).d;
    const v = r(), out = [];
    if (v < 0.4) out.push(fill(ring, 0, { rule: 'evenodd', main: true, ...tint(r, lv(r), cx - R, cy - R, cx + R, cy + R) }));
    else if (v < 0.75) {
      const a0 = r() * TAU, span = rnd(r, 0.4, 0.8) * TAU;
      out.push(fill(ring, 's', { rule: 'evenodd', main: true }));
      out.push(line(new Path().arc(cx, cy, ri + th / 2, a0, a0 + span, true).d, pick(r, ['d', 'a']), th * rnd(r, 0.55, 1), { main: true }));
    } else {
      out.push(fill(ring, lv(r), { rule: 'evenodd', main: true }));
      const a = r() * TAU, dr = ri * rnd(r, 0, 0.35);
      out.push(fill(new Path().circle(cx + dr * Math.cos(a), cy + dr * Math.sin(a), ri * rnd(r, 0.3, 0.5)).d, 'a'));
    }
    if (r() < 0.3) out.unshift(line(new Path().circle(cx, cy, R + th * rnd(r, 0.35, 0.6)).d, 's', Math.max(2, th * 0.16)));
    return out;
  },

  // Creux : bande au bord d'une carte, entaillée par deux grands cercles qui se rejoignent en pointe.
  creux(r, w, h) {
    const F = frame(r, w, h, null, true);
    const { W, H } = F, E = W + 4;
    const px = W * rnd(r, 0.34, 0.66), py = H * rnd(r, 0.3, 0.7);
    const yT = H * rnd(r, -0.25, 0.08), yB = H * rnd(r, 0.92, 1.25);
    const k1 = rnd(r, 1.18, 2.1), k2 = rnd(r, 1.18, 2.1);
    const shape = (ox) => {
      const p = new Path(F.map).M(E, yT);
      concave(p, E, yT, px + ox, py, k1);
      concave(p, px + ox, py, E, yB, k2);
      return p.L(E, yB).Z().d;
    };
    const out = [];
    if (r() < 0.45) out.push(fill(shape(-W * rnd(r, 0.07, 0.15)), 's'));
    const [x1, y1] = F.map(px, py), [x2, y2] = F.map(E, H / 2);
    out.push(fill(shape(0), 0, { main: true, ...tint(r, lv(r), x1, y1, x2, y2) }));
    if (r() < 0.45) {
      const rad = H * rnd(r, 0.04, 0.08);
      out.push(fill(new Path(F.map).circle(px - rad * rnd(r, 1.8, 3), py, rad).d, 'a'));
    }
    return out;
  },

  // Ticket : dalle à coins rentrants, parfois une encoche et une ligne de perforations.
  ticket(r, w, h) {
    const F = frame(r, w, h, null, true);
    const { W, H } = F, E = W + 4;
    const x0 = W * rnd(r, 0.5, 0.76), y0 = H * rnd(r, -0.12, 0.3), y1 = H * rnd(r, 0.72, 1.12);
    const q = Math.max(6, Math.min(E - x0, y1 - y0) * rnd(r, 0.14, 0.3));
    const p = new Path(F.map).M(E, y0).L(x0 + q, y0).arc(x0, y0, q, 0, HALF);
    if (r() < 0.55 && y1 - y0 > 4.5 * q) {
      const ym = (y0 + y1) / 2 + (r() - 0.5) * (y1 - y0) * 0.2, b = q * rnd(r, 0.6, 1);
      p.L(x0, ym - b).arc(x0, ym, b, -HALF, HALF);
    }
    p.L(x0, y1 - q).arc(x0, y1, q, -HALF, 0).L(E, y1).Z();
    if (r() < 0.5) {
      const xp = x0 + (E - x0) * rnd(r, 0.25, 0.45), rr = Math.max(2, q * 0.2), step = rr * rnd(r, 3, 4.2);
      for (let y = y0 + q + step; y < y1 - q - rr; y += step) p.circle(xp, y, rr);
    }
    const out = [];
    if (r() < 0.35) {
      const g = (E - x0) * rnd(r, 0.12, 0.22);
      out.push(fill(new Path(F.map).rrect(x0 - g, y0 + q * 0.6, E - x0 + g + 8, y1 - y0 - q * 1.2, q).d, 's'));
    }
    const [a1, b1] = F.map(x0, y0), [a2, b2] = F.map(E, y1);
    out.push(fill(p.d, 0, { rule: 'evenodd', main: true, ...tint(r, lv(r), a1, b1, a2, b2) }));
    return out;
  },

  // Éclat : roue dentée irrégulière ou étoile, aux angles adoucis.
  eclat(r, w, h) {
    const M = Math.min(w, h), R = M * rnd(r, 0.42, 0.8);
    const [cx, cy] = edgePoint(r, w, h, R * 0.55);
    const n = rint(r, 7, 13), k = rnd(r, 0.6, 0.78), rot = r() * TAU, s = Math.PI / n, blunt = r() < 0.6;
    const star = (scale) => {
      const p = new Path();
      let first = true;
      const put = (a, rr) => { const x = cx + rr * scale * Math.cos(a), y = cy + rr * scale * Math.sin(a); if (first) { p.M(x, y); first = false; } else p.L(x, y); };
      const g = rng(hash(`${cx}|${cy}|${n}`));
      for (let i = 0; i < n; i++) {
        const a = rot + i * 2 * s, Ri = R * rnd(g, 0.86, 1.06);
        if (blunt) { const t = s * rnd(g, 0.34, 0.52); put(a - t, Ri); put(a + t, Ri); put(a + s, R * k); }
        else { put(a, Ri); put(a + s, R * k); }
      }
      return p.Z().d;
    };
    const out = [];
    if (r() < 0.3) out.push({ d: star(1.16), mode: 'both', sw: R * 0.06, lvl: 's' });
    out.push({ d: star(1), mode: 'both', sw: R * 0.05, main: true, ...tint(r, lv(r), cx - R, cy - R, cx + R, cy + R) });
    if (r() < 0.35) out.push(fill(new Path().circle(cx, cy, R * k * rnd(r, 0.28, 0.45)).d, 'a'));
    return out;
  },

  // Méandre : gros trait arrondi en épingles, comme un ruban posé en zigzag.
  meandre(r, w, h) {
    const M = Math.min(w, h), sw = clamp(M * rnd(r, 0.09, 0.15), 7, 30), rho = sw * rnd(r, 0.95, 1.2);
    const A = Math.max(rho * 2.2, M * rnd(r, 0.26, 0.48)), span = Math.hypot(w, h) * rnd(r, 0.45, 1.15);
    const th = r() * Math.PI, c = Math.cos(th), s = Math.sin(th);
    const qx = rnd(r, 0.2, 1.05) * w, qy = rnd(r, -0.05, 1.05) * h;
    const map = (u, v) => [qx + (u - span / 2) * c - v * s, qy + (u - span / 2) * s + v * c];
    const build = (m) => {
      const g = rng(hash(`${qx}|${qy}|${span}`)), p = new Path(m);
      let u = 0, v = rnd(g, -A, A) * 0.5, dir = g() < 0.5 ? 1 : -1;
      p.M(u, v);
      while (u < span) {
        let t = clamp(v + dir * rnd(g, 0.9, 2) * A, -A, A);
        if (Math.abs(t - v) < A * 0.6) t = v + dir * A * 0.6;
        p.L(u, t); v = t;
        p.arc(u + rho, v, rho, Math.PI, dir > 0 ? 0 : TAU);
        u += 2 * rho; dir = -dir;
      }
      return p.L(u, v + dir * A * 0.5).d;
    };
    const out = [];
    if (r() < 0.35) { const o = sw * rnd(r, 0.45, 0.7); out.push(line(build((u, v) => { const q = map(u, v); return [q[0] + o, q[1] + o]; }), 's', sw)); }
    out.push(line(build(map), lv(r), sw, { main: true }));
    return out;
  },

  // Boucle : ruban en dégradé qui fait un tour sur lui-même et repasse par-dessus, avec une ombre.
  boucle(r, w, h) {
    const M = Math.min(w, h), sw = clamp(M * rnd(r, 0.12, 0.2), 9, 40);
    const b = rnd(r, 1.7, 2.8), t0 = -Math.PI * rnd(r, 0.8, 1.6), t1 = Math.PI * rnd(r, 0.8, 1.6);
    const sc = (M * rnd(r, 0.2, 0.34)) / (b - 0.6), th = r() * TAU, c = Math.cos(th), s = Math.sin(th);
    const qx = rnd(r, 0.4, 1) * w, qy = rnd(r, 0, 1) * h, oy = b * 0.45;
    const at = (t) => { const x = (t - b * Math.sin(t)) * sc, y = (b * Math.cos(t) - 1 - oy) * sc; return [qx + x * c - y * s, qy + x * s + y * c]; };
    const N = 40, A = [], B = [];
    for (let i = 0; i <= N; i++) A.push(at(t0 * (1 - i / N)));
    for (let i = 0; i <= N; i++) B.push(at(t1 * (i / N)));
    A.reverse();
    const [x1, y1] = at(t0), [x2, y2] = at(t1);
    const stops = r() < 0.5 ? [['a', 0, 1], ['d', 0.55, 1], ['m', 1, 1]] : [['m', 0, 1], ['d', 0.5, 1], ['a', 1, 1]];
    const grad = { x1, y1, x2, y2, stops };
    return [
      line(new Path().smooth(A).d, 0, sw, { main: true, grad }),
      line(new Path().smooth(B).d, 0, sw, { main: true, grad, shadow: true }),
    ];
  },

  // Pilules : barres arrondies en rythme (bosse, montée ou vague), une ou deux mises en avant.
  pilules(r, w, h) {
    const F = frame(r, w, h, ['bottom', 'bottom', 'right', 'top']);
    const { W, H } = F, n = rint(r, 6, 11);
    const span = H * rnd(r, 0.38, 0.75), step = span / n, pw = clamp(step * rnd(r, 0.46, 0.62), 4, 18);
    const y0 = rnd(r, 0.02, 0.98) * (H - span), maxL = W * rnd(r, 0.32, 0.62);
    const base = r() < 0.4 ? W - W * rnd(r, 0.1, 0.18) : W + pw;
    const env = pick(r, ['bosse', 'montee', 'vague']), ph = r() * TAU, hi = rint(r, 0, n - 1);
    const pa = new Path(F.map), pb = new Path(F.map);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const e = env === 'bosse' ? Math.sin(Math.PI * t) : env === 'montee' ? 0.3 + 0.7 * t : 0.55 + 0.45 * Math.sin(t * TAU * 1.3 + ph);
      const len = maxL * clamp(e * rnd(r, 0.85, 1.1), 0.2, 1), y = y0 + (i + 0.5) * step;
      (i === hi ? pb : pa).M(base, y).L(base - len, y);
    }
    return [line(pa.d, r() < 0.5 ? 'm' : 's', pw, { main: true }), line(pb.d, pick(r, ['d', 'a']), pw, { main: true })];
  },

  // Onde : courbe vive au bord de la carte, avec un halo doux entre la courbe et le bord.
  onde(r, w, h) {
    const F = frame(r, w, h, w >= h ? ['bottom', 'bottom', 'top'] : ['right', 'left', 'bottom']);
    const { W, H } = F, E = W + 4, M = Math.min(w, h);
    const base = W - W * rnd(r, 0.2, 0.42), amp = W * rnd(r, 0.06, 0.15), lam = H * rnd(r, 0.35, 0.9);
    const ph = r() * TAU, amp2 = amp * rnd(r, 0, 0.45), ph2 = r() * TAU;
    const pts = [];
    for (let i = 0; i <= 36; i++) {
      const y = -10 + ((H + 20) * i) / 36;
      pts.push([base - amp * Math.sin((TAU * y) / lam + ph) - amp2 * Math.sin((TAU * y) / (lam * 0.47) + ph2), y]);
    }
    const [gx1, gy1] = F.map(base - amp, H / 2), [gx2, gy2] = F.map(E, H / 2);
    const out = [
      fill(new Path(F.map).smooth(pts).L(E, H + 10).L(E, -10).Z().d, 0, { grad: { x1: gx1, y1: gy1, x2: gx2, y2: gy2, stops: [['s', 0, 1], ['s', 1, 0.2]] } }),
      line(new Path(F.map).smooth(pts).d, pick(r, ['d', 'd', 'a']), clamp(M * rnd(r, 0.022, 0.04), 2.5, 6), { main: true }),
    ];
    if (r() < 0.45) {
      const off = amp * rnd(r, 0.5, 1.1);
      out.push(line(new Path(F.map).smooth(pts.map(([x, y]) => [x + off, y])).d, 'm', clamp(M * 0.016, 1.8, 3.5)));
    }
    return out;
  },

  // Soleil : anneaux concentriques depuis un coin, pleins ou en arcs arrondis.
  soleil(r, w, h) {
    const M = Math.min(w, h);
    const [cx0, cy0] = pick(r, [[w, 0], [w, h], [w, 0], [w, h], [0, h], [0, 0]]);
    const o = M * rnd(r, -0.05, 0.15), cx = cx0 + (cx0 ? o : -o), cy = cy0 + (cy0 ? o : -o);
    const n = rint(r, 3, 5), R = M * rnd(r, 0.55, 1), pitch = R / n, band = pitch * rnd(r, 0.6, 0.8);
    const seq = pick(r, [['d', 'm', 's'], ['m', 's', 'd'], ['a', 'd', 'm'], ['s', 'm', 'd']]);
    const arcs = r() < 0.45, out = [];
    for (let i = 0; i < n; i++) {
      const ro = R - i * pitch, ri = ro - band, lvl = seq[i % seq.length];
      if (arcs) {
        const a0 = r() * TAU, span = rnd(r, 0.35, 0.85) * TAU;
        out.push(line(new Path().arc(cx, cy, (ro + Math.max(0, ri)) / 2, a0, a0 + span, true).d, lvl, band, { main: i === 0 }));
      } else if (ri > 2) out.push(fill(new Path().circle(cx, cy, ro).circle(cx, cy, ri).d, lvl, { rule: 'evenodd', main: i === 0 }));
      else out.push(fill(new Path().circle(cx, cy, ro).d, lvl, { main: i === 0 }));
    }
    return out;
  },

  // Trame : demi-teinte de points depuis un coin, ou marque en pixels.
  trame(r, w, h) {
    const M = Math.min(w, h);
    if (r() < 0.5) {
      const cx = r() < 0.85 ? w : 0, cy = r() < 0.5 ? 0 : h, cell = clamp(M * rnd(r, 0.07, 0.11), 7, 16);
      const Rr = M * rnd(r, 0.6, 1), round = r() < 0.6, p = new Path();
      for (let x = cell / 2; x < w; x += cell) {
        for (let y = cell / 2; y < h; y += cell) {
          const d = Math.hypot(x - cx, y - cy);
          if (d >= Rr) continue;
          const rad = cell * 0.44 * (1 - d / Rr) ** 0.8;
          if (rad < 0.9) continue;
          if (round) p.circle(x, y, rad); else p.rrect(x - rad, y - rad, rad * 2, rad * 2, rad * 0.35);
        }
      }
      return [fill(p.d, lv(r), { main: true })];
    }
    const cols = rint(r, 4, 7), rows = rint(r, 3, 6), cell = clamp(M * rnd(r, 0.075, 0.11), 6, 14);
    const dot = cell * rnd(r, 0.66, 0.78), rx = dot * rnd(r, 0.15, 0.5);
    const gw = cols * cell, gh = rows * cell;
    const x0 = rnd(r, 0.08, 0.95) * (w - gw), y0 = rnd(r, 0.08, 0.95) * (h - gh);
    const desc = r() < 0.5, pa = new Path(), pb = new Path();
    for (let i = 0; i < cols; i++) {
      const hgt = desc ? Math.max(1, rows - Math.floor((i * rows) / cols)) : rint(r, 1, rows);
      for (let j = rows - hgt; j < rows; j++) {
        if (r() < 0.12) continue;
        (i < cols / 2 ? pa : pb).rrect(x0 + i * cell, y0 + j * cell, dot, dot, rx);
      }
    }
    return [fill(pa.d, 'd', { main: true }), fill(pb.d, pick(r, ['a', 'm']), { main: true })];
  },
};

// ---------- Petits accents, posés près de la masse du motif principal ----------
function near(r, w, h, ax, ay, pad) {
  const M = Math.min(w, h), a = r() * TAU, d = M * rnd(r, 0.22, 0.5);
  return [clamp(ax + d * Math.cos(a), pad, w - pad), clamp(ay + d * Math.sin(a), pad, h - pad)];
}
const ACCENTS = {
  pastille(r, w, h, ax, ay) {
    const rad = Math.min(w, h) * rnd(r, 0.04, 0.08), [x, y] = near(r, w, h, ax, ay, rad + 6);
    return [fill(new Path().circle(x, y, rad).d, pick(r, ['a', 'd']))];
  },
  cercle(r, w, h, ax, ay) {
    const M = Math.min(w, h), rad = M * rnd(r, 0.05, 0.1), [x, y] = near(r, w, h, ax, ay, rad + 6);
    return [line(new Path().circle(x, y, rad).d, 'a', clamp(M * 0.025, 2, 4))];
  },
  points(r, w, h, ax, ay) {
    const cols = rint(r, 3, 5), rows = rint(r, 2, 4), cell = clamp(Math.min(w, h) * 0.06, 5, 8), p = new Path();
    const [cx, cy] = near(r, w, h, ax, ay, (cols * cell) / 2 + 6);
    const x0 = cx - (cols * cell) / 2, y0 = cy - (rows * cell) / 2;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) if (r() > 0.2) p.rrect(x0 + i * cell, y0 + j * cell, cell * 0.68, cell * 0.68, cell * 0.2);
    return [fill(p.d, pick(r, ['d', 'a']))];
  },
  etincelle(r, w, h, ax, ay) {
    const s = Math.min(w, h) * rnd(r, 0.06, 0.1), [x, y] = near(r, w, h, ax, ay, s + 6), k = s * 0.2;
    const p = new Path().M(x, y - s).C(x + k, y - k, x + k, y - k, x + s, y).C(x + k, y + k, x + k, y + k, x, y + s)
      .C(x - k, y + k, x - k, y + k, x - s, y).C(x - k, y - k, x - k, y - k, x, y - s).Z();
    return [fill(p.d, 'a')];
  },
};

// Centre de la partie visible du motif principal (points des tracés compris dans la carte).
function massCenter(parts, w, h) {
  let sx = 0, sy = 0, n = 0;
  for (const p of parts) {
    if (!p.main) continue;
    const v = p.d.match(/-?\d+(?:\.\d+)?/g) || [];
    for (let i = 0; i + 1 < v.length; i += 2) {
      const x = +v[i], y = +v[i + 1];
      if (x >= 0 && x <= w && y >= 0 && y <= h) { sx += x; sy += y; n++; }
    }
  }
  return n ? [sx / n, sy / n] : [w * 0.75, h * 0.5];
}

// ---------- Couleurs et contraste ----------
export function parseColor(s) {
  s = String(s || '').trim();
  if (s[0] === '#') {
    let x = s.slice(1);
    if (x.length === 3 || x.length === 4) x = x.replace(/./g, '$&$&');
    const n = parseInt(x.slice(0, 6), 16);
    if (Number.isNaN(n)) return null;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, x.length >= 8 ? parseInt(x.slice(6, 8), 16) / 255 : 1];
  }
  let m = s.match(/^rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean);
    const a = p[3] == null ? 1 : p[3].endsWith('%') ? parseFloat(p[3]) / 100 : parseFloat(p[3]);
    return [parseFloat(p[0]), parseFloat(p[1]), parseFloat(p[2]), a];
  }
  m = s.match(/^color\(srgb\s+([^)]+)\)/);
  if (m) {
    const p = m[1].split(/[\s/]+/).filter(Boolean).map(parseFloat);
    return [p[0] * 255, p[1] * 255, p[2] * 255, p[3] == null ? 1 : p[3]];
  }
  return null;
}

function lum(c) {
  const ch = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2]);
}
export function contrast(a, b) {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// Teintes de la carte (variables posées par cards.css).
function readColors(host) {
  const cs = getComputedStyle(host), out = {};
  for (const k of ['s', 'm', 'd', 'a']) {
    const raw = cs.getPropertyValue(`--nxi-${k}`).trim();
    const c = parseColor(raw);
    if (!c) return null;
    out[k] = { rgb: c, css: `rgb(${Math.round(c[0])} ${Math.round(c[1])} ${Math.round(c[2])})` };
  }
  return out;
}

const isLarge = (cs) => { const px = parseFloat(cs.fontSize) || 12, wgt = parseFloat(cs.fontWeight) || 400; return px >= 24 || (px >= 18.6 && wgt >= 700); };

// Zones à ménager : lignes de texte, icônes au trait, champs ; éléments à fond plein (protégés).
export function measure(host, layer, avoid) {
  const hr = host.getBoundingClientRect(), boxes = [];
  const add = (rc, o) => {
    if (rc.width < 1 || rc.height < 1) return;
    boxes.push({ x: rc.left - hr.left - 3, y: rc.top - hr.top - 3, w: rc.width + 6, h: rc.height + 6, ...o });
  };
  const visit = (el, op) => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3) {
        if (!n.data.trim()) continue;
        const cs = getComputedStyle(el), rg = document.createRange();
        rg.selectNodeContents(n);
        for (const rc of rg.getClientRects()) add(rc, { type: 'text', color: parseColor(cs.color), op, large: isLarge(cs) });
        continue;
      }
      if (n.nodeType !== 1 || n === layer) continue;
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const o = op * (parseFloat(cs.opacity) || 0), tag = n.tagName.toLowerCase();
      if (o <= 0.02) continue;
      if (tag === 'svg') { add(n.getBoundingClientRect(), { type: 'text', color: parseColor(cs.color), op: o, large: true }); continue; }
      if (tag === 'img' || tag === 'canvas' || tag === 'video') { add(n.getBoundingClientRect(), { type: 'object' }); continue; }
      const bg = parseColor(cs.backgroundColor);
      if (cs.backgroundImage !== 'none' || (bg && bg[3] >= 0.85)) { add(n.getBoundingClientRect(), { type: 'object' }); continue; }
      // Champ ou bloc à fond translucide : l'illustration se verrait au travers, on le garde net.
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (bg && bg[3] > 0.04)) add(n.getBoundingClientRect(), { type: 'zone' });
      if (tag === 'input' || tag === 'textarea' || tag === 'select') { add(n.getBoundingClientRect(), { type: 'text', color: parseColor(cs.color), op: o, large: false }); continue; }
      visit(n, o);
    }
  };
  visit(host, 1);
  // Zones à laisser nettes en entier (rangée de boutons, puces…), au choix de la carte.
  if (avoid) for (const el of host.querySelectorAll(avoid)) add(el.getBoundingClientRect(), { type: 'zone', hard: true });
  return boxes;
}

// Fond réel de la carte (première couleur pleine en remontant), pour le contraste d'origine des textes.
export function cardBg(host) {
  for (let el = host; el && el.nodeType === 1; el = el.parentElement) {
    const c = parseColor(getComputedStyle(el).backgroundColor);
    if (c && c[3] >= 0.85) return c;
  }
  return document.documentElement.getAttribute('data-theme') === 'dark' ? [30, 30, 32, 1] : [255, 255, 255, 1];
}

// Teintes permises sous chaque texte : contraste AA avec la couleur réelle du texte (transparence
// comprise). Un élément déjà estompé sur le fond de la carte (chevron, texte désactivé) ne doit pas
// perdre plus de 10 % de son contraste d'origine.
function allowTones(boxes, colors, bg) {
  for (const b of boxes) {
    b.ok = new Set(b.type === 'zone' ? ['s'] : []);
    if (b.type === 'object') { ['s', 'm', 'd', 'a'].forEach((k) => b.ok.add(k)); continue; }
    if (b.type === 'zone') continue;
    const c = b.color || [0, 0, 0, 1], a = clamp((c[3] == null ? 1 : c[3]) * b.op, 0, 1);
    const over = (t) => [0, 1, 2].map((i) => c[i] * a + t[i] * (1 - a));
    const base = bg ? contrast(over(bg), bg) : 21;
    const need = Math.min(b.large ? 3 : 4.5, base * 0.9);
    for (const k of ['s', 'm', 'd', 'a']) {
      const t = colors[k].rgb;
      if (contrast(over(t), t) >= need) b.ok.add(k);
    }
  }
}

// ---------- Composition : plusieurs placements essayés, le plus lisible est gardé ----------
const down = (t, step) => (step <= 0 ? t : step === 1 ? (t === 'd' || t === 'a' ? 'm' : 's') : 's');
const tonesOf = (p) => (p.grad ? p.grad.stops.map((s) => s[0]) : [p.lvl]);

let canvas = null, ctx = null;
function raster(w, h) {
  const k = Math.min(0.5, 280 / Math.max(w, h)), cw = Math.max(1, Math.ceil(w * k)), ch = Math.max(1, Math.ceil(h * k));
  if (!canvas) { canvas = document.createElement('canvas'); ctx = canvas.getContext('2d', { willReadFrequently: true }); }
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
  return { k, cw, ch };
}
function paintParts(parts, k, cw, ch) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const p of parts) {
    const path = new Path2D(p.d);
    if (p.mode !== 'stroke') ctx.fill(path, p.rule || 'nonzero');
    if (p.mode !== 'fill') { ctx.lineWidth = p.sw; ctx.stroke(path); }
  }
  return ctx.getImageData(0, 0, cw, ch).data;
}
function coverage(data, cw, ch, k, b, pad = 0) {
  const x0 = clamp(Math.floor((b.x - pad) * k), 0, cw), x1 = clamp(Math.ceil((b.x + b.w + pad) * k), 0, cw);
  const y0 = clamp(Math.floor((b.y - pad) * k), 0, ch), y1 = clamp(Math.ceil((b.y + b.h + pad) * k), 0, ch);
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (data[(y * cw + x) * 4 + 3] > 12) n++;
  return { n, area: Math.max(1, (x1 - x0) * (y1 - y0)) };
}

function evaluate(parts, boxes, w, h, cap, r) {
  const { k, cw, ch } = raster(w, h);
  let score = 0;
  const all = paintParts(parts, k, cw, ch);
  let px = 0;
  for (let i = 3; i < all.length; i += 4) if (all[i] > 12) px++;
  const u = px / (cw * ch);
  if (u < 0.1) score += (0.1 - u) * 320;
  if (u > 0.5) score += (u - 0.5) * 220;
  const steps = parts.map((p) => {
    const data = paintParts([p], k, cw, ch), hits = [];
    let own = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 12) own++;
    if (p.main && own < cw * ch * 0.02) score += 30;
    for (const b of boxes) {
      // Les accents gardent une marge autour des textes : collés à un mot, ils passeraient pour un signe.
      const c = coverage(data, cw, ch, k, b, p.main || b.type === 'object' ? 0 : 9);
      if (c.n < 1) continue;
      hits.push(b);
      const txt = b.type !== 'object';
      score += (c.n / c.area) * (b.hard ? 140 : txt ? (b.large ? 60 : 55) : cap ? 60 : 18) + (txt ? (p.main ? 34 : 8) : 0);
    }
    // Un accent est décoratif : il ne touche jamais un texte ni un champ (sinon il est retiré).
    if (!p.main && hits.some((b) => b.type !== 'object')) { score += 6; return -1; }
    const tones = tonesOf(p), first = cap && tones.some((t) => t === 'd' || t === 'a') ? 1 : 0;
    for (let s = first; s <= 2; s++) {
      const mapped = tones.map((t) => down(t, s));
      if (hits.every((b) => mapped.every((t) => b.ok.has(t)))) { score += (s - first) * (p.main ? 12 : 8) + (p.main && s === 2 && tones.some((t) => t !== 's') ? 30 : 0); return s; }
    }
    score += p.main ? 1000 : 40;
    return -1;
  });
  return { score: score + r() * 4, steps };
}

function toSvg(parts, steps, w, h, colors, dark) {
  const id = `nxi${hash(SESSION + Math.random()).toString(36)}`;
  let defs = '', body = '', shadow = false;
  parts.forEach((p, i) => {
    const s = steps[i];
    if (s < 0) return;
    let paint;
    if (p.grad) {
      const g = p.grad, gid = `${id}g${i}`;
      defs += `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${f(g.x1)}" y1="${f(g.y1)}" x2="${f(g.x2)}" y2="${f(g.y2)}">${g.stops
        .map(([t, o, a]) => `<stop offset="${o}" stop-color="${colors[down(t, s)].css}"${a < 1 ? ` stop-opacity="${a}"` : ''}/>`).join('')}</linearGradient>`;
      paint = `url(#${gid})`;
    } else paint = colors[down(p.lvl, s)].css;
    const fillA = p.mode === 'stroke' ? 'none' : paint;
    const strokeA = p.mode === 'fill' ? '' : ` stroke="${paint}" stroke-width="${f(p.sw)}" stroke-linecap="round" stroke-linejoin="round"`;
    if (p.shadow) shadow = true;
    body += `<path d="${p.d}" fill="${fillA}"${p.rule ? ` fill-rule="${p.rule}"` : ''}${strokeA}${p.shadow ? ` filter="url(#${id}f)"` : ''}/>`;
  });
  if (shadow) defs += `<filter id="${id}f" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="${dark ? 4 : 3}" stdDeviation="${dark ? 5 : 4}" flood-color="#000" flood-opacity="${dark ? 0.45 : 0.16}"/></filter>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;
}

// Compose l'illustration d'une carte de w × h px. boxes : zones mesurées (measure) ; colors : readColors.
// Si aucun placement du motif tiré n'est propre (carte trop chargée), deux autres motifs sont essayés.
// prefer : placement retenu au dessin précédent, gardé s'il reste presque aussi bon (une valeur qui
// change en direct ne fait pas sauter l'illustration). Rend { svg, pick }.
export function compose({ w, h, key, kind, boxes = [], colors, bg = null, cap = '', dark = false, tries = 14, prefer = '', trace = null }) {
  allowTones(boxes, colors, bg);
  const accents = Object.keys(ACCENTS), start = Math.max(0, KINDS.indexOf(kind));
  const candidate = (kd, i) => {
    const r = rng(`${SESSION}|${key}|${kd}|${i}`), parts = MOTIFS[kd](r, w, h);
    if (r() < 0.55) parts.push(...ACCENTS[pick(r, accents)](r, w, h, ...massCenter(parts, w, h)));
    return { ...evaluate(parts, boxes, w, h, cap, r), parts, pick: `${kd}|${i}` };
  };
  let best = null, kept = null;
  for (let i = 0; i < tries * 3; i++) {
    if (i && i % tries === 0 && best.score < 30) break;
    const c = candidate(KINDS[(start + Math.floor(i / tries) * 3) % KINDS.length], i);
    if (trace) trace.push({ i, score: Math.round(c.score), steps: c.steps.join(','), n: c.parts.length });
    if (c.pick === prefer) kept = c;
    if (!best || c.score < best.score) best = c;
  }
  if (prefer && !kept) {
    const [kd, i] = prefer.split('|');
    if (MOTIFS[kd]) kept = candidate(kd, +i);
  }
  const chosen = kept && kept.score <= best.score + 25 ? kept : best;
  return { svg: toSvg(chosen.parts, chosen.steps, w, h, colors, dark), pick: chosen.pick };
}

// ---------- Pose sur une carte : mesure, dessin au calme, redessin au besoin ----------
const live = new Set();
const cache = new Map();
const jobs = new Set();
let pumping = false, themeObs = null;

function pump() {
  const t0 = performance.now();
  for (const fn of jobs) {
    jobs.delete(fn);
    try { fn(); } catch (e) { console.error('[NEXORA #033] illustration', e); }
    if (performance.now() - t0 > 12) break;
  }
  if (jobs.size) setTimeout(pump, 16); else pumping = false;
}
function enqueue(fn) { jobs.add(fn); if (!pumping) { pumping = true; setTimeout(pump, 0); } }

function watchTheme() {
  if (themeObs) return;
  themeObs = new MutationObserver(() => { for (const h of live) if (h.__nxi) h.__nxi.queue(); });
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-contrast'] });
}

// Rang de la carte parmi ses voisines de même classe : motifs et teintes différents d'une carte à l'autre.
function siblingIndex(host) {
  const cls = host.classList[0], p = host.parentElement;
  if (!p) return { group: cls || 'carte', index: 0 };
  const same = Array.from(p.children).filter((c) => c.classList[0] === cls);
  return { group: `${cls}:${p.classList[0] || p.tagName}`, index: Math.max(0, same.indexOf(host)) };
}
export function kindFor(group, index) { const l = shuffle(KINDS, rng(`${SESSION}|k|${group}`)); return l[index % l.length]; }
export function toneFor(group, index) { const l = shuffle(TONES, rng(`${SESSION}|t|${group}`)); return l[index % l.length]; }

// Pose une illustration en fond de host. opts : key (identité stable), tone, kind, cap ('discret' :
// pas de teinte vive), avoid (sélecteur des zones à laisser nettes), layer (calque fourni, par
// exemple par React). Rend la fonction de retrait.
/**
 * @param {HTMLElement} host
 * @param {{ key?: string, tone?: string, kind?: string, cap?: string, avoid?: string, layer?: HTMLElement }} [opts]
 * @returns {() => void}
 */
export function attach(host, opts = {}) {
  if (!host || typeof ResizeObserver === 'undefined') return () => {};
  if (host.__nxi) { host.__nxi.opts = { ...host.__nxi.opts, ...opts }; host.__nxi.queue(); return host.__nxi.dispose; }
  const own = !opts.layer, layer = opts.layer || document.createElement('span');
  layer.classList.add('nxi');
  layer.setAttribute('aria-hidden', 'true');
  if (own) host.append(layer);
  host.classList.add('nxi-host');
  if (getComputedStyle(host).position === 'static') host.classList.add('nxi-rel');
  const st = { opts, sig: '', pick: '', queue: () => enqueue(draw), dispose };
  host.__nxi = st;
  live.add(host);
  watchTheme();
  const ro = new ResizeObserver(() => st.queue());
  ro.observe(host);
  const mo = new MutationObserver((list) => { if (list.some((m) => m.target !== layer && !layer.contains(m.target))) st.queue(); });
  mo.observe(host, { childList: true, subtree: true, characterData: true });

  function draw() {
    if (!host.isConnected) { if (own) dispose(); return; }
    const root = document.documentElement;
    if (root.getAttribute('data-contrast') === 'high') { layer.innerHTML = ''; st.sig = ''; return; }
    const w = Math.round(host.clientWidth), h = Math.round(host.clientHeight);
    if (w < 40 || h < 30) return;
    const o = st.opts, pos = siblingIndex(host);
    const tone = o.tone || toneFor(pos.group, pos.index), kind = o.kind || kindFor(pos.group, pos.index);
    if (host.dataset.nxiTone !== tone) host.dataset.nxiTone = tone;
    const colors = readColors(host);
    if (!colors) return;
    const theme = root.getAttribute('data-theme') || '';
    const key = o.key || `${pos.group}:${pos.index}`;
    const sig = [key, kind, tone, o.cap || '', w, h, theme, host.textContent, colors.s.css, colors.d.css].join('|');
    if (sig === st.sig) return;
    let res = cache.get(sig);
    const fresh = !res;
    if (!res) {
      res = compose({ w, h, key, kind, colors, bg: cardBg(host), cap: o.cap === 'discret', dark: theme === 'dark', boxes: measure(host, layer, o.avoid), prefer: st.pick });
      cache.set(sig, res);
      if (cache.size > 300) cache.delete(cache.keys().next().value);
    }
    st.sig = sig;
    st.pick = res.pick;
    layer.innerHTML = res.svg;
    if (!layer.classList.contains('on')) {
      if (!fresh) layer.classList.add('now');
      requestAnimationFrame(() => layer.classList.add('on'));
    }
  }
  function dispose() {
    ro.disconnect(); mo.disconnect(); jobs.delete(draw); live.delete(host);
    if (own) layer.remove(); else { layer.innerHTML = ''; layer.classList.remove('on', 'now'); }
    host.classList.remove('nxi-host', 'nxi-rel');
    delete host.dataset.nxiTone;
    host.__nxi = null;
  }
  st.queue();
  return dispose;
}

// Retire les cartes qui ne sont plus dans la page (rendus remplacés).
export function prune() { for (const h of live) if (!h.isConnected && h.__nxi) h.__nxi.dispose(); }
