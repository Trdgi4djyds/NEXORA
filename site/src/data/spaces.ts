// Les 9 espaces de NEXORA présentés par le site : mêmes noms, icônes, sous-titres et ordre que le rail de
// l'application (renderer/dist/chunks/chunk-Y6Q6RT63.js). Les fonctions décrites sont celles livrées (voir SUIVI.md).
import { DEVICE_COUNT } from "../lib/product"
import { FALLBACK } from "../../../nexora/app/renderer/nx/offres/catalog.js"
import type { PlanId } from "../lib/remote"

export type SpaceId = "home" | "preview" | "browser" | "dev" | "android" | "studio" | "design" | "security" | "desktop"
export type Feature = { icon: string; title: string; text: string; plan?: Exclude<PlanId, "free"> }
export type Space = {
  id: SpaceId
  slug: string
  name: string
  rail: string
  icon: string
  /** Sous-titre affiché sous le nom de l'espace dans la barre d'outils de NEXORA. */
  subtitle: string
  card: string
  tagline: string
  h1: [string, string]
  lead: string
  plan: PlanId
  planNote: string
  features: Feature[]
  details?: { title: string; items: string[] }
  /** #072 : avec l'offre Gratuite, les fonctions sans offre ne sont ouvertes que pendant un essai (App Builder). */
  trial?: { tag: string; lead: string }
}

/** Sites surveillés par offre (catalogue des offres de NEXORA). */
const MONITORS = {
  free: (FALLBACK as Record<string, { limits: { monitors: number } }>).free.limits.monitors,
  standard: (FALLBACK as Record<string, { limits: { monitors: number } }>).standard.limits.monitors,
  pro: (FALLBACK as Record<string, { limits: { monitors: number } }>).pro.limits.monitors,
}

