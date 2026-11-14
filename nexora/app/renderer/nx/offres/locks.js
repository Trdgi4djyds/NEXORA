// NEXORA #037 : espaces réservés à une offre (#076 : Dev Lab, App Builder et Desktop Builder : offre Pro). Sans l'offre,
// l'espace reste visible mais voilé, avec une carte qui dit ce qu'il comprend et comment l'obtenir. Le
// processus principal refuse aussi leurs canaux (src/plan.js).
// NEXORA #059 : le Dev Lab n'est plus voilé : dossiers, éditeur, terminal, Git et aperçu sont gratuits ; ses
// outils avancés gardent leur verrou dans le tiroir (nx/devplus/ui.js) et le partage en ligne (tunnel:start)
// ouvre la fenêtre « offre requise ».
// Cartes de fonctions réservées : fonctions avancées du Studio 3D (#011, #013 : offre Pro) et fonctions
// étendues de NEX-DESIGN (#011 : offre Standard) ; la carte reste visible, voilée et inerte.
import { ico, esc } from '../core.js';
import { cloud, can } from './status.js';
import { FALLBACK, money } from './catalog.js';

// NEXORA #076 : une seule offre payante, Pro. Dev Lab, App Builder et Desktop Builder sont réservés à Pro (après
// l'essai du premier jour) ; le Responsive Lab et le Browser Lab restent gratuits.
// NEXORA #087 : l'offre Gratuite ouvre aussi l'App Builder et le Desktop Builder (2 applications au total) : leur
// voile ne s'affiche plus que pour une offre sans ces permissions (réglage du back office).
const SPACES = [
  { id: 'devlab', perm: 'devlab', label: 'Le Dev Lab',
    perks: ['Éditeur de code complet, terminal, Git et GitHub', 'Débogueur, tests, problèmes et scripts', 'Bases de données, API et mise en ligne', 'Assistant IA de tout le projet'] },
  { id: 'android', perm: 'apk', label: 'L’App Builder',
    perks: ['Votre site transformé en application Android (APK, AAB)', 'PWA, notifications push et messagerie', 'Fiche et publication sur le Play Store', 'Jusqu’à 50 applications, sans limite par application'] },
  { id: 'desktop', perm: 'desktop_builder', label: 'Le Desktop Builder',
    perks: ['Votre site transformé en logiciel Windows', 'Installateur, version portable, ZIP et MSI', 'Signature et mises à jour', 'Jusqu’à 50 applications, sans limite par application'] },
];

function card(sp) {
  const p = FALLBACK.pro;
  const price = money(p.price_month_cents);
  return `<div class="nxo-space-lock">
    <div class="nxo-space-card">
      <div class="nxo-lock-head">
        <span class="nxo-medal nxo-pro lg">${ico('nxCrown', 22)}</span>
        <div><small class="nxo-kicker">Offre ${esc(p.name)}</small><h3>${esc(sp.label)} fait partie de l’offre ${esc(p.name)}</h3><p>${esc(price)} par mois, sans engagement. Tout était ouvert pendant votre premier jour.</p></div>
      </div>
      <ul class="nxo-feats">${sp.perks.map((f) => `<li>${ico('check', 12)}<span>${esc(f)}</span></li>`).join('')}</ul>
      <div class="nxo-ab-lock-acts">
        ${cloud.user ? `<button type="button" class="nxo-btn primary" data-nxo-ask="pro">Passer à ${esc(p.name)} · ${esc(price)} / mois</button><button type="button" class="nxo-btn ghost" data-nxo-offers>Voir les offres</button>`
          : '<button type="button" class="nxo-btn primary" data-nxo-login>Se connecter</button><button type="button" class="nxo-btn ghost" data-nxo-offers>Voir les offres</button>'}
      </div>
    </div>
  </div>`;
}

export function apply() {
  for (const sp of SPACES) {
    const pane = document.getElementById(sp.id);
    if (!pane) continue;
    const locked = !can(sp.perm);
    pane.classList.toggle('nxo-space-locked', locked);
    let ov = pane.querySelector(':scope > .nxo-space-lock');
    const html = locked ? card(sp) : '';
    if (!locked && ov) ov.remove();
    if (locked && (!ov || ov.__html !== html)) {
      if (ov) ov.remove();
      if (getComputedStyle(pane).position === 'static') pane.classList.add('nxo-rel');
      pane.insertAdjacentHTML('beforeend', html);
      pane.lastElementChild.__html = html;
    }
    // L'espace redessine son contenu à la première ouverture : on remet la carte.
    if (!pane.__nxoObs) {
      pane.__nxoObs = new MutationObserver(() => { if (pane.classList.contains('nxo-space-locked') && !pane.querySelector(':scope > .nxo-space-lock')) apply(); });
      pane.__nxoObs.observe(pane, { childList: true });
    }
  }
}

const FEATURE_CARDS = [
  { sel: '.nx-st-card', perm: 'studio_advanced', label: 'Studio 3D avancé', need: 'pro' },
  // NEXORA #075 (A-039) : seules les cartes qui ne portent pas data-free sont réservées (les cartes du #053 et les
  // cartes gratuites du #011 le portent) ; carte réduite à son titre et à une ligne « Offre Standard · Débloquer ».
  { sel: '.dz-card.nx-card:not([data-free])', perm: 'design_extended', label: 'NEX-DESIGN étendu', need: 'pro', compact: true },
];

function lockCards() {
  for (const f of FEATURE_CARDS) {
    const locked = !can(f.perm);
    for (const el of document.querySelectorAll(f.sel)) {
      const ov = el.querySelector(':scope > .nxo-card-lock');
      if (!locked) {
        if (el.classList.contains('nxo-card-locked')) {
          el.classList.remove('nxo-card-locked');
          for (const c of el.children) c.removeAttribute('inert');
        }
        if (ov) ov.remove();
        continue;
      }
      // NEXORA #120 : classe posée seulement si elle manque (un ajout réécrit l'attribut et réveille les observateurs).
      if (!el.classList.contains('nxo-card-locked')) el.classList.add('nxo-card-locked');
      // Contenu inerte (ni clic ni clavier), y compris ce qu'un redessin partiel ajoute ensuite.
      for (const c of el.children) if (c !== ov && !c.hasAttribute('inert')) c.setAttribute('inert', '');
      if (!ov && f.compact) {
        el.insertAdjacentHTML('beforeend', `<div class="nxo-card-lock compact"><span class="nxo-chip">${ico('bolt', 11)}Offre Pro</span><button type="button" class="nxo-btn small" data-nxo-feature="${f.perm}">Débloquer</button></div>`);
      } else if (!ov) {
        el.insertAdjacentHTML('beforeend', `<div class="nxo-card-lock"><span class="nxo-chip">${ico(f.need === 'pro' ? 'nxCrown' : 'bolt', 11)}Offre Pro</span><b>${esc(f.label)}</b><button type="button" class="nxo-btn small primary" data-nxo-feature="${f.perm}">Débloquer</button></div>`);
      }
    }
  }
}

let pending = 0;
export function watchCards() {
  lockCards();
  new MutationObserver(() => { if (!pending) pending = requestAnimationFrame(() => { pending = 0; lockCards(); }); })
    .observe(document.body, { childList: true, subtree: true });
}
export { lockCards };
