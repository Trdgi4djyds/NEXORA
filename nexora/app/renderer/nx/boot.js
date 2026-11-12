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
// NEXORA #115 : animation de pliage des pliables « livre » (iPhone Duo…) du Responsive Lab.
load('devices', () => document.body, './devices/duo.js');
// NEXORA #030 : session du compte transmise au processus principal pour les alertes e-mail (Brevo).
load('alerts', () => document.body, './alerts/index.js');
// NEXORA #076 : licence obligatoire (écran de verrouillage, essai Pro du premier jour, journaux de session).
load('licence', () => document.body, './licence/index.js');
// NEXORA #076 : projets en fichiers .novx (export, import, double-clic, Google Drive).
load('novx', () => settings.uiV2 && document.body, './novx/index.js');
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
// NEXORA #048 : espace Sécurité en six onglets (vue d'ensemble, audits du site, du domaine, du code et des
// applications, supervision), posés avant la première ouverture de l'espace.
load('secu', () => document.body, './secu/index.js');
// NEXORA #052 : outils du Dev Lab (Problèmes, scripts, variables protégées, Git avancé, débogueur, API, tests,
// dépendances, mise en ligne, contrôles, bases de données, assistant IA du projet), posés à la création du Dev Lab.
load('devplus', () => state.devLab && state.devLab.el && state.devLab.st && state.devLab, './devplus/index.js');
// NEXORA #053 : NEX-DESIGN (mise en page automatique, variables, variantes, prototype, code, accessibilité, polices,
// série, impression, import, IA, icônes, versions, validation, équipe), posé après les fonctions du #011.
load('designplus', () => state.design && state.design.ready && state.design.nxInstalled && state.design, './designplus/index.js');
// NEXORA #053 : liens de validation (#/revue/…) et de partage (#/share/…), dès le démarrage (application et web).
load('revue', () => document.body, './designplus/share.js');
// NEXORA #055 : Studio 3D & Motion (création par l'IA, import OBJ/STL/PLY/SPLAT, réseaux sociaux, bruitages, clés et
// repères, rendus par lots, packs web et réalité augmentée, Lottie, validation des vidéos, versions, équipe), posé
// après les fonctions du #011.
load('studioplus', () => state.studio && state.studio.ready && state.studio.nxInstalled && state.studio, './studioplus/index.js');
// NEXORA #059 : version de NEXORA (fenêtre « Nouveautés » une fois par version, dépôt des mises à jour déduit de
// l'adresse de téléchargement publiée), une fois les réglages lus ; démarrage par objectif sur l'Accueil.
load('version', () => settings.uiV2 && document.body, './version/index.js');
load('accueil', () => settings.uiV2 && document.getElementById('home'), './accueil/index.js');
