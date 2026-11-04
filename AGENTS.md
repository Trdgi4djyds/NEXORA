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
- `admin/` : **back office web** d'administration de NEXORA (React 19, TypeScript, `@supabase/supabase-js`), servi par Vite sous `/admin/` et publié dans `dist/admin/`. Connexion avec un compte NEXORA dont `profiles.app_role` vaut `admin` ou `superadmin` ; même projet Supabase et même clé publique (anon) que l'application, jamais la clé de service. `src/App.tsx` (navigation, routes `#/section/paramètre`), `src/sections/` (une section par fichier), `src/ui.tsx` (composants), `src/database.types.ts` (types générés, `pnpm supabase types`). Les icônes viennent du module de NEXORA (`renderer/dist/chunks/chunk-S4I2LXHS.js`).
- `supabase/` : configuration attendue du projet Supabase (`nexora.json` : adresses de redirection, tables temps réel, fonctions, compartiments) et migrations SQL idempotentes (`migrations/`), appliquées depuis la section « Supabase » du back office ou par `pnpm supabase migrer`.
- `preview/` : aperçu navigateur. `bridge.js` remplace `preload.js` ; `server.mjs` sert l'interface (plugin Vite, utilisé aussi par la publication).
- `scripts/` : `build-web.mjs` (publication web, back office compris), `pack-windows.mjs` (reconstruction de l'application Windows), `captures.mjs` et `captures-admin.mjs` (captures d'écran), `admin-demo.mjs` (données fictives des captures du back office), `supabase.mjs` (configuration Supabase), `github-push.mjs` (envoi sur GitHub) et `local-secrets.mjs` (jetons).
- `wrangler.jsonc` : publication sur Cloudflare Workers (Workers Builds relié au dépôt GitHub). Site statique sans script : `wrangler deploy` lance `pnpm run build` (champ `build.command`) puis publie `dist/`. Sans ce fichier, Wrangler se configure tout seul comme une app Vite standard et le déploiement échoue (`assets` sans `directory`).
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
- Le back office est à `/admin/` de l'aperçu ; ton navigateur atteint le vrai Supabase (connexion, lectures, écritures). Dans le bac à sable de l'agent, seules les lectures passent.
- Quand un canal IPC est appelé au démarrage ou à l'ouverture d'un espace, ajouter dans `bridge.js` une réponse de même forme que celle du processus principal sur un PC neuf. Un nouveau canal qui ouvre une boîte de dialogue système va dans `DIALOG_CHANNELS`.

## Commandes

- `pnpm check` : vérifie la syntaxe du processus principal (`main.js`, `preload.js`, `src/`, `renderer/audit.js`) et la présence des fichiers indispensables. À lancer après toute modification de ce code.
- `pnpm pack:windows` : reconstruit `nexora/NEXORA-win32-x64/resources/app.asar` à partir de `nexora/app`, puis `nexora/NEXORA-portable.zip`. À lancer **seulement quand l'utilisateur veut tester sur Windows** : chaque reconstruction ajoute environ 220 Mo aux versions. `--out <dossier>` écrit ailleurs (essais), `--no-zip` ne refait que l'archive. Sans modification des sources, le résultat est identique octet pour octet à l'original ; `NEXORA.exe` ne vérifie pas l'intégrité d'`app.asar`.
- `pnpm build` : version web de l'interface dans `dist/`, publiée par `.figma/make/deploy`.
- `pnpm captures [écrans…] --label NNN-sujet [--upload]` : captures d'écran de l'aperçu avec le Chromium du système, rangées dans `captures/` ; relève aussi les erreurs de la page. Écrans : `accueil`, `responsive`, `browser`, `dev`, `apps`, `studio`, `design`, `securite`, `premier-lancement`, `tout` (défaut : les 8 espaces). Options : `--theme sombre`, `--click "Texte du bouton"` (un seul espace ; pour un bouton à icône seule, son infobulle), `--taille 1440x900`, `--url`.
- `pnpm captures:admin [écrans…] --label NNN-sujet [--theme sombre] [--upload]` : captures du back office (`/admin/`). Le bac à sable bloque les écritures vers Supabase, connexion comprise : les appels Supabase y reçoivent par défaut les données fictives de `scripts/admin-demo.mjs` (`--donnees reelles` pour l'écran de connexion seul). Écrans : `connexion`, `vue`, `utilisateurs`, `utilisateur`, `equipes`, `equipe`, `appareils`, `invitations`, `contenus`, `fichiers`, `supervision`, `site`, `audits`, `audit-site`, `support`, `ticket`, `annonces`, `offres`, `fonctionnalites`, `configuration`, `journal`, `supabase`.
- `pnpm supabase types|verifier|auth|migrer` : API de gestion de Supabase. Ici, seules les lectures passent (`types`, `verifier`) ; `auth` et `migrer` se font depuis le back office (section « Supabase ») ou un terminal ordinaire.
- `pnpm github:push [--essai]` : envoie l'état de l'espace de travail sur `github.com/Trdgi4djyds/NEXORA` (branche `main`, dépôt privé) dans un commit au-dessus de la branche GitHub, sans l'historique de Figma Make et **sans** `token proj nexora.txt` ni `.env*` ; fichiers lourds par Git LFS. À relancer après chaque version Make à publier.
- Cloudflare : chaque `pnpm github:push` déclenche un déploiement par Workers Builds (`npx wrangler deploy`). Wrangler n'est pas une dépendance du projet (trop lourd) ; pour vérifier `wrangler.jsonc`, l'installer hors du dépôt (par exemple dans `/tmp`) et lancer `wrangler deploy --dry-run` ou `wrangler dev` depuis la racine.
- `pnpm format` : formate uniquement l'outillage (`vite.config.ts`, `preview/`, `scripts/`). Jamais `admin/` : oxfmt 0.2 casse la syntaxe TypeScript (séparateurs des types objets supprimés).

## Règles de travail

- Secrets : `token proj nexora.txt` (jetons GitHub et Supabase fournis par l'utilisateur) ne doit jamais être affiché, recopié dans le code ni envoyé sur GitHub ; les scripts le lisent par `scripts/local-secrets.mjs`. Le back office n'utilise que la clé publique (anon) ; le jeton Supabase de la section « Supabase » est saisi dans le navigateur et gardé dans `sessionStorage`.

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
