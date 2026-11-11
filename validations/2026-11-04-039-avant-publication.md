# Validation avant mise en production — 039-avant-publication

- Date : 4 novembre 2026 à 21:06
- NEXORA 1.1.0, espace de travail au commit `7958a34`
- Site contrôlé : https://nexora.abrahamtogbonon0.workers.dev/
- Commande : `pnpm valider --label 039-avant-publication --charge`
- Verdict : **Mise en production bloquée** : 7 contrôles en échec.
- Bilan : 34 OK, 7 en échec, 9 en alerte, 2 à vérifier ailleurs

Légende : OK vérifié ici ; ÉCHEC bloquant ; ALERTE à corriger ou à accepter explicitement ; EXTERNE non vérifiable depuis cet environnement (procédure dans `CHECKLIST-PRODUCTION.md`). Les contrôles manuels de la checklist restent à mener pour chaque mise en production.

## 1. Authentification

| Statut | Contrôle | Détail |
|---|---|---|
| OK | Vérification de l'e-mail exigée à l'inscription | confirmation par e-mail obligatoire |
| OK | Mots de passe : longueur minimale | 8 caractères |
| ALERTE | Mots de passe divulgués refusés | désactivé (option des offres payantes de Supabase) |
| OK | Sessions : expiration et rotation des jetons | jeton d'accès 60 min, rotation active |
| ALERTE | Inscriptions protégées contre les robots | inscriptions ouvertes sans captcha |
| OK | Liens des e-mails (adresse du site, redirections) | https://nexora.abrahamtogbonon0.workers.dev/, 6 redirections |
| OK | Limites anti-abus de l'authentification | vérifications 30/5 min, renouvellements 150/5 min, codes 30/5 min |
| OK | Moyens de connexion ouverts | email ; téléphone fermé (sans objet) |
| EXTERNE | Essais avec un compte (connexion, rôles, déconnexion) | définir NX_TEST_EMAIL et NX_TEST_PASSWORD (compte simple réservé aux essais) et lancer depuis un terminal ordinaire |

## 2. Base de données

| Statut | Contrôle | Détail |
|---|---|---|
| ÉCHEC | Sauvegardes restaurables | aucune sauvegarde restaurable (offre gratuite de Supabase) : faire une sauvegarde manuelle avant toute migration (CHECKLIST-PRODUCTION.md, section 2) |
| OK | Sécurité des lignes (RLS) sur toutes les tables | RLS active partout |
| ÉCHEC | Migrations appliquées en ligne | non appliquées : 20261104000007_offres_limites.sql (19 objets absents : nx_quota_usage, nx_app_trials, nx_org_plan, nx_plan_rank, nx_user_plan…) — back office → Supabase → « Tout appliquer » |
| OK | Visiteur anonyme : aucune donnée privée lisible | 36 tables : 8 refusées, les autres vides pour un anonyme ; publiques : plans, feature_flags, app_config |

## 3. API et erreurs

| Statut | Contrôle | Détail |
|---|---|---|
| OK | Adresse inconnue : erreur propre | 404 |
| OK | Relais Supabase : refus sans jeton | 401 |
| OK | Relais Supabase : autres projets refusés | 403 |
| OK | Fonctions Edge actives | admin-users, org-invite, security-scan, site-info |
| OK | Fonctions d'administration refusées sans compte | admin_stats, admin_users, admin_orgs, nx_email_quota |
| OK | Fonctions Edge : compte exigé | 4 fonctions refusent un anonyme |

## 4. Offres et règles

| Statut | Contrôle | Détail |
|---|---|---|
| OK | Essais des offres : canaux, quotas atomiques, essais, limites (pnpm test:offres) | 64 vérifications, aucun échec. |
| ÉCHEC | Offres et prix en ligne conformes au catalogue | absentes ou prix différents : standard, pro ; en ligne : free 0 $, pro 9 $, team 29 $, enterprise 0 $ |

## 8. Notifications et e-mails

| Statut | Contrôle | Détail |
|---|---|---|
| OK | Envoi des e-mails des comptes par Brevo | SMTP smtp-relay.brevo.com |
| ÉCHEC | Limite horaire des e-mails des comptes | 2 par heure : au-delà, inscriptions et mots de passe oubliés sans e-mail ; back office → Supabase → « Appliquer la configuration recommandée » (30 par heure) |
| ÉCHEC | E-mails des comptes en français (modèles appliqués) | objet par défaut en anglais (« Confirm your email address ») : back office → E-mails → « Appliquer les modèles » |

## 10. Sécurité

