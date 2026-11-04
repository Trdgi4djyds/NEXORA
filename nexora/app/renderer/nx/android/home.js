// NEXORA #024 : écrans d'appareils de l'aperçu de l'App Builder.
// - Écran d'accueil fidèle au système de l'appareil choisi : iOS 27 (iPhone, iPad), Pixel Launcher d'Android 17
//   (Pixel, Motorola, Nokia, appareils génériques), One UI 8.5 (Samsung) et surcouches des autres constructeurs
//   (HyperOS, HiOS, ColorOS…), en portrait, en paysage, sur pliable ouvert et sur tablette.
// - Fonds d'écran : photos sous licence Unsplash rangées dans ./walls (voir walls/CREDITS.md).
// - Application simulée : onglets, bouton flottant et menu latéral aux dimensions de la coquille Android
//   (MainActivity.java, Extras.java) ; barre d'onglets flottante d'iOS 26-27 sur iPhone, en haut sur iPad.
import { settings, saveSettings, popover, closePopover, toast, api, esc, ico, $ } from '../core.js';

// ---------------------------------------------------------------- fonds d'écran
const WALLS = [
  ['verre-liquide', 'Verre liquide', 'Dima Solomin'],
  ['lagon', 'Lagon', 'Richard Horvath'],
  ['graphite', 'Graphite', 'Philip Oroni'],
  ['aurore-fluide', 'Aurore fluide', 'Martin Martz'],
  ['vague-bleue', 'Vague bleue', 'Martin Martz'],
  ['soie-nocturne', 'Soie nocturne', 'Pawel Czerwinski'],
  ['pastel', 'Pastel', 'Milad Fakurian'],
  ['minuit', 'Minuit', 'BoliviaInteligente'],
  ['braise', 'Braise', 'Martin Martz'],
  ['jade', 'Jade', 'Pawel Czerwinski'],
  ['lac', 'Lac Louise', 'Daniel Roe'],
  ['aurore-boreale', 'Aurore boréale', 'Lucas Gallone'],
  ['dunes', 'Dunes', 'David Jowanka'],
];
const WALL_IDS = new Set(WALLS.map((w) => w[0]));
// Fond proposé d'office, dans l'esprit du fond livré avec chaque système.
const DEFAULT_WALL = { ios: 'verre-liquide', pixel: 'lagon', oneui: 'graphite', oem: 'aurore-fluide' };
const wallUrl = (id, mini = false) => new URL(`./walls/${mini ? 'mini/' : ''}${id}.jpg`, import.meta.url).href;

// ---------------------------------------------------------------- système de l'appareil
export function launcherOf(dev, os) {
  if (os === 'ios' || (dev && dev.os && /^(ios|ipados)$/.test(dev.os))) return 'ios';
  const s = `${(dev && dev.id) || ''} ${(dev && dev.name) || ''}`.toLowerCase();
  if (/galaxy|samsung/.test(s)) return 'oneui';
  if (/pixel|moto|nokia|android-|generic|surface/.test(s) || (dev && /^(pixel|moto|generic)$/.test(dev.category))) return 'pixel';
  return 'oem';
}

