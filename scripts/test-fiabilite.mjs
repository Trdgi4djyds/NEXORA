// NEXORA #048 : essais de la migration supabase/migrations/20261105000008_fiabilite.sql, rejouée deux fois sur
// un vrai Postgres (PGlite, en WebAssembly) après la supervision (20261104000002) et les offres (20261104000007),
// avec pg_net, Vault et l'envoi des e-mails simulés : types de vérification (API, DNS, domaine, contenu),
// signal de vie, maintenance, escalade, webhooks, heures calmes, pages de statut, visiteurs réels, deuxième
// région, repères de déploiement, offres.
// PGlite n'est pas une dépendance du dépôt : même installation que scripts/test-offres.mjs
//   mkdir -p /tmp/pgtest && cd /tmp/pgtest && echo '{}' > package.json && pnpm add @electric-sql/pglite@0.3
// puis : node scripts/test-fiabilite.mjs (dossier réglable par PGLITE_DIR).
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const dir = process.env.PGLITE_DIR || "/tmp/pgtest"
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
const mig = (n) =>
  fs.readFileSync(path.join(ROOT, "supabase/migrations", n), "utf8")

const entry = path.join(dir, "node_modules/@electric-sql/pglite/dist/index.js")
if (!fs.existsSync(entry)) {
  console.log(
    `PGlite introuvable dans ${dir} : essais sautés (voir l’en-tête du script).`,
  )
  process.exit(0)
}
const { PGlite } = await import(pathToFileURL(entry).href)
const db = new PGlite()
const q = async (text, params) => (await db.query(text, params)).rows
const ex = (text) => db.exec(text)
const as = async (uid, fn) => {
  await ex(
    `set request.jwt.claim.sub = '${uid || ""}'; set role ${
      uid ? "authenticated" : "anon"
    };`,
  )
  try {
    return await fn()
  } finally {
    await ex("reset role; set request.jwt.claim.sub = '';")
  }
}