| Statut | Contrôle | Détail |
|---|---|---|
| OK | Aucun secret dans les fichiers envoyés sur GitHub | 3 jetons locaux cherchés et motifs génériques (GitHub, Supabase, Brevo) : aucun résultat |
| ALERTE | Textes visibles sans détail technique ni ancien nom | à relire (texte affiché ou interne ?) : admin/src/auth.tsx:190, admin/src/emails/templates.ts:175, admin/src/emails/templates.ts:354, admin/src/emails/templates.ts:432, admin/src/emails/templates.ts:501 |
| OK | HTTPS | https://nexora.abrahamtogbonon0.workers.dev/ |
| ÉCHEC | En-têtes de sécurité du site (nosniff, Referrer-Policy) | absents en ligne : publier la version qui contient dist/_headers (#039) |
| ÉCHEC | Back office protégé contre l'affichage dans un cadre (clics détournés) | en-têtes absents en ligne |
| OK | Politique de sécurité (CSP) de NEXORA web | présente dans la page |
| ALERTE | Connexions directes à la base : SSL imposé | non imposé (tableau de bord Supabase → Database → SSL) |
| ALERTE | Connexions directes à la base : adresses autorisées | toutes les adresses (mot de passe de la base seul rempart) |
| OK | Conseiller de sécurité : aucune erreur | 42 remarques, aucune de niveau erreur |
| OK | Fonctions privilégiées appelables sans compte | seulement les fonctions publiques prévues (app_track, get_shared, nx_can_read_org, nx_can_edit_org, monitor_incident_action) ; 30 fonctions réservées aux comptes connectés, qui contrôlent elles-mêmes les droits (refus vérifiés par l'essai avec un compte simple) |
| ALERTE | Fonctions au chemin de recherche fixé | nx_html, nx_duration, nx_monitor_reason, nx_email_render, nx_strip_icon : corrigé dans les migrations (#039), à réappliquer (back office → Supabase → « Tout appliquer ») |
| OK | Réglages lisibles sans compte | signups_enabled, maintenance, support_email, desktop_download_url |

## 11. Performance

| Statut | Contrôle | Détail |
|---|---|---|
| OK | Compression des fichiers | page et 3 fichiers : br |
| OK | Cache validé (ETag, revalidation) | 3/3 fichiers avec ETag ; Cache-Control : public, max-age=0, must-revalidate |
| OK | Temps de réponse du site | le plus lent : 230 ms (5 requêtes depuis cet environnement) |
| ALERTE | Conseiller de performance de la base | unindexed_foreign_keys 30, auth_rls_initplan 5 (avertissement), unused_index 12, multiple_permissive_policies 8 (avertissement), duplicate_index 1 (avertissement) |

## 12. Tâches automatiques

| Statut | Contrôle | Détail |
|---|---|---|
| EXTERNE | Tâches planifiées (pg_cron) actives | lecture SQL impossible en GET : back office → Supabase → « Vérification de la configuration » (ligne « Tâches planifiées ») |

## 16. Surveillance

| Statut | Contrôle | Détail |
|---|---|---|
| OK | Santé des services Supabase | ACTIVE_HEALTHY ; 5/5 services sains |

## 17. Charge

| Statut | Contrôle | Détail |
|---|---|---|
| OK | 100 visiteurs simultanés | 400 requêtes en 1.1 s (363/s), erreurs 0.3 %, médiane 235 ms, p95 382 ms, p99 394 ms |
| OK | 500 visiteurs simultanés | 2000 requêtes en 5.1 s (394/s), erreurs 0.0 %, médiane 1088 ms, p95 1735 ms, p99 2273 ms |
| ALERTE | 1000 visiteurs simultanés | 4000 requêtes en 10.2 s (392/s), erreurs 0.1 %, médiane 2243 ms, p95 3692 ms, p99 4435 ms |

## 18. Publication

| Statut | Contrôle | Détail |
|---|---|---|
| OK | NEXORA web répond | 200 en 230 ms |
| OK | Back office répond | 200 en 115 ms |
| ALERTE | Version en ligne identique à dist/ | 1 fichier différent sur 228 (publication en attente ?) : index.html |

## Code et publication

| Statut | Contrôle | Détail |
|---|---|---|
| OK | Processus principal (pnpm check) | Code vérifié : 56 fichiers JavaScript, aucune erreur. |
| OK | Types du back office (tsc --noEmit) | aucune erreur |
| OK | Publication web (pnpm build) | Version web de NEXORA construite dans dist/ : 428 fichiers, 29.5 Mo. |
| OK | Fichiers indispensables de dist/ | index.html, admin/index.html, _headers, nx/boot.js |
