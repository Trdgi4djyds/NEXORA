-- NEXORA #076 : licences, deux offres (Gratuit 0 $, Pro 18 $ par mois), essai complet le premier jour, appareils,
-- adresses IP, limites des comptes par appareil, sessions et journaux du logiciel, paiements et relances.
--   * nx_license_mine      : licence du compte (créée au besoin, offre Gratuite) : site vitrine et logiciel ;
--   * nx_license_verify    : vérification publique d'une clé (site vitrine, sans compte) ;
--   * nx_license_check     : contrôle obligatoire au démarrage du logiciel (relayé et signé par le Worker de
--                            NEXORA) : compte, clé, appareil, adresse IP, comptes par appareil, essai, session ;
--   * nx_session_ping      : signal de vie de la session et journaux envoyés par le logiciel ;
--   * nx_billing_apply     : paiement ou changement d'abonnement reçu du prestataire (Worker, secret partagé) ;
--   * nx_billing_remind    : e-mail de relance 7 jours avant le renouvellement ou la fin d'un abonnement.
-- Offre effective : l'offre payée, sinon Pro pendant l'essai d'un jour, sinon Gratuite. Le Responsive Lab et le
-- Browser Lab sont entièrement gratuits ; tout le reste est dans Pro.
-- Secret partagé avec le Worker : celui de la deuxième région (vault « nx_probe_secret », variable
-- NX_PROBE_SECRET de Cloudflare, nx_probe_secret_init() de la migration 20261105000008).
-- Idempotente. Les offres ne sont réécrites qu'au premier passage (repère app_config « offres_v2 ») : les prix
-- et textes modifiés ensuite dans le back office sont conservés.

-- ---------- 1. Deux offres ----------
do $$
declare
  v_pro jsonb;
  v_free jsonb;
begin
  if exists (select 1 from public.app_config where key = 'offres_v2') then return; end if;
  select coalesce(jsonb_object_agg(k, true), '{}'::jsonb) into v_pro
    from (select jsonb_object_keys(perms) as k from public.plans union select unnest(array['responsive', 'browser', 'multiscreen', 'dashboard',
      'design_extended', 'design_full', 'responsive_advanced', 'source_import', 'apk', 'pwa', 'play_publish', 'crawler', 'audits_advanced',
      'devlab', 'desktop_builder', 'push', 'inapp', 'alerts', 'projects_management', 'standard_support', 'studio_advanced', 'transform_extended',
      'projects_multi', 'notifications_advanced', 'messaging_events', 'automation', 'custom_notifications', 'api_sdk', 'integrations',
      'priority_support', 'early_access', 'status_page', 'synthetic', 'multi_region', 'devlab_pro'])) x;
  select jsonb_object_agg(key, false) into v_free from jsonb_each(v_pro);
  -- Produits d'appel : Responsive Lab et Browser Lab complets.
  v_free := v_free || '{"responsive": true, "browser": true, "multiscreen": true, "dashboard": true, "responsive_advanced": true, "crawler": true}'::jsonb;
  insert into public.plans (id, name, description, price_month_cents, price_year_cents, currency, sort, active, limits, features, perms, badge)
  values
    ('free', 'Gratuit', 'Le Responsive Lab et le Browser Lab, gratuits pour toujours. Tout NEXORA pendant ton premier jour.', 0, 0, 'USD', 1, true,
      '{"projects": 3, "designs": 3, "members": 1, "monitors": 1, "storage_mb": 200, "apps": 0, "app_trial_days": 0,
        "ai_requests_month": -1, "scans_per_day": 1, "crawls_per_day": -1, "builds_month": 0, "push_month": 0}'::jsonb,
      '["Responsive Lab complet : tous les modèles d’appareils, vidéo et outils de développement", "Browser Lab complet : inspection, réseau, console, tests et extraction", "Tout NEXORA gratuitement pendant ton premier jour", "NEX-DESIGN découverte (3 documents)", "1 audit de sécurité par jour, 1 site surveillé", "Assistant IA avec ta propre clé"]'::jsonb,
      v_free, ''),
    ('pro', 'Pro', 'Toutes les options de NEXORA Devs Toolbox, sans limite d’espace.', 1800, 18000, 'USD', 2, true,
      '{"projects": 200, "designs": -1, "members": 10, "monitors": 50, "storage_mb": 51200, "apps": 50, "app_trial_days": 0,
        "ai_requests_month": -1, "scans_per_day": 200, "crawls_per_day": -1, "builds_month": 400, "push_month": 100000}'::jsonb,
      '["Les 9 espaces sans restriction", "Dev Lab complet : éditeur, terminal, Git, débogueur, tests, bases de données, mise en ligne", "App Builder : APK, PWA, Play Store, notifications et messagerie (400 constructions par mois)", "Desktop Builder : logiciels Windows installables et mises à jour", "NEX-DESIGN complet : documents illimités, IA, prototype, code, équipe", "Studio 3D & Motion avancé", "Sécurité : audits avancés, 50 sites surveillés 24 h/24, page de statut", "200 projets, 10 membres, 50 Go", "Assistance prioritaire"]'::jsonb,
      v_pro, 'Toutes les options')
  on conflict (id) do update set
    name = excluded.name, description = excluded.description, price_month_cents = excluded.price_month_cents,
    price_year_cents = excluded.price_year_cents, currency = excluded.currency, sort = excluded.sort, active = true,
    limits = excluded.limits, features = excluded.features, perms = excluded.perms, badge = excluded.badge, updated_at = now();
  -- Standard, Équipe et Entreprise : retirées de la vente ; leurs abonnés passent à Pro.
  update public.plans set active = false, perms = v_pro, updated_at = now() where id in ('standard', 'team', 'enterprise');
  update public.subscriptions set plan_id = 'pro', updated_at = now() where plan_id in ('standard', 'team', 'enterprise');
  insert into public.app_config (key, value, description) values ('offres_v2', to_jsonb(now()), 'Offres Gratuit et Pro (#076) appliquées')
  on conflict (key) do nothing;