await ex(`
create role anon; create role authenticated;
create schema auth;
create table auth.users (id uuid primary key, email text, created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
create schema vault;
create table vault.secrets (name text primary key, secret text);
create view vault.decrypted_secrets as select name, secret as decrypted_secret from vault.secrets;
create function vault.create_secret(s text, n text, d text default '') returns uuid language sql as $$ insert into vault.secrets values (n, s); select gen_random_uuid() $$;
create schema net;
create table net._http_response (id bigint primary key, status_code int, content text, timed_out boolean default false, error_msg text, created timestamptz default now());
create table net.calls (id bigserial primary key, kind text, url text, body jsonb, headers jsonb);
create function net.http_get(url text, params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as $$ insert into net.calls (kind, url, headers) values ('get', url, headers) returning id $$;
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language sql as $$ insert into net.calls (kind, url, body, headers) values ('post', url, body, headers) returning id $$;
create type app_role as enum ('user','admin','superadmin');
create type member_role as enum ('owner','admin','editor','viewer');
create type ticket_priority as enum ('low','normal','high','urgent');
create table profiles (id uuid primary key, app_role app_role not null default 'user', full_name text not null default '', email text, timezone text);
create table organizations (id uuid primary key default gen_random_uuid(), name text not null, personal boolean not null default false, owner_id uuid, created_at timestamptz default now(), updated_at timestamptz default now());
create table organization_members (org_id uuid references organizations(id) on delete cascade, user_id uuid, role member_role not null default 'viewer', created_at timestamptz default now(), primary key (org_id, user_id));
create table plans (id text primary key, name text not null, description text not null default '', price_month_cents int not null default 0, price_year_cents int not null default 0, currency text not null default 'EUR', sort int not null default 0, active boolean not null default true, limits jsonb not null default '{}', features jsonb not null default '[]', created_at timestamptz default now(), updated_at timestamptz default now());
create table subscriptions (id uuid primary key default gen_random_uuid(), org_id uuid unique references organizations(id), plan_id text references plans(id), status text not null default 'active', provider text not null default 'manual', provider_ref text, seats int not null default 1, current_period_end timestamptz, created_at timestamptz default now(), updated_at timestamptz default now());
create table projects (id uuid primary key default gen_random_uuid(), org_id uuid not null, name text not null default '', local_key text, archived boolean default false, unique (org_id, local_key));
create table design_documents (id uuid primary key default gen_random_uuid(), org_id uuid not null, name text default '', local_id text, deleted_at timestamptz, unique (org_id, local_id));
create table monitors (id uuid primary key default gen_random_uuid(), org_id uuid not null references organizations(id), project_id uuid, created_by uuid, url text not null, name text default '', interval_minutes int not null default 5, expected_status int default 200, keyword text, active boolean not null default true, last_status text, last_checked_at timestamptz, last_latency_ms int, last_error text, created_at timestamptz default now(), updated_at timestamptz default now());
create table monitor_checks (id bigserial primary key, monitor_id uuid references monitors(id) on delete cascade, org_id uuid, checked_at timestamptz default now(), ok boolean, status_code int, latency_ms int, error text);
create index monitor_checks_monitor_idx on monitor_checks (monitor_id, checked_at desc);
create table monitor_requests (monitor_id uuid references monitors(id) on delete cascade, request_id bigint, started_at timestamptz default now());
create table notifications (id bigserial primary key, user_id uuid, kind text, title text, body text, link text, created_at timestamptz default now());
create table app_config (key text primary key, value jsonb);
create table assets (id uuid primary key default gen_random_uuid(), org_id uuid not null, size_bytes bigint not null default 0, path text default '');
create table invitations (id uuid primary key default gen_random_uuid(), org_id uuid not null, email text, status text not null default 'pending');
create table support_tickets (id uuid primary key default gen_random_uuid(), user_id uuid not null, org_id uuid, subject text not null, category text not null default 'general', priority ticket_priority not null default 'normal', status text not null default 'open');
create table app_insights_apps (id uuid primary key default gen_random_uuid(), owner uuid, app_id text, name text, ingest_key text default md5(random()::text), unique (owner, app_id));
create table app_insights_events (id bigserial primary key, app uuid references app_insights_apps(id));
alter table app_insights_apps enable row level security; alter table app_insights_events enable row level security;
create table invoices (id uuid primary key default gen_random_uuid(), number text, user_id uuid, org_id uuid);
alter table invoices enable row level security;
create table nx_email_log (id bigserial primary key, user_id uuid, request_id bigint, kind text, to_email text, created_at timestamptz default now());
create table mails (id bigserial primary key, fn text, to_email text, subject text);
create function nx_html(p text) returns text language sql immutable as $$ select replace(replace(coalesce(p, ''), '<', '&lt;'), '>', '&gt;') $$;
create function nx_brevo_send(p_to text, p_to_name text, p_subject text, p_text text, p_kicker text default 'Supervision') returns bigint language sql as $$ insert into mails (fn, to_email, subject) values ('send', p_to, p_subject) returning id $$;
create function nx_brevo_post(p_to text, p_to_name text, p_subject text, p_html text, p_text text, p_tag text, p_attachments jsonb default null) returns bigint language sql as $$ insert into mails (fn, to_email, subject) values ('post:' || p_tag, p_to, p_subject) returning id $$;
create function nx_email_quota(p_needed integer) returns integer language sql as $$ select 200 $$;
create or replace function public.nx_is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.app_role in ('admin', 'superadmin')); $$;
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public grant all on tables to authenticated, anon;
insert into plans (id, name, price_month_cents, price_year_cents, currency, sort, limits) values
 ('free','Gratuit',0,0,'EUR',1,'{"monitors":1}'), ('pro','Pro',900,9000,'EUR',2,'{}'), ('team','Équipe',2900,29000,'EUR',3,'{}'), ('enterprise','Entreprise',0,0,'EUR',4,'{}');
insert into app_config values ('email_alerts', '{"enabled": true}'), ('web_url', '"https://nexora.example/"');
`)

