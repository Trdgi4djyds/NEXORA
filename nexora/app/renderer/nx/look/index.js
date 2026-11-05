// NEXORA #042 : animations et réglages de la couche « Flex » (nx/look/flex.css, chargée par index.html).
//   - couleur de l'espace ouvert en accent seulement si la couleur d'accent des Réglages est celle par défaut
//     (« NEXORA ») : data-nx-accent="espace" sur <html>, relu à chaque changement du thème ou de l'accent ;
//   - lumière qui suit le pointeur sur les tuiles (variables --nxu-x et --nxu-y, peintes par flex.css) ;
//   - compteurs de l'Accueil qui défilent jusqu'à leur valeur à l'ouverture de l'espace.
// NEXORA #043 : icône pleine (Streamline Flex « Solid ») sur la tuile de l'espace ouvert dans le rail ; les autres
// espaces gardent l'icône au trait (affichage réglé par nx/look/composants.css).
// Réglage « Animations » de NEXORA (data-motion : reduced, none) et préférence du système respectés.
import { settings } from '../core.js';
import { FLEX_SOLID } from '../icons/flex.js';

const SPOT = '.hm-qa, .hm-stat, .hm-space, .hm-card, .dk-wel-card, .nx-tpl';
// Espace -> icône du rail (liste des espaces de renderer/dist/chunks/chunk-Y6Q6RT63.js).
const RAIL_ICONS = { home: 'home', preview: 'multi', browser: 'globe', dev: 'code', android: 'android', studio: 'cube', design: 'palette', security: 'shield', desktop: 'display' };
const root = document.documentElement;
const still = () => root.dataset.motion === 'none' || root.dataset.motion === 'reduced'
  || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function accent() {
  const v = !settings.accent || settings.accent === 'nexora' ? 'espace' : 'reglages';
  if (root.dataset.nxAccent !== v) root.dataset.nxAccent = v;
}

// Compteurs : de 0 à la valeur affichée (nombres entiers seulement) ; le texte d'origine est remis à la fin.
function countUp() {
  if (still()) return;
  for (const b of document.querySelectorAll('.hm-stat b')) {
    const end = Number(b.textContent.trim());
    if (!Number.isInteger(end) || end <= 0 || end > 100000 || b.__nxuCount) continue;
    b.__nxuCount = true;
    const t0 = performance.now(), dur = Math.min(900, 380 + end * 40);
    const step = (t) => {
      if (!b.isConnected) return;
      const k = Math.min(1, (t - t0) / dur), v = Math.round(end * (1 - Math.pow(1 - k, 3)));
      b.textContent = String(v);
      if (k < 1) requestAnimationFrame(step);
      else { b.textContent = String(end); b.__nxuCount = false; }
    };
    requestAnimationFrame(step);
  }
}

function spotlight(e) {
  const el = e.target && e.target.closest ? e.target.closest(SPOT) : null;
  if (!el) return;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--nxu-x', `${Math.round(e.clientX - r.left)}px`);
  el.style.setProperty('--nxu-y', `${Math.round(e.clientY - r.top)}px`);
}

// Ajoute la variante pleine à côté de l'icône au trait de chaque espace (le rail peut être redessiné).
function railSolid() {
  for (const b of document.querySelectorAll('.rail-spaces > button[data-mode]')) {
    const ic = b.querySelector('.rail-ic');
    const body = FLEX_SOLID[RAIL_ICONS[b.dataset.mode]];
    if (!ic || !body || ic.querySelector('.nx2-solid')) continue;
    const line = ic.querySelector('svg');
    const size = line ? line.getAttribute('width') || '19' : '19';
    ic.insertAdjacentHTML('beforeend', `<svg class="ico nx2-solid" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${body}</svg>`);
  }
}

export async function install() {
  accent();
  railSolid();
  const seg = document.getElementById('modeSeg');
  if (seg) new MutationObserver(railSolid).observe(seg, { childList: true, subtree: true });
  // L'accent est posé en style sur <html> par les Réglages : chaque changement (thème, accent) est relu.
  new MutationObserver(accent).observe(root, { attributes: true, attributeFilter: ['style', 'data-theme'] });
  let mode = document.body.dataset.mode;
  new MutationObserver(() => {
    if (document.body.dataset.mode === mode) return;
    mode = document.body.dataset.mode;
    if (mode === 'home') requestAnimationFrame(countUp);
  }).observe(document.body, { attributes: true, attributeFilter: ['data-mode'] });
  document.addEventListener('pointermove', spotlight, { passive: true });
  requestAnimationFrame(countUp);
}
