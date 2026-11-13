// Les 9 espaces de NEXORA présentés par le site : mêmes noms, icônes, sous-titres et ordre que le rail de
// l'application (renderer/dist/chunks/chunk-Y6Q6RT63.js). Les fonctions décrites sont celles livrées (voir SUIVI.md).
// NEXORA #117 : chaque espace part d'un besoin réel (`need`) et dit ce que NEXORA y change ; vouvoiement partout ; plus
// aucune offre ni limite d'offre ici (elles ne figurent que sur /tarifs, /tarifs/comparatif et /licence).
import { DEVICE_COUNT } from "../lib/product"

export type SpaceId = "home" | "preview" | "browser" | "dev" | "android" | "studio" | "design" | "security" | "desktop"
export type Feature = { icon: string; title: string; text: string }
export type Space = {
  id: SpaceId
  slug: string
  name: string
  rail: string
  icon: string
  /** Sous-titre affiché sous le nom de l'espace dans la barre d'outils de NEXORA. */
  subtitle: string
  /** #117 : le besoin de départ, tel que l'utilisateur le vit. */
  need: string
  /** La réponse de l'espace, en quelques mots. */
  card: string
  tagline: string
  h1: [string, string]
  lead: string
  features: Feature[]
  details?: { title: string; items: string[] }
}