// ---------------------------------------------------------------- icônes (grille 24)
const G = {
  phone: '<path d="M7.2 3.5l2.6.3 1.3 4-1.9 1.4a10.6 10.6 0 0 0 5.6 5.6l1.4-1.9 4 1.3.3 2.6c0 1.2-1 2.2-2.2 2.2A15.6 15.6 0 0 1 5 5.7c0-1.2 1-2.2 2.2-2.2z" fill="currentColor"/>',
  chat: '<path d="M12 4c4.7 0 8.5 3 8.5 6.8S16.7 17.6 12 17.6c-.9 0-1.8-.1-2.6-.3L5 19.5l1.3-3.6C4.5 14.7 3.5 12.9 3.5 10.8 3.5 7 7.3 4 12 4z" fill="currentColor"/>',
  globe: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 12h16M12 4c2.4 2.3 3.5 5 3.5 8s-1.1 5.7-3.5 8c-2.4-2.3-3.5-5-3.5-8S9.6 6.3 12 4z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  camera: '<path d="M4 8.5A2 2 0 0 1 6 6.5h2l1.4-2h5.2l1.4 2h2a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="currentColor"/><circle cx="12" cy="12.6" r="3.6" fill="none" stroke="var(--nxh-cut,#fff)" stroke-width="1.8"/>',
  bag: '<path d="M5.5 8.5h13l-1 11h-11z" fill="currentColor"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
  flower: '<g transform="translate(12 12)" fill="currentColor"><ellipse rx="2.6" ry="5.4" transform="translate(0 -3.4)"/><ellipse rx="2.6" ry="5.4" transform="rotate(90) translate(0 -3.4)"/><ellipse rx="2.6" ry="5.4" transform="rotate(180) translate(0 -3.4)"/><ellipse rx="2.6" ry="5.4" transform="rotate(270) translate(0 -3.4)"/></g>',
  gear: '<path d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10.6 3.5h2.8l.5 2.3 1.8.8 2-1.3 2 2-1.3 2 .8 1.8 2.3.5v2.8l-2.3.5-.8 1.8 1.3 2-2 2-2-1.3-1.8.8-.5 2.3h-2.8l-.5-2.3-1.8-.8-2 1.3-2-2 1.3-2-.8-1.8-2.3-.5v-2.8l2.3-.5.8-1.8-1.3-2 2-2 2 1.3 1.8-.8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  clock: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  cal: '<rect x="4" y="5.5" width="16" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 9.8h16M8.5 3.5v3.5M15.5 3.5v3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  sun: '<circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M5.6 18.4l1.6-1.6M16.8 7.2l1.6-1.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  note: '<path d="M6 4h9l3 3v13H6z" fill="currentColor"/><path d="M9 11h6M9 14.5h6" stroke="var(--nxh-cut,#fff)" stroke-width="1.5" stroke-linecap="round"/>',
  music: '<path d="M9 17.5V6.5l10-2v11" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><circle cx="7" cy="17.5" r="2.4" fill="currentColor"/><circle cx="17" cy="15.5" r="2.4" fill="currentColor"/>',
  folder: '<path d="M3.5 7a1.5 1.5 0 0 1 1.5-1.5h4.4l1.8 2H19A1.5 1.5 0 0 1 20.5 9v8.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" fill="currentColor"/>',
  search: '<circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="m15 15 4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  mic: '<rect x="9" y="3.5" width="6" height="10.5" rx="3" fill="currentColor"/><path d="M6 11a6 6 0 0 0 12 0M12 17v3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  lens: '<path d="M4 9V6.5A2.5 2.5 0 0 1 6.5 4H9M15 4h2.5A2.5 2.5 0 0 1 20 6.5V9M20 15v2.5a2.5 2.5 0 0 1-2.5 2.5H15M9 20H6.5A2.5 2.5 0 0 1 4 17.5V15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="12" r="3" fill="currentColor"/>',
  cloud: '<path d="M7.5 18.5a4 4 0 0 1-.4-8 5.5 5.5 0 0 1 10.6 1.4 3.3 3.3 0 0 1-.2 6.6z" fill="currentColor"/>',
};
const mono = (k, s = 0.62) => `<g transform="translate(${12 - 12 * s} ${12 - 12 * s}) scale(${s})">${G[k]}</g>`;
const svg = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;

// Date du jour, comme sur un vrai téléphone.
function today() {
  const d = new Date();
  const wd = d.toLocaleDateString('fr-FR', { weekday: 'long' });
  return {
    day: d.getDate(),
    weekday: wd,
    wdShort: d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '').toUpperCase(),
    glance: d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }),
    long: d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
  };
}

