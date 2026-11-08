// Textes des sections du site (tutoiement, comme dans NEXORA ; aucun nom de prestataire ni détail technique).
import developpeurs from "../assets/photos/developpeurs.webp"
import agences from "../assets/photos/agences.webp"
import commercants from "../assets/photos/commercants.webp"
import etudiants from "../assets/photos/etudiants.webp"
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
    verb: "Conçois",
    title: "Dessine tes écrans",
    text: "Mise en page automatique, variables et composants pour tes maquettes ; un prototype cliquable pour convaincre, puis le code exporté pour ton projet.",
    points: ["Prototype cliquable", "Export HTML, CSS ou React", "Validation client par lien"],
  },
  {
    space: "dev",
    verb: "Code",
    title: "Écris et lance ton projet",
    text: "Ouvre ton dossier ou pars d’un modèle. NEXORA installe les outils qui manquent, lance le serveur et met l’aperçu à jour à chaque enregistrement.",
    points: ["Terminal intégré", "Git et dépôt distant", "15 outils installés pour toi"],
  },
  {
    space: "preview",
    verb: "Teste",
    title: "Vérifie sur tous les écrans",
    text: `Affiche ton site dans le cadre de ${DEVICE_COUNT} modèles d’appareils, côte à côte, puis passe au Browser Lab pour le réseau, la console et les audits.`,
    points: [`${DEVICE_COUNT} modèles d’appareils`, "Pliables et rotation", "Audits de performance"],
  },
  {
    space: "security",
    verb: "Sécurise",
    title: "Audite et surveille",
    text: "Audite le site, le domaine et le code, puis surveille la disponibilité 24 h/24, même NEXORA fermée. Tes visiteurs suivent l’état sur ta page de statut.",
    points: ["Note de fiabilité", "Supervision 24 h/24", "Page de statut publique"],
  },
  {
    space: "android",
    verb: "Publie",
    title: "Emballe ton site en app Android",
    text: "Icône, écran de démarrage, notifications push, application signée, fiche Play Store et test fermé : tout est préparé et vérifié avant l’envoi.",
    points: ["APK et AAB signés", "Notifications push", "Prêt pour le Play Store"],
  },
  {
    space: "desktop",
    verb: "Distribue",
    title: "Livre un logiciel Windows",
    text: "Installateur, version portable ou paquet pour le Microsoft Store, avec signature et mises à jour automatiques. Essaie-le d’abord sur un PC Windows 11 simulé.",
    points: ["Installateur et MSI", "Mises à jour automatiques", "Microsoft Store et winget"],
  },
  {
    space: "studio",
    verb: "Présente",
    title: "Mets ton lancement en scène",
    text: "Place ton app dans un appareil 3D, anime la caméra et exporte la vidéo au bon format pour chaque réseau social.",
    points: ["Appareils 3D réalistes", "Mouvements de caméra", "Vidéos 9:16, 1:1, 16:9"],
  },
]

export const AI_PROVIDERS = ["Claude", "GPT", "Gemini", "Mistral", "Ollama"]
export const AI_USES: { space: SpaceId; title: string; text: string }[] = [
  { space: "dev", title: "Dev Lab", text: "Propose des changements sur tout le projet, que tu acceptes fichier par fichier." },
  { space: "design", title: "NEX-DESIGN", text: "Crée une maquette à partir d’une simple description." },
  { space: "studio", title: "Studio 3D & Motion", text: "Compose une mise en scène et un mouvement de caméra." },
  { space: "android", title: "App Builder", text: "Rédige ta fiche Play Store et explique les plantages." },
]

