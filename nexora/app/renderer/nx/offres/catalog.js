// NEXORA #037 : catalogue des offres Gratuit, Standard et Pro (copie de la migration
// supabase/migrations/20261104000007_offres_limites.sql). Sert tant que les serveurs n'ont pas la migration,
// pour les invités, et pour le tableau comparatif (libellés des limites et des fonctions).

const FREE_PERMS = {
  responsive: true, browser: true, multiscreen: true, dashboard: true,
  design_extended: false, design_full: false, responsive_advanced: false,
  source_import: false, apk: false, pwa: false, play_publish: false,
  crawler: false, audits_advanced: false, devlab: false, desktop_builder: false,
  push: false, inapp: false, alerts: false, projects_management: false,
  standard_support: false, studio_advanced: false, transform_extended: false,
  projects_multi: false, notifications_advanced: false, messaging_events: false,
  automation: false, custom_notifications: false, api_sdk: false, integrations: false,
  priority_support: false, early_access: false,
  // NEXORA #048 : page de statut publique (Standard), parcours rejoués et deuxième région (Pro).
  status_page: false, synthetic: false, multi_region: false,
  // NEXORA #052 : outils Pro du Dev Lab (assistant IA du projet, débogueur, mise en ligne, contrôles, bases de données).
  devlab_pro: false,
};
// NEXORA #076 : deux offres seulement. Gratuit : Responsive Lab et Browser Lab complets (produits d'appel), tout
// NEXORA pendant le premier jour (essai Pro décompté par le serveur), puis les limites. Pro (18 $ par mois) : tout.
FREE_PERMS.responsive_advanced = true;
FREE_PERMS.crawler = true;
const PRO_PERMS = Object.fromEntries(Object.keys(FREE_PERMS).map((k) => [k, true]));

export const FALLBACK = {
  free: {
    id: 'free', name: 'Gratuit', description: 'Le Responsive Lab et le Browser Lab, gratuits pour toujours. Tout NEXORA pendant ton premier jour.', price_month_cents: 0, price_year_cents: 0,
    currency: 'USD', sort: 1, badge: '', perms: FREE_PERMS,
    limits: { projects: 3, designs: 3, members: 1, monitors: 1, storage_mb: 200, apps: 0, app_trial_days: 0, ai_requests_month: -1, scans_per_day: 1, crawls_per_day: -1, builds_month: 0, push_month: 0 },
    features: ['Responsive Lab complet : tous les modèles d’appareils, vidéo et outils de développement', 'Browser Lab complet : inspection, réseau, console, tests et extraction', 'Tout NEXORA gratuitement pendant ton premier jour', 'NEX-DESIGN découverte (3 documents)', '1 audit de sécurité par jour, 1 site surveillé', 'Assistant IA avec ta propre clé'],
  },
  pro: {
    id: 'pro', name: 'Pro', description: 'Toutes les options de NEXORA Devs Toolbox, sans limite d’espace.', price_month_cents: 1800, price_year_cents: 18000,
    currency: 'USD', sort: 2, badge: 'Toutes les options', perms: PRO_PERMS,
    limits: { projects: 200, designs: -1, members: 10, monitors: 50, storage_mb: 51200, apps: 50, app_trial_days: 0, ai_requests_month: -1, scans_per_day: 200, crawls_per_day: -1, builds_month: 400, push_month: 100000 },
    features: ['Les 9 espaces sans restriction', 'Dev Lab complet : éditeur, terminal, Git, débogueur, tests, bases de données, mise en ligne', 'App Builder : APK, PWA, Play Store, notifications et messagerie (400 constructions par mois)', 'Desktop Builder : logiciels Windows installables et mises à jour', 'NEX-DESIGN complet : documents illimités, IA, prototype, code, équipe', 'Studio 3D & Motion avancé', 'Sécurité : audits avancés, 50 sites surveillés 24 h/24, page de statut', '200 projets, 10 membres, 50 Go', 'Assistance prioritaire'],
  },
};
// L'ancienne offre Standard (et Équipe, Entreprise) est traitée comme Pro.
FALLBACK.standard = FALLBACK.pro;
export const PLAN_ORDER = ['free', 'pro'];
export const normPlan = (id) => (['standard', 'team', 'enterprise'].includes(id) ? 'pro' : FALLBACK[id] ? id : id || 'free');
export const planOf = (id) => FALLBACK[normPlan(id)] || FALLBACK.free;
export const PLAN_LOOK = {
  free: { object: 'plane', tone: 'turquoise', icon: 'nxSend' },
  standard: { object: 'crown', tone: 'jaune', icon: 'nxCrown' },
  pro: { object: 'crown', tone: 'jaune', icon: 'nxCrown' },
};

