-- NEXORA #077 : contrôle de sécurité au démarrage et licences configurées par l'administration. Après
-- 20261108000002_licences_offres.sql. Idempotente.
--   * Politiques réglables depuis le back office (app_config) :
--       license_policy : comptes gratuits et adresses Gmail par ordinateur, durée de l'essai, appareils par licence
--                        (Gratuit, Pro), intervalle des contrôles du logiciel ;
--       release_policy : version minimale autorisée, numéro de manifeste minimal, refus des versions obsolètes.
--   * Licences attribuées : offre imposée (Gratuit ou Pro) avec ou sans date de fin, appareils maximum, note,
--     nouvelle clé, appareil retiré ; nx_admin_* réservées aux administrateurs (vérifié dans chaque fonction).
--   * nx_license_check reçoit le résultat du contrôle d'intégrité du logiciel (p_integrity) : une installation
--     modifiée est refusée et consignée ; une version ou un manifeste trop ancien est refusé (« outdated »).
--   * nx_security_report : anomalies relevées par le lanceur avant le démarrage de NEXORA (secret du Worker).
--   * nx_license_device_release : l'utilisateur libère un de ses ordinateurs (limite d'appareils de la licence) ;
--     la ligne reste comptée pour la limite des comptes gratuits par ordinateur (pas de contournement).

