// NEXORA #118 : écrans d'exemple affichés par les appareils réalistes des modèles de NEX-DESIGN et des mises en
// scène du Studio (site, appli, tableau de bord clair ou sombre), dessinés aux couleurs et à la police du kit de
// marque, au format exact de l'écran de l'appareil. Aucun réseau : photos d'exemple de nx/photos/.
import { mixHex, inkOn } from '../core.js';

export const SCREENS = { site: 'Site vitrine', app: 'Appli mobile', dash: 'Tableau de bord clair', sombre: 'Tableau de bord sombre' };

const photoCache = new Map();
export function photoUrl(key) { return new URL(`../photos/${key}.webp`, import.meta.url).href; }
export function photoImage(key) {
  if (!photoCache.has(key)) photoCache.set(key, new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error(`Photo « ${key} » introuvable.`)); i.src = photoUrl(key); }));
  return photoCache.get(key);
}

function rr(x, X, Y, W, H, r) { x.beginPath(); x.roundRect(X, Y, W, H, Math.min(r, W / 2, H / 2)); }
function fillRR(x, X, Y, W, H, r, fill) { rr(x, X, Y, W, H, r); x.fillStyle = fill; x.fill(); }
function text(x, s, X, Y, size, { color = '#111', weight = 600, font, align = 'left', base = 'alphabetic' } = {}) {
  x.font = `${weight} ${Math.round(size)}px '${font}', Inter, 'Segoe UI', sans-serif`;
  x.fillStyle = color; x.textAlign = align; x.textBaseline = base; x.fillText(s, X, Y);
  return x.measureText(s).width;
}
// Image recadrée dans une boîte (comme object-fit: cover).
function cover(x, img, X, Y, W, H, r = 0, fx = 0.5, fy = 0.5) {
  x.save(); if (r) { rr(x, X, Y, W, H, r); x.clip(); }
  const k = Math.max(W / img.naturalWidth, H / img.naturalHeight); const dw = img.naturalWidth * k; const dh = img.naturalHeight * k;
  x.drawImage(img, X + (W - dw) * fx, Y + (H - dh) * fy, dw, dh); x.restore();
}
function brandBits(brand) {
  const accent = brand.colors[0]; const name = (brand.name || 'Altura').trim();
  return { accent, onAccent: inkOn(accent), name, font: brand.fonts.title || 'NX Inter', body: brand.fonts.body || 'NX Inter' };
}
async function fontsReady(brand) {
  try { await Promise.all([700, 500, 400].map((w) => document.fonts.load(`${w} 40px '${brand.fonts.title}'`)).concat(document.fonts.load(`500 20px '${brand.fonts.body}'`))); } catch { /* police système */ }
}
function mark(x, X, Y, s, accent) {
  fillRR(x, X, Y, s, s, s * 0.28, accent);
  x.fillStyle = inkOn(accent); x.beginPath(); x.arc(X + s / 2, Y + s / 2, s * 0.2, 0, Math.PI * 2); x.fill();
}