// Fiche « Confiance » (#069 : libellés de fiche technique au lieu d'icônes).
export const TRUST: { label: string; title: string; text: string }[] = [
  // #072 : la synchronisation porte sur les réglages et la fiche des projets, jamais sur les dossiers de code.
  { label: "Fichiers", title: "Tes fichiers restent sur ton PC", text: "Tes dossiers de code ne quittent pas ton ordinateur. Avec un compte, seuls tes réglages et la fiche de tes projets se synchronisent entre tes appareils." },
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
    text: "Code, teste sur tous les écrans et livre à tes clients un site, une app ou un logiciel, depuis le même outil.",
    space: "dev",
    link: "Découvrir le Dev Lab",
  },
  {
    photo: agences,
    alt: "Une équipe souriante réunie autour d’un ordinateur portable",
    title: "Agences et studios",
    text: "Présente tes maquettes en 3D et fais valider visuels et vidéos par un simple lien, sans compte pour ton client.",
    space: "studio",
    link: "Découvrir le Studio",
  },
  {
    photo: commercants,
    alt: "Une commerçante souriante, téléphone en main, derrière son étal",
    title: "Commerçants et entrepreneurs",
    text: "Ton site devient une application que tes clients installent, avec des notifications pour tes offres.",
    space: "android",
    link: "Découvrir l’App Builder",
  },
  {
    photo: etudiants,
    alt: "Un jeune homme souriant qui travaille sur un ordinateur portable",
    title: "Étudiants et formateurs",
    text: `Apprends avec un vrai éditeur, un terminal et Git, gratuitement, et teste tes pages dans le cadre de ${DEVICE_COUNT} modèles d’appareils.`,
    space: "preview",
    link: "Découvrir le Responsive Lab",
  },
]

export const FAQ: { q: string; a: string }[] = [
  {
    q: "NEXORA est-il gratuit ?",
    a: "Oui. L’offre Gratuite n’a pas de limite de durée : Dev Lab de base, Responsive Lab, Browser Lab, NEX-DESIGN (3 documents), audits de sécurité, deux applications en essai de 7 jours et l’assistant IA avec ta propre clé. Standard et Pro débloquent la publication et les outils avancés.",
  },
  {
    q: "Sur quels ordinateurs NEXORA fonctionne-t-il ?",
    a: "Sur Windows 10 et Windows 11 en 64 bits. NEXORA web te permet aussi de retrouver ton compte, tes projets synchronisés et une partie des espaces depuis un navigateur.",
  },
  {
    q: "Faut-il savoir coder ?",
    a: "Non. Tester un site sur des appareils, le transformer en app Android ou en logiciel Windows, créer des visuels ou une vidéo 3D se fait sans écrire de code. Le Dev Lab est là le jour où tu veux coder.",
  },
  {
    q: "Comment fonctionne l’assistant IA ?",
    a: "Tu ajoutes ta propre clé (Claude, GPT, Gemini, Mistral…) ou tu utilises Ollama sur ton PC. NEXORA ne limite pas le nombre de requêtes et ne facture rien pour l’IA.",
  },
  {
    q: "Puis-je publier sur le Play Store ?",
    a: "Oui, avec Standard ou Pro : NEXORA construit l’application signée, prépare la fiche Play Store (textes, captures, icône), vérifie que tout est prêt, puis l’envoie. Il suit aussi le test fermé de 14 jours avec tes testeurs.",
  },
  {
    q: "Mes projets sont-ils en sécurité ?",
    a: "Tes dossiers de code restent sur ton PC, tes clés et jetons sont chiffrés par Windows, et chaque projet a sa propre session. Sans compte, tout reste sur ton ordinateur ; avec un compte, tes réglages et la fiche de tes projets se synchronisent, jamais tes dossiers de code.",
  },
  {
    q: "Comment changer d’offre ?",
    a: "Depuis NEXORA, dans Mon compte puis Offre et usage. Ta demande est traitée par l’équipe NEXORA et ta nouvelle offre est activée sous 24 heures. Le paiement annuel t’offre deux mois.",
  },
  {
    q: "Comment se passent les mises à jour ?",
    a: "NEXORA te prévient quand une nouvelle version sort, la télécharge et t’explique comment la remplacer. Tes réglages, tes projets et ton compte sont gardés.",
  },
]
