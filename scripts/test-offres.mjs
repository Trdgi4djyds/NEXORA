// NEXORA #037 : essais des offres Gratuit, Standard et Pro.
//   1. contrôle des canaux par le processus principal (nexora/app/src/plan.js), avec un faux ipcMain et
//      un faux serveur : invité, compte Gratuit puis Standard, serveurs injoignables, serveurs sans migration ;
//   2. migration supabase/migrations/20261104000007_offres_limites.sql rejouée deux fois sur un vrai
//      Postgres (PGlite, en WebAssembly) avec un schéma minimal reprenant les colonnes du vrai projet :
//      offres, quotas atomiques, essais des applications, limites des données, fonctions soumises à l'offre.
// PGlite n'est pas une dépendance du dépôt : l'installer à part, par exemple
//   mkdir -p /tmp/pgtest && cd /tmp/pgtest && echo '{}' > package.json && pnpm add @electric-sql/pglite@0.3
// puis : node scripts/test-offres.mjs (dossier réglable par PGLITE_DIR). Sans PGlite, la partie 2 est sautée.
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(import.meta.url)
let fails = 0
let count = 0
const ok = (cond, msg, extra) => {
  count += 1
  if (!cond) fails += 1
  console.log(
    `${cond ? "OK  " : "ÉCHEC"} ${msg}${
      extra !== undefined ? ` → ${JSON.stringify(extra)}` : ""
    }`,
  )
}