const U = {
  free: "11111111-1111-1111-1111-111111111111",
  pro: "22222222-2222-2222-2222-222222222222",
  std: "33333333-3333-3333-3333-333333333333",
}
const O = {
  free: "aaaaaaaa-0000-0000-0000-000000000001",
  pro: "aaaaaaaa-0000-0000-0000-000000000002",
  std: "aaaaaaaa-0000-0000-0000-000000000003",
}
for (const k of Object.keys(U)) {
  await q("insert into auth.users (id, email) values ($1, $2)", [
    U[k],
    `${k}@ex.com`,
  ])
  await q(
    "insert into profiles (id, email, timezone) values ($1, $2, 'Europe/Paris')",
    [U[k], `${k}@ex.com`],
  )
  await q(
    "insert into organizations (id, name, personal, owner_id) values ($1, $2, true, $3)",
    [O[k], k, U[k]],
  )
  await q("insert into organization_members values ($1, $2, 'owner')", [
    O[k],
    U[k],
  ])
}

console.log("\n— Migrations")
await ex(mig("20261104000002_supervision_serveur.sql"))
await ex(mig("20261104000007_offres_limites.sql"))
await q(
  "insert into subscriptions (org_id, plan_id) values ($1, 'pro'), ($2, 'standard')",
  [O.pro, O.std],
)
let err = null
try {
  await ex(mig("20261105000008_fiabilite.sql"))
  await ex(mig("20261105000008_fiabilite.sql"))
} catch (e) {
  err = e
}
ok(!err, "migration appliquée deux fois sans erreur", err && err.message)
if (err) process.exit(1)
await ex(
  `create trigger nx_notification_email after insert on notifications for each row when (new.kind = 'monitor') execute function nx_notification_email();`,
)

const perms = await q(
  "select id, perms->>'status_page' sp, perms->>'synthetic' sy, perms->>'multi_region' mr from plans where active order by sort",
)
ok(
  perms.map((p) => `${p.id}:${p.sp}/${p.sy}/${p.mr}`).join(" ") ===
    "free:false/false/false standard:true/false/false pro:true/true/true",
  "nouvelles permissions des offres",
  perms,
)
ok(
  (await q("select perm from nx_feature_rule('synthetic')"))[0].perm ===
    "synthetic",
  "fonction « parcours » connue des offres",
)

const mon = async (o, extra) => {
  const { url = "https://site.example/", name = "Site", ...rest } = extra
  const keys = Object.keys(rest)
  return (
    await q(
      `insert into monitors (org_id, url, name, interval_minutes${keys.map((k) => `, ${k}`).join("")}) values ($1, $2, $3, 1${keys.map((_, i) => `, $${i + 4}`).join("")}) returning *`,
      [o, url, name, ...Object.values(rest)],
    )
  )[0]
}
const fakeResponse = async (m, status, content) => {
  const id = (
    await q("select coalesce(max(id), 1000) + 1 n from net._http_response")
  )[0].n
  await q(
    "insert into net._http_response (id, status_code, content) values ($1, $2, $3)",
    [id, status, content],
  )
  await q(
    "insert into monitor_requests (monitor_id, request_id, started_at) values ($1, $2, now() - interval '2 seconds')",
    [m.id, id],
  )
  await q("select collect_monitor_results()")
}

process.on("unhandledRejection", (e) => {
  console.log(
    `ÉCHEC exception : ${e.message}${
      e.query ? ` — ${e.query.slice(0, 160)}` : ""
    }`,
  )
  process.exit(1)
})
console.log("\n— Signal de vie")
const hb = await mon(O.pro, { kind: "heartbeat", name: "Sauvegarde" })
ok(
  /^[0-9a-f]{24}$/.test(hb.heartbeat_token || ""),
  "jeton créé pour le signal de vie",
)
const ping = await as(null, () =>
  q("select nx_heartbeat_ping($1) r", [hb.heartbeat_token]),
)
ok(ping[0].r.ok === true, "signal reçu sans compte (adresse publique)")
ok(
  (
    await q(
      "select count(*)::int n from monitor_checks where monitor_id = $1 and ok",
      [hb.id],
    )
  )[0].n === 1,
  "signal enregistré comme vérification réussie",
)
ok(
  (await as(null, () => q("select nx_heartbeat_ping('inconnu') r")))[0].r.ok ===
    false,
  "jeton inconnu refusé",
)
await q(
  "update monitors set last_ping_at = now() - interval '20 minutes', last_checked_at = now() - interval '2 minutes' where id = $1",
  [hb.id],
)
await q("select run_monitor_checks()")
await q(
  "update monitors set last_checked_at = now() - interval '2 minutes' where id = $1",
  [hb.id],
)
await q("select run_monitor_checks()")
const hbInc = await q(
  "select kind, cause from monitor_incidents where monitor_id = $1",
  [hb.id],
)
ok(
  hbInc.length === 1 &&
    hbInc[0].kind === "down" &&
    /aucun signal/.test(hbInc[0].cause),
  "signal manquant : panne confirmée au 2e passage",
  hbInc,
)

