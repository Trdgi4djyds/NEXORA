// NEXORA #042 : animations et réglages de la couche « Flex » (nx/look/flex.css, chargée par index.html).
//   - couleur de l'espace ouvert en accent seulement si la couleur d'accent des Réglages est celle par défaut
//     (« NEXORA ») : data-nx-accent="espace" sur <html>, relu à chaque changement du thème ou de l'accent ;
//   - compteurs de l'Accueil qui défilent jusqu'à leur valeur à l'ouverture de l'espace.
// NEXORA #045 : icône pleine du rail (#043) et lumière qui suit le pointeur (#042) retirées : icônes plates au
// trait partout, aucun effet lumineux.
// NEXORA #103 : police Urbanist (direction « Horizon » du site) à la place d'Inter, la police par défaut des Réglages
// (« inter ») : les Réglages posent --font en style sur <html> ; seule la valeur par défaut est remplacée, les autres
// choix (système, arrondie, serif, chasse fixe) restent tels quels.
// Réglage « Animations » de NEXORA (data-motion : reduced, none) et préférence du système respectés.
import { settings } from '../core.js';

const root = document.documentElement;
const still = () => root.dataset.motion === 'none' || root.dataset.motion === 'reduced'
  || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const URBANIST = "'Urbanist', 'Inter', 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif";
function font() {
  const v = root.style.getPropertyValue('--font').trim();
  if ((!v || v.startsWith("'Inter'")) && v !== URBANIST) root.style.setProperty('--font', URBANIST);
}

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

export async function install() {
  accent();
  font();
  // L'accent est posé en style sur <html> par les Réglages : chaque changement (thème, accent) est relu.
  new MutationObserver(() => { accent(); font(); }).observe(root, { attributes: true, attributeFilter: ['style', 'data-theme'] });
  let mode = document.body.dataset.mode;
  new MutationObserver(() => {
    if (document.body.dataset.mode === mode) return;
    mode = document.body.dataset.mode;
    if (mode === 'home') requestAnimationFrame(countUp);
  }).observe(document.body, { attributes: true, attributeFilter: ['data-mode'] });
  requestAnimationFrame(countUp);
}
