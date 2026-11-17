// NEXORA #129 : minutage commun de la vidéo de présentation, lu par la composition (scripts/video/presentation.html,
// dans le navigateur) et par le son (scripts/video/audio.mjs, dans Node). L'image et le son partent des mêmes
// instants : changer une valeur ici déplace à la fois l'animation, la voix et les effets sonores.
//
// Tempo de la musique : 100 battements par minute (0,6 s), mesures de 4 temps (2,4 s) ; les scènes commencent
// sur un temps, les grandes étapes (9 espaces, appareils, conclusion) sur une mesure.

export const BEAT = 0.6
export const BAR = 4 * BEAT

/** Début de chaque scène, en secondes. */
export const SC = {
  intro: 0,
  probleme: 6.6,
  espaces: 15.0,
  action: 19.8,
  appareils: 53.4,
  parcours: 60.6,
  fin: 67.8,
}
/** Durée de chacun des 8 espaces « en action » (7 temps). */
export const SHOW = 4.2
export const DURATION = 77.4

/**
 * Narration (voix de synthèse SIWIS, Piper ; fichiers scripts/video/voix/<id>.opus).
 * `t` : début de la phrase ; `texte` : ce qui est dit (sous-titres) ; `dit` : texte donné à la synthèse, avec les
 * noms anglais écrits en phonèmes entre [[ ]] (sinon lus à la française : « Browser » devenait « brosse et »).
 * `mots` : instants de quelques mots dans la phrase (secondes depuis `t`), mesurés sur les fichiers enregistrés
 * par la transcription de whisper.cpp, pour faire apparaître le texte à l'écran au moment où il est prononcé :
 * 02 : mots du slogan ; 03 : mots du titre du problème ; 04 : « un seul logiciel » ; 05 : « Neuf espaces », « un même
 * projet » ; 15 : les 5 mots du titre puis « web », « Android », « Windows » ; 16 : « NEXORA » puis les 10 mots de la
 * phrase finale ; 17 : « Rendez-vous », « sur », l'adresse. À remesurer si un fichier de voix est refait.
 */
export const VOICE = [
  { id: "01-nexora", t: 1.05, texte: "NEXORA.", dit: "NEXORA." },
  { id: "02-creez", t: 2.3, texte: "Créez, testez et publiez vos sites et vos applications.", dit: "Créez, testez et publiez vos sites et vos applications.",
    mots: [0.07, 0.84, 1.08, 1.22, 1.8, 2.05, 2.6, 2.66, 2.84] },
  { id: "03-un-site", t: 6.95, texte: "Un site web, une application, des visuels… et un outil différent pour chaque étape.", dit: "Un site web, une application, des visuels… et un outil différent pour chaque étape.",
    mots: [0.02, 0.14, 0.43, 1.01, 1.12, 1.95, 2.18, 2.6, 2.69, 2.78, 3.01, 3.48, 3.68, 3.99] },
  { id: "04-et-si", t: 11.6, texte: "Et si tout tenait dans un seul logiciel ?", dit: "Et si tout tenait dans un seul logiciel ?", mots: [0.98, 1.09, 1.31] },
  { id: "05-neuf-espaces", t: 15.35, texte: "Neuf espaces, réunis autour d’un même projet.", dit: "Neuf espaces, réunis autour d'un même projet.", mots: [0.02, 0.25, 1.61, 1.8, 2.04] },
  { id: "06-responsive", t: 0, texte: "Le Responsive Lab montre votre site sur tous les écrans.", dit: "Le [[ʁispˈɔnsiv lˈab]] montre votre site sur tous les écrans." },
  { id: "07-browser", t: 0, texte: "Le Browser Lab trouve ce qui cloche, et vous dit pourquoi.", dit: "Le [[bʁˈawzœʁ lˈab]] trouve ce qui cloche, et vous dit pourquoi." },
  { id: "08-dev", t: 0, texte: "Le Dev Lab : codez, testez et déboguez, sans rien installer.", dit: "Le Dev Lab : codez, testez et déboguez, sans rien installer." },
  { id: "09-app", t: 0, texte: "L’App Builder transforme votre site en application Android.", dit: "[[lˈap bˈildœʁ]] transforme votre site en application Android." },
  { id: "10-studio", t: 0, texte: "Le Studio met vos projets en scène, en 3D et en vidéo.", dit: "Le Studio met vos projets en scène, en 3D et en vidéo." },
  { id: "11-design", t: 0, texte: "NEX-DESIGN crée vos maquettes et vos visuels.", dit: "[[nˈɛks dizˈajn]] crée vos maquettes et vos visuels." },
  { id: "12-securite", t: 0, texte: "La Sécurité analyse et surveille votre site, jour et nuit.", dit: "La Sécurité analyse et surveille votre site, jour et nuit." },
  { id: "13-desktop", t: 0, texte: "Et le Desktop Builder le transforme en vrai logiciel Windows.", dit: "Et le [[dɛsktˈɔp bˈildœʁ]] le transforme en vrai logiciel [[wˈindoz]]." },
  { id: "14-appareils", t: SC.appareils + 0.25, texte: "Cent quatre-vingt-deux modèles d’appareils, pour vérifier chaque détail.", dit: "Cent quatre-vingt-deux modèles d'appareils, pour vérifier chaque détail." },
  { id: "15-parcours", t: SC.parcours + 0.3, texte: "De l’idée à la publication : sur le web, sur Android et sur Windows.", dit: "De l'idée à la publication : sur le web, sur Android et sur [[wˈindoz]].",
    mots: [0.09, 0.14, 0.55, 0.66, 0.76, 2.16, 2.85, 3.6] },
  { id: "16-fin", t: SC.fin + 0.55, texte: "NEXORA. Tout pour créer, tester et publier, dans un seul logiciel.", dit: "NEXORA. Tout pour créer, tester et publier, dans un seul logiciel.",
    mots: [0.02, 0.98, 1.1, 1.35, 2.04, 2.46, 2.63, 3.35, 3.56, 3.72, 3.98] },
  { id: "17-adresse", t: SC.fin + 5.7, texte: "Rendez-vous sur nexoradevs.online.", dit: "Rendez-vous sur [[nɛksoʁadˈɛvz]] point [[ɔnlˈajn]].", mots: [0.01, 0.84, 1.07] },
]
// Les 8 espaces : une phrase chacun, peu après l'entrée de la fenêtre.
for (let i = 0; i < 8; i += 1) VOICE[5 + i].t = +(SC.action + i * SHOW + 0.3).toFixed(2)
export const voice = (id) => VOICE.find((v) => v.id === id)
/** Instant absolu du k-ième mot repéré d'une phrase. */
export const word = (id, k) => { const v = voice(id); return v.t + v.mots[k] }