-- ---------- 1. Colonnes ----------
alter table public.nx_licenses add column if not exists plan_override text;
alter table public.nx_licenses add column if not exists override_until timestamptz;
alter table public.nx_licenses add column if not exists max_devices integer;
alter table public.nx_licenses add column if not exists note text not null default '';
alter table public.nx_licenses add column if not exists granted_by uuid;
alter table public.nx_licenses add column if not exists granted_at timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nx_licenses_plan_override_check') then
    alter table public.nx_licenses add constraint nx_licenses_plan_override_check check (plan_override is null or plan_override in ('free', 'pro'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nx_licenses_max_devices_check') then
    alter table public.nx_licenses add constraint nx_licenses_max_devices_check check (max_devices is null or max_devices between 1 and 100);
  end if;
end
$$;
alter table public.nx_device_accounts add column if not exists released boolean not null default false;
alter table public.nx_license_checks add column if not exists detail jsonb not null default '{}'::jsonb;
alter table public.nx_license_checks add column if not exists source text not null default 'app';

-- ---------- 2. Politiques ----------
insert into public.app_config (key, value, description) values
  ('license_policy', '{"free_accounts_per_device": 3, "gmail_per_device": 3, "trial_hours": 24, "free_devices": 3, "pro_devices": 5, "check_minutes": 10}'::jsonb,
   'Licences de NEXORA Devs Toolbox (#077) : comptes gratuits et adresses Gmail par ordinateur, durée de l’essai complet (heures), ordinateurs par licence (Gratuit, Pro), intervalle des contrôles (minutes).'),
  ('release_policy', '{"min_version": "1.2.0", "min_manifest_version": 0, "block_outdated": true, "channel": "stable"}'::jsonb,
   'Versions autorisées de NEXORA (#077) : version minimale, numéro de manifeste minimal (refus des retours en arrière), refus des versions obsolètes.')
on conflict (key) do nothing;

create or replace function public.nx_policy(p_key text)
returns jsonb
language sql stable security definer set search_path = public
as $$ select coalesce((select value from public.app_config where key = p_key), '{}'::jsonb); $$;

-- Entier d'une politique, borné, avec valeur par défaut si absent ou illisible.
create or replace function public.nx_policy_int(p jsonb, p_name text, p_default integer, p_min integer default 0, p_max integer default 100000)
returns integer
language sql immutable
as $$
  select least(p_max, greatest(p_min, case when coalesce(p ->> p_name, '') ~ '^\d{1,9}$' then (p ->> p_name)::integer else p_default end));
$$;

-- Version « 1.10.2-beta » → {1,10,2} (comparaison numérique ; une version illisible vaut {0}).
create or replace function public.nx_version_num(p_version text)
returns integer[]
language sql immutable
as $$
  select coalesce(nullif(string_to_array(substring(coalesce(p_version, '') from '^v?(\d+(?:\.\d+){0,3})'), '.'), '{}'::text[])::integer[], array[0]);
$$;

create or replace function public.nx_release_policy()
returns jsonb
language sql stable security definer set search_path = public
as $$ select public.nx_policy('release_policy'); $$;

-- ---------- 3. Offre effective : offre attribuée par l'administration d'abord ----------
create or replace function public.nx_granted_plan(p_uid uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select l.plan_override from public.nx_licenses l
  where l.user_id = p_uid and l.status = 'active' and l.plan_override is not null and (l.override_until is null or l.override_until > now());
$$;

create or replace function public.nx_user_plan(p_uid uuid)
returns table (plan_id text, org_id uuid)
language sql stable security definer set search_path = public
as $$
  select x.plan_id, x.org_id from (
    select public.nx_granted_plan(p_uid) as plan_id, (select p.org_id from public.nx_paid_plan(p_uid) p) as org_id, 0 as prio
    where public.nx_granted_plan(p_uid) is not null
    union all
    select p.plan_id, p.org_id, 1 from public.nx_paid_plan(p_uid) p
    union all
    select 'pro', (select p.org_id from public.nx_paid_plan(p_uid) p), 2
    from public.nx_licenses l where l.user_id = p_uid and l.status = 'active' and l.trial_ends_at > now()
  ) x
  order by (x.prio = 0) desc, public.nx_plan_rank(x.plan_id) desc, x.prio
  limit 1;
$$;

-- Offre « payée » au sens des limites (comptes par ordinateur) : l'offre attribuée compte comme payée.
create or replace function public.nx_paid_or_granted(p_uid uuid)
returns text
language sql stable security definer set search_path = public
as $$ select coalesce(public.nx_granted_plan(p_uid), (select p.plan_id from public.nx_paid_plan(p_uid) p), 'free'); $$;

-- ---------- 4. Contrôle obligatoire du logiciel ----------
drop function if exists public.nx_license_check(text, text, text, text, text, text, text, text);
create or replace function public.nx_license_check(p_device text, p_key text default null, p_version text default '', p_os text default '',
  p_name text default '', p_nonce text default '', p_secret text default null, p_ip text default null, p_integrity jsonb default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := public.nx_is_admin();
  v_pol jsonb := public.nx_policy('license_policy');
  v_rel jsonb := public.nx_policy('release_policy');
  v_email text;
  v_norm text;
  v_gmail boolean;
  v_ip text := public.nx_request_ip(p_secret, p_ip);
  v_ver text := left(coalesce(p_version, ''), 40);
  l public.nx_licenses;
  d public.nx_devices;
  v_paid text;
  v_plan text;
  v_link public.nx_device_accounts;
  v_accounts integer;
  v_gmails integer;
  v_devices integer;
  v_max_devices integer;
  v_session uuid;
  v_trial_refused boolean := false;
  v_row public.plans;
  v_reason text;
  v_msg text;
  v_detail jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    insert into public.nx_license_checks (ok, reason, ip, app_version) values (false, 'auth', v_ip, v_ver);
    return jsonb_build_object('ok', false, 'reason', 'auth', 'message', 'Connecte-toi à ton compte NEXORA pour ouvrir le logiciel.', 'nonce', p_nonce, 'server_time', now());
  end if;
  if coalesce(length(p_device), 0) < 16 then raise exception 'Appareil non reconnu.'; end if;
  select email into v_email from auth.users where id = v_uid;
  v_email := coalesce(v_email, '');
  v_norm := public.nx_email_norm(v_email);
  v_gmail := public.nx_is_gmail(v_email);
  l := public.nx_license_get(v_uid, 'app');

  insert into public.nx_devices (device_hash, name, os, app_version, first_ip, last_ip)
  values (left(p_device, 128), left(coalesce(p_name, ''), 80), left(coalesce(p_os, ''), 80), v_ver, v_ip, v_ip)
  on conflict (device_hash) do update set name = coalesce(nullif(excluded.name, ''), nx_devices.name), os = coalesce(nullif(excluded.os, ''), nx_devices.os),
    app_version = coalesce(nullif(excluded.app_version, ''), nx_devices.app_version), last_ip = coalesce(excluded.last_ip, nx_devices.last_ip), last_seen = now()
  returning * into d;

  v_paid := public.nx_paid_or_granted(v_uid);
  select * into v_link from public.nx_device_accounts where device_id = d.id and user_id = v_uid;

  -- Intégrité et version : vérifiées avant tout le reste (installation modifiée, version non autorisée).
  if p_integrity is not null and jsonb_typeof(p_integrity) = 'object' and coalesce((p_integrity ->> 'ok')::boolean, true) = false then
    v_reason := 'integrity';
    v_msg := 'Échec du contrôle d’intégrité — Installation non authentifiée. Ouvre NEXORA Devs Toolbox pour la réparer.';
    v_detail := jsonb_build_object('file', left(coalesce(p_integrity ->> 'file', ''), 200), 'kind', left(coalesce(p_integrity ->> 'reason', ''), 60));
  elsif coalesce((v_rel ->> 'block_outdated')::boolean, true)
    and (public.nx_version_num(v_ver) < public.nx_version_num(coalesce(v_rel ->> 'min_version', '0'))
      or coalesce(case when coalesce(p_integrity ->> 'manifest_version', '') ~ '^\d{1,15}$' then (p_integrity ->> 'manifest_version')::bigint end, 0)
         < coalesce(case when coalesce(v_rel ->> 'min_manifest_version', '') ~ '^\d{1,15}$' then (v_rel ->> 'min_manifest_version')::bigint end, 0)) then
    v_reason := 'outdated';
    v_msg := 'Cette version de NEXORA n’est plus autorisée. NEXORA Devs Toolbox installe la version à jour.';
    v_detail := jsonb_build_object('min_version', v_rel ->> 'min_version', 'version', v_ver);
  elsif p_key is not null and trim(p_key) <> '' and upper(trim(p_key)) <> l.key then
    v_reason := 'key_mismatch'; v_msg := 'Cette clé de licence n’appartient pas à ce compte. Connecte-toi avec le compte de la licence, ou retrouve ta clé sur le site de NEXORA (Ma licence).';
  elsif l.status <> 'active' then
    v_reason := 'revoked'; v_msg := 'Cette licence a été désactivée. Contacte l’assistance de NEXORA.';
  elsif d.blocked and not v_admin then
    v_reason := 'device_blocked'; v_msg := 'Cet ordinateur n’est plus autorisé à utiliser NEXORA. Contacte l’assistance.';
  elsif v_link.user_id is null and v_paid = 'free' and not v_admin then
    select count(*) into v_accounts from public.nx_device_accounts where device_id = d.id;
    select count(distinct email_norm) into v_gmails from public.nx_device_accounts where device_id = d.id and is_gmail and email_norm <> v_norm;
    if v_accounts >= public.nx_policy_int(v_pol, 'free_accounts_per_device', 3, 1, 50) then
      v_reason := 'device_accounts'; v_msg := 'Cet ordinateur a atteint le nombre de comptes NEXORA gratuits autorisés. Reconnecte-toi avec l’un d’eux, ou passe à Pro.';
    elsif v_gmail and v_gmails >= public.nx_policy_int(v_pol, 'gmail_per_device', 3, 1, 50) then
      v_reason := 'device_gmail'; v_msg := 'Cet ordinateur a atteint le nombre d’adresses Gmail autorisées en offre Gratuite. Reconnecte-toi avec l’une d’elles, ou passe à Pro.';
    end if;
  end if;
  -- Ordinateurs par licence (un ordinateur libéré depuis « Ma licence » ne compte plus).
  if v_reason is null and not v_admin and (v_link.user_id is null or v_link.released) then
    v_max_devices := coalesce(l.max_devices, case when v_paid = 'free' then public.nx_policy_int(v_pol, 'free_devices', 3, 1, 100) else public.nx_policy_int(v_pol, 'pro_devices', 5, 1, 100) end);
    select count(*) into v_devices from public.nx_device_accounts where user_id = v_uid and not released and device_id <> d.id;
    if v_devices >= v_max_devices then
      v_reason := 'device_limit';
      v_msg := 'Ta licence est déjà utilisée sur ' || v_devices || ' ordinateur' || case when v_devices > 1 then 's' else '' end || '. Libère un ordinateur depuis le site de NEXORA (Ma licence), puis réessaie.';
    end if;
  end if;

  if v_reason is not null then
    insert into public.nx_license_checks (user_id, device_id, ok, reason, plan, ip, app_version, detail) values (v_uid, d.id, false, v_reason, v_paid, v_ip, v_ver, v_detail);
    return jsonb_build_object('ok', false, 'reason', v_reason, 'message', v_msg, 'license_key', l.key, 'email', v_email, 'nonce', p_nonce, 'device', p_device,
      'release', v_rel, 'server_time', now());
  end if;

  insert into public.nx_device_accounts (device_id, user_id, email, email_norm, is_gmail, last_ip)
  values (d.id, v_uid, v_email, v_norm, v_gmail, v_ip)
  on conflict (device_id, user_id) do update set email = excluded.email, email_norm = excluded.email_norm, is_gmail = excluded.is_gmail,
    last_ip = coalesce(excluded.last_ip, nx_device_accounts.last_ip), last_seen = now(), released = false;

  -- Essai complet (durée réglable) : une fois par compte et une fois par ordinateur.
  if l.trial_ends_at is null then
    if d.trial_user is null or d.trial_user = v_uid then
      update public.nx_licenses set trial_ends_at = now() + make_interval(hours => public.nx_policy_int(v_pol, 'trial_hours', 24, 0, 2160)) where id = l.id returning * into l;
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
  insert into public.nx_sessions (user_id, device_id, ip, app_version) values (v_uid, d.id, v_ip, v_ver) returning id into v_session;
  insert into public.nx_license_checks (user_id, device_id, ok, reason, plan, ip, app_version) values (v_uid, d.id, true, '', v_plan, v_ip, v_ver);
  update public.profiles set last_seen_at = now() where id = v_uid;

  return jsonb_build_object(
    'ok', true, 'user', v_uid, 'email', v_email, 'admin', v_admin, 'license_key', l.key,
    'plan', v_plan, 'plan_name', coalesce(v_row.name, v_plan), 'paid_plan', v_paid,
    'granted', public.nx_granted_plan(v_uid) is not null, 'granted_until', case when public.nx_granted_plan(v_uid) is not null then l.override_until end,
    'trial', v_paid = 'free' and coalesce(l.trial_ends_at > now(), false), 'trial_ends_at', l.trial_ends_at, 'trial_refused', v_trial_refused,
    'perms', coalesce(v_row.perms, '{}'::jsonb), 'limits', coalesce(v_row.limits, '{}'::jsonb),
    'device', p_device, 'device_id', d.id, 'session_id', v_session, 'ip', v_ip,
    'accounts_on_device', (select count(*) from public.nx_device_accounts where device_id = d.id),
    'check_minutes', public.nx_policy_int(v_pol, 'check_minutes', 10, 2, 120), 'release', v_rel,
    'nonce', p_nonce, 'server_time', now());
end
$$;

-- ---------- 5. Anomalies relevées par le lanceur (avant NEXORA, sans session) ----------
create or replace function public.nx_security_report(p_secret text, p_device text, p_reason text, p_detail jsonb default '{}'::jsonb,
  p_version text default '', p_ip text default null, p_source text default 'launcher')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_dev uuid;
begin
  if not public.nx_worker_secret_ok(p_secret) then raise exception 'Accès refusé.'; end if;
  select id into v_dev from public.nx_devices where device_hash = left(coalesce(p_device, ''), 128);
  insert into public.nx_license_checks (device_id, ok, reason, ip, app_version, detail, source)
  values (v_dev, false, left(coalesce(p_reason, 'security'), 40), left(p_ip, 64), left(coalesce(p_version, ''), 40),
    case when jsonb_typeof(p_detail) = 'object' then p_detail else '{}'::jsonb end, left(coalesce(p_source, 'launcher'), 20));
  return jsonb_build_object('ok', true);
end
$$;

-- ---------- 6. Licence du compte (site « Ma licence ») ----------
create or replace function public.nx_license_mine(p_source text default 'site')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  l public.nx_licenses;
  v_plan text;
  v_paid text;
  v_pol jsonb := public.nx_policy('license_policy');
  b public.nx_billing;
begin
  if v_uid is null then raise exception 'Connexion requise.'; end if;
  l := public.nx_license_get(v_uid, p_source);
  select u.plan_id into v_plan from public.nx_user_plan(v_uid) u;
  v_paid := public.nx_paid_or_granted(v_uid);
  select * into b from public.nx_billing where user_id = v_uid;
  return jsonb_build_object(
    'key', l.key, 'status', l.status, 'created_at', l.created_at, 'activated_at', l.activated_at,
    'plan', coalesce(v_plan, 'free'), 'plan_name', public.nx_plan_label(coalesce(v_plan, 'free')),
    'paid_plan', v_paid, 'trial_ends_at', l.trial_ends_at, 'trial', coalesce(l.trial_ends_at > now(), false) and v_paid = 'free',
    'granted', public.nx_granted_plan(v_uid) is not null, 'granted_until', case when public.nx_granted_plan(v_uid) is not null then l.override_until end,
    'max_devices', coalesce(l.max_devices, case when v_paid = 'free' then public.nx_policy_int(v_pol, 'free_devices', 3, 1, 100) else public.nx_policy_int(v_pol, 'pro_devices', 5, 1, 100) end),
    'billing', case when b.user_id is null then null else jsonb_build_object('status', b.status, 'period', b.period, 'current_period_end', b.current_period_end, 'cancel_at_period_end', b.cancel_at_period_end, 'provider', b.provider) end,
    'devices', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'os', d.os, 'app_version', d.app_version, 'last_seen', a.last_seen, 'last_ip', a.last_ip, 'released', a.released) order by a.released, a.last_seen desc)
      from public.nx_device_accounts a join public.nx_devices d on d.id = a.device_id where a.user_id = v_uid), '[]'::jsonb),
    'server_time', now());
