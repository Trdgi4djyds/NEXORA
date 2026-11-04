// NEXORA #032 : nouveau design des pages Profil (fenêtre « Mon compte NEXORA ») et Réglages (menu Apparence et
// fenêtre « Personnaliser l'interface »). Les fichiers minifiés appellent ces gabarits par deux crochets :
// globalThis.__nxCompte (chunk-EOM7FQDL.js) et globalThis.__nxReglages (chunk-Y6Q6RT63.js). Si ce module ne se
// charge pas, les crochets restent vides et l'affichage d'origine s'applique.
import { a as ICONS } from '../../dist/chunks/chunk-S4I2LXHS.js';
import * as compte from './compte.js';
import * as reglages from './reglages.js';

// Icônes manquantes, dans le style de NEXORA (trait 1,6, grille 24).
const MORE_ICONS = {
  nxArrowRight: '<path d="M4.5 12h15"/><path d="m13.5 6 6 6-6 6"/>',
  nxType: '<path d="M5 7V5h14v2"/><path d="M12 5v14"/><path d="M9 19h6"/>',
  nxAccess: '<circle cx="12" cy="4.8" r="1.6"/><path d="M5 8.5c2.3.7 4.6 1 7 1s4.7-.3 7-1"/><path d="M12 9.5v4.5"/><path d="m9 20 3-6 3 6"/>',
  nxScale: '<rect x="3.5" y="9.5" width="9" height="9" rx="1.5"/><path d="M14 5.5h4.5V10"/><path d="m18.5 5.5-5 5"/>',
};

function loadCss() {
  if (document.querySelector('link[data-nx-profil]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./profil.css', import.meta.url).href;
  link.dataset.nxProfil = '';
  document.head.appendChild(link);
}

export async function install() {
  for (const [k, v] of Object.entries(MORE_ICONS)) if (!ICONS[k]) ICONS[k] = v;
  loadCss();
  globalThis.__nxCompte = { sheet: compte.sheet, profile: compte.profile };
  globalThis.__nxReglages = { sheet: reglages.open, pop: reglages.pop };
}