// Quotas affichés : [clé, libellé, unité, portée] ; org : données de l'espace, user : consommation du compte.
export const METERS = [
  ['projects', 'Projets', '', 'org', 'folder'],
  ['designs', 'Documents NEX-DESIGN', '', 'org', 'image'],
  ['members', 'Membres de l’espace', '', 'org', 'group'],
  ['monitors', 'Sites surveillés', '', 'org', 'sync'],
  ['storage_mb', 'Stockage', 'Mo', 'org', 'download'],
  ['apps', 'Applications', '', 'user', 'android'],
  ['builds_month', 'Constructions ce mois-ci', '', 'user', 'wrench'],
  ['scans_per_day', 'Audits de sécurité aujourd’hui', '', 'user', 'shield'],
  ['crawls_per_day', 'Crawls aujourd’hui', '', 'user', 'globe'],
  ['push_month', 'Envois push ce mois-ci', '', 'user', 'bell'],
];

// Tableau comparatif : { label, perm } (coche), { label, limit } (nombre), { label, text: { free, pro } }.
export const COMPARE = [
  ['Création', [
    { label: 'NEX-DESIGN', text: { free: 'Découverte', pro: 'Complet' } },
    { label: 'Documents NEX-DESIGN', limit: 'designs' },
    { label: 'Projets', limit: 'projects' },
    { label: 'Projets multiples et gestion avancée', perm: 'projects_multi' },
    { label: 'Création et transformation étendues', perm: 'transform_extended' },
    { label: 'Studio 3D avancé', perm: 'studio_advanced' },
    { label: 'NEX-DESIGN : mise en page automatique, accessibilité, mesures, polices', text: { free: 'Inclus', pro: 'Inclus' } },
    { label: 'NEX-DESIGN : variables, variantes, prototype, code, série, impression, PSD, icônes, versions', perm: 'design_extended' },
    { label: 'NEX-DESIGN : IA, code vers le Dev Lab, validation client, bibliothèques d’équipe, import Figma', perm: 'design_full' },
  ]],
  ['Applications', [
    { label: 'Applications', limit: 'apps', note: { free: 'pendant l’essai du premier jour' } },
    { label: 'Source des applications', text: { free: '—', pro: 'Web, dossier, code' } },
    { label: 'Génération Android et APK', perm: 'apk' },
    { label: 'Constructions par mois', limit: 'builds_month' },
    { label: 'Paquet PWA et publication Play Store', perm: 'play_publish' },
  ]],
  ['Labs et outils', [
    { label: 'Responsive Lab : tous les modèles d’appareils, multi-écrans', perm: 'responsive' },
    { label: 'Responsive avancé', perm: 'responsive_advanced' },
    { label: 'Browser : navigation et consultation', perm: 'browser' },
    { label: 'Crawler (aspirateur de site)', perm: 'crawler' },
    { label: 'Crawls par jour', limit: 'crawls_per_day' },
    { label: 'Audits avancés et tests', perm: 'audits_advanced' },
    { label: 'Audits de sécurité par jour', limit: 'scans_per_day' },
    { label: 'Import de projets et de code source', perm: 'source_import' },
    { label: 'Dev Lab : dossiers, éditeur, terminal, Git, GitHub, VS Code et aperçu', perm: 'devlab' },
    { label: 'Partage en ligne d’un projet (adresse publique temporaire)', perm: 'devlab' },
    { label: 'Desktop Builder', perm: 'desktop_builder' },
    { label: 'Dev Lab avancé : Problèmes, scripts, variables protégées, Git avancé, API, tests, dépendances', perm: 'devlab' },
    { label: 'Dev Lab Pro : assistant IA du projet, débogueur, mise en ligne, contrôles, bases de données', perm: 'devlab_pro' },
  ]],
  ['Sécurité et supervision', [
    { label: 'Audit de sécurité du site et du domaine', text: { free: '1 par jour', pro: 'Inclus' } },
    { label: 'Audits programmés, code, applications et correctifs écrits', perm: 'audits_advanced' },
    { label: 'Page de statut publique', perm: 'status_page' },
    { label: 'Parcours rejoués', perm: 'synthetic' },
    { label: 'Confirmation depuis une deuxième région', perm: 'multi_region' },
    { label: 'Visiteurs réels, intégration continue et SARIF', perm: 'api_sdk' },
  ]],
  ['Intelligence artificielle', [
    { label: 'Assistant IA avec ta propre clé (Claude, GPT, Gemini, Mistral, Ollama…)', text: { free: 'Sans limite', pro: 'Sans limite' } },
  ]],
  ['Notifications et automatisations', [
    { label: 'Notifications push et in-app', perm: 'push' },
    { label: 'Envois push par mois', limit: 'push_month' },
    { label: 'Alertes et rappels par e-mail', perm: 'alerts' },
    { label: 'Notifications avancées et personnalisées', perm: 'custom_notifications' },
    { label: 'Événements de messagerie', perm: 'messaging_events' },
    { label: 'Automatisations', perm: 'automation' },
  ]],
  ['Intégrations', [
    { label: 'API et SDK', perm: 'api_sdk' },
    { label: 'Outils d’intégration (achats intégrés…)', perm: 'integrations' },
  ]],
  ['Équipe et assistance', [
    { label: 'Membres par espace', limit: 'members' },
    { label: 'Sites surveillés', limit: 'monitors' },
    { label: 'Stockage', limit: 'storage_mb', unit: 'Mo' },
    { label: 'Tableau de bord', perm: 'dashboard' },
    { label: 'Assistance', text: { free: 'Depuis NEXORA', pro: 'Prioritaire' } },
  ]],
];

