# Checklist de mise en production de NEXORA

Grille obligatoire avant **chaque mise en production** (#039), quelle qu'en soit la taille : publication du site et du back office (`pnpm github:push`, puis Workers Builds), livraison de l'application Windows (`pnpm pack:windows` remise aux utilisateurs), application de migrations ou changement de configuration Supabase ou Brevo. Elle reprend la checklist générale fournie par l'utilisateur, adaptée aux fonctions réelles de NEXORA ; règle associée : R26 de `REGLES.md`.

## Statuts

| Statut | Sens |
|---|---|
| **Validé** | Contrôle exécuté avec succès, preuve conservée (rapport `validations/`, capture, journal). |
| **Bloquant** | Faille de sécurité, perte de données possible, règle commerciale non appliquée, permission défaillante, régression ou déploiement incomplet. Interdit la mise en production (R26). |
| **Alerte** | Écart non bloquant : à corriger, ou à accepter explicitement dans l'entrée du journal. |
| **Dépendance externe** | Non vérifiable depuis cet environnement : Supabase en écriture, Brevo, boîte e-mail réelle, Windows, Android, Google Play, tableau de bord d'un prestataire. |
| **À vérifier** | Fonction présente, contrôle pas encore mené pour cette mise en production. |
| **Sans objet** | Fonction absente de NEXORA (justification ci-dessous). À réévaluer dès qu'elle apparaît. |

Ne jamais marquer « Validé » parce que le code semble correct : seulement après un essai reproductible ou une preuve observable (R17).

## Procédure

1. **Sauvegarde et retour arrière prêts.** Code : la version Make précédente et le commit GitHub précédent (noter son identifiant). Base : sauvegarde manuelle avant toute migration tant que Supabase n'en propose aucune de restaurable (section 2). Application Windows : le ZIP précédent reste dans la version Make précédente.
2. **Contrôles automatiques :** `pnpm valider --label NNN-sujet` (ajouter `--charge` pour une version majeure ou un changement qui touche aux performances). Rapport écrit dans `validations/AAAA-MM-JJ-NNN-sujet.md`. Depuis un terminal ordinaire, avec `NX_TEST_EMAIL` et `NX_TEST_PASSWORD` (compte simple réservé aux essais), l'outil mène aussi les essais avec un compte (connexion, rôles, déconnexion, offre lue sur le serveur).
3. **Contrôles manuels** des rubriques touchées par la livraison (tableaux ci-dessous), résultats notés dans l'entrée du journal ; les rubriques non touchées gardent le résultat de la dernière mise en production.
4. **Décision (R26).** Aucun contrôle bloquant introduit par la livraison. Un bloquant préexistant qui dépend d'une action de l'utilisateur (Supabase, Brevo) ne bloque pas une livraison qui ne l'aggrave pas, à condition qu'il figure dans « Anomalies relevées » avec l'action attendue.
5. **Publication :** `pnpm github:push --essai`, puis `pnpm github:push`, puis attendre les vérifications « Workers Builds » du commit sur GitHub.
6. **Contrôle en ligne :** `pnpm valider --label NNN-en-ligne --sans-build` : version en ligne identique à `dist/`, en-têtes de sécurité, relais, Supabase.
7. **Journal :** verdict, rapports, contrôles manuels, bloquants restants, plan de retour arrière dans l'entrée `#NNN` de `SUIVI.md`.

**Retour arrière.** Site et back office : restaurer la version Make précédente puis `pnpm github:push`, ou, plus vite, Cloudflare → Workers → nexora → Deployments → revenir au déploiement précédent. Base : les migrations sont idempotentes mais pas réversibles ; restaurer la sauvegarde faite à l'étape 1. Application Windows : redistribuer le ZIP de la version précédente.

**Sauvegarde manuelle de la base** (terminal ordinaire, mot de passe de la base dans le tableau de bord Supabase → Database → Settings) : `npx supabase db dump --db-url "<adresse de connexion>" -f schema.sql`, puis la même commande avec `--data-only -f donnees.sql`. **Restauration testée** au moins une fois par mois et avant toute migration destructive : charger les deux fichiers dans un Postgres local (`psql -f schema.sql`, `psql -f donnees.sql`) et comparer le nombre de lignes des tables principales (profiles, organizations, projects, invoices).

Légende de la colonne « Méthode » : **auto** (`pnpm valider`), **auto compte** (`pnpm valider` avec un compte d'essai, terminal ordinaire), **essais** (`pnpm test:offres`), **captures** (`pnpm captures`, `pnpm captures:admin`), **manuel**, **Windows**, **Android**, **externe**, **sans objet**.

## 1. Authentification et comptes

| Contrôle | Méthode | Comment |
|---|---|---|
| Inscription par e-mail | manuel | NEXORA web → Connexion → Créer un compte avec une adresse de test : e-mail reçu en français, lien qui ouvre NEXORA et confirme le compte. |
| Vérification de l'e-mail exigée | auto | Comptes jamais confirmés sans e-mail. |
| Connexion, mot de passe incorrect refusé | auto compte | |
| Déconnexion, session fermée côté serveur | auto compte | Le jeton de rafraîchissement ne sert plus après la déconnexion. |
| Mot de passe oublié et réinitialisation | manuel | Consomme la limite horaire des e-mails des comptes. |
| Sessions : expiration, rotation des jetons | auto | |
| Rôles utilisateur, administrateur, super-administrateur | auto compte, manuel | Fonctions d'administration refusées à un compte simple ; écran de connexion du back office refusé à un compte simple, accepté pour un administrateur. |
| Compte suspendu | manuel | Back office → Utilisateurs → suspendre un compte de test : connexion refusée dans NEXORA et le back office ; puis le réactiver. |
| Robots, mots de passe divulgués | auto | Alerte tant que le captcha et la protection des mots de passe divulgués sont coupés. |
| Connexion par téléphone, codes SMS (OTP) | sans objet | Connexion par e-mail seulement ; le moyen « téléphone » doit rester fermé (contrôlé par `pnpm valider`). |

## 2. Base de données

| Contrôle | Méthode | Comment |
|---|---|---|
| Migrations du dépôt appliquées en ligne | auto | Tables et fonctions de chaque migration présentes. Sinon : back office → Supabase → « Tout appliquer ». |
| Sécurité des lignes (RLS) sur toutes les tables | auto | |
| Aucune donnée privée lisible sans compte | auto | Seules `plans`, `feature_flags` et les réglages publics de `app_config` sont lisibles. |
| Un compte simple ne lit que ses données | auto compte | |
| Lecture, écriture, mise à jour, suppression | manuel | Projet créé, renommé, supprimé et synchronisé entre l'application Windows et NEXORA web ; ticket de support créé puis lu dans le back office. |
| Contraintes, doublons, quotas atomiques, limites des données | essais | Migration des offres rejouée sur Postgres (PGlite). |
| Relations et index | auto | Conseiller de performance de Supabase. |
| Sauvegardes automatiques restaurables | auto | Bloquant tant qu'aucune sauvegarde n'est restaurable : sauvegarde manuelle (procédure) avant chaque migration. |
| Restauration testée | manuel | Voir la procédure ; date du dernier essai notée dans le journal. |

## 3. API (données, fonctions serveur, fonctions Edge, relais)

| Contrôle | Méthode | Comment |
|---|---|---|
| Points d'entrée disponibles | auto | Site, back office, Supabase, fonctions Edge actives. |
| Authentification obligatoire | auto | Relais : 401 sans jeton, 403 pour un autre projet ; fonctions Edge et d'administration refusées sans compte. |
| Validation des entrées | essais, manuel | Quantités et fonctions inconnues refusées par le serveur ; formulaires (adresse invalide, champs vides) dans NEXORA et le back office. |
| Erreurs propres | auto, manuel | 404 sur une adresse inconnue ; messages neutres sans détail technique côté utilisateur (#038). |
| Limitation des requêtes | auto | Limites anti-abus de l'authentification, quotas des offres. Pas de limite par adresse IP sur l'API de données (prestataire). |
| Délais de réponse | auto | |

## 4. Offres et règles commerciales

| Contrôle | Méthode | Comment |
|---|---|---|
| Offres et prix en ligne identiques au catalogue | auto | Gratuit 0 $, Standard 12 $, Pro 18 $ par mois (120 $ et 180 $ par an) (`nx/offres/catalog.js`). |
| Quotas, essais, restrictions, historique | essais, auto compte | Offre du compte lue sur le serveur. |
| Changement d'offre par l'administrateur | manuel | Back office → Équipes et offres : nouvelle offre visible dans NEXORA (Mon compte → Offre et usage). |
| Factures : numérotation, totaux, taxes, PDF, envoi | manuel | Back office → Factures : brouillon, émission (numéro suivant, plus modifiable), PDF, envoi à une adresse de test. |
| Promotions, commissions, cashback, points fidélité, portefeuille | sans objet | Aucun module correspondant dans NEXORA. |

## 5. Marketplace

Sans objet : NEXORA n'a ni vendeurs, ni produits, ni stock, ni catégories de vente.

## 6. Commandes et panier

Sans objet : pas de panier ni de commandes. Les factures émises par le back office sont contrôlées en section 4.

## 7. Paiements

Sans objet : aucun paiement en ligne. L'offre est changée par un administrateur et la facture émise depuis le back office. À reprendre en entier (paiement réussi ou échoué, double paiement, remboursement, webhooks) si un prestataire de paiement est ajouté. Les achats intégrés (Google Play Billing) des applications créées avec l'App Builder relèvent de leurs éditeurs.

## 8. Notifications et e-mails

| Contrôle | Méthode | Comment |
|---|---|---|
| E-mails des comptes par Brevo, limite horaire, modèles en français | auto | |
| E-mails réellement reçus (inscription, mot de passe, invitation) | manuel | Boîte de test, dossier des indésirables compris. |
| Alerte de supervision par e-mail | manuel | Back office → Supabase → carte E-mails → alerte de test ; journal des e-mails. |
| Annonce de mise à jour, quota quotidien | manuel | Back office → E-mails, essai à blanc d'abord. |
| Notifications internes (annonces, temps réel) | manuel | Annonce publiée dans le back office, visible dans NEXORA sans recharger. |
| Notifications push des applications créées | Android | APK de test construite avec l'App Builder. |
| SMS | sans objet | Aucun envoi de SMS. |

## 9. Messagerie et support

| Contrôle | Méthode | Comment |
|---|---|---|
| Tickets : création dans NEXORA, réponse dans le back office, temps réel | manuel | |
| Fichiers et images dans les messages, accusés de lecture | sans objet | Les messages des tickets sont en texte seul. |

## 10. Sécurité

| Contrôle | Méthode | Comment |
|---|---|---|
| Aucun secret dans les fichiers envoyés sur GitHub | auto | Valeurs du fichier local de jetons et motifs génériques ; aucune valeur affichée. |
| Textes visibles sans détail technique ni ancien nom | auto | Alerte = ligne à relire. |
| Injection SQL | auto, revue | Conseiller de sécurité ; chaque nouvelle migration relue : pas de SQL construit avec les saisies (seulement `format()` avec `%L` ou `%I`). |
| XSS | auto, manuel | Politique de sécurité (CSP) présente ; saisir `<img src=x onerror=alert(1)>` comme nom de profil, de ticket et de projet : affiché comme du texte dans NEXORA, le back office et les e-mails. |
| CSRF | sans objet | Aucune session par cookie : chaque appel porte un jeton ; le relais exige le jeton. |
| Affichage du back office dans un cadre (clics détournés) | auto | En-têtes `X-Frame-Options` et `frame-ancestors` publiés par `dist/_headers`. |
| Permissions | auto, auto compte | Fonctions privilégiées appelables sans compte limitées aux fonctions publiques prévues. |
| Mots de passe hachés | externe | Gérés par le service d'authentification (jamais stockés par NEXORA). |
| Données sensibles dans les journaux | manuel | Journal local de l'application, journal d'audit et journal des e-mails sans mot de passe ni clé. |
| Connexions directes à la base (SSL, adresses) | auto | Alertes tant que le SSL n'est pas imposé et que toutes les adresses sont admises. |
| Application Windows : CSP, canaux IPC autorisés | auto, revue | `pnpm check` ; tout nouveau canal relu dans `preload.js`. |

## 11. Performance

| Contrôle | Méthode | Comment |
|---|---|---|
| Temps de réponse, compression, cache | auto | |
| Conseiller de performance de la base | auto | |
| Mémoire et processeur de l'application | Windows | Gestionnaire des tâches après 30 minutes dans les 9 espaces : pas de hausse continue. |
| Taille de l'application | Windows | Taille du ZIP notée à chaque `pnpm pack:windows`. |

## 12. Tâches automatiques

| Contrôle | Méthode | Comment |
|---|---|---|
| Supervision chaque minute, agrégats, nettoyage (pg_cron) | externe | Back office → Supabase → Vérification de la configuration, ligne « Tâches planifiées ». |
| Notifications planifiées | externe | Même ligne. |
| Sauvegardes | auto | Voir section 2. |

## 13. Journaux

| Contrôle | Méthode | Comment |
|---|---|---|
| Actions d'administration journalisées | manuel | Une action dans le back office, puis la section Journal d'audit. |
| E-mails journalisés | manuel | Back office → E-mails → journal. |
| Erreurs de l'interface | captures | Aucune exception dans la page. |
| Journal local de l'application | Windows | |

## 14. Administration (back office)

| Contrôle | Méthode | Comment |
|---|---|---|
| Connexion d'un administrateur, refus d'un compte simple | manuel | |
| Utilisateurs (rôle, suspension), équipes et offres, factures, e-mails, supervision, statistiques | captures, manuel | Données fictives pour l'apparence, données réelles pour le fonctionnement. |
| Vendeurs, produits, commandes | sans objet | |

## 15. Intégrations

| Contrôle | Méthode | Comment |
|---|---|---|
| Brevo (SMTP et API) | auto, manuel | Configuration contrôlée ; envoi réel testé depuis le back office. |
| Stockage des fichiers | auto, manuel | Aucun compartiment privé visible sans compte ; envoi d'un avatar. |
| GitHub et Cloudflare Workers Builds | à chaque publication | Vérifications « Workers Builds » réussies sur le commit envoyé. |
| Google Play et Firebase (applications créées) | Android | |
| Paiement, SMS, cartes | sans objet | |

## 16. Surveillance

| Contrôle | Méthode | Comment |
|---|---|---|
| Site, back office, base, API | auto | |
| Supervision 24 h/24 des sites des utilisateurs | manuel | Site de test surveillé, panne simulée (adresse en erreur), alerte reçue puis retour à la normale. |
| Alertes configurées | manuel | |
| Processeur, mémoire, disque des serveurs | externe | Tableau de bord Supabase (Reports) et Cloudflare (Workers → Metrics). |

## 17. Tests de charge

| Contrôle | Méthode | Comment |
|---|---|---|
| 100, 500 et 1 000 visiteurs simultanés sur le site | auto (`--charge`) | Mesure depuis un seul poste : indicative, limitée par son propre débit. |
| Charge sur Supabase | sans objet | Pas d'essai de charge sur le projet gratuit partagé (limites du prestataire) ; à faire sur un projet de préproduction si l'offre change. |

## 18. Vérification finale

| Contrôle | Méthode | Comment |
|---|---|---|
| Aucun bloquant introduit par la livraison | auto | Verdict du rapport et règle R26. |
| Scénarios utilisateurs | captures | Les 9 espaces et le back office, thèmes clair et sombre, aucune exception dans la page. |
| Application Windows | Windows | `pnpm pack:windows`, puis démarrage, propriétés de `NEXORA.exe`, connexion, synchronisation. |
| Publication | auto | `pnpm github:push`, Workers Builds réussi, puis `pnpm valider --sans-build`. |
| Sauvegarde et retour arrière | manuel | Prêts avant la publication (procédure). |
