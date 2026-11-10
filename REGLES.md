# Règles strictes de travail sur NEXORA

Ces règles s'appliquent à **chaque demande, sans exception**, dans toutes les sessions. Elles complètent `AGENTS.md` (référence technique) et `SUIVI.md` (état et journal). En cas de doute sur une règle ou sur la demande : poser la question avant d'agir.

## 1. Avant de modifier

- **R1.** Lire `REGLES.md`, puis dans `SUIVI.md` : « État actuel », « Anomalies relevées », « Idées et suites » et les trois dernières entrées du journal.
- **R2.** Reformuler la demande en une phrase et repérer les espaces, fichiers et canaux IPC concernés. Si la demande est ambiguë et qu'un choix a des conséquences, demander avant de modifier.
- **R3.** Attribuer le numéro d'entrée suivant du journal (`#NNN`).
- **R4.** Changement visible dans l'interface : capturer d'abord l'état « avant » des écrans concernés (`pnpm captures <écrans> --label NNN-avant`).

## 2. Pendant la modification

- **R5.** Ne changer que ce qui est demandé. Pas de refonte ni de « nettoyage » non demandé : un problème repéré au passage est noté dans « Anomalies relevées », pas corrigé d'office.
- **R6.** Ne jamais supprimer ni écraser les originaux (`nexora/NEXORA-portable.zip`, `nexora/NEXORA-win32-x64/`, fichiers de `nexora/app/`) sans accord explicite. Seule exception : `pnpm pack:windows`, lancé à chaque modification (R27). L'original 1.0.0 reste disponible dans la version Make 3.
- **R7.** Dans `nexora/`, respecter le style de l'auteur (guillemets simples, points-virgules, commentaires et messages en français) et ne jamais reformater.
- **R8.** Interface : français, tutoiement, système d'icônes de NEXORA, aucun nouvel emoji, cohérence avec le design existant. Tout bloc d'interface suit le thème : blanc en thème clair, noir en thème sombre (exigence de l'utilisateur, #004) ; seuls les contenus (scène 3D, page de document, écrans d'appareils, vignettes, nuanciers) gardent leurs propres couleurs.
- **R9.** Canal IPC ajouté ou modifié : le déclarer dans le processus principal, l'autoriser dans `preload.js` et, s'il sert au démarrage ou à l'ouverture d'un espace, lui donner une réponse dans `preview/bridge.js` (ou l'ajouter à `DIALOG_CHANNELS` s'il ouvre une boîte de dialogue système).
- **R10.** Garder la politique de sécurité (CSP) de `renderer/index.html` aussi stricte que possible ; toute source ajoutée est justifiée dans le journal.
- **R11.** `renderer/dist/` (minifié) : modifications ciblées, une à la fois, consignées avec le fichier exact et l'extrait modifié.

## 3. Vérifications obligatoires avant d'annoncer « terminé »

- **R12.** `pnpm check` après toute modification de `main.js`, `preload.js`, `src/` ou `renderer/audit.js` : aucune erreur.
- **R13.** `pnpm captures <écrans concernés> --label NNN-<sujet> --upload` : aucune exception dans la page ; chaque erreur de console ou requête en échec est examinée et expliquée.
- **R14.** Regarder chaque capture et confirmer que le résultat visible correspond à la demande ; vérifier aussi le thème sombre (`--theme sombre`) quand l'apparence change.
- **R15.** `pnpm build` à chaque modification (R27), quelle que soit la partie touchée.
- **R16.** Ce qui ne peut pas être vérifié dans l'aperçu (processus principal, `<webview>`, fenêtres système, Android, fichiers) est signalé comme tel, avec la manière de le tester sur Windows.
- **R17.** Ne jamais déclarer une vérification réussie sans l'avoir exécutée et sans en avoir lu le résultat.

## 4. Captures d'écran dans le chat

- **R18.** Chaque mise à jour est montrée dans le chat avec ses captures : « après » toujours, « avant » pour tout changement visuel. Les images sont envoyées par `--upload` et affichées avec `![Légende](figma-blob://…)`.
- **R19.** Les captures sont rangées dans `captures/AAAA-MM-JJ-NNN-<sujet>/`, citées dans l'entrée du journal et jamais supprimées.
- **R20.** Configuration standard : 1440×900, thème clair, réglages d'un PC neuf avec le premier lancement passé. Toute autre configuration (thème sombre, autre taille, clics) est indiquée dans la légende.

## 5. Suivi et versions

