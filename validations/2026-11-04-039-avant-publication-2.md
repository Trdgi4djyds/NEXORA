# Validation avant mise en production — 039-avant-publication

- Date : 4 novembre 2026 à 21:12
- NEXORA 1.1.0, espace de travail au commit `7958a34`
- Site contrôlé : https://nexora.abrahamtogbonon0.workers.dev/
- Commande : `pnpm valider --label 039-avant-publication`
- Verdict : **Mise en production bloquée** : 7 contrôles bloquants.
- Bilan : 34 validés, 7 bloquants, 6 alertes, 2 externes

Légende : VALIDÉ vérifié ici ; BLOQUANT interdit la mise en production (voir la règle R26 de `REGLES.md`) ; ALERTE à corriger ou à accepter explicitement ; EXTERNE dépend d'un autre environnement (procédure dans `CHECKLIST-PRODUCTION.md`). Les contrôles manuels, Windows et Android de la checklist restent « à vérifier » tant qu'ils n'ont pas été menés pour cette mise en production.

## 1. Authentification

| Statut | Contrôle | Détail |
|---|---|---|
| VALIDÉ | Vérification de l'e-mail exigée à l'inscription | confirmation par e-mail obligatoire |
| VALIDÉ | Mots de passe : longueur minimale | 8 caractères |
| ALERTE | Mots de passe divulgués refusés | désactivé (option des offres payantes de Supabase) |
| VALIDÉ | Sessions : expiration et rotation des jetons | jeton d'accès 60 min, rotation active |
| ALERTE | Inscriptions protégées contre les robots | inscriptions ouvertes sans captcha |
| VALIDÉ | Liens des e-mails (adresse du site, redirections) | https://nexora.abrahamtogbonon0.workers.dev/, 6 redirections |
| VALIDÉ | Limites anti-abus de l'authentification | vérifications 30/5 min, renouvellements 150/5 min, codes 30/5 min |
| VALIDÉ | Moyens de connexion ouverts | email ; téléphone fermé (sans objet) |
| EXTERNE | Essais avec un compte (connexion, rôles, déconnexion) | définir NX_TEST_EMAIL et NX_TEST_PASSWORD (compte simple réservé aux essais) et lancer depuis un terminal ordinaire |

## 2. Base de données

| Statut | Contrôle | Détail |
|---|---|---|
| BLOQUANT | Sauvegardes restaurables | aucune sauvegarde restaurable (offre gratuite de Supabase) : faire une sauvegarde manuelle avant toute migration (CHECKLIST-PRODUCTION.md, section 2) |
| VALIDÉ | Sécurité des lignes (RLS) sur toutes les tables | RLS active partout |
| BLOQUANT | Migrations appliquées en ligne | non appliquées : 20261104000007_offres_limites.sql (19 objets absents : nx_quota_usage, nx_app_trials, nx_org_plan, nx_plan_rank, nx_user_plan…) — back office → Supabase → « Tout appliquer » |
| VALIDÉ | Visiteur anonyme : aucune donnée privée lisible | 36 tables : 8 refusées, les autres vides pour un anonyme ; publiques : plans, feature_flags, app_config |

## 3. API et erreurs

| Statut | Contrôle | Détail |
|---|---|---|
| VALIDÉ | Adresse inconnue : erreur propre | 404 |
| VALIDÉ | Relais Supabase : refus sans jeton | 401 |
| VALIDÉ | Relais Supabase : autres projets refusés | 403 |
| VALIDÉ | Fonctions Edge actives | admin-users, org-invite, security-scan, site-info |
| VALIDÉ | Fonctions d'administration refusées sans compte | admin_stats, admin_users, admin_orgs, nx_email_quota |
| VALIDÉ | Fonctions Edge : compte exigé | 4 fonctions refusent un anonyme |

## 4. Offres et règles

| Statut | Contrôle | Détail |
|---|---|---|
| VALIDÉ | Essais des offres : canaux, quotas atomiques, essais, limites (pnpm test:offres) | 64 vérifications, aucun échec. |
| BLOQUANT | Offres et prix en ligne conformes au catalogue | absentes ou prix différents : standard, pro ; en ligne : free 0 $, pro 9 $, team 29 $, enterprise 0 $ |

## 8. Notifications et e-mails

