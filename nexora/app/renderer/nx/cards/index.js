// NEXORA #033 : illustrations en fond des cartes de l'application (et de la version web, qui charge la
// même interface). Les cartes visées sont repérées dans la page à mesure qu'elles apparaissent ; le
// dessin est fait par illu.js. Périmètre : cartes de présentation et de chiffres (Accueil, accueil du
// Dev Lab, indicateurs de la supervision, des statistiques d'applications et de l'administration).
// NEXORA #037, #038 : chaque carte reçoit un objet illustré qui dit ce qu'elle contient (objects.js) : dossier pour
// les projets, équipe pour la carte de l'équipe (Mon compte → Équipe), téléphone pour les applications…
// Deux mises en page fixes : grand objet à droite (cartes de présentation) ou pastille (chiffres, projets).
import { attach, prune } from './illu.js';
import { objectFor, SPACE_OBJECTS } from './objects.js';

const SPACE_TONES = { preview: 'bleu', browser: 'turquoise', dev: 'orange', android: 'menthe', studio: 'rose', design: 'violet', security: 'corail', desktop: 'jaune' };
const STATE_TONES = { good: 'menthe', warn: 'orange', bad: 'corail' };

// Titre de la carte : premier titre non vide (l'icône d'une action rapide est un span vide, NEXORA #037).
const label = (el) => {
  const t = Array.from(el.querySelectorAll('b, h3, strong, small, span')).find((x) => x.textContent.trim());
  return (t ? t.textContent : el.textContent || '').trim().slice(0, 40);
};
const classTone = (el, map) => {
  const c = Array.from(el.classList).find((x) => map[x]);
  return c ? map[c] : undefined;
};
const QA_TONES = { q1: 'violet', q2: 'rose', q3: 'menthe' };

// [sélecteur, réglages de la carte] ; teinte absente : tirée au hasard, différente des voisines.
const CARDS = [
  // Cartes de présentation : grand objet à droite (layout hero, par défaut).
  ['.hm-hello', () => ({ key: 'accueil', object: 'rocket' })],
  // NEXORA #044 : actions rapides et espaces en grand objet qui déborde (layout bleed) ; compteurs sans objet
  // (cartes « feuille » de nx/look/cartes.css) ; liste vide des projets en bannière illustrée.
  ['.hm-qa', (el) => { const ic = el.querySelector('.hm-qa-ic'); return { key: `action:${el.dataset.h || el.dataset.hSpace || label(el)}`, layout: 'bleed', tone: ic ? classTone(ic, QA_TONES) : undefined, object: objectFor(label(el), el.dataset.h) }; }],
  ['.hm-space', (el) => ({ key: `espace:${el.dataset.space || label(el)}`, layout: 'bleed', tone: SPACE_TONES[el.dataset.space], object: SPACE_OBJECTS[el.dataset.space] || objectFor(label(el)) })],
  ['.hm-grid > .hm-empty', () => ({ key: 'projets:vide', tone: 'violet', object: 'folder' })],
  ['.dk-wel-card', (el) => ({ key: `devlab:${label(el)}`, layout: 'bleed', tone: 'orange', object: objectFor(label(el), 'code') })],
  // Carte de l'équipe active (Mon compte → Équipe).
  ['.nxc-body > .nx-org-head', (el) => ({ key: `equipe:${label(el)}`, tone: 'violet', object: 'team', avoid: '.nx-actions' })],
  // Cartes de chiffres et de projets : petite pastille entière en haut à droite (layout badge).
  ['.hm-card', (el) => ({ key: `projet:${el.dataset.hProj || label(el)}`, layout: 'badge', avoid: '.hm-chips, .hm-acts', object: 'folder' })],
  ['.sup-kpi', (el) => ({ key: `supervision:${label(el)}`, layout: 'badge', tone: classTone(el, STATE_TONES), object: objectFor(label(el), 'pulse') })],
  ['.nxa-kpi', (el) => ({ key: `admin:${label(el)}`, layout: 'badge', tone: classTone(el, STATE_TONES), object: objectFor(label(el)) })],
  ['.nxi-kpi', (el) => ({ key: `statistiques:${label(el)}`, layout: 'badge', tone: classTone(el, STATE_TONES), object: objectFor(label(el), 'chart') })],
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
