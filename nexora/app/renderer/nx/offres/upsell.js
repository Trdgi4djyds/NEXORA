// NEXORA #037 : fenêtre « Fonction de l'offre Standard / Pro », ouverte quand une action est refusée par
// l'offre (événement plan:blocked du processus principal, App Builder, espaces réservés).
import { ico, esc, sheet, closeSheet, toast } from '../core.js';
import { cloud, askPlan, current } from './status.js';
import { FALLBACK, FEATURES, PLAN_LOOK, money, neededPlan, normPlan, planKeys } from './catalog.js';

let lastAt = 0;

export async function openAccount(tab = 'plan', param) {
  const m = await import('../../dist/chunks/chunk-EOM7FQDL.js');
  return cloud.user ? m.j(tab, param) : m.h('login');
}

// info : { feature, reason (plan|quota|auth|source|url|expired), need, message, title }
export function openUpsell(info = {}) {
  if (Date.now() - lastAt < 1500) return;
  lastAt = Date.now();
  const feat = FEATURES[info.feature] || [];
  const need = normPlan(info.need || neededPlan(feat[1]));
  const p = FALLBACK[need] || FALLBACK.standard;
  const look = PLAN_LOOK[need] || PLAN_LOOK.standard;
  const s = current();
  const auth = info.reason === 'auth' || !cloud.user;
  const title = info.title || (info.reason === 'quota' ? 'Quota de votre offre atteint' : auth && need === 'free' ? 'Connectez-vous à votre compte NEXORA' : `${feat[0] || 'Cette fonction'} : offre ${p.name}`);
  const lim = p.limits;
  const perks = (p.features || []).slice(need === 'free' ? 0 : 1, need === 'free' ? 4 : 5);
  const el = sheet('nx-offre', `
    <div class="nxo-up nxo-${esc(need)}">
      <div class="nxo-up-head">
        <span class="nxo-medal nxo-${esc(need)} lg">${ico(look.icon, 24)}</span>
        <div>
          <small class="nxo-kicker">Offre ${esc(p.name)}</small>
          <h2>${esc(title)}</h2>
          <p>${esc(info.message || `${feat[0] || 'Cette fonction'} fait partie de l’offre ${p.name}.`)}</p>
        </div>
      </div>
      <div class="nxo-up-body">
        <div class="nxo-up-price"><b>${p.price_month_cents ? esc(money(p.price_month_cents)) : '0 $'}</b><span>/ mois</span>${p.price_year_cents ? `<small>ou ${esc(money(p.price_year_cents))} par an (2 mois offerts)</small>` : ''}</div>
        <ul class="nxo-feats">${perks.map((f) => `<li>${ico('nxCheckCircle', 16)}<span>${esc(f)}</span></li>`).join('')}</ul>
        <div class="nxo-keys">${planKeys(lim).map((k) => `<span>${esc(k)}</span>`).join('')}</div>
        ${s.plan && !auth ? `<p class="nx-muted small">Votre offre actuelle : <b>${esc(s.plan_name || s.plan)}</b>.</p>` : ''}
      </div>
    </div>
    <div class="sheet-foot">
      <span class="grow"></span>
      <button class="btn" data-sheet="close">Plus tard</button>
      ${auth ? '<button class="btn primary" data-nxo-login>Se connecter</button>'
        : `<button class="btn" data-nxo-offers>Voir les offres</button>${need !== 'free' && need !== s.plan ? `<button class="btn primary" data-nxo-ask="${esc(need)}">Passer à ${esc(p.name)}</button>` : ''}`}
    </div>`);
  if (el) el.classList.add('nxo-up-sheet');
}

// Boutons des fenêtres et cartes des offres, où qu'ils soient.
export async function onClick(e) {
  const login = e.target.closest('[data-nxo-login]');
  if (login) { closeSheet(); await openAccount('login'); return true; }
  const feat = e.target.closest('[data-nxo-feature]');
  if (feat) {
    const perm = feat.dataset.nxoFeature;
    openUpsell({ feature: perm, reason: 'plan', need: 'pro', message: perm === 'studio_advanced' ? 'Rendu avancé, exports GIF et vidéo, page web 3D, matières, animation physique et formes combinées font partie de l’offre Pro.' : 'Retouche d’image, effets, outils vectoriels, éléments et pages font partie de NEX-DESIGN étendu, dans l’offre Pro.' });
    return true;
  }
  const offers = e.target.closest('[data-nxo-offers]');
  if (offers) { await openAccount('plan'); return true; }
  const ask = e.target.closest('[data-nxo-ask]');
  if (ask) {
    if (!cloud.user) { await openAccount('login'); return true; }
    // NEXORA #076 : l'abonnement se prend dans le navigateur (site de NEXORA, page « Ma licence ») ; le logiciel passe
    // en Pro au contrôle de licence suivant. Sans le canal (aperçu), demande à l'équipe comme avant.
    // NEXORA #087 : tant que le paiement en ligne n'est pas ouvert, la page indique comment l'équipe active Pro.
    // NEXORA #112 : aussi depuis Mon compte → Offre et usage (panel.js) ; même compte à reprendre sur la page.
    try { await window.vitrine.invoke('license:open-site', 'licence?offre=pro'); closeSheet(); toast('Page « Ma licence » ouverte dans votre navigateur : connectez-vous avec ce même compte, puis choisissez « Passer à Pro » pour payer.'); return true; } catch { /* sans le canal : demande à l'équipe */ }
    ask.disabled = true;
    try {
      const t = await askPlan(ask.dataset.nxoAsk);
      toast('Demande envoyée : l’équipe NEXORA vous répond rapidement.');
      await openAccount('support', t.id);
    } catch (err) {
      toast(err.message || String(err), { kind: 'bad' });
    } finally { ask.disabled = false; }
    return true;
  }
  return false;
}