// Dessins des icônes en couleurs : fond (CSS) et motif (SVG). Les logos de marque ne sont pas reproduits.
function art(id) {
  const t = today();
  switch (id) {
    case 'facetime': return ['linear-gradient(180deg,#5ff28b,#10c047)', '<rect x="4" y="8" width="11" height="8" rx="2.4" fill="#fff"/><path d="M15.6 11.3l4-2.5v6.4l-4-2.5z" fill="#fff"/>'];
    case 'calendar': return ['#fff', `<text x="12" y="8.3" font-family="Inter,system-ui,sans-serif" font-size="3.5" font-weight="600" fill="#ff3b30" text-anchor="middle">${t.wdShort.slice(0, 4)}</text><text x="12" y="19.4" font-family="Inter,system-ui,sans-serif" font-size="11.5" font-weight="300" fill="#1c1c1e" text-anchor="middle">${t.day}</text>`];
    case 'photos': {
      const c = ['#f9a11b', '#fcd116', '#8cc63f', '#2bb7a3', '#3b8fe6', '#8a5cc8', '#e8467c', '#f2552c'];
      return ['#fff', `<g transform="translate(12 12)">${c.map((col, i) => `<rect x="-2" y="-8.6" width="4" height="7.6" rx="2" fill="${col}" opacity=".85" transform="rotate(${i * 45})"/>`).join('')}</g>`];
    }
    case 'camera': return ['linear-gradient(180deg,#f4f4f6,#c6c6cc)', '<rect x="3.6" y="7" width="16.8" height="11.4" rx="3" fill="#1c1c1e"/><circle cx="12" cy="12.7" r="3.9" fill="#3a3a3c"/><circle cx="12" cy="12.7" r="2.6" fill="#0d1f3c"/><circle cx="11" cy="11.7" r=".8" fill="#5e8fd8"/><rect x="15.8" y="8.3" width="2.4" height="1.2" rx=".6" fill="#ffcc00"/>'];
    case 'mail': return ['linear-gradient(180deg,#25a8ff,#0866ef)', '<rect x="4" y="7" width="16" height="11" rx="1.8" fill="#fff"/><path d="M4.6 7.8 12 13.2l7.4-5.4" stroke="#1b7af2" stroke-width="1.2" fill="none"/>'];
    case 'notes': return ['#fff', '<rect width="24" height="7.4" fill="#ffd60a"/><path d="M4 11.6h16M4 15.1h16M4 18.6h16" stroke="#cfcfd4" stroke-width=".7" stroke-dasharray="1 .8"/>'];
    case 'reminders': return ['#fff', [['#0a84ff', 7.4], ['#ff3b30', 12], ['#ff9f0a', 16.6]].map(([c, y]) => `<circle cx="6.6" cy="${y}" r="1.9" fill="${c}"/><path d="M10 ${y}h9" stroke="#d1d1d6" stroke-width="1"/>`).join('')];
    case 'clock': {
      const ticks = Array.from({ length: 12 }, (_, i) => `<rect x="11.7" y="3.6" width=".6" height="${i % 3 ? 1.1 : 1.8}" fill="#1c1c1e" transform="rotate(${i * 30} 12 12)"/>`).join('');
      return ['#1c1c1e', `<circle cx="12" cy="12" r="9.2" fill="#fff"/>${ticks}<path d="M12 12 12 7.2" stroke="#1c1c1e" stroke-width="1.1" stroke-linecap="round"/><path d="M12 12 15.6 13.8" stroke="#1c1c1e" stroke-width="1.1" stroke-linecap="round"/><path d="M12 12 8.6 16.4" stroke="#ff9500" stroke-width=".55"/><circle cx="12" cy="12" r=".8" fill="#ff9500"/>`];
    }
    case 'weather': return ['linear-gradient(180deg,#4aa9ff,#1d6ee0)', '<circle cx="9.4" cy="9.6" r="3.7" fill="#ffd60a"/><path d="M8.4 18.6a3.4 3.4 0 0 1-.3-6.8 4.7 4.7 0 0 1 9 1.2 2.8 2.8 0 0 1-.2 5.6z" fill="#fff"/>'];
    case 'maps': return ['linear-gradient(135deg,#d5efc6,#f2efe4)', '<path d="M-1 17.5 25 6" stroke="#fff" stroke-width="2.6"/><path d="M8 -1l6.5 26" stroke="#ffcf3a" stroke-width="1.9"/><path d="M-1 9.5 10.5 25" stroke="#fff" stroke-width="1.4"/><circle cx="15.6" cy="10" r="3.3" fill="#0a84ff" stroke="#fff" stroke-width="1"/><path d="M15.6 8.1 17.1 11.6 15.6 10.9 14.1 11.6z" fill="#fff"/>'];
    case 'health': return ['#fff', '<path d="M16.5 4.6c1.6 0 2.9 1.3 2.9 3 0 2.9-4.1 5.6-4.1 5.6s-4.1-2.7-4.1-5.6c0-1.7 1.3-3 2.9-3 .5 0 .9.2 1.2.5.3-.3.7-.5 1.2-.5z" fill="#ff2d55"/>'];
    case 'wallet': return ['#1c1c1e', '<rect x="4" y="5" width="16" height="4" rx="1.2" fill="#1e88e5"/><rect x="4" y="7" width="16" height="4" rx="1.2" fill="#ffb300"/><rect x="4" y="9" width="16" height="4" rx="1.2" fill="#43a047"/><rect x="4" y="11" width="16" height="4" rx="1.2" fill="#e53935"/><path d="M3.6 13h5c.6 1.6 1.8 2.4 3.4 2.4s2.8-.8 3.4-2.4h5v5.4a2 2 0 0 1-2 2H5.6a2 2 0 0 1-2-2z" fill="#2c2c2e"/>'];
    case 'files': return ['#fff', '<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4.3l1.8 1.8H19a1.5 1.5 0 0 1 1.5 1.5v8.2A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" fill="#1a8cff"/><path d="M3.5 10h17v7.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" fill="#4aa9ff"/>'];
    case 'calc': return ['#1c1c1e', '<circle cx="8.4" cy="8.4" r="3" fill="#5a5a5e"/><circle cx="15.6" cy="8.4" r="3" fill="#ff9f0a"/><circle cx="8.4" cy="15.6" r="3" fill="#5a5a5e"/><circle cx="15.6" cy="15.6" r="3" fill="#ff9f0a"/><path d="M7 8.4h2.8M14.2 15h2.8M14.2 16.2h2.8M7 15.6h2.8M8.4 14.2V17M14.6 7.4l2 2M16.6 7.4l-2 2" stroke="#fff" stroke-width=".7" stroke-linecap="round"/>'];
    case 'settings': {
      const teeth = Array.from({ length: 12 }, (_, i) => `<rect x="11" y="3.4" width="2" height="3" rx=".5" fill="#3a3a3c" transform="rotate(${i * 30} 12 12)"/>`).join('');
      return ['linear-gradient(180deg,#a3a3a9,#6a6a70)', `${teeth}<circle cx="12" cy="12" r="6.3" fill="#3a3a3c"/><circle cx="12" cy="12" r="4.2" fill="#a3a3a9"/><circle cx="12" cy="12" r="1.9" fill="#3a3a3c"/>`];
    }
    case 'phone': return ['linear-gradient(180deg,#63f27f,#10c43e)', `<g color="#fff">${mono('phone', 0.64)}</g>`];
    case 'messages': return ['linear-gradient(180deg,#63f27f,#10c43e)', `<g color="#fff">${mono('chat', 0.7)}</g>`];
    case 'safari': {
      const ticks = Array.from({ length: 24 }, (_, i) => `<rect x="11.85" y="3.6" width=".3" height="${i % 2 ? .8 : 1.4}" fill="#fff" opacity=".85" transform="rotate(${i * 15} 12 12)"/>`).join('');
      return ['#fff', `<defs><linearGradient id="nxhSaf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1cd6ff"/><stop offset="1" stop-color="#1b5ff0"/></linearGradient></defs><circle cx="12" cy="12" r="9.2" fill="url(#nxhSaf)"/>${ticks}<path d="M16.9 7.1 13.1 13.1 10.9 10.9z" fill="#ff3b30"/><path d="M7.1 16.9 10.9 10.9 13.1 13.1z" fill="#fff"/>`];
    }
    case 'music': return ['linear-gradient(180deg,#ff6b82,#fa2a46)', `<g color="#fff">${mono('music', 0.64)}</g>`];
    // Android (One UI et autres constructeurs)
    case 'a-phone': return ['linear-gradient(180deg,#4fd777,#1fae4c)', `<g color="#fff">${mono('phone', 0.6)}</g>`];
    case 'a-messages': return ['#fff', '<path d="M12 4.5c4.4 0 8 2.9 8 6.5s-3.6 6.5-8 6.5c-.8 0-1.6-.1-2.4-.3L5.4 19.6l1-3.6C4.9 14.8 4 13 4 11c0-3.6 3.6-6.5 8-6.5z" fill="#3c7cf6"/><circle cx="8.6" cy="11" r="1" fill="#fff"/><circle cx="12" cy="11" r="1" fill="#fff"/><circle cx="15.4" cy="11" r="1" fill="#fff"/>'];
    case 'a-internet': return ['linear-gradient(160deg,#8f72ff,#4a2ee0)', '<circle cx="12" cy="12" r="5.4" fill="#fff"/><ellipse cx="12" cy="12" rx="9" ry="3" fill="none" stroke="#fff" stroke-width="1.3" transform="rotate(-24 12 12)"/><circle cx="10.4" cy="10.6" r="1.6" fill="#b9a8ff"/>'];
    case 'a-camera': return ['#fff', '<circle cx="12" cy="12.4" r="6.3" fill="#2a2b30"/><circle cx="12" cy="12.4" r="3.8" fill="#4b5262"/><circle cx="12" cy="12.4" r="2" fill="#141821"/><circle cx="17.6" cy="6.4" r="1.2" fill="#ff4d3d"/>'];
    case 'a-gallery': return ['linear-gradient(160deg,#ff62a5,#bf3cff)', `<g color="#fff">${mono('flower', 0.62)}</g><circle cx="12" cy="12" r="1.6" fill="#ff8fc4"/>`];
    case 'a-store': return ['#fff', '<path d="M5.5 8.5h13l-1 11h-11z" fill="#ff4f7b"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5" fill="none" stroke="#ff4f7b" stroke-width="1.8"/><path d="m10 12.6 2 2 2-2" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round"/>'];
    case 'a-calendar': return ['#fff', `<rect x="4" y="5" width="16" height="15" rx="3" fill="#eef3ff"/><text x="12" y="17.4" font-family="Inter,system-ui,sans-serif" font-size="10" font-weight="600" fill="#2f6cf6" text-anchor="middle">${t.day}</text>`];
    case 'a-clock': return ['linear-gradient(180deg,#3b4060,#1d2033)', '<circle cx="12" cy="12" r="7.6" fill="none" stroke="#fff" stroke-width="1.4"/><path d="M12 7.6V12l3.4 1.8" stroke="#fff" stroke-width="1.6" stroke-linecap="round" fill="none"/>'];
    case 'a-settings': return ['linear-gradient(180deg,#8f93a8,#5b5f72)', `<g color="#fff">${mono('gear', 0.66)}</g>`];
    case 'a-weather': return ['linear-gradient(180deg,#5ab3ff,#2c7af5)', '<circle cx="9.4" cy="9.6" r="3.6" fill="#ffd54a"/><path d="M8.4 18.6a3.4 3.4 0 0 1-.3-6.8 4.7 4.7 0 0 1 9 1.2 2.8 2.8 0 0 1-.2 5.6z" fill="#fff"/>'];
    case 'a-notes': return ['linear-gradient(180deg,#ffcf45,#f5a524)', `<g color="#fff" style="--nxh-cut:#f5a524">${mono('note', 0.62)}</g>`];
    case 'a-music': return ['linear-gradient(180deg,#ff8160,#ff3d6f)', `<g color="#fff">${mono('music', 0.6)}</g>`];
    case 'a-files': return ['linear-gradient(180deg,#ffbb45,#ff8a00)', `<g color="#fff">${mono('folder', 0.64)}</g>`];
    case 'a-browser': return ['linear-gradient(180deg,#3ccaff,#1677ef)', `<g color="#fff">${mono('globe', 0.66)}</g>`];
    case 'a-themes': return ['linear-gradient(160deg,#ff9a3d,#ff4f8b 55%,#7b5cff)', '<path d="M12 4.5a7.5 7.5 0 1 0 0 15c1 0 1.5-.6 1.5-1.4 0-1-.8-1.3-.8-2.2 0-.8.6-1.4 1.5-1.4h1.8a3.5 3.5 0 0 0 3.5-3.5c0-3.6-3.4-6.5-7.5-6.5z" fill="#fff"/><circle cx="8.4" cy="11" r="1.1" fill="#ff7a59"/><circle cx="10.4" cy="7.9" r="1.1" fill="#ffbf3d"/><circle cx="14.2" cy="7.9" r="1.1" fill="#7b5cff"/>'];
    default: return ['#8e8e93', ''];
  }
}