// ---------- Site vitrine (ordinateur) ----------
async function site(x, w, h, brand) {
  const B = brandBits(brand); const u = w / 1600; const bg = '#f3f3f1'; const ink = '#121214';
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  // Barre de navigation.
  mark(x, 48 * u, 34 * u, 34 * u, B.accent);
  text(x, B.name, 94 * u, 59 * u, 22 * u, { color: ink, weight: 700, font: B.font });
  const links = ['Accueil', 'Services', 'Projets', 'Tarifs', 'Contact']; let lx = w / 2 - 300 * u;
  fillRR(x, lx - 8 * u, 28 * u, 616 * u, 48 * u, 24 * u, '#e4e4e1');
  links.forEach((l, i) => { const lw = 112 * u; if (!i) fillRR(x, lx, 34 * u, lw, 36 * u, 18 * u, '#ffffff'); text(x, l, lx + lw / 2, 58 * u, 16 * u, { color: i ? '#5a5a5f' : ink, weight: 600, font: B.body, align: 'center' }); lx += 120 * u; });
  fillRR(x, w - 220 * u, 28 * u, 172 * u, 48 * u, 24 * u, ink);
  text(x, 'Se connecter', w - 134 * u, 58 * u, 16 * u, { color: '#fff', weight: 600, font: B.body, align: 'center' });
  // Titre.
  fillRR(x, 48 * u, 150 * u, 118 * u, 34 * u, 17 * u, 'rgba(0,0,0,0)'); x.strokeStyle = '#c9c9c6'; x.lineWidth = 1.5 * u; rr(x, 48 * u, 150 * u, 118 * u, 34 * u, 17 * u); x.stroke();
  text(x, '/ Nouveau', 107 * u, 173 * u, 15 * u, { color: '#5a5a5f', weight: 600, font: B.body, align: 'center' });
  const lines = ['Des expériences', 'qui restent', 'en mémoire.'];
  lines.forEach((l, i) => text(x, l, 44 * u, (300 + i * 94) * u, 86 * u, { color: i === 2 ? B.accent : ink, weight: 700, font: B.font }));
  text(x, 'Identité, site et application pensés ensemble,', 48 * u, 556 * u, 21 * u, { color: '#5f5f64', weight: 500, font: B.body });
  text(x, 'du premier croquis à la mise en ligne.', 48 * u, 586 * u, 21 * u, { color: '#5f5f64', weight: 500, font: B.body });
  fillRR(x, 48 * u, 630 * u, 196 * u, 58 * u, 29 * u, B.accent);
  text(x, 'Commencer', 146 * u, 666 * u, 18 * u, { color: B.onAccent, weight: 700, font: B.body, align: 'center' });
  fillRR(x, 258 * u, 630 * u, 196 * u, 58 * u, 29 * u, '#e2e2df');
  text(x, 'Nous écrire', 356 * u, 666 * u, 18 * u, { color: ink, weight: 600, font: B.body, align: 'center' });
  // Photo et carte de chiffre.
  const px = 800 * u; const py = 128 * u; const pw = w - px - 48 * u; const ph = Math.max(560 * u, h - py - 170 * u);
  try { cover(x, await photoImage('montagne'), px, py, pw, ph, 28 * u, 0.5, 0.45); } catch { fillRR(x, px, py, pw, ph, 28 * u, '#d9d9d6'); }
  fillRR(x, px + 28 * u, py + ph - 150 * u, 300 * u, 122 * u, 22 * u, 'rgba(255,255,255,0.86)');
  text(x, '↗ 132 %', px + 52 * u, py + ph - 88 * u, 44 * u, { color: ink, weight: 700, font: B.font });
  text(x, 'de visites en plus en trois mois', px + 52 * u, py + ph - 52 * u, 16 * u, { color: '#56565b', weight: 500, font: B.body });
  // Rangée du bas.
  const ry = h - 96 * u;
  ['Stratégie', 'Design', 'Développement', 'Lancement'].forEach((l, i) => {
    const cx = 48 * u + i * ((w - 96 * u) / 4);
    x.fillStyle = '#d8d8d4'; x.fillRect(cx, ry, (w - 96 * u) / 4 - 24 * u, 1.5 * u);
    text(x, `0${i + 1}`, cx, ry + 40 * u, 15 * u, { color: B.accent, weight: 700, font: B.body });
    text(x, l, cx + 40 * u, ry + 40 * u, 19 * u, { color: ink, weight: 600, font: B.body });
  });
}

