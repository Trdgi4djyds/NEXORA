// Données de démonstration du back office, pour `pnpm captures:admin` uniquement : le Chromium des
// captures intercepte les appels à Supabase et reçoit ces réponses (même forme que l'API réelle,
// d'après admin/src/database.types.ts). Personnes et sites fictifs : aucune donnée réelle dans les
// captures rangées dans captures/.
const now = Date.now()
const ago = (days, hours = 0) =>
  new Date(now - days * 86400000 - hours * 3600000).toISOString()
const hex = (n, len) =>
  ((n * 2654435761) >>> 0).toString(16).padStart(8, "0").repeat(2).slice(0, len)
const id = (n) =>
  `${hex(n, 8)}-${hex(n + 7, 4)}-4${hex(n + 3, 3)}-8${hex(n + 5, 3)}-${hex(n + 11, 12)}`

const people = [
  [
    "Camille Laurent",
    "camille.laurent@exemple.fr",
    "superadmin",
    "active",
    120,
    0.02,
    "NEXORA",
    "Fondatrice",
  ],
  [
    "Hugo Bernard",
    "hugo.bernard@exemple.fr",
    "admin",
    "active",
    96,
    0.3,
    "NEXORA",
    "Support",
  ],
  [
    "Léa Moreau",
    "lea@studio-moreau.fr",
    "user",
    "active",
    64,
    0.1,
    "Studio Moreau",
    "Directrice artistique",
  ],
  [
    "Nathan Petit",
    "nathan.petit@exemple.com",
    "user",
    "active",
    41,
    1.5,
    "Freelance",
    "Développeur web",
  ],
  [
    "Inès Garcia",
    "ines.garcia@agence-pixel.fr",
    "user",
    "active",
    30,
    0.6,
    "Agence Pixel",
    "Cheffe de projet",
  ],
  [
    "Lucas Roux",
    "lucas.roux@exemple.com",
    "user",
    "suspended",
    22,
    12,
    null,
    null,
  ],
  [
    "Chloé Fontaine",
    "chloe@fontaine.design",
    "user",
    "active",
    9,
    0.2,
    "Fontaine Design",
    "UX designer",
  ],
  [
    "Yanis Mercier",
    "yanis.mercier@exemple.fr",
    "user",
    "active",
    3,
    0.05,
    null,
    "Étudiant",
  ],
  [
    "Manon Lefèvre",
    "manon.lefevre@agence-pixel.fr",
    "user",
    "active",
    1,
    0.01,
    "Agence Pixel",
    "Intégratrice",
  ],
]
export const profiles = people.map(
  (
    [full_name, email, app_role, status, days, seen, company, job_title],
    i,
  ) => ({
    id: id(i + 1),
    full_name,
    email,
    app_role,
    status,
    company,
    job_title,
    avatar_url: null,
    locale: "fr",
    timezone: "Europe/Paris",
    onboarding_done: i !== 7,
    created_at: ago(days),
    updated_at: ago(seen),
    last_seen_at: ago(seen),
  }),
)
const P = (i) => profiles[i]
const person = (i) => ({
  id: P(i).id,
  full_name: P(i).full_name,
  email: P(i).email,
  avatar_url: null,
})

