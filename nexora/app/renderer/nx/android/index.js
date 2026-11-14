// NEXORA #017 : sections ajoutées à l'App Builder (#017 fiche Play Store, #018 statistiques et plantages, #019 achats intégrés, #024 écrans d'appareils, #056 prêt pour le Play Store et tests fermés, #073 messagerie et appels, #115 logo et démarrage, modules). Chargé au démarrage par nx/boot.js, avant la première
// ouverture de l'espace : les sections et leurs méthodes sont posées sur la classe de l'App Builder, si bien
// qu'une section ajoutée peut être rouverte directement au lancement suivant.
import { SECTIONS, nxAppBuilder } from '../../dist/chunks/android-W5CZA2A2.js';
import { state } from '../core.js';
import * as listing from './listing.js';
import * as insights from './insights.js';
import * as billing from './billing.js';
import * as home from './home.js';
import * as ready from './ready.js';
import * as testers from './testers.js';
import * as messaging from './messaging.js';
// NEXORA #115 : créateur de logo et d'écran de démarrage, modules OneSignal, AdMob, Google Analytics et Meta.
import * as brand from './brand.js';
import * as modules from './modules.js';
// NEXORA #120 : projets à serveur (Laravel…) : site en ligne ou serveur de test sur le réseau local.
import * as serveur from './serveur.js';

// messaging après ready : il complète ses contrôles (nxReadyGroups).
const MODULES = [listing, insights, billing, home, ready, testers, messaging, brand, modules, serveur];

function css() {
  if (document.querySelector('link[data-nx-android]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('./android.css', import.meta.url).href;
  l.dataset.nxAndroid = '';
  document.head.append(l);
}

export async function install() {
  css();
  const proto = nxAppBuilder.prototype;
  for (const m of MODULES) m.install(proto, SECTIONS);
  // Espace déjà ouvert (chargement tardif) : on redessine pour faire apparaître les sections.
  const inst = state.android;
  if (inst && inst.el) { inst.render(); inst.renderPreview(); }
}