// Fonctions contrôlées (mêmes noms que nx_use_feature) : libellé et permission.
export const FEATURES = {
  apk: ['La génération d’APK', 'apk'], pwa: ['Le paquet PWA', 'pwa'], source_import: ['L’import de dossiers et de code source', 'source_import'],
  play_publish: ['La publication sur le Play Store', 'play_publish'], push: ['Les notifications push', 'push'], inapp: ['Les messages in-app', 'inapp'],
  automation: ['Les notifications programmées et les automatisations', 'automation'], custom_notifications: ['Les notifications personnalisées', 'custom_notifications'],
  // NEXORA #073 : messagerie des applications Android (style conversation, réponse depuis la notification, appels).
  messaging_events: ['La messagerie des applications (conversations, réponses, appels entrants)', 'messaging_events'],
  integrations: ['Les achats intégrés et les outils d’intégration', 'integrations'], api_sdk: ['L’API et le SDK de statistiques', 'api_sdk'],
  crawler: ['Le Crawler (aspirateur de site)', 'crawler'], audit_advanced: ['Les tests et audits avancés', 'audits_advanced'],
  devlab: ['Le Dev Lab avancé', 'devlab'], desktop_builder: ['Le Desktop Builder', 'desktop_builder'], studio_advanced: ['Le Studio 3D avancé', 'studio_advanced'],
  design_extended: ['NEX-DESIGN étendu', 'design_extended'], design_full: ['NEX-DESIGN complet', 'design_full'],
  responsive_advanced: ['Le Responsive avancé', 'responsive_advanced'],
  alerts: ['Les alertes par e-mail', 'alerts'], scan: ['L’audit de sécurité', null], ai: ['L’assistant IA', null],
  ci_export: ['L’intégration continue et l’export SARIF', 'api_sdk'], rum: ['La mesure des visiteurs réels', 'api_sdk'],
  synthetic: ['Les parcours rejoués', 'synthetic'], status_page: ['La page de statut publique', 'status_page'],
  multi_region: ['La confirmation depuis une deuxième région', 'multi_region'],
  devlab_pro: ['Les outils Pro du Dev Lab', 'devlab_pro'],
};
// Offre la moins chère qui inclut une permission.
export function neededPlan(perm) {
  return PLAN_ORDER.find((id) => !perm || FALLBACK[id].perms[perm]) || 'pro';
}

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
export const money = (cents) => `${nf.format((Number(cents) || 0) / 100)} $`;
export const count = (n) => new Intl.NumberFormat('fr-FR').format(Number(n) || 0);
export function limitText(v, unit = '') {
  const n = Number(v);
  if (v == null || n < 0) return 'Illimité';
  if (n === 0) return 'Non inclus';
  if (unit === 'Mo' && n >= 1024) return `${nf.format(n / 1024)} Go`;
  return `${count(n)}${unit ? ` ${unit}` : ''}`;
}
