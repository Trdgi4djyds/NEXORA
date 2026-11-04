// NEXORA #037 : fenêtre « Fonction de l'offre Standard / Pro », ouverte quand une action est refusée par
// l'offre (événement plan:blocked du processus principal, App Builder, espaces réservés).
import { ico, esc, sheet, closeSheet, toast } from '../core.js';
import { cloud, askPlan, current } from './status.js';
import { FALLBACK, FEATURES, PLAN_LOOK, limitText, money, neededPlan, normPlan } from './catalog.js';

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
  const title = info.title || (info.reason === 'quota' ? 'Quota de ton offre atteint' : auth && need === 'free' ? 'Connecte-toi à ton compte NEXORA' : `${feat[0] || 'Cette fonction'} : offre ${p.name}`);
  const lim = p.limits;
  const perks = (p.features || []).slice(need === 'free' ? 0 : 1, need === 'free' ? 4 : 5);
  const el = sheet('nx-offre', `
    <div class="nxo-up nxo-${esc(need)}">
      <div class="nxo-up-art" data-nxo-art="${look.object}" data-nxo-tone="${look.tone}" data-nxo-key="up-${esc(need)}">
        <small class="nxo-kicker">${ico(look.icon, 12)} Offre ${esc(p.name)}</small>
        <h2>${esc(title)}</h2>
        <p>${esc(info.message || `${feat[0] || 'Cette fonction'} fait partie de l’offre ${p.name}.`)}</p>
      </div>
      <div class="nxo-up-body">
        <div class="nxo-up-price"><b>${p.price_month_cents ? esc(money(p.price_month_cents)) : '0 $'}</b><span>/ mois</span>${p.price_year_cents ? `<small>ou ${esc(money(p.price_year_cents))} par an (2 mois offerts)</small>` : ''}</div>
        <ul class="nxo-feats">${perks.map((f) => `<li>${ico('check', 12)}<span>${esc(f)}</span></li>`).join('')}</ul>
        <div class="nxo-keys"><span>${esc(limitText(lim.projects))} projets</span><span>${esc(limitText(lim.apps))} apps</span><span>${esc(limitText(lim.ai_requests_month))} IA / mois</span><span>${esc(limitText(lim.builds_month))} constructions / mois</span></div>
        ${s.plan && !auth ? `<p class="nx-muted small">Ton offre actuelle : <b>${esc(s.plan_name || s.plan)}</b>.</p>` : ''}
      </div>
    </div>
    <div class="sheet-foot">
      <span class="nx-muted small nxo-up-safe">${ico('lock', 12)} Vérifié par les serveurs NEXORA</span><span class="grow"></span>
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
    openUpsell({ feature: perm, reason: 'plan', need: perm === 'studio_advanced' ? 'pro' : 'standard', message: perm === 'studio_advanced' ? 'Rendu avancé, exports GIF et vidéo, page web 3D, matières, animation physique et formes combinées font partie de l’offre Pro.' : 'Retouche d’image, effets, outils vectoriels, éléments et pages font partie de NEX-DESIGN étendu, dans l’offre Standard.' });
    return true;
  }
  const offers = e.target.closest('[data-nxo-offers]');
  if (offers) { await openAccount('plan'); return true; }
  const ask = e.target.closest('[data-nxo-ask]');
  if (ask) {
    if (!cloud.user) { await openAccount('login'); return true; }
    ask.disabled = true;
    try {
      const t = await askPlan(ask.dataset.nxoAsk);
      toast('Demande envoyée : l’équipe NEXORA te répond rapidement.');
      await openAccount('support', t.id);
    } catch (err) {
      toast(err.message || String(err), { kind: 'bad' });
    } finally { ask.disabled = false; }
    return true;
  }
  return false;
}
