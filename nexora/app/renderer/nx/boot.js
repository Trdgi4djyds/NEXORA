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