// ---------- Appli mobile (téléphone) ----------
async function app(x, w, h, brand) {
  const B = brandBits(brand); const u = w / 900; const ink = '#141416';
  x.fillStyle = '#f2f2f4'; x.fillRect(0, 0, w, h);
  text(x, '9:41', 92 * u, 92 * u, 38 * u, { color: ink, weight: 700, font: B.body });
  fillRR(x, w - 186 * u, 66 * u, 52 * u, 28 * u, 8 * u, ink); fillRR(x, w - 124 * u, 66 * u, 34 * u, 28 * u, 6 * u, '#9a9aa0');
  mark(x, 60 * u, 168 * u, 74 * u, B.accent);
  for (let i = 0; i < 2; i++) { const cx = w - (100 + i * 96) * u; x.fillStyle = '#e3e3e7'; x.beginPath(); x.arc(cx, 205 * u, 38 * u, 0, Math.PI * 2); x.fill(); x.strokeStyle = ink; x.lineWidth = 4 * u; x.beginPath(); if (i) { x.arc(cx - 3 * u, 202 * u, 13 * u, 0, Math.PI * 2); x.moveTo(cx + 7 * u, 212 * u); x.lineTo(cx + 16 * u, 221 * u); } else { x.moveTo(cx - 14 * u, 196 * u); x.lineTo(cx + 14 * u, 196 * u); x.moveTo(cx - 14 * u, 208 * u); x.lineTo(cx + 14 * u, 208 * u); x.moveTo(cx - 14 * u, 220 * u); x.lineTo(cx + 8 * u, 220 * u); } x.stroke(); }
  text(x, 'Bonjour Camille', 60 * u, 344 * u, 32 * u, { color: '#6a6a70', weight: 500, font: B.body });
  text(x, 'Votre activité', 60 * u, 408 * u, 58 * u, { color: ink, weight: 700, font: B.font });
  // Carte principale.
  fillRR(x, 48 * u, 456 * u, w - 96 * u, 520 * u, 46 * u, '#ffffff');
  fillRR(x, 84 * u, 492 * u, 190 * u, 50 * u, 25 * u, '#eeeef1'); text(x, 'CE MOIS-CI', 179 * u, 525 * u, 20 * u, { color: ink, weight: 700, font: B.body, align: 'center' });
  x.fillStyle = B.accent; x.beginPath(); x.arc(w - 150 * u, 517 * u, 26 * u, 0, Math.PI * 2); x.fill();
  x.fillStyle = mixHex(B.accent, '#000000', 0.35); x.beginPath(); x.arc(w - 112 * u, 517 * u, 26 * u, 0, Math.PI * 2); x.fill();
  text(x, '12 480 €', 84 * u, 650 * u, 92 * u, { color: ink, weight: 700, font: B.font });
  text(x, '+ 18,4 % par rapport au mois dernier', 84 * u, 704 * u, 26 * u, { color: '#6a6a70', weight: 500, font: B.body });
  // Courbe.
  const pts = [0.62, 0.58, 0.66, 0.5, 0.54, 0.38, 0.42, 0.28, 0.32, 0.18];
  const cx0 = 84 * u; const cw = w - 168 * u; const cy0 = 760 * u; const ch = 170 * u;
  const grd = x.createLinearGradient(0, cy0, 0, cy0 + ch); grd.addColorStop(0, mixHex(B.accent, '#ffffff', 0.55)); grd.addColorStop(1, 'rgba(255,255,255,0)');
  x.beginPath(); pts.forEach((p, i) => { const X = cx0 + (i / (pts.length - 1)) * cw; const Y = cy0 + p * ch; i ? x.lineTo(X, Y) : x.moveTo(X, Y); }); x.lineTo(cx0 + cw, cy0 + ch); x.lineTo(cx0, cy0 + ch); x.closePath(); x.fillStyle = grd; x.fill();
  x.beginPath(); pts.forEach((p, i) => { const X = cx0 + (i / (pts.length - 1)) * cw; const Y = cy0 + p * ch; i ? x.lineTo(X, Y) : x.moveTo(X, Y); }); x.strokeStyle = B.accent; x.lineWidth = 7 * u; x.lineJoin = 'round'; x.stroke();
  // Liste.
  const rows = [['Commandes', '248', '+12'], ['Nouveaux clients', '61', '+9'], ['Panier moyen', '50,30 €', '+4 %'], ['Avis clients', '4,9 / 5', '+0,2']];
  rows.forEach(([l, v, d], i) => {
    const Y = 1012 * u + i * 150 * u;
    fillRR(x, 48 * u, Y, w - 96 * u, 128 * u, 34 * u, '#ffffff');
    fillRR(x, 78 * u, Y + 30 * u, 68 * u, 68 * u, 20 * u, i ? '#eeeef1' : mixHex(B.accent, '#ffffff', 0.78));
    text(x, l, 172 * u, Y + 58 * u, 28 * u, { color: ink, weight: 600, font: B.body });
    text(x, d, 172 * u, Y + 96 * u, 22 * u, { color: '#1f9d55', weight: 600, font: B.body });
    text(x, v, w - 84 * u, Y + 76 * u, 32 * u, { color: ink, weight: 700, font: B.font, align: 'right' });
  });
  fillRR(x, 48 * u, h - 230 * u, w - 96 * u, 112 * u, 56 * u, ink);
  text(x, 'Voir le rapport complet', w / 2, h - 162 * u, 30 * u, { color: '#fff', weight: 600, font: B.body, align: 'center' });
}