// Applications de chaque écran d'accueil (dans l'ordre de la grille), d'après les écrans de référence.
const APPS = {
  ios: {
    grid: [['facetime', 'FaceTime'], ['calendar', 'Calendrier'], ['photos', 'Photos'], ['camera', 'Appareil photo'], ['mail', 'Mail'], ['notes', 'Notes'], ['reminders', 'Rappels'], ['clock', 'Horloge'], ['weather', 'Météo'], ['maps', 'Plans'], ['health', 'Santé'], ['wallet', 'Cartes'], ['files', 'Fichiers'], ['calc', 'Calculette'], ['settings', 'Réglages']],
    dock: [['phone', 'Téléphone'], ['safari', 'Navigateur'], ['messages', 'Messages'], ['music', 'Musique']],
  },
  pixel: {
    grid: [],
    dock: [['phone', 'Téléphone'], ['chat', 'Messages'], ['play', 'Boutique'], ['globe', 'Navigateur'], ['camera', 'Appareil photo']],
  },
  oneui: {
    grid: [['a-store', 'Store'], ['a-gallery', 'Galerie'], ['a-calendar', 'Agenda'], ['folder', 'Outils'], ['a-clock', 'Horloge'], ['a-notes', 'Notes'], ['a-settings', 'Paramètres'], ['a-files', 'Mes fichiers'], ['a-weather', 'Météo'], ['a-music', 'Musique'], ['a-themes', 'Thèmes']],
    dock: [['a-phone', 'Téléphone'], ['a-messages', 'Messages'], ['a-internet', 'Internet'], ['a-camera', 'Appareil photo']],
  },
  oem: {
    grid: [['a-gallery', 'Galerie'], ['a-weather', 'Météo'], ['a-settings', 'Paramètres'], ['a-clock', 'Horloge'], ['a-calendar', 'Agenda'], ['a-notes', 'Notes'], ['a-music', 'Musique'], ['a-files', 'Fichiers'], ['a-themes', 'Thèmes'], ['a-store', 'Boutique'], ['folder', 'Outils']],
    dock: [['a-phone', 'Téléphone'], ['a-messages', 'Messages'], ['a-browser', 'Navigateur'], ['a-camera', 'Appareil photo']],
  },
};

