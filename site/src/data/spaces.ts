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
  /** #087 : limites propres à l'espace, offre par offre (App Builder et Desktop Builder : 2 applications gratuites). */
  limits?: { free: string; pro: string; perks: string[] }
}

/** Sites surveillés par offre (catalogue des offres de NEXORA). */
const MONITORS = {
  free: (FALLBACK as Record<string, { limits: { monitors: number } }>).free.limits.monitors,
  pro: (FALLBACK as Record<string, { limits: { monitors: number } }>).pro.limits.monitors,
}

/** #087 : applications de l'offre Gratuite et de Pro, App Builder et Desktop Builder confondus (catalogue des offres). */
const APP_FB = FALLBACK as Record<string, { limits: Record<string, number> }>
const APP_LIMITS = {
  free: `${APP_FB.free.limits.apps} applications au total, App Builder et Desktop Builder confondus, applications supprimées comprises ; ${APP_FB.free.limits.builds_per_app_month} constructions par application et par mois.`,
  pro: `Jusqu’à ${APP_FB.pro.limits.apps} applications, sans limite de constructions par application.`,
  perks: [
    `Jusqu’à ${APP_FB.pro.limits.apps} applications Android ou Windows`,
    `Constructions sans limite par application (${APP_FB.pro.limits.builds_month} par mois au total)`,
    "Dev Lab complet pour modifier le code de vos applications",
    "Studio 3D et NEX-DESIGN complets pour vos visuels et vos fiches",
    "Assistance prioritaire",
  ],
}