// Offres du #037 (copie de supabase/migrations/20261104000007_offres_limites.sql) : Gratuit, Standard et Pro en
// dollars ; Équipe et Entreprise retirées de la vente (gardées pour l'historique).
const FREE_PERMS = Object.fromEntries(
  [
    "responsive",
    "browser",
    "multiscreen",
    "dashboard",
    "design_extended",
    "design_full",
    "responsive_advanced",
    "source_import",
    "apk",
    "pwa",
    "play_publish",
    "crawler",
    "audits_advanced",
    "devlab",
    "desktop_builder",
    "push",
    "inapp",
    "alerts",
    "projects_management",
    "standard_support",
    "studio_advanced",
    "transform_extended",
    "projects_multi",
    "notifications_advanced",
    "messaging_events",
    "automation",
    "custom_notifications",
    "api_sdk",
    "integrations",
    "priority_support",
    "early_access",
  ].map((k, i) => [k, i < 4]),
)
const STANDARD_PERMS = {
  ...FREE_PERMS,
  ...Object.fromEntries(
    [
      "design_extended",
      "responsive_advanced",
      "source_import",
      "apk",
      "pwa",
      "play_publish",
      "crawler",
      "audits_advanced",
      "devlab",
      "desktop_builder",
      "push",
      "inapp",
      "alerts",
      "projects_management",
      "standard_support",
    ].map((k) => [k, true]),
  ),
}
const PRO_PERMS = Object.fromEntries(
  Object.keys(FREE_PERMS).map((k) => [k, true]),
)
export const plans = [
  {
    id: "free",
    name: "Gratuit",
    description: "Découvre NEXORA et teste tes premières applications.",
    price_month_cents: 0,
    price_year_cents: 0,
    currency: "USD",
    sort: 1,
    active: true,
    badge: "",
    perms: FREE_PERMS,
    limits: {
      projects: 3,
      designs: 3,
      members: 1,
      monitors: 1,
      storage_mb: 200,
      apps: 2,
      app_trial_days: 7,
      ai_requests_month: 30,
      scans_per_day: 3,
      crawls_per_day: 0,
      builds_month: 0,
      push_month: 0,
    },
    features: [
      "NEX-DESIGN limité (3 documents)",
      "2 applications créées depuis une adresse web, essai de 7 jours chacune",
      "Responsive Design et prévisualisation multi-écrans",
      "Browser : navigation et consultation de sites",
      "Tableau de bord",
      "30 requêtes IA par mois, 3 audits de sécurité par jour",
    ],
  },
  {
    id: "standard",
    name: "Standard",
    description: "Pour créer, importer et publier tes projets.",
    price_month_cents: 1000,
    price_year_cents: 10000,
    currency: "USD",
    sort: 2,
    active: true,
    badge: "Le plus choisi",
    perms: STANDARD_PERMS,
    limits: {
      projects: 25,
      designs: 50,
      members: 3,
      monitors: 10,
      storage_mb: 5120,
      apps: 10,
      app_trial_days: 0,
      ai_requests_month: 500,
      scans_per_day: 30,
      crawls_per_day: 20,
      builds_month: 60,
      push_month: 10000,
    },
    features: [
      "Tout le Gratuit, sans limite d’essai",
      "Import de projets web et de code source",
      "Génération Android et APK (60 constructions par mois)",
      "NEX-DESIGN étendu (50 documents)",
      "Responsive avancé, Crawler et audits avancés",
      "Dev Lab, Desktop Builder et prévisualisation",
      "500 requêtes IA par mois",
      "Notifications push et in-app, alertes et rappels",
      "Gestion de projets (25 projets, 3 membres)",
      "Assistance standard",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    description: "Toute la puissance de NEXORA, sans compromis.",
    price_month_cents: 2500,
    price_year_cents: 25000,
    currency: "USD",
    sort: 3,
    active: true,
    badge: "Tout inclus",
    perms: PRO_PERMS,
    limits: {
      projects: 200,
      designs: -1,
      members: 10,
      monitors: 50,
      storage_mb: 51200,
      apps: 50,
      app_trial_days: 0,
      ai_requests_month: 3000,
      scans_per_day: 200,
      crawls_per_day: 150,
      builds_month: 400,
      push_month: 100000,
    },
    features: [
      "Tout Standard",
      "NEX-DESIGN complet, documents illimités",
      "Création et transformation étendues (400 constructions par mois)",
      "Projets multiples (200 projets, 10 membres)",
      "3 000 requêtes IA par mois",
      "Studio 3D avancé",
      "Notifications avancées et personnalisées, événements de messagerie",
      "Automatisations",
      "API, SDK et outils d’intégration",
      "Support prioritaire et accès en avant-première aux nouveautés",
    ],
  },
  {
    id: "team",
    name: "Équipe",
    description: "Ancienne offre, remplacée par Pro",
    price_month_cents: 2900,
    price_year_cents: 29000,
    currency: "EUR",
    sort: 13,
    active: false,
    badge: "",
    perms: PRO_PERMS,
    limits: {
      projects: -1,
      designs: -1,
      members: 25,
      monitors: 50,
      storage_mb: 102400,
      scans_per_day: -1,
    },
    features: ["Membres et rôles", "Support prioritaire"],
  },
].map((p) => ({ ...p, created_at: ago(120), updated_at: ago(5) }))

const orgDefs = [
  ["Espace de Camille Laurent", true, 0, "free"],
  ["Espace de Hugo Bernard", true, 1, "free"],
  ["Studio Moreau", false, 2, "standard"],
  ["Espace de Nathan Petit", true, 3, "pro"],
  ["Agence Pixel", false, 4, "pro"],
  ["Espace de Lucas Roux", true, 5, "free"],
  ["Fontaine Design", false, 6, "standard"],
  ["Espace de Yanis Mercier", true, 7, "free"],
]
export const organizations = orgDefs.map(([name, personal, owner], i) => ({
  id: id(100 + i),
  name,
  personal,
  owner_id: P(owner).id,
  slug: `o-${i}`,
  logo_url: null,
  created_at: P(owner).created_at,
  updated_at: ago(2),
}))
const O = (i) => organizations[i]
const orgRef = (i) => ({ name: O(i).name })
export const subscriptions = orgDefs.map(([, , , plan], i) => ({
  id: id(200 + i),
  org_id: O(i).id,
  plan_id: plan,
  status: i === 6 ? "trialing" : "active",
  seats: i === 4 ? 6 : 1,
  current_period_end: plan === "free" ? null : ago(-18 + i),
  provider: plan === "free" ? "manual" : "stripe",
  provider_ref: plan === "free" ? null : `sub_demo${i}`,
  created_at: O(i).created_at,
  updated_at: ago(3),
}))
const memberDefs = [
  [0, 0, "owner"],
  [1, 1, "owner"],
  [2, 2, "owner"],
  [3, 3, "owner"],
  [4, 4, "owner"],
  [4, 8, "editor"],
  [4, 3, "viewer"],
  [5, 5, "owner"],
  [6, 6, "owner"],
  [7, 7, "owner"],
  [2, 6, "editor"],
]
export const organization_members = memberDefs.map(([o, u, role]) => ({
  org_id: O(o).id,
  user_id: P(u).id,
  role,
  created_at: O(o).created_at,
  organizations: {
    id: O(o).id,
    name: O(o).name,
    personal: O(o).personal,
    slug: O(o).slug,
    subscriptions: [
      { plan_id: subscriptions[o].plan_id, status: subscriptions[o].status },
    ],
  },
  profiles: person(u),
}))

export const feature_flags = [
  ["android", "App Builder (APK, PWA, Play Store)", true, 100, []],
  ["design", "Espace NEX-DESIGN (design 2D et calques 3D)", true, 100, []],
  [
    "ai_assistant",
    "Assistant IA dans tous les espaces",
    true,
    60,
    ["pro", "team"],
  ],
  ["responsive", "Responsive Lab dans le navigateur", true, 100, []],
  ["security", "Audits de sécurité et supervision", true, 100, []],
  [
    "studio",
    "3D & Motion Studio (scènes, maquettes, présentations)",
    true,
    100,
    [],
  ],
  ["team_comments", "Commentaires sur les designs", false, 20, ["team"]],
].map(([key, description, enabled, rollout, plans], i) => ({
  key,
  description,
  enabled,
  rollout,
  plans,
  updated_by: null,
  updated_at: ago(30 - i * 3),
}))

export const app_config = [
  ["default_plan", "free", "Offre attribuée aux nouveaux espaces"],
  [
    "maintenance",
    {
      enabled: false,
      message:
        "NEXORA est en maintenance, merci de revenir dans quelques minutes.",
    },
    "Mode maintenance (bandeau et lecture seule)",
  ],
  ["signups_enabled", true, "Les nouvelles inscriptions sont ouvertes"],
  ["support_email", "support@nexora.app", "Adresse affichée dans l’aide"],
  ["min_app_version", "1.0.0", "Version minimale de l’application Windows"],
  [
    "email_templates",
    {},
    "Modèles des e-mails envoyés par la base (NEXORA #031), enregistrés depuis le back office → E-mails",
  ],
].map(([key, value, description], i) => ({
  key,
  value,
  description,
  updated_by: null,
  updated_at: ago(40 - i * 5),
}))

export const devices = [
  [0, "windows", "Application Windows", "1.0.0", 0.02],
  [1, "windows", "Application Windows", "1.0.0", 0.3],
  [1, "web", "Linux x86_64", "1.0.0", 2],
  [2, "windows", "Application Windows", "1.0.0", 0.1],
  [3, "windows", "Application Windows", "0.9.8", 1.5],
  [4, "web", "macOS", "1.0.0", 0.6],
  [6, "windows", "Application Windows", "1.0.0", 0.2],
  [7, "web", "Windows", "1.0.0", 0.05],
  [8, "windows", "Application Windows", "1.0.0", 0.01],
].map(([u, platform, name, app_version, seen], i) => ({
  id: id(300 + i),
  user_id: P(u).id,
  platform,
  name,
  app_version,
  last_seen_at: ago(seen),
  created_at: ago(P(u) ? 20 - i : 1),
  profiles: person(u),
}))

export const invitations = [
  [4, "romain@agence-pixel.fr", "editor", "pending", 2, 4],
  [4, "sarah@agence-pixel.fr", "viewer", "accepted", 9, 4],
  [2, "client@marque.fr", "viewer", "pending", 12, 2],
].map(([o, email, role, status, days, by], i) => ({
  id: id(400 + i),
  org_id: O(o).id,
  email,
  role,
  status,
  token: `tok${i}`,
  invited_by: P(by).id,
  created_at: ago(days),
  expires_at: ago(days - 7),
  organizations: orgRef(o),
  profiles: { full_name: P(by).full_name },
}))

export const projects = [
  ["Boutique Moreau", "https://boutique-moreau.fr", "site", 2],
  ["Portfolio", "https://nathanpetit.dev", "site", 3],
  ["nexora-web", null, "folder", 0],
  ["Refonte Pixel", "https://agence-pixel.fr", "site", 4],
  ["Appli Fontaine", "https://fontaine.design", "site", 6],
  ["Landing produit", "https://produit-pixel.fr", "site", 4],
].map(([name, url, kind, o], i) => ({
  id: id(500 + i),
  name,
  url,
  kind,
  archived: i === 2,
  pinned: i === 0,
  org_id: O(o).id,
  created_at: ago(40 - i * 6),
  updated_at: ago(i),
  organizations: orgRef(o),
}))
export const design_documents = [
  ["Charte graphique", 6, 2_400_000, 2],
  ["Maquettes mobile", 12, 5_100_000, 4],
  ["Mon premier design", 1, 1_472_235, 7],
  ["Affiche salon", 2, 900_000, 6],
].map(([name, pages_count, size_bytes, o], i) => ({
  id: id(600 + i),
  name,
  pages_count,
  size_bytes,
  version: 3 + i,
  thumb: null,
  deleted_at: null,
  org_id: O(o).id,
  updated_at: ago(i * 2, 3),
  organizations: orgRef(o),
}))
export const studio_items = [
  ["Présentation client", "deck", 4],
  ["Scène iPhone", "scene", 2],
  ["Maquette tablette", "mockup", 6],
].map(([name, kind, o], i) => ({
  id: id(700 + i),
  name,
  kind,
  version: 2,
  thumb: null,
  org_id: O(o).id,
  updated_at: ago(i + 1),
  organizations: orgRef(o),
}))
export const device_boards = [
  ["Planche e-commerce", 5, 2],
  ["Tests mobiles", 8, 4],
].map(([name, n, o], i) => ({
  id: id(800 + i),
  name,
  devices: Array.from({ length: n }, (_, k) => ({ id: `d${k}` })),
  org_id: O(o).id,
  updated_at: ago(i + 2),
  organizations: orgRef(o),
}))
export const share_links = [
  {
    id: id(850),
    target_type: "design",
    target_id: design_documents[1].id,
    token: "c3hhcmVkZW1vdG9rZW4",
    expires_at: ago(-10),
    created_at: ago(3),
    org_id: O(4).id,
    organizations: orgRef(4),
  },
]
export const comments = [
  {
    id: id(860),
    body: "Le bouton principal manque de contraste sur mobile.",
    target_type: "design",
    resolved: false,
    created_at: ago(1),
    org_id: O(4).id,
    organizations: orgRef(4),
    profiles: { full_name: P(8).full_name },
  },
  {
    id: id(861),
    body: "Validé pour la version 2.",
    target_type: "design",
    resolved: true,
    created_at: ago(4),
    org_id: O(4).id,
    organizations: orgRef(4),
    profiles: { full_name: P(4).full_name },
  },
]
export const assets = [
  ["logo-moreau.svg", "image", "image/svg+xml", "assets", 18_000, 2],
  [
    "export-maquettes.pdf",
    "export",
    "application/pdf",
    "exports",
    8_400_000,
    4,
  ],
  [
    "charte.nexd",
    "design",
    "application/octet-stream",
    "design-files",
    2_400_000,
    2,
  ],
  [
    "Monsite 1.0.0.apk",
    "apk",
    "application/vnd.android.package-archive",
    "exports",
    6_900_000,
    3,
  ],
].map(([name, kind, mime, bucket, size_bytes, o], i) => ({
  id: id(900 + i),
  name,
  kind,
  mime,
  bucket,
  size_bytes,
  path: `${O(o).id}/${name}`,
  org_id: O(o).id,
  owner_id: O(o).owner_id,
  created_at: ago(i * 3 + 1),
  organizations: orgRef(o),
}))

export const monitors = [
  ["Boutique Moreau", "https://boutique-moreau.fr", "up", 182, null, 2],
  ["Portfolio", "https://nathanpetit.dev", "up", 96, null, 3],
  [
    "Site Agence Pixel",
    "https://agence-pixel.fr",
    "down",
    null,
    "Délai dépassé (10 s)",
    4,
  ],
  ["Landing produit", "https://produit-pixel.fr", "up", 240, null, 4],
  [
    "Fontaine Design",
    "https://fontaine.design",
    "degraded",
    2350,
    "Réponse lente (2,3 s)",
    6,
  ],
].map(([name, url, last_status, last_latency_ms, last_error, o], i) => ({
  id: id(1000 + i),
  name,
  url,
  last_status,
  last_latency_ms,
  last_error,
  org_id: O(o).id,
  active: true,
  interval_minutes: i === 4 ? 15 : 5,
  expected_status: 200,
  keyword: null,
  last_checked_at: ago(0, 0.05 + i * 0.02),
  created_at: ago(30),
  updated_at: ago(0),
  created_by: O(o).owner_id,
  project_id: null,
  organizations: orgRef(o),
}))
export const monitor_checks = Array.from({ length: 60 }, (_, k) => ({
  id: 5000 + k,
  monitor_id: monitors[2].id,
  org_id: monitors[2].org_id,
  checked_at: ago(0, k * 0.0833),
  ok: k > 3 && k !== 20,
  status_code: k > 3 && k !== 20 ? 200 : null,
  latency_ms: k > 3 && k !== 20 ? 180 + ((k * 37) % 140) : null,
  error: k > 3 && k !== 20 ? null : "Délai dépassé (10 s)",
}))
export const security_scans = [
  [
    "https://boutique-moreau.fr",
    82,
    "B",
    2,
    [
      ["high", "Content-Security-Policy absente"],
      ["medium", "Cookie de session sans SameSite"],
      ["low", "En-tête Server visible"],
    ],
  ],
  [
    "https://agence-pixel.fr",
    64,
    "C",
    4,
    [
      ["critical", "Certificat TLS expiré dans 3 jours"],
      ["high", "HSTS absent"],
      ["medium", "X-Frame-Options absent"],
      ["info", "HTTP/2 actif"],
    ],
  ],
  [
    "https://nathanpetit.dev",
    96,
    "A",
    3,
    [["info", "Toutes les protections principales sont en place"]],
  ],
].map(([url, score, grade, o, f], i) => ({
  id: id(1100 + i),
  url,
  score,
  grade,
  org_id: O(o).id,
  created_at: ago(i * 2 + 1),
  created_by: O(o).owner_id,
  project_id: null,
  findings: f.map(([sev, title]) => ({
    sev,
    title,
    detail:
      sev === "info" ? "" : "Corrige-le dans la configuration du serveur.",
  })),
  headers: { server: "nginx", "content-type": "text/html; charset=utf-8" },
  organizations: orgRef(o),
}))

const ticketDefs = [
  ["Passage à l’offre Équipe", "facturation", "normal", "open", 4, 0.2, null],
  [
    "L’APK ne s’installe pas sur Android 15",
    "app-builder",
    "high",
    "open",
    3,
    0.05,
    1,
  ],
  [
    "Export PDF : polices manquantes",
    "nex-design",
    "normal",
    "pending",
    2,
    1,
    1,
  ],
  [
    "Moniteur en panne alors que le site répond",
    "supervision",
    "urgent",
    "open",
    4,
    0.02,
    null,
  ],
  [
    "Comment inviter un client en lecture seule ?",
    "équipes",
    "low",
    "resolved",
    6,
    3,
    1,
  ],
]
export const support_tickets = ticketDefs.map(
  ([subject, category, priority, status, u, days, assignee], i) => ({
    id: id(1200 + i),
    subject,
    category,
    priority,
    status,
    user_id: P(u).id,
    org_id: null,
    assigned_to: assignee == null ? null : P(assignee).id,
    closed_at: status === "resolved" ? ago(days) : null,
    created_at: ago(days + 1),
    updated_at: ago(days),
    profiles: person(u),
    assignee: assignee == null ? null : { full_name: P(assignee).full_name },
  }),
)
export const ticket_messages = [
  [
    1,
    3,
    "Bonjour, l’APK généré par l’App Builder refuse de s’installer sur mon Pixel (Android 15) : « Application non installée ». Sur Android 13 tout va bien.",
    false,
    3.2,
  ],
  [
    1,
    1,
    "Bonjour Nathan, merci pour le détail. Peux-tu me dire si tu as signé l’APK avec la clé générée par NEXORA ou avec ta propre clé ?",
    false,
    3.1,
  ],
  [1, 3, "Avec la clé générée par NEXORA, sans rien changer.", false, 0.3],
  [
    1,
    1,
    "Probablement la cible SDK : à vérifier dans le modèle TWA avant de répondre.",
    true,
    0.1,
  ],
].map(([t, u, body, internal, days], i) => ({
  id: id(1300 + i),
  ticket_id: support_tickets[t].id,
  author_id: P(u).id,
  body,
  internal,
  created_at: ago(days),
  profiles: person(u),
}))

export const announcements = [
  [
    "NEXORA 1.0 est disponible",
    "Nouveau Studio 3D & Motion, NEX-DESIGN et App Builder.",
    "success",
    "all",
    true,
    10,
    null,
  ],
  [
    "Maintenance planifiée dimanche 2 h",
    "La synchronisation sera indisponible 15 minutes.",
    "warning",
    "all",
    false,
    20,
    18,
  ],
].map(([title, body, level, audience, active, days, end], i) => ({
  id: id(1400 + i),
  title,
  body,
  level,
  audience,
  active,
  starts_at: ago(days),
  ends_at: end ? ago(end) : null,
  created_by: P(0).id,
  created_at: ago(days),
  updated_at: ago(days),
}))
export const announcement_reads = Array.from({ length: 6 }, (_, k) => ({
  announcement_id: announcements[0].id,
  user_id: P(k).id,
  read_at: ago(k),
}))

export const audit_logs = [
  [0, "update", "feature_flags", { key: "ai_assistant", rollout: 60 }, 0.1],
  [1, "update", "support_tickets", { status: "pending" }, 1],
  [0, "update", "subscriptions", { plan_id: "pro" }, 2],
  [4, "insert", "projects", { name: "Landing produit" }, 2.5],
  [null, "update", "monitors", { last_status: "down" }, 0.02],
  [0, "update", "profiles", { status: "suspended" }, 12],
  [6, "insert", "organizations", { name: "Fontaine Design" }, 9],
  [2, "delete", "design_documents", { name: "Brouillon" }, 5],
].map(([u, action, entity, meta, days], i) => ({
  id: 900 - i,
  actor_id: u == null ? null : P(u).id,
  action,
  entity,
  entity_id: null,
  meta,
  org_id: null,
  created_at: ago(days),
}))
export const usage_daily = [
  ["exports", 14],
  ["scans", 9],
  ["storage_mb", 1840],
  ["ai_requests", 120],
].map(([metric, value]) => ({
  org_id: O(4).id,
  day: ago(1).slice(0, 10),
  metric,
  value,
}))

// Factures, émetteur et journal des envois Brevo (#031).
export const nx_private_config = [
  {
    key: "invoice_issuer",
    value: {
      name: "IPPOO",
      address: "Cotonou, Bénin",
      email: "ippooz.up.2@gmail.com",
      phone: "+229 97 00 00 00",
      website: "https://nexora.abrahamtogbonon0.workers.dev/",
      tax_id: "IFU 0202000000000",
      vat_note: "TVA non applicable",
      currency: "EUR",
      tax_rate: 0,
      due_days: 30,
      prefix: "NX",
      payment:
        "Virement bancaire — IBAN BJ00 0000 0000 0000 0000 0000\nou Mobile Money : +229 97 00 00 00",
      footer: "Merci de ta confiance.",
    },
    updated_at: ago(2),
    updated_by: null,
  },
]
const day = (days) => ago(days).slice(0, 10)
const invTotals = (inv) => {
  const sub = (inv.lines || []).reduce(
    (t, l) =>
      t + Math.round((Number(l.qty) || 0) * (Number(l.unit_cents) || 0)),
    0,
  )
  const tax = Math.round((sub * (Number(inv.tax_rate) || 0)) / 100)
  return { ...inv, subtotal_cents: sub, tax_cents: tax, total_cents: sub + tax }
}
const invDefs = [
  // [numéro, personne, espace, statut, émise il y a (jours), taux de TVA, lignes]
  [
    1,
    4,
    4,
    "payee",
    34,
    0,
    [
      ["NEXORA Équipe — abonnement mensuel (octobre 2026)", 1, 2900],
      ["Sièges supplémentaires", 3, 500],
    ],
  ],
  [2, 2, 2, "payee", 30, 0, [["NEXORA Pro — abonnement annuel", 1, 9000]]],
  [
    3,
    3,
    3,
    "envoyee",
    41,
    20,
    [["NEXORA Pro — abonnement mensuel (septembre 2026)", 1, 900]],
  ],
  [
    4,
    6,
    6,
    "envoyee",
    3,
    0,
    [
      ["NEXORA Pro — abonnement mensuel (novembre 2026)", 1, 900],
      [
        "Accompagnement à la mise en ligne de la boutique et réglage de la supervision 24 h/24",
        2,
        4000,
      ],
    ],
  ],
  [
    null,
    4,
    4,
    "brouillon",
    0,
    0,
    [
      ["NEXORA Équipe — abonnement mensuel (novembre 2026)", 1, 2900],
      ["Sièges supplémentaires", 4, 500],
    ],
  ],
]
export const invoices = invDefs.map(([n, u, o, status, days, rate, lines], i) =>
  invTotals({
    id: id(900 + i),
    number: n ? `NX-2026-${String(n).padStart(4, "0")}` : null,
    status,
    user_id: P(u).id,
    org_id: O(o).id,
    customer: {
      name: P(u).full_name,
      company: O(o).personal ? "" : O(o).name,
      email: P(u).email,
      address: [
        "12 rue des Lilas\n75011 Paris, France",
        "4 place Bellecour\n69002 Lyon, France",
        "Haie Vive\nCotonou, Bénin",
      ][i % 3],
    },
    lines: lines.map(([label, qty, unit_cents]) => ({
      label,
      qty,
      unit_cents,
    })),
    currency: "EUR",
    tax_rate: rate,
    issued_at: n ? day(days) : null,
    due_at: n ? day(days - 30) : null,
    paid_at: status === "payee" ? ago(days - 4) : null,
    notes: "",
    issuer: n ? nx_private_config[0].value : null,
    sent_at: n ? ago(days - 0.01) : null,
    sent_to: n ? P(u).email : null,
    created_by: P(0).id,
    created_at: ago(days + 0.1),
    updated_at: ago(Math.max(days - 4, 0)),
  }),
)
export const nx_email_log = [
  ["facture", P(6).email, 3],
  ["alerte", null, 4.2],
  ["maj", P(2).email, 9],
  ["maj", P(4).email, 9],
  ["exemple", P(0).email, 9.5],
  ["test", null, 26],
  ["facture", P(3).email, 41],
].map(([kind, to, hours], i) => ({
  id: 700 + i,
  user_id: null,
  request_id: 4000 + i,
  kind,
  to_email: to,
  created_at: ago(hours / 24),
}))
// Lignes modifiables pendant une capture (création, enregistrement, suppression).
const MUTABLE = new Set(["invoices", "nx_private_config"])
function demoMutate(table, method, params, postData) {
  const rows = TABLES[table]
  const body = JSON.parse(postData || "null")
  const stamp = new Date().toISOString()
  if (method === "POST") {
    return (Array.isArray(body) ? body : [body]).map((b) => {
      const key = table === "nx_private_config" ? "key" : "id"
      const found = b[key] && rows.find((r) => r[key] === b[key])
      if (found) return Object.assign(found, b, { updated_at: stamp })
      const row =
        table === "invoices"
          ? invTotals({
              id: crypto.randomUUID(),
              number: null,
              status: "brouillon",
              user_id: null,
              org_id: null,
              customer: {},
              lines: [],
              currency: "EUR",
              tax_rate: 0,
              issued_at: null,
              due_at: null,
              paid_at: null,
              notes: "",
              issuer: null,
              sent_at: null,
              sent_to: null,
              created_by: P(0).id,
              created_at: stamp,
              updated_at: stamp,
              ...b,
            })
          : { updated_at: stamp, updated_by: null, ...b }
      rows.unshift(row)
      return row
    })
  }
  const hit = filterRows(rows, params)
  for (const r of hit) {
    if (method === "DELETE") rows.splice(rows.indexOf(r), 1)
    else
      Object.assign(
        r,
        table === "invoices" ? invTotals({ ...r, ...body }) : body,
        { updated_at: stamp },
      )
  }
  return hit
}

// Essais des applications de l'offre Gratuite (#037).
export const nx_app_trials = [
  [0, "Boutique Lumière", "https://boutique-lumiere.fr", 2, "free"],
  [0, "Blog de l’Atelier", "https://atelier-blog.fr", 11, "free"],
  [1, "Restaurant Le Quai", "https://lequai-restaurant.fr", 4, "free"],
  [5, "Portfolio Lucas", "https://lucasroux.design", 9, "free"],
  [2, "Studio Moreau", null, 20, "standard"],
].map(([u, name, url, age, plan], i) => ({
  id: id(900 + i),
  user_id: P(u).id,
  org_id: organizations[u].id,
  local_id: `demo-${i}`,
  name,
  source_kind: url ? "url" : "project",
  source_url: url,
  plan_at_creation: plan,
  created_at: ago(age),
  trial_ends_at: plan === "free" ? ago(age - 7) : null,
  deleted_at: null,
  profiles: person(u),
}))

const TABLES = {
  profiles,
  nx_app_trials,
  plans,
  organizations,
  subscriptions,
  organization_members,
  feature_flags,
  app_config,
  devices,
  invitations,
  projects,
  design_documents,
  studio_items,
  device_boards,
  share_links,
  comments,
  assets,
  monitors,
  monitor_checks,
  security_scans,
  support_tickets,
  ticket_messages,
  announcements,
  announcement_reads,
  audit_logs,
  usage_daily,
  notifications: [],
  user_settings: [],
  invoices,
  nx_private_config,
  nx_email_log,
}

function rpc(name, args) {
  const count = (list, fn) => list.filter(fn).length
  if (name === "admin_stats")
    return {
      users: profiles.length,
      users_new_30d: count(
        profiles,
        (p) => now - Date.parse(p.created_at) < 30 * 86400000,
      ),
      users_active_7d: 7,
      users_suspended: count(profiles, (p) => p.status === "suspended"),
      teams: count(organizations, (o) => !o.personal),
      organizations: organizations.length,
      mrr_cents: 900 * 3 + 2900,
      paid_orgs: 4,
      projects: projects.length,
      designs: design_documents.length,
      studio_items: studio_items.length,
      storage_mb: 1840,
      tickets_open: count(support_tickets, (t) => t.status === "open"),
      monitors: monitors.length,
      monitors_down: count(monitors, (m) => m.last_status === "down"),
      plans: { free: 4, standard: 2, pro: 2 },
      devices: { windows: 6, web: 3 },
    }
  if (name === "admin_timeseries") {
    const days = Number(args.days) || 30
    return Array.from({ length: days }, (_, k) => {
      const d = days - 1 - k
      const w = Math.sin(k / 3) + 1
      return {
        day: ago(d).slice(0, 10),
        signups: Math.round(w * 1.4 + (k % 5 === 0 ? 2 : 0)),
        projects: Math.round(w * 2 + (k % 4)),
        designs: Math.round(w * 2.6 + (k % 3)),
        scans: Math.round(1 + (k % 6) / 2),
        tickets: k % 7 === 0 ? 2 : k % 3 === 0 ? 1 : 0,
      }
    })
  }
  if (name === "admin_users") {
    const q = String(args.search || "").toLowerCase()
    const rows = profiles.filter(
      (p) => !q || `${p.full_name} ${p.email}`.toLowerCase().includes(q),
    )
    return rows
      .map((p) => ({
        ...p,
        total: rows.length,
        orgs: organization_members.filter((m) => m.user_id === p.id).length,
        projects: projects.filter(
          (x) =>
            organizations.find((o) => o.id === x.org_id)?.owner_id === p.id,
        ).length,
        designs: design_documents.filter(
          (x) =>
            organizations.find((o) => o.id === x.org_id)?.owner_id === p.id,
        ).length,
      }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  }
  if (name === "admin_orgs")
    return organizations.map((o, i) => ({
      id: o.id,
      name: o.name,
      personal: o.personal,
      created_at: o.created_at,
      owner_email: profiles.find((p) => p.id === o.owner_id)?.email,
      plan_id: subscriptions[i].plan_id,
      sub_status: subscriptions[i].status,
      members: organization_members.filter((m) => m.org_id === o.id).length,
      projects: projects.filter((x) => x.org_id === o.id).length,
      designs: design_documents.filter((x) => x.org_id === o.id).length,
    }))
  // Offres du #037 : état réglable par NX_DEMO_OFFRE (essai, expire, standard).
  if (name === "nx_plan_status") return demoPlanStatus(args)
  if (name === "nx_app_status") return demoAppStatus(args)
  if (name === "nx_app_claim")
    return demoAppRow(args.p_local_id, args.p_name || "Mon application", 0)
  if (name === "nx_app_release") return true
  if (name === "nx_use_feature")
    return {
      ok: true,
      plan: demoOffer() === "standard" ? "standard" : "free",
      remaining: 12,
    }
  if (name === "nx_app_trial_extend")
    return new Date(now + 7 * 86400000).toISOString()
  if (name === "org_quota")
    return {
      projects: { used: 2, limit: -1 },
      designs: { used: 1, limit: -1 },
      members: { used: 3, limit: 25 },
      monitors: { used: 2, limit: 50 },
      storage_mb: { used: 1840, limit: 102400 },
    }
  // Supervision par le serveur (NEXORA #022) : mêmes formes que monitor_overview et monitor_series
  // (supabase/migrations/20261104000002_supervision_serveur.sql), courbes calculées pour la démonstration.
  if (name === "monitor_overview") return demoMonitorOverview(args)
  if (name === "monitor_series") return demoMonitorSeries(args)
  if (name === "monitor_incident_action")
    return {
      ...demoIncidents().find((i) => i.id === args.p_incident),
      ack_at: new Date(now).toISOString(),
    }
  if (name === "admin_broadcast") return 9
  // E-mails et factures (#031).
  if (name === "nx_email_templates_save") {
    const row = app_config.find((r) => r.key === "email_templates")
    if (row)
      Object.assign(row, {
        value: args.p,
        updated_at: new Date().toISOString(),
      })
    return null
  }
  if (name === "nx_email_send_admin")
    return { ok: true, id: 5001, to: args.p_to }
  if (name === "nx_email_result")
    return {
      status: 201,
      error: null,
      content: '{"messageId":"<demo@smtp-relay.mailin.fr>"}',
    }
  if (name === "nx_email_broadcast") {
    const a = args.p_audience
    const n =
      a === "me"
        ? 1
        : a === "admins"
          ? count(profiles, (p) => p.app_role !== "user")
          : a === "all"
            ? count(profiles, (p) => p.status !== "suspended")
            : count(subscriptions, (x) => `plan:${x.plan_id}` === a)
    return args.p_dry_run ? { count: n } : { ok: true, count: n }
  }
  if (name === "nx_invoice_issue") {
    const inv = invoices.find((i) => i.id === args.p_id)
    if (inv && !inv.number)
      Object.assign(inv, {
        number: `NX-2026-${String(invoices.filter((i) => i.number).length + 1).padStart(4, "0")}`,
        status: "emise",
        issued_at: day(0),
        due_at: inv.due_at || day(-30),
        issuer: nx_private_config[0].value,
        updated_at: new Date().toISOString(),
      })
    return inv || null
  }
  if (name === "nx_invoice_send") {
    const inv = invoices.find((i) => i.id === args.p_id)
    if (inv)
      Object.assign(inv, {
        sent_at: new Date().toISOString(),
        sent_to: args.p_to,
        status: inv.status === "emise" ? "envoyee" : inv.status,
        updated_at: new Date().toISOString(),
      })
    return { ok: true, id: 5002, to: args.p_to }
  }
  return null
}

const MIN = 60000
const HOUR = 60 * MIN
const iso = (ms) => new Date(ms).toISOString()
// Profil de chaque site fictif : temps de réponse de base, pannes et lenteurs (relatives à maintenant).
const MON_PROFILE = [
  { base: 182, down: [[2 * 24 * HOUR + 5 * HOUR, 18 * MIN]], slow: [] },
  { base: 96, down: [], slow: [] },
  {
    base: 210,
    down: [
      [26 * MIN, 0],
      [6 * 24 * HOUR, 7 * MIN],
    ],
    slow: [],
  },
  { base: 240, down: [], slow: [[30 * HOUR, 40 * MIN]] },
  { base: 820, down: [], slow: [[2 * HOUR, 0]] },
]
function demoIncidents() {
  const list = []
  monitors.forEach((m, i) => {
    const p = MON_PROFILE[i]
    for (const [kind, spans] of [
      ["down", p.down],
      ["slow", p.slow],
    ])
      for (const [back, len] of spans)
        list.push({
          id: `inc-${i}-${kind}-${back}`,
          monitor_id: m.id,
          org_id: m.org_id,
          kind,
          started_at: iso(now - back),
          ended_at: len ? iso(now - back + len) : null,
          cause:
            kind === "down"
              ? i === 2
                ? "délai dépassé"
                : "statut 503"
              : `${p.base * 3} ms (seuil 2000 ms)`,
          last_cause:
            kind === "down"
              ? i === 2
                ? "délai dépassé"
                : "statut 503"
              : `${p.base * 3} ms`,
          checks: len ? Math.round(len / (m.interval_minutes * MIN)) + 2 : 6,
          notified: len ? 2 : 1,
          ack_at: len && i === 0 ? iso(now - back + 4 * MIN) : null,
          note:
            len && i === 0
              ? "Redémarrage du serveur de base de données après une mise à jour."
              : "",
          site: m.name,
          closed_by: len ? "auto" : null,
          resolution: len ? "Le site répond de nouveau" : "",
        })
  })
  return list.sort((a, b) => b.started_at.localeCompare(a.started_at))
}
function demoBuckets(m, i, hours, buckets) {
  const p = MON_PROFILE[i]
  const to = now
  const from = now - hours * HOUR
  const step = (to - from) / buckets
  const inSpan = (list, a, b) =>
    list.some(
      ([back, len]) => now - back < b && (len ? now - back + len : now) > a,
    )
  return Array.from({ length: buckets }, (_, g) => {
    const a = from + g * step
    const b = a + step
    const n = Math.max(1, Math.round(step / (m.interval_minutes * MIN)))
    const down = inSpan(p.down, a, b)
    const slow = inSpan(p.slow, a, b)
    const wave =
      1 + 0.3 * Math.sin((a / HOUR / 24) * Math.PI * 2) + ((g * 37) % 11) / 40
    const fails = down
      ? Math.max(1, Math.round(n * 0.6))
      : (g * 13 + i) % 29 === 0
        ? 1
        : 0
    const p95 = Math.round(p.base * wave * (slow ? 3 : 1) * 1.6)
    return {
      t: iso(a),
      n,
      fails: Math.min(n, fails),
      avail: Math.round(((n - Math.min(n, fails)) / n) * 10000) / 100,
      p95,
      p50: Math.round(p95 / 1.7),
      avg: Math.round(p95 / 1.5),
      max: Math.round(p95 * 1.4),
    }
  })
}
function demoMonitorOverview(args) {
  const hours = Number(args.p_hours) || 24
  const buckets = Number(args.p_buckets) || 48
  const from = now - hours * HOUR
  const incidents = demoIncidents().filter(
    (x) =>
      Date.parse(x.started_at) < now &&
      (!x.ended_at || Date.parse(x.ended_at) > from),
  )
  return {
    from: iso(from),
    to: iso(now),
    hours,
    step: Math.round((hours * HOUR) / buckets),
    incidents,
    sites: monitors.map((m, i) => {
      const bars = demoBuckets(m, i, hours, buckets)
      const n = bars.reduce((a, b) => a + b.n, 0)
      const fails = bars.reduce((a, b) => a + b.fails, 0)
      const p95s = bars.map((b) => b.p95).sort((a, b) => a - b)
      return {
        id: m.id,
        org_id: m.org_id,
        org: m.organizations?.name || null,
        name: m.name,
        url: m.url,
        active: m.active,
        interval_minutes: m.interval_minutes,
        threshold_ms: i === 4 ? 2000 : 1500,
        confirm_count: 2,
        keyword: null,
        expected_status: 200,
        app_site_id: i < 2 ? `site-${i}` : null,
        muted_until: null,
        status: m.last_status,
        status_since: iso(
          now -
            (m.last_status === "down"
              ? 26 * MIN
              : m.last_status === "degraded"
                ? 2 * HOUR
                : 3 * 24 * HOUR),
        ),
        last_checked_at: m.last_checked_at,
        last_latency_ms: m.last_latency_ms,
        last_error: m.last_error,
        n,
        fails,
        avail: Math.round(((n - fails) / n) * 100000) / 1000,
        p50: Math.round(p95s[Math.floor(p95s.length / 2)] / 1.7),
        p95: p95s[Math.floor(p95s.length * 0.95)],
        avg: Math.round(p95s[Math.floor(p95s.length / 2)] / 1.5),
        open: incidents.filter((x) => x.monitor_id === m.id && !x.ended_at)
          .length,
        bars: bars.map(({ t, n: bn, fails: bf, avail, p95 }) => ({
          t,
          n: bn,
          fails: bf,
          avail,
          p95,
        })),
      }
    }),
  }
}
function demoMonitorSeries(args) {
  const i = monitors.findIndex((m) => m.id === args.p_monitor)
  if (i < 0) return null
  const m = monitors[i]
  const hours = Number(args.p_hours) || 24
  const buckets = Number(args.p_buckets) || 96
  const from = now - hours * HOUR
  const points = demoBuckets(m, i, hours, buckets)
  const n = points.reduce((a, b) => a + b.n, 0)
  const fails = points.reduce((a, b) => a + b.fails, 0)
  const sorted = points.map((p) => p.p95).sort((a, b) => a - b)
  return {
    from: iso(from),
    to: iso(now),
    hours,
    step: Math.round((hours * HOUR) / buckets),
    hourly: hours > 168,
    points,
    totals: {
      n,
      fails,
      avail: Math.round(((n - fails) / n) * 100000) / 1000,
      avg: Math.round(sorted[sorted.length >> 1] / 1.5),
      p50: Math.round(sorted[sorted.length >> 1] / 1.7),
      p95: sorted[Math.floor(sorted.length * 0.95)],
      max: Math.round(sorted[sorted.length - 1] * 1.4),
    },
    incidents: demoIncidents().filter(
      (x) =>
        x.monitor_id === m.id && (!x.ended_at || Date.parse(x.ended_at) > from),
    ),
    recent: Array.from({ length: 30 }, (_, k) => {
      const fail = m.last_status === "down" && k < 6
      return {
        checked_at: iso(now - k * m.interval_minutes * MIN - 20000),
        ok: !fail,
        status_code: fail ? null : 200,
        latency_ms: fail
          ? null
          : Math.round(MON_PROFILE[i].base * (0.8 + ((k * 7) % 9) / 20)),
        error: fail ? "délai dépassé" : null,
      }
    }),
  }
}

/** Filtres PostgREST simples (eq, neq, in, is, gte, lte, ilike) appliqués aux données de démonstration. */
function filterRows(rows, params) {
  let out = rows
  for (const [key, raw] of params) {
    if (
      ["select", "order", "limit", "offset", "on_conflict", "columns"].includes(
        key,
      )
    )
      continue
    const m = /^(not\.)?(eq|neq|in|is|gte|lte|gt|lt|ilike|like)\.(.*)$/.exec(
      raw,
    )
    if (!m) continue
    const [, , op, v] = m
    const get = (r) => r[key]
    out = out.filter((r) => {
      const x = get(r)
      if (op === "eq") return String(x) === v
      if (op === "neq") return String(x) !== v
      if (op === "in")
        return v
          .replace(/^\(|\)$/g, "")
          .split(",")
          .map((s) => s.replace(/^"|"$/g, ""))
          .includes(String(x))
      if (op === "is") return v === "null" ? x == null : String(x) === v
      if (op === "gte") return String(x) >= v
      if (op === "lte") return String(x) <= v
      if (op === "ilike" || op === "like")
        return String(x ?? "")
          .toLowerCase()
          .includes(v.replace(/[%*]/g, "").toLowerCase())
      return true
    })
  }
  return out
}

export const DEMO_TOKEN = "sbp_demo_captures"
const mgmtProject = {
  id: "dcwfgnwaxsrtuvomttbp",
  name: "nexora",
  region: "eu-central-1",
  status: "ACTIVE_HEALTHY",
  created_at: ago(4),
  database: {
    version: "17.11.0.011",
    host: "db.dcwfgnwaxsrtuvomttbp.supabase.co",
  },
}
const mgmtAuth = {
  site_url: "http://localhost:5173",
  uri_allow_list:
    "http://localhost:5173/**,http://127.0.0.1:5173/**,http://localhost:4173/**",
  disable_signup: false,
  mailer_autoconfirm: false,
  password_min_length: 8,
  external_email_enabled: true,
  smtp_host: null,
  jwt_exp: 3600,
}
const demoEmail = {
  hasKey: false,
  cfg: { enabled: false, sender_email: "", sender_name: "NEXORA" },
}
const mgmtFunctions = [
  "admin-users",
  "org-invite",
  "security-scan",
  "site-info",
].map((slug, i) => ({
  slug,
  name: slug,
  status: "ACTIVE",
  version: 1,
  verify_jwt: true,
  updated_at: now - 3 * 86400000 + i * 1000,
}))

/**
 * Réponse de démonstration pour une requête interceptée, ou null si elle ne concerne pas Supabase.
 * @returns {{ status: number, headers?: Record<string, string>, body: unknown } | null}
 */
// ---------- Offres du #037 ----------
const demoOffer = () => process.env.NX_DEMO_OFFRE || "essai"
function demoPlanStatus(args = {}) {
  // Fiche d'un espace (back office) : offre et usage de cet espace.
  const org = args.p_org && organizations.find((o) => o.id === args.p_org)
  if (org && org.id !== organizations[0].id) {
    const sub = subscriptions.find((x) => x.org_id === org.id)
    const op =
      plans.find((x) => x.id === (sub ? sub.plan_id : "free")) || plans[0]
    const of = (list) => list.filter((x) => x.org_id === org.id).length
    return {
      plan: "pro",
      plan_name: "Pro",
      admin: true,
      org_id: org.id,
      view_org: org.id,
      org_plan: op.id,
      org_plan_name: op.name,
      limits: op.limits,
      perms: op.perms,
      org_limits: op.limits,
      usage: {
        projects: of(projects),
        designs: of(design_documents),
        members: of(organization_members),
        monitors: of(monitors),
        storage_mb: 380,
      },
    }
  }
  const id = demoOffer() === "standard" ? "standard" : "free"
  const p = plans.find((x) => x.id === id)
  const usage =
    id === "standard"
      ? {
          projects: 9,
          designs: 14,
          members: 2,
          monitors: 4,
          storage_mb: 1240,
          apps: 3,
          ai_requests_month: 212,
          scans_per_day: 6,
          crawls_per_day: 4,
          builds_month: 11,
          push_month: 1840,
        }
      : {
          projects: 2,
          designs: 2,
          members: 1,
          monitors: 1,
          storage_mb: 64,
          apps: demoOffer() === "expire" ? 2 : 1,
          ai_requests_month: 18,
          scans_per_day: 1,
          crawls_per_day: 0,
          builds_month: 0,
          push_month: 0,
        }
  return {
    plan: id,
    plan_name: p.name,
    admin: false,
    org_id: organizations[0].id,
    view_org: organizations[0].id,
    org_plan: id,
    org_plan_name: p.name,
    limits: p.limits,
    perms: p.perms,
    org_limits: p.limits,
    usage,
    day: new Date(now).toISOString().slice(0, 10),
    month: new Date(now).toISOString().slice(0, 8) + "01",
    checked_at: new Date(now).toISOString(),
  }
}
// Application d'essai : créée il y a `age` jours ; essai de 7 jours en offre Gratuite.
function demoAppRow(localId, name, age, kind = "url") {
  const created = now - age * 86400000
  const ends = created + 7 * 86400000
  const paid = demoOffer() === "standard"
  const status = paid ? "active" : ends > now ? "trial" : "expired"
  return {
    ok: true,
    local_id: localId,
    name,
    source_kind: kind,
    status,
    created_at: new Date(created).toISOString(),
    trial_ends_at: paid ? null : new Date(ends).toISOString(),
    days_left: status === "trial" ? Math.ceil((ends - now) / 86400000) : null,
    deleted: false,
  }
}
function demoAppStatus(args) {
  const ids = Array.isArray(args.p_local_ids) ? args.p_local_ids : null
  const expired = demoOffer() === "expire"
  const rows = ids
    ? ids
        .slice(0, 1)
        .map((i) => demoAppRow(i, "Boutique Lumière", expired ? 9 : 2))
    : [
        demoAppRow("demo-a", "Boutique Lumière", 2),
        demoAppRow("demo-b", "Blog de l’Atelier", 11),
      ]
  const paid = demoOffer() === "standard"
  return {
    ok: true,
    plan: paid ? "standard" : "free",
    plan_name: paid ? "Standard" : "Gratuit",
    admin: false,
    trial_days: paid ? 0 : 7,
    limit: paid ? 10 : 2,
    used: paid ? 3 : ids ? (expired ? 2 : 1) : 2,
    source_import: paid,
    apps: Object.fromEntries(rows.map((r) => [r.local_id, r])),
  }
}

export function demoResponse(method, rawUrl, headers, postData) {
  const url = new URL(rawUrl)
  const json = (body, status = 200, extra = {}) => ({
    status,
    headers: { "content-type": "application/json", ...extra },
    body,
  })
  // API de gestion : appelée par le relais du back office (/__supabase-api, #026) ou directement.
  const relayed = /\/__supabase-api(\/v1\/.*)$/.exec(url.pathname)
  if (url.hostname === "api.supabase.com" || relayed) {
    const p = (relayed ? relayed[1] : url.pathname).replace(
      /^\/v1\/projects\/[^/]+/,
      "",
    )
    if (p === "" || p === "/") return json(mgmtProject)
    if (p === "/config/auth")
      // Gardée comme sur Supabase : la relecture après un enregistrement renvoie les valeurs envoyées (#027).
      return method === "PATCH"
        ? json(Object.assign(mgmtAuth, JSON.parse(postData || "{}")))
        : json(mgmtAuth)
    if (p === "/functions") return json(mgmtFunctions)
    if (p === "/database/query") {
      const q = JSON.parse(postData || "{}").query || ""
      if (/pg_publication_tables/.test(q))
        return json([
          {
            realtime: [
              "announcements",
              "app_config",
              "feature_flags",
              "notifications",
              "organization_members",
              "profiles",
              "subscriptions",
            ],
            no_rls: [],
            extensions: ["pg_cron", "pg_net", "pgcrypto", "uuid-ossp"],
            buckets: [
              { id: "avatars", public: true },
              { id: "design-files", public: false },
              { id: "assets", public: false },
              { id: "exports", public: false },
            ],
          },
        ])
      // Alertes par e-mail avec Brevo (#029) : état gardé pendant la capture.
      if (
        /update public\.app_config set value = value \|\| jsonb_build_object\('sender_email'/.test(
          q,
        )
      ) {
        const m = /'sender_email', '([^']*)', 'sender_name', '([^']*)'/.exec(q)
        demoEmail.cfg = {
          ...demoEmail.cfg,
          sender_email: m?.[1] || "",
          sender_name: m?.[2] || "",
        }
        return json([])
      }
      if (/nx_brevo_set_key/.test(q)) {
        demoEmail.hasKey = true
        return json([{ nx_brevo_set_key: "" }])
      }
      if (
        /update public\.app_config set value = jsonb_build_object\('enabled'/.test(
          q,
        )
      ) {
        const m =
          /'enabled', (true|false), 'sender_email', '([^']*)', 'sender_name', '([^']*)'/.exec(
            q,
          )
        demoEmail.cfg = {
          enabled: m?.[1] === "true",
          sender_email: m?.[2] || "",
          sender_name: m?.[3] || "",
        }
        return json([{ value: demoEmail.cfg }])
      }
      if (/nx_brevo_test/.test(q)) return json([{ id: 4242 }])
      if (/net\._http_response/.test(q))
        return json([
          {
            status_code: 201,
            error_msg: null,
            content: '{"messageId":"<demo@smtp-relay.mailin.fr>"}',
          },
        ])
      if (/to_regprocedure\('public\.nx_brevo_send/.test(q))
        return json([
          {
            installed: true,
            app: true,
            has_key: demoEmail.hasKey,
            cfg: demoEmail.cfg,
          },
        ])
      if (/cron\.job/.test(q))
        return json([
          { command: "select public.cleanup_old_data()", active: true },
        ])
      return json(app_config.map(({ key, value }) => ({ key, value })))
    }
    return json({ message: "Inconnu (démonstration)" }, 404)
  }
  if (!url.hostname.endsWith(".supabase.co")) return null
  const path = url.pathname
  if (path.startsWith("/auth/v1/user"))
    return json({
      id: P(0).id,
      email: P(0).email,
      aud: "authenticated",
      role: "authenticated",
      app_metadata: {},
      user_metadata: { full_name: P(0).full_name },
      created_at: P(0).created_at,
    })
  if (path.startsWith("/auth/v1/logout")) return { status: 204, body: "" }
  if (path.startsWith("/auth/v1/")) return json({})
  if (path.startsWith("/functions/v1/admin-users")) {
    const body = JSON.parse(postData || "{}")
    if (body.action === "auth-info")
      return json({
        users: Object.fromEntries(
          (body.ids || []).map((x, i) => [
            x,
            {
              confirmed_at: x === P(7).id ? null : ago(30),
              last_sign_in_at: ago(i * 0.4),
            },
          ]),
        ),
      })
    return json({ ok: true })
  }
  if (path.startsWith("/functions/v1/")) return json({ ok: true })
  if (path.startsWith("/storage/v1/"))
    return json({ signedURL: "/demo", signedUrl: "/demo" })
  const rpcMatch = /^\/rest\/v1\/rpc\/(\w+)/.exec(path)
  if (rpcMatch) return json(rpc(rpcMatch[1], JSON.parse(postData || "{}")))
  const tableMatch = /^\/rest\/v1\/(\w+)/.exec(path)
  if (tableMatch) {
    const rows = TABLES[tableMatch[1]]
    if (!rows)
      return json({ message: "relation inconnue (démonstration)" }, 404)
    if (
      MUTABLE.has(tableMatch[1]) &&
      ["POST", "PATCH", "DELETE"].includes(method)
    ) {
      const out = demoMutate(tableMatch[1], method, url.searchParams, postData)
      const one = String(headers.accept || "").includes("vnd.pgrst.object")
      return json(one ? (out[0] ?? null) : out, method === "POST" ? 201 : 200)
    }
    if (method !== "GET" && method !== "HEAD") return json([], 201)
    const list = filterRows(rows, url.searchParams)
    const limit = Number(url.searchParams.get("limit")) || list.length
    const shown = list.slice(0, limit)
    const range = {
      "content-range": `0-${Math.max(0, shown.length - 1)}/${list.length}`,
    }
    const single = String(headers.accept || "").includes("vnd.pgrst.object")
    if (method === "HEAD") return { status: 200, headers: range, body: "" }
    return json(single ? (shown[0] ?? null) : shown, 200, range)
  }
  return json({})
}

/** Session enregistrée par supabase-js (clé nexora-admin-auth) pour le compte de démonstration. */
export function demoSession() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url")
  const exp = Math.floor(now / 1000) + 86400
  const user = {
    id: P(0).id,
    email: P(0).email,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "email" },
    user_metadata: { full_name: P(0).full_name },
    created_at: P(0).created_at,
  }
  return {
    access_token: `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: user.id, exp, role: "authenticated", aud: "authenticated", email: user.email })}.demo`,
    refresh_token: "demo",
    token_type: "bearer",
    expires_in: 86400,
    expires_at: exp,
    user,
  }
}
export const demoIds = {
  ticket: support_tickets[1].id,
  user: P(3).id,
  org: O(4).id,
  monitor: monitors[2].id,
  scan: security_scans[1].id,
  invoice: invoices[3].id,
  invoiceDraft: invoices[4].id,
}