function folderHtml() {
  const mini = ['a-calendar', 'a-weather', 'a-music', 'a-files', 'a-browser', 'a-store', 'a-notes', 'a-clock', 'a-themes'];
  return `<i class="nxh-ic nxh-folder">${mini.map((m) => { const [bg, a] = art(m); return `<b style="background:${bg}">${svg(a)}</b>`; }).join('')}</i>`;
}

function iconHtml([id, name], L, { label = true } = {}) {
  let ic;
  if (id === 'folder') ic = folderHtml();
  else if (L === 'pixel') ic = `<i class="nxh-ic nxh-themed">${svg(mono(id, 0.5))}</i>`;
  else { const [bg, a] = art(id); ic = `<i class="nxh-ic" style="background:${bg}">${svg(a)}</i>`; }
  return `<span class="nxh-app">${ic}${label ? `<small>${esc(name)}</small>` : ''}</span>`;
}

// ---------------------------------------------------------------- widgets
function widgets(L, t) {
  if (L === 'ios') return [
    `<div class="nxh-wdg nxh-w-weather"><div class="nxh-wbox"><b>Cotonou ${'<svg viewBox="0 0 24 24" width="9" height="9"><path d="M20 4 4 11l7 2 2 7z" fill="currentColor"/></svg>'}</b><strong>29°</strong><span class="nxh-wsun">${svg(G.sun)}</span><small>Ensoleillé</small><small>Max. 31° Min. 24°</small></div><em>Météo</em></div>`,
    `<div class="nxh-wdg nxh-w-cal"><div class="nxh-wbox"><b>${esc(t.weekday.toUpperCase())}</b><strong>${t.day}</strong><small>Aucun événement aujourd’hui</small></div><em>Calendrier</em></div>`,
  ];
  if (L === 'oneui') return [
    `<div class="nxh-wdg nxh-w-ou"><div class="nxh-wbox"><b>29° <span>${svg(G.cloud)}</span></b><small>Lever du soleil à 6:12</small><svg class="nxh-spark" viewBox="0 0 100 24" preserveAspectRatio="none"><path d="M0 16h14v-2h12v1h14v-3h16v2h14v-4h14v3h16" fill="none" stroke="#9fd8ff" stroke-width="3"/></svg><small>Cotonou</small></div></div>`,
    `<div class="nxh-wdg nxh-w-pill nxh-w-brief"><div class="nxh-wbox"><i>${svg(G.sun)}</i><b>Now Brief</b></div></div>`,
    `<div class="nxh-wdg nxh-w-pill nxh-w-steps"><div class="nxh-wbox"><b>6 214 pas</b><i class="nxh-ring"></i></div></div>`,
    `<div class="nxh-wdg nxh-w-search dark"><div class="nxh-wbox">${svg(G.search)}<span></span>${svg(G.mic)}${svg(G.lens)}</div></div>`,
  ];
  if (L === 'oem') return [
    `<div class="nxh-wdg nxh-w-clock"><div class="nxh-wbox"><strong>12:30</strong><small>${esc(t.long)}</small><small>${svg(G.sun)} 29 °C · Cotonou</small></div></div>`,
  ];
  return [];
}