export const SPACES: Space[] = [
  {
    id: "home",
    slug: "accueil",
    name: "Accueil",
    rail: "Accueil",
    icon: "home",
    subtitle: "Tableau de bord de vos projets",
    card: "Un projet relie tout",
    tagline:
      "Un projet réunit votre site ou votre code, ses applications, ses visuels et sa surveillance. Ouvrez-le : tous les espaces s’y alignent.",
    h1: ["Tous vos projets,", "au même endroit."],
    lead: "L’Accueil est votre tableau de bord. Un projet réunit votre site ou votre code, ses applications, ses visuels et sa surveillance : ouvrez-le, et chaque espace de NEXORA s’aligne dessus.",
    plan: "free",
    planNote: "Inclus dans toutes les offres",
    features: [
      { icon: "folder", title: "Des projets qui relient tout", text: "Site, dossier de code, applications, scènes 3D, documents et sites surveillés restent ensemble, projet par projet." },
      { icon: "target", title: "Par quoi commencer ?", text: "Choisissez un objectif (app Android, logiciel Windows, test sur tous les écrans…) et NEXORA ouvre le bon espace." },
      { icon: "search", title: "Aller partout avec Ctrl K", text: "Une seule recherche pour ouvrir une section, une fenêtre ou un projet." },
      { icon: "plus", title: "Créer sans rien écraser", text: "Ctrl N crée une planche, un projet, une application ou une scène sous un nom libre : l’existant reste intact." },
      { icon: "cloud", title: "Compte et synchronisation", text: "Connectez-vous pour retrouver vos réglages et vos projets sur vos appareils et dans NEXORA web." },
      { icon: "appearance", title: "Une interface à votre goût", text: "Thème clair ou sombre, couleur d’accent, polices, fonds et taille de l’interface." },
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
    subtitle: "Votre site sur tous les écrans",
    card: "Votre site sur tous les écrans",
    tagline: `${DEVICE_COUNT} modèles d’appareils côte à côte : téléphones, pliables, tablettes, ordinateurs, téléviseurs, montres et même voitures.`,
    h1: ["Collez un lien,", "obtenez la maquette."],
    lead: "Affichez un site ou un projet dans le cadre d’un iPhone, d’un Samsung, d’un pliable, d’un ordinateur ou d’un téléviseur. Comparez plusieurs appareils côte à côte et exportez des photos et des vidéos HD.",
    plan: "free",
    planNote: "Entièrement gratuit, sans limite de durée",
    features: [
      { icon: "phone", title: `${DEVICE_COUNT} modèles d’appareils`, text: "iPhone, Galaxy, Pixel, Xiaomi, Tecno, Infinix, pliables, tablettes, PC, téléviseurs, montres, casques, consoles, voitures et bornes." },
      { icon: "frame", title: "Des cadres fidèles", text: "Cadres officiels d’Android Studio pour les Pixel, les montres Wear OS, les téléviseurs et les voitures ; les autres dessinés aux mesures de chaque modèle : écran, densité, coins arrondis, encoche." },
      { icon: "fold", title: "Pliables et rotation", text: "Ouvrez ou fermez un pliable, passez en paysage et comparez les états." },
      { icon: "multi", title: "Côte à côte, sur des planches", text: "Comparez plusieurs appareils sur une même planche, puis retrouvez vos planches plus tard." },
      { icon: "folderOpen", title: "Vos projets locaux aussi", text: "Ouvrez un dossier : le framework est détecté et les dépendances sont installées automatiquement." },
      { icon: "camera", title: "Photos et vidéos HD", text: "Exportez votre site dans ses appareils pour vos présentations et vos réseaux sociaux." },
      { icon: "layers", title: "Chaque projet isolé", text: "Cookies, stockage et cache séparés par projet : deux sites ne se mélangent jamais." },
      { icon: "cube", title: "Prêt pour la 3D", text: "Envoyez vos appareils dans le Studio 3D & Motion pour les animer." },
      { icon: "bolt", title: "Responsive avancé", text: "Des outils de test responsive supplémentaires pour aller plus loin." },
    ],
  },
  {
    id: "browser",
    slug: "browser",
    name: "Browser Lab",
    rail: "Browser",
    icon: "globe",
    subtitle: "Analyse, réseau, audit et tests",
    card: "Inspectez, mesurez et auditez",
    tagline: "Éléments, réseau, console, tests enregistrés, extraction de site et audits, dans une interface claire.",
    h1: ["Inspecte, mesure,", "audite."],
    lead: "Le Browser Lab ouvre n’importe quel site avec les outils d’un développeur : éléments, réseau, console, tests et audits, présentés simplement.",
    plan: "free",
    planNote: "Entièrement gratuit, sans limite de durée",
    features: [
      { icon: "inspector", title: "Éléments", text: "Survolez la page pour inspecter chaque bloc, ses balises et ses styles." },
      { icon: "sync", title: "Réseau", text: "Chaque requête avec son type, sa taille et son temps, en cascade." },
      { icon: "terminal", title: "Console", text: "Les messages et les erreurs de la page, en direct." },
      { icon: "audit", title: "Audits", text: "Performance, accessibilité, référencement, responsive et bonnes pratiques, avec un rapport." },
      { icon: "record", title: "Tests enregistrés", text: "Enregistrez vos actions, rejouez-les et explorez le site à chaque taille d’écran." },
      { icon: "download", title: "Extraction de site", text: "Aspirez un site, enregistrez son code source et ouvrez-le dans le Dev Lab." },
      { icon: "eye", title: "Aperçu dans les résultats", text: "Vérifiez comment votre page apparaît dans les moteurs de recherche et sur les réseaux." },
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
    tagline: "Éditeur, terminal, Git, dépôt distant et aperçu en direct, dans l’offre Pro.",
    h1: ["Écrivez, lancez", "et publie votre code."],
    lead: "Un éditeur complet, un terminal, Git et l’aperçu en direct de votre projet, avec les outils installés pour vous. Le Dev Lab fait partie de l’offre Pro, ouverte à tous pendant le premier jour.",
    plan: "pro",
    planNote: "Inclus dans Pro ; ouvert pendant votre essai de 24 h",
    features: [
      { icon: "code", title: "Éditeur complet", text: "Coloration, autocomplétion, recherche dans le projet et Ctrl P pour ouvrir n’importe quel fichier." },
      { icon: "terminal", title: "Terminal intégré", text: "Plusieurs terminaux, dans l’environnement de votre projet." },
      { icon: "refreshCw", title: "Git et GitHub", text: "Enregistrez, envoyez et clonez un dépôt ; ouvrez aussi votre projet dans un éditeur de code complet." },
      { icon: "eye", title: "Aperçu en direct", text: "Lancez le projet : chaque enregistrement met l’aperçu à jour." },
      { icon: "wrench", title: "15 outils installés pour vous", text: "Node.js, Python, PHP, Go, Flutter, Git… depuis leurs sources officielles, sans droits d’administrateur." },
      { icon: "file", title: "15 modèles de projet", text: "HTML, React, Vue, Svelte, Next.js, Astro, PWA, Expo, Flutter, PHP et plus encore." },
      { icon: "warn", title: "Problèmes, scripts et tests", text: "Les erreurs de tout le projet, vos scripts en un clic, vos tests avec la couverture.", plan: "pro" },
      { icon: "key", title: "Variables protégées", text: "Chiffrées par Windows, avec import et export de fichiers .env.", plan: "pro" },
      { icon: "link", title: "Client d’API et Git avancé", text: "Collections et import OpenAPI ; branches, fusion avec conflits côte à côte, graphe.", plan: "pro" },
      { icon: "sparkle", title: "Assistant IA du projet", text: "Des changements sur tout le projet, acceptés fichier par fichier et annulables.", plan: "pro" },
      { icon: "target", title: "Débogueur", text: "Points d’arrêt avec F9, pas à pas, pile d’appels et variables.", plan: "pro" },
      { icon: "rocket", title: "Mise en ligne et contrôles", text: "Publiez chez les principaux hébergeurs, avec aperçu par branche et contrôles sur trois appareils.", plan: "pro" },
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
    card: "Votre site devient une app",
    tagline: "Application Android signée, PWA, notifications push, fiche Play Store et publication.",
    h1: ["Votre site devient", "une app Android."],
    lead: "Donnez l’adresse de votre site : NEXORA construit l’application avec son icône, son écran de démarrage et ses notifications, prépare la fiche Play Store et vérifie que tout est prêt avant la publication.",
    // #087 : tout l'App Builder avec l'offre Gratuite, pour 2 applications au total (avec le Desktop Builder).
    plan: "free",
    planNote: "2 applications gratuites, Android ou Windows ; 5 constructions par application et par mois",
    limits: APP_LIMITS,
    features: [
      { icon: "android", title: "APK et AAB signés", text: "Une vraie application Android qui affiche votre site, signée avec votre clé." },
      { icon: "phone", title: "Aperçu fidèle", text: "L’écran d’accueil et l’application simulés sur iPhone, Pixel, Galaxy et les autres surcouches." },
      { icon: "bell", title: "Notifications push", text: "Envoyez des notifications à vos utilisateurs, même application fermée, rangées par catégorie ; votre page reçoit aussi les messages." },
      // #073 : messagerie des applications (Push.java, section « Messagerie et appels » de l'App Builder).
      { icon: "phone", title: "Messagerie et appels", text: "Pour une app comme WhatsApp : conversations empilées, réponse depuis la notification, appels entrants en plein écran et jeton relié au compte." },
      { icon: "image", title: "Fiche Play Store", text: "Textes par langue rédigés avec l’IA, captures habillées, icône, bannière et politique de confidentialité." },
      { icon: "nxCheckCircle", title: "Prêt pour le Play Store", text: "Un score et chaque point à corriger, relié à sa section, avant d’envoyer." },
      { icon: "group", title: "Tests fermés", text: "12 testeurs pendant 14 jours : invitations, suivi et réponses pour l’accès à la production." },
      { icon: "upload", title: "Publication et PWA", text: "Envoi direct sur le Play Store, déploiement progressif, et paquet d’application web installable." },
      { icon: "sync", title: "Réglages à distance", text: "Proposez ou imposez la nouvelle version aux anciennes installations." },
      { icon: "nxChart", title: "Statistiques et plantages", text: "Installations actives, ouvertures, taux sans plantage et erreurs expliquées par l’IA." },
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
    h1: ["Mettez votre app", "en scène."],
    lead: "Placez votre site ou votre app dans des appareils 3D éclairés comme en studio photo, animez la caméra, puis exportez des images et des vidéos prêtes pour vos réseaux, vos stores et vos clients.",
    plan: "free",
    planNote: "Studio de base inclus ; cartes avancées dans Pro",
    features: [
      { icon: "cube", title: "Appareils 3D réalistes", text: "Téléphones, pliables, tablettes et ordinateurs éclairés comme une photo produit." },
      { icon: "video", title: "Mouvements de caméra", text: "Orbite, spirale, plongée, effet vertigo et clés d’animation sur une frise." },
      { icon: "nxBeat", title: "Transitions et rythme", text: "Fondus, iris, volets, et clés calées sur le tempo de votre musique." },
      { icon: "nxAperture", title: "Rendu avancé", text: "Réaliste, argile, dessin animé ou fil de fer ; éclairages, profondeur de champ et ambiances." },
      { icon: "download", title: "Exports", text: "Vidéo, GIF animé, WebM à fond transparent et page web 3D ; Lottie et réalité augmentée avec Pro." },
      { icon: "sparkle", title: "Mise en scène par l’IA", text: "Décrivez ce que vous voulez : l’IA compose la scène et le mouvement de caméra.", plan: "pro" },
      { icon: "film", title: "Formats des réseaux sociaux", text: "9:16, 1:1, 16:9 et plus, avec les zones de sécurité de chaque plateforme.", plan: "pro" },
      { icon: "upload", title: "Imports 3D", text: "Modèles OBJ, STL et PLY, et nuages de points SPLAT.", plan: "pro" },
      { icon: "chat", title: "Validation client", text: "Envoyez la vidéo par un lien : votre client commente à la seconde près, sans créer de compte.", plan: "pro" },
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
    card: "Créez vos visuels",
    tagline: "Maquettes, variables, prototypes, export de code, retouche d’image et impression.",
    h1: ["Dessine, prototype,", "exportez le code."],
    lead: "Concevez vos écrans, vos visuels et vos documents d’impression : mise en page automatique, composants, prototype cliquable et code prêt pour votre projet.",
    plan: "free",
    planNote: "3 documents avec l’offre Gratuite",
    features: [
      { icon: "grid", title: "Mise en page automatique", text: "Des blocs qui s’adaptent à leur contenu, avec espacements et alignements." },
      { icon: "nxAccess", title: "Accessibilité et mesures", text: "Contraste vérifié et distances affichées en maintenant Alt." },
      { icon: "nxComponent", title: "Variables et variantes", text: "Couleurs, tailles et modes ; variantes de composants réutilisables.", plan: "pro" },
      { icon: "nxInteract", title: "Prototype et tailles d’écran", text: "Actions au clic, page HTML de démonstration et déclinaisons téléphone, tablette et ordinateur.", plan: "pro" },
      { icon: "code", title: "Export de code", text: "HTML et CSS, ou React et Tailwind ; envoi direct dans le Dev Lab avec Pro.", plan: "pro" },
      { icon: "pdf", title: "Impression vectorielle", text: "PDF avec fonds perdus, textes sélectionnables et polices intégrées.", plan: "pro" },
      { icon: "nxTable", title: "Série depuis un CSV", text: "Un modèle, des dizaines de visuels remplis automatiquement.", plan: "pro" },
      { icon: "sparkle", title: "IA de design", text: "Une maquette à partir d’une description, des variantes et la retouche intelligente.", plan: "pro" },
      { icon: "nxUsers", title: "Équipe et validation", text: "Bibliothèques d’équipe tenues à jour et liens de validation pour vos clients.", plan: "pro" },
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
    card: "Sécurisez et surveillez",
    tagline: "Audits du site, du domaine et du code, supervision 24 h/24, alertes et page de statut publique.",
    h1: ["Sécurisez votre site,", "surveillez-le 24 h/24."],
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
        text: `Site, API, port, DNS, domaine et signal de vie, vérifiés par les serveurs NEXORA même quand l’application est fermée : ${MONITORS.free} site avec l’offre Gratuite, ${MONITORS.pro} avec Pro.`,
      },
      { icon: "code", title: "Code et correctifs", text: "Dépendances vulnérables, secrets oubliés, audits programmés et correctifs écrits pour votre hébergeur.", plan: "pro" },
      { icon: "bell", title: "Alertes", text: "Par e-mail et vers vos outils d’équipe, avec escalade, regroupement et heures calmes.", plan: "pro" },
      { icon: "globe", title: "Page de statut publique", text: "Vos visiteurs suivent l’état de votre service et s’abonnent aux incidents.", plan: "pro" },
      { icon: "group", title: "Visiteurs réels", text: "Les temps de chargement mesurés chez vos vrais visiteurs.", plan: "pro" },
      { icon: "nxWorld", title: "Seconde région", text: "Chaque panne confirmée depuis un deuxième point du globe.", plan: "pro" },
      { icon: "record", title: "Parcours rejoués", text: "Un parcours enregistré (connexion, commande…) rejoué à intervalle régulier par NEXORA ouvert sur votre PC.", plan: "pro" },
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
    h1: ["Votre site devient", "un logiciel Windows."],
    lead: "Un site, un dossier de site ou un projet de bureau devient un logiciel installable : installateur, version portable, signature, mises à jour automatiques et distribution, avec un aperçu sur un vrai PC Windows 11.",
    // #087 : tout le Desktop Builder avec l'offre Gratuite, pour 2 applications au total (avec l'App Builder).
    plan: "free",
    planNote: "2 applications gratuites, Android ou Windows ; 5 constructions par application et par mois",
    limits: APP_LIMITS,
    features: [
      { icon: "download", title: "Installateur et portable", text: "Installateur, version portable, ZIP et MSI, pour x64 et ARM64." },
      { icon: "display", title: "Aperçu sur Windows 11", text: "Votre fenêtre, l’installateur, le menu Démarrer et la barre des tâches, avant même de construire." },
      { icon: "sync", title: "Mises à jour automatiques", text: "Déploiement progressif, canal bêta et mise à jour obligatoire quand il le faut." },
      { icon: "key", title: "Signature", text: "Par certificat ou par la signature de Microsoft dans le cloud, pour rassurer Windows." },
      { icon: "nxBox", title: "Microsoft Store et winget", text: "Paquet MSIX pour le Store et fiches winget prêtes à proposer." },
      { icon: "shield", title: "Bac à sable Windows", text: "Essayez votre installateur dans un Windows vierge, sans toucher à votre PC." },
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
export const spaceHref = (s: Space) => `/espaces/${s.slug}`
export const PLAN_LABEL: Record<PlanId, string> = { free: "Gratuit", pro: "Pro" }