end
$$;

-- ---------- 2. Tables ----------
create table if not exists public.nx_licenses (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'revoked')),
  source text not null default 'app',
  trial_ends_at timestamptz,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  last_check_at timestamptz
);
create table if not exists public.nx_devices (
  id uuid primary key default gen_random_uuid(),
  device_hash text not null unique,
  name text not null default '',
  os text not null default '',
  app_version text not null default '',
  first_ip text,
  last_ip text,
  trial_user uuid,
  blocked boolean not null default false,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create table if not exists public.nx_device_accounts (
  device_id uuid not null references public.nx_devices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null default '',
  email_norm text not null default '',
  is_gmail boolean not null default false,
  last_ip text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (device_id, user_id)
);
create index if not exists nx_device_accounts_user on public.nx_device_accounts (user_id);
create table if not exists public.nx_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid references public.nx_devices(id) on delete set null,
  ip text,
  app_version text not null default '',
  started_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists nx_sessions_user on public.nx_sessions (user_id, started_at desc);
create index if not exists nx_sessions_device on public.nx_sessions (device_id);
create table if not exists public.nx_client_logs (
  id bigserial primary key,
  session_id uuid references public.nx_sessions(id) on delete cascade,
  user_id uuid,
  device_id uuid,
  level text not null default 'info',
  event text not null,
  detail jsonb not null default '{}'::jsonb,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists nx_client_logs_session on public.nx_client_logs (session_id, created_at);
create index if not exists nx_client_logs_user on public.nx_client_logs (user_id, created_at desc);
-- Journal des contrôles de licence (refus compris) : la « signature » côté base de chaque démarrage.
create table if not exists public.nx_license_checks (
  id bigserial primary key,
  user_id uuid,
  device_id uuid,
  ok boolean not null,
  reason text not null default '',
  plan text not null default '',
  ip text,
  app_version text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists nx_license_checks_user on public.nx_license_checks (user_id, created_at desc);
create table if not exists public.nx_billing (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'stripe',
  customer_id text,
  subscription_id text,
  status text not null default 'none',
  period text not null default 'month',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  reminded_for timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists nx_billing_customer on public.nx_billing (customer_id);
create table if not exists public.nx_payments (
  id bigserial primary key,
  provider text not null,
  event_id text not null unique,
  user_id uuid,
  kind text not null default '',
  amount_cents integer not null default 0,
  currency text not null default 'usd',
  created_at timestamptz not null default now()
);

alter table public.nx_licenses enable row level security;
alter table public.nx_devices enable row level security;
alter table public.nx_device_accounts enable row level security;
alter table public.nx_sessions enable row level security;
alter table public.nx_client_logs enable row level security;
alter table public.nx_license_checks enable row level security;
alter table public.nx_billing enable row level security;
alter table public.nx_payments enable row level security;
-- Lecture : chacun ses lignes ; les administrateurs de NEXORA tout (back office, section Licences). Aucune
-- écriture directe : tout passe par les fonctions ci-dessous.
drop policy if exists nx_licenses_read on public.nx_licenses;
create policy nx_licenses_read on public.nx_licenses for select to authenticated using (user_id = (select auth.uid()) or public.nx_is_admin());
drop policy if exists nx_licenses_admin on public.nx_licenses;
create policy nx_licenses_admin on public.nx_licenses for update to authenticated using (public.nx_is_admin()) with check (public.nx_is_admin());
drop policy if exists nx_devices_read on public.nx_devices;
create policy nx_devices_read on public.nx_devices for select to authenticated
  using (public.nx_is_admin() or exists (select 1 from public.nx_device_accounts a where a.device_id = nx_devices.id and a.user_id = (select auth.uid())));
drop policy if exists nx_devices_admin on public.nx_devices;
create policy nx_devices_admin on public.nx_devices for update to authenticated using (public.nx_is_admin()) with check (public.nx_is_admin());
drop policy if exists nx_device_accounts_read on public.nx_device_accounts;
create policy nx_device_accounts_read on public.nx_device_accounts for select to authenticated using (user_id = (select auth.uid()) or public.nx_is_admin());
drop policy if exists nx_sessions_read on public.nx_sessions;
create policy nx_sessions_read on public.nx_sessions for select to authenticated using (user_id = (select auth.uid()) or public.nx_is_admin());
drop policy if exists nx_client_logs_read on public.nx_client_logs;
create policy nx_client_logs_read on public.nx_client_logs for select to authenticated using (public.nx_is_admin());
drop policy if exists nx_license_checks_read on public.nx_license_checks;
create policy nx_license_checks_read on public.nx_license_checks for select to authenticated using (public.nx_is_admin());
drop policy if exists nx_billing_read on public.nx_billing;
create policy nx_billing_read on public.nx_billing for select to authenticated using (user_id = (select auth.uid()) or public.nx_is_admin());
drop policy if exists nx_payments_read on public.nx_payments;
create policy nx_payments_read on public.nx_payments for select to authenticated using (user_id = (select auth.uid()) or public.nx_is_admin());
revoke insert, update, delete on public.nx_licenses, public.nx_devices, public.nx_device_accounts, public.nx_sessions, public.nx_client_logs,
  public.nx_license_checks, public.nx_billing, public.nx_payments from anon, authenticated;
grant select on public.nx_licenses, public.nx_devices, public.nx_device_accounts, public.nx_sessions, public.nx_client_logs,
  public.nx_license_checks, public.nx_billing, public.nx_payments to authenticated;
grant update (status) on public.nx_licenses to authenticated;
grant update (blocked) on public.nx_devices to authenticated;

-- ---------- 3. Offre effective (essai d'un jour compris) ----------
-- Offre payée : la meilleure offre active parmi les espaces de l'utilisateur (logique du #037).
create or replace function public.nx_paid_plan(p_uid uuid)
returns table (plan_id text, org_id uuid)
language sql stable security definer set search_path = public
as $$
  select x.plan_id, x.org_id from (
    select public.nx_org_plan(m.org_id) as plan_id, m.org_id, o.personal
    from public.organization_members m join public.organizations o on o.id = m.org_id
    where m.user_id = p_uid
  ) x
  order by public.nx_plan_rank(x.plan_id) desc, x.personal desc, x.org_id
  limit 1;
$$;
-- Offre effective : Pro pendant l'essai d'un jour, si l'offre payée est moins bonne.
create or replace function public.nx_user_plan(p_uid uuid)
returns table (plan_id text, org_id uuid)
language sql stable security definer set search_path = public
as $$
  select x.plan_id, x.org_id from (
    select p.plan_id, p.org_id, 0 as trial from public.nx_paid_plan(p_uid) p
    union all
    select 'pro', (select p.org_id from public.nx_paid_plan(p_uid) p), 1
    from public.nx_licenses l where l.user_id = p_uid and l.status = 'active' and l.trial_ends_at > now()
  ) x
  order by public.nx_plan_rank(x.plan_id) desc, x.trial
  limit 1;
$$;

-- ---------- 4. Outils ----------
-- Adresse Gmail ramenée à sa forme réelle (points et « +étiquette » ignorés, googlemail.com = gmail.com).
create or replace function public.nx_email_norm(p_email text)
returns text
language sql immutable
as $$
  select case when split_part(lower(trim(p_email)), '@', 2) in ('gmail.com', 'googlemail.com')
    then replace(split_part(split_part(lower(trim(p_email)), '@', 1), '+', 1), '.', '') || '@gmail.com'
    else lower(trim(p_email)) end;
$$;
create or replace function public.nx_is_gmail(p_email text)
returns boolean
language sql immutable
as $$ select split_part(lower(trim(p_email)), '@', 2) in ('gmail.com', 'googlemail.com'); $$;
-- Clé lisible : NXDT-XXXX-XXXX-XXXX-XXXX (sans 0, O, 1, I, L).
create or replace function public.nx_license_new_key()
returns text
language plpgsql volatile
as $$
declare
  a constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  h text := md5(gen_random_uuid()::text || clock_timestamp()::text) || md5(gen_random_uuid()::text);
  k text := 'NXDT';
  i integer;
begin
  for i in 0..15 loop
    if i % 4 = 0 then k := k || '-'; end if;
    k := k || substr(a, (('x' || substr(h, i * 2 + 1, 2))::bit(8)::integer % length(a)) + 1, 1);
  end loop;
  return k;
end
$$;
-- Adresse IP de la requête : celle transmise par le Worker (secret vérifié), sinon les en-têtes du serveur.
create or replace function public.nx_worker_secret_ok(p_secret text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
begin
  if coalesce(p_secret, '') = '' or to_regclass('vault.decrypted_secrets') is null then return false; end if;
  return exists (select 1 from vault.decrypted_secrets where name = 'nx_probe_secret' and decrypted_secret = p_secret);
end
$$;
create or replace function public.nx_request_ip(p_secret text default null, p_ip text default null)
returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  h jsonb;
begin
  if coalesce(p_ip, '') <> '' and public.nx_worker_secret_ok(p_secret) then return left(p_ip, 64); end if;
  begin h := nullif(current_setting('request.headers', true), '')::jsonb; exception when others then h := null; end;
  if h is null then return null; end if;
  return left(coalesce(nullif(h ->> 'cf-connecting-ip', ''), nullif(trim(split_part(h ->> 'x-forwarded-for', ',', 1)), ''), nullif(h ->> 'x-real-ip', '')), 64);
end
$$;

-- ---------- 5. Licences ----------
create or replace function public.nx_license_get(p_uid uuid, p_source text default 'app')
returns public.nx_licenses
language plpgsql security definer set search_path = public
as $$
declare
  l public.nx_licenses;
  i integer;
begin
  select * into l from public.nx_licenses where user_id = p_uid;
  if found then return l; end if;
  for i in 1..5 loop
    begin
      insert into public.nx_licenses (key, user_id, source) values (public.nx_license_new_key(), p_uid, left(coalesce(p_source, 'app'), 20)) returning * into l;
      return l;
    exception when unique_violation then
      select * into l from public.nx_licenses where user_id = p_uid;
      if found then return l; end if;
    end;
  end loop;
  raise exception 'La clé de licence n’a pas pu être créée. Réessaie dans un instant.';
end
$$;

-- Licence du compte connecté (créée au besoin) : site vitrine (« Ma licence ») et logiciel.
create or replace function public.nx_license_mine(p_source text default 'site')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  l public.nx_licenses;
  v_plan text;
  v_paid text;
  b public.nx_billing;
begin
  if v_uid is null then raise exception 'Connexion requise.'; end if;
  l := public.nx_license_get(v_uid, p_source);
  select u.plan_id into v_plan from public.nx_user_plan(v_uid) u;
  select p.plan_id into v_paid from public.nx_paid_plan(v_uid) p;
  select * into b from public.nx_billing where user_id = v_uid;
  return jsonb_build_object(
    'key', l.key, 'status', l.status, 'created_at', l.created_at, 'activated_at', l.activated_at,
    'plan', coalesce(v_plan, 'free'), 'plan_name', public.nx_plan_label(coalesce(v_plan, 'free')),
    'paid_plan', coalesce(v_paid, 'free'), 'trial_ends_at', l.trial_ends_at, 'trial', coalesce(l.trial_ends_at > now(), false) and coalesce(v_paid, 'free') = 'free',
    'billing', case when b.user_id is null then null else jsonb_build_object('status', b.status, 'period', b.period, 'current_period_end', b.current_period_end, 'cancel_at_period_end', b.cancel_at_period_end, 'provider', b.provider) end,
    'devices', coalesce((select jsonb_agg(jsonb_build_object('name', d.name, 'os', d.os, 'app_version', d.app_version, 'last_seen', a.last_seen, 'last_ip', a.last_ip) order by a.last_seen desc)
      from public.nx_device_accounts a join public.nx_devices d on d.id = a.device_id where a.user_id = v_uid), '[]'::jsonb),
    'server_time', now());
end
$$;

-- Vérification publique d'une clé (site vitrine, sans compte) : jamais l'adresse complète du titulaire.
create or replace function public.nx_license_verify(p_key text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  l public.nx_licenses;
  v_email text;
  v_plan text;
begin
  select * into l from public.nx_licenses where key = upper(trim(coalesce(p_key, '')));
  if not found then return jsonb_build_object('valid', false, 'reason', 'unknown'); end if;
  select email into v_email from auth.users where id = l.user_id;
  select u.plan_id into v_plan from public.nx_user_plan(l.user_id) u;
  return jsonb_build_object('valid', l.status = 'active', 'status', l.status, 'plan', coalesce(v_plan, 'free'),
    'plan_name', public.nx_plan_label(coalesce(v_plan, 'free')), 'created_at', l.created_at, 'activated', l.activated_at is not null,
    'holder', case when v_email is null then '' else left(split_part(v_email, '@', 1), 2) || '•••@' || split_part(v_email, '@', 2) end);
end
$$;

-- Contrôle obligatoire du logiciel. Réponse relayée et signée par le Worker (le logiciel refuse toute réponse
-- non signée). p_device : empreinte de l'appareil (calculée par le logiciel), jamais l'identifiant brut.
-- #077 : version à 9 paramètres (intégrité) retirée ici et recréée par 20261108000003 (une seule version à la fois).
drop function if exists public.nx_license_check(text, text, text, text, text, text, text, text, jsonb);
create or replace function public.nx_license_check(p_device text, p_key text default null, p_version text default '', p_os text default '',
  p_name text default '', p_nonce text default '', p_secret text default null, p_ip text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := public.nx_is_admin();
  v_email text;
  v_norm text;
  v_gmail boolean;
  v_ip text := public.nx_request_ip(p_secret, p_ip);
  l public.nx_licenses;
  d public.nx_devices;
  v_paid text;
  v_plan text;
  v_linked boolean;
  v_accounts integer;
  v_gmails integer;
  v_session uuid;
  v_trial_refused boolean := false;
  v_row public.plans;
  v_reason text;
  v_msg text;
begin
  if v_uid is null then
    insert into public.nx_license_checks (ok, reason, ip, app_version) values (false, 'auth', v_ip, left(coalesce(p_version, ''), 40));
    return jsonb_build_object('ok', false, 'reason', 'auth', 'message', 'Connecte-toi à ton compte NEXORA pour ouvrir le logiciel.', 'nonce', p_nonce, 'server_time', now());
  end if;
  if coalesce(length(p_device), 0) < 16 then raise exception 'Appareil non reconnu.'; end if;
  select email into v_email from auth.users where id = v_uid;
  v_email := coalesce(v_email, '');
  v_norm := public.nx_email_norm(v_email);
  v_gmail := public.nx_is_gmail(v_email);
  l := public.nx_license_get(v_uid, 'app');

  insert into public.nx_devices (device_hash, name, os, app_version, first_ip, last_ip)
  values (left(p_device, 128), left(coalesce(p_name, ''), 80), left(coalesce(p_os, ''), 80), left(coalesce(p_version, ''), 40), v_ip, v_ip)
  on conflict (device_hash) do update set name = coalesce(nullif(excluded.name, ''), nx_devices.name), os = coalesce(nullif(excluded.os, ''), nx_devices.os),
    app_version = coalesce(nullif(excluded.app_version, ''), nx_devices.app_version), last_ip = coalesce(excluded.last_ip, nx_devices.last_ip), last_seen = now()
  returning * into d;

  select p.plan_id into v_paid from public.nx_paid_plan(v_uid) p;
  v_paid := coalesce(v_paid, 'free');
  v_linked := exists (select 1 from public.nx_device_accounts where device_id = d.id and user_id = v_uid);

  if p_key is not null and trim(p_key) <> '' and upper(trim(p_key)) <> l.key then
    v_reason := 'key_mismatch'; v_msg := 'Cette clé de licence n’appartient pas à ce compte. Connecte-toi avec le compte de la licence, ou retrouve ta clé sur le site de NEXORA (Ma licence).';
  elsif l.status <> 'active' then
    v_reason := 'revoked'; v_msg := 'Cette licence a été désactivée. Contacte l’assistance de NEXORA.';
  elsif d.blocked and not v_admin then
    v_reason := 'device_blocked'; v_msg := 'Cet ordinateur n’est plus autorisé à utiliser NEXORA. Contacte l’assistance.';
  elsif not v_linked and v_paid = 'free' and not v_admin then
    select count(*) into v_accounts from public.nx_device_accounts where device_id = d.id;
    select count(distinct email_norm) into v_gmails from public.nx_device_accounts where device_id = d.id and is_gmail and email_norm <> v_norm;
    if v_accounts >= 3 then
      v_reason := 'device_accounts'; v_msg := 'Cet ordinateur est déjà utilisé avec 3 comptes NEXORA gratuits. Reconnecte-toi avec l’un d’eux, ou passe à Pro.';
    elsif v_gmail and v_gmails >= 3 then
      v_reason := 'device_gmail'; v_msg := 'Cet ordinateur est déjà utilisé avec 3 adresses Gmail en offre Gratuite. Reconnecte-toi avec l’une d’elles, ou passe à Pro.';
    end if;
  end if;

  if v_reason is not null then
    insert into public.nx_license_checks (user_id, device_id, ok, reason, plan, ip, app_version) values (v_uid, d.id, false, v_reason, v_paid, v_ip, left(coalesce(p_version, ''), 40));
    return jsonb_build_object('ok', false, 'reason', v_reason, 'message', v_msg, 'license_key', l.key, 'email', v_email, 'nonce', p_nonce, 'device', p_device, 'server_time', now());
  end if;

  insert into public.nx_device_accounts (device_id, user_id, email, email_norm, is_gmail, last_ip)
  values (d.id, v_uid, v_email, v_norm, v_gmail, v_ip)
  on conflict (device_id, user_id) do update set email = excluded.email, email_norm = excluded.email_norm, is_gmail = excluded.is_gmail,
    last_ip = coalesce(excluded.last_ip, nx_device_accounts.last_ip), last_seen = now();

  -- Essai complet d'un jour : une fois par compte et une fois par appareil.
  if l.trial_ends_at is null then
    if d.trial_user is null or d.trial_user = v_uid then
      update public.nx_licenses set trial_ends_at = now() + interval '1 day' where id = l.id returning * into l;
      update public.nx_devices set trial_user = v_uid where id = d.id;
    else
      update public.nx_licenses set trial_ends_at = now() where id = l.id returning * into l;
      v_trial_refused := true;
    end if;
  end if;
  update public.nx_licenses set activated_at = coalesce(activated_at, now()), last_check_at = now() where id = l.id returning * into l;

  select u.plan_id into v_plan from public.nx_user_plan(v_uid) u;
  v_plan := coalesce(v_plan, 'free');
  select * into v_row from public.plans where id = v_plan;
  insert into public.nx_sessions (user_id, device_id, ip, app_version) values (v_uid, d.id, v_ip, left(coalesce(p_version, ''), 40)) returning id into v_session;
  insert into public.nx_license_checks (user_id, device_id, ok, reason, plan, ip, app_version) values (v_uid, d.id, true, '', v_plan, v_ip, left(coalesce(p_version, ''), 40));
  update public.profiles set last_seen_at = now() where id = v_uid;

  return jsonb_build_object(
    'ok', true, 'user', v_uid, 'email', v_email, 'admin', v_admin, 'license_key', l.key,
    'plan', v_plan, 'plan_name', coalesce(v_row.name, v_plan), 'paid_plan', v_paid,
    'trial', v_paid = 'free' and coalesce(l.trial_ends_at > now(), false), 'trial_ends_at', l.trial_ends_at, 'trial_refused', v_trial_refused,
    'perms', coalesce(v_row.perms, '{}'::jsonb), 'limits', coalesce(v_row.limits, '{}'::jsonb),
    'device', p_device, 'device_id', d.id, 'session_id', v_session, 'ip', v_ip,
    'accounts_on_device', (select count(*) from public.nx_device_accounts where device_id = d.id),
    'nonce', p_nonce, 'server_time', now());
end
$$;

-- Signal de vie de la session (toutes les 5 minutes) et journaux du logiciel (50 au plus par envoi).
create or replace function public.nx_session_ping(p_session uuid, p_events jsonb default '[]'::jsonb, p_end boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  s public.nx_sessions;
  e jsonb;
  v_plan text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'auth'); end if;
  update public.nx_sessions set last_seen = now(), ended_at = case when p_end then now() else ended_at end
  where id = p_session and user_id = v_uid returning * into s;
  if not found then return jsonb_build_object('ok', false, 'reason', 'session'); end if;
  if jsonb_typeof(p_events) = 'array' then
    for e in select * from jsonb_array_elements(p_events) limit 50 loop
      insert into public.nx_client_logs (session_id, user_id, device_id, level, event, detail, ip, created_at)
      values (s.id, v_uid, s.device_id, left(coalesce(e ->> 'level', 'info'), 10), left(coalesce(e ->> 'event', 'event'), 80),
        coalesce(case when jsonb_typeof(e -> 'detail') = 'object' then e -> 'detail' end, '{}'::jsonb), s.ip, now());
    end loop;
  end if;
  select u.plan_id into v_plan from public.nx_user_plan(v_uid) u;
  return jsonb_build_object('ok', true, 'plan', coalesce(v_plan, 'free'), 'revoked', exists (select 1 from public.nx_licenses where user_id = v_uid and status <> 'active'),
    'blocked', exists (select 1 from public.nx_devices where id = s.device_id and blocked), 'server_time', now());
end
$$;

-- ---------- 6. Paiements ----------
-- Appelée par le Worker après vérification de la signature du prestataire. p_user : identifiant NEXORA transmis
-- au paiement (client_reference_id) ; sinon retrouvé par le client du prestataire.
create or replace function public.nx_billing_apply(p_secret text, p_provider text, p_event_id text, p_user uuid, p_status text,
  p_period text default 'month', p_period_end timestamptz default null, p_customer text default null, p_subscription text default null,
  p_amount integer default 0, p_currency text default 'usd', p_kind text default '', p_cancel_at_end boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := p_user;
  v_org uuid;
  v_active boolean := p_status in ('active', 'trialing', 'past_due', 'paid');
begin
  if not public.nx_worker_secret_ok(p_secret) then raise exception 'Accès refusé.'; end if;
  if exists (select 1 from public.nx_payments where event_id = p_event_id) then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  if v_uid is null and p_customer is not null then select user_id into v_uid from public.nx_billing where customer_id = p_customer; end if;
  if v_uid is null and p_subscription is not null then select user_id into v_uid from public.nx_billing where subscription_id = p_subscription; end if;
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'user'); end if;
  insert into public.nx_payments (provider, event_id, user_id, kind, amount_cents, currency)
  values (left(p_provider, 20), left(p_event_id, 120), v_uid, left(coalesce(p_kind, ''), 60), coalesce(p_amount, 0), left(coalesce(p_currency, 'usd'), 8));
  insert into public.nx_billing (user_id, provider, customer_id, subscription_id, status, period, current_period_end, cancel_at_period_end, updated_at)
  values (v_uid, left(p_provider, 20), p_customer, p_subscription, left(p_status, 20), case when p_period = 'year' then 'year' else 'month' end, p_period_end, coalesce(p_cancel_at_end, false), now())
  on conflict (user_id) do update set provider = excluded.provider, customer_id = coalesce(excluded.customer_id, nx_billing.customer_id),
    subscription_id = coalesce(excluded.subscription_id, nx_billing.subscription_id), status = excluded.status,
    period = case when p_period in ('month', 'year') then excluded.period else nx_billing.period end,
    current_period_end = coalesce(excluded.current_period_end, nx_billing.current_period_end), cancel_at_period_end = excluded.cancel_at_period_end, updated_at = now();
  -- Abonnement de l'espace personnel : l'offre Pro suit l'état du paiement.
  select o.id into v_org from public.organizations o where o.owner_id = v_uid and o.personal order by o.created_at limit 1;
  if v_org is null then
    select m.org_id into v_org from public.organization_members m where m.user_id = v_uid and m.role = 'owner' order by m.created_at limit 1;
  end if;
  if v_org is not null then
    if exists (select 1 from public.subscriptions where org_id = v_org) then
      update public.subscriptions set plan_id = case when v_active then 'pro' else 'free' end, status = case when v_active then 'active' else 'canceled' end,
        provider = left(p_provider, 20), provider_ref = coalesce(p_subscription, provider_ref), current_period_end = coalesce(p_period_end, current_period_end), updated_at = now()
      where org_id = v_org;
    else
      insert into public.subscriptions (org_id, plan_id, status, provider, provider_ref, current_period_end)
      values (v_org, case when v_active then 'pro' else 'free' end, case when v_active then 'active' else 'canceled' end, left(p_provider, 20), p_subscription, p_period_end);
    end if;
  end if;
  return jsonb_build_object('ok', true, 'user', v_uid, 'org', v_org, 'active', v_active);
end
$$;

-- Relance par e-mail 7 jours avant le renouvellement (ou la fin, si l'abonnement est résilié). Une seule fois
-- par échéance ; tâche quotidienne.
create or replace function public.nx_billing_remind()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  b record;
  n integer := 0;
  v_date text;
begin
  if to_regprocedure('public.nx_brevo_send(text, text, text, text, text)') is null then return 0; end if;
  for b in
    select x.*, u.email, coalesce(p.full_name, '') as full_name from public.nx_billing x
    join auth.users u on u.id = x.user_id left join public.profiles p on p.id = x.user_id
    where x.status in ('active', 'trialing', 'past_due') and x.current_period_end between now() + interval '6 days' and now() + interval '7 days'
      and x.reminded_for is distinct from x.current_period_end and coalesce(u.email, '') <> ''
    limit 200
  loop
    v_date := to_char(b.current_period_end, 'DD/MM/YYYY');
    if b.cancel_at_period_end then
      perform public.nx_brevo_send(b.email, b.full_name, 'Ton abonnement NEXORA Pro se termine dans 7 jours',
        'Bonjour' || case when b.full_name <> '' then ' ' || b.full_name else '' end || E',\n\nTon abonnement NEXORA Pro prend fin le ' || v_date || E'. Ensuite, ton compte repassera en offre Gratuite (Responsive Lab et Browser Lab).\n\nPour le garder, réactive-le depuis le site de NEXORA, page « Ma licence ».\n\nL’équipe NEXORA', 'Abonnement');
    else
      perform public.nx_brevo_send(b.email, b.full_name, 'Ton abonnement NEXORA Pro se renouvelle dans 7 jours',
        'Bonjour' || case when b.full_name <> '' then ' ' || b.full_name else '' end || E',\n\nTon abonnement NEXORA Pro sera renouvelé automatiquement le ' || v_date || ' (' || case when b.period = 'year' then '180 $ pour un an' else '18 $ pour un mois' end || E').\n\nRien à faire de ton côté. Pour changer de moyen de paiement ou résilier, ouvre le site de NEXORA, page « Ma licence ».\n\nL’équipe NEXORA', 'Abonnement');
    end if;
    update public.nx_billing set reminded_for = b.current_period_end where user_id = b.user_id;
    n := n + 1;
  end loop;
  return n;
end
$$;

-- Nettoyage : journaux de plus de 90 jours, sessions et contrôles de plus d'un an.
create or replace function public.nx_license_cleanup()
returns void
language sql security definer set search_path = public
as $$
  delete from public.nx_client_logs where created_at < now() - interval '90 days';
  delete from public.nx_license_checks where created_at < now() - interval '365 days';
  delete from public.nx_sessions where started_at < now() - interval '365 days';
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where command ilike '%nx_billing_remind%') then
      perform cron.schedule('nexora-billing-remind', '0 9 * * *', 'select public.nx_billing_remind()');
    end if;
    if not exists (select 1 from cron.job where command ilike '%nx_license_cleanup%') then
      perform cron.schedule('nexora-license-cleanup', '15 4 * * *', 'select public.nx_license_cleanup()');
    end if;
  end if;
end
$$;

-- ---------- 7. Droits ----------
revoke all on function public.nx_paid_plan(uuid), public.nx_license_new_key(), public.nx_worker_secret_ok(text), public.nx_request_ip(text, text),
  public.nx_license_get(uuid, text), public.nx_license_mine(text), public.nx_license_verify(text),
  public.nx_license_check(text, text, text, text, text, text, text, text), public.nx_session_ping(uuid, jsonb, boolean),
  public.nx_billing_apply(text, text, text, uuid, text, text, timestamptz, text, text, integer, text, text, boolean),
  public.nx_billing_remind(), public.nx_license_cleanup() from public, anon, authenticated;
grant execute on function public.nx_license_mine(text), public.nx_license_check(text, text, text, text, text, text, text, text),
  public.nx_session_ping(uuid, jsonb, boolean) to authenticated;
grant execute on function public.nx_license_verify(text) to anon, authenticated;
-- Le Worker appelle nx_billing_apply avec la clé publique et le secret partagé (vérifié dans la fonction).
grant execute on function public.nx_billing_apply(text, text, text, uuid, text, text, timestamptz, text, text, integer, text, text, boolean) to anon, authenticated;
grant execute on function public.nx_email_norm(text), public.nx_is_gmail(text) to anon, authenticated;