// ---------- 1. Canaux contrôlés par le processus principal ----------
async function gates() {
  console.log("\n— Processus principal (src/plan.js)")
  const plan = require(path.join(ROOT, "nexora/app/src/plan.js"))
  const handlers = {}
  const sent = []
  const ipcMain = {
    handle(ch, fn) {
      handlers[ch] = fn
    },
  }
  const server = { status: null, use: null, mode: "ok" }
  const calls = []
  const json = (status, body) => ({
    ok: status < 300,
    status,
    json: async () => body,
  })
  const fetchImpl = async (url, o) => {
    calls.push(url)
    if (server.mode === "offline") throw new Error("ECONNREFUSED")
    if (server.mode === "missing" && /rpc\//.test(url))
      return json(404, { code: "PGRST202", message: "not found" })
    if (/organization_members/.test(url))
      return json(200, [
        {
          organizations: {
            subscriptions: [{ plan_id: "standard", status: "active" }],
          },
        },
      ])
    if (/profiles/.test(url)) return json(200, [{ app_role: "user" }])
    if (/nx_plan_status/.test(url)) return json(200, server.status)
    if (/nx_use_feature/.test(url))
      return json(200, server.use(JSON.parse(o.body)))
    return json(500, {})
  }
  plan.guardIpc(ipcMain, { fetchImpl })
  for (const ch of [
    "android:build",
    "dev:open",
    "ai:chat",
    "lab:fetch",
    "mon:cloud-session",
    "sec:scan",
    "device:devtools",
  ])
    ipcMain.handle(ch, async () =>
      ch === "mon:cloud-session" ? true : `ran:${ch}`,
    )
  const ev = {
    sender: { isDestroyed: () => false, send: (c, d) => sent.push([c, d]) },
  }
  const inv = async (ch, ...a) => {
    try {
      return await handlers[ch](ev, ...a)
    } catch (e) {
      return `ERR:${e.message}`
    }
  }
  ok(
    Object.keys(plan.GATES).length === 41,
    "41 canaux contrôlés",
    Object.keys(plan.GATES).length,
  )
  let r = await inv("lab:fetch")
  ok(r === "ran:lab:fetch", "canal libre non contrôlé")
  r = await inv("android:build")
  ok(
    /offre Standard/.test(r) && sent.at(-1)[0] === "plan:blocked",
    "invité : APK refusé, événement plan:blocked",
    r,
  )
  r = await inv("ai:chat")
  ok(
    /compte NEXORA \(gratuit\)/.test(r),
    "invité : l’assistant IA demande un compte",
    r,
  )
  r = await inv("device:devtools", { wcId: 1 })
  ok(
    /Responsive avancé/.test(r),
    "invité : outils de développement de l’appareil refusés (Responsive avancé)",
    r,
  )
  r = await inv("plan:status")
  ok(
    r.plan === "free" && r.source === "invite",
    "invité : plan:status donne l’offre Gratuite",
  )
  const tok = `h.${Buffer.from(JSON.stringify({ sub: "u1" })).toString("base64url")}.s`
  await inv("mon:cloud-session", {
    url: "https://x.supabase.co",
    key: "anon",
    token: tok,
    email: "a@b.c",
  })
  server.status = {
    plan: "free",
    plan_name: "Gratuit",
    admin: false,
    perms: { devlab: false, apk: false },
    limits: {},
    usage: {},
  }
  server.use = (b) =>
    b.p_feature === "ai"
      ? { ok: true, remaining: 29 }
      : {
          ok: false,
          reason: "plan",
          need: "standard",
          message:
            "La génération d’APK fait partie de l’offre Standard. Ton offre actuelle : Gratuit.",
        }
  r = await inv("ai:chat")
  ok(
    r === "ran:ai:chat" && calls.some((c) => /nx_use_feature/.test(c)),
    "Gratuit connecté : IA acceptée après consommation du quota sur le serveur",
  )
  r = await inv("android:build")
  ok(
    /offre Standard/.test(r),
    "Gratuit connecté : APK refusé par le serveur",
    r,
  )
  r = await inv("dev:open", "C:/x")
  ok(
    /Dev Lab fait partie de l’offre Standard/.test(r),
    "Gratuit connecté : Dev Lab refusé",
    r,
  )
  server.status = {
    ...server.status,
    plan: "standard",
    plan_name: "Standard",
    perms: { devlab: true, apk: true },
  }
  r = await inv("dev:open", "C:/x")
  ok(/Dev Lab/.test(r), "offre gardée 5 minutes avant plan:refresh")
  await inv("plan:refresh")
  r = await inv("dev:open", "C:/x")
  ok(r === "ran:dev:open", "Standard : Dev Lab accepté après plan:refresh")
  server.mode = "offline"
  await inv("mon:cloud-session", {
    url: "https://x.supabase.co",
    key: "anon",
    token: `${tok}b`,
    email: "a@b.c",
  })
  r = await inv("dev:open", "C:/x")
  ok(
    r === "ran:dev:open",
    "hors ligne : fonction réservée selon la dernière offre confirmée (même compte)",
    r,
  )
  r = await inv("sec:scan", { url: "https://a.com" })
  ok(/injoignables/.test(r), "hors ligne : fonction à quota refusée", r)
  server.mode = "missing"
  await inv("mon:cloud-session", {
    url: "https://x.supabase.co",
    key: "anon",
    token: `${tok}c`,
    email: "a@b.c",
  })
  r = await inv("android:build")
  ok(
    r === "ran:android:build",
    "serveurs sans migration : APK selon l’abonnement Standard",
    r,
  )
  r = await inv("plan:status")
  ok(
    r.source === "abonnement" && r.plan === "standard",
    "serveurs sans migration : offre lue dans l’abonnement",
  )
  await inv("mon:cloud-session", null)
  r = await inv("android:build")
  ok(/offre Standard/.test(r), "déconnexion : retour à l’offre Gratuite")
}

// ---------- 2. Migration sur PGlite ----------
async function sql() {
  console.log("\n— Migration 20261104000007_offres_limites.sql (PGlite)")
  const dir = process.env.PGLITE_DIR || "/tmp/pgtest"
  let PGlite
  try {
    const req = createRequire(path.join(dir, "package.json"))
    ;({ PGlite } = await import(
      pathToFileURL(req.resolve("@electric-sql/pglite")).href
    ))
  } catch {
    console.log(
      `PGlite introuvable dans ${dir} : partie sautée (voir l’en-tête du script).`,
    )
    return false
  }
  const MIG = fs.readFileSync(
    path.join(ROOT, "supabase/migrations/20261104000007_offres_limites.sql"),
    "utf8",
  )
  const db = new PGlite()
  const q = async (text, params) => (await db.query(text, params)).rows
  const ex = (text) => db.exec(text)
  await ex(`
create role anon; create role authenticated;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
create type app_role as enum ('user','admin','superadmin');
create type member_role as enum ('owner','admin','editor','viewer');
create type ticket_priority as enum ('low','normal','high','urgent');
create table profiles (id uuid primary key, app_role app_role not null default 'user', full_name text not null default '', email text);
create table organizations (id uuid primary key default gen_random_uuid(), name text not null, personal boolean not null default false, owner_id uuid, created_at timestamptz default now(), updated_at timestamptz default now());
create table organization_members (org_id uuid references organizations(id) on delete cascade, user_id uuid, role member_role not null default 'viewer', created_at timestamptz default now(), primary key (org_id, user_id));
create table plans (id text primary key, name text not null, description text not null default '', price_month_cents int not null default 0, price_year_cents int not null default 0, currency text not null default 'EUR', sort int not null default 0, active boolean not null default true, limits jsonb not null default '{}', features jsonb not null default '[]', created_at timestamptz default now(), updated_at timestamptz default now());
create table subscriptions (id uuid primary key default gen_random_uuid(), org_id uuid unique references organizations(id), plan_id text references plans(id), status text not null default 'active', provider text not null default 'manual', provider_ref text, seats int not null default 1, current_period_end timestamptz, created_at timestamptz default now(), updated_at timestamptz default now());
create table projects (id uuid primary key default gen_random_uuid(), org_id uuid not null, name text not null default '', local_key text, archived boolean default false, unique (org_id, local_key));
create table design_documents (id uuid primary key default gen_random_uuid(), org_id uuid not null, name text default '', local_id text, deleted_at timestamptz, unique (org_id, local_id));
create table monitors (id uuid primary key default gen_random_uuid(), org_id uuid not null, url text not null, name text default '');
create table assets (id uuid primary key default gen_random_uuid(), org_id uuid not null, size_bytes bigint not null default 0, path text default '');
create table invitations (id uuid primary key default gen_random_uuid(), org_id uuid not null, email text, status text not null default 'pending');
create table support_tickets (id uuid primary key default gen_random_uuid(), user_id uuid not null, org_id uuid, subject text not null, category text not null default 'general', priority ticket_priority not null default 'normal', status text not null default 'open');
create table app_insights_apps (id uuid primary key default gen_random_uuid(), owner uuid, app_id text, name text, ingest_key text default md5(random()::text), unique (owner, app_id));
create table nx_email_log (id bigserial primary key, user_id uuid, request_id bigint, kind text, created_at timestamptz default now());
create function nx_brevo_send(p_to text, p_to_name text, p_subject text, p_text text, p_kicker text default 'Supervision') returns bigint language sql as $$ select 42::bigint $$;
create or replace function public.nx_is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.app_role in ('admin', 'superadmin')); $$;
create or replace function public.nx_can_read_org(p_org uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = auth.uid())
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.app_role in ('admin', 'superadmin')); $$;
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public grant all on tables to authenticated, anon;
insert into plans (id, name, price_month_cents, price_year_cents, currency, sort, limits) values
 ('free','Gratuit',0,0,'EUR',1,'{"designs":10,"members":1,"monitors":1,"projects":3,"storage_mb":200,"scans_per_day":3}'),
 ('pro','Pro',900,9000,'EUR',2,'{"designs":500}'), ('team','Équipe',2900,29000,'EUR',3,'{}'), ('enterprise','Entreprise',0,0,'EUR',4,'{}');
`)
  const U = {
    free: "11111111-1111-1111-1111-111111111111",
    admin: "22222222-2222-2222-2222-222222222222",
    std: "33333333-3333-3333-3333-333333333333",
    team: "44444444-4444-4444-4444-444444444444",
  }
  const O = {
    free: "aaaaaaaa-0000-0000-0000-000000000001",
    admin: "aaaaaaaa-0000-0000-0000-000000000002",
    std: "aaaaaaaa-0000-0000-0000-000000000003",
    team: "aaaaaaaa-0000-0000-0000-000000000004",
  }
  for (const k of Object.keys(U)) {
    await q("insert into auth.users values ($1, $2)", [U[k], `${k}@ex.com`])
    await q("insert into profiles (id, app_role, email) values ($1, $2, $3)", [
      U[k],
      k === "admin" ? "superadmin" : "user",
      `${k}@ex.com`,
    ])
    await q(
      "insert into organizations (id, name, personal, owner_id) values ($1, $2, true, $3)",
      [O[k], k, U[k]],
    )
    await q("insert into organization_members values ($1, $2, 'owner')", [
      O[k],
      U[k],
    ])
  }
  await q(
    "insert into subscriptions (org_id, plan_id, status) values ($1, 'team', 'active')",
    [O.team],
  )

  // Deux passages, avec une retouche « du back office » entre les deux.
  await ex(MIG)
  await q(
    `update plans set limits = limits || '{"projects": 4}' where id = 'free'`,
  )
  await ex(MIG)
  const plans = await q(
    "select id, price_month_cents, currency, active, limits->>'projects' as projects from plans order by sort",
  )
  ok(
    plans
      .filter((p) => p.active)
      .map((p) => p.id)
      .join() === "free,standard,pro",
    "trois offres proposées : Gratuit, Standard, Pro",
  )
  ok(
    plans.find((p) => p.id === "standard").price_month_cents === 1000 &&
      plans.find((p) => p.id === "pro").price_month_cents === 2500 &&
      plans.every((p) => !p.active || p.currency === "USD"),
    "prix 0, 10 et 25 $",
  )
  ok(
    plans.find((p) => p.id === "free").projects === "4",
    "retouche du back office conservée au second passage",
  )
  await q(
    `update plans set limits = limits || '{"projects": 3}' where id = 'free'`,
  )
  ok(
    (
      await q("select plan_id from subscriptions where org_id = $1", [O.team])
    )[0].plan_id === "pro",
    "abonnement Équipe passé à Pro",
  )
  await q(
    "insert into subscriptions (org_id, plan_id) values ($1, 'standard')",
    [O.std],
  )

  const as = async (user, text, params) => {
    await ex(
      `reset role; select set_config('request.jwt.claim.sub', '${user}', false); set role authenticated;`,
    )
    try {
      return await q(text, params)
    } finally {
      await ex("reset role")
    }
  }
  const asErr = async (user, text, params) => {
    try {
      await as(user, text, params)
      return null
    } catch (e) {
      return e.message
    }
  }
  const rpc = async (user, fn, args = "") =>
    (await as(user, `select public.${fn}(${args}) as r`))[0].r

  let r = await rpc(
    U.free,
    "nx_app_claim",
    "'a1', 'Mon app', 'url', 'https://example.com/'",
  )
  ok(
    r.ok && r.status === "trial" && r.days_left === 7,
    "Gratuit : 1re application, essai de 7 jours",
  )
  r = await rpc(U.free, "nx_app_claim", "'a2', 'Dossier', 'folder', null")
  ok(
    !r.ok && r.reason === "source" && r.need === "standard",
    "Gratuit : application depuis un dossier refusée",
    r.message,
  )
  r = await rpc(
    U.free,
    "nx_app_claim",
    "'a2', 'Local', 'url', 'http://localhost:3000'",
  )
  ok(!r.ok && r.reason === "url", "Gratuit : adresse locale refusée")
  r = await rpc(
    U.free,
    "nx_app_claim",
    "'a2', 'Privée', 'url', 'http://192.168.1.4/'",
  )
  ok(!r.ok && r.reason === "url", "Gratuit : adresse privée refusée")
  r = await rpc(
    U.free,
    "nx_app_claim",
    "'a2', 'App 2', 'url', 'https://shop.example.org/fr'",
  )
  ok(r.ok && r.status === "trial", "Gratuit : 2e application")
  r = await rpc(
    U.free,
    "nx_app_claim",
    "'a1', 'Mon app renommée', 'url', 'https://example.com/'",
  )
  ok(
    r.ok && r.name === "Mon app renommée",
    "Gratuit : même application réenregistrée, sans nouvel essai",
  )
  r = await rpc(
    U.free,
    "nx_app_claim",
    "'a3', 'App 3', 'url', 'https://example.net'",
  )
  ok(
    !r.ok && r.reason === "quota",
    "Gratuit : 3e application refusée",
    r.message,
  )
  await rpc(U.free, "nx_app_release", "'a1'")
  r = await rpc(
    U.free,
    "nx_app_claim",
    "'a4', 'App 4', 'url', 'https://example.net'",
  )
  ok(
    !r.ok && r.reason === "quota",
    "Gratuit : supprimer une application ne rend pas d’essai",
  )
  ok(
    (await asErr(
      U.free,
      "insert into nx_app_trials (user_id, local_id) values ($1, 'x')",
      [U.free],
    )) !== null,
    "écriture directe dans nx_app_trials refusée",
  )
  await q(
    "update nx_app_trials set trial_ends_at = now() - interval '1 minute' where local_id = 'a2'",
  )
  r = await rpc(U.free, "nx_app_status")
  ok(
    r.apps.a2.status === "expired" &&
      r.used === 2 &&
      r.limit === 2 &&
      r.trial_days === 7,
    "Gratuit : essai terminé → application verrouillée (expired)",
  )
  await q(
    "insert into subscriptions (org_id, plan_id) values ($1, 'standard')",
    [O.free],
  )
  r = await rpc(U.free, "nx_app_status")
  ok(
    r.apps.a2.status === "active" && r.plan === "standard",
    "passage à Standard : application débloquée",
  )
  r = await rpc(U.free, "nx_app_claim", "'a5', 'Dossier', 'folder', null")
  ok(
    r.ok && r.status === "active" && r.trial_ends_at === null,
    "Standard : application depuis un dossier, sans essai",
  )
  await q("delete from subscriptions where org_id = $1", [O.free])
  r = await rpc(U.free, "nx_app_status")
  ok(
    r.apps.a5.status === "plan",
    "retour au Gratuit : application créée en Standard verrouillée",
  )

  r = await rpc(U.free, "nx_use_feature", "'apk'")
  ok(
    !r.ok && r.reason === "plan" && r.need === "standard",
    "Gratuit : APK refusé (Standard)",
    r.message,
  )
  r = await rpc(U.free, "nx_use_feature", "'crawler'")
  ok(!r.ok && r.need === "standard", "Gratuit : Crawler refusé")
  r = await rpc(U.free, "nx_use_feature", "'responsive_advanced'")
  ok(!r.ok && r.need === "standard", "Gratuit : Responsive avancé refusé")
  for (let i = 0; i < 29; i += 1) await rpc(U.free, "nx_use_feature", "'ai'")
  r = await rpc(U.free, "nx_use_feature", "'ai'")
  ok(r.ok && r.remaining === 0, "Gratuit : 30e requête IA acceptée")
  r = await rpc(U.free, "nx_use_feature", "'ai'")
  ok(
    !r.ok && r.reason === "quota",
    "Gratuit : 31e requête IA refusée",
    r.message,
  )
  r = await rpc(U.free, "nx_use_feature", "'ai', 1, true")
  ok(!r.ok && r.reason === "quota", "vérification sans consommer")
  r = await rpc(U.free, "nx_use_feature", "'nimporte'")
  ok(!r.ok && r.reason === "unknown", "fonction inconnue refusée")
  r = await rpc(U.std, "nx_use_feature", "'apk'")
  ok(
    r.ok && r.remaining === 59,
    "Standard : APK accepté, 60 constructions par mois",
  )
  r = await rpc(U.std, "nx_use_feature", "'studio_advanced'")
  ok(!r.ok && r.need === "pro", "Standard : Studio 3D avancé refusé (Pro)")
  r = await rpc(U.team, "nx_use_feature", "'studio_advanced'")
  ok(
    r.ok && r.plan === "pro",
    "ancien Équipe devenu Pro : Studio 3D avancé accepté",
  )
  r = await rpc(U.admin, "nx_use_feature", "'apk'")
  ok(r.ok && r.admin, "administrateur : jamais limité")
  await ex("select set_config('request.jwt.claim.sub', '', false)")
  r = (await q("select public.nx_use_feature('ai') as r"))[0].r
  ok(!r.ok && r.reason === "auth", "sans compte : connexion demandée")

  for (let i = 1; i <= 3; i += 1)
    await as(
      U.free,
      "insert into projects (org_id, name, local_key) values ($1, $2, $3)",
      [O.free, `P${i}`, `k${i}`],
    )
  let e = await asErr(
    U.free,
    "insert into projects (org_id, name, local_key) values ($1, 'P4', 'k4')",
    [O.free],
  )
  ok(e && /3 projets au maximum/.test(e), "Gratuit : 4e projet refusé", e)
  e = await asErr(
    U.free,
    "insert into projects (org_id, name, local_key) values ($1, 'P1 bis', 'k1') on conflict (org_id, local_key) do update set name = excluded.name",
    [O.free],
  )
  ok(e === null, "synchronisation (upsert) d’un projet existant acceptée")
  e = await asErr(
    U.free,
    "insert into projects (org_id, name, local_key) values ($1, 'A', 'z1'), ($1, 'B', 'z2')",
    [O.std],
  )
  ok(e === null, "Standard : plusieurs projets d’un coup")
  e = await asErr(
    U.free,
    "insert into organization_members values ($1, $2, 'editor')",
    [O.free, U.std],
  )
  ok(e && /membres/.test(e), "Gratuit : 2e membre refusé")
  e = await asErr(
    U.free,
    "insert into invitations (org_id, email) values ($1, 'x@ex.com')",
    [O.free],
  )
  ok(e && /inviter/.test(e), "Gratuit : invitation refusée")
  e = await asErr(
    U.free,
    "insert into monitors (org_id, url) values ($1, 'https://a.com'), ($1, 'https://b.com')",
    [O.free],
  )
  ok(e && /sites surveillés/.test(e), "Gratuit : 2e site surveillé refusé")
  e = await asErr(
    U.free,
    "insert into assets (org_id, size_bytes) values ($1, 150 * 1048576)",
    [O.free],
  )
  ok(e === null, "Gratuit : 150 Mo de fichiers acceptés")
  e = await asErr(
    U.free,
    "insert into assets (org_id, size_bytes) values ($1, 60 * 1048576)",
    [O.free],
  )
  ok(e && /Mo de stockage/.test(e), "Gratuit : dépassement des 200 Mo refusé")
  for (let i = 1; i <= 3; i += 1)
    await as(
      U.free,
      "insert into design_documents (org_id, local_id) values ($1, $2)",
      [O.free, `d${i}`],
    )
  e = await asErr(
    U.free,
    "insert into design_documents (org_id, local_id) values ($1, 'd4')",
    [O.free],
  )
  ok(
    e && /documents NEX-DESIGN/.test(e),
    "Gratuit : 4e document NEX-DESIGN refusé",
  )
  e = await asErr(
    U.admin,
    "insert into projects (org_id, name, local_key) values ($1, 'admin', 'kadm')",
    [O.free],
  )
  ok(e === null, "administrateur : limites des données non appliquées")

  e = await asErr(U.free, "select public.nx_alert_email('Sujet', 'Texte')")
  ok(e && /offre Standard/.test(e), "Gratuit : alertes par e-mail refusées")
  r = await rpc(U.std, "nx_alert_email", "'Sujet', 'Texte'")
  ok(r.ok, "Standard : alerte par e-mail envoyée")
  e = await asErr(
    U.std,
    "select * from public.app_insights_register('com.ex.app', 'App')",
  )
  ok(e && /offre Pro/.test(e), "Standard : SDK de statistiques refusé (Pro)")
  e = await asErr(
    U.team,
    "select * from public.app_insights_register('com.ex.app', 'App')",
  )
  ok(e === null, "Pro : SDK de statistiques accepté")
  await as(
    U.team,
    "insert into support_tickets (user_id, subject) values ($1, 'Aide')",
    [U.team],
  )
  await as(
    U.std,
    "insert into support_tickets (user_id, subject) values ($1, 'Aide')",
    [U.std],
  )
  const tk = await q("select user_id, priority from support_tickets")
  ok(
    tk.find((x) => x.user_id === U.team).priority === "high" &&
      tk.find((x) => x.user_id === U.std).priority === "normal",
    "Pro : ticket en priorité haute ; Standard : priorité normale",
  )

  r = await rpc(U.free, "nx_plan_status")
  ok(
    r.plan === "free" &&
      r.usage.projects === 4 &&
      r.usage.ai_requests_month === 30 &&
      r.usage.apps === 2 &&
      r.limits.apps === 2,
    "nx_plan_status : offre, limites et usage du compte Gratuit",
  )
  e = await asErr(U.free, "select public.nx_plan_status($1)", [O.std])
  ok(
    e && /Accès refusé/.test(e),
    "nx_plan_status : espace d’un autre compte refusé",
  )
  e = await asErr(
    U.free,
    "select public.nx_app_trial_extend((select id from nx_app_trials where local_id = 'a2' limit 1), 7)",
  )
  ok(
    e && /administrateurs/.test(e),
    "prolonger un essai : réservé aux administrateurs",
  )
  r = await rpc(
    U.admin,
    "nx_app_trial_extend",
    "(select id from nx_app_trials where local_id = 'a2' limit 1), 7",
  )
  ok(!!r, "administrateur : essai prolongé")
  return true
}

await gates()
const ran = await sql()
console.log(
  `\n${count} vérifications, ${fails ? `${fails} échec(s)` : "aucun échec"}${
    ran ? "" : " (partie SQL sautée)"
  }.`,
)
process.exit(fails ? 1 : 0)
