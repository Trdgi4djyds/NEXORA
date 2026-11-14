// NEXORA #059 : nouveautés de chaque version, montrées une fois après la mise à jour (nx/version/index.js) et
// reprises dans les notes de la version publiée (scripts/release-windows.mjs). Sans navigateur : aussi lu par Node.

export const NOTES = {
  // NEXORA #106 : interface « Horizon » (#103), appareils réalistes du Studio (#100), formulaires et connexion (#104),
  // lanceur 1.0.5 ; publiée par-dessus la 1.2.1 (A-063).
  // NEXORA #107 : pourcentage de l'interface sans effet sur les sites ni les maquettes (republiée en v1.2.2-r2).
  // NEXORA #112 : « Passer à Pro » de Mon compte ouvre le paiement en ligne (republiée en v1.2.2-r3).
  // NEXORA #113 : Motion et fonctions reprises de desigma dans NEX-DESIGN (republiée en v1.2.2-r4).
  // NEXORA #114 : défilement des appareils rétabli, icône Android, mises à jour sans dépôt à saisir (republiée en v1.2.2-r5).
  // NEXORA #115 : logo et écran de démarrage, modules OneSignal, AdMob, Analytics et Meta, vouvoiement, iPhone Duo officiel
  // avec animation de pliage, Réglages sans détail interne (republiée en v1.2.2-r6).
  // NEXORA #116 : sens du pliage corrigé (moitié gauche sur la droite), Galaxy S24 à part, caméra frontale visible sans
  // site ouvert (republiée en v1.2.2-r7).
  // NEXORA #118 : modèles « photo » de NEX-DESIGN, mises en scène réalistes et contour de sélection du Studio
  // (republiée en v1.2.2-r8). #119 : fenêtre de connexion en mosaïque, « Chargement », lanceur 1.0.7 (v1.2.2-r9).
  // #120 : projets Laravel dans l'App Builder, compte mieux protégé, éditeurs plus rapides, Studio plus léger (v1.2.2-r10 ;
  // appareils connectés sans nom répété, v1.2.2-r11).
  '1.2.2': {
    title: 'NEXORA 1.2.2',
    intro: 'Une interface entièrement redessinée, plus sobre, et des appareils réalistes dans le Studio.',
    items: [
      { icon: 'palette', space: '', title: 'Nouvelle interface', text: 'Noir et gris très sombre, ou blanc et gris clair, sans couleurs superflues ; police plus fine, boutons et champs arrondis. Votre couleur d’accent, le contraste élevé et votre police restent respectés.' },
      { icon: 'laptop', space: 'studio', title: 'Appareils réalistes dans le Studio', text: '10 modèles détaillés à taille réelle (ordinateurs portables, écran, tablettes, téléphones) : l’écran affiche votre scène, votre image ou une page NEX-DESIGN.' },
      { icon: 'pen', space: '', title: 'Formulaires plus lisibles', text: 'Champs, cases à cocher et messages d’erreur revus partout ; fenêtre de connexion redessinée.' },
      { icon: 'display', space: 'responsive', title: 'Taille de l’interface sans effet sur les sites', text: 'Changer le pourcentage de l’interface dans les Réglages ne rogne plus les sites dans les appareils et ne change plus les maquettes ; un appareil à 100 % garde sa taille réelle, et chaque appareil reste émulé quand vous changez de projet.' },
      { icon: 'nxAnimate', space: 'design', title: 'Animation dans NEX-DESIGN', text: 'Frise sous la page avec images clés, courbes et ressorts, 41 animations toutes faites, Smart Animate et animation dans le prototype, code CSS, SwiftUI et Compose ; aussi : couleurs de la sélection, coins lissés, pense-bêtes et connecteurs, notes de présentation.' },
      { icon: 'star', space: '', title: 'Passer à Pro depuis NEXORA', text: 'Dans Mon compte → Offre et usage, « Passer à Pro » ouvre maintenant le paiement en ligne (Mobile Money ou carte bancaire) sur la page « Ma licence », au lieu d’envoyer une demande à l’équipe.' },
      { icon: 'display', space: 'responsive', title: 'Défilement des appareils rétabli', text: 'Barres de défilement à côté des appareils du Responsive Lab, glissement à la souris sur les téléphones et tablettes (avec élan), barres fines dans l’aperçu de l’App Builder ; défilement, clics, saisies et navigation de nouveau synchronisés entre appareils.' },
      { icon: 'android', space: 'android', title: 'Nouvelle icône de l’App Builder', text: 'L’App Builder prend la tête du robot Android ; dans Maintenance et sauvegarde, NEXORA vérifie ses mises à jour sans dépôt à indiquer.' },
      { icon: 'sparkle', space: 'android', title: 'Créateur de logo et d’écran de démarrage', text: 'Dans l’App Builder, composez le logo de votre application (initiales, symbole, police, couleurs, idées tirées de son nom) : il devient son icône à toutes les tailles. Composez aussi son écran de démarrage (modèles, dégradé, aurore, motif ou photo, animation).' },
      { icon: 'nxComponent', space: 'android', title: 'Modules OneSignal, AdMob, Google Analytics et Meta', text: 'Ajoutez à votre application les notifications OneSignal, les publicités AdMob (bannière, interstitiel, vidéo avec récompense, consentement), la mesure d’audience Google Analytics et les événements Meta, avec leurs SDK officiels, pilotés depuis votre page.' },
      { icon: 'fold', space: 'responsive', title: 'iPhone Duo officiel', text: 'Coloris officiels d’Apple (Ciel nocturne, Blanc stellaire) et animation de pliage : comme sur le vrai appareil, la moitié gauche se replie sur la droite quand vous passez de « Ouvert » à « Fermé » (même sens pour les autres pliables).' },
      { icon: 'image', space: 'design', title: 'Modèles photo dans NEX-DESIGN', text: 'Sept nouveaux modèles d’après des planches de marque et des mises en scène de studio : planche de marque, mosaïque d’appli, cartes de services, affiche sur façade, lancement produit, tableau de bord en contre-plongée et appli sur tablette. Photos remplaçables, appareils réalistes en 3D dont vous changez l’écran, une couleur d’accent tirée de votre kit de marque.' },
      { icon: 'laptop', space: 'studio', title: 'Mises en scène réalistes et contour de sélection', text: 'Dans le Studio, « Ordinateur entre les roches », « Ordinateur vu de dessous », « Téléphones en diagonale » et « Tablette inclinée » posent en un clic les appareils réalistes, le fond, la lumière et le cadrage. L’objet sélectionné est entouré d’un contour orange (jamais dans les rendus).' },
      { icon: 'phone', space: 'responsive', title: 'Galaxy S24 fidèle', text: 'Le Galaxy S24 a son propre modèle, avec les dimensions et les coloris officiels de Samsung. La caméra frontale et l’île des iPhone restent visibles quand aucun site n’est ouvert.' },
      { icon: 'user', space: '', title: 'NEXORA vous vouvoie', text: 'Toute l’interface, les e-mails et les messages s’adressent désormais à vous en vous vouvoyant. Les Réglages ne montrent plus de détail technique propre à NEXORA.' },
      { icon: 'user', space: '', title: 'Nouvelle fenêtre de connexion', text: 'La connexion et l’inscription s’ouvrent sur une mosaïque de vrais visuels créés dans NEX-DESIGN et le Studio 3D, qui défile doucement. À l’ouverture, NEXORA affiche simplement « Chargement ».' },
      { icon: 'android', space: 'android', title: 'Projets Laravel dans l’App Builder', text: 'Un projet Laravel (avec Inertia et Vue ou React), Symfony ou PHP est reconnu : l’APK s’ouvre sur l’adresse de votre site en ligne, ou sur un serveur de test que NEXORA lance sur ce PC (php artisan serve, fichiers construits par Vite) pour l’essayer sur un téléphone connecté au même Wi-Fi.' },
      { icon: 'lock', space: '', title: 'Compte mieux protégé', text: 'Changer de mot de passe ou d’adresse e-mail demande votre mot de passe actuel ; un mot de passe trop simple ou trop courant est refusé, à l’inscription comme dans Mon compte. Le fuseau horaire se choisit dans une liste.' },
      { icon: 'code', space: 'dev', title: 'Éditeurs de code plus rapides', text: 'L’éditeur du Dev Lab est prêt avant l’ouverture du premier fichier. Code Editor démarre à l’avance, garde sa version et son cache d’une ouverture à l’autre et s’ouvre sur une zone vide, sans filigrane.' },
      { icon: 'cube', space: 'studio', title: 'NEXORA plus léger', text: 'Le Studio ne redessine plus sa scène quand rien ne bouge et ne tourne plus en arrière-plan une fois quitté : moins de processeur et de batterie dans tous les espaces.' },
      { icon: 'key', space: '', title: 'Lanceur 1.0.7', text: 'Le lanceur NEXORA Devs Toolbox prend la même apparence, vous vouvoie, affiche « Chargement… » à l’ouverture et se met à jour tout seul avant d’installer cette version.' },
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
      { icon: 'key', space: '', title: 'NEXORA Devs Toolbox', text: 'Le lanceur installe NEXORA, vérifie la signature de chaque fichier et le met à jour tout seul. Votre licence gratuite est liée à votre compte.' },
      { icon: 'android', space: 'android', title: '2 applications gratuites', text: 'Avec l’offre Gratuite : 2 applications au total, Android ou Windows, avec tout l’App Builder et le Desktop Builder, et 5 constructions par application et par mois.' },
      { icon: 'star', space: '', title: 'Pro à 25 $ par mois', text: 'Dev Lab complet, jusqu’à 50 applications, Studio et NEX-DESIGN complets ; 250 $ par an. 30 % de remise sur chaque paiement avec le lien ou le code promo d’un parrain : 17,50 $ par mois. Votre premier jour est un essai complet de Pro.' },
      { icon: 'sparkle', space: '', title: 'Assistant IA sans limite', text: 'Avec votre propre clé (Claude, GPT, Gemini, Mistral…) ou Ollama sur votre PC : aucun quota de requêtes.' },
      { icon: 'display', space: 'desktop', title: 'Desktop Builder prêt pour la distribution', text: 'Aperçu sur un vrai PC Windows 11, signature dans le cloud, Microsoft Store, winget, Bac à sable et statistiques.' },
      { icon: 'android', space: 'android', title: 'App Builder prêt pour le Play Store', text: 'Contrôles avant publication et suivi du test fermé de 14 jours avec vos testeurs.' },
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
  return [n.intro, '', ...n.items.map((i) => `- **${i.title}** : ${i.text}`), '', 'Installation : téléchargez NEXORA-Devs-Toolbox.exe puis lancez-le. Il vérifie la signature et chaque fichier, installe NEXORA sans droits d’administrateur et le tient à jour. Vos réglages, projets et votre compte sont gardés.'].join('\n');
}