console.log("\n— Webhooks, escalade, heures calmes")
await q(
  "insert into monitor_webhooks (org_id, name, url, events) values ($1, 'Slack', 'https://hooks.slack.com/services/x', 'all'), ($1, 'Astreinte', 'https://astreinte.example/h', 'escalation')",
  [O.pro],
)
const site = await mon(O.pro, {
  url: "https://boutique.example/",
  name: "Boutique",
  escalate_min: 1,
})
await q("select nx_monitor_record($1, now(), false, 503, null, 'statut 503')", [
  site.id,
])
await q("select nx_monitor_record($1, now(), false, 503, null, 'statut 503')", [
  site.id,
])
const calls = await q(
  "select url, body from net.calls where kind = 'post' order by id",
)
ok(
  calls.some((c) => /slack/.test(c.url) && /hors ligne/.test(c.body.text)),
  "webhook Slack prévenu de la panne",
)
ok(
  !calls.some((c) => /astreinte/.test(c.url)),
  "webhook « escalades seulement » pas encore appelé",
)
await q(
  "update monitor_incidents set started_at = now() - interval '5 minutes' where monitor_id = $1",
  [site.id],
)
await q("select nx_monitor_record($1, now(), false, 503, null, 'statut 503')", [
  site.id,
])
ok(
  (
    await q(
      "select escalated_at from monitor_incidents where monitor_id = $1 and kind = 'down'",
      [site.id],
    )
  )[0].escalated_at !== null,
  "escalade après le délai sans prise en charge",
)
ok(
  (
    await q(
      "select count(*)::int n from net.calls where url like '%astreinte%'",
    )
  )[0].n === 1,
  "webhook d'escalade appelé une fois",
)
await q(
  "insert into nx_alert_prefs (user_id, quiet_from, quiet_to) values ($1, 0, 0)",
  [U.pro],
)
await q(
  "update nx_alert_prefs set quiet_from = (extract(hour from now() at time zone 'Europe/Paris')::int + 23) % 24, quiet_to = (extract(hour from now() at time zone 'Europe/Paris')::int + 1) % 24 where user_id = $1",
  [U.pro],
)
const before = (
  await q("select count(*)::int n from mails where fn = 'send'")
)[0].n
await q(
  "insert into notifications (user_id, kind, title, body) values ($1, 'monitor', 'Boutique est lent', '…'), ($1, 'monitor', 'Boutique est hors ligne', '…')",
  [U.pro],
)
const sent = await q(
  "select subject from mails where fn = 'send' order by id offset $1",
  [before],
)
ok(
  sent.length === 1 && /hors ligne/.test(sent[0].subject),
  "heures calmes : seule la panne part par e-mail",
  sent,
)
await q("delete from nx_alert_prefs")

console.log("\n— Maintenance")
const mt = await mon(O.pro, { url: "https://api.example/", name: "API" })
await q(
  "insert into monitor_maintenance (org_id, monitor_id, label, starts_at, ends_at) values ($1, $2, 'Mise à jour', now() - interval '5 minutes', now() + interval '1 hour')",
  [O.pro, mt.id],
)
for (let i = 0; i < 3; i++)
  await q(
    "select nx_monitor_record($1, now(), false, 0, null, 'injoignable')",
    [mt.id],
  )
ok(
  (
    await q(
      "select count(*)::int n from monitor_checks where monitor_id = $1",
      [mt.id],
    )
  )[0].n === 0,
  "aucune mesure pendant la maintenance",
)
ok(
  (
    await q(
      "select count(*)::int n from monitor_incidents where monitor_id = $1",
      [mt.id],
    )
  )[0].n === 0,
  "aucun incident pendant la maintenance",
)
await q(
  "update monitor_maintenance set starts_at = now() - interval '3 days' - interval '10 minutes', ends_at = now() - interval '3 days' + interval '20 minutes', recur = 'daily' where monitor_id = $1",
  [mt.id],
)
ok(
  (
    await q("select nx_monitor_in_maint(m) r from monitors m where id = $1", [
      mt.id,
    ])
  )[0].r === true,
  "maintenance quotidienne reconnue trois jours plus tard",
)
await q("delete from monitor_maintenance")

