// Textes des sections du site (vouvoiement, comme dans NEXORA depuis le #115 ; aucun nom de prestataire ni détail
// technique). NEXORA #117 : textes partis des besoins réels ; les offres ne figurent que sur /tarifs (PRICING_FAQ),
// /tarifs/comparatif et /licence ; profils « Pour qui ? » dans data/personas.ts.
import { CONTACT_EMAIL } from "../../../nexora/app/renderer/nx/offres/catalog.js"
import { DEVICE_COUNT } from "../lib/product"
import type { SpaceId } from "./spaces"

// Frameworks et outils reconnus par NEXORA (texte du Responsive Lab, outils de src/tools.js).
export const TECH_ROWS: string[][] = [
  ["React", "Next.js", "Vue", "Angular", "Svelte", "Astro", "Expo", "Flutter", "Laravel", "Django", "Rails", "Hugo", ".NET", "Express"],
  ["Node.js", "pnpm", "Yarn", "Bun", "Deno", "Python", "PHP", "Composer", "Ruby", "Go", "Git", "TypeScript", "PWA", "HTML et CSS"],
]

// Un fait vérifié par espace (catalogue, modèles, mises en scène… relevés dans NEXORA), repris par le hero et la
// grille des espaces (#069).
export const SPACE_FACTS: Record<SpaceId, [string, string]> = {
  home: ["8", "objectifs pour bien commencer"],
  preview: [String(DEVICE_COUNT), "modèles d’appareils à l’écran"],
  browser: ["6", "catégories d’audit, avec rapport"],
  dev: ["15", "modèles de projet prêts à lancer"],
  android: ["APK · AAB", "signés, prêts pour le Play Store"],
  studio: ["6", "mises en scène toutes prêtes"],
  design: ["13", "fonctions de design"],
  security: ["6", "vérifications par les serveurs, 24 h/24"],
  desktop: ["4", "formats d’installation"],
}

/** #117 : « Sans NEXORA → Avec NEXORA », une ligne par besoin (composant Shifts). */
export type Shift = { before: string; after: string }

/** #117 : ce que NEXORA change, pour tous (accueil). */
export const HOME_SHIFTS: Shift[] = [
  {
    before: "Un logiciel pour le design, un autre pour le code, un troisième pour les tests, encore un pour l’application mobile : à installer, à payer et à relier.",
    after: "Une seule application : design, code, tests, applications, 3D et supervision travaillent sur le même projet.",
  },
  {
    before: "Un site vérifié sur votre seul écran, qui casse sur le téléphone de vos visiteurs.",
    after: `Votre site dans le cadre de ${DEVICE_COUNT} modèles d’appareils, côte à côte, avant la mise en ligne.`,
  },
  {
    before: "Des heures perdues à installer Node.js, Python ou Git avant d’écrire la première ligne.",
    after: "Les outils qui manquent installés pour vous, depuis leurs sources officielles, sans droits d’administrateur.",
  },
  {
    before: "Une application mobile ou un logiciel Windows jugés trop chers ou trop longs à développer.",
    after: "Votre site devient une application Android signée, prête pour le Play Store, et un logiciel Windows installable.",
  },
  {
    before: "Une panne découverte par vos clients, des heures plus tard.",
    after: "Une supervision 24 h/24 par les serveurs NEXORA, même application fermée, avec des alertes.",
  },
]