end
$$;

create or replace function public.nx_license_device_release(p_device uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  update public.nx_device_accounts set released = true where device_id = p_device and user_id = auth.uid();
  if not found then raise exception 'Ordinateur introuvable sur ta licence.'; end if;
  return jsonb_build_object('ok', true);
end
$$;

-- ---------- 7. Administration ----------
create or replace function public.nx_admin_required()
returns void
language plpgsql stable security definer set search_path = public
as $$ begin if not public.nx_is_admin() then raise exception 'Réservé aux administrateurs de NEXORA.'; end if; end $$;

-- Attribuer (ou modifier) la licence d'un compte par son adresse : offre imposée, durée en jours (vide : sans fin).
create or replace function public.nx_admin_license_grant(p_email text, p_plan text, p_days integer default null, p_note text default '', p_max_devices integer default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid;
  l public.nx_licenses;
begin
  perform public.nx_admin_required();
  if p_plan not in ('free', 'pro', 'auto') then raise exception 'Offre inconnue : choisis Gratuit, Pro ou Automatique.'; end if;
  select id into v_uid from auth.users where lower(email) = lower(trim(coalesce(p_email, ''))) limit 1;
  if v_uid is null then raise exception 'Aucun compte NEXORA avec cette adresse : la personne doit d’abord créer son compte (site, page « Ma licence »).'; end if;
  l := public.nx_license_get(v_uid, 'admin');
  update public.nx_licenses set
    plan_override = case when p_plan = 'auto' then null else p_plan end,
    override_until = case when p_plan = 'auto' or coalesce(p_days, 0) <= 0 then null else now() + make_interval(days => least(p_days, 3650)) end,
    note = left(coalesce(p_note, ''), 500), max_devices = p_max_devices, status = 'active',
    granted_by = auth.uid(), granted_at = now()
  where id = l.id returning * into l;
  return to_jsonb(l);
end
$$;

-- Modifier une licence : champs présents seulement (status, plan_override, override_until, trial_ends_at, max_devices, note).
create or replace function public.nx_admin_license_update(p_id uuid, p_patch jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  l public.nx_licenses;
  v_plan text := nullif(nullif(p_patch ->> 'plan_override', ''), 'auto');
begin
  perform public.nx_admin_required();
  if p_patch ? 'status' and p_patch ->> 'status' not in ('active', 'revoked') then raise exception 'Statut inconnu.'; end if;
  if p_patch ? 'plan_override' and v_plan is not null and v_plan not in ('free', 'pro') then raise exception 'Offre inconnue.'; end if;
  update public.nx_licenses set
    status = case when p_patch ? 'status' then p_patch ->> 'status' else status end,
    plan_override = case when p_patch ? 'plan_override' then v_plan else plan_override end,
    override_until = case when p_patch ? 'override_until' then nullif(p_patch ->> 'override_until', '')::timestamptz else override_until end,
    trial_ends_at = case when p_patch ? 'trial_ends_at' then nullif(p_patch ->> 'trial_ends_at', '')::timestamptz else trial_ends_at end,
    max_devices = case when p_patch ? 'max_devices' then nullif(p_patch ->> 'max_devices', '')::integer else max_devices end,
    note = case when p_patch ? 'note' then left(coalesce(p_patch ->> 'note', ''), 500) else note end,
    granted_by = auth.uid(), granted_at = now()
  where id = p_id returning * into l;
  if not found then raise exception 'Licence introuvable.'; end if;
  return to_jsonb(l);
end
$$;

-- Nouvelle clé (ancienne clé aussitôt refusée).
create or replace function public.nx_admin_license_rekey(p_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_key text;
  i integer;
begin
  perform public.nx_admin_required();
  for i in 1..8 loop
    v_key := public.nx_license_new_key();
    begin
      update public.nx_licenses set key = v_key, granted_by = auth.uid(), granted_at = now() where id = p_id;
      if not found then raise exception 'Licence introuvable.'; end if;
      return v_key;
    exception when unique_violation then null;
    end;
  end loop;
  raise exception 'Nouvelle clé impossible : réessaie.';
end
$$;

-- Retirer un compte d'un ordinateur (remet à zéro la limite des comptes gratuits de cet ordinateur pour ce compte).
create or replace function public.nx_admin_device_unlink(p_device uuid, p_user uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  perform public.nx_admin_required();
  delete from public.nx_device_accounts where device_id = p_device and user_id = p_user;
  return jsonb_build_object('ok', found);
end
$$;

-- Politiques : licences ou versions autorisées (valeurs vérifiées).
create or replace function public.nx_admin_policy_set(p_key text, p_value jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v jsonb;
begin
  perform public.nx_admin_required();
  if jsonb_typeof(p_value) <> 'object' then raise exception 'Réglages illisibles.'; end if;
  if p_key = 'license_policy' then
    v := jsonb_build_object(
      'free_accounts_per_device', public.nx_policy_int(p_value, 'free_accounts_per_device', 3, 1, 50),
      'gmail_per_device', public.nx_policy_int(p_value, 'gmail_per_device', 3, 1, 50),
      'trial_hours', public.nx_policy_int(p_value, 'trial_hours', 24, 0, 2160),
      'free_devices', public.nx_policy_int(p_value, 'free_devices', 3, 1, 100),
      'pro_devices', public.nx_policy_int(p_value, 'pro_devices', 5, 1, 100),
      'check_minutes', public.nx_policy_int(p_value, 'check_minutes', 10, 2, 120));
  elsif p_key = 'release_policy' then
    if coalesce(p_value ->> 'min_version', '') !~ '^\d+\.\d+\.\d+$' then raise exception 'Version minimale illisible (exemple : 1.2.0).'; end if;
    v := jsonb_build_object(
      'min_version', p_value ->> 'min_version',
      'min_manifest_version', case when coalesce(p_value ->> 'min_manifest_version', '') ~ '^\d{1,15}$' then (p_value ->> 'min_manifest_version')::bigint else 0 end,
      'block_outdated', coalesce((p_value ->> 'block_outdated')::boolean, true),
      'channel', case when p_value ->> 'channel' = 'beta' then 'beta' else 'stable' end);
  else
    raise exception 'Réglage inconnu.';
  end if;
  insert into public.app_config (key, value) values (p_key, v)
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return v;
end
$$;

-- ---------- 8. Droits ----------
revoke all on function public.nx_policy(text), public.nx_granted_plan(uuid), public.nx_paid_or_granted(uuid), public.nx_admin_required(),
  public.nx_license_check(text, text, text, text, text, text, text, text, jsonb),
  public.nx_security_report(text, text, text, jsonb, text, text, text), public.nx_license_device_release(uuid),
  public.nx_admin_license_grant(text, text, integer, text, integer), public.nx_admin_license_update(uuid, jsonb), public.nx_admin_license_rekey(uuid),
  public.nx_admin_device_unlink(uuid, uuid), public.nx_admin_policy_set(text, jsonb) from public, anon, authenticated;
grant execute on function public.nx_license_check(text, text, text, text, text, text, text, text, jsonb), public.nx_license_device_release(uuid),
  public.nx_license_mine(text), public.nx_admin_license_grant(text, text, integer, text, integer), public.nx_admin_license_update(uuid, jsonb),
  public.nx_admin_license_rekey(uuid), public.nx_admin_device_unlink(uuid, uuid), public.nx_admin_policy_set(text, jsonb) to authenticated;
-- Le Worker appelle nx_security_report avec la clé publique et le secret partagé (vérifié dans la fonction).
grant execute on function public.nx_security_report(text, text, text, jsonb, text, text, text) to anon, authenticated;
grant execute on function public.nx_release_policy(), public.nx_version_num(text), public.nx_policy_int(jsonb, text, integer, integer, integer) to anon, authenticated;