console.log("\n— Types de vérification")
const api = await mon(O.pro, {
  kind: "api",
  url: "https://api.example/sante",
  name: "API santé",
  json_path: "data.status",
  json_expect: "ok",
})
await fakeResponse(api, 200, '{"data":{"status":"degrade"}}')
const apiCheck = (
  await q(
    "select ok, error from monitor_checks where monitor_id = $1 order by id desc limit 1",
    [api.id],
  )
)[0]
ok(
  apiCheck.ok === false && /data.status = degrade/.test(apiCheck.error),
  "API : valeur JSON contrôlée",
  apiCheck,
)
await fakeResponse(api, 200, '{"data":{"status":"ok"}}')
ok(
  (
    await q(
      "select ok from monitor_checks where monitor_id = $1 order by id desc limit 1",
      [api.id],
    )
  )[0].ok === true,
  "API : valeur attendue acceptée",
)
const dns = await mon(O.pro, {
  kind: "dns",
  url: "https://site.example",
  name: "DNS",
  dns_watch: true,
  dns_last: "1.1.1.1",
})
await fakeResponse(
  dns,
  200,
  '{"Status":0,"Answer":[{"type":1,"data":"2.2.2.2"}]}',
)
ok(
  (
    await q("select kind from monitor_incidents where monitor_id = $1", [
      dns.id,
    ])
  )[0]?.kind === "change",
  "DNS : changement d'enregistrement signalé",
)
const dom = await mon(O.pro, {
  kind: "domain",
  url: "https://site.example",
  name: "Domaine",
})
await fakeResponse(
  dom,
  200,
  JSON.stringify({
    events: [
      {
        eventAction: "expiration",
        eventDate: new Date(Date.now() + 10 * 86400e3).toISOString(),
      },
    ],
  }),
)
const domRow = (
  await q("select domain_days from monitors where id = $1", [dom.id])
)[0]
ok(
  domRow.domain_days === 9 || domRow.domain_days === 10,
  "domaine : jours restants lus",
  domRow,
)
ok(
  (
    await q("select kind from monitor_incidents where monitor_id = $1", [
      dom.id,
    ])
  )[0]?.kind === "domain",
  "domaine : incident sous 30 jours",
)
const pg = await mon(O.pro, {
  url: "https://vitrine.example/",
  name: "Vitrine",
  watch_change: true,
})
await fakeResponse(pg, 200, "<html><p>Bienvenue 2026</p></html>")
await fakeResponse(
  pg,
  200,
  "<html><script>x=1</script><p>Bienvenue 2027</p></html>",
)
ok(
  (
    await q(
      "select count(*)::int n from monitor_incidents where monitor_id = $1",
      [pg.id],
    )
  )[0].n === 0,
  "contenu : dates et scripts ignorés",
)
await fakeResponse(pg, 200, "<html><p>Page piratée</p></html>")
ok(
  (
    await q("select kind from monitor_incidents where monitor_id = $1", [pg.id])
  )[0]?.kind === "change",
  "contenu : modification signalée",
)
const before2 = (await q("select count(*)::int n from net.calls"))[0].n
await q("update monitors set active = false where id not in ($1, $2)", [
  api.id,
  dom.id,
])
await q(
  "update monitors set last_checked_at = now() - interval '10 minutes', domain_checked_at = null where id in ($1, $2)",
  [api.id, dom.id],
)
await q("delete from monitor_requests")
await q("select run_monitor_checks()")
const newCalls = await q("select url from net.calls offset $1", [before2])
ok(
  newCalls.some((c) => /rdap\.org\/domain\/site\.example/.test(c.url)) &&
    newCalls.some((c) => /api\.example\/sante/.test(c.url)),
  "requêtes lancées selon le type",
  newCalls,
)
await q("update monitors set active = true")

