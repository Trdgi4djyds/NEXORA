// NEXORA #037 : espaces réservés à une offre (Dev Lab et Desktop Builder : offre Standard). Sans l'offre,
// l'espace reste visible mais voilé, avec une carte qui dit ce qu'il comprend et comment l'obtenir. Le
// processus principal refuse aussi leurs canaux (src/plan.js).
// Cartes de fonctions réservées : fonctions avancées du Studio 3D (#011, #013 : offre Pro) et fonctions
// étendues de NEX-DESIGN (#011 : offre Standard) ; la carte reste visible, voilée et inerte.
import { ico, esc } from '../core.js';
import { cloud, can } from './status.js';
import { FALLBACK } from './catalog.js';

const SPACES = [
  { id: 'devlab', perm: 'devlab', label: 'Le Dev Lab', object: 'code', tone: 'orange',
    perks: ['Fichiers, éditeur et terminal de tes projets', 'Git, GitHub et VS Code', 'Prévisualisation en direct et partage', 'Import de projets et de code source'] },
  { id: 'desktop', perm: 'desktop_builder', label: 'Le Desktop Builder', object: 'monitor', tone: 'jaune',
    perks: ['Ton site transformé en logiciel Windows', 'Installateur, version portable, ZIP et MSI', '60 constructions par mois', 'Signature et mises à jour'] },
];

function card(sp) {
  const p = FALLBACK.standard;
  return `<div class="nxo-space-lock">
    <div class="nxo-space-card">
      <div class="nxo-space-art" data-nxo-art="${sp.object}" data-nxo-tone="${sp.tone}" data-nxo-key="espace-${sp.id}">
        <small class="nxo-kicker">${ico('bolt', 12)} Offre ${esc(p.name)}</small>
        <h3>${esc(sp.label)} fait partie de l’offre ${esc(p.name)}</h3>
        <p>Dès 10 $ par mois, sans engagement.</p>
      </div>
      <ul class="nxo-feats">${sp.perks.map((f) => `<li>${ico('check', 12)}<span>${esc(f)}</span></li>`).join('')}</ul>
      <div class="nxo-ab-lock-acts">
        ${cloud.user ? `<button type="button" class="nxo-btn primary" data-nxo-ask="standard">Passer à ${esc(p.name)} · 10 $ / mois</button><button type="button" class="nxo-btn ghost" data-nxo-offers>Voir les offres</button>`
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
  { sel: '.dz-card.nx-card', perm: 'design_extended', label: 'NEX-DESIGN étendu', need: 'standard' },
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
      el.classList.add('nxo-card-locked');
      // Contenu inerte (ni clic ni clavier), y compris ce qu'un redessin partiel ajoute ensuite.
      for (const c of el.children) if (c !== ov && !c.hasAttribute('inert')) c.setAttribute('inert', '');
      if (!ov) {
        el.insertAdjacentHTML('beforeend', `<div class="nxo-card-lock"><span class="nxo-chip">${ico(f.need === 'pro' ? 'nxCrown' : 'bolt', 11)}Offre ${f.need === 'pro' ? 'Pro' : 'Standard'}</span><b>${esc(f.label)}</b><button type="button" class="nxo-btn small primary" data-nxo-feature="${f.perm}">Débloquer</button></div>`);
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
