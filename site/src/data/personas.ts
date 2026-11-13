// NEXORA #117 : les 9 profils « Pour qui ? » (pages /pour-qui et /pour-qui/<profil>, section de l'accueil, recherche,
// référencement). Pour chacun : la situation de départ, ce qui freine aujourd'hui et ce que NEXORA change (`shifts`),
// puis un parcours relié aux espaces (`steps`). Seules des fonctions livrées sont citées (voir data/spaces.ts) ; la
// citation est une situation type, jamais un témoignage attribué à une personne réelle ; aucune offre ni prix.
import { DEVICE_COUNT } from "../lib/product"
import type { Shift } from "./content"
import type { SpaceId } from "./spaces"

export type PersonaStep = { space: SpaceId; title: string; text: string }
export type Persona = {
  slug: string
  name: string
  /** Nom court (pastilles, liens). */
  short: string
  icon: string
  /** La promesse, en une phrase. */
  tagline: string
  h1: [string, string]
  lead: string
  /** Situation type, à la première personne. */
  quote: string
  shifts: Shift[]
  steps: PersonaStep[]
}

export const PERSONAS: Persona[] = [
  {
    slug: "etudiants",
    name: "Étudiants en informatique",
    short: "Étudiants",
    icon: "bulb",
    tagline: "Apprenez sur de vrais outils et rendez des projets qui fonctionnent partout.",
    h1: ["Vos projets d’école,", "prêts à être montrés."],
    lead: "Installer Node.js, Python ou Git sans droits d’administrateur, tester un TP sur un vrai format de téléphone, rendre un projet qui s’ouvre devant le jury : NEXORA règle ces détails pour que vous restiez concentré sur ce que vous apprenez.",
    quote: "Je passe plus de temps à installer mes outils qu’à coder mon projet.",
    shifts: [
      { before: "Une soirée perdue à installer Node.js, Python et Git, puis des erreurs de chemin à n’en plus finir.", after: "15 outils installés depuis leurs sources officielles, sans droits d’administrateur, prêts dans le Dev Lab." },
      { before: "Un projet vérifié dans votre seul navigateur, qui casse sur le téléphone du jury.", after: `Votre page dans le cadre de ${DEVICE_COUNT} modèles d’appareils, côte à côte, avant la soutenance.` },
      { before: "Le réseau, la console et les audits vus en cours, mais jamais vraiment pratiqués.", after: "Le Browser Lab montre chaque requête, chaque erreur, et un audit de performance, d’accessibilité et de référencement." },
      { before: "Un rendu limité à un dossier compressé que personne n’ouvre.", after: "Votre projet devient une app Android ou un logiciel Windows à installer devant le jury." },
    ],
    steps: [
      { space: "dev", title: "Partez d’un modèle", text: "15 modèles de projet (HTML, React, Vue, Next.js, Flutter…) : le serveur démarre et l’aperçu suit chaque enregistrement." },
      { space: "preview", title: "Vérifiez sur tous les écrans", text: "Votre TP dans les cadres d’un iPhone, d’un Galaxy, d’une tablette et d’un PC, côte à côte." },
      { space: "browser", title: "Comprenez ce qui se passe", text: "Éléments, réseau et console présentés simplement, et un audit qui classe ce qu’il faut corriger." },
      { space: "android", title: "Montrez-le sur un téléphone", text: "Votre site devient une application Android signée, à installer sur votre téléphone le jour du rendu." },
    ],
  },
  {
    slug: "developpeurs-juniors",
    name: "Développeurs juniors",
    short: "Juniors",
    icon: "terminal",
    tagline: "Livrez un code vérifié, sans attendre qu’on repasse derrière vous.",
    h1: ["Codez avec assurance,", "livrez sans stress."],
    lead: "Premier poste, premières missions : il faut livrer vite sans casser ce qui marche. NEXORA réunit l’éditeur, le terminal, Git, les tests, le débogueur et les contrôles avant mise en ligne, pour repérer les erreurs avant qu’on ne vous les signale.",
    quote: "J’ai peur d’envoyer une modification qui casse quelque chose sans que je m’en rende compte.",
    shifts: [
      { before: "Des erreurs découvertes par le client, une fois le site en ligne.", after: "Les problèmes de tout le projet listés au même endroit et vos tests lancés avec leur couverture avant chaque envoi." },
      { before: "Une fusion Git avec des conflits qui fait peur.", after: "Branches, fusion avec les conflits côte à côte et historique en graphe, sans retenir les commandes." },
      { before: "Des messages semés partout dans le code pour trouver un bug.", after: "Un vrai débogueur : points d’arrêt avec F9, pas à pas, pile d’appels et variables." },
      { before: "Des clés d’API laissées par erreur dans le code.", after: "Variables protégées chiffrées par Windows, et un audit qui repère les secrets oubliés et les dépendances vulnérables." },
    ],
    steps: [
      { space: "dev", title: "Codez et testez", text: "Éditeur, terminal, Git et tests au même endroit, avec les problèmes de tout le projet sous les yeux." },
      { space: "browser", title: "Inspectez la page", text: "Réseau, console et éléments pour comprendre un bug d’affichage ou un appel qui échoue." },
      { space: "preview", title: "Vérifiez chaque écran", text: "Le rendu sur téléphone, pliable et tablette avant de dire « c’est prêt »." },
      { space: "security", title: "Livrez sans faille évidente", text: "Dépendances vulnérables et secrets oubliés repérés, avec des correctifs proposés." },
    ],
  },
  {
    slug: "codeurs-passionnes",
    name: "Codeurs passionnés",
    short: "Passionnés",
    icon: "heart",
    tagline: "Explorez tout ce qui vous tente, du site à l’application, dans un seul atelier.",
    h1: ["Tous vos projets perso,", "dans un seul atelier."],
    lead: "Le soir et le week-end, vous essayez un framework, une idée de jeu, un outil pour vous. NEXORA vous évite de réinstaller une pile d’outils à chaque envie : un projet s’ouvre, s’essaie sur tous les écrans et peut devenir une vraie application à partager.",
    quote: "J’ai dix projets commencés et aucun que je peux vraiment montrer.",
    shifts: [
      { before: "Un outil différent pour chaque technologie, et des réglages à refaire à chaque fois.", after: "Votre framework reconnu à l’ouverture du dossier, les dépendances installées, le serveur lancé." },
      { before: "Deux projets qui se marchent dessus : cookies, cache, ports.", after: "Chaque projet isolé, avec sa propre session et son propre environnement." },
      { before: "Des projets qui dorment dans un dossier.", after: "Une application Android ou un logiciel Windows à envoyer à vos proches." },
      { before: "Des captures d’écran bancales pour présenter ce que vous avez fait.", after: "Des images et des vidéos de votre projet dans des appareils 3D, aux formats des réseaux sociaux." },
    ],
    steps: [
      { space: "dev", title: "Ouvrez n’importe quel projet", text: "React, Vue, Svelte, Flutter, PHP, Python… les outils qui manquent sont installés pour vous." },
      { space: "preview", title: "Essayez-le partout", text: "Téléphones, pliables, montres, téléviseurs et même voitures : voyez jusqu’où va votre idée." },
      { space: "desktop", title: "Faites-en un vrai logiciel", text: "Installateur, version portable et mises à jour automatiques pour vos outils perso." },
      { space: "studio", title: "Montrez-le avec style", text: "Une vidéo de votre projet dans un appareil 3D, prête pour vos réseaux." },
    ],
  },
  {
    slug: "vibe-codeurs",
    name: "Vibe codeurs",
    short: "Vibe codeurs",
    icon: "sparkle",
    tagline: "Construisez en décrivant ce que vous voulez, et gardez la main sur chaque changement.",
    h1: ["Décrivez votre idée,", "gardez le contrôle."],
    lead: "Vous construisez avec l’IA plutôt que ligne par ligne. NEXORA branche votre propre clé (Claude, GPT, Gemini, Mistral) ou Ollama sur votre PC, montre chaque changement fichier par fichier et vérifie le résultat sur de vrais formats d’écran avant que vous ne le publiiez.",
    quote: "L’IA écrit vite, mais je ne sais jamais vraiment ce qu’elle a modifié.",
    shifts: [
      { before: "Du code collé depuis une conversation, sans savoir ce qui a changé.", after: "L’assistant du Dev Lab propose des changements sur tout le projet, que vous acceptez fichier par fichier et pouvez annuler." },
      { before: "Un abonnement à l’IA de plus, avec des quotas.", after: "Votre propre clé ou Ollama sur votre PC : NEXORA ne compte pas vos requêtes et ne facture rien pour l’IA." },
      { before: "Une application « qui marche chez moi » mais pas sur mobile.", after: "Le Responsive Lab et le Browser Lab montrent ce qui casse, écran par écran, erreur par erreur." },
      { before: "Des clés d’API générées puis oubliées dans le code.", after: "Secrets oubliés repérés par l’audit du code, variables protégées chiffrées par Windows." },
    ],
    steps: [
      { space: "design", title: "Décrivez l’écran", text: "L’IA de NEX-DESIGN crée une maquette à partir d’une description, que vous ajustez puis exportez en code." },
      { space: "dev", title: "Construisez avec l’assistant", text: "Des changements sur tout le projet, acceptés fichier par fichier et annulables." },
      { space: "preview", title: "Vérifiez le résultat", text: `Le rendu réel dans le cadre de ${DEVICE_COUNT} modèles d’appareils, avant de partager quoi que ce soit.` },
      { space: "security", title: "Sécurisez avant de publier", text: "Dépendances vulnérables et secrets oubliés repérés, en-têtes et certificat vérifiés." },
    ],
  },
  {
    slug: "entrepreneurs",
    name: "Entrepreneurs en idéation",
    short: "Entrepreneurs",
    icon: "target",
    tagline: "Rendez votre idée concrète et montrez-la avant d’investir.",
    h1: ["Votre idée,", "visible dès cette semaine."],
    lead: "Avant de chercher des fonds ou de recruter, il faut convaincre : des associés, des premiers clients, un jury. NEXORA vous aide à transformer une idée en maquette cliquable, en vidéo de présentation et en application à installer, sans monter une équipe technique.",
    quote: "J’ai besoin de montrer quelque chose de concret, pas un document de dix pages.",
    shifts: [
      { before: "Des diapositives qui décrivent le produit sans le montrer.", after: "Une maquette cliquable dans NEX-DESIGN, présentée dans le cadre d’un vrai téléphone." },
      { before: "Un devis d’agence avant même de savoir si l’idée plaît.", after: "Votre site devient une application Android que vos premiers testeurs installent." },
      { before: "Une vidéo de démonstration impossible à produire seul.", after: "Le Studio 3D & Motion met votre app en scène dans des appareils 3D et exporte la vidéo." },
      { before: "Des retours éparpillés entre e-mails et messages.", after: "Un lien de validation : vos interlocuteurs commentent sans créer de compte." },
    ],
    steps: [
      { space: "design", title: "Dessinez le produit", text: "Écrans, parcours et prototype cliquable pour faire comprendre l’idée en une minute." },
      { space: "preview", title: "Montrez-le sur mobile", text: "Votre maquette ou votre site dans le cadre d’un iPhone ou d’un Galaxy, pour vos rendez-vous." },
      { space: "studio", title: "Racontez-le en vidéo", text: "Une vidéo de présentation dans des appareils 3D, aux formats des réseaux sociaux." },
      { space: "android", title: "Faites-le essayer", text: "Une application Android signée pour recueillir les premiers avis." },
    ],
  },
  {
    slug: "createurs-mvp",
    name: "Créateurs de MVP",
    short: "MVP",
    icon: "rocket",
    tagline: "Du prototype aux premiers utilisateurs, sans tout reconstruire à chaque étape.",
    h1: ["Lancez votre MVP,", "mesurez, améliorez."],
    lead: "Un MVP doit sortir vite, fonctionner partout et rester en ligne. NEXORA vous donne le code, la publication sur le web, Android et Windows, la supervision 24 h/24 et les statistiques d’usage, pour passer du lancement aux premiers retours sans changer d’outil.",
    quote: "Je dois être en ligne sur le web et sur mobile, et savoir tout de suite si quelque chose tombe.",
    shifts: [
      { before: "Trois bases de code pour le web, Android et Windows.", after: "Un seul site : NEXORA en tire une adresse web, une application Android signée et un logiciel Windows installable." },
      { before: "Une panne signalée par un utilisateur mécontent.", after: "Supervision par les serveurs NEXORA, même application fermée, avec alertes et page de statut publique." },
      { before: "Aucune idée de qui utilise vraiment l’application.", after: "Installations actives, ouvertures, taux sans plantage et erreurs expliquées par l’IA." },
      { before: "Des utilisateurs bloqués sur une ancienne version.", after: "Nouvelle version proposée ou imposée à distance sur Android, mises à jour automatiques sous Windows." },
    ],
    steps: [
      { space: "dev", title: "Codez et mettez en ligne", text: "Publication chez les principaux hébergeurs, avec un contrôle sur trois appareils avant chaque mise en ligne." },
      { space: "android", title: "Sortez l’app Android", text: "Application signée, notifications push, fiche Play Store et test fermé suivi." },
      { space: "desktop", title: "Ajoutez Windows", text: "Installateur signé, mises à jour automatiques, Microsoft Store et winget." },
      { space: "security", title: "Restez en ligne", text: "Supervision 24 h/24, alertes, page de statut et temps de chargement chez vos vrais visiteurs." },
    ],
  },
  {
    slug: "designers",
    name: "Designers",
    short: "Designers",
    icon: "palette",
    tagline: "Concevez, prototypez et obtenez un code fidèle à vos maquettes.",
    h1: ["Vos maquettes,", "fidèles jusqu’au code."],
    lead: "Entre la maquette validée et le site en ligne, des détails se perdent. NEXORA réunit le design, le prototype, l’animation, l’export de code et le test sur de vrais formats d’écran, pour que ce que vous avez dessiné soit ce que vos utilisateurs voient.",
    quote: "Ce qui est en ligne ne ressemble jamais tout à fait à ma maquette.",
    shifts: [
      { before: "Des spécifications recopiées à la main par le développeur.", after: "Export HTML et CSS, ou React et Tailwind, envoyé directement dans le Dev Lab." },
      { before: "Un prototype vu seulement sur grand écran.", after: "Le prototype et le site affichés dans le cadre de dizaines de modèles d’appareils." },
      { before: "Des animations décrites par écrit, puis mal reproduites.", after: "Une frise avec courbes et ressorts, et le code de l’animation en CSS, SwiftUI ou Compose." },
      { before: "Des allers-retours de validation par e-mail.", after: "Liens de validation pour vos clients et bibliothèques d’équipe tenues à jour." },
    ],
    steps: [
      { space: "design", title: "Concevez", text: "Mise en page automatique, variables, variantes, contraste vérifié et prototype cliquable." },
      { space: "preview", title: "Vérifiez sur chaque écran", text: "Le rendu réel sur téléphone, pliable, tablette et ordinateur, côte à côte." },
      { space: "dev", title: "Passez au code", text: "Le code exporté arrive dans le Dev Lab, avec l’aperçu en direct pour comparer." },
      { space: "studio", title: "Présentez", text: "Mises en scène 3D et vidéos de vos écrans pour vos clients et votre portfolio." },
    ],
  },
  {
    slug: "freelances-agences",
    name: "Freelances et agences",
    short: "Freelances",
    icon: "nxUsers",
    tagline: "Livrez plus de projets clients, mieux présentés, avec moins d’outils.",
    h1: ["Plus de projets livrés,", "moins d’outils à gérer."],
    lead: "Chaque client attend un site qui fonctionne partout, souvent une application, et une présentation soignée. NEXORA regroupe le développement, les tests, les applications Android et Windows, les visuels et la surveillance, pour livrer plus vite et proposer des services en plus.",
    quote: "Mes clients me demandent une application mobile, et je dois refuser ou sous-traiter.",
    shifts: [
      { before: "Une demande d’application mobile refusée ou sous-traitée.", after: "Le site du client devient une application Android signée, avec notifications push et fiche Play Store." },
      { before: "Des captures d’écran envoyées par e-mail pour validation.", after: "Des maquettes réalistes et des vidéos 3D, validées par lien, sans compte pour votre client." },
      { before: "Les projets de plusieurs clients mélangés sur la même machine.", after: "Chaque projet isolé : cookies, stockage, cache et environnement séparés." },
      { before: "La panne du site d’un client apprise par le client lui-même.", after: "Supervision 24 h/24, alertes et note de fiabilité par projet." },
    ],
    steps: [
      { space: "preview", title: "Recettez sur tous les écrans", text: "Planches d’appareils à rouvrir à chaque correction, photos et vidéos HD pour le client." },
      { space: "android", title: "Vendez l’application", text: "Le site du client devient une application Android, publiée sur le Play Store." },
      { space: "studio", title: "Faites valider", text: "Vidéos 3D commentées à la seconde près par votre client, sans compte." },
      { space: "security", title: "Assurez le suivi", text: "Supervision, alertes et page de statut pour chaque site livré." },
    ],
  },
  {
    slug: "commercants",
    name: "Commerçants",
    short: "Commerçants",
    icon: "cart",
    tagline: "Votre boutique dans la poche de vos clients, sans développeur.",
    h1: ["Votre boutique,", "dans la poche de vos clients."],
    lead: "Vous avez déjà un site ou une boutique en ligne. NEXORA en fait une application que vos clients installent sur leur téléphone, avec votre logo et des notifications pour vos promotions, et vérifie que votre site reste en ligne. Aucune ligne de code à écrire.",
    quote: "Je voudrais prévenir mes clients de mes promotions sans dépendre des réseaux sociaux.",
    shifts: [
      { before: "Des clients qui oublient votre site.", after: "Une application avec votre logo sur l’écran d’accueil de leur téléphone." },
      { before: "Des promotions noyées dans les réseaux sociaux.", after: "Des notifications push envoyées directement à vos clients, même application fermée." },
      { before: "Une application jugée hors de portée, faute de développeur.", after: "Donnez l’adresse de votre site : l’application est construite, signée et sa fiche Play Store préparée." },
      { before: "Un site en panne un samedi, sans que vous le sachiez.", after: "Votre site vérifié 24 h/24 par les serveurs NEXORA, avec une alerte par e-mail." },
    ],
    steps: [
      { space: "preview", title: "Voyez votre site comme vos clients", text: "Sur les téléphones qu’ils utilisent vraiment : iPhone, Galaxy, Tecno, Infinix, Xiaomi…" },
      { space: "android", title: "Créez votre application", text: "Logo, écran de démarrage, notifications et fiche Play Store, à partir de l’adresse de votre site." },
      { space: "studio", title: "Annoncez-la", text: "Une vidéo de votre application dans un téléphone 3D, au format de vos réseaux." },
      { space: "security", title: "Restez ouvert", text: "Votre site surveillé jour et nuit, avec une alerte dès qu’il ne répond plus." },
    ],
  },
]

export const personaBySlug = (slug: string) => PERSONAS.find((p) => p.slug === slug)
export const personaHref = (p: Persona) => `/pour-qui/${p.slug}`
/** Profils dont le parcours passe par cet espace. */
export const personasForSpace = (space: SpaceId) => PERSONAS.filter((p) => p.steps.some((s) => s.space === space))
