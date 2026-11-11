# Validation avant mise en production — 107-fusion-en-ligne

- Date : 11 novembre 2026 à 06:17
- NEXORA 1.2.2, espace de travail au commit `5a4f3801`
- Site contrôlé : https://nexoradevs.online/
- Commande : `pnpm valider --label 107-fusion-en-ligne --sans-build`
- Verdict : **Mise en production bloquée** : 3 contrôles bloquants.
- Bilan : 48 validés, 3 bloquants, 7 alertes, 2 externes

Légende : VALIDÉ vérifié ici ; BLOQUANT interdit la mise en production (voir la règle R26 de `REGLES.md`) ; ALERTE à corriger ou à accepter explicitement ; EXTERNE dépend d'un autre environnement (procédure dans `CHECKLIST-PRODUCTION.md`). Les contrôles manuels, Windows et Android de la checklist restent « à vérifier » tant qu'ils n'ont pas été menés pour cette mise en production.

## 1. Authentification

| Statut | Contrôle | Détail |
|---|---|---|
| VALIDÉ | Vérification de l'e-mail exigée à l'inscription | confirmation par e-mail obligatoire |
| VALIDÉ | Mots de passe : longueur minimale | 8 caractères |
| ALERTE | Mots de passe divulgués refusés | désactivé (option des offres payantes de Supabase) |
| VALIDÉ | Sessions : expiration et rotation des jetons | jeton d'accès 60 min, rotation active |
| ALERTE | Inscriptions protégées contre les robots | inscriptions ouvertes sans captcha |
| BLOQUANT | Liens des e-mails (adresse du site, redirections) | redirections manquantes : https://nexora.abrahamtogbonon0.workers.dev/** |
| VALIDÉ | Limites anti-abus de l'authentification | vérifications 30/5 min, renouvellements 150/5 min, codes 30/5 min |
| VALIDÉ | Moyens de connexion ouverts | email ; téléphone fermé (sans objet) |
| EXTERNE | Essais avec un compte (connexion, rôles, déconnexion) | définir NX_TEST_EMAIL et NX_TEST_PASSWORD (compte simple réservé aux essais) et lancer depuis un terminal ordinaire |

## 2. Base de données

