// NEXORA #114 : créateur de logo et créateur d'écran de démarrage de l'App Builder.
// Le logo est dessiné dans NEXORA (initiales, symbole ou nom, forme, couleurs, police) puis devient l'icône de
// l'application (version pleine, que le lanceur Android découpe lui-même) ou le logo de l'écran de démarrage (version
// découpée, fond transparent autour). L'écran de démarrage reçoit un fond composé (couleur, dégradé, motif ou photo
// voilée) : image `drawable-nodpi/vt_splash_bg.webp` ajoutée à la construction, affichée par la coquille (Splash.java)
// derrière le logo, le nom et la phrase d'accroche, et dans l'aperçu « Démarrage » du téléphone.
import { esc, toast, makeCanvas, loadImage, dataUrlBytes, saveCanvas, pickFile, mixHex, luminance } from '../core.js';
import { a as ICONS } from '../../dist/chunks/chunk-S4I2LXHS.js';

export const SECTION_LOGO = ['logomaker', 'Créateur de logo', 'nxBrand', 'Initiales, symbole, formes et couleurs'];
export const SECTION_SPLASH = ['splashmaker', 'Créateur d’écran de démarrage', 'phone', 'Fond, logo, textes et animation'];

const FONTS = {
  urbanist: ['Moderne', 'Urbanist, "Segoe UI", sans-serif'],
  inter: ['Neutre', 'Inter, "Segoe UI", sans-serif'],
  serif: ['Classique', 'Georgia, "Times New Roman", serif'],
  narrow: ['Condensée', 'Bahnschrift, "Arial Narrow", "Roboto Condensed", sans-serif'],
  poster: ['Affiche', 'Impact, "Arial Black", sans-serif'],
  mono: ['Code', 'Consolas, "Cascadia Mono", "Courier New", monospace'],
};
const SHAPES = {
  squircle: 'Arrondi iOS', circle: 'Cercle', rounded: 'Carré arrondi', hexagon: 'Hexagone', shield: 'Écusson', none: 'Sans fond',
};
const SYMBOLS = ['cart', 'heart', 'chat', 'home', 'bolt', 'star', 'music', 'camera', 'gift', 'globe', 'rocket', 'sparkle', 'shield', 'bell', 'clock', 'cloud', 'sun', 'moon', 'car', 'key', 'lock', 'mail', 'user', 'nxUsers', 'phone', 'palette', 'pen', 'code', 'film', 'gamepad', 'bulb', 'target', 'wave', 'nxMug', 'nxCrown', 'nxCalendar', 'nxChart', 'nxTag', 'nxWorld', 'nxSend'];
const LOGO_PRESETS = [
  { id: 'minuit', name: 'Minuit', shape: 'squircle', bg: '#14161c', bg2: '#30353f', gradient: true, fg: '#ffffff', font: 'urbanist' },
  { id: 'ocean', name: 'Océan', shape: 'squircle', bg: '#0a5cff', bg2: '#00b8f0', gradient: true, fg: '#ffffff', font: 'urbanist' },
  { id: 'corail', name: 'Corail', shape: 'circle', bg: '#ff4f5a', bg2: '#ff9a5c', gradient: true, fg: '#ffffff', font: 'inter' },
  { id: 'foret', name: 'Forêt', shape: 'rounded', bg: '#0d6b52', bg2: '#35b487', gradient: true, fg: '#ffffff', font: 'narrow' },
  { id: 'prune', name: 'Prune', shape: 'hexagon', bg: '#4b1f7a', bg2: '#b34ae8', gradient: true, fg: '#ffffff', font: 'poster' },
  { id: 'sable', name: 'Sable', shape: 'circle', bg: '#f3e8d4', bg2: '#e2cfae', gradient: false, fg: '#3a2c18', font: 'serif' },
  { id: 'craie', name: 'Craie', shape: 'squircle', bg: '#ffffff', bg2: '#ececf1', gradient: false, fg: '#14161c', font: 'inter' },
  { id: 'neon', name: 'Néon', shape: 'shield', bg: '#0b0b10', bg2: '#1c1c28', gradient: true, fg: '#3dff8f', font: 'mono' },
];
const SPLASH_PRESETS = [
  { id: 'epure', name: 'Épuré clair', bg: 'color', c1: '#ffffff', c2: '#ececf1' },
  { id: 'nuit', name: 'Nuit', bg: 'color', c1: '#0b0c10', c2: '#1d2029' },
  { id: 'aurore', name: 'Aurore', bg: 'gradient', grad: 'linear', c1: '#2b1b6e', c2: '#ff6a88', angle: 160 },
  { id: 'lagon', name: 'Lagon', bg: 'gradient', grad: 'radial', c1: '#00c6c2', c2: '#004e7a', angle: 180 },
  { id: 'pastel', name: 'Pastel', bg: 'gradient', grad: 'linear', c1: '#fde2e4', c2: '#cddafd', angle: 135 },
  { id: 'points', name: 'Points', bg: 'pattern', pattern: 'dots', c1: '#111318', c2: '#ffffff' },
  { id: 'ondes', name: 'Ondes', bg: 'pattern', pattern: 'waves', c1: '#0a5cff', c2: '#ffffff' },
  { id: 'anneaux', name: 'Anneaux', bg: 'pattern', pattern: 'rings', c1: '#f3e8d4', c2: '#3a2c18' },
];
const PATTERNS = {
  dots: 'Points', grid: 'Grille', diagonal: 'Diagonales', waves: 'Ondes', rings: 'Anneaux',
};
const INTRO = {
  none: 'Aucune', pop: 'Apparition élastique', fadeUp: 'Montée en fondu', zoomOut: 'Zoom arrière', spin: 'Rotation', flip: 'Retournement 3D', bounce: 'Chute et rebond', swing: 'Balancier', pulse: 'Pulsation (boucle)', heartbeat: 'Battement de cœur (boucle)', shine: 'Reflet lumineux (boucle)', glow: 'Halo lumineux (boucle)', typewriter: 'Nom tapé à la machine', blurIn: 'Mise au point',
};
const EXIT = {
  fade: 'Fondu', zoom: 'Zoom et fondu', slideUp: 'Glissement vers le haut', shrink: 'Logo qui rétrécit', reveal: 'Ouverture circulaire', blur: 'Flou et fondu', none: 'Aucune',
};
const BG_W = 1080;
const BG_H = 2340;
const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? v : d);