// ---------------------------------------------------------------- mise en page
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function metrics(L, W, H) {
  const land = W > H && H < 600;
  const large = Math.min(W, H) >= 600;
  const m = { land, large };
  if (L === 'ios') {
    if (large) { m.cols = W > H ? 6 : 5; m.ic = clamp(Math.min(W, H) * 0.092, 62, 80); m.padx = W * 0.085; m.top = 16; m.sb = 30; }
    else if (land) { m.cols = 6; m.ic = clamp(H * 0.15, 46, 60); m.padx = W * 0.06; m.top = 6; m.sb = 12; }
    else { m.cols = 4; m.ic = clamp(W * 0.155, 50, 66); m.padx = W * 0.066; m.top = 8; m.sb = 54; }
    m.pitch = m.ic * (large ? 1.48 : land ? 1.5 : 1.42);
    m.lab = large ? 12.5 : 11.5;
  } else if (L === 'pixel') {
    if (large) { m.cols = W > H ? 6 : 5; m.ic = clamp(Math.min(W, H) * 0.08, 52, 64); m.padx = W * 0.06; }
    else if (land) { m.cols = 6; m.ic = clamp(H * 0.13, 42, 54); m.padx = W * 0.05; }
    else { m.cols = W < 380 ? 4 : 5; m.ic = clamp(W * 0.13, 44, 58); m.padx = W * 0.045; }
    m.top = 4; m.sb = 38; m.pitch = m.ic * 1.5; m.lab = 12;
  } else {
    if (large) { m.cols = W > H ? 7 : 6; m.ic = clamp(Math.min(W, H) * 0.08, 54, 66); m.padx = W * 0.06; }
    else if (land) { m.cols = 7; m.ic = clamp(H * 0.13, 42, 54); m.padx = W * 0.05; }
    else { m.cols = 4; m.ic = clamp(W * 0.15, 48, 62); m.padx = W * 0.055; }
    m.top = 8; m.sb = 38; m.pitch = m.ic * 1.48; m.lab = 11.5;
  }
  m.ic = Math.round(m.ic);
  m.pitch = Math.round(m.pitch);
  const dockSide = land ? m.ic + 34 : 0;
  m.cw = (W - 2 * m.padx - dockSide) / m.cols;
  return m;
}