- **R21.** Chaque demande menée à bien reçoit une entrée dans le journal de `SUIVI.md`, la plus récente en haut, selon le modèle ci-dessous.
- **R22.** Mettre à jour « État actuel », « Anomalies relevées » et « Idées et suites » quand ils changent ; toute décision technique durable (méthode, outil, dépendance, contournement) va dans « Décisions et méthodes », datée et justifiée.
- **R23.** Une seule version Make par demande, avec un message qui commence par le numéro d'entrée : `#NNN Titre`.
- **R24.** Reconstruction Windows (`pnpm pack:windows`) à chaque modification (R27, depuis #098 ; auparavant seulement à la demande). Noter dans l'entrée la version de NEXORA (`nexora/app/package.json`) et la taille du ZIP. Proposer d'augmenter la version de NEXORA à chaque livraison, sans le faire d'office.

## 5 bis. Reconstruction complète et envoi sur GitHub (exigence de l'utilisateur, #098)

- **R27.** **À chaque modification, quelle qu'elle soit, tout NEXORA est reconstruit, mis à jour et obligatoirement envoyé sur GitHub**, même si la modification ne touche qu'une partie :
  1. **Logiciel Windows** : `pnpm check`, puis `pnpm pack:windows` (`app.asar` et `NEXORA-portable.zip`).
  2. **Web** : `pnpm build` : site vitrine (pages pré-générées), NEXORA web (studio web, `/studio/`), back office, espace des parrains, page de statut.
  3. **Lanceur NEXORA Devs Toolbox** : `pnpm test:launcher`, `pnpm toolbox` (paquet signé, lanceur recompilé, manifeste), puis publication sur le dépôt public avec un **nouveau tag** (`v<version>-rN`, N suivant), par la branche temporaire `publication-v…` et `launcher/publication-workflow.yml` depuis le bac à sable (A-050), branche supprimée ensuite ; `pnpm launcher:ressources` si la version du lanceur change. Go installé hors du dépôt (`/tmp/go`) si absent.
  4. **Schémas de base de données** : migrations de `supabase/migrations/` rejouées par les essais (`pnpm test:offres`, `test:licences`, `test:parrainage`… sur PGlite), types régénérés (`pnpm supabase types`), `supabase/nexora.json` à jour. Application en ligne : `pnpm supabase migrer` quand l'environnement le permet ; sinon (bac à sable : écritures refusées) l'action « Tout appliquer » du back office est demandée à l'utilisateur dans le compte rendu, après sauvegarde manuelle (R26).
  5. **Envoi sur GitHub, obligatoire** : `pnpm github:push --essai`, `pnpm github:push`, puis vérification « Workers Builds: nexora » réussie et `pnpm valider --label NNN-en-ligne --sans-build`.
  Les contrôles de R26 restent faits à chaque fois : un bloquant **introduit** par la modification est corrigé avant l'envoi (jamais d'envoi en laissant une régression, jamais de demande terminée sans envoi) ; un bloquant antérieur dépendant de l'utilisateur ne retarde pas l'envoi. Toute étape impossible dans l'environnement est signalée avec sa cause et la commande à lancer ailleurs (R16, R17). L'entrée du journal donne, pour chaque étape, le résultat (taille du ZIP, nombre de fichiers web, tag du lanceur, commit GitHub).