function initials(name) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return 'A';
  return (w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)).toUpperCase();
}

/* Réglages du logo, complétés d'après l'application (nom, couleur d'accent). */
export function LM(cfg) {
  const m = cfg.logoMaker || (cfg.logoMaker = {});
  const accent = hex(cfg.accent, '#0a5cff');
  const def = {
    kind: 'letters', letters: initials(cfg.appName), symbol: 'cart', text: cfg.appName || 'Mon app', shape: 'squircle', bg: accent, bg2: mixHex(accent, '#000000', 0.35), gradient: true, fg: luminance(accent) > 0.55 ? '#14161c' : '#ffffff', font: 'urbanist', weight: '700', scale: 1, stroke: 2,
  };
  for (const [k, v] of Object.entries(def)) if (m[k] == null || m[k] === '') m[k] = v;
  return m;
}

/* Réglages du fond de l'écran de démarrage. */
export function SM(cfg) {
  const m = cfg.splashMaker || (cfg.splashMaker = {});
  const base = hex(cfg.splash && cfg.splash.bg, hex(cfg.icon && cfg.icon.bg, '#ffffff'));
  const def = {
    bg: 'color', c1: base, c2: mixHex(base, '#000000', 0.25), grad: 'linear', angle: 160, pattern: 'dots', patternAlpha: 0.16, photo: null, dim: 0.35, blur: 0, logo: 'icon',
  };
  for (const [k, v] of Object.entries(def)) if (m[k] == null) m[k] = v;
  return m;
}

// ---------------------------------------------------------------- dessin du logo
function shapePath(ctx, shape, x, y, s) {
  ctx.beginPath();
  if (shape === 'circle') { ctx.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2); return; }
  if (shape === 'hexagon') {
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      const px = x + s / 2 + (s / 2) * Math.cos(a);
      const py = y + s / 2 + (s / 2) * Math.sin(a);
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath();
    return;
  }
  if (shape === 'shield') {
    const r = s * 0.12;
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + s - r, y);
    ctx.quadraticCurveTo(x + s, y, x + s, y + r);
    ctx.lineTo(x + s, y + s * 0.5);
    ctx.bezierCurveTo(x + s, y + s * 0.78, x + s * 0.72, y + s * 0.92, x + s / 2, y + s);
    ctx.bezierCurveTo(x + s * 0.28, y + s * 0.92, x, y + s * 0.78, x, y + s * 0.5);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    return;
  }
  ctx.roundRect(x, y, s, s, shape === 'rounded' ? s * 0.14 : s * 0.225);
}
function fillBg(ctx, m, x, y, s) {
  if (m.gradient) {
    const g = ctx.createLinearGradient(x, y, x + s, y + s);
    g.addColorStop(0, hex(m.bg, '#0a5cff'));
    g.addColorStop(1, hex(m.bg2, '#003080'));
    ctx.fillStyle = g;
  } else ctx.fillStyle = hex(m.bg, '#0a5cff');
}
async function symbolImage(name, color, stroke) {
  const body = ICONS[name] || ICONS.star || '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="512" height="512" color="${color}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${body.replace(/currentColor/g, color)}</svg>`;
  return loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
}
function fitFont(ctx, text, font, weight, maxW, size) {
  let sz = size;
  for (let i = 0; i < 30; i++) {
    ctx.font = `${weight} ${sz}px ${font}`;
    if (ctx.measureText(text).width <= maxW) break;
    sz *= 0.92;
  }
  return sz;
}

