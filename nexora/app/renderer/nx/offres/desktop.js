// NEXORA #087 : Desktop Builder et offres. Un logiciel compte parmi les 2 applications de l'offre Gratuite (App
// Builder et Desktop Builder confondus, applications supprimées comprises) à sa première construction ; ensuite,
// 5 constructions par logiciel et par mois. Le processus principal envoie l'identifiant du logiciel (champ nxApp de
// desktop:build) à nx_app_build, qui le réserve et compte la construction (src/plan.js). Ici : le bandeau au-dessus
// du bouton « Construire le logiciel » et les compteurs relus après chaque construction. Pro : rien à signaler.
import { ico, esc, settings } from '../core.js';
import { cloud, current, appTrials, trialsCached, releaseApp } from './status.js';
import { FALLBACK, money } from './catalog.js';

const ids = () => ((settings.desktop && settings.desktop.apps) || []).map((a) => a.id).filter(Boolean);
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

// Identifiant du logiciel joint à la construction.
export function nxApp(a) {
  const src = (a && a.source) || {};
  return { id: a && a.id, name: (a && a.name) || '', kind: src.kind === 'url' ? 'url' : src.kind === 'electron' ? 'project' : 'folder', url: src.kind === 'url' ? src.url || null : null };
}

// Relit les applications du compte (logiciels de ce PC compris).
export async function refresh() {
  if (!cloud.user) return null;
  return appTrials(true, ids()).catch(() => null);
}

// Logiciel supprimé de la liste : toujours compté par le serveur (offre Gratuite, limite à vie).
export function released(id) {
  if (cloud.user && id) releaseApp(id);
}

// Bandeau de l'offre pour le logiciel affiché ('' : rien à dire).
export function banner(a) {
  const s = current();
  if (!a || !cloud.user || s.admin) return '';
  const t = trialsCached();
  if (!t || t.unavailable) return '';
  const lim = Number(t.limit), per = Number(t.builds_limit);
  if (!(per > 0) && !t.lifetime) return '';
  const max = lim >= 0 ? lim : FALLBACK.free.limits.apps, used = Number(t.used) || 0;
  const perN = per > 0 ? per : FALLBACK.free.limits.builds_per_app_month;
  const row = t.apps[a.id] && !t.apps[a.id].deleted ? t.apps[a.id] : null;
  const known = !!t.apps[a.id];
  const apps = `${used} sur ${max} application${max > 1 ? 's' : ''} utilisée${used > 1 ? 's' : ''}, Android ou Windows, applications supprimées comprises`;
  const pro = `<button type="button" class="nxo-btn primary small" data-nxo-ask="pro">Passer à Pro · ${esc(money(FALLBACK.pro.price_month_cents))} / mois</button>`;
  const box = (tone, icon, title, text, bar, btn) => `<div class="nxo-ab-banner nxo-dsk${tone ? ` ${tone}` : ''}">
    <span class="nxo-ab-ic">${ico(icon, 15)}</span>
    <div><b>${esc(title)}</b><small>${esc(text)}</small>${bar}</div>
    ${btn}
  </div>`;
  if (row && row.status !== 'active' && row.status !== 'trial') {
    return box('bad', 'lock', 'Ce logiciel dépasse votre offre', `L’offre Gratuite comprend ${max} applications au total : celui-ci a été créé en plus, pendant votre premier jour ou avec Pro. Sa construction reste bloquée jusqu’à votre passage à Pro.`, '', pro);
  }
  if (row) {
    const n = Math.min(perN, Number(row.builds_month) || 0), full = n >= perN;
    return box(full ? 'bad' : '', 'display', full ? 'Offre Gratuite · constructions du mois utilisées' : `Offre Gratuite · ${n} sur ${plural(perN, 'construction', 'constructions')} ce mois-ci`,
      `${full ? 'Le compteur de ce logiciel repart le 1ᵉʳ du mois. ' : ''}${apps}.`, `<i class="nxo-bar"><em style="width:${((n / perN) * 100).toFixed(0)}%"></em></i>`, full ? pro : '<button type="button" class="nxo-btn ghost small" data-nxo-offers>Voir les offres</button>');
  }
  if (!known && used >= max) {
    return box('bad', 'lock', `Vos ${max} applications gratuites sont créées`, `Ce logiciel ne peut pas être construit avec l’offre Gratuite (${apps}). Passez à Pro pour en créer d’autres, jusqu’à ${FALLBACK.pro.limits.apps}.`, '', pro);
  }
  return box('', 'display', `Offre Gratuite : ${plural(max, 'application', 'applications')} au total`,
    `${known ? 'Ce logiciel garde sa place parmi vos applications.' : `Ce logiciel comptera parmi elles à sa première construction, puis ${perN} constructions par mois.`} ${apps}.`, '', '<button type="button" class="nxo-btn ghost small" data-nxo-offers>Voir les offres</button>');
}