export type StoryStep = { space: SpaceId; verb: string; title: string; text: string; points: string[] }
export const STORY: StoryStep[] = [
  {
    space: "design",
    verb: "Concevez",
    title: "Dessinez vos écrans",
    text: "Mise en page automatique, variables et composants pour vos maquettes ; un prototype cliquable pour convaincre, puis le code exporté pour votre projet, sans tout recopier.",
    points: ["Prototype cliquable", "Export HTML, CSS ou React", "Validation client par lien"],
  },
  {
    space: "dev",
    verb: "Codez",
    title: "Écrivez et lancez votre projet",
    text: "Ouvrez votre dossier ou partez d’un modèle. NEXORA installe les outils qui manquent, lance le serveur et met l’aperçu à jour à chaque enregistrement.",
    points: ["Terminal intégré", "Git et dépôt distant", "15 outils installés pour vous"],
  },
  {
    space: "preview",
    verb: "Testez",
    title: "Vérifiez sur tous les écrans",
    text: `Affichez votre site dans le cadre de ${DEVICE_COUNT} modèles d’appareils, côte à côte, puis passez au Browser Lab pour le réseau, la console et les audits.`,
    points: [`${DEVICE_COUNT} modèles d’appareils`, "Pliables et rotation", "Audits de performance"],
  },
  {
    space: "security",
    verb: "Sécurisez",
    title: "Auditez et surveillez",
    text: "Auditez le site, le domaine et le code, puis surveillez la disponibilité 24 h/24, même NEXORA fermée. Vos visiteurs suivent l’état du service sur votre page de statut.",
    points: ["Note de fiabilité", "Supervision 24 h/24", "Page de statut publique"],
  },
  {
    space: "android",
    verb: "Publiez",
    title: "Transformez votre site en app Android",
    text: "Logo, écran de démarrage, notifications push, application signée, fiche Play Store et test fermé : tout est préparé et vérifié avant l’envoi.",
    points: ["APK et AAB signés", "Notifications push", "Prêt pour le Play Store"],
  },
  {
    space: "desktop",
    verb: "Distribuez",
    title: "Livrez un logiciel Windows",
    text: "Installateur, version portable ou paquet pour le Microsoft Store, avec signature et mises à jour automatiques. Essayez-le d’abord sur un PC Windows 11 simulé.",
    points: ["Installateur et MSI", "Mises à jour automatiques", "Microsoft Store et winget"],
  },
  {
    space: "studio",
    verb: "Présentez",
    title: "Mettez votre lancement en scène",
    text: "Placez votre app dans un appareil 3D, animez la caméra et exportez la vidéo au bon format pour chaque réseau social.",
    points: ["Appareils 3D réalistes", "Mouvements de caméra", "Vidéos 9:16, 1:1, 16:9"],
  },
]

export const AI_PROVIDERS = ["Claude", "GPT", "Gemini", "Mistral", "Ollama"]
export const AI_USES: { space: SpaceId; title: string; text: string }[] = [
  { space: "dev", title: "Dev Lab", text: "Proposez des changements sur tout le projet, que vous acceptez fichier par fichier." },
  { space: "design", title: "NEX-DESIGN", text: "Créez une maquette à partir d’une simple description." },
  { space: "studio", title: "Studio 3D & Motion", text: "Composez une mise en scène et un mouvement de caméra." },
  { space: "android", title: "App Builder", text: "Rédigez votre fiche Play Store et comprenez vos plantages." },
]

// Fiche « Confiance » (#069 : libellés de fiche technique au lieu d'icônes).
export const TRUST: { label: string; title: string; text: string }[] = [
  // #072 : la synchronisation porte sur les réglages et la fiche des projets, jamais sur les dossiers de code.
  { label: "Fichiers", title: "Vos fichiers restent sur votre PC", text: "Vos dossiers de code ne quittent pas votre ordinateur. Avec un compte, seuls vos réglages et la fiche de vos projets se synchronisent entre vos appareils." },
  { label: "Secrets", title: "Clés et jetons chiffrés", text: "Jetons, mots de passe et variables protégées sont chiffrés par Windows et ne sont jamais renvoyés à l’interface." },
  { label: "Sessions", title: "Chaque projet isolé", text: "Chaque projet a sa propre session : cookies, stockage et cache ne se mélangent jamais d’un site à l’autre." },
  { label: "Outils", title: "Outils vérifiés", text: "Les outils de développement viennent de leurs sources officielles, avec contrôle de l’empreinte quand elle est publiée." },
]