console.log("\n— Offres : page de statut et visiteurs réels")
let e1 = null
try {
  await as(U.free, () =>
    q(
      "insert into status_pages (org_id, slug, title) values ($1, 'gratuit', 'x')",
      [O.free],
    ),
  )
} catch (e) {
  e1 = e.message
}
ok(
  /Standard/.test(e1 || ""),
  "page de statut refusée avec l'offre Gratuite",
  e1,
)
await as(U.std, () =>
  q(
    "insert into status_pages (org_id, slug, title) values ($1, 'boutique-std', 'Boutique')",
    [O.std],
  ),
)
ok(true, "page de statut acceptée avec l'offre Standard")
let e2 = null
try {
  await as(U.std, () =>
    q("insert into rum_sites (org_id, name) values ($1, 'x')", [O.std]),
  )
} catch (e) {
  e2 = e.message
}
ok(/Pro/.test(e2 || ""), "visiteurs réels réservés à Pro", e2)

console.log("\n— Page de statut publique")
await as(U.pro, () =>
  q(
    "insert into status_pages (org_id, slug, title, monitor_ids) values ($1, 'ma-boutique', 'Ma boutique', array[$2::uuid, $3::uuid])",
    [O.pro, site.id, api.id],
  ),
)
const page = (
  await as(null, () => q("select nx_status_page('ma-boutique') r"))
)[0].r
ok(
  page &&
    page.services.length === 2 &&
    page.services.some((s) => s.status === "down") &&
    page.overall === "down",
  "page lue sans compte : services et état",
  page && { overall: page.overall, n: page.services.length },
)
ok(page.services[0].days.length === 90, "historique sur 90 jours")
ok(
  (await as(null, () => q("select nx_status_page('autre') r")))[0].r === null,
  "page inconnue : rien",
)
const sub = (
  await as(null, () =>
    q("select nx_status_subscribe('ma-boutique', 'Client@Ex.com') r"),
  )
)[0].r
ok(
  sub.ok &&
    (
      await q(
        "select count(*)::int n from mails where fn = 'post:statut' and to_email = 'client@ex.com'",
      )
    )[0].n === 1,
  "abonnement : e-mail de confirmation",
)
ok(
  (
    await as(null, () =>
      q("select nx_status_subscribe('ma-boutique', 'pas-un-email') r"),
    )
  )[0].r.ok === false,
  "adresse invalide refusée",
)
const tok = (await q("select token from status_subscribers"))[0].token
ok(
  (await as(null, () => q("select nx_status_confirm($1) r", [tok])))[0].r
    .slug === "ma-boutique",
  "abonnement confirmé",
)
await q("select nx_monitor_record($1, now(), true, 200, 120, null)", [site.id])
ok(
  (
    await q(
      "select count(*)::int n from mails where fn = 'post:statut' and subject like '%de nouveau en ligne%'",
    )
  )[0].n === 1,
  "abonnés prévenus du retour à la normale",
)
let denied = null
try {
  await as(null, () => q("select * from status_subscribers"))
} catch (e) {
  denied = e.message
}
ok(Boolean(denied), "liste des abonnés illisible sans compte")

console.log("\n— Visiteurs réels")
const rs = (
  await as(U.pro, () =>
    q(
      "insert into rum_sites (org_id, name, origins) values ($1, 'Boutique', array['https://boutique.example']) returning key, id",
      [O.pro],
    ),
  )
)[0]
const ev = JSON.stringify([
  {
    path: "/panier?x=1",
    device: "mobile",
    lcp: 3200,
    inp: 180,
    cls: 0.05,
    ttfb: 400,
  },
  { path: "/", device: "desktop", lcp: 1200, inp: 60, cls: 0.01 },
  { path: "/", err: "TypeError: x is undefined", src: "app.js:12" },
])
ok(
  (
    await as(null, () =>
      q("select nx_rum_collect($1, 'https://autre.example', $2::jsonb) n", [
        rs.key,
        ev,
      ]),
    )
  )[0].n === 0,
  "origine non autorisée ignorée",
)
ok(
  (
    await as(null, () =>
      q("select nx_rum_collect($1, 'https://boutique.example', $2::jsonb) n", [
        rs.key,
        ev,
      ]),
    )
  )[0].n === 3,
  "mesures reçues sans compte",
)
const sum = (
  await as(U.pro, () => q("select rum_summary($1, 24) r", [rs.id]))
)[0].r
ok(
  sum.views === 2 &&
    sum.errors_total === 1 &&
    sum.pages.some((p) => p.path === "/panier"),
  "synthèse : vues, erreurs, pages (adresse sans paramètres)",
  { views: sum.views, err: sum.errors_total },
)
ok(
  (await as(U.std, () => q("select rum_summary($1, 24) r", [rs.id])))[0].r
    .views === 0,
  "mesures invisibles pour une autre équipe",
)