- **R28.** **Rien ne reste en local ni en suspens** (exigence de l'utilisateur, #106) : une demande n'est terminée que lorsque sa version finale, reconstruite, est publiée et vérifiée en ligne.
  1. **Dépôt privé** `Trdgi4djyds/NEXORA` identique à l'espace de travail : sources, logiciel reconstruit (`app.asar`, `NEXORA-portable.zip`, `NEXORA.exe`), journal, rapports de `validations/` et captures. Ce qui est écrit après le premier envoi (entrée du journal, rapport en ligne) part par un second `pnpm github:push` ; la demande se clôt sur `pnpm github:push --essai` qui répond « déjà à jour » et sur « Workers Builds: nexora » réussi pour le dernier commit.
  2. **Dépôt public** `Trdgi4djyds/NEXORA-portable` : la publication signée de la version de l'espace de travail est marquée « Latest », vérifiée par les liens stables (`releases/latest/download/nexora.manifest.json` et `NEXORA-Devs-Toolbox.exe`, empreintes de `SHA256SUMS.txt`) et par le service de sécurité (`/security/manifest` : statut `ok`, même version, même tag, même numéro et même empreinte de manifeste) ; aucune branche `publication-v…` ne reste.
  3. **Reprise** : un envoi ou une publication interrompus (session coupée, espace de travail restauré) sont vérifiés et terminés avant tout autre travail ; des sources perdues sont retrouvées à partir de ce qui est publié (paquet, manifeste, `app.asar`) et contrôlées par reconstruction, jamais réécrites de mémoire.
  4. Une étape impossible dans l'environnement est signalée avec sa cause et la commande à lancer ailleurs (R16, R17) : rien n'est laissé sans mention dans le compte rendu.

## 6. Compte rendu dans le chat

- **R25.** Réponse en français : ce qui a changé, vérifications faites avec leur résultat, captures, limites, et ce qui reste à tester sur Windows.

## 7. Mise en production

- **R26.** Avant chaque mise en production (publication par `pnpm github:push`, livraison de l'application Windows, application de migrations, changement de configuration Supabase ou Brevo), dérouler `CHECKLIST-PRODUCTION.md` : `pnpm valider --label NNN-sujet`, contrôles manuels des rubriques touchées, décision, publication, puis `pnpm valider --label NNN-en-ligne --sans-build`. Un contrôle **bloquant** interdit la mise en production, sauf s'il existait déjà, dépend d'une action de l'utilisateur (Supabase, Brevo), n'est pas aggravé par la livraison et figure dans « Anomalies relevées » avec l'action attendue. Les rapports de `validations/` ne sont jamais supprimés et sont cités dans l'entrée du journal, avec le plan de retour arrière.

## Procédures

**Modifier l'interface**
1. Captures « avant » des écrans concernés.
2. Repérer le code : `renderer/index.html`, `renderer/styles.css` ou le fichier de `renderer/dist/chunks/` de l'espace (voir `AGENTS.md`).
3. Modifier, en respectant R5 à R11.
4. La page de l'aperçu se recharge seule ; `pnpm captures … --upload`, examen des images et des erreurs.
5. Entrée dans `SUIVI.md`, version Make `#NNN …`, compte rendu avec les captures.

**Modifier le processus principal** (`main.js`, `preload.js`, `src/`)
1. Modifier, puis `pnpm check`.
2. Si l'interface en dépend : adapter `preview/bridge.js`, puis captures.
3. Indiquer comment tester sur Windows (R16), puis suivi et version.

**Livrer une version Windows**
1. `pnpm check`.
2. `pnpm pack:windows` : reconstruit `app.asar` et `NEXORA-portable.zip` dans `nexora/`.
3. Noter la version de NEXORA et la taille du ZIP dans l'entrée, puis version Make et compte rendu.

**Fin de toute modification** (R27, R28) : `pnpm check` → `pnpm pack:windows` → `pnpm build` (par `pnpm valider`) → essais des migrations et `pnpm supabase types` → `pnpm test:launcher` et `pnpm toolbox`, publication du lanceur (nouveau tag) → `pnpm github:push` → Workers Builds → `pnpm valider --sans-build` → journal → second `pnpm github:push` (journal et rapports) → Workers Builds → `pnpm github:push --essai` « déjà à jour », publication « Latest » et `/security/manifest` vérifiés → version Make.

**Mettre en production** (R26, détail dans `CHECKLIST-PRODUCTION.md`)
1. Retour arrière prêt : version Make et commit GitHub précédents notés ; sauvegarde manuelle de la base avant toute migration.
2. `pnpm valider --label NNN-sujet` (avec `--charge` pour une version majeure) et contrôles manuels des rubriques touchées.
3. Aucun bloquant introduit : `pnpm github:push --essai`, `pnpm github:push`, vérifications « Workers Builds » réussies (envoi obligatoire à chaque modification, R27).
4. `pnpm valider --label NNN-en-ligne --sans-build`, puis verdict, rapports et bloquants restants dans l'entrée du journal.

## Modèle d'entrée du journal

```markdown
### #NNN — Titre court (AAAA-MM-JJ)
- **Demande :** …
- **Fait :** …
- **Fichiers :** …
- **Vérifications :** `pnpm check` … ; `pnpm captures …` (exceptions : 0) ; …
- **Mise en production :** rapports `validations/…` (verdict), contrôles manuels menés, bloquants restants, retour arrière
- **Captures :** `captures/AAAA-MM-JJ-NNN-sujet/` (avant / après)
- **Limites, à tester sur Windows :** …
- **Version Make :** n
```