// ---------- Tableau de bord clair (ordinateur) ----------
async function dash(x, w, h, brand) {
  const B = brandBits(brand); const u = w / 1600; const ink = '#151517';
  x.fillStyle = '#f6f6f5'; x.fillRect(0, 0, w, h);
  const tabs = ['Vue d’ensemble', 'Analyses', 'Clients', 'Documents', 'Calcul'];
  let tx = 40 * u; tabs.forEach((t, i) => { x.font = `600 ${17 * u}px '${B.body}'`; const tw = x.measureText(t).width + 36 * u; if (!i) fillRR(x, tx, 30 * u, tw, 42 * u, 21 * u, ink); text(x, t, tx + tw / 2, 57 * u, 17 * u, { color: i ? '#3d3d42' : '#fff', weight: 600, font: B.body, align: 'center' }); tx += tw + 10 * u; });
  fillRR(x, w - 640 * u, 30 * u, 320 * u, 42 * u, 21 * u, '#ececea'); text(x, 'Rechercher un client', w - 610 * u, 57 * u, 16 * u, { color: '#8a8a8f', weight: 500, font: B.body });
  fillRR(x, w - 300 * u, 30 * u, 42 * u, 42 * u, 12 * u, ink); x.fillStyle = '#d8c3a5'; x.beginPath(); x.arc(w - 230 * u, 51 * u, 21 * u, 0, Math.PI * 2); x.fill();
  text(x, 'Camille Roy', w - 198 * u, 48 * u, 17 * u, { color: ink, weight: 700, font: B.body }); text(x, 'Responsable', w - 198 * u, 68 * u, 14 * u, { color: '#8a8a8f', weight: 500, font: B.body });
  text(x, 'Tableau de bord', 40 * u, 300 * u, 60 * u, { color: ink, weight: 400, font: B.font });
  // Carte « verre » à l'accent, empilée.
  for (let i = 2; i >= 0; i--) { const X = 610 * u + i * 60 * u; const a = i ? 0.28 - i * 0.07 : 1; x.save(); x.globalAlpha = a; const g = x.createLinearGradient(X, 110 * u, X + 360 * u, 330 * u); g.addColorStop(0, mixHex(B.accent, '#ffffff', 0.2)); g.addColorStop(1, mixHex(B.accent, '#ffffff', 0.65)); fillRR(x, X, 110 * u + i * 8 * u, 380 * u, 230 * u, 22 * u, g); x.restore(); }
  text(x, '✦ Activité du mois', 640 * u, 158 * u, 17 * u, { color: inkOn(B.accent), weight: 600, font: B.body });
  text(x, 'Le mois dernier,', 640 * u, 218 * u, 28 * u, { color: inkOn(B.accent), weight: 700, font: B.font });
  text(x, 'l’automatisation a fait', 640 * u, 254 * u, 28 * u, { color: inkOn(B.accent), weight: 400, font: B.font });
  text(x, 'gagner 48,3 heures', 640 * u, 290 * u, 28 * u, { color: inkOn(B.accent), weight: 700, font: B.font });
  // Cartes de chiffres.
  const cards = [['Fiches synchronisées', '71,74 %'], ['Écarts détectés', '10,12 %'], ['Clôtures à temps', '82,6 %']];
  cards.forEach(([l, v], i) => {
    const X = 40 * u + i * 330 * u; const Y = 380 * u; const W = 310 * u; const H = 300 * u;
    fillRR(x, X, Y, W, H, 22 * u, '#ffffff');
    text(x, l, X + 24 * u, Y + 44 * u, 17 * u, { color: '#3d3d42', weight: 600, font: B.body });
    if (i === 0) { x.lineWidth = 16 * u; x.lineCap = 'round'; x.strokeStyle = '#e6e6e4'; x.beginPath(); x.arc(X + W / 2, Y + 230 * u, 110 * u, Math.PI, 0); x.stroke(); x.strokeStyle = ink; x.beginPath(); x.arc(X + W / 2, Y + 230 * u, 110 * u, Math.PI, Math.PI * 1.72); x.stroke(); x.fillStyle = B.accent; x.beginPath(); x.arc(X + W / 2 + Math.cos(Math.PI * 1.72) * 110 * u, Y + 230 * u + Math.sin(Math.PI * 1.72) * 110 * u, 10 * u, 0, Math.PI * 2); x.fill(); }
    text(x, v, X + W / 2, Y + (i ? 150 : 222) * u, (i ? 56 : 44) * u, { color: ink, weight: 400, font: B.font, align: 'center' });
    if (i) { for (let k = 0; k < 26; k++) { x.fillStyle = k < 3 ? B.accent : k < 6 ? ink : '#e3e3e1'; x.fillRect(X + 24 * u + k * 10 * u, Y + 220 * u, 6 * u, 46 * u); } }
  });
  // Assistant.
  const ax = 1040 * u; fillRR(x, ax, 110 * u, w - ax - 40 * u, 570 * u, 22 * u, '#ffffff');
  text(x, '✦ Assistant IA', ax + 26 * u, 154 * u, 18 * u, { color: '#3d3d42', weight: 600, font: B.body });
  x.fillStyle = '#d8c3a5'; x.beginPath(); x.arc(ax + 50 * u, 222 * u, 22 * u, 0, Math.PI * 2); x.fill();
  text(x, 'Camille Roy', ax + 86 * u, 216 * u, 18 * u, { color: ink, weight: 700, font: B.body });
  ['Pouvez-vous vérifier les écarts', 'entre le chiffre d’affaires et', 'les prévisions ?'].forEach((l, i) => text(x, l, ax + 86 * u, (246 + i * 26) * u, 17 * u, { color: '#3d3d42', weight: 500, font: B.body }));
  mark(x, ax + 28 * u, 360 * u, 44 * u, B.accent);
  text(x, 'Écarts principaux par mois', ax + 86 * u, 390 * u, 18 * u, { color: ink, weight: 700, font: B.body });
  [['Juillet', '18,9 k€'], ['Août', '21,7 k€'], ['Septembre', '11,9 k€']].forEach(([m, v], i) => { const Y = (440 + i * 40) * u; text(x, m, ax + 86 * u, Y, 17 * u, { color: '#5a5a5f', weight: 500, font: B.body }); text(x, v, w - 70 * u, Y, 17 * u, { color: ink, weight: 700, font: B.body, align: 'right' }); });
  fillRR(x, ax + 86 * u, 580 * u, w - ax - 156 * u, 14 * u, 7 * u, '#ebebea'); fillRR(x, ax + 86 * u, 580 * u, 60 * u, 14 * u, 7 * u, B.accent); fillRR(x, ax + 146 * u, 580 * u, 50 * u, 14 * u, 7 * u, ink);
  // Bas : graphique en barres.
  fillRR(x, 40 * u, 700 * u, 980 * u, h - 740 * u, 22 * u, '#ffffff');
  text(x, 'Comptes traités', 64 * u, 744 * u, 17 * u, { color: '#3d3d42', weight: 600, font: B.body });
  for (let k = 0; k < 18; k++) { const bh = (40 + ((k * 37) % 90)) * u; x.fillStyle = k === 12 ? B.accent : '#e2e2e0'; fillRR(x, 64 * u + k * 52 * u, h - 60 * u - bh, 30 * u, bh, 8 * u, k === 12 ? B.accent : '#e2e2e0'); }
}