function buildHome(L, W, H, me) {
  const t = today();
  const m = metrics(L, W, H);
  const set = APPS[L];
  // Widgets : en portrait et sur grand écran (pas en paysage sur téléphone, comme les systèmes réels).
  const wd = m.land ? [] : widgets(L, t);
  // Hauteur disponible pour la grille : écran moins barre d'état, dock, recherche, barre de gestes.
  const bottom = L === 'ios' ? m.ic + 76 : L === 'pixel' ? (m.land ? 30 : m.ic + 100) : L === 'oneui' ? m.ic + 120 : m.ic + 70;
  const glance = L === 'pixel' ? (m.land ? 58 : 78) : 0;
  const avail = (m.land ? H - m.sb - m.top - 30 - glance : H - m.sb - m.top - bottom - glance) - 8;
  const rows = Math.max(1, Math.floor(avail / m.pitch));
  // Cases occupées par les widgets : deux 2 × 2 (iOS) ; 2 × 2, deux 2 × 1 et recherche 4 × 1 (One UI) ; horloge sur deux rangées (autres).
  const widgetCells = L === 'ios' ? 8 : L === 'oneui' ? 12 : L === 'oem' ? m.cols * 2 : 0;
  const capacity = Math.max(1, rows * m.cols - (wd.length ? widgetCells : 0));
  let apps = set.grid.slice(0, Math.max(0, capacity - 1));
  // Sur Pixel, l'icône d'une application installée arrive dans la première case libre de l'accueil.
  const mine = `<span class="nxh-app ab-hi me" data-launch><img src="${esc(me.icon || '')}" alt=""><small>${esc(me.name || 'Mon app')}</small></span>`;
  const grid = [...wd, ...apps.map((a) => iconHtml(a, L)), mine].join('');
  const dock = set.dock.map((a) => iconHtml(a, L, { label: false })).join('');
  const searchPill = L === 'ios' ? `<div class="nxh-pill">${svg(G.search)}<span>Rechercher</span></div>`
    : L === 'oneui' ? `<div class="nxh-pill">${svg(G.search)}<span>Finder</span></div>`
      : L === 'oem' ? '<div class="nxh-dots"><i class="on"></i><i></i></div>' : '';
  const pixelSearch = L === 'pixel' && !m.land ? `<div class="nxh-gsearch">${svg(G.search)}<span></span>${svg(G.mic)}${svg(G.lens)}</div>` : '';
  const glanceHtml = L === 'pixel' ? `<div class="nxh-glance"><b>${esc(t.glance)}</b><span>${svg(G.sun)} 29 °C</span></div>` : '';
  const style = [`--ic:${m.ic}px`, `--cols:${m.cols}`, `--cw:${m.cw.toFixed(2)}px`, `--pitch:${m.pitch}px`, `--padx:${m.padx.toFixed(1)}px`, `--top:${m.top}px`, `--lab:${m.lab}px`, `--wpad:${((m.cw - m.ic) / 2).toFixed(2)}px`].join(';');
  const cls = ['ab-home', 'nxh', `nxh-${L}`, m.land ? 'nxh-land' : '', m.large ? 'nxh-large' : ''].filter(Boolean).join(' ');
  const dockHtml = L === 'pixel' && m.large && W > H
    ? `<div class="nxh-dock nxh-inline"><div class="nxh-gsearch">${svg(G.search)}<span></span>${svg(G.mic)}${svg(G.lens)}</div>${dock}</div>`
    : `<div class="nxh-dock">${dock}</div>`;
  return `<div class="${cls}" style="${style}">
    <div class="nxh-main">${glanceHtml}<div class="nxh-grid">${grid}</div></div>
    ${m.land ? '' : searchPill}
    ${dockHtml}
    ${L === 'pixel' && !(m.large && W > H) ? pixelSearch : ''}
  </div>`;
}

// Teintes « Material You » du Pixel, tirées du fond d'écran (icônes à thème, barre de recherche).
const tints = new Map();
function tintFor(url) {
  if (tints.has(url)) return tints.get(url);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 12; c.height = 24;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0, 12, 24);
        const d = x.getImageData(0, 0, 12, 24).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
          const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
          const w = 1 + (mx - mn) / 40; // les couleurs vives comptent plus que les gris
          r += d[i] * w; g += d[i + 1] * w; b += d[i + 2] * w; n += w;
        }
        resolve(hue(r / n, g / n, b / n));
      } catch { resolve(220); }
    };
    img.onerror = () => resolve(220);
    img.src = url;
  });
  tints.set(url, p);
  return p;
}
function hue(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 220;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return Math.round((h * 60 + 360) % 360);
}