| Statut | Contrôle | Détail |
|---|---|---|
| VALIDÉ | Envoi des e-mails des comptes par Brevo | SMTP smtp-relay.brevo.com |
| BLOQUANT | Limite horaire des e-mails des comptes | 2 par heure : au-delà, inscriptions et mots de passe oubliés sans e-mail ; back office → Supabase → « Appliquer la configuration recommandée » (30 par heure) |
| BLOQUANT | E-mails des comptes en français (modèles appliqués) | objet par défaut en anglais (« Confirm your email address ») : back office → E-mails → « Appliquer les modèles » |

## 10. Sécurité

| Statut | Contrôle | Détail |
|---|---|---|
| VALIDÉ | Aucun secret dans les fichiers envoyés sur GitHub | 3 jetons locaux cherchés et motifs génériques (GitHub, Supabase, Brevo) : aucun résultat |
| VALIDÉ | Textes visibles sans détail technique ni ancien nom | 60 fichiers relus |
| VALIDÉ | HTTPS | https://nexora.abrahamtogbonon0.workers.dev/ |
| BLOQUANT | En-têtes de sécurité du site (nosniff, Referrer-Policy) | absents en ligne : publier la version qui contient dist/_headers (#039) |
| BLOQUANT | Back office protégé contre l'affichage dans un cadre (clics détournés) | en-têtes absents en ligne |
| VALIDÉ | Politique de sécurité (CSP) de NEXORA web | présente dans la page |
| ALERTE | Connexions directes à la base : SSL imposé | non imposé (tableau de bord Supabase → Database → SSL) |
| ALERTE | Connexions directes à la base : adresses autorisées | toutes les adresses (mot de passe de la base seul rempart) |
| VALIDÉ | Conseiller de sécurité : aucune erreur | 42 remarques, aucune de niveau erreur |
| VALIDÉ | Fonctions privilégiées appelables sans compte | seulement les fonctions publiques prévues (app_track, get_shared, nx_can_read_org, nx_can_edit_org, monitor_incident_action) ; 30 fonctions réservées aux comptes connectés, qui contrôlent elles-mêmes les droits (refus vérifiés par l'essai avec un compte simple) |
| ALERTE | Fonctions au chemin de recherche fixé | nx_html, nx_duration, nx_monitor_reason, nx_email_render, nx_strip_icon : corrigé dans les migrations (#039), à réappliquer (back office → Supabase → « Tout appliquer ») |
| VALIDÉ | Réglages lisibles sans compte | signups_enabled, maintenance, support_email, desktop_download_url |

## 11. Performance

| Statut | Contrôle | Détail |
|---|---|---|
| VALIDÉ | Compression des fichiers | page et 3 fichiers : br |
| VALIDÉ | Cache validé (ETag, revalidation) | 3/3 fichiers avec ETag ; Cache-Control : public, max-age=0, must-revalidate |
| VALIDÉ | Temps de réponse du site | le plus lent : 189 ms (5 requêtes depuis cet environnement) |
| ALERTE | Conseiller de performance de la base | unindexed_foreign_keys 30, auth_rls_initplan 5 (avertissement), unused_index 12, multiple_permissive_policies 8 (avertissement), duplicate_index 1 (avertissement) |

## 12. Tâches automatiques

| Statut | Contrôle | Détail |
|---|---|---|
| EXTERNE | Tâches planifiées (pg_cron) actives | lecture SQL impossible en GET : back office → Supabase → « Vérification de la configuration » (ligne « Tâches planifiées ») |

## 16. Surveillance

| Statut | Contrôle | Détail |
|---|---|---|
| VALIDÉ | Santé des services Supabase | ACTIVE_HEALTHY ; 5/5 services sains |

## 18. Publication

| Statut | Contrôle | Détail |
|---|---|---|
| VALIDÉ | NEXORA web répond | 200 en 189 ms |
| VALIDÉ | Back office répond | 200 en 45 ms |
| VALIDÉ | Version en ligne identique à dist/ | 228 fichiers comparés (back office et bibliothèques exclus) |

## 0. Code et publication

| Statut | Contrôle | Détail |
|---|---|---|
| VALIDÉ | Processus principal (pnpm check) | Code vérifié : 56 fichiers JavaScript, aucune erreur. |
| VALIDÉ | Types du back office (tsc --noEmit) | aucune erreur |
| VALIDÉ | Publication web (pnpm build) | Version web de NEXORA construite dans dist/ : 428 fichiers, 29.5 Mo. |
| VALIDÉ | Fichiers indispensables de dist/ | index.html, admin/index.html, _headers, nx/boot.js |
