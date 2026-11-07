// NEXORA #059 : nouveautés de chaque version, montrées une fois après la mise à jour (nx/version/index.js) et
// reprises dans les notes de la version publiée (scripts/release-windows.mjs). Sans navigateur : aussi lu par Node.

export const NOTES = {
  '1.2.0': {
    title: 'NEXORA 1.2.0',
    intro: 'Plus de choses gratuites, des logiciels Windows prêts à distribuer et une application plus simple à prendre en main.',
    items: [
      { icon: 'code', space: 'dev', title: 'Dev Lab gratuit', text: 'Dossiers, éditeur, terminal, Git, GitHub, VS Code et aperçu sont inclus dans l’offre Gratuite. Les outils avancés restent dans Standard.' },
      { icon: 'sparkle', space: '', title: 'Assistant IA sans limite', text: 'Avec ta propre clé (Claude, GPT, Gemini, Mistral…) ou Ollama sur ton PC : plus aucun quota de requêtes.' },
      { icon: 'display', space: 'desktop', title: 'Desktop Builder prêt pour la distribution', text: 'Aperçu sur un vrai PC Windows 11, signature dans le cloud, Microsoft Store, winget, Bac à sable et statistiques.' },
      { icon: 'android', space: 'android', title: 'App Builder prêt pour le Play Store', text: 'Contrôles avant publication et suivi du test fermé de 14 jours avec tes testeurs.' },
      { icon: 'film', space: 'studio', title: 'Studio 3D & Motion', text: 'Création par l’IA, import de modèles 3D, formats des réseaux sociaux, bruitages et validation des vidéos.' },
      { icon: 'shield', space: 'security', title: 'Sécurité et fiabilité', text: 'Supervision étendue, page de statut publique, visiteurs réels et audits du code et des applications.' },
      { icon: 'download', space: '', title: 'Mises à jour de la version portable', text: 'NEXORA télécharge la nouvelle version dans ton dossier Téléchargements et t’explique comment la remplacer.' },
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
  return [n.intro, '', ...n.items.map((i) => `- **${i.title}** : ${i.text}`), '', 'Version portable : décompresse le fichier, puis lance NEXORA.exe. Tes réglages, projets et ton compte sont gardés.'].join('\n');
}
