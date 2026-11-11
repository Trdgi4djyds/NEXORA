// NEXORA #059 : nouveautés de chaque version, montrées une fois après la mise à jour (nx/version/index.js) et
// reprises dans les notes de la version publiée (scripts/release-windows.mjs). Sans navigateur : aussi lu par Node.

export const NOTES = {
  // NEXORA #106 : interface « Horizon » (#103), appareils réalistes du Studio (#100), formulaires et connexion (#104),
  // lanceur 1.0.5 ; publiée par-dessus la 1.2.1 (A-063).
  '1.2.2': {
    title: 'NEXORA 1.2.2',
    intro: 'Une interface entièrement redessinée, plus sobre, et des appareils réalistes dans le Studio.',
    items: [
      { icon: 'palette', space: '', title: 'Nouvelle interface', text: 'Noir et gris très sombre, ou blanc et gris clair, sans couleurs superflues ; police plus fine, boutons et champs arrondis. Ta couleur d’accent, le contraste élevé et ta police restent respectés.' },
      { icon: 'laptop', space: 'studio', title: 'Appareils réalistes dans le Studio', text: '10 modèles détaillés à taille réelle (ordinateurs portables, écran, tablettes, téléphones) : l’écran affiche ta scène, ton image ou une page NEX-DESIGN.' },
      { icon: 'pen', space: '', title: 'Formulaires plus lisibles', text: 'Champs, cases à cocher et messages d’erreur revus partout ; fenêtre de connexion redessinée.' },
      { icon: 'key', space: '', title: 'Lanceur 1.0.5', text: 'Le lanceur NEXORA Devs Toolbox prend la même apparence et se met à jour tout seul avant d’installer cette version.' },
    ],
  },
  // NEXORA #106 : note de la 1.2.1, publiée depuis une autre session (A-063), reprise telle quelle du paquet publié.
  // NEXORA #097 : adresse définitive (l'adresse workers.dev d'origine est désactivée dans Cloudflare), lanceur 1.0.4.
  '1.2.1': {
    title: 'NEXORA 1.2.1',
    intro: 'NEXORA passe à son adresse définitive : nexoradevs.online.',
    items: [
      { icon: 'globe', space: '', title: 'Nouvelle adresse', text: 'Licence, sécurité, site et NEXORA web passent par nexoradevs.online ; NEXORA web est à nexoradevs.online/studio.' },
      { icon: 'key', space: '', title: 'Lanceur 1.0.4', text: 'Le lanceur NEXORA Devs Toolbox se met à jour seul et vérifie chaque démarrage auprès de la nouvelle adresse.' },
    ],
  },
  // NEXORA #087 : note réécrite sans changer de numéro (Dev Lab dans Pro depuis le #076, mises à jour par le lanceur
  // NEXORA Devs Toolbox, offre Gratuite à 2 applications, Pro à 18 $). NEXORA #090 : Pro à 25 $, remise du parrainage.
  '1.2.0': {
    title: 'NEXORA 1.2.0',
    intro: 'NEXORA Devs Toolbox : une licence gratuite, 2 applications offertes et une installation vérifiée à chaque démarrage.',
    items: [
      { icon: 'key', space: '', title: 'NEXORA Devs Toolbox', text: 'Le lanceur installe NEXORA, vérifie la signature de chaque fichier et le met à jour tout seul. Ta licence gratuite est liée à ton compte.' },
      { icon: 'android', space: 'android', title: '2 applications gratuites', text: 'Avec l’offre Gratuite : 2 applications au total, Android ou Windows, avec tout l’App Builder et le Desktop Builder, et 5 constructions par application et par mois.' },
      { icon: 'star', space: '', title: 'Pro à 25 $ par mois', text: 'Dev Lab complet, jusqu’à 50 applications, Studio et NEX-DESIGN complets ; 250 $ par an. 30 % de remise sur chaque paiement avec le lien ou le code promo d’un parrain : 17,50 $ par mois. Ton premier jour est un essai complet de Pro.' },
      { icon: 'sparkle', space: '', title: 'Assistant IA sans limite', text: 'Avec ta propre clé (Claude, GPT, Gemini, Mistral…) ou Ollama sur ton PC : aucun quota de requêtes.' },
      { icon: 'display', space: 'desktop', title: 'Desktop Builder prêt pour la distribution', text: 'Aperçu sur un vrai PC Windows 11, signature dans le cloud, Microsoft Store, winget, Bac à sable et statistiques.' },
      { icon: 'android', space: 'android', title: 'App Builder prêt pour le Play Store', text: 'Contrôles avant publication et suivi du test fermé de 14 jours avec tes testeurs.' },
      { icon: 'film', space: 'studio', title: 'Studio 3D & Motion', text: 'Création par l’IA, import de modèles 3D, formats des réseaux sociaux, bruitages et validation des vidéos.' },
      { icon: 'shield', space: 'security', title: 'Sécurité et fiabilité', text: 'Supervision étendue, page de statut publique, visiteurs réels et audits du code et des applications.' },
    ],
  },
};

// Dépôt GitHub (« propriétaire/nom ») d'une adresse de téléchargement publiée sur GitHub, sinon ''.
export function repoFromUrl(url) {
  const m = /^https:\/\/github\.com\/([A-Za-z0-9_.-]{1,100})\/([A-Za-z0-9_.-]{1,100})(?:[/?#]|$)/.exec(String(url || '').trim());
  if (!m) return '';
  const repo = m[2].replace(/\.git$/i, '');
  return repo ? `${m[1]}/${repo}` : '';
}

// Notes de la version publiée sur GitHub (texte Markdown).
export function releaseNotes(version) {
  const n = NOTES[version];
  if (!n) return `NEXORA ${version}`;
  // NEXORA #087 : installation et mises à jour par le lanceur NEXORA Devs Toolbox (plus de version portable à décompresser).
  return [n.intro, '', ...n.items.map((i) => `- **${i.title}** : ${i.text}`), '', 'Installation : télécharge NEXORA-Devs-Toolbox.exe puis lance-le. Il vérifie la signature et chaque fichier, installe NEXORA sans droits d’administrateur et le tient à jour. Tes réglages, projets et ton compte sont gardés.'].join('\n');
}
