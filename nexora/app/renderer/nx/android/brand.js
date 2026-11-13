// NEXORA #115 : créateur de logo et créateur d'écran de démarrage de l'App Builder (section « Logo et démarrage »).
// Tout est dessiné sur ce PC (canevas) : le logo devient l'icône de l'application (calque transparent posé sur les
// couleurs de fond, comme les icônes adaptatives d'Android, y compris l'icône à thème d'Android 13+) ; l'écran de
// démarrage reçoit une image de fond (drawable vt_splash_bg, lue par Splash.java) en plus du logo, du nom, de
// l'accroche et des animations déjà proposés par l'App Builder.
import { api, esc, toast, saveBytes, $, $$ } from '../core.js';
import { b as icon } from '../../dist/chunks/chunk-S4I2LXHS.js';
import { LUCIDE } from '../icons/lucide.js';

export const SECTION = ['brand', 'Logo et démarrage', 'sparkle', 'Créateur de logo et d’écran de démarrage'];

const FONTS = {
  urbanist: ['Urbanist', 'Urbanist, Inter, system-ui, sans-serif'],
  inter: ['Inter', 'Inter, system-ui, sans-serif'],
  system: ['Système', 'system-ui, "Segoe UI", Roboto, sans-serif'],
  rounded: ['Arrondie', '"Arial Rounded MT Bold", "Nunito", "Varela Round", system-ui, sans-serif'],
  serif: ['Classique', 'Georgia, "Times New Roman", serif'],
  mono: ['Code', '"Cascadia Code", Consolas, "Courier New", monospace'],
};
// Palettes : fond, second fond (dégradé diagonal, comme les icônes générées), motif.
const PALETTES = {
  ocean: ['Océan', '#0A84FF', '#5E5CE6', '#FFFFFF'],
  corail: ['Corail', '#FF6B6B', '#FF8E53', '#FFFFFF'],
  foret: ['Forêt', '#0E9F6E', '#34D399', '#FFFFFF'],
  minuit: ['Minuit', '#0F172A', '#334155', '#F8FAFC'],
  soleil: ['Soleil', '#F59E0B', '#EF4444', '#FFFFFF'],
  raisin: ['Raisin', '#7C3AED', '#DB2777', '#FFFFFF'],
  mono: ['Encre', '#111111', '#3A3A3A', '#FFFFFF'],
  creme: ['Crème', '#FFF4E0', '#FFD8A8', '#5B3A1E'],
  menthe: ['Menthe', '#E6FAF3', '#B4F0DC', '#0B5D46'],
  lagon: ['Lagon', '#06B6D4', '#3B82F6', '#FFFFFF'],
};
const MODES = { initials: 'Initiales', symbol: 'Symbole', both: 'Symbole et initiales', name: 'Nom' };
// Symboles proposés en premier (jeu d'icônes de NEXORA, Lucide) ; « Tous » ouvre la liste complète.
const PICKS = ['sparkle', 'star', 'heart', 'bolt', 'cart', 'bag', 'chat', 'music', 'camera', 'image', 'globe', 'home', 'shield', 'lock', 'bell', 'cloud', 'code', 'phone', 'book', 'coffee', 'pizza', 'gift', 'car', 'plane', 'leaf', 'sun', 'moon', 'flame', 'map', 'calendar', 'user', 'users', 'briefcase', 'graduation', 'dumbbell', 'stethoscope', 'paw', 'palette', 'gamepad', 'video', 'store', 'truck', 'wallet', 'rocket', 'crown', 'diamond', 'zap', 'compass'];
// Mots du nom de l'application → symboles suggérés.
const HINTS = [
  [/march|shop|boutique|store|vente|achat|commerce/i, ['cart', 'bag', 'store']],
  [/resto|food|cuisine|boulang|pizza|café|cafe|repas|traiteur/i, ['coffee', 'pizza', 'flame']],
  [/musi|son|radio|podcast/i, ['music', 'video']],
  [/photo|image|galerie|studio/i, ['camera', 'image', 'palette']],
  [/voyage|travel|tour|vol|hôtel|hotel/i, ['plane', 'map', 'compass']],
  [/santé|sante|clinique|médic|medic|pharma|docteur/i, ['stethoscope', 'heart', 'shield']],
  [/école|ecole|cours|forma|learn|edu/i, ['book', 'graduation']],
  [/sport|gym|fitness|club/i, ['dumbbell', 'bolt', 'flame']],
  [/banque|money|pay|finance|wallet|caisse/i, ['wallet', 'shield', 'diamond']],
  [/livr|delivery|transport|taxi|moto/i, ['truck', 'car', 'map']],
  [/jeu|game|play/i, ['gamepad', 'star', 'rocket']],
  [/chat|message|social|amis/i, ['chat', 'users', 'heart']],
];
const SPLASH_BG = { solid: 'Uni', gradient: 'Dégradé', aurora: 'Aurore', pattern: 'Motif', photo: 'Photo' };
const PATTERNS = { dots: 'Points', grid: 'Grille', waves: 'Vagues', diagonal: 'Diagonales', confetti: 'Confettis' };
const LOGO_SRC = { icon: 'Icône de l’application', logo: 'Logo créé', none: 'Aucun' };
// Styles d'animation : entrée et sortie de l'écran de démarrage (mêmes valeurs que l'App Builder et Splash.java).
const MOTIONS = {
  soft: ['Douce', 'fadeUp', 'fade'],
  pop: ['Élastique', 'pop', 'zoom'],
  bounce: ['Rebond', 'bounce', 'slideUp'],
  shine: ['Reflet', 'shine', 'fade'],
  glow: ['Halo', 'glow', 'reveal'],
  type: ['Machine à écrire', 'typewriter', 'fade'],
  calm: ['Sobre', 'none', 'fade'],
};
const TEMPLATES = {
  minimal: ['Minimal', { bgKind: 'solid', light: true }],
  dark: ['Sombre', { bgKind: 'solid', light: false }],
  gradient: ['Dégradé', { bgKind: 'gradient' }],
  aurora: ['Aurore', { bgKind: 'aurora' }],
  pattern: ['Motif', { bgKind: 'pattern' }],
  photo: ['Photo', { bgKind: 'photo' }],
};