/** Questions fréquentes générales (accueil, Télécharger) : aucune offre ni prix. */
export const FAQ: { q: string; a: string }[] = [
  {
    q: "À qui s’adresse NEXORA ?",
    a: "À tous ceux qui créent pour le web : étudiants en informatique, développeurs juniors, codeurs passionnés, vibe codeurs qui construisent avec l’IA, entrepreneurs qui testent une idée, créateurs de MVP, designers, freelances et agences, commerçants qui veulent leur application. La page Pour qui ? détaille le parcours de chacun.",
  },
  {
    q: "Faut-il savoir coder ?",
    a: "Non. Tester un site sur des appareils, le transformer en app Android ou en logiciel Windows, créer des visuels ou une vidéo 3D se fait sans écrire de code. Le Dev Lab est là le jour où vous voulez coder.",
  },
  {
    q: "Mon framework est-il reconnu ?",
    a: "React, Next.js, Vue, Angular, Svelte, Astro, Expo, Flutter, Laravel, Django, Rails, Hugo, .NET… NEXORA reconnaît le framework à l’ouverture du dossier, installe les dépendances et lance le projet. Les outils qui manquent (Node.js, Python, PHP, Go, Git…) sont installés depuis leurs sources officielles.",
  },
  {
    q: "Sur quels ordinateurs NEXORA fonctionne-t-il ?",
    a: "Sur Windows 10 et Windows 11 en 64 bits. NEXORA Devs Toolbox est un logiciel de bureau : un petit lanceur l’installe, le vérifie et le met à jour. Une connexion à Internet est nécessaire au démarrage pour valider votre licence.",
  },
  {
    q: "Comment fonctionne l’assistant IA ?",
    a: "Vous ajoutez votre propre clé (Claude, GPT, Gemini, Mistral…) ou vous utilisez Ollama sur votre PC. L’assistant propose ses changements, que vous acceptez fichier par fichier ; NEXORA ne limite pas le nombre de requêtes et ne facture rien pour l’IA.",
  },
  {
    q: "Puis-je publier sur le Play Store ?",
    a: "Oui : NEXORA construit l’application signée, prépare la fiche Play Store (textes, captures, icône), vérifie que tout est prêt, puis l’envoie. Il suit aussi le test fermé de 14 jours avec vos testeurs.",
  },
  {
    q: "Mes projets sont-ils en sécurité ?",
    a: "Vos dossiers de code restent sur votre PC, vos clés et jetons sont chiffrés par Windows, et chaque projet a sa propre session. Sans compte, tout reste sur votre ordinateur ; avec un compte, vos réglages et la fiche de vos projets se synchronisent, jamais vos dossiers de code.",
  },
  {
    q: "Comment se passent les mises à jour ?",
    a: "Le lanceur NEXORA Devs Toolbox télécharge chaque nouvelle version, vérifie sa signature et l’installe, puis relance NEXORA. Vos réglages, vos projets et votre compte sont gardés.",
  },
]

/** #117 : questions sur les offres, réservées à la page /tarifs. */
export const PRICING_FAQ: { q: string; a: string }[] = [
  {
    q: "NEXORA est-il gratuit ?",
    a: "Oui. L’offre Gratuite n’a pas de limite de durée : Responsive Lab et Browser Lab complets, 2 applications Android ou Windows avec tout l’App Builder et le Desktop Builder, NEX-DESIGN (3 documents), un audit de sécurité par jour et l’assistant IA avec votre propre clé. Votre premier jour est un essai complet de Pro (24 h). Pro ouvre le Dev Lab, jusqu’à 50 applications et les outils avancés.",
  },
  {
    // #087 : 2 applications au total, App Builder et Desktop Builder confondus, applications supprimées comprises.
    q: "Combien d’applications avec l’offre Gratuite ?",
    a: "Deux au total : des applications Android (App Builder) ou des logiciels Windows (Desktop Builder), avec toutes leurs fonctions. Une application compte dès sa première construction et reste comptée si vous la supprimez. Chacune dispose de 5 constructions par mois ; le compteur repart le 1er du mois. Avec Pro : jusqu’à 50 applications, sans limite par application.",
  },
  {
    q: "L’IA est-elle facturée en plus ?",
    a: "Non, quelle que soit votre offre. Vous utilisez votre propre clé (Claude, GPT, Gemini, Mistral…) ou Ollama sur votre PC : NEXORA ne limite pas le nombre de requêtes et ne facture rien pour l’IA.",
  },
  {
    q: "Comment changer d’offre ?",
    // #087 (A-056) : le paiement en ligne n'est pas encore ouvert ; l'équipe active Pro sur demande. #107 : paiement unique (SasPay).
    a: `Depuis la page Ma licence du site, ou dans NEXORA : Mon compte puis Offre et usage. Le paiement se fait en une fois, par Mobile Money ou carte bancaire, pour un mois ou un an : rien n’est prélevé automatiquement, et vous prolongez depuis Ma licence quand vous voulez. Tant que le paiement en ligne n’est pas ouvert, écrivez à ${CONTACT_EMAIL} ou depuis Mon compte → Support : l’équipe NEXORA active votre offre Pro, en général sous 24 h. Le paiement annuel vous offre deux mois.`,
  },
  {
    // #090 : NEXORA REFERRAL, remise du filleul sur chaque paiement Pro ; parrains invités par l'équipe.
    q: "J’ai le code d’un parrain : comment en profiter ?",
    a: "Ouvrez son lien de parrainage, ou saisissez son code promo sur la page Ma licence ou dans NEXORA (Mon compte → Offre et usage) avant votre premier paiement. Vous avez 30 % de remise sur l’offre Pro à chaque paiement : 17,50 $ par mois au lieu de 25 $, ou 175 $ par an au lieu de 250 $. Un seul parrain par compte. Le programme de parrainage est ouvert sur invitation de l’équipe NEXORA.",
  },
]