/* Logo carré de `size` pixels. full : fond sur tout le carré (icône d'application, que le lanceur découpe) ;
 * sinon forme choisie, transparente autour (écran de démarrage, PNG). */
export async function drawLogo(m, size = 1024, { full = false } = {}) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const shape = full ? 'square' : m.shape;
  if (shape !== 'none') {
    ctx.save();
    if (shape === 'square') { ctx.beginPath(); ctx.rect(0, 0, size, size); } else shapePath(ctx, shape, 0, 0, size);
    fillBg(ctx, m, 0, 0, size);
    ctx.fill();
    ctx.restore();
  }
  // Zone sûre : icône adaptative d'Android (66 %) pour la version pleine.
  const zone = (full ? 0.62 : shape === 'none' ? 0.92 : 0.74) * size;
  const k = Math.max(0.5, Math.min(1.4, Number(m.scale) || 1));
  const fg = hex(m.fg, '#ffffff');
  const font = (FONTS[m.font] || FONTS.urbanist)[1];
  const cy = shape === 'shield' && !full ? size * 0.47 : size / 2;
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (m.kind === 'symbol') {
    const img = await symbolImage(m.symbol, fg, Math.max(1, Math.min(3, Number(m.stroke) || 2)));
    const s = zone * 0.78 * k;
    ctx.drawImage(img, size / 2 - s / 2, cy - s / 2, s, s);
  } else {
    const text = m.kind === 'text' ? String(m.text || '').trim() || 'Mon app' : String(m.letters || 'A').trim().slice(0, 3) || 'A';
    const base = m.kind === 'text' ? zone * 0.34 : zone * (text.length > 2 ? 0.46 : text.length > 1 ? 0.6 : 0.78);
    const sz = fitFont(ctx, text, font, m.weight || '700', zone * 0.94, base * k);
    ctx.font = `${m.weight || '700'} ${sz}px ${font}`;
    ctx.fillText(text, size / 2, cy + sz * 0.04);
  }
  return c;
}

// ---------------------------------------------------------------- fond de l'écran de démarrage
function linear(ctx, w, h, angle, c1, c2) {
  const a = ((Number(angle) || 0) - 90) * (Math.PI / 180);
  const r = Math.abs(w * Math.cos(a)) / 2 + Math.abs(h * Math.sin(a)) / 2;
  const g = ctx.createLinearGradient(w / 2 - Math.cos(a) * r, h / 2 - Math.sin(a) * r, w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  return g;
}
function drawPattern(ctx, w, h, kind, color, alpha) {
  ctx.save();
  ctx.globalAlpha = Math.max(0.03, Math.min(0.6, Number(alpha) || 0.16));
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  const u = w / 18;
  if (kind === 'dots') {
    for (let y = u / 2, row = 0; y < h; y += u, row += 1) for (let x = row % 2 ? u : u / 2; x < w; x += u) { ctx.beginPath(); ctx.arc(x, y, u * 0.12, 0, Math.PI * 2); ctx.fill(); }
  } else if (kind === 'grid') {
    ctx.lineWidth = u * 0.05;
    for (let x = 0; x <= w; x += u) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += u) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  } else if (kind === 'diagonal') {
    ctx.lineWidth = u * 0.22;
    for (let x = -h; x < w; x += u * 0.9) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + h, 0); ctx.stroke(); }
  } else if (kind === 'waves') {
    ctx.lineWidth = u * 0.08;
    for (let y = -u; y < h + u; y += u * 0.85) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) { const yy = y + Math.sin((x / w) * Math.PI * 4 + y / 90) * u * 0.32; if (x) ctx.lineTo(x, yy); else ctx.moveTo(x, yy); }
      ctx.stroke();
    }
  } else if (kind === 'rings') {
    ctx.lineWidth = u * 0.09;
    for (let r = u; r < Math.hypot(w, h); r += u * 0.9) { ctx.beginPath(); ctx.arc(w / 2, h * 0.45, r, 0, Math.PI * 2); ctx.stroke(); }
  }
  ctx.restore();
}