console.log("\n— Deuxième région")
await q("select vault.create_secret('s3cret', 'nx_probe_secret')")
const s2 = await mon(O.pro, {
  url: "https://regional.example/",
  name: "Régional",
})
await q(
  "select nx_monitor_record($1, now(), false, 0, null, 'délai dépassé')",
  [s2.id],
)
await q(
  "select nx_monitor_record($1, now(), false, 0, null, 'délai dépassé')",
  [s2.id],
)
ok(
  (
    await q(
      "select count(*)::int n from monitor_incidents where monitor_id = $1",
      [s2.id],
    )
  )[0].n === 0,
  "panne en attente de la deuxième région",
)
ok(
  (await as(null, () => q("select nx_probe_jobs('faux') r")))[0].r.length === 0,
  "secret faux : aucune tâche",
)
const jobs = (await as(null, () => q("select nx_probe_jobs('s3cret') r")))[0].r
ok(
  jobs.some((j) => j.id === s2.id),
  "tâche de revérification remise au Worker",
)
await as(null, () =>
  q("select nx_probe_report('s3cret', $1::jsonb)", [
    JSON.stringify([{ id: s2.id, ok: true, colo: "CDG" }]),
  ]),
)
await q(
  "select nx_monitor_record($1, now(), false, 0, null, 'délai dépassé')",
  [s2.id],
)
ok(
  (
    await q(
      "select count(*)::int n from monitor_incidents where monitor_id = $1",
      [s2.id],
    )
  )[0].n === 0,
  "site joignable depuis la deuxième région : pas de panne déclarée",
)
await q(
  "update monitors set regional_status = 'down', regional_at = now() where id = $1",
  [s2.id],
)
await q(
  "select nx_monitor_record($1, now(), false, 0, null, 'délai dépassé')",
  [s2.id],
)
ok(
  (
    await q(
      "select count(*)::int n from monitor_incidents where monitor_id = $1 and kind = 'down'",
      [s2.id],
    )
  )[0].n === 1,
  "panne confirmée par les deux régions",
)

console.log("\n— Repères de déploiement")
const token = (
  await as(U.pro, () => q("select nx_monitor_hook_token($1) t", [O.pro]))
)[0].t
ok(
  (await as(U.pro, () => q("select nx_monitor_hook_token($1) t", [O.pro])))[0]
    .t === token,
  "jeton stable",
)
let e3 = null
try {
  await as(U.std, () => q("select nx_monitor_hook_token($1)", [O.pro]))
} catch (e) {
  e3 = e.message
}
ok(Boolean(e3), "jeton refusé à une autre équipe")
ok(
  (
    await as(null, () =>
      q(
        "select nx_deploy_mark($1, 'Version 2.4', 'https://boutique.example/x') r",
        [token],
      ),
    )
  )[0].r.ok,
  "repère posé par l'intégration continue",
)
ok(
  (await q("select monitor_id from monitor_events"))[0].monitor_id === site.id,
  "repère rattaché au bon site",
)

console.log("\n— Conseiller de performance")
const idx = await q(
  "select indexname from pg_indexes where tablename = 'monitor_checks'",
)
ok(
  !idx.some((i) => i.indexname === "monitor_checks_monitor_at") &&
    idx.some((i) => i.indexname === "monitor_checks_monitor_idx"),
  "index en double retiré",
  idx.map((i) => i.indexname),
)
const pol = await q(
  "select qual from pg_policies where policyname = 'invoices_customer_select'",
)
ok(
  /SELECT auth\.uid\(\)/i.test(pol[0].qual),
  "politique évaluée une fois par requête",
)

console.log(`\n${count - fails}/${count} essais réussis.`)
process.exit(fails ? 1 : 0)