// ---------- Tableau de bord sombre (tablette, paysage) ----------
async function sombre(x, w, h, brand) {
  const B = brandBits(brand); const u = w / 1600; const ink = '#0d0d0f'; const line = '#2a2a2e';
  x.fillStyle = ink; x.fillRect(0, 0, w, h);
  mark(x, 44 * u, 40 * u, 44 * u, '#f2f2f2');
  for (let i = 0; i < 2; i++) { x.strokeStyle = line; x.lineWidth = 2 * u; x.beginPath(); x.arc((126 + i * 58) * u, 62 * u, 22 * u, 0, Math.PI * 2); x.stroke(); }
  fillRR(x, 520 * u, 36 * u, 200 * u, 50 * u, 25 * u, '#18181b'); text(x, '12 janvier', 620 * u, 68 * u, 17 * u, { color: '#d6d6da', weight: 600, font: B.body, align: 'center' });
  const g = x.createLinearGradient(740 * u, 0, w - 60 * u, 0); g.addColorStop(0, mixHex(B.accent, '#000000', 0.15)); g.addColorStop(1, mixHex(B.accent, '#000000', 0.35));
  fillRR(x, 740 * u, 36 * u, w - 800 * u, 50 * u, 25 * u, g);
  text(x, '09:00   Revue du comité d’audit   10:00', 790 * u, 68 * u, 17 * u, { color: inkOn(B.accent), weight: 600, font: B.body });
  [['Dossiers (14)', 44], ['Étiquettes (44)', 230], ['Petit', 430]].forEach(([l, X]) => { x.font = `600 ${16 * u}px '${B.body}'`; const tw = x.measureText(l).width + 60 * u; x.strokeStyle = line; x.lineWidth = 2 * u; rr(x, X * u, 120 * u, tw, 46 * u, 23 * u); x.stroke(); text(x, l, X * u + 40 * u, 150 * u, 16 * u, { color: '#d6d6da', weight: 600, font: B.body }); });
  // Éventail de dossiers (vus de biais, celui du milieu ouvert).
  const n = 17; const cx = w * 0.5; const cy = 470 * u;
  const order = [...Array(n).keys()].sort((a, b) => Math.abs(b - 8) - Math.abs(a - 8));
  for (const i of order) {
    const t = (i - 8) / 8; const at = Math.abs(t); const on = i === 9;
    const X = cx + Math.sign(t) * Math.pow(at, 0.85) * w * 0.47; const sx = 0.12 + 0.62 * Math.pow(1 - at, 2.4);
    const cw = 300 * u; const chh = (330 - at * 70) * u;
    x.save(); x.translate(X, cy); x.transform(sx, -t * 0.22, 0, 1, 0, 0);
    if (on) { const gg = x.createLinearGradient(-cw / 2, -chh / 2, cw / 2, chh / 2); gg.addColorStop(0, mixHex(B.accent, '#ffffff', 0.15)); gg.addColorStop(1, mixHex(B.accent, '#000000', 0.3)); fillRR(x, -cw / 2, -chh / 2, cw, chh, 20 * u, gg); }
    else { fillRR(x, -cw / 2, -chh / 2, cw, chh, 20 * u, `rgba(236,236,242,${0.22 + (1 - at) * 0.55})`); }
    x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 2 * u; rr(x, -cw / 2, -chh / 2, cw, chh, 20 * u); x.stroke();
    for (let k = 0; k < 6; k++) { x.fillStyle = on ? 'rgba(255,255,255,0.6)' : 'rgba(40,40,46,0.35)'; x.fillRect(-cw / 2 + 30 * u, -chh / 2 + (54 + k * 36) * u, (k % 2 ? 150 : 220) * u, 12 * u); }
    x.restore();
  }
  fillRR(x, cx - 330 * u, cy - 150 * u, 200 * u, 150 * u, 18 * u, 'rgba(250,250,252,0.92)');
  text(x, 'Entreprise', cx - 310 * u, cy - 108 * u, 18 * u, { color: ink, weight: 700, font: B.body });
  text(x, 'janv. – mars', cx - 310 * u, cy - 82 * u, 14 * u, { color: '#6a6a70', weight: 500, font: B.body });
  text(x, '87 %', cx - 310 * u, cy - 26 * u, 40 * u, { color: ink, weight: 400, font: B.font });
  // Bas : échéances et carte d'accent.
  const by = h - 360 * u;
  fillRR(x, 40 * u, by, 700 * u, 320 * u, 22 * u, '#141417');
  text(x, 'Échéances clés', 70 * u, by + 50 * u, 22 * u, { color: '#f2f2f4', weight: 600, font: B.body });
  [['2 semaines', 'Renouvellement'], ['2 mois', 'Fin de contrat'], ['5 mois', 'Révision annuelle']].forEach(([a, b], i) => { const Y = by + (110 + i * 64) * u; x.fillStyle = line; x.fillRect(70 * u, Y - 36 * u, 640 * u, 1.5 * u); text(x, a, 70 * u, Y, 19 * u, { color: '#d6d6da', weight: 600, font: B.body }); text(x, b, 330 * u, Y, 19 * u, { color: '#d6d6da', weight: 500, font: B.body }); });
  const g2 = x.createLinearGradient(780 * u, by - 60 * u, w, h); g2.addColorStop(0, mixHex(B.accent, '#ffffff', 0.1)); g2.addColorStop(1, mixHex(B.accent, '#000000', 0.3));
  fillRR(x, 780 * u, by - 60 * u, w - 820 * u, h - by + 20 * u, 26 * u, g2);
  const on = inkOn(B.accent);
  text(x, 'Conformité', 816 * u, by - 4 * u, 30 * u, { color: on, weight: 600, font: B.font });
  text(x, 'Activité récente', 816 * u, by + 30 * u, 17 * u, { color: on, weight: 500, font: B.body });
  x.fillStyle = on; x.globalAlpha = 0.5; x.fillRect(816 * u, by + 100 * u, w - 900 * u, 2 * u); x.globalAlpha = 1;
  text(x, 'Audit annuel des données personnelles', 816 * u, by + 86 * u, 17 * u, { color: on, weight: 500, font: B.body });
  fillRR(x, 816 * u, by + 140 * u, w - 900 * u, 84 * u, 18 * u, 'rgba(255,255,255,0.18)');
  text(x, 'Rapport de conformité v4.pdf', 860 * u, by + 192 * u, 19 * u, { color: on, weight: 600, font: B.body });
}

const DRAW = { site, app, dash, sombre };
// Écran au format `aspect` (largeur / hauteur de la dalle). `land` : dalle en portrait affichée en paysage (appareil
// tourné d'un quart de tour) : l'écran est dessiné en paysage puis pivoté.
export async function screenCanvas(kind, brand, aspect, { land = false } = {}) {
  await fontsReady(brand);
  const long = 1800;
  const pw = aspect >= 1 ? long : Math.round(long * aspect); const ph = aspect >= 1 ? Math.round(long / aspect) : long;
  const W = land ? ph : pw; const H = land ? pw : ph;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  await (DRAW[kind] || site)(x, W, H, brand);
  if (!land) return c;
  const p = document.createElement('canvas'); p.width = pw; p.height = ph;
  const px = p.getContext('2d'); px.translate(pw, 0); px.rotate(Math.PI / 2); px.drawImage(c, 0, 0);
  return p;
}
