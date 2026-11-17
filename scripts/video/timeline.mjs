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
 * Narration (#130 : voix vive et continue, d'après la voix de référence de l'utilisateur ; synthèse Kokoro et Praat,
 * fichiers scripts/video/voix/<id>.opus, voir audio.mjs). `t` : début de la phrase ; `texte` : ce qui est dit
 * (sous-titres) ; `dit` : texte donné à la synthèse, noms anglais écrits en phonèmes entre [[ ]] (sinon lus à la
 * française ou basculés en anglais : « design », « Browser », « web »).
 * `mots` : instants de quelques mots dans la phrase (secondes depuis `t`), mesurés sur les fichiers enregistrés par la
 * transcription de whisper.cpp, pour faire apparaître le texte ou allumer un élément au moment où il est prononcé :
 * 02 : les 7 mots du slogan ; 04 : les 14 mots du titre du problème ; 05 : « un seul logiciel » ; 16 : « Cent » et
 * « deux » (compteur) ; 17 : les 5 verbes (étapes du parcours) puis « web », « Android », « Windows » ; 18 : « NEXORA »
 * puis les 10 mots de la phrase finale ; 19 : « Rejoignez », l'adresse. À remesurer si un fichier de voix est refait.
 */
export const VOICE = [
  { id: "01-nexora", t: 1.0, texte: "NEXORA.", dit: "NEXORA." },
  { id: "02-vous-creez", t: 1.95, texte: "Vous créez des sites et des applications ?", dit: "Vous créez des sites et des applications ?", mots: [0.02, 0.21, 0.45, 0.61, 0.91, 0.95, 1.1] },
  { id: "03-fait-pour-vous", t: 4.45, texte: "NEXORA est fait pour vous !", dit: "NEXORA est fait pour vous !" },
  { id: "04-un-site", t: 6.6, texte: "Un site web, une application, des visuels… et un outil différent pour chaque étape ?", dit: "Un site [[wˈɛb]], une application, des visuels… et un outil différent pour chaque étape ?", mots: [0.02, 0.12, 0.38, 0.65, 0.85, 1.74, 1.89, 2.54, 2.58, 2.68, 2.94, 3.44, 3.61, 3.89] },
  { id: "05-et-si", t: 11.1, texte: "Et si tout tenait dans un seul logiciel ?", dit: "Et si tout tenait dans un seul logiciel ?", mots: [1.12, 1.24, 1.43] },
  { id: "06-neuf-espaces", t: 13.25, texte: "Neuf espaces. Un même projet.", dit: "Neuf espaces. Un même projet." },
  { id: "07-tout-est-la", t: 15.05, texte: "Du design au code, des tests à la sécurité, jusqu’à la publication : tout est là !", dit: "Du [[dizˈajn]] au code, des tests à la sécurité, jusqu'à la publication : tout est là !" },
  { id: "08-responsive", t: 0, texte: "Le Responsive Lab montre votre site sur tous les écrans, d’un coup d’œil.", dit: "Le [[ʁispˈɔnsiv lˈab]] montre votre site sur tous les écrans, d'un coup d'œil." },
  { id: "09-browser", t: 0, texte: "Un bug ? Le Browser Lab trouve tout de suite ce qui cloche, et vous dit pourquoi.", dit: "Un bug ? Le [[bʁˈawzœʁ lˈab]] trouve tout de suite ce qui cloche, et vous dit pourquoi." },
  { id: "10-dev", t: 0, texte: "Le Dev Lab : codez, testez et déboguez votre projet, sans rien installer.", dit: "Le Dev Lab : codez, testez et déboguez votre projet, sans rien installer." },
  { id: "11-app", t: 0, texte: "L’App Builder transforme votre site en application Android signée.", dit: "L'[[ˈap bˈildœʁ]] transforme votre site en application Android signée." },
  { id: "12-studio", t: 0, texte: "Le Studio met vos projets en scène, avec des rendus 3D et des vidéos.", dit: "Le Studio met vos projets en scène, avec des rendus 3D et des vidéos." },
  { id: "13-design", t: 0, texte: "NEX-DESIGN crée vos maquettes et vos prototypes, du croquis au code.", dit: "[[nˈɛks dizˈajn]] crée vos maquettes et vos prototypes, du croquis au code." },
  { id: "14-securite", t: 0, texte: "La Sécurité analyse votre site et votre code, et veille jour et nuit.", dit: "La Sécurité analyse votre site et votre code, et veille jour et nuit." },
  { id: "15-desktop", t: 0, texte: "Et le Desktop Builder en fait un vrai logiciel Windows, à installer !", dit: "Et le [[dˈɛsktɔp bˈildœʁ]] en fait un vrai logiciel [[wˈindoz]], à installer !" },
  { id: "16-appareils", t: SC.appareils + 0.15, texte: "Cent quatre-vingt-deux modèles d’appareils : iPhone, Galaxy, Pixel, pliables, tablettes, ordinateurs… côte à côte !", dit: "Cent quatre-vingt-deux modèles d'appareils : iPhone, Galaxy, Pixel, pliables, tablettes, ordinateurs… côte à côte !", mots: [0.03, 0.55] },
  { id: "17-parcours", t: SC.parcours + 0.4, texte: "Concevez, codez, testez, sécurisez, et publiez : sur le web, sur Android et sur Windows !", dit: "Concevez, codez, testez, sécurisez, et publiez : sur le [[wˈɛb]], sur Android et sur [[wˈindoz]] !", mots: [0.04, 0.53, 0.99, 1.49, 2.23, 3.11, 3.58, 4.31] },
  { id: "18-fin", t: SC.fin + 0.05, texte: "NEXORA : tout pour créer, tester et publier, dans un seul logiciel.", dit: "NEXORA : tout pour créer, tester et publier, dans un seul logiciel.", mots: [0.01, 0.36, 0.66, 0.84, 1.37, 1.62, 1.74, 2.2, 2.42, 2.6, 2.75] },
  { id: "19-adresse", t: 71.5, texte: "Rejoignez NEXORA sur nexoradevs.online !", dit: "Rejoignez NEXORA sur [[nɛksɔʁadˈɛvz pwˈɛ̃ ɔnlˈajn]] !", mots: [0.02, 1.23] },
]
// Les 8 espaces : une phrase chacune, dès l'entrée de la fenêtre.
for (let i = 0; i < 8; i += 1) VOICE[7 + i].t = +(SC.action + i * SHOW + 0.12).toFixed(2)
export const voice = (id) => VOICE.find((v) => v.id === id)
/** Instant absolu du k-ième mot repéré d'une phrase. */
export const word = (id, k) => { const v = voice(id); return v.t + v.mots[k] }