| Statut | Contrôle | Détail |
|---|---|---|
| BLOQUANT | Sauvegardes restaurables | aucune sauvegarde restaurable (offre gratuite de Supabase) : faire une sauvegarde manuelle avant toute migration (CHECKLIST-PRODUCTION.md, section 2) |
| VALIDÉ | Sécurité des lignes (RLS) sur toutes les tables | RLS active partout |
| BLOQUANT | Migrations appliquées en ligne | non appliquées : 20261111000001_paiement_saspay.sql (6 objets absents : nx_pay_sessions, nx_pay_session_open, nx_pay_session_find, nx_pay_sessions_pending, nx_pay_session_fail…) — back office → Supabase → « Tout appliquer » |
| VALIDÉ | Visiteur anonyme : aucune donnée privée lisible | 65 tables : 26 refusées, les autres vides pour un anonyme ; publiques : plans, feature_flags, app_config |

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
| VALIDÉ | Essais des offres : canaux, quotas atomiques, essais, limites (pnpm test:offres) | 110 vérifications, aucun échec. |
| VALIDÉ | Essais du parrainage : parrains, code du mois, filleuls, commissions, retraits (pnpm test:parrainage) | 104 vérifications, aucun échec. |
| VALIDÉ | Offres et prix en ligne conformes au catalogue | free 0 $, pro 25 $ |
| VALIDÉ | Offre Gratuite en ligne : 2 applications, 5 constructions par application (#087) | 2 applications à vie, 5 constructions par application et par mois |
| VALIDÉ | Adresse de contact en ligne | nexoradevstoolbox@gmail.com |

## 8. Notifications et e-mails

| Statut | Contrôle | Détail |
|---|---|---|
| VALIDÉ | Envoi des e-mails des comptes par Brevo | SMTP smtp-relay.brevo.com |
| VALIDÉ | Limite horaire des e-mails des comptes | 30 par heure |
| VALIDÉ | E-mails des comptes en français (modèles appliqués) | objet de confirmation : « Bienvenue sur NEXORA : confirme ton adresse e-mail » |

## 10. Sécurité

| Statut | Contrôle | Détail |
|---|---|---|
| VALIDÉ | Aucun secret dans les fichiers envoyés sur GitHub | 5 jetons locaux cherchés et motifs génériques (GitHub, Supabase, Brevo) : aucun résultat |
| ALERTE | Textes visibles sans détail technique ni ancien nom | à relire (texte affiché ou interne ?) : nexora/app/renderer/nx/designplus/share.js:127, nexora/app/renderer/nx/devplus/db.js:17, nexora/app/renderer/nx/devplus/db.js:34, nexora/app/renderer/nx/devplus/db.js:57 |
| VALIDÉ | HTTPS | https://nexoradevs.online/ |
| VALIDÉ | En-têtes de sécurité du site (nosniff, Referrer-Policy) | nosniff, strict-origin-when-cross-origin |
| VALIDÉ | Back office protégé contre l'affichage dans un cadre (clics détournés) | X-Frame-Options DENY, frame-ancestors 'none' |
| VALIDÉ | Politique de sécurité (CSP) de NEXORA web | présente dans la page |
| ALERTE | Connexions directes à la base : SSL imposé | non imposé (tableau de bord Supabase → Database → SSL) |
| ALERTE | Connexions directes à la base : adresses autorisées | toutes les adresses (mot de passe de la base seul rempart) |
| VALIDÉ | Conseiller de sécurité : aucune erreur | 138 remarques, aucune de niveau erreur |
| VALIDÉ | Fonctions privilégiées appelables sans compte | seulement les fonctions publiques prévues (nx_referral_resolve, nx_partner_invite_info, nx_referral_mine, app_track, get_shared, nx_can_read_org, nx_can_edit_org, monitor_incident_action, nx_heartbeat_ping, nx_deploy_mark, nx_probe_jobs, nx_probe_report, nx_rum_collect, nx_status_page, nx_status_subscribe, nx_status_confirm, nx_status_unsubscribe, nx_review_get, nx_review_post, nx_billing_apply, nx_security_report, nx_release_policy, nx_license_verify, nx_release_seen) ; 100 fonctions réservées aux comptes connectés, qui contrôlent elles-mêmes les droits (refus vérifiés par l'essai avec un compte simple) |
| ALERTE | Fonctions au chemin de recherche fixé | nx_feature_rule, nx_period, nx_metric_period, nx_public_url, nx_is_gmail, nx_license_new_key, nx_email_norm, nx_version_num, nx_policy_int : corrigé dans les migrations (#039), à réappliquer (back office → Supabase → « Tout appliquer ») |
| VALIDÉ | Réglages lisibles sans compte | signups_enabled, maintenance, desktop_download_url, support_email |

## 11. Performance

| Statut | Contrôle | Détail |
|---|---|---|
| VALIDÉ | Compression des fichiers | page et 3 fichiers : br |
| VALIDÉ | Cache validé (ETag, revalidation) | 3/3 fichiers avec ETag ; Cache-Control : public, max-age=0, must-revalidate |
| VALIDÉ | Temps de réponse du site | le plus lent : 147 ms (5 requêtes depuis cet environnement) |
| ALERTE | Conseiller de performance de la base | unindexed_foreign_keys 29, auth_rls_initplan 3 (avertissement), unused_index 24, multiple_permissive_policies 15 (avertissement) |

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
| VALIDÉ | NEXORA web répond | 200 en 147 ms |
| VALIDÉ | Back office répond | 200 en 145 ms |
| VALIDÉ | NEXORA web répond (/studio/) | 200 en 30 ms |
| VALIDÉ | Version en ligne identique à dist/ | 673 fichiers comparés (back office et bibliothèques exclus) |

## 19. Référencement et PWA

| Statut | Contrôle | Détail |
|---|---|---|
| VALIDÉ | robots.txt ouvert aux moteurs et aux IA, plan du site déclaré | 200 |
| VALIDÉ | sitemap.xml publié | 200, 14 adresses |
| VALIDÉ | llms.txt (assistants IA) | 200 |
| VALIDÉ | Manifeste de la PWA | 200 |
| VALIDÉ | Service worker de la PWA | 200 |
| VALIDÉ | Pages pré-générées (titre, canonique et données structurées propres à /tarifs) | 200 |

## 0. Code et publication

| Statut | Contrôle | Détail |
|---|---|---|
| VALIDÉ | Processus principal (pnpm check) | Code vérifié : 87 fichiers JavaScript, aucune erreur. |
| VALIDÉ | Types du back office (tsc --noEmit) | aucune erreur |
| VALIDÉ | Types du site vitrine (tsc --noEmit) | aucune erreur |
| VALIDÉ | Types de l’espace des parrains (tsc --noEmit) | aucune erreur |
| VALIDÉ | Fichiers indispensables de dist/ | index.html, tarifs.html, 404.html, admin/index.html, referral/index.html, _headers, _redirects, robots.txt, sitemap.xml, llms.txt, manifest.webmanifest, sw.js, studio/index.html, studio/nx/boot.js |