export const SPACES: Space[] = [
  {
    id: "home",
    slug: "accueil",
    name: "Accueil",
    rail: "Accueil",
    icon: "home",
    subtitle: "Tableau de bord de tes projets",
    card: "Un projet relie tout",
    tagline:
      "Un projet réunit ton site ou ton code, ses applications, ses visuels et sa surveillance. Ouvre-le : tous les espaces s’y alignent.",
    h1: ["Tous tes projets,", "au même endroit."],
    lead: "L’Accueil est ton tableau de bord. Un projet réunit ton site ou ton code, ses applications, ses visuels et sa surveillance : ouvre-le, et chaque espace de NEXORA s’aligne dessus.",
    plan: "free",
    planNote: "Inclus dans toutes les offres",
    features: [
      { icon: "folder", title: "Des projets qui relient tout", text: "Site, dossier de code, applications, scènes 3D, documents et sites surveillés restent ensemble, projet par projet." },
      { icon: "target", title: "Par quoi commencer ?", text: "Choisis un objectif (app Android, logiciel Windows, test sur tous les écrans…) et NEXORA ouvre le bon espace." },
      { icon: "search", title: "Aller partout avec Ctrl K", text: "Une seule recherche pour ouvrir une section, une fenêtre ou un projet." },
      { icon: "plus", title: "Créer sans rien écraser", text: "Ctrl N crée une planche, un projet, une application ou une scène sous un nom libre : l’existant reste intact." },
      { icon: "cloud", title: "Compte et synchronisation", text: "Connecte-toi pour retrouver tes réglages et tes projets sur tes appareils et dans NEXORA web." },
      { icon: "appearance", title: "Une interface à ton goût", text: "Thème clair ou sombre, couleur d’accent, polices, fonds et taille de l’interface." },
    ],
    details: {
      title: "Les raccourcis à connaître",
      items: ["Ctrl K : aller à…", "Ctrl N : nouveau", "Ctrl Maj A : assistant IA", "F5 : rafraîchir l’espace", "Ctrl B : panneau de gauche", "Ctrl I : inspecteur"],
    },
  },
  {
    id: "preview",
    slug: "responsive",
    name: "Responsive Lab",
    rail: "Responsive",
    icon: "multi",
    // #072 : les appareils sont des cadres de modèles réels, pas des appareils physiques (« vrais appareils » retiré).
    subtitle: "Ton site sur tous les écrans",
    card: "Ton site sur tous les écrans",
    tagline: `${DEVICE_COUNT} modèles d’appareils côte à côte : téléphones, pliables, tablettes, ordinateurs, téléviseurs, montres et même voitures.`,
    h1: ["Colle un lien,", "obtiens la maquette."],
    lead: "Affiche un site ou un projet dans le cadre d’un iPhone, d’un Samsung, d’un pliable, d’un ordinateur ou d’un téléviseur. Compare plusieurs appareils côte à côte et exporte des photos et des vidéos HD.",
    plan: "free",
    planNote: "Inclus dans toutes les offres",
    features: [
      { icon: "phone", title: `${DEVICE_COUNT} modèles d’appareils`, text: "iPhone, Galaxy, Pixel, Xiaomi, Tecno, Infinix, pliables, tablettes, PC, téléviseurs, montres, casques, consoles, voitures et bornes." },
      { icon: "frame", title: "Des cadres fidèles", text: "Cadres officiels d’Android Studio pour les Pixel, les montres Wear OS, les téléviseurs et les voitures ; les autres dessinés aux mesures de chaque modèle : écran, densité, coins arrondis, encoche." },
      { icon: "fold", title: "Pliables et rotation", text: "Ouvre ou ferme un pliable, passe en paysage et compare les états." },
      { icon: "multi", title: "Côte à côte, sur des planches", text: "Compare plusieurs appareils sur une même planche, puis retrouve tes planches plus tard." },
      { icon: "folderOpen", title: "Tes projets locaux aussi", text: "Ouvre un dossier : le framework est détecté et les dépendances sont installées automatiquement." },
      { icon: "camera", title: "Photos et vidéos HD", text: "Exporte ton site dans ses appareils pour tes présentations et tes réseaux sociaux." },
      { icon: "layers", title: "Chaque projet isolé", text: "Cookies, stockage et cache séparés par projet : deux sites ne se mélangent jamais." },
      { icon: "cube", title: "Prêt pour la 3D", text: "Envoie tes appareils dans le Studio 3D & Motion pour les animer." },
      { icon: "bolt", title: "Responsive avancé", text: "Des outils de test responsive supplémentaires pour aller plus loin.", plan: "standard" },
    ],
  },
  {
    id: "browser",
    slug: "browser",
    name: "Browser Lab",
    rail: "Browser",
    icon: "globe",
    subtitle: "Analyse, réseau, audit et tests",
    card: "Inspecte, mesure et audite",
    tagline: "Éléments, réseau, console, tests enregistrés, extraction de site et audits, dans une interface claire.",
    h1: ["Inspecte, mesure,", "audite."],
    lead: "Le Browser Lab ouvre n’importe quel site avec les outils d’un développeur : éléments, réseau, console, tests et audits, présentés simplement.",
    plan: "free",
    planNote: "Navigation et inspection incluses dans toutes les offres",
    features: [
      { icon: "inspector", title: "Éléments", text: "Survole la page pour inspecter chaque bloc, ses balises et ses styles." },
      { icon: "sync", title: "Réseau", text: "Chaque requête avec son type, sa taille et son temps, en cascade." },
      { icon: "terminal", title: "Console", text: "Les messages et les erreurs de la page, en direct." },
      { icon: "audit", title: "Audits", text: "Performance, accessibilité, référencement, responsive et bonnes pratiques, avec un rapport.", plan: "standard" },
      { icon: "record", title: "Tests enregistrés", text: "Enregistre tes actions, rejoue-les et explore le site à chaque taille d’écran.", plan: "standard" },
      { icon: "download", title: "Extraction de site", text: "Aspire un site, enregistre son code source et ouvre-le dans le Dev Lab.", plan: "standard" },
      { icon: "eye", title: "Aperçu dans les résultats", text: "Vérifie comment ta page apparaît dans les moteurs de recherche et sur les réseaux.", plan: "standard" },
    ],
    details: { title: "Les catégories de l’audit", items: ["Performance", "Accessibilité", "Référencement", "Responsive", "Bonnes pratiques", "Code inutilisé au chargement"] },
  },
  {
    id: "dev",
    slug: "dev",
    name: "Dev Lab",
    rail: "Dev",
    icon: "code",
    subtitle: "Code, terminal, Git et aperçu",
    card: "Code, lance et versionne",
    tagline: "Éditeur, terminal, Git, dépôt distant et aperçu en direct. Le Dev Lab de base est gratuit.",
    h1: ["Écris, lance", "et publie ton code."],
    lead: "Un éditeur complet, un terminal, Git et l’aperçu en direct de ton projet, avec les outils installés pour toi. Le Dev Lab de base est inclus dans l’offre Gratuite.",
    plan: "free",
    planNote: "Dev Lab de base gratuit ; outils avancés dans Standard et Pro",
    features: [
      { icon: "code", title: "Éditeur complet", text: "Coloration, autocomplétion, recherche dans le projet et Ctrl P pour ouvrir n’importe quel fichier." },
      { icon: "terminal", title: "Terminal intégré", text: "Plusieurs terminaux, dans l’environnement de ton projet." },
      { icon: "refreshCw", title: "Git et GitHub", text: "Enregistre, envoie et clone un dépôt ; ouvre aussi ton projet dans VS Code." },
      { icon: "eye", title: "Aperçu en direct", text: "Lance le projet : chaque enregistrement met l’aperçu à jour." },
      { icon: "wrench", title: "15 outils installés pour toi", text: "Node.js, Python, PHP, Go, Flutter, Git… depuis leurs sources officielles, sans droits d’administrateur." },
      { icon: "file", title: "15 modèles de projet", text: "HTML, React, Vue, Svelte, Next.js, Astro, PWA, Expo, Flutter, PHP et plus encore." },
      { icon: "warn", title: "Problèmes, scripts et tests", text: "Les erreurs de tout le projet, tes scripts en un clic, tes tests avec la couverture.", plan: "standard" },
      { icon: "key", title: "Variables protégées", text: "Chiffrées par Windows, avec import et export de fichiers .env.", plan: "standard" },
      { icon: "link", title: "Client d’API et Git avancé", text: "Collections et import OpenAPI ; branches, fusion avec conflits côte à côte, graphe.", plan: "standard" },
      { icon: "sparkle", title: "Assistant IA du projet", text: "Des changements sur tout le projet, acceptés fichier par fichier et annulables.", plan: "pro" },
      { icon: "target", title: "Débogueur", text: "Points d’arrêt avec F9, pas à pas, pile d’appels et variables.", plan: "pro" },
      { icon: "rocket", title: "Mise en ligne et contrôles", text: "Publie chez les principaux hébergeurs, avec aperçu par branche et contrôles sur trois appareils.", plan: "pro" },
    ],
    details: {
      title: "Les modèles de projet",
      items: [
        "Site HTML, CSS et JavaScript",
        "React",
        "React + TypeScript",
        "Vue",
        "Svelte",
        "Next.js",
        "Astro",
        "Application web installable (PWA)",
        "Page de présentation",
        "Site PHP",
        "Serveur Node.js",
        "JavaScript",
        "TypeScript",
        "Application mobile (Expo)",
        "Application Flutter",
      ],
    },
  },
  {
    id: "android",
    slug: "apps",
    name: "App Builder",
    rail: "Apps",
    icon: "android",
    // #072 : NEXORA construit des applications Android ; l'iPhone n'est qu'un aperçu (« et iPhone » retiré).
    subtitle: "Application Android, aperçu iPhone",
    card: "Ton site devient une app",
    tagline: "Application Android signée, PWA, notifications push, fiche Play Store et publication.",
    h1: ["Ton site devient", "une app Android."],
    lead: "Donne l’adresse de ton site : NEXORA construit l’application avec son icône, son écran de démarrage et ses notifications, prépare la fiche Play Store et vérifie que tout est prêt avant la publication.",
    plan: "free",
    planNote: "2 applications en essai de 7 jours avec l’offre Gratuite",
    trial: { tag: "Essai 7 jours", lead: "Pendant l’essai de 7 jours (2 applications) :" },
    features: [
      { icon: "android", title: "APK et AAB signés", text: "Une vraie application Android qui affiche ton site, signée avec ta clé.", plan: "standard" },
      { icon: "phone", title: "Aperçu fidèle", text: "L’écran d’accueil et l’application simulés sur iPhone, Pixel, Galaxy et les autres surcouches." },
      { icon: "bell", title: "Notifications push", text: "Envoie des notifications à tes utilisateurs, et des messages dans l’application.", plan: "standard" },
      { icon: "image", title: "Fiche Play Store", text: "Textes par langue rédigés avec l’IA, captures habillées, icône, bannière et politique de confidentialité." },
      { icon: "nxCheckCircle", title: "Prêt pour le Play Store", text: "Un score et chaque point à corriger, relié à sa section, avant d’envoyer." },
      { icon: "group", title: "Tests fermés", text: "12 testeurs pendant 14 jours : invitations, suivi et réponses pour l’accès à la production." },
      { icon: "upload", title: "Publication et PWA", text: "Envoi direct sur le Play Store, déploiement progressif, et paquet d’application web installable.", plan: "standard" },
      { icon: "sync", title: "Réglages à distance", text: "Propose ou impose la nouvelle version aux anciennes installations." },
      { icon: "nxChart", title: "Statistiques et plantages", text: "Installations actives, ouvertures, taux sans plantage et erreurs expliquées par l’IA.", plan: "pro" },
    ],
    details: {
      title: "Vérifié avant la publication",
      items: ["L’application", "Les exigences d’Android", "La signature", "Le fichier AAB", "La fiche Play Store", "Les règles de Google Play", "L’accès à la Play Console", "Le test fermé", "Le numéro de version"],
    },
  },
  {
    id: "studio",
    slug: "studio",
    name: "Studio 3D & Motion",
    rail: "Studio",
    icon: "cube",
    subtitle: "Scènes 3D, maquettes, présentations",
    card: "Présente en 3D et en vidéo",
    tagline: "Mises en scène d’appareils, mouvements de caméra, rendus et vidéos aux formats des réseaux sociaux.",
    h1: ["Mets ton app", "en scène."],
    lead: "Place ton site ou ton app dans des appareils 3D éclairés comme en studio photo, anime la caméra, puis exporte des images et des vidéos prêtes pour tes réseaux, tes stores et tes clients.",
    plan: "free",
    planNote: "Studio de base inclus ; cartes avancées dans Pro",
    features: [
      { icon: "cube", title: "Appareils 3D réalistes", text: "Téléphones, pliables, tablettes et ordinateurs éclairés comme une photo produit." },
      { icon: "video", title: "Mouvements de caméra", text: "Orbite, spirale, plongée, effet vertigo et clés d’animation sur une frise." },
      { icon: "nxBeat", title: "Transitions et rythme", text: "Fondus, iris, volets, et clés calées sur le tempo de ta musique." },
      { icon: "nxAperture", title: "Rendu avancé", text: "Réaliste, argile, dessin animé ou fil de fer ; éclairages, profondeur de champ et ambiances." },
      { icon: "download", title: "Exports", text: "Vidéo, GIF animé, WebM à fond transparent et page web 3D ; Lottie et réalité augmentée avec Pro." },
      { icon: "sparkle", title: "Mise en scène par l’IA", text: "Décris ce que tu veux : l’IA compose la scène et le mouvement de caméra.", plan: "pro" },
      { icon: "film", title: "Formats des réseaux sociaux", text: "9:16, 1:1, 16:9 et plus, avec les zones de sécurité de chaque plateforme.", plan: "pro" },
      { icon: "upload", title: "Imports 3D", text: "Modèles OBJ, STL et PLY, et nuages de points SPLAT.", plan: "pro" },
      { icon: "chat", title: "Validation client", text: "Envoie la vidéo par un lien : ton client commente à la seconde près, sans créer de compte.", plan: "pro" },
    ],
    details: {
      title: "Des mises en scène toutes prêtes",
      items: ["Deux téléphones côte à côte", "Trois appareils en présentoir", "Pliable qui s’ouvre", "Ordinateur et téléphone", "Téléphone en vedette", "Posés à plat, vue de dessus"],
    },
  },
  {
    id: "design",
    slug: "design",
    name: "NEX-DESIGN",
    rail: "Design",
    icon: "palette",
    subtitle: "Design 2D, illustration, retouche et calques 3D",
    card: "Crée tes visuels",
    tagline: "Maquettes, variables, prototypes, export de code, retouche d’image et impression.",
    h1: ["Dessine, prototype,", "exporte le code."],
    lead: "Conçois tes écrans, tes visuels et tes documents d’impression : mise en page automatique, composants, prototype cliquable et code prêt pour ton projet.",
    plan: "free",
    planNote: "3 documents avec l’offre Gratuite",
    features: [
      { icon: "grid", title: "Mise en page automatique", text: "Des blocs qui s’adaptent à leur contenu, avec espacements et alignements." },
      { icon: "nxAccess", title: "Accessibilité et mesures", text: "Contraste vérifié et distances affichées en maintenant Alt." },
      { icon: "nxComponent", title: "Variables et variantes", text: "Couleurs, tailles et modes ; variantes de composants réutilisables.", plan: "standard" },
      { icon: "nxInteract", title: "Prototype et tailles d’écran", text: "Actions au clic, page HTML de démonstration et déclinaisons téléphone, tablette et ordinateur.", plan: "standard" },
      { icon: "code", title: "Export de code", text: "HTML et CSS, ou React et Tailwind ; envoi direct dans le Dev Lab avec Pro.", plan: "standard" },
      { icon: "pdf", title: "Impression vectorielle", text: "PDF avec fonds perdus, textes sélectionnables et polices intégrées.", plan: "standard" },
      { icon: "nxTable", title: "Série depuis un CSV", text: "Un modèle, des dizaines de visuels remplis automatiquement.", plan: "standard" },
      { icon: "sparkle", title: "IA de design", text: "Une maquette à partir d’une description, des variantes et la retouche intelligente.", plan: "pro" },
      { icon: "nxUsers", title: "Équipe et validation", text: "Bibliothèques d’équipe tenues à jour et liens de validation pour tes clients.", plan: "pro" },
    ],
    details: {
      title: "Les fonctions de design",
      items: ["Variables", "Prototype", "Code", "Accessibilité", "Polices", "Série", "Impression", "Importer", "IA", "Icônes et espaces", "Versions", "Validation", "Équipe"],
    },
  },
  {
    id: "security",
    slug: "securite",
    name: "Sécurité",
    rail: "Sécurité",
    icon: "shield",
    subtitle: "Audit, supervision et alertes",
    card: "Sécurise et surveille",
    tagline: "Audits du site, du domaine et du code, supervision 24 h/24, alertes et page de statut publique.",
    h1: ["Sécurise ton site,", "surveille-le 24 h/24."],
    lead: "Une note de fiabilité par projet, des audits qui disent quoi corriger, et une supervision qui continue même quand NEXORA est fermée.",
    plan: "free",
    planNote: "Audit du site et du domaine inclus dans toutes les offres",
    features: [
      { icon: "shield", title: "Note de fiabilité", text: "Sécurité, domaine et e-mail, code, disponibilité et rapidité réunis en une note, avec les tâches de la semaine." },
      { icon: "audit", title: "Audit du site", text: "En-têtes de sécurité, certificat et configuration, comparés à l’audit précédent." },
      { icon: "mail", title: "Domaine et e-mail", text: "SPF, DKIM, DMARC, DNSSEC, expiration du domaine et sous-domaines." },
      // #072 : les parcours rejoués tournent sur le PC (NEXORA ouvert) et demandent Pro : sortis de la supervision serveur.
      {
        icon: "nxiPulse",
        title: "Supervision 24 h/24",
        text: `Site, API, port, DNS, domaine et signal de vie, vérifiés par les serveurs NEXORA même quand l’application est fermée : ${MONITORS.free} site avec l’offre Gratuite, ${MONITORS.standard} avec Standard, ${MONITORS.pro} avec Pro.`,
      },
      { icon: "code", title: "Code et correctifs", text: "Dépendances vulnérables, secrets oubliés, audits programmés et correctifs écrits pour ton hébergeur.", plan: "standard" },
      { icon: "bell", title: "Alertes", text: "Par e-mail et vers tes outils d’équipe, avec escalade, regroupement et heures calmes.", plan: "standard" },
      { icon: "globe", title: "Page de statut publique", text: "Tes visiteurs suivent l’état de ton service et s’abonnent aux incidents.", plan: "standard" },
      { icon: "group", title: "Visiteurs réels", text: "Les temps de chargement mesurés chez tes vrais visiteurs.", plan: "pro" },
      { icon: "nxWorld", title: "Seconde région", text: "Chaque panne confirmée depuis un deuxième point du globe.", plan: "pro" },
      { icon: "record", title: "Parcours rejoués", text: "Un parcours enregistré (connexion, commande…) rejoué à intervalle régulier par NEXORA ouvert sur ton PC.", plan: "pro" },
    ],
    details: {
      title: "Six vérifications par les serveurs NEXORA",
      items: ["Site", "API avec contrôle de la réponse", "Port TCP", "DNS", "Domaine", "Signal de vie"],
    },
  },
  {
    id: "desktop",
    slug: "desktop",
    name: "Desktop Builder",
    rail: "Desktop",
    icon: "display",
    subtitle: "Logiciels de bureau installables",
    card: "Un vrai logiciel Windows",
    tagline: "Installateur, version portable, MSI, mises à jour automatiques, Microsoft Store et winget.",
    h1: ["Ton site devient", "un logiciel Windows."],
    lead: "Un site, un dossier de site ou un projet de bureau devient un logiciel installable : installateur, version portable, signature, mises à jour automatiques et distribution, avec un aperçu sur un vrai PC Windows 11.",
    plan: "standard",
    planNote: "Inclus dans Standard et Pro",
    features: [
      { icon: "download", title: "Installateur et portable", text: "Installateur, version portable, ZIP et MSI, pour x64 et ARM64." },
      { icon: "display", title: "Aperçu sur Windows 11", text: "Ta fenêtre, l’installateur, le menu Démarrer et la barre des tâches, avant même de construire." },
      { icon: "sync", title: "Mises à jour automatiques", text: "Déploiement progressif, canal bêta et mise à jour obligatoire quand il le faut." },
      { icon: "key", title: "Signature", text: "Par certificat ou par la signature de Microsoft dans le cloud, pour rassurer Windows." },
      { icon: "nxBox", title: "Microsoft Store et winget", text: "Paquet MSIX pour le Store et fiches winget prêtes à proposer." },
      { icon: "shield", title: "Bac à sable Windows", text: "Essaie ton installateur dans un Windows vierge, sans toucher à ton PC." },
      { icon: "bell", title: "Intégré à Windows", text: "Zone de notification, lancement au démarrage, pastille, actions au clic droit, raccourci global et types de fichiers." },
      { icon: "nxChart", title: "Statistiques et plantages", text: "Lancements, installations actives, versions de Windows et plantages." },
      { icon: "globe", title: "Hors connexion", text: "Une page soignée quand Internet manque, et les liens externes ouverts dans le navigateur." },
    ],
    details: {
      title: "Ce que le Desktop Builder produit",
      items: ["Installateur (.exe)", "Version portable", "Archive ZIP", "Paquet MSI", "Paquet MSIX pour le Microsoft Store", "Fiches winget", "Fichier pour le Bac à sable Windows"],
    },
  },
]

export const SPACE_BY_ID = Object.fromEntries(SPACES.map((s) => [s.id, s])) as Record<SpaceId, Space>
export const spaceBySlug = (slug: string) => SPACES.find((s) => s.slug === slug)
export const spaceHref = (s: Space) => `#/espaces/${s.slug}`
export const PLAN_LABEL: Record<PlanId, string> = { free: "Gratuit", standard: "Standard", pro: "Pro" }
