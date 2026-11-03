# NEXORA — espace de travail Figma Make

Ce projet contient **NEXORA**, une application de bureau pour Windows (Electron 45) créée par IPPOO, version 1.0.0, avec une interface en français. Tout le reste du dépôt (aperçu, scripts) sert à travailler sur NEXORA depuis Figma Make.

NEXORA regroupe plusieurs espaces : Accueil, Responsive Lab (sites affichés dans des cadres d'appareils réels), Browser Lab (inspection, réseau, console, tests, extraction, audit), Dev Lab (fichiers, éditeur Monaco, terminal, Git et GitHub, VS Code), App Builder (site transformé en app Android : APK, PWA, notifications push, Play Store), Studio 3D & Motion, NEX-DESIGN et Sécurité. Les comptes et la synchronisation passent par le serveur Supabase de NEXORA ; l'assistant IA utilise la clé API de l'utilisateur.

## À lire en premier (obligatoire)

Avant toute modification, lire `REGLES.md` (règles strictes, procédures, modèle d'entrée) et `SUIVI.md` (état actuel, anomalies, décisions, journal), et les appliquer à chaque demande. Chaque demande menée à bien se termine par les vérifications, des captures d'écran de l'interface montrées dans le chat (`pnpm captures … --upload`), une entrée `#NNN` dans `SUIVI.md` et une version Make `#NNN Titre`.

## Structure

- `REGLES.md` et `SUIVI.md` : règles strictes de travail et journal de suivi.
- `captures/` : captures d'écran de chaque mise à jour, par série `AAAA-MM-JJ-NNN-sujet/`.
- `nexora/app/` : code de l'application, c'est-à-dire le contenu de `app.asar`.
  - `main.js` : processus principal d'Electron (fenêtre, protocole `app://vitrine` qui sert `renderer/`, canaux IPC de base).
  - `preload.js` : pont `window.vitrine` (`invoke`, `on`) avec la liste des canaux autorisés (`INVOKE`, préfixes `PREFIXES`, événements `EVENTS`).
  - `src/` : modules du processus principal. Chaque espace déclare ses canaux préfixés dans `src/<espace>/ipc.js` (`android:`, `lab:`, `dev:`, `git:`, `tunnel:`…).
  - `renderer/` : interface. `index.html`, `styles.css`, `audit.js`, `vendor/` (Monaco, highlight.js, cadres d'appareils) et `dist/`, le code de l'interface **déjà compilé et minifié** par esbuild. Les sources d'origine de l'interface ne sont pas disponibles.
  - `android/` : modèles et coquille Java des apps Android générées.
  - `node_modules/` : dépendances embarquées dans l'application.
- `nexora/NEXORA-win32-x64/` : l'application Windows complète (`NEXORA.exe`, Electron 45, `resources/app.asar`).
- `nexora/NEXORA-portable.zip` : la version portable distribuée, c'est-à-dire ce dossier compressé.
- `preview/` : aperçu navigateur. `bridge.js` remplace `preload.js` ; `server.mjs` sert l'interface (plugin Vite, utilisé aussi par la publication).
- `scripts/` : `build-web.mjs` (publication web), `pack-windows.mjs` (reconstruction de l'application Windows) et `captures.mjs` (captures d'écran).
- `vite.config.ts`, `package.json`, `.mise.toml` (Node 22, pnpm) et `.figma/make/` : environnement Figma Make.

## Repères dans l'interface

Fichiers de `nexora/app/renderer/dist/chunks/` par espace : Accueil `home-*.js` ; Responsive Lab `../main.js` et `chunk-EZKHFSAB.js` (vue appareil, `<webview>`) ; Browser Lab `browserlab-*.js` et les panneaux `*-panel-*.js` ; Dev Lab `devlab-*.js` ; App Builder `android-*.js` ; Studio 3D & Motion `studio-*.js` (avec `three-*`, `mockup-*`, `poses-*`) ; NEX-DESIGN `design-*.js` ; Sécurité `security-*.js`. Assistant « Nouveau » `newwizard-*.js`, visite guidée `tour-*.js`, préparation des outils `setup-*.js`, assistant IA `ai-*.js`.

## Aperçu Figma Make

Le serveur Vite tourne déjà (`pnpm dev`, géré par Figma Make) : ne pas le lancer soi-même.

- Il sert `nexora/app/renderer/` tel quel à la racine `/`, comme `app://vitrine/` dans Electron, et ajoute `preview/bridge.js` à la page. Les fichiers de NEXORA ne sont pas modifiés.
- `bridge.js` imite `window.vitrine` comme sur un PC neuf : réglages gardés dans le `localStorage`, rien d'installé, aucun projet ouvert. Les fenêtres de sélection système répondent « annulé » avec une notification ; les autres fonctions de bureau échouent avec « Disponible uniquement dans l'application NEXORA pour Windows. ».
- La page se recharge seule quand `nexora/app/renderer/`, `nexora/app/android/templates/`, `nexora/app/src/dev/ipc.js` ou `preview/bridge.js` changent. Le processus principal (`main.js`, `src/`) ne tourne pas dans l'aperçu.
- Les réponses du pont tirées des sources de NEXORA (icônes d'onglets Android, modèles de projet du Dev Lab) sont calculées par `PREVIEW_DATA` dans `preview/server.mjs`.
- Les balises `<webview>` (sites affichés dans les appareils) restent vides dans un navigateur. Les appels Supabase partent vers le vrai serveur de NEXORA.
- Quand un canal IPC est appelé au démarrage ou à l'ouverture d'un espace, ajouter dans `bridge.js` une réponse de même forme que celle du processus principal sur un PC neuf. Un nouveau canal qui ouvre une boîte de dialogue système va dans `DIALOG_CHANNELS`.

## Commandes

- `pnpm check` : vérifie la syntaxe du processus principal (`main.js`, `preload.js`, `src/`, `renderer/audit.js`) et la présence des fichiers indispensables. À lancer après toute modification de ce code.
- `pnpm pack:windows` : reconstruit `nexora/NEXORA-win32-x64/resources/app.asar` à partir de `nexora/app`, puis `nexora/NEXORA-portable.zip`. À lancer **seulement quand l'utilisateur veut tester sur Windows** : chaque reconstruction ajoute environ 220 Mo aux versions. `--out <dossier>` écrit ailleurs (essais), `--no-zip` ne refait que l'archive. Sans modification des sources, le résultat est identique octet pour octet à l'original ; `NEXORA.exe` ne vérifie pas l'intégrité d'`app.asar`.
- `pnpm build` : version web de l'interface dans `dist/`, publiée par `.figma/make/deploy`.
- `pnpm captures [écrans…] --label NNN-sujet [--upload]` : captures d'écran de l'aperçu avec le Chromium du système, rangées dans `captures/` ; relève aussi les erreurs de la page. Écrans : `accueil`, `responsive`, `browser`, `dev`, `apps`, `studio`, `design`, `securite`, `premier-lancement`, `tout` (défaut : les 8 espaces). Options : `--theme sombre`, `--click "Texte du bouton"` (un seul espace ; pour un bouton à icône seule, son infobulle), `--taille 1440x900`, `--url`.
- `pnpm format` : formate uniquement l'outillage (`vite.config.ts`, `preview/`, `scripts/`).

## Règles de travail

- Ne jamais reformater les fichiers de `nexora/` : garder le style de l'auteur (guillemets simples, points-virgules, commentaires et messages en français). `.figma/make/format` ignore ce dossier.
- Textes de l'interface en français, avec le tutoiement employé partout dans NEXORA.
- Nouveau canal IPC : l'enregistrer dans le processus principal (`main.js` ou `src/<espace>/ipc.js`) et vérifier que `preload.js` l'autorise (nom dans `INVOKE` ou préfixe dans `PREFIXES`, événements dans `EVENTS`).
- `renderer/index.html` impose une politique de sécurité stricte (CSP) : toute nouvelle ressource externe doit y être autorisée.
- Thèmes : tout bloc d'interface suit le thème (blanc en clair, noir en sombre). Le thème clair du rail et du Studio est dans la section « Thème clair : rail et Studio (NEXORA #004) » de `renderer/styles.css`, limitée à `html[data-theme='light']`.
- Lisibilité (#007) : un bloc qui porte une information n'est jamais translucide avec la transparence « Normale » ; utiliser `--info-bg`, `--info-bg-hover`, `--info-edge` et `--text-3` (contraste AA), définis dans la dernière section de `renderer/styles.css` (« Lisibilité des blocs d'information (NEXORA #007) »).
- Créer sans conflit (#005) : toute création (projet NEXORA, planche, scène, présentation, application, projet de code, document, site surveillé) reçoit un nom libre et ne remplace jamais un élément existant ; réutiliser les fonctions `nx…` déjà en place (détail dans `SUIVI.md`, « Décisions et méthodes »).
- `renderer/dist/` est minifié, avec des noms de fichiers à empreinte (`chunk-XXXX.js`) : y faire des modifications ciblées et les vérifier dans l'aperçu.
- Les fichiers lourds (`.zip`, `.exe`, `.dll`, images, polices…) sont stockés avec Git LFS (`.gitattributes`). `.gitignore` inclut tout `nexora/`, y compris ses dossiers `dist/`, `build/` et `node_modules/`.
- Dans `preview/bridge.js`, ne pas commencer une fonction par `"use strict"` : oxfmt 0.2 déplacerait alors les commentaires.
