# {{NAME}}

Logiciel de bureau créé avec NEXORA (Desktop Builder) à partir {{SOURCE}}.

- Version : {{VERSION}}
- Identifiant : `{{APP_ID}}` (ne le change pas : il sert aux mises à jour, aux raccourcis et aux notifications de Windows)
- Moteur : Electron {{ELECTRON}}, construit avec electron-builder {{BUILDER}}

## Contenu du dossier

- `app/` : le logiciel lui-même. `main.js` (processus principal), `config.json` (réglages choisis dans NEXORA), `pages/` (pages hors connexion et d'erreur), `assets/` (icônes){{WEB_LINE}}.
- `build/` : icône de l'exécutable (`icon.ico`), icône en haute définition (`icon.png`) et image de l'installateur.
- `electron-builder.json` : réglages de construction (installateur, version portable, verrouillage de l'exécutable).
{{CI_LINE}}
## Construire à la main

1. Installe Node.js (version LTS) : https://nodejs.org
2. Dans ce dossier : `npm install`, puis `npm run build`.
3. Les fichiers d'installation sont écrits dans `dist/`.

Pour tester sans construire : `npm start`.

## Bonnes pratiques appliquées

- Pages en bac à sable, isolation du contexte, aucune API Node.js dans les pages, aucun script de préchargement.
- Navigation et nouvelles fenêtres limitées aux domaines de l'application ; les autres liens s'ouvrent dans le navigateur.
- Autorisations (caméra, micro, notifications…) contrôlées et refusées aux sites tiers ; balises `<webview>` refusées.
- Fichiers locaux servis par un protocole privé (`app://`) au lieu de `file://`.
- Exécutable verrouillé (fusibles Electron : pas de mode Node.js, pas d'options d'inspection, archive vérifiée au démarrage).
- Instance unique, fenêtre mémorisée, page hors connexion avec reconnexion automatique, reprise après plantage.
- Installation pour l'utilisateur sans droits d'administrateur (par défaut), désinstallation propre depuis les paramètres de Windows.

> NEXORA régénère ce dossier à chaque construction : copie-le ailleurs avant de le modifier à la main.