// ---------------------------------------------------------------- installation sur l'App Builder
export function install(proto) {
  if (proto.nxHome024) return;
  proto.nxHome024 = true;
  const origRender = proto.renderPreview;
  const origWall = proto.wallFor;

  proto.nxLauncher = function (os = this.os) {
    return launcherOf(this.previewDevice(os).dev, os);
  };

  proto.wallFor = function (os) {
    const k = (settings.android && settings.android.wall || {})[os];
    if (k && (k.kind === 'app' || k.kind === 'dark' || (k.kind === 'image' && k.data))) return origWall.call(this, os);
    const id = k && k.kind === 'photo' && WALL_IDS.has(k.id) ? k.id : DEFAULT_WALL[this.nxLauncher(os)] || 'verre-liquide';
    return wallUrl(id);
  };

  proto.wallMenu = function (anchor) {
    const os = this.os;
    const L = this.nxLauncher(os);
    const cur = (settings.android.wall || {})[os] || {};
    const curId = cur.kind === 'photo' && WALL_IDS.has(cur.id) ? cur.id : !cur.kind || cur.kind === 'glass' || cur.kind === 'fluid' ? DEFAULT_WALL[L] : '';
    const tile = (val, img, name, sub, on) => `<button class="nxh-wopt${on ? ' on' : ''}" data-wall="${val}" title="${esc(sub ? `${name} — ${sub}` : name)}"><img src="${img}" alt="" loading="lazy"><span>${esc(name)}</span></button>`;
    const html = `<div class="pop-title">Fond d’écran ${os === 'ios' ? 'iPhone et iPad' : 'Android'}</div>
      <div class="nxh-walls">${WALLS.map(([id, name, by]) => tile(`photo:${id}`, wallUrl(id, true), name, `photo de ${by} (Unsplash)${id === DEFAULT_WALL[L] ? ', proposé pour cet appareil' : ''}`, id === curId)).join('')}
        ${tile('app', this.wallThumb(os, 'app'), 'Couleurs de l’app', 'dégradé de la couleur d’accent', cur.kind === 'app')}
        ${tile('dark', this.wallThumb(os, 'dark'), 'Sombre', 'uni, discret', cur.kind === 'dark')}
      </div>
      <button class="btn wide" data-wall="import">${ico('upload', 14)}<span>Importer mon fond d’écran…</span></button>
      ${cur.kind === 'image' ? `<button class="btn wide" data-wall="reset">${ico('trash', 14)}<span>Retirer l’image importée</span></button>` : ''}
      <p class="pop-note">Photos sous licence Unsplash, choisies dans le style des fonds actuels d’iOS, de Pixel et de One UI. Les fonds officiels d’Apple, de Google et de Samsung sont protégés : pour un aperçu identique à ton téléphone, importe le tien.</p>`;
    const pop = popover(anchor, html, { width: 344 });
    if (!pop) return;
    pop.onclick = async (e) => {
      const b = e.target.closest('[data-wall]');
      if (!b) return;
      const walls = settings.android.wall || (settings.android.wall = {});
      const v = b.dataset.wall;
      if (v === 'import') {
        closePopover();
        const r = await api.invoke('dialog:open-file', { title: 'Fond d’écran (image)', filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'heic'] }], asDataUrl: true, maxBytes: 3e7 });
        if (!r || !r.dataUrl) return;
        const img = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = r.dataUrl; });
        if (!img) { toast('Image illisible.', { kind: 'bad' }); return; }
        // Côté le plus long limité à 2 400 pixels : l'image sert aussi en paysage et sur tablette.
        const k = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        walls[os] = { kind: 'image', data: c.toDataURL('image/jpeg', 0.86) };
      } else {
        closePopover();
        walls[os] = v === 'reset' ? {} : v.startsWith('photo:') ? { kind: 'photo', id: v.slice(6) } : { kind: v };
      }
      saveSettings();
      this.renderPreview();
    };
  };

  proto.renderPreview = function (...args) {
    const r = origRender.apply(this, args);
    try {
      const scr = this.el && $('.ab-screen', this.el);
      if (!scr) return r;
      const L = this.nxLauncher();
      scr.dataset.nxh = L;
      if (this.preview === 'home') this.nxHome(scr, L);
      else if (this.preview === 'app') this.nxApp(scr);
    } catch (err) {
      console.error('NEXORA #024 : aperçu', err);
    }
    return r;
  };

  proto.nxHome = function (scr, L) {
    const old = $('.ab-home', scr);
    if (!old) return;
    const W = scr.offsetWidth, H = scr.offsetHeight;
    const cfg = this.cfg;
    const ip = this.iconPrev || {};
    const icon = L === 'ios' ? ip.ios || ip.circle : L === 'pixel' ? ip.circle : L === 'oneui' ? ip.rounded || ip.squircle : ip.squircle || ip.rounded;
    const name = (cfg.engine === 'twa' && cfg.twa && cfg.twa.launcherName) || cfg.appName;
    const tpl = document.createElement('template');
    tpl.innerHTML = buildHome(L, W, H, { icon, name }).trim();
    const home = tpl.content.firstElementChild;
    old.replaceWith(home);
    const me = $('[data-launch]', home);
    if (me) me.addEventListener('click', () => this.act_launch_sim());
    scr.classList.toggle('nxh-land-scr', W > H && H < 600);
    // Barre de navigation à trois boutons, réglage par défaut de One UI.
    const ges = $('.ab-gesture', scr);
    if (L === 'oneui' && ges) {
      ges.outerHTML = `<div class="nxh-nav3"><svg viewBox="0 0 24 24"><path d="M7 7v10M12 7v10M17 7v10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><svg viewBox="0 0 24 24"><rect x="6.5" y="6.5" width="11" height="11" rx="4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg><svg viewBox="0 0 24 24"><path d="M14.5 6.5 9 12l5.5 5.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`;
    }
    if (L === 'pixel') {
      const wall = this.wallFor(this.os);
      tintFor(wall).then((h) => {
        if (!home.isConnected) return;
        home.style.setProperty('--th-h', h);
      });
    }
  };

  // Application simulée : le menu latéral couvre tout l'écran, barre d'état et onglets compris, comme dans
  // l'application construite (Extras.buildDrawer l'ajoute à la racine de la fenêtre).
  proto.nxApp = function (scr) {
    const app = $('.ab-app', scr);
    if (!app) return;
    for (const d of app.querySelectorAll(':scope > .ab-drawer')) d.remove();
    const dr = $('.ab-overlay .ab-drawer', app);
    if (dr) app.append(dr);
    const tabs = $('.ab-tabs', app);
    if (tabs) tabs.style.setProperty('--nxh-tab', this.cfg.config.tabBg || '#ffffff');
  };
}
