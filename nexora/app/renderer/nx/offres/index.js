// NEXORA #037 : offres Gratuit, Standard et Pro dans l'application (et la version web).
//  - onglet « Offre et usage » de Mon compte (crochet globalThis.__nxOffres dans chunk-EOM7FQDL.js) ;
//  - fenêtre « offre requise » quand une action est refusée (événement plan:blocked du processus principal) ;
//  - App Builder : essai de 7 jours des applications de l'offre Gratuite, verrou après l'essai ;
//  - Dev Lab et Desktop Builder voilés sans l'offre Standard.
// Chargé au démarrage par nx/boot.js.
import { a as ICONS } from '../../dist/chunks/chunk-S4I2LXHS.js';
import { nxAppBuilder } from '../../dist/chunks/android-W5CZA2A2.js';
import { state } from '../core.js';
import { cloud, status, onChange, refreshMain } from './status.js';
import { planOf } from './catalog.js';
import { panel, onClick as panelClick } from './panel.js';
import { openUpsell, onClick as upsellClick } from './upsell.js';
import * as appbuilder from './appbuilder.js';
import * as locks from './locks.js';
import { period, remind } from './countdown.js';

// Icônes manquantes, dans le style de NEXORA (trait 1,6, grille 24).
const MORE_ICONS = {
  nxSend: '<path d="M21 3 10.5 13.5"/><path d="M21 3 14.5 21l-4-7.5L3 9.5Z"/>',
  nxCrown: '<path d="M3.5 8 7 15h10l3.5-7-5 3L12 5l-3.5 6Z"/><path d="M7 18.5h10"/>',
  nxArrowRight: '<path d="M4.5 12h15"/><path d="m13.5 6 6 6-6 6"/>',
  // NEXORA #040 : calendrier de l'abonnement, flèche des liens ronds, avantages cochés.
  nxCalendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M8 14h2"/><path d="M14 14h2"/><path d="M8 17h2"/>',
  nxArrowUpRight: '<path d="M7 17 17 7"/><path d="M8.5 7H17v8.5"/>',
  nxCheckCircle: '<circle cx="12" cy="12" r="8.5"/><path d="m8.2 12.2 2.6 2.6 5-5.4"/>',
};

function css() {
  if (document.querySelector('link[data-nx-offres]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('./offres.css', import.meta.url).href;
  l.dataset.nxOffres = '';
  document.head.append(l);
}

let timer = 0;
function changed() {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    await status(true).catch(() => {});
    refreshMain();
    await appbuilder.refresh(state.android);
  }, 300);
}

export async function install() {
  for (const [k, v] of Object.entries(MORE_ICONS)) if (!ICONS[k]) ICONS[k] = v;
  css();
  globalThis.__nxOffres = { panel, planName: (id) => planOf(id).name };
  appbuilder.install(nxAppBuilder.prototype);
  document.addEventListener('click', (e) => { if (!panelClick(e)) upsellClick(e); });
  try { window.vitrine.on('plan:blocked', (info) => openUpsell(info || {})); } catch { /* aperçu sans l'événement */ }
  onChange((st) => {
    locks.apply(); locks.lockCards();
    // NEXORA #040 : rappel avant l'échéance d'une offre payée (réglé dans Offre et usage).
    if (st && st.plan !== 'free') try { remind(period(cloud.org), st.plan_name || planOf(st.plan).name); } catch { /* sans effet */ }
  });
  locks.watchCards();
  for (const ev of ['account', 'org', 'auth']) cloud.on(ev, changed);
  locks.apply();
  await status().catch(() => {});
  locks.apply();
  // App Builder déjà ouvert (chargement tardif) : bandeau et verrou.
  if (state.android && state.android.el) appbuilder.refresh(state.android);
}