export const SPACES: Space[] = [
  {
    id: "home",
    slug: "accueil",
    name: "Accueil",
    rail: "Accueil",
    icon: "home",
    subtitle: "Tableau de bord de vos projets",
    need: "Votre site, son code, ses applications et ses visuels sont éparpillés entre plusieurs dossiers et plusieurs outils.",
    card: "Un projet relie tout",
    tagline: "Un projet réunit votre site ou votre code, ses applications, ses visuels et sa surveillance : vous savez toujours où en est chaque chose.",
    h1: ["Tous vos projets,", "au même endroit."],
    lead: "Fini les fichiers cherchés dans cinq dossiers et trois logiciels. Sur l’Accueil, un projet réunit votre site ou votre code, ses applications, ses visuels et sa surveillance : ouvrez-le, et chaque espace de NEXORA reprend là où vous en étiez.",
    features: [
      { icon: "folder", title: "Des projets qui relient tout", text: "Site, dossier de code, applications, scènes 3D, documents et sites surveillés restent ensemble : plus besoin de retenir où se trouve quoi." },
      { icon: "target", title: "Par quoi commencer ?", text: "Vous savez ce que vous voulez obtenir, pas forcément par où passer : choisissez un objectif (app Android, logiciel Windows, test sur tous les écrans…) et NEXORA ouvre le bon espace." },
      { icon: "search", title: "Aller partout avec Ctrl K", text: "Une seule recherche pour ouvrir une section, une fenêtre ou un projet, sans fouiller dans les menus." },
      { icon: "plus", title: "Créer sans rien écraser", text: "Ctrl N crée une planche, un projet, une application ou une scène sous un nom libre : votre travail existant reste intact." },
      { icon: "cloud", title: "Compte et synchronisation", text: "Connectez-vous pour retrouver vos réglages et la fiche de vos projets sur vos autres PC et dans NEXORA web." },
      { icon: "appearance", title: "Une interface à votre goût", text: "Thème clair ou sombre, couleur d’accent, polices, contraste élevé et taille de l’interface, pour travailler confortablement pendant des heures." },
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
    need: "Votre site est réussi sur votre écran, mais vous ne savez pas à quoi il ressemble sur le téléphone de vos visiteurs.",
    card: "Votre site sur tous les écrans",
    tagline: `${DEVICE_COUNT} modèles d’appareils côte à côte : vous voyez tout de suite ce qui déborde, ce qui se chevauche et ce qui devient illisible.`,
    h1: ["Ce que voient vos visiteurs,", "avant eux."],
    lead: "La plupart de vos visiteurs arrivent sur un téléphone que vous n’avez pas sous la main. Affichez votre site ou votre projet dans le cadre d’un iPhone, d’un Galaxy, d’un pliable, d’une tablette ou d’un téléviseur, comparez-les côte à côte et corrigez avant la mise en ligne.",
    features: [
      { icon: "phone", title: `${DEVICE_COUNT} modèles d’appareils`, text: "iPhone, Galaxy, Pixel, Xiaomi, Tecno, Infinix, pliables, tablettes, PC, téléviseurs, montres, consoles et voitures : les écrans de vos visiteurs, sans les acheter." },
      { icon: "frame", title: "Des cadres fidèles", text: "Cadres officiels d’Android Studio pour les Pixel, les montres, les téléviseurs et les voitures ; les autres dessinés aux mesures de chaque modèle : écran, densité, coins arrondis, encoche." },
      { icon: "fold", title: "Pliables et rotation", text: "Ouvrez ou fermez un pliable, passez en paysage : repérez les mises en page qui cassent au changement d’état." },
      { icon: "multi", title: "Côte à côte, sur des planches", text: "Comparez plusieurs appareils sur une même planche, puis rouvrez-la pour vérifier vos corrections." },
      { icon: "folderOpen", title: "Vos projets locaux aussi", text: "Ouvrez un dossier : le framework est reconnu, les dépendances sont installées et le site se lance, sans ligne de commande." },
      { icon: "camera", title: "Photos et vidéos HD", text: "Exportez votre site dans ses appareils pour une présentation client, un portfolio ou vos réseaux sociaux." },
      { icon: "layers", title: "Chaque projet isolé", text: "Cookies, stockage et cache séparés par projet : la connexion d’un site ne déteint jamais sur un autre." },
      { icon: "cube", title: "Prêt pour la 3D", text: "Envoyez vos appareils dans le Studio 3D & Motion pour en faire une vidéo animée." },
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
    need: "Une page lente, une erreur invisible, un formulaire qui ne part pas : sans les bons outils, impossible de savoir pourquoi.",
    card: "Trouvez ce qui cloche, et pourquoi",
    tagline: "Éléments, réseau, console, tests enregistrés et audits, présentés clairement : vous voyez ce qui ralentit ou casse votre page, et quoi corriger.",
    h1: ["Trouvez ce qui cloche,", "et pourquoi."],
    lead: "Les outils de développement des navigateurs sont puissants mais intimidants. Le Browser Lab ouvre n’importe quel site avec les mêmes informations (éléments, réseau, console, audits), rangées simplement, et un rapport qui dit quoi corriger en premier.",
    features: [
      { icon: "inspector", title: "Éléments", text: "Survolez la page pour voir chaque bloc, ses balises et ses styles, et comprendre d’où vient un décalage." },
      { icon: "sync", title: "Réseau", text: "Chaque requête avec son type, son poids et son temps, en cascade : repérez l’image trop lourde ou l’appel qui échoue." },
      { icon: "terminal", title: "Console", text: "Les messages et les erreurs de la page en direct, pour ne plus chercher à l’aveugle." },
      { icon: "audit", title: "Audits", text: "Performance, accessibilité, référencement, responsive et bonnes pratiques, avec un rapport qui classe les corrections." },
      { icon: "record", title: "Tests enregistrés", text: "Enregistrez un parcours une fois, puis rejouez-le après chaque modification et à chaque taille d’écran." },
      { icon: "download", title: "Extraction de site", text: "Récupérez le code source d’un site pour l’étudier ou le reprendre dans le Dev Lab." },
      { icon: "eye", title: "Aperçu dans les résultats", text: "Voyez comment votre page apparaît dans les moteurs de recherche et quand on la partage sur les réseaux, avant de la publier." },
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
    need: "Installer Node.js, Python, Git et un éditeur, puis tout relier, prend des heures avant d’écrire la première ligne.",
    card: "Codez sans rien installer à la main",
    tagline: "Éditeur, terminal, Git, tests, débogueur et aperçu en direct, avec les outils de développement installés pour vous.",
    h1: ["Écrivez, lancez", "et publiez votre code."],
    lead: "Le temps passé à installer, configurer et passer d’un outil à l’autre, c’est du temps en moins pour votre projet. Le Dev Lab réunit un éditeur complet, le terminal, Git, les tests et l’aperçu en direct, et installe pour vous les outils qui manquent, depuis leurs sources officielles.",
    features: [
      { icon: "code", title: "Éditeur complet", text: "Coloration, autocomplétion, recherche dans tout le projet et Ctrl P pour ouvrir n’importe quel fichier." },
      { icon: "terminal", title: "Terminal intégré", text: "Plusieurs terminaux, déjà placés dans l’environnement de votre projet." },
      { icon: "refreshCw", title: "Git et GitHub", text: "Enregistrez, envoyez et clonez un dépôt sans retenir les commandes ; ouvrez aussi votre projet dans un éditeur de code complet." },
      { icon: "eye", title: "Aperçu en direct", text: "Lancez le projet : chaque enregistrement met l’aperçu à jour, sans recharger à la main." },
      { icon: "wrench", title: "15 outils installés pour vous", text: "Node.js, Python, PHP, Go, Flutter, Git… depuis leurs sources officielles, sans droits d’administrateur ni variables à régler." },
      { icon: "file", title: "15 modèles de projet", text: "HTML, React, Vue, Svelte, Next.js, Astro, PWA, Expo, Flutter, PHP et plus encore : un projet qui démarre en un clic." },
      { icon: "warn", title: "Problèmes, scripts et tests", text: "Les erreurs de tout le projet au même endroit, vos scripts en un clic, vos tests avec leur couverture." },
      { icon: "key", title: "Variables protégées", text: "Clés et mots de passe chiffrés par Windows, avec import et export de fichiers .env : rien en clair dans votre code." },
      { icon: "link", title: "Client d’API et Git avancé", text: "Collections et import OpenAPI ; branches, fusion avec les conflits côte à côte, graphe de l’historique." },
      { icon: "sparkle", title: "Assistant IA du projet", text: "Des changements proposés sur tout le projet, que vous acceptez fichier par fichier et pouvez annuler." },
      { icon: "target", title: "Débogueur", text: "Points d’arrêt avec F9, pas à pas, pile d’appels et variables : trouvez un bug sans semer des messages partout." },
      { icon: "rocket", title: "Mise en ligne et contrôles", text: "Publiez chez les principaux hébergeurs, avec un aperçu par branche et un contrôle sur trois appareils avant chaque mise en ligne." },
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
    need: "Vos clients vivent sur leur téléphone, mais une application Android développée sur mesure coûte cher et prend des mois.",
    card: "Votre site devient une app",
    tagline: "Application Android signée, logo et écran de démarrage, notifications push, fiche Play Store et publication, à partir de votre site.",
    h1: ["Votre site devient", "une app Android."],
    lead: "Une application sur l’écran d’accueil, c’est votre marque sous les yeux de vos clients chaque jour. Donnez l’adresse de votre site : NEXORA construit l’application avec son logo, son écran de démarrage et ses notifications, prépare la fiche Play Store et vérifie que tout est prêt avant la publication.",
    features: [
      { icon: "android", title: "APK et AAB signés", text: "Une vraie application Android qui affiche votre site, signée avec votre clé, prête pour le Play Store." },
      { icon: "sparkle", title: "Logo et écran de démarrage", text: "Composez le logo de l’application (initiales, symbole, couleurs) : il devient son icône à toutes les tailles, avec un écran de démarrage assorti." },
      { icon: "phone", title: "Aperçu fidèle", text: "L’écran d’accueil et l’application simulés sur iPhone, Pixel, Galaxy et les autres surcouches, avant de construire." },
      { icon: "bell", title: "Notifications push", text: "Prévenez vos utilisateurs d’une promotion ou d’une nouveauté, même application fermée, avec des catégories qu’ils règlent eux-mêmes." },
      // #073 : messagerie des applications (Push.java, section « Messagerie et appels » de l'App Builder).
      { icon: "chat", title: "Messagerie et appels", text: "Pour une application de discussion : conversations empilées, réponse depuis la notification, appels entrants en plein écran." },
      // #115 : modules de l'App Builder (src/android/modules.js).
      { icon: "nxComponent", title: "OneSignal, AdMob, Analytics et Meta", text: "Publicités, mesure d’audience et notifications avec les SDK officiels, pilotés depuis votre page, sans écrire de code Android." },
      { icon: "image", title: "Fiche Play Store", text: "Textes par langue rédigés avec l’IA, captures habillées, icône, bannière et politique de confidentialité." },
      { icon: "nxCheckCircle", title: "Prêt pour le Play Store", text: "Un score et chaque point à corriger, relié à sa section, pour envoyer une application qui passe la vérification." },
      { icon: "group", title: "Tests fermés", text: "Les 12 testeurs pendant 14 jours qu’exige Google Play : invitations, suivi et réponses pour l’accès à la production." },
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
    need: "Pour lancer un produit, il faut des visuels et des vidéos qui donnent envie, et un studio ou un monteur coûte cher.",
    card: "Présentez en 3D et en vidéo",
    tagline: "Appareils 3D réalistes, mouvements de caméra, rendus et vidéos aux formats des réseaux sociaux et des stores.",
    h1: ["Mettez votre app", "en scène."],
    lead: "Une capture d’écran plate ne fait pas envie. Placez votre site ou votre app dans des appareils 3D éclairés comme en studio photo, animez la caméra, puis exportez des images et des vidéos prêtes pour vos réseaux, vos stores et vos clients, sans logiciel de montage.",
    features: [
      { icon: "cube", title: "Appareils 3D réalistes", text: "Téléphones, pliables, tablettes et ordinateurs à taille réelle, éclairés comme une photo produit." },
      { icon: "video", title: "Mouvements de caméra", text: "Orbite, spirale, plongée, effet vertigo et clés d’animation sur une frise, sans connaître la 3D." },
      { icon: "nxBeat", title: "Transitions et rythme", text: "Fondus, iris, volets, et clés calées sur le tempo de votre musique." },
      { icon: "nxAperture", title: "Rendu avancé", text: "Réaliste, argile, dessin animé ou fil de fer ; éclairages, profondeur de champ et ambiances." },
      { icon: "download", title: "Exports", text: "Vidéo, GIF animé, WebM à fond transparent, page web 3D, Lottie et réalité augmentée." },
      { icon: "sparkle", title: "Mise en scène par l’IA", text: "Décrivez ce que vous voulez : l’IA compose la scène et le mouvement de caméra." },
      { icon: "film", title: "Formats des réseaux sociaux", text: "9:16, 1:1, 16:9 et plus, avec les zones de sécurité de chaque plateforme : rien d’important n’est coupé." },
      { icon: "upload", title: "Imports 3D", text: "Modèles OBJ, STL et PLY, et nuages de points SPLAT." },
      { icon: "chat", title: "Validation client", text: "Envoyez la vidéo par un lien : votre client commente à la seconde près, sans créer de compte." },
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
    need: "Maquettes, visuels et documents passent par plusieurs logiciels, et le site en ligne ne ressemble jamais tout à fait à la maquette.",
    card: "Créez vos visuels",
    tagline: "Maquettes, prototypes, animation, export de code, retouche d’image et impression, dans le même atelier que votre code.",
    h1: ["Dessinez, prototypez,", "exportez le code."],
    lead: "Concevez vos écrans, vos visuels et vos documents d’impression au même endroit que votre code : mise en page automatique, composants, prototype cliquable et code prêt pour votre projet, pour que le site ressemble enfin à la maquette.",
    features: [
      { icon: "grid", title: "Mise en page automatique", text: "Des blocs qui s’adaptent à leur contenu, avec espacements et alignements : moins de réglages à la main." },
      { icon: "nxAccess", title: "Accessibilité et mesures", text: "Contraste vérifié et distances affichées en maintenant Alt." },
      { icon: "nxComponent", title: "Variables et variantes", text: "Couleurs, tailles et modes ; variantes de composants réutilisables d’un écran à l’autre." },
      { icon: "nxInteract", title: "Prototype et tailles d’écran", text: "Actions au clic, page HTML de démonstration et déclinaisons téléphone, tablette et ordinateur." },
      // #113 : Motion dans NEX-DESIGN.
      { icon: "nxAnimate", title: "Animation", text: "Frise avec images clés, courbes et ressorts, 41 animations toutes faites, et le code de l’animation en CSS, SwiftUI ou Compose." },
      { icon: "code", title: "Export de code", text: "HTML et CSS, ou React et Tailwind, envoyé directement dans le Dev Lab." },
      { icon: "pdf", title: "Impression vectorielle", text: "PDF avec fonds perdus, textes sélectionnables et polices intégrées, prêt pour l’imprimeur." },
      { icon: "nxTable", title: "Série depuis un CSV", text: "Un modèle, des dizaines de visuels remplis automatiquement." },
      { icon: "sparkle", title: "IA de design", text: "Une maquette à partir d’une description, des variantes et la retouche intelligente." },
      { icon: "nxUsers", title: "Équipe et validation", text: "Bibliothèques d’équipe tenues à jour et liens de validation pour vos clients." },
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
    need: "Un site piraté ou en panne fait fuir vos clients, et vous l’apprenez souvent par eux, des heures plus tard.",
    card: "Sécurisez et surveillez",
    tagline: "Audits du site, du domaine et du code, supervision 24 h/24, alertes et page de statut publique.",
    h1: ["Sécurisez votre site,", "surveillez-le 24 h/24."],
    lead: "La plupart des failles viennent d’un réglage oublié, et la plupart des pannes sont découvertes par les visiteurs. NEXORA donne une note de fiabilité à chaque projet, des audits qui disent quoi corriger, et une supervision qui continue même quand l’application est fermée.",
    features: [
      { icon: "shield", title: "Note de fiabilité", text: "Sécurité, domaine et e-mail, code, disponibilité et rapidité réunis en une note, avec les tâches de la semaine." },
      { icon: "audit", title: "Audit du site", text: "En-têtes de sécurité, certificat et configuration, comparés à l’audit précédent pour suivre vos progrès." },
      { icon: "mail", title: "Domaine et e-mail", text: "SPF, DKIM, DMARC, DNSSEC, expiration du domaine et sous-domaines : les réglages qui protègent votre domaine et vos e-mails." },
      // #072 : les parcours rejoués tournent sur le PC (NEXORA ouvert) : sortis de la supervision serveur.
      { icon: "nxiPulse", title: "Supervision 24 h/24", text: "Site, API, port, DNS, domaine et signal de vie, vérifiés par les serveurs NEXORA même quand l’application est fermée." },
      { icon: "code", title: "Code et correctifs", text: "Dépendances vulnérables, secrets oubliés, audits programmés et correctifs écrits pour votre hébergeur." },
      { icon: "bell", title: "Alertes", text: "Par e-mail et vers vos outils d’équipe, avec escalade, regroupement et heures calmes." },
      { icon: "globe", title: "Page de statut publique", text: "Vos visiteurs suivent l’état de votre service et s’abonnent aux incidents, au lieu de vous écrire." },
      { icon: "group", title: "Visiteurs réels", text: "Les temps de chargement mesurés chez vos vrais visiteurs." },
      { icon: "nxWorld", title: "Seconde région", text: "Chaque panne confirmée depuis un deuxième point du globe, pour moins de fausses alertes." },
      { icon: "record", title: "Parcours rejoués", text: "Un parcours enregistré (connexion, commande…) rejoué à intervalle régulier par NEXORA ouvert sur votre PC." },
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
    need: "Certains clients veulent un vrai logiciel à installer, et préparer un installateur Windows signé est un métier à part.",
    card: "Un vrai logiciel Windows",
    tagline: "Installateur, version portable, MSI, signature, mises à jour automatiques, Microsoft Store et winget.",
    h1: ["Votre site devient", "un logiciel Windows."],
    lead: "Une entreprise, une école ou un poste en caisse préfère souvent un logiciel installé à un onglet de navigateur. Un site, un dossier de site ou un projet de bureau devient un logiciel installable : installateur, version portable, signature, mises à jour automatiques et distribution, avec un aperçu fidèle de Windows 11.",
    features: [
      { icon: "download", title: "Installateur et portable", text: "Installateur, version portable, ZIP et MSI, pour x64 et ARM64 : le bon format pour chaque poste." },
      { icon: "display", title: "Aperçu sur Windows 11", text: "Votre fenêtre, l’installateur, le menu Démarrer et la barre des tâches, avant même de construire." },
      { icon: "sync", title: "Mises à jour automatiques", text: "Déploiement progressif, canal bêta et mise à jour obligatoire quand il le faut : plus de version dépassée chez vos utilisateurs." },
      { icon: "key", title: "Signature", text: "Par certificat ou par la signature de Microsoft dans le cloud, pour que Windows fasse confiance à votre logiciel." },
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
