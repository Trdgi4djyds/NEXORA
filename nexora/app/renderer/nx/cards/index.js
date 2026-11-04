// NEXORA #033 : illustrations en fond des cartes de l'application (et de la version web, qui charge la
// même interface). Les cartes visées sont repérées dans la page à mesure qu'elles apparaissent ; le
// dessin est fait par illu.js. Périmètre : cartes de présentation et de chiffres (Accueil, accueil du
// Dev Lab, indicateurs de la supervision, des statistiques d'applications et de l'administration).
import { attach, prune } from './illu.js';

const SPACE_TONES = { preview: 'bleu', browser: 'turquoise', dev: 'orange', android: 'menthe', studio: 'rose', design: 'violet', security: 'corail', desktop: 'jaune' };
const STAT_TONES = { pink: 'rose', blue: 'bleu', mint: 'menthe', yellow: 'jaune', red: 'corail' };
const STATE_TONES = { good: 'menthe', warn: 'orange', bad: 'corail' };

const label = (el) => {
  const t = el.querySelector('b, h3, small, span');
  return (t ? t.textContent : el.textContent || '').trim().slice(0, 40);
};
const classTone = (el, map) => {
  const c = Array.from(el.classList).find((x) => map[x]);
  return c ? map[c] : undefined;
};
const QA_TONES = { q1: 'violet', q2: 'rose', q3: 'menthe' };

// [sélecteur, réglages de la carte] ; teinte absente : tirée au hasard, différente des voisines.
const CARDS = [
  ['.hm-hello', () => ({ key: 'accueil' })],
  ['.hm-qa', (el) => { const ic = el.querySelector('.hm-qa-ic'); return { key: `action:${el.dataset.h || el.dataset.hSpace || label(el)}`, tone: ic ? classTone(ic, QA_TONES) : undefined }; }],
  ['.hm-stat', (el) => ({ key: `compteur:${el.dataset.hSpace || label(el)}`, tone: classTone(el, STAT_TONES) })],
  ['.hm-space', (el) => ({ key: `espace:${el.dataset.space || label(el)}`, tone: SPACE_TONES[el.dataset.space] })],
  ['.hm-card', (el) => ({ key: `projet:${el.dataset.hProj || label(el)}`, cap: 'discret', avoid: '.hm-chips, .hm-acts' })],
  ['.dk-wel-card', (el) => ({ key: `devlab:${label(el)}` })],
  ['.sup-kpi', (el) => ({ key: `supervision:${label(el)}`, tone: classTone(el, STATE_TONES) })],
  ['.nxa-kpi', (el) => ({ key: `admin:${label(el)}`, tone: classTone(el, STATE_TONES) })],
  ['.nxi-kpi', (el) => ({ key: `statistiques:${label(el)}`, tone: classTone(el, STATE_TONES) })],
];

let timer = 0;
function scan() {
  timer = 0;
  prune();
  for (const [sel, opts] of CARDS) {
    for (const el of document.querySelectorAll(sel)) if (!el.__nxi) attach(el, opts(el));
  }
}
// Au plus une recherche par image affichée : une carte re-rendue retrouve son illustration aussitôt.
const later = () => { if (!timer) timer = requestAnimationFrame(scan); };

function css() {
  return new Promise((resolve) => {
    if (document.querySelector('link[data-nx-cards]')) return resolve();
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = new URL('./cards.css', import.meta.url).href;
    l.dataset.nxCards = '';
    l.onload = l.onerror = () => resolve();
    document.head.append(l);
  });
}

export async function install() {
  await css();
  scan();
  new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
}
