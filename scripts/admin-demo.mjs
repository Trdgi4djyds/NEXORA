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

export const plans = [
  {
    id: "free",
    name: "Gratuit",
    description: "Pour découvrir NEXORA",
    price_month_cents: 0,
    price_year_cents: 0,
    currency: "EUR",
    sort: 1,
    active: true,
    limits: {
      projects: 3,
      designs: 10,
      members: 1,
      monitors: 1,
      storage_mb: 200,
      scans_per_day: 3,
    },
    features: ["Responsive Lab", "NEX-DESIGN", "Studio 3D", "1 moniteur"],
  },
  {
    id: "pro",
    name: "Pro",
    description: "Pour les créateurs et freelances",
    price_month_cents: 900,
    price_year_cents: 9000,
    currency: "EUR",
    sort: 2,
    active: true,
    limits: {
      projects: 50,
      designs: 500,
      members: 1,
      monitors: 10,
      storage_mb: 10240,
      scans_per_day: 50,
    },
    features: [
      "Projets illimités",
      "10 moniteurs",
      "Audits avancés",
      "Export APK",
    ],
  },
  {
    id: "team",
    name: "Équipe",
    description: "Pour les agences et les équipes",
    price_month_cents: 2900,
    price_year_cents: 29000,
    currency: "EUR",
    sort: 3,
    active: true,
    limits: {
      projects: -1,
      designs: -1,
      members: 25,
      monitors: 50,
      storage_mb: 102400,
      scans_per_day: -1,
    },
    features: [
      "Membres et rôles",
      "Commentaires",
      "Liens de partage",
      "Support prioritaire",
    ],
  },
].map((p) => ({ ...p, created_at: ago(120), updated_at: ago(5) }))

const orgDefs = [
  ["Espace de Camille Laurent", true, 0, "free"],
  ["Espace de Hugo Bernard", true, 1, "free"],
  ["Studio Moreau", false, 2, "pro"],
  ["Espace de Nathan Petit", true, 3, "pro"],
  ["Agence Pixel", false, 4, "team"],
  ["Espace de Lucas Roux", true, 5, "free"],
  ["Fontaine Design", false, 6, "pro"],
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
  seats: plan === "team" ? 6 : 1,
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
  [0, "update", "subscriptions", { plan_id: "team" }, 2],
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

const TABLES = {
  profiles,
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
      plans: { free: 4, pro: 3, team: 1 },
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
}
