// NEXORA #011 : charge les fonctions ajoutées à NEX-DESIGN, au Studio 3D & Motion et aux Maquettes
// dès que l'espace correspondant est ouvert (les instances sont créées à la première ouverture).
import { state, settings, waitFor } from './core.js';

const ready = (window.__nxReady = window.__nxReady || {});
async function load(name, test, path) {
  const inst = await waitFor(test);
  try {
    const m = await import(path);
    await m.install(inst);
    ready[name] = true;
  } catch (e) {
    ready[name] = `erreur : ${e && e.message ? e.message : e}`;
    console.error(`[NEXORA #011] ${name}`, e);
  }
}
load('design', () => state.design && state.design.ready && state.design, './design/index.js');
load('studio', () => state.studio && state.studio.ready && state.studio, './studio/index.js');
// NEXORA #016 : isolation des projets et détection des outils, dès le démarrage (tous les espaces), une fois
// les réglages chargés (uiV2 est posé par leur chargement) : rien n'est enregistré avant.
load('projects', () => settings.uiV2 && document.body, './projects/index.js');
// NEXORA #017 : sections ajoutées à l'App Builder (fiche Play Store…), posées avant la première ouverture.
load('android', () => document.body, './android/index.js');
// NEXORA #030 : session du compte transmise au processus principal pour les alertes e-mail (Brevo).
load('alerts', () => document.body, './alerts/index.js');
// NEXORA #033 : illustrations en fond des cartes (Accueil, Dev Lab, indicateurs).
load('cards', () => document.body, './cards/index.js');
// NEXORA #032 : pages Profil (Mon compte) et Réglages redessinées, posées avant leur première ouverture.
load('profil', () => document.body, './profil/index.js');
// NEXORA #034 : écrans de connexion et d'inscription du compte NEXORA redessinés.
load('auth', () => document.body, './auth/index.js');
// NEXORA #037 : offres Gratuit, Standard et Pro (Offre et usage, essais de l'App Builder, espaces réservés).
load('offres', () => document.body, './offres/index.js');
// NEXORA #042 : couche visuelle « Flex » (accent de l'espace, lumière des tuiles, compteurs).
load('look', () => document.body, './look/index.js');