/* Fond composé (WebP en data URL), ou null pour une couleur unie (la coquille la peint elle-même). */
export async function drawSplashBg(sm, w = BG_W, h = BG_H) {
  if (sm.bg === 'color') return null;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const c1 = hex(sm.c1, '#ffffff');
  const c2 = hex(sm.c2, '#000000');
  if (sm.bg === 'gradient') {
    if (sm.grad === 'radial') {
      const g = ctx.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, Math.hypot(w, h) * 0.6);
      g.addColorStop(0, c1);
      g.addColorStop(1, c2);
      ctx.fillStyle = g;
    } else ctx.fillStyle = linear(ctx, w, h, sm.angle, c1, c2);
    ctx.fillRect(0, 0, w, h);
  } else if (sm.bg === 'pattern') {
    ctx.fillStyle = c1;
    ctx.fillRect(0, 0, w, h);
    drawPattern(ctx, w, h, sm.pattern, c2, sm.patternAlpha);
  } else if (sm.bg === 'image') {
    ctx.fillStyle = c1;
    ctx.fillRect(0, 0, w, h);
    if (sm.photo) {
      try {
        const img = await loadImage(sm.photo);
        const s = Math.max(w / img.width, h / img.height);
        const blur = Math.max(0, Math.min(40, Number(sm.blur) || 0));
        if (blur) ctx.filter = `blur(${blur * (w / 400)}px)`;
        const bw = img.width * s * (blur ? 1.08 : 1);
        const bh = img.height * s * (blur ? 1.08 : 1);
        ctx.drawImage(img, (w - bw) / 2, (h - bh) / 2, bw, bh);
        ctx.filter = 'none';
      } catch { /* photo illisible : couleur seule */ }
    }
    ctx.fillStyle = c1;
    ctx.globalAlpha = Math.max(0, Math.min(0.9, Number(sm.dim) || 0));
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
  return c.toDataURL('image/webp', 0.86);
}