const luminance = (hex) => {
  const n = parseInt(String(hex || '#ffffff').replace('#', '').padEnd(6, 'f').slice(0, 6), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};
const isHex = (s) => /^#[0-9a-f]{6}$/i.test(String(s || ''));
const initialsOf = (name) => {
  const words = String(name || '').replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/[\s'-]+/).filter(Boolean);
  if (!words.length) return 'A';
  return (words.length === 1 ? words[0].slice(0, 2) : words.slice(0, 2).map((w) => w[0]).join('')).toUpperCase();
};
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(h); return c; };
const toBytes = async (dataUrl) => new Uint8Array(await (await fetch(dataUrl)).arrayBuffer());

function logoOf(cfg) {
  const b = cfg.brand || (cfg.brand = {});
  if (!b.logo) {
    const ic = cfg.icon || {};
    const pal = PALETTES.ocean;
    // Couleurs de l'icône reprises seulement si elles ont été choisies (fond blanc par défaut : palette Océan).
    const custom = isHex(ic.bg) && ic.bg.toUpperCase() !== '#FFFFFF';
    b.logo = {
      mode: 'initials', text: initialsOf(cfg.appName), name: cfg.appName || '', symbol: suggestSymbols(cfg.appName)[0], font: 'urbanist', weight: 700,
      bg: custom ? ic.bg : pal[1], bg2: custom && isHex(ic.bg2) ? ic.bg2 : pal[2], fg: pal[3], gradient: true, shadow: false, size: 0.62, palette: custom ? '' : 'ocean',
    };
  }
  return b.logo;
}
function splashOf(cfg) {
  const b = cfg.brand || (cfg.brand = {});
  if (!b.splash) {
    const L = logoOf(cfg);
    b.splash = {
      template: 'minimal', bgKind: 'solid', bg: (cfg.splash && isHex(cfg.splash.bg)) ? cfg.splash.bg : '#FFFFFF', bg2: L.bg2, accent: L.bg,
      pattern: 'dots', patternOpacity: 0.14, photo: null, veil: 0.35, logo: 'icon', motion: 'soft',
    };
  }
  return b.splash;
}
function suggestSymbols(name) {
  const out = [];
  for (const [re, list] of HINTS) if (re.test(String(name || ''))) out.push(...list);
  for (const s of ['sparkle', 'star', 'bolt', 'heart', 'rocket', 'diamond']) out.push(s);
  return [...new Set(out)].filter((k) => LUCIDE[k]);
}

// ---------------------------------------------------------------- dessin
const symbolCache = new Map();
function symbolImage(key, color, stroke = 2) {
  const id = `${key}|${color}|${stroke}`;
  if (symbolCache.has(id)) return symbolCache.get(id);
  const inner = LUCIDE[key] || LUCIDE.sparkle || '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="512" height="512" color="${color}" stroke-width="${stroke}">${inner}</svg>`;
  const p = new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
  symbolCache.set(id, p);
  return p;
}
let fontsReady = null;
function loadFonts() {
  if (!fontsReady) fontsReady = Promise.all(['300', '500', '700', '800'].flatMap((w) => [`${w} 64px Urbanist`, `${w} 64px Inter`].map((f) => document.fonts.load(f).catch(() => null)))).catch(() => null);
  return fontsReady;
}
function fitText(ctx, text, family, weight, maxW, maxH) {
  let px = Math.max(8, maxH);
  ctx.font = `${weight} ${px}px ${family}`;
  const w = ctx.measureText(text).width;
  if (w > maxW) px = Math.max(8, px * (maxW / w));
  ctx.font = `${weight} ${px}px ${family}`;
  return px;
}
function shapePath(ctx, s, shape) {
  ctx.beginPath();
  if (shape === 'circle') ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
  else if (shape === 'rounded') ctx.roundRect(0, 0, s, s, s * 0.18);
  else if (shape === 'ios') ctx.roundRect(0, 0, s, s, s * 0.225);
  else if (shape === 'squircle') ctx.roundRect(0, 0, s, s, s * 0.3);
  else ctx.rect(0, 0, s, s);
}
function paintBg(ctx, w, h, a, b, gradient) {
  if (gradient && b && b !== a) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, a); g.addColorStop(1, b);
    ctx.fillStyle = g;
  } else ctx.fillStyle = a;
  ctx.fillRect(0, 0, w, h);
}
/** Motif seul (calque transparent) : le logo occupe L.size du carré. */
async function drawGlyph(L, s) {
  await loadFonts();
  const c = canvas(s, s);
  const ctx = c.getContext('2d');
  const box = s * Math.max(0.3, Math.min(0.95, Number(L.size) || 0.62));
  const family = (FONTS[L.font] || FONTS.urbanist)[1];
  const weight = Math.max(100, Math.min(900, Number(L.weight) || 700));
  const fg = isHex(L.fg) ? L.fg : '#FFFFFF';
  if (L.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.28)'; ctx.shadowBlur = s * 0.035; ctx.shadowOffsetY = s * 0.018; }
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const text = String(L.mode === 'name' ? (L.name || '') : (L.text || '')).trim();
  const stroke = Math.max(1, Math.min(3, (weight - 100) / 300 + 0.8));
  if (L.mode === 'symbol' || L.mode === 'both') {
    const img = await symbolImage(L.symbol, fg, stroke.toFixed(2));
    const sz = L.mode === 'both' && text ? box * 0.62 : box;
    const y = L.mode === 'both' && text ? s / 2 - box * 0.2 : s / 2;
    if (img) ctx.drawImage(img, s / 2 - sz / 2, y - sz / 2, sz, sz);
    if (L.mode === 'both' && text) {
      fitText(ctx, text.slice(0, 3).toUpperCase(), family, weight, box, box * 0.3);
      ctx.fillText(text.slice(0, 3).toUpperCase(), s / 2, s / 2 + box * 0.36);
    }
  } else if (text) {
    const t = L.mode === 'name' ? text : text.slice(0, 3).toUpperCase();
    fitText(ctx, t, family, weight, box, L.mode === 'name' ? box * 0.42 : box * 0.78);
    ctx.fillText(t, s / 2, s / 2 + s * 0.012);
  }
  return c;
}
/** Logo complet (fond et motif), dans une forme d'icône. */
async function drawLogo(L, s, shape = 'squircle') {
  const c = canvas(s, s);
  const ctx = c.getContext('2d');
  ctx.save();
  shapePath(ctx, s, shape);
  ctx.clip();
  paintBg(ctx, s, s, L.bg, L.bg2, L.gradient);
  ctx.drawImage(await drawGlyph(L, s), 0, 0);
  ctx.restore();
  return c;
}
async function loadImg(src) {
  if (!src) return null;
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}
/** Fond de l'écran de démarrage (sans logo ni texte : Splash.java les pose par-dessus). */
async function drawSplashBg(S, w, h) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const k = S.bgKind || 'solid';
  const a = isHex(S.bg) ? S.bg : '#FFFFFF';
  const b = isHex(S.bg2) ? S.bg2 : a;
  const acc = isHex(S.accent) ? S.accent : '#0A84FF';
  if (k === 'gradient') {
    const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
    g.addColorStop(0, a); g.addColorStop(1, b);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  } else if (k === 'aurora') {
    ctx.fillStyle = a; ctx.fillRect(0, 0, w, h);
    for (const [x, y, r, col, al] of [[0.15, 0.18, 0.75, acc, 0.55], [0.9, 0.35, 0.65, b, 0.6], [0.4, 0.95, 0.8, acc, 0.35]]) {
      const g = ctx.createRadialGradient(w * x, h * y, 0, w * x, h * y, Math.max(w, h) * r);
      g.addColorStop(0, `${col}${Math.round(al * 255).toString(16).padStart(2, '0')}`);
      g.addColorStop(1, `${col}00`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
  } else if (k === 'photo') {
    ctx.fillStyle = a; ctx.fillRect(0, 0, w, h);
    const img = await loadImg(S.photo);
    if (img) {
      const r = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      const iw = img.naturalWidth * r; const ih = img.naturalHeight * r;
      ctx.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih);
      ctx.fillStyle = a; ctx.globalAlpha = Math.max(0, Math.min(0.9, Number(S.veil) || 0)); ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
    }
  } else {
    ctx.fillStyle = a; ctx.fillRect(0, 0, w, h);
  }
  if (k === 'pattern') {
    ctx.save();
    ctx.globalAlpha = Math.max(0.04, Math.min(0.5, Number(S.patternOpacity) || 0.14));
    ctx.fillStyle = acc; ctx.strokeStyle = acc;
    const u = w / 14;
    const p = S.pattern || 'dots';
    if (p === 'dots') { for (let y = u / 2; y < h; y += u) for (let x = (Math.round(y / u) % 2 ? u : u / 2); x < w; x += u) { ctx.beginPath(); ctx.arc(x, y, u * 0.12, 0, Math.PI * 2); ctx.fill(); } }
    if (p === 'grid') { ctx.lineWidth = Math.max(1, u * 0.04); for (let x = 0; x < w; x += u) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); } for (let y = 0; y < h; y += u) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); } }
    if (p === 'diagonal') { ctx.lineWidth = u * 0.18; for (let x = -h; x < w; x += u * 1.1) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + h, 0); ctx.stroke(); } }
    if (p === 'waves') { ctx.lineWidth = u * 0.1; for (let y = u; y < h + u; y += u * 1.2) { ctx.beginPath(); for (let x = 0; x <= w; x += u / 4) ctx.lineTo(x, y + Math.sin(x / u * 1.6) * u * 0.28); ctx.stroke(); } }
    if (p === 'confetti') { let seed = 7; const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }; for (let i = 0; i < 90; i++) { ctx.save(); ctx.translate(rnd() * w, rnd() * h); ctx.rotate(rnd() * Math.PI); ctx.fillRect(-u * 0.18, -u * 0.06, u * 0.36, u * 0.12); ctx.restore(); } }
    ctx.restore();
  }
  return c;
}
/** Aperçu complet : fond, logo, nom et accroche, comme sur le téléphone. */
async function drawSplashPreview(cfg, S, L, w, h, iconImg) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.save();
  ctx.beginPath(); ctx.roundRect(0, 0, w, h, w * 0.11); ctx.clip();
  ctx.drawImage(await drawSplashBg(S, w, h), 0, 0);
  const dp = w / 412;
  const size = Math.max(64, Math.min(260, Number(cfg.splash.logoSize) || 150)) * dp;
  const textColor = cfg.splash.textColor || (luminance(S.bg) > 0.6 ? '#1D1D1F' : '#FFFFFF');
  let logoImg = null;
  if (S.logo === 'logo') logoImg = await drawGlyph(L, 512);
  else if (S.logo === 'icon') logoImg = iconImg;
  const hasName = cfg.splash.showName && cfg.appName;
  const blockH = size + (hasName ? 34 * dp : 0) + (cfg.splash.tagline ? 22 * dp : 0);
  let y = h / 2 - blockH / 2;
  if (logoImg) ctx.drawImage(logoImg, w / 2 - size / 2, y, size, size);
  y += size + 12 * dp;
  ctx.fillStyle = textColor; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  if (hasName) { ctx.font = `700 ${22 * dp}px Inter, system-ui, sans-serif`; ctx.fillText(cfg.appName, w / 2, y, w * 0.86); y += 32 * dp; }
  if (cfg.splash.tagline) { ctx.globalAlpha = 0.78; ctx.font = `500 ${14 * dp}px Inter, system-ui, sans-serif`; ctx.fillText(cfg.splash.tagline, w / 2, y, w * 0.86); ctx.globalAlpha = 1; }
  // Barre d'état et barre de gestes, pour situer l'écran.
  ctx.fillStyle = textColor; ctx.globalAlpha = 0.85;
  ctx.font = `600 ${12 * dp}px Inter, system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.fillText('9:41', 22 * dp, 14 * dp);
  ctx.beginPath(); ctx.roundRect(w / 2 - 54 * dp, h - 14 * dp, 108 * dp, 4 * dp, 2 * dp); ctx.fill();
  ctx.restore();
  return c;
}
// Idées : variantes tirées du nom et des palettes (même tirage tant que le nom ne change pas).
function ideas(cfg, round = 0) {
  const L = logoOf(cfg);
  const syms = suggestSymbols(cfg.appName);
  const pals = Object.keys(PALETTES);
  const modes = ['initials', 'symbol', 'both', 'initials', 'symbol', 'name', 'both', 'symbol'];
  const fonts = ['urbanist', 'serif', 'rounded', 'inter', 'mono', 'urbanist', 'system', 'serif'];
  let h = round * 7919;
  for (const ch of String(cfg.appName || 'app')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return modes.map((mode, i) => {
    const pk = pals[(h + i * 3) % pals.length];
    const p = PALETTES[pk];
    return {
      ...L, mode, palette: pk, bg: p[1], bg2: p[2], fg: p[3], gradient: (h + i) % 3 !== 0, font: fonts[(i + round) % fonts.length],
      weight: [700, 800, 600, 500][(h + i) % 4], symbol: syms[(i + round) % syms.length] || 'sparkle', text: initialsOf(cfg.appName), name: cfg.appName || L.name, shadow: i % 4 === 1, size: mode === 'name' ? 0.8 : 0.62,
    };
  });
}

// ---------------------------------------------------------------- section
export function install(proto, SECTIONS) {
  const at = SECTIONS.findIndex((s) => s[0] === 'icon');
  if (!SECTIONS.some((s) => s[0] === SECTION[0])) SECTIONS.splice(at < 0 ? SECTIONS.length : at + 1, 0, SECTION);

  proto.form_brand = function formBrand(cfg) {
    const L = logoOf(cfg);
    const S = splashOf(cfg);
    this.nxBrandBind();
    const seg = (key, val, opts, attr = 'data-nxl-set') => `<div class="seg nxab-seg" role="radiogroup">${Object.entries(opts).map(([v, l]) => `<button type="button" role="radio" aria-checked="${val === v}" class="${val === v ? 'on' : ''}" ${attr}="${key}" data-val="${v}">${l}</button>`).join('')}</div>`;
    const range = (label, key, v, min, max, step, fmt, attr = 'data-nxl') => `<label class="field nxab-range"><span>${label} <b data-nxl-out="${key}">${fmt(v)}</b></span><input type="range" ${attr}="${key}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`;
    const color = (label, key, v, attr = 'data-nxl') => `<label class="field nxab-color"><span>${label}</span><span class="ab-color-row"><input type="color" ${attr}="${key}" value="${esc(v)}"><input class="input" ${attr}="${key}" value="${esc(v)}" spellcheck="false"></span></label>`;
    const usesSymbol = L.mode === 'symbol' || L.mode === 'both';
    const all = this.nxBrandAllSymbols ? Object.keys(LUCIDE).sort() : PICKS.filter((k) => LUCIDE[k]);
    const q = (this.nxBrandQuery || '').toLowerCase();
    const syms = all.filter((k) => !q || k.toLowerCase().includes(q));
    let h = this.card('Créateur de logo', `
      <p class="ab-hint">Créez le logo de l’application en quelques secondes : il devient son icône (toutes les tailles, rondes, Samsung, iPhone et icône à thème d’Android 13+) et peut servir sur l’écran de démarrage.</p>
      <div class="nxab">
        <div class="nxab-stage">
          <canvas class="nxab-main" width="440" height="440" data-nxl-main aria-label="Aperçu du logo"></canvas>
          <div class="nxab-shapes">${[['squircle', 'Pixel'], ['circle', 'Rond'], ['rounded', 'Samsung'], ['ios', 'iPhone']].map(([k, l]) => `<figure><canvas width="112" height="112" data-nxl-shape="${k}"></canvas><figcaption>${l}</figcaption></figure>`).join('')}</div>
        </div>
        <div class="nxab-ctl">
          <div class="nxab-row"><span class="nxab-lb">Contenu</span>${seg('mode', L.mode, MODES)}</div>
          ${L.mode === 'symbol' ? '' : `<label class="field"><span>${L.mode === 'name' ? 'Nom affiché' : 'Initiales (3 lettres au plus)'}</span><input class="input" data-nxl="${L.mode === 'name' ? 'name' : 'text'}" value="${esc(L.mode === 'name' ? L.name : L.text)}" maxlength="${L.mode === 'name' ? 24 : 3}" spellcheck="false"></label>`}
          ${usesSymbol ? `<div class="nxab-sym">
            <div class="nxab-sym-head"><span class="nxab-lb">Symbole</span><input class="input nxab-search" data-nxl-search placeholder="Rechercher (heart, cart, music…)" value="${esc(this.nxBrandQuery || '')}" spellcheck="false"><button type="button" class="btn small" data-act="brand-all-symbols">${this.nxBrandAllSymbols ? 'Suggestions' : `Tous (${Object.keys(LUCIDE).length})`}</button></div>
            <div class="nxab-sym-grid">${syms.slice(0, 120).map((k) => `<button type="button" class="nxab-sym-btn${L.symbol === k ? ' on' : ''}" data-nxl-symbol="${esc(k)}" title="${esc(k)}" aria-label="${esc(k)}"><svg viewBox="0 0 24 24" width="20" height="20" stroke-width="2">${LUCIDE[k]}</svg></button>`).join('') || '<p class="ab-hint">Aucun symbole ne correspond.</p>'}</div>
          </div>` : ''}
          <div class="nxab-row"><span class="nxab-lb">Police</span>${seg('font', L.font, Object.fromEntries(Object.entries(FONTS).map(([k, [l, f]]) => [k, `<span style="font-family:${esc(f)}">${l}</span>`])))}</div>
          <div class="ab-grid2">${range('Épaisseur', 'weight', L.weight, 300, 900, 100, (v) => v)}${range('Taille du motif', 'size', L.size, 0.35, 0.9, 0.01, (v) => `${Math.round(v * 100)} %`)}</div>
          <div class="nxab-row"><span class="nxab-lb">Couleurs</span><div class="nxab-pals">${Object.entries(PALETTES).map(([k, [l, a, b, f]]) => `<button type="button" class="nxab-pal${L.palette === k ? ' on' : ''}" data-nxl-palette="${k}" title="${esc(l)}" aria-label="${esc(l)}" style="--a:${a};--b:${b};--f:${f}"><i></i></button>`).join('')}</div></div>
          <div class="nxab-colors">${color('Fond', 'bg', L.bg)}${L.gradient ? color('Second fond', 'bg2', L.bg2) : ''}${color('Motif', 'fg', L.fg)}</div>
          <div class="nxab-togs"><label class="check-row"><input type="checkbox" data-nxl-check="gradient" ${L.gradient ? 'checked' : ''}><span class="box"></span><span>Dégradé</span></label><label class="check-row"><input type="checkbox" data-nxl-check="shadow" ${L.shadow ? 'checked' : ''}><span class="box"></span><span>Ombre douce</span></label></div>
        </div>
      </div>
      <div class="nxab-ideas"><div class="nxab-ideas-head"><b>Idées pour « ${esc(cfg.appName || 'votre application')} »</b><button type="button" class="btn small" data-act="brand-ideas">${icon('restart', 13)}<span>Autres idées</span></button></div>
        <div class="nxab-ideas-grid">${Array.from({ length: 8 }, (_, i) => `<button type="button" class="nxab-idea" data-nxl-idea="${i}" aria-label="Idée ${i + 1}"><canvas width="96" height="96" data-nxl-idea-c="${i}"></canvas></button>`).join('')}</div></div>
      <div class="ab-row nxab-acts"><button class="btn small primary" data-act="brand-use-icon">${icon('check', 13)}<span>Utiliser comme icône de l’application</span></button><button class="btn small" data-act="brand-use-splash">${icon('image', 13)}<span>Utiliser sur l’écran de démarrage</span></button><button class="btn small" data-act="brand-save-png">${icon('download', 13)}<span>Enregistrer le PNG…</span></button></div>`);
    h += this.card('Créateur d’écran de démarrage', `
      <p class="ab-hint">Composez l’écran qui s’affiche pendant l’ouverture de l’application : un modèle, un fond, votre logo, un texte et une animation. Le fond est intégré à l’application (pour tous les formats d’écran) ; le logo, le nom et l’accroche restent nets à toutes les tailles.</p>
      <div class="nxs">
        <div class="nxs-phone"><canvas width="270" height="585" data-nxs-prev aria-label="Aperçu de l’écran de démarrage"></canvas></div>
        <div class="nxs-ctl">
          <div class="nxab-row"><span class="nxab-lb">Modèles</span><div class="nxs-tpls">${Object.entries(TEMPLATES).map(([k, [l]]) => `<button type="button" class="nxs-tpl${S.template === k ? ' on' : ''}" data-nxs-tpl="${k}"><canvas width="66" height="132" data-nxs-tpl-c="${k}"></canvas><small>${l}</small></button>`).join('')}</div></div>
          <div class="nxab-row"><span class="nxab-lb">Fond</span>${seg('bgKind', S.bgKind, SPLASH_BG, 'data-nxs-set')}</div>
          <div class="nxab-colors">${color(S.bgKind === 'photo' ? 'Voile' : 'Fond', 'bg', S.bg, 'data-nxs')}${['gradient', 'aurora'].includes(S.bgKind) ? color('Second fond', 'bg2', S.bg2, 'data-nxs') : ''}${['aurora', 'pattern'].includes(S.bgKind) ? color(S.bgKind === 'pattern' ? 'Motif' : 'Lumière', 'accent', S.accent, 'data-nxs') : ''}</div>
          ${S.bgKind === 'pattern' ? `<div class="ab-grid2"><label class="field"><span>Motif</span><select class="input" data-nxs="pattern">${Object.entries(PATTERNS).map(([v, l]) => `<option value="${v}" ${S.pattern === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>${range('Intensité', 'patternOpacity', S.patternOpacity, 0.04, 0.5, 0.01, (v) => `${Math.round(v * 100)} %`, 'data-nxs')}</div>` : ''}
          ${S.bgKind === 'photo' ? `<div class="ab-row"><button type="button" class="btn small" data-act="brand-pick-photo">${icon('image', 13)}<span>${S.photo ? 'Changer la photo' : 'Choisir une photo'}</span></button></div>${range('Voile sur la photo', 'veil', S.veil, 0, 0.9, 0.01, (v) => `${Math.round(v * 100)} %`, 'data-nxs')}` : ''}
          <div class="nxab-row"><span class="nxab-lb">Logo</span>${seg('logo', S.logo, LOGO_SRC, 'data-nxs-set')}</div>
          ${S.logo === 'none' ? '' : `<label class="field nxab-range"><span>Taille du logo <b data-nxl-out="logoSize">${Math.round(cfg.splash.logoSize || 150)} dp</b></span><input type="range" min="72" max="240" step="2" data-nxs-splash="logoSize" value="${cfg.splash.logoSize || 150}"></label>`}
          <div class="nxab-togs"><label class="check-row"><input type="checkbox" data-nxs-splash-check="showName" ${cfg.splash.showName ? 'checked' : ''}><span class="box"></span><span>Nom de l’application sous le logo</span></label></div>
          <div class="ab-grid2"><label class="field"><span>Phrase d’accroche</span><input class="input" data-nxs-splash="tagline" value="${esc(cfg.splash.tagline || '')}" placeholder="Le marché dans votre poche" maxlength="60"></label>${color('Couleur du texte', 'textColor', cfg.splash.textColor || (luminance(S.bg) > 0.6 ? '#1D1D1F' : '#FFFFFF'), 'data-nxs-splash')}</div>
          <div class="nxab-row"><span class="nxab-lb">Animation</span><div class="nxs-motions">${Object.entries(MOTIONS).map(([k, [l]]) => `<button type="button" class="chip${S.motion === k ? ' on' : ''}" data-nxs-motion="${k}">${l}</button>`).join('')}</div></div>
        </div>
      </div>
      <div class="ab-row nxab-acts"><button class="btn small primary" data-act="brand-apply-splash">${icon('check', 13)}<span>Appliquer à l’application</span></button><button class="btn small" data-act="replay-splash">${icon('play', 13)}<span>Voir l’animation</span></button>${cfg.splash.bgImage ? `<button class="btn small" data-act="brand-clear-splash">${icon('trash', 13)}<span>Retirer le fond créé</span></button>` : ''}</div>
      ${cfg.splash.bgImage ? `<p class="ab-hint">${icon('check', 12)} Fond créé appliqué : il s’affiche dès l’ouverture de l’application, derrière le logo.</p>` : ''}`);
    return h;
  };

  // Lien vers le créateur depuis la section « Icône et démarrage ».
  const formIcon0 = proto.form_icon;
  proto.form_icon = function formIcon(cfg) {
    return `${this.card('', `<div class="nxab-promo">${icon('sparkle', 18)}<div><b>Pas encore de logo ?</b><small>Créez-le avec le créateur de logo, puis composez l’écran de démarrage.</small></div><button class="btn small primary" data-sec="brand">${icon('sparkle', 13)}<span>Créer un logo</span></button></div>`)}${formIcon0.call(this, cfg)}`;
  };

  proto.nxBrandBind = function nxBrandBind() {
    if (this.nxBrandBound || !this.el) return;
    this.nxBrandBound = true;
    const redraw = () => { clearTimeout(this.nxBrandT); this.nxBrandT = setTimeout(() => this.nxBrandDraw(), 60); };
    const setL = (k, v, rerender = false) => { const L = logoOf(this.cfg); L[k] = v; if (['bg', 'bg2', 'fg'].includes(k)) L.palette = ''; this.set(`brand.logo.${k}`, v, { rerender }); if (!rerender) redraw(); };
    const setS = (k, v, rerender = false) => { splashOf(this.cfg)[k] = v; this.set(`brand.splash.${k}`, v, { rerender }); if (!rerender) redraw(); };
    const out = (k, txt) => { const o = $(`[data-nxl-out="${k}"]`, this.el); if (o) o.textContent = txt; };
    this.el.addEventListener('input', (e) => {
      const t = e.target;
      if (this.section !== 'brand') return;
      if (t.dataset.nxl) {
        const k = t.dataset.nxl;
        let v = t.value;
        if (['weight', 'size'].includes(k)) { v = Number(v); out(k, k === 'size' ? `${Math.round(v * 100)} %` : v); }
        if (['bg', 'bg2', 'fg'].includes(k) && !isHex(v)) return;
        if (['bg', 'bg2', 'fg'].includes(k)) for (const o of $$(`[data-nxl="${k}"]`, this.el)) if (o !== t) o.value = v;
        setL(k, k === 'text' ? v.toUpperCase().slice(0, 3) : v);
      } else if (t.dataset.nxs) {
        const k = t.dataset.nxs;
        let v = t.value;
        if (['patternOpacity', 'veil'].includes(k)) { v = Number(v); out(k, `${Math.round(v * 100)} %`); }
        if (['bg', 'bg2', 'accent'].includes(k) && !isHex(v)) return;
        if (['bg', 'bg2', 'accent'].includes(k)) for (const o of $$(`[data-nxs="${k}"]`, this.el)) if (o !== t) o.value = v;
        setS(k, v);
      } else if (t.dataset.nxsSplash) {
        const k = t.dataset.nxsSplash;
        let v = t.value;
        if (k === 'logoSize') { v = Number(v); out('logoSize', `${v} dp`); }
        if (k === 'textColor') { if (!isHex(v)) return; for (const o of $$('[data-nxs-splash="textColor"]', this.el)) if (o !== t) o.value = v; }
        this.set(`splash.${k}`, v);
        redraw();
      } else if (t.dataset.nxlSearch !== undefined) {
        this.nxBrandQuery = t.value;
        clearTimeout(this.nxBrandQ);
        this.nxBrandQ = setTimeout(() => { const pos = t.selectionStart; this.renderForm(); const n = $('[data-nxl-search]', this.el); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 220);
      }
    });
    this.el.addEventListener('change', (e) => {
      const t = e.target;
      if (this.section !== 'brand') return;
      if (t.dataset.nxlCheck) setL(t.dataset.nxlCheck, t.checked, t.dataset.nxlCheck === 'gradient');
      if (t.dataset.nxsSplashCheck) { this.set(`splash.${t.dataset.nxsSplashCheck}`, t.checked); redraw(); }
      if (t.dataset.nxs === 'pattern') setS('pattern', t.value);
    });
    this.el.addEventListener('click', (e) => {
      if (this.section !== 'brand') return;
      let b;
      if ((b = e.target.closest('[data-nxl-set]'))) { setL(b.dataset.nxlSet, b.dataset.val, true); return; }
      if ((b = e.target.closest('[data-nxl-symbol]'))) { setL('symbol', b.dataset.nxlSymbol); for (const x of $$('[data-nxl-symbol]', this.el)) x.classList.toggle('on', x === b); return; }
      if ((b = e.target.closest('[data-nxl-palette]'))) {
        const p = PALETTES[b.dataset.nxlPalette];
        const L = logoOf(this.cfg);
        Object.assign(L, { palette: b.dataset.nxlPalette, bg: p[1], bg2: p[2], fg: p[3] });
        this.set('brand.logo', { ...L }, { rerender: true });
        return;
      }
      if ((b = e.target.closest('[data-nxl-idea]'))) {
        const idea = (this.nxBrandIdeas || [])[Number(b.dataset.nxlIdea)];
        if (idea) { this.set('brand.logo', { ...idea }, { rerender: true }); toast('Idée reprise : ajustez-la, puis utilisez-la comme icône.'); }
        return;
      }
      if ((b = e.target.closest('[data-nxs-set]'))) { setS(b.dataset.nxsSet, b.dataset.val, true); return; }
      if ((b = e.target.closest('[data-nxs-tpl]'))) { this.nxBrandTemplate(b.dataset.nxsTpl); return; }
      if ((b = e.target.closest('[data-nxs-motion]'))) {
        const m = MOTIONS[b.dataset.nxsMotion];
        splashOf(this.cfg).motion = b.dataset.nxsMotion;
        this.set('brand.splash.motion', b.dataset.nxsMotion);
        this.set('splash.intro', m[1]);
        this.set('splash.anim', m[2]);
        for (const x of $$('[data-nxs-motion]', this.el)) x.classList.toggle('on', x === b);
        this.preview = 'splash';
        this.renderPreview();
        setTimeout(() => { if (this.act_replay_splash) this.act_replay_splash(); }, 200);
      }
    });
    // Fond créé : posé sur l'écran de démarrage de l'aperçu du téléphone (simulation du lancement comprise).
    const paint = () => {
      const img = this.cfg && this.cfg.splash && this.cfg.splash.bgImage;
      for (const sp of $$('.ab-sp', this.el)) {
        if (img) { sp.style.backgroundImage = `url("${img}")`; sp.style.backgroundSize = 'cover'; sp.style.backgroundPosition = 'center'; } else sp.style.backgroundImage = '';
      }
    };
    new MutationObserver(paint).observe(this.el, { childList: true, subtree: true });
  };

  proto.nxBrandTemplate = function nxBrandTemplate(k) {
    const S = splashOf(this.cfg);
    const L = logoOf(this.cfg);
    const t = TEMPLATES[k];
    if (!t) return;
    const next = { ...S, template: k, ...t[1] };
    if (k === 'minimal') Object.assign(next, { bg: '#FFFFFF', accent: L.bg });
    if (k === 'dark') Object.assign(next, { bg: '#0B0B0F', accent: L.bg });
    if (k === 'gradient') Object.assign(next, { bg: L.bg, bg2: L.bg2 });
    if (k === 'aurora') Object.assign(next, { bg: luminance(L.bg) > 0.5 ? '#0B0B0F' : '#0B0B0F', bg2: L.bg2, accent: L.bg });
    if (k === 'pattern') Object.assign(next, { bg: '#FFFFFF', accent: L.bg, pattern: S.pattern || 'dots', patternOpacity: 0.14 });
    if (k === 'photo') Object.assign(next, { bg: '#000000', veil: 0.35 });
    delete next.light;
    this.cfg.brand.splash = next;
    this.set('brand.splash', next);
    this.set('splash.textColor', luminance(next.bg) > 0.6 ? '#1D1D1F' : '#FFFFFF', { rerender: true });
    if (k === 'photo' && !next.photo) this.act_brand_pick_photo();
  };

  proto.nxBrandDraw = async function nxBrandDraw() {
    if (this.section !== 'brand' || !this.el) return;
    const token = (this.nxBrandTok = (this.nxBrandTok || 0) + 1);
    const cfg = this.cfg;
    const L = logoOf(cfg);
    const S = splashOf(cfg);
    const put = (cv, src) => { if (!cv || token !== this.nxBrandTok) return; const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(src, 0, 0, cv.width, cv.height); };
    put($('[data-nxl-main]', this.el), await drawLogo(L, 440, 'ios'));
    for (const cv of $$('[data-nxl-shape]', this.el)) put(cv, await drawLogo(L, 224, cv.dataset.nxlShape));
    this.nxBrandIdeas = ideas(cfg, this.nxBrandRound || 0);
    for (const cv of $$('[data-nxl-idea-c]', this.el)) put(cv, await drawLogo(this.nxBrandIdeas[Number(cv.dataset.nxlIdeaC)], 192, 'ios'));
    let iconImg = null;
    if (S.logo === 'icon') {
      if (!this.iconPrev && this.updateIconPreviews) await this.updateIconPreviews();
      iconImg = await loadImg(this.iconPrev && this.iconPrev.splash);
    }
    put($('[data-nxs-prev]', this.el), await drawSplashPreview(cfg, S, L, 540, 1170, iconImg));
    for (const cv of $$('[data-nxs-tpl-c]', this.el)) {
      const k = cv.dataset.nxsTplC;
      const T = { ...S, ...TEMPLATES[k][1] };
      if (k === 'minimal') Object.assign(T, { bg: '#FFFFFF', accent: L.bg });
      if (k === 'dark') Object.assign(T, { bg: '#0B0B0F' });
      if (k === 'gradient') Object.assign(T, { bg: L.bg, bg2: L.bg2 });
      if (k === 'aurora') Object.assign(T, { bg: '#0B0B0F', bg2: L.bg2, accent: L.bg });
      if (k === 'pattern') Object.assign(T, { bg: '#FFFFFF', accent: L.bg });
      if (k === 'photo') Object.assign(T, { bg: '#2A2A2E', bgKind: S.photo ? 'photo' : 'gradient', bg2: '#5A5A60' });
      put(cv, await drawSplashPreview({ ...cfg, splash: { ...cfg.splash, showName: false, tagline: '', textColor: '' } }, T, L, 132, 264, iconImg));
    }
  };

  // Les canevas sont redessinés après chaque affichage de la section.
  const renderForm0 = proto.renderForm;
  proto.renderForm = function renderForm(...a) {
    const r = renderForm0.apply(this, a);
    if (this.section === 'brand') this.nxBrandDraw();
    return r;
  };

  proto.act_brand_all_symbols = function act() { this.nxBrandAllSymbols = !this.nxBrandAllSymbols; this.renderForm(); };
  proto.act_brand_ideas = function act() { this.nxBrandRound = (this.nxBrandRound || 0) + 1; this.nxBrandDraw(); };
  proto.act_brand_use_icon = async function act() {
    const L = logoOf(this.cfg);
    const fg = (await drawGlyph(L, 1024)).toDataURL('image/png');
    this.set('icon', {
      ...this.cfg.icon, image: fg, fill: 'logo', scale: 1, bg: L.bg, bg2: L.bg2, gradient: Boolean(L.gradient && L.bg2 && L.bg2 !== L.bg), letter: '',
    });
    this.set('brand.logo.applied', Date.now(), { rerender: true });
    toast('Logo appliqué : c’est maintenant l’icône de l’application (toutes les tailles sont générées à la construction).');
  };
  proto.act_brand_use_splash = async function act() {
    const L = logoOf(this.cfg);
    this.set('splash.image', (await drawGlyph(L, 1024)).toDataURL('image/png'));
    splashOf(this.cfg).logo = 'logo';
    this.set('brand.splash.logo', 'logo', { rerender: true });
    this.preview = 'splash';
    this.renderPreview();
    toast('Logo placé sur l’écran de démarrage.');
  };
  proto.act_brand_save_png = async function act() {
    const L = logoOf(this.cfg);
    const c = await drawLogo(L, 1024, 'square');
    const bytes = await toBytes(c.toDataURL('image/png'));
    await saveBytes(bytes, { name: `Logo ${this.cfg.appName || 'application'}`, ext: 'png', kind: 'photo', project: this.cfg.appName || 'NEXORA', saveAs: true });
  };
  proto.act_brand_pick_photo = async function act() {
    const r = await api.invoke('dialog:open-file', { title: 'Choisir une photo de fond', filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }], asDataUrl: true }).catch(() => null);
    if (!r || !r.dataUrl) return;
    // Photo réduite à la taille d'un écran de téléphone : l'application reste légère.
    const img = await loadImg(r.dataUrl);
    let data = r.dataUrl;
    if (img) {
      const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = canvas(img.naturalWidth * k, img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      data = c.toDataURL('image/jpeg', 0.86);
    }
    splashOf(this.cfg).photo = data;
    splashOf(this.cfg).bgKind = 'photo';
    this.set('brand.splash', { ...splashOf(this.cfg) }, { rerender: true });
  };
  proto.act_brand_apply_splash = async function act() {
    const cfg = this.cfg;
    const S = splashOf(cfg);
    const L = logoOf(cfg);
    const bg = await drawSplashBg(S, 1080, 2400);
    this.set('splash.bgImage', bg.toDataURL('image/webp', 0.9));
    this.set('splash.bg', S.bg);
    if (S.logo === 'logo') this.set('splash.image', (await drawGlyph(L, 1024)).toDataURL('image/png'));
    else if (S.logo === 'none') this.set('splash.image', canvas(4, 4).toDataURL('image/png'));
    else this.set('splash.image', null);
    const m = MOTIONS[S.motion] || MOTIONS.soft;
    this.set('splash.intro', m[1]);
    this.set('splash.anim', m[2]);
    this.set('brand.splash.applied', Date.now(), { rerender: true });
    this.preview = 'splash';
    this.renderPreview();
    setTimeout(() => { if (this.act_replay_splash) this.act_replay_splash(); }, 250);
    toast('Écran de démarrage appliqué à l’application.');
  };
  proto.act_brand_clear_splash = function act() {
    this.set('splash.bgImage', null, { rerender: true });
    this.renderPreview();
  };

  // Construction : fond créé ajouté aux images de l'application (drawable-nodpi/vt_splash_bg.webp).
  const spec0 = proto.spec;
  proto.spec = async function spec() {
    const s = await spec0.call(this);
    const img = this.cfg.splash && this.cfg.splash.bgImage;
    if (img && /^data:image\/(webp|png)/.test(img)) {
      s.images = s.images || {};
      s.images[`drawable-nodpi/vt_splash_bg.${/^data:image\/png/.test(img) ? 'png' : 'webp'}`] = await toBytes(img);
    }
    return s;
  };
}
