// Textes des sections du site (tutoiement, comme dans NEXORA ; aucun nom de prestataire ni détail technique).
import developpeurs from "../assets/photos/developpeurs.webp"
import agences from "../assets/photos/agences.webp"
import commercants from "../assets/photos/commercants.webp"
import etudiants from "../assets/photos/etudiants.webp"
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

export type StoryStep = { space: SpaceId; verb: string; title: string; text: string; points: string[] }
export const STORY: StoryStep[] = [
  {
    space: "design",
    verb: "Concevez",
    title: "Dessinez vos écrans",
    text: "Mise en page automatique, variables et composants pour vos maquettes ; un prototype cliquable pour convaincre, puis le code exporté pour votre projet.",
    points: ["Prototype cliquable", "Export HTML, CSS ou React", "Validation client par lien"],
  },
  {
    space: "dev",
    verb: "Code",
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
    title: "Audite et surveille",
    text: "Audite le site, le domaine et le code, puis surveille la disponibilité 24 h/24, même NEXORA fermée. Vos visiteurs suivent l’état sur votre page de statut.",
    points: ["Note de fiabilité", "Supervision 24 h/24", "Page de statut publique"],
  },
  {
    space: "android",
    verb: "Publiez",
    title: "Emballez votre site en app Android",
    text: "Icône, écran de démarrage, notifications push, application signée, fiche Play Store et test fermé : tout est préparé et vérifié avant l’envoi.",
    points: ["APK et AAB signés", "Notifications push", "Prêt pour le Play Store"],
  },
  {
    space: "desktop",
    verb: "Distribuez",
    title: "Livre un logiciel Windows",
    text: "Installateur, version portable ou paquet pour le Microsoft Store, avec signature et mises à jour automatiques. Essayez-le d’abord sur un PC Windows 11 simulé.",
    points: ["Installateur et MSI", "Mises à jour automatiques", "Microsoft Store et winget"],
  },
  {
    space: "studio",
    verb: "Présente",
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
  { space: "android", title: "App Builder", text: "Rédigez votre fiche Play Store et expliquez les plantages." },
]

// Fiche « Confiance » (#069 : libellés de fiche technique au lieu d'icônes).
export const TRUST: { label: string; title: string; text: string }[] = [
  // #072 : la synchronisation porte sur les réglages et la fiche des projets, jamais sur les dossiers de code.
  { label: "Fichiers", title: "Vos fichiers restent sur votre PC", text: "Vos dossiers de code ne quittent pas votre ordinateur. Avec un compte, seuls vos réglages et la fiche de vos projets se synchronisent entre vos appareils." },
  { label: "Secrets", title: "Clés et jetons chiffrés", text: "Jetons, mots de passe et variables protégées sont chiffrés par Windows et ne sont jamais renvoyés à l’interface." },
  { label: "Sessions", title: "Chaque projet isolé", text: "Chaque projet a sa propre session : cookies, stockage et cache ne se mélangent jamais d’un site à l’autre." },
  { label: "Outils", title: "Outils vérifiés", text: "Les outils de développement viennent de leurs sources officielles, avec contrôle de l’empreinte quand elle est publiée." },
]

export type Persona = { photo: string; alt: string; title: string; text: string; space: SpaceId; link: string }
export const PERSONAS: Persona[] = [
  {
    photo: developpeurs,
    alt: "Un développeur au casque devant un écran rempli de code",
    title: "Développeurs et freelances",
    text: "Codez, testez sur tous les écrans et livrez à vos clients un site, une app ou un logiciel, depuis le même outil.",
    space: "dev",
    link: "Découvrir le Dev Lab",
  },
  {
    photo: agences,
    alt: "Une équipe souriante réunie autour d’un ordinateur portable",
    title: "Agences et studios",
    text: "Présentez vos maquettes en 3D et faites valider visuels et vidéos par un simple lien, sans compte pour votre client.",
    space: "studio",
    link: "Découvrir le Studio",
  },
  {
    photo: commercants,
    alt: "Une commerçante souriante, téléphone en main, derrière son étal",
    title: "Commerçants et entrepreneurs",
    text: "Votre site devient une application que vos clients installent, avec des notifications pour vos offres.",
    space: "android",
    link: "Découvrir l’App Builder",
  },
  {
    photo: etudiants,
    alt: "Un jeune homme souriant qui travaille sur un ordinateur portable",
    title: "Étudiants et formateurs",
    // #087 : le Dev Lab est dans Pro depuis le #076 (ouvert pendant le premier jour) ; le Responsive Lab reste gratuit.
    text: `Testez gratuitement vos pages dans le cadre de ${DEVICE_COUNT} modèles d’appareils et publiez vos 2 premières applications. Le Dev Lab (éditeur, terminal, Git) est ouvert tout votre premier jour.`,
    space: "preview",
    link: "Découvrir le Responsive Lab",
  },
]

export const FAQ: { q: string; a: string }[] = [
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
    q: "Sur quels ordinateurs NEXORA fonctionne-t-il ?",
    a: "Sur Windows 10 et Windows 11 en 64 bits. NEXORA Devs Toolbox est un logiciel de bureau : un petit lanceur l’installe, le vérifie et le met à jour. Une connexion à Internet est nécessaire au démarrage pour valider votre licence.",
  },
  {
    q: "Faut-il savoir coder ?",
    a: "Non. Tester un site sur des appareils, le transformer en app Android ou en logiciel Windows, créer des visuels ou une vidéo 3D se fait sans écrire de code. Le Dev Lab est là le jour où vous voulez coder.",
  },
  {
    q: "Comment fonctionne l’assistant IA ?",
    a: "Vous ajoutez votre propre clé (Claude, GPT, Gemini, Mistral…) ou vous utilisez Ollama sur votre PC. NEXORA ne limite pas le nombre de requêtes et ne facture rien pour l’IA.",
  },
  {
    q: "Puis-je publier sur le Play Store ?",
    a: "Oui, même avec l’offre Gratuite pour vos 2 applications : NEXORA construit l’application signée, prépare la fiche Play Store (textes, captures, icône), vérifie que tout est prêt, puis l’envoie. Il suit aussi le test fermé de 14 jours avec vos testeurs.",
  },
  {
    q: "Mes projets sont-ils en sécurité ?",
    a: "Vos dossiers de code restent sur votre PC, vos clés et jetons sont chiffrés par Windows, et chaque projet a sa propre session. Sans compte, tout reste sur votre ordinateur ; avec un compte, vos réglages et la fiche de vos projets se synchronisent, jamais vos dossiers de code.",
  },
  {
    q: "Comment changer d’offre ?",
    // #087 (A-056) : le paiement en ligne n'est pas encore ouvert ; l'équipe active Pro sur demande. #107 : paiement unique (SasPay).
    a: `Depuis la page Ma licence du site, ou dans NEXORA : Mon compte puis Offre et usage. Le paiement se fait en une fois, par Mobile Money ou carte bancaire, pour un mois ou un an : rien n’est prélevé automatiquement, et vous prolongez depuis Ma licence quand vous voulez. Tant que le paiement en ligne n’est pas ouvert, écrivez à ${CONTACT_EMAIL} ou depuis Mon compte → Support : l’équipe NEXORA active votre offre Pro, en général sous 24 h. Le paiement annuel vous offre deux mois.`,
  },
  {
    // #090 : NEXORA REFERRAL, remise du filleul sur chaque paiement Pro ; parrains invités par l'équipe.
    q: "J’ai le code d’un parrain : comment en profiter ?",
    a: "Ouvrez son lien de parrainage, ou saisissez son code promo sur la page Ma licence ou dans NEXORA (Mon compte → Offre et usage) avant votre premier abonnement. Vous avez 30 % de remise sur l’offre Pro à chaque paiement : 17,50 $ par mois au lieu de 25 $, ou 175 $ par an au lieu de 250 $. Un seul parrain par compte. Le programme de parrainage est ouvert sur invitation de l’équipe NEXORA.",
  },
  {
    q: "Comment se passent les mises à jour ?",
    a: "Le lanceur NEXORA Devs Toolbox télécharge chaque nouvelle version, vérifie sa signature et l’installe, puis relance NEXORA. Vos réglages, vos projets et votre compte sont gardés.",
  },
]