// ---------------------------------------------------------------- sections
export function install(proto, SECTIONS) {
  const at = SECTIONS.findIndex((s) => s[0] === 'icon');
  [SECTION_LOGO, SECTION_SPLASH].forEach((sec, i) => {
    if (!SECTIONS.some((s) => s[0] === sec[0])) SECTIONS.splice(at < 0 ? SECTIONS.length : at + 1 + i, 0, sec);
  });

  proto.form_logomaker = function formLogo(cfg) {
    const m = LM(cfg);
    const kind = this.segK('logoMaker.kind', { letters: 'Initiales', symbol: 'Symbole', text: 'Nom' });
    let content = '';
    if (m.kind === 'symbol') {
      content = `<div class="nxb-symbols">${SYMBOLS.filter((s) => ICONS[s]).map((s) => `<button class="nxb-sym${m.symbol === s ? ' on' : ''}" data-act="brand-symbol" data-v="${s}" title="${esc(s)}"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[s]}</svg></button>`).join('')}</div>
        <label class="field"><span>Épaisseur du trait · ${Number(m.stroke).toFixed(1).replace('.', ',')}</span><input type="range" min="1" max="3" step="0.1" data-k="logoMaker.stroke" value="${m.stroke}"></label>`;
    } else if (m.kind === 'text') {
      content = this.field('Texte du logo', 'logoMaker.text', { placeholder: cfg.appName || 'Mon app' });
    } else {
      content = this.field('Initiales (3 lettres au plus)', 'logoMaker.letters', { placeholder: initials(cfg.appName) });
    }
    const fonts = Object.fromEntries(Object.entries(FONTS).map(([k, [n]]) => [k, n]));
    const palettes = [['#ffffff', '#14161c'], ['#14161c', '#ffffff'], ['#0a5cff', '#ffffff'], ['#ff4f5a', '#ffffff'], ['#0d6b52', '#ffffff'], ['#ffb020', '#14161c'], ['#4b1f7a', '#ffffff'], ['#f3e8d4', '#3a2c18']];
    return `<div class="nxb">${this.card('Aperçu', `
      <div class="nxb-logo-stage">
        <div class="nxb-logo-big"><img data-nxb="logo" alt="Logo"></div>
        <div class="nxb-ctx">
          <figure><span class="nxb-ic round"><img data-nxb="icon" alt=""></span><figcaption>Android</figcaption></figure>
          <figure><span class="nxb-ic squircle"><img data-nxb="icon" alt=""></span><figcaption>iPhone</figcaption></figure>
          <figure><span class="nxb-sp light"><img data-nxb="logo" alt=""></span><figcaption>Démarrage clair</figcaption></figure>
          <figure><span class="nxb-sp dark"><img data-nxb="logo" alt=""></span><figcaption>Démarrage sombre</figcaption></figure>
        </div>
      </div>
      <div class="ab-row nxb-actions">
        <button class="btn small primary" data-act="brand-use-icon"><span>Utiliser comme icône de l’application</span></button>
        <button class="btn small" data-act="brand-use-splash"><span>Utiliser sur l’écran de démarrage</span></button>
        <button class="btn small" data-act="brand-save"><span>Enregistrer le PNG</span></button>
      </div>
      <p class="ab-hint">L’icône est créée en pleine page : Android et iOS lui appliquent leur propre forme. Le logo de l’écran de démarrage garde la forme choisie.</p>`)}
      ${this.card('Modèles', `<div class="nxb-presets">${LOGO_PRESETS.map((p) => `<button class="nxb-preset" data-act="brand-logo-preset" data-v="${p.id}"><img data-nxb-preset="${p.id}" alt=""><span>${esc(p.name)}</span></button>`).join('')}</div>`)}
      ${this.card('Contenu', `${kind}${content}
        <div class="ab-grid2">${this.field('Police', 'logoMaker.font', { type: 'select', options: fonts })}${this.field('Graisse', 'logoMaker.weight', { type: 'select', options: { 400: 'Normale', 600: 'Demi-grasse', 700: 'Grasse', 800: 'Très grasse' } })}</div>
        <label class="field"><span>Taille · ${Math.round(Number(m.scale) * 100)} %</span><input type="range" min="0.5" max="1.4" step="0.01" data-k="logoMaker.scale" value="${m.scale}"></label>`)}
      ${this.card('Forme et couleurs', `${this.segK('logoMaker.shape', SHAPES)}
        <div class="ab-grid2">${this.field('Fond', 'logoMaker.bg', { type: 'color' })}${m.gradient ? this.field('Fond (2ᵉ couleur)', 'logoMaker.bg2', { type: 'color' }) : ''}</div>
        ${this.tog('Dégradé', 'logoMaker.gradient')}
        ${this.field('Couleur du symbole ou du texte', 'logoMaker.fg', { type: 'color' })}
        <div class="nxb-swatches">${palettes.map(([b, f]) => `<button class="nxb-sw" data-act="brand-palette" data-bg="${b}" data-fg="${f}" title="Fond ${b}, texte ${f}" style="background:${b};color:${f}">Aa</button>`).join('')}</div>`)}</div>`;
  };

  proto.form_splashmaker = function formSplash(cfg) {
    const sm = SM(cfg);
    const sp = cfg.splash;
    let bg = '';
    if (sm.bg === 'color') bg = this.field('Couleur', 'splashMaker.c1', { type: 'color' });
    else if (sm.bg === 'gradient') {
      bg = `${this.segK('splashMaker.grad', { linear: 'Linéaire', radial: 'Radial' })}
        <div class="ab-grid2">${this.field('Couleur de départ', 'splashMaker.c1', { type: 'color' })}${this.field('Couleur d’arrivée', 'splashMaker.c2', { type: 'color' })}</div>
        ${sm.grad === 'radial' ? '' : `<label class="field"><span>Angle · ${Math.round(sm.angle)}°</span><input type="range" min="0" max="360" step="5" data-k="splashMaker.angle" value="${sm.angle}"></label>`}`;
    } else if (sm.bg === 'pattern') {
      bg = `${this.field('Motif', 'splashMaker.pattern', { type: 'select', options: PATTERNS })}
        <div class="ab-grid2">${this.field('Fond', 'splashMaker.c1', { type: 'color' })}${this.field('Couleur du motif', 'splashMaker.c2', { type: 'color' })}</div>
        <label class="field"><span>Intensité du motif · ${Math.round(sm.patternAlpha * 100)} %</span><input type="range" min="0.04" max="0.5" step="0.01" data-k="splashMaker.patternAlpha" value="${sm.patternAlpha}"></label>`;
    } else {
      bg = `<div class="ab-row"><button class="btn small" data-act="brand-splash-photo"><span>${sm.photo ? 'Changer la photo' : 'Choisir une photo'}</span></button>${sm.photo ? '<button class="btn small" data-act="brand-splash-photo-clear"><span>Retirer</span></button>' : ''}</div>
        ${this.field('Couleur du voile', 'splashMaker.c1', { type: 'color' })}
        <label class="field"><span>Voile · ${Math.round(sm.dim * 100)} %</span><input type="range" min="0" max="0.85" step="0.01" data-k="splashMaker.dim" value="${sm.dim}"></label>
        <label class="field"><span>Flou · ${Math.round(sm.blur)}</span><input type="range" min="0" max="30" step="1" data-k="splashMaker.blur" value="${sm.blur}"></label>`;
    }
    return `<div class="nxb">${this.card('Aperçu', `
      <div class="nxb-sp-stage">
        <div class="nxb-phone"><div class="nxb-phone-screen" data-nxb="splash"></div></div>
        <div class="nxb-sp-side">
          <p class="ab-hint">L’écran de démarrage s’affiche pendant le chargement de la page : fond composé, logo animé, nom et phrase d’accroche. L’aperçu du téléphone, à droite, rejoue l’animation réelle.</p>
          <div class="ab-row"><button class="btn small primary" data-act="replay-splash"><span>Voir l’animation</span></button></div>
        </div>
      </div>`)}
      ${this.card('Modèles', `<div class="nxb-presets tall">${SPLASH_PRESETS.map((p) => `<button class="nxb-preset" data-act="brand-splash-preset" data-v="${p.id}"><img data-nxb-spreset="${p.id}" alt=""><span>${esc(p.name)}</span></button>`).join('')}</div>`)}
      ${this.card('Fond', `${this.segK('splashMaker.bg', { color: 'Couleur', gradient: 'Dégradé', pattern: 'Motif', image: 'Photo' })}${bg}`)}
      ${this.card('Logo et textes', `${this.segK('splashMaker.logo', { icon: 'Icône de l’application', maker: 'Créateur de logo', custom: 'Image' })}
        ${sm.logo === 'custom' ? `<div class="ab-row"><button class="btn small" data-act="pick-splash"><span>${sp.image ? 'Changer l’image' : 'Choisir une image'}</span></button></div>` : ''}
        ${sm.logo === 'maker' ? '<p class="ab-hint">Le logo du créateur de logo, avec sa forme. Modifiez-le dans « Créateur de logo » : l’écran de démarrage suit.</p>' : ''}
        <label class="field"><span>Taille du logo · ${Math.round(sp.logoSize || 150)} dp</span><input type="range" min="72" max="240" step="2" data-k="splash.logoSize" value="${sp.logoSize || 150}"></label>
        ${this.tog('Nom de l’application sous le logo', 'splash.showName')}
        <div class="ab-grid2">${this.field('Phrase d’accroche', 'splash.tagline', { placeholder: 'Le marché dans votre poche' })}${this.field('Couleur du texte', 'splash.textColor', { type: 'color', placeholder: '' })}</div>`)}
      ${this.card('Animation', `<div class="ab-grid2">${this.field('Animation du logo', 'splash.intro', { type: 'select', options: INTRO })}${this.field('Animation de sortie', 'splash.anim', { type: 'select', options: EXIT })}</div>
        <div class="ab-grid2">${this.field('Durée minimale (ms)', 'splash.min', { type: 'number', min: 0, max: 5000, step: 100 })}${this.field('Durée maximale (ms)', 'splash.max', { type: 'number', min: 1500, max: 20000, step: 500 })}</div>`)}</div>`;
  };

  // Images des aperçus, redessinées après chaque affichage de la section et à chaque réglage.
  proto.nxBrandRefresh = async function nxBrandRefresh() {
    const root = this.el;
    if (!root) return;
    const cfg = this.cfg;
    if (this.section === 'logomaker') {
      const m = LM(cfg);
      const [logo, iconC] = await Promise.all([drawLogo(m, 512), drawLogo(m, 256, { full: true })]);
      const lu = logo.toDataURL();
      const iu = iconC.toDataURL();
      for (const im of root.querySelectorAll('[data-nxb="logo"]')) im.src = lu;
      for (const im of root.querySelectorAll('[data-nxb="icon"]')) im.src = iu;
      const key = [m.kind, m.letters, m.symbol, m.text, m.stroke].join('|');
      for (const im of root.querySelectorAll('[data-nxb-preset]')) {
        if (im.dataset.done === key) continue;
        const p = LOGO_PRESETS.find((x) => x.id === im.dataset.nxbPreset);
        // eslint-disable-next-line no-await-in-loop
        im.src = (await drawLogo({ ...m, ...p }, 160)).toDataURL();
        im.dataset.done = key;
      }
    }
    if (this.section === 'splashmaker') {
      const sm = SM(cfg);
      // Réglages repris d'une sauvegarde ou d'un autre PC : fond et logo produits à la première ouverture.
      if ((sm.bg !== 'color' && !cfg.splash.bgImage) || (sm.logo === 'maker' && !cfg.splash.image)) { await this.nxSplashBgUpdate(); return; }
      const box = root.querySelector('[data-nxb="splash"]');
      const logo = await this.nxSplashLogo();
      const sp = cfg.splash;
      const bgc = hex(sp.bg, hex(cfg.icon.bg, '#ffffff'));
      const ink = sp.textColor || (luminance(bgc) > 0.55 ? '#1d1d1f' : '#ffffff');
      if (box) {
        box.style.background = sp.bgImage ? `url('${sp.bgImage}') center/cover no-repeat, ${bgc}` : bgc;
        const size = Math.max(64, Math.min(260, Number(sp.logoSize) || 150));
        box.innerHTML = `<div class="nxb-sp-col" style="--lg:${(size / 3.6).toFixed(2)}cqw">${logo ? `<img src="${logo}" alt="">` : ''}${sp.showName && cfg.appName ? `<b style="color:${esc(ink)}">${esc(cfg.appName)}</b>` : ''}${sp.tagline ? `<small style="color:${esc(ink)}">${esc(sp.tagline)}</small>` : ''}</div>`;
      }
      for (const im of root.querySelectorAll('[data-nxb-spreset]')) {
        if (im.dataset.done) continue;
        const p = SPLASH_PRESETS.find((x) => x.id === im.dataset.nxbSpreset);
        const merged = { ...sm, ...p, photo: null };
        // eslint-disable-next-line no-await-in-loop
        const url = await drawSplashBg(merged, 216, 468);
        const c = makeCanvas(216, 468);
        const ctx = c.getContext('2d');
        ctx.fillStyle = hex(merged.c1, '#ffffff');
        ctx.fillRect(0, 0, 216, 468);
        // eslint-disable-next-line no-await-in-loop
        if (url) ctx.drawImage(await loadImage(url), 0, 0);
        // eslint-disable-next-line no-await-in-loop
        if (logo) ctx.drawImage(await loadImage(logo), 68, 164, 80, 80);
        im.src = c.toDataURL();
        im.dataset.done = '1';
      }
    }
  };

  /* Logo affiché sur l'écran de démarrage, selon la source choisie. */
  proto.nxSplashLogo = async function nxSplashLogo() {
    const cfg = this.cfg;
    const sm = SM(cfg);
    if (sm.logo === 'maker') return (await drawLogo(LM(cfg), 512)).toDataURL();
    if (cfg.splash.image) return cfg.splash.image;
    if (this.iconPrev && this.iconPrev.splash) return this.iconPrev.splash;
    return (await drawLogo(LM(cfg), 512)).toDataURL();
  };

  // Fond régénéré après un réglage du créateur (couleur de base gardée pour la barre d'état et le texte).
  proto.nxSplashBgUpdate = async function nxSplashBgUpdate() {
    const cfg = this.cfg;
    const sm = SM(cfg);
    cfg.splash.bgImage = await drawSplashBg(sm);
    cfg.splash.bg = hex(sm.c1, cfg.splash.bg || '#ffffff');
    if (sm.logo === 'maker') cfg.splash.image = (await drawLogo(LM(cfg), 1024)).toDataURL();
    else if (sm.logo === 'icon') cfg.splash.image = null;
    this.save();
    if (this.updateIconPreviews) this.updateIconPreviews();
    this.renderPreview('splash.bg');
    this.nxBrandRefresh();
  };

  const render0 = proto.renderForm;
  proto.renderForm = function renderForm() {
    render0.call(this);
    if (this.section === 'logomaker' || this.section === 'splashmaker') setTimeout(() => this.nxBrandRefresh(), 0);
  };

  const set0 = proto.set;
  proto.set = function set(k, v, opts) {
    set0.call(this, k, v, opts);
    if (typeof k !== 'string') return;
    if (k.startsWith('logoMaker')) {
      clearTimeout(this.nxBrandT);
      this.nxBrandT = setTimeout(() => {
        this.nxBrandRefresh();
        if (SM(this.cfg).logo === 'maker') this.nxSplashBgUpdate();
      }, 90);
    } else if (k.startsWith('splashMaker')) {
      clearTimeout(this.nxSplashT);
      this.nxSplashT = setTimeout(() => this.nxSplashBgUpdate(), 120);
    } else if (this.section === 'splashmaker' && k.startsWith('splash')) {
      clearTimeout(this.nxSplashT);
      this.nxSplashT = setTimeout(() => this.nxBrandRefresh(), 90);
    }
  };

  proto.act_brand_symbol = function act(el) {
    this.set('logoMaker.symbol', el.dataset.v, { rerender: true });
  };
  proto.act_brand_palette = function act(el) {
    const m = LM(this.cfg);
    m.bg = el.dataset.bg;
    m.bg2 = mixHex(el.dataset.bg, luminance(el.dataset.bg) > 0.5 ? '#000000' : '#ffffff', 0.18);
    this.set('logoMaker.fg', el.dataset.fg, { rerender: true });
  };
  proto.act_brand_logo_preset = function act(el) {
    const p = LOGO_PRESETS.find((x) => x.id === el.dataset.v);
    if (!p) return;
    const m = LM(this.cfg);
    Object.assign(m, {
      shape: p.shape, bg: p.bg, bg2: p.bg2, gradient: p.gradient, fg: p.fg, font: p.font,
    });
    this.set('logoMaker.shape', p.shape, { rerender: true });
    toast(`Modèle « ${p.name} » appliqué.`);
  };
  proto.act_brand_use_icon = async function act() {
    const m = LM(this.cfg);
    const c = await drawLogo(m, 1024, { full: true });
    this.cfg.icon.fill = 'full';
    this.cfg.icon.bg = hex(m.bg, this.cfg.icon.bg);
    this.set('icon.image', c.toDataURL('image/png'));
    toast('Logo appliqué à l’icône de l’application : toutes les tailles seront générées à la construction.', { action: 'Voir l’icône', onAction: () => { this.section = 'icon'; this.renderNav(); this.renderForm(); } });
  };
  proto.act_brand_use_splash = async function act() {
    SM(this.cfg).logo = 'maker';
    await this.nxSplashBgUpdate();
    toast('Logo appliqué à l’écran de démarrage.', { action: 'Ouvrir le créateur', onAction: () => { this.section = 'splashmaker'; this.renderNav(); this.renderForm(); } });
  };
  proto.act_brand_save = async function act() {
    const c = await drawLogo(LM(this.cfg), 1024);
    await saveCanvas(c, {
      format: 'png', name: `Logo ${this.cfg.appName || 'application'}`, project: this.cfg.appName || 'NEXORA', background: null,
    });
  };
  proto.act_brand_splash_preset = function act(el) {
    const p = SPLASH_PRESETS.find((x) => x.id === el.dataset.v);
    if (!p) return;
    const sm = SM(this.cfg);
    const { id: _id, name, ...vals } = p;
    Object.assign(sm, vals);
    this.cfg.splash.textColor = '';
    this.set('splashMaker.bg', p.bg, { rerender: true });
    toast(`Modèle « ${name} » appliqué.`);
  };
  proto.act_brand_splash_photo = async function act() {
    const f = await pickFile({ title: 'Choisir une photo de fond', name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] });
    const url = f && (typeof f === 'string' ? f : f.dataUrl);
    if (!url) return;
    // Photo réduite (réglages légers, synchronisés avec le compte).
    const img = await loadImage(url);
    const s = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = makeCanvas(Math.round(img.width * s), Math.round(img.height * s));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    SM(this.cfg).photo = c.toDataURL('image/jpeg', 0.86);
    this.set('splashMaker.bg', 'image', { rerender: true });
  };
  proto.act_brand_splash_photo_clear = function act() {
    this.set('splashMaker.photo', null, { rerender: true });
  };

  // Section « Icône et démarrage » : accès aux deux créateurs.
  const icon0 = proto.form_icon;
  proto.form_icon = function formIcon(cfg) {
    return this.card('Créateurs', `<p class="ab-hint">Pas encore de logo ? Dessinez-le dans NEXORA, puis composez l’écran de démarrage (fond, logo, textes, animation).</p>
      <div class="ab-row"><button class="btn small" data-sec="logomaker"><span>Créateur de logo</span></button><button class="btn small" data-sec="splashmaker"><span>Créateur d’écran de démarrage</span></button></div>`) + icon0.call(this, cfg);
  };

  // Construction : fond composé ajouté aux images de l'application.
  const spec0 = proto.spec;
  proto.spec = async function spec() {
    const s = await spec0.call(this);
    const url = this.cfg.splash && this.cfg.splash.bgImage;
    if (s && url && /^data:image\/webp;base64,/.test(url) && s.mode !== 'twa') {
      s.images = s.images || {};
      s.images['drawable-nodpi/vt_splash_bg.webp'] = Array.from(dataUrlBytes(url));
    }
    return s;
  };
}
