-- NEXORA #022 — Supervision par le serveur : les sites sont vérifiés 24 h/24 par Supabase (pg_cron + pg_net),
-- même quand NEXORA est fermée. Pannes confirmées avant d'alerter, lenteurs, incidents suivis (prise en
-- charge, note, clôture), notifications dans NEXORA, agrégats horaires (400 jours) et vérifications
-- détaillées (31 jours), fonctions de lecture pour les tableaux de bord de l'application et du back office.
-- Idempotent : peut être appliqué plusieurs fois. Les tâches planifiées ne sont créées que si pg_cron est là.

-- 1. Colonnes ajoutées aux sites surveillés (table d'origine de NEXORA, rien n'est retiré).
alter table public.monitors add column if not exists threshold_ms integer not null default 0;
alter table public.monitors add column if not exists confirm_count smallint not null default 2;
alter table public.monitors add column if not exists fail_streak integer not null default 0;
alter table public.monitors add column if not exists slow_streak integer not null default 0;
alter table public.monitors add column if not exists first_fail_at timestamptz;
alter table public.monitors add column if not exists last_ok_at timestamptz;
alter table public.monitors add column if not exists status_since timestamptz;
alter table public.monitors add column if not exists muted_until timestamptz;
alter table public.monitors add column if not exists app_site_id text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'monitors_confirm_count_range') then
    alter table public.monitors add constraint monitors_confirm_count_range check (confirm_count between 1 and 10);
  end if;
end
$$;
create index if not exists monitors_org_app_site on public.monitors (org_id, app_site_id) where app_site_id is not null;
create index if not exists monitor_checks_monitor_at on public.monitor_checks (monitor_id, checked_at desc);

-- 2. Incidents et agrégats horaires.
create table if not exists public.monitor_incidents (
  id uuid primary key default gen_random_uuid(),
  monitor_id uuid not null references public.monitors (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('down', 'slow')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  cause text not null default '',
  last_cause text not null default '',
  checks integer not null default 1,
  notified integer not null default 0,
  notified_at timestamptz,
  ack_at timestamptz,
  ack_by uuid references auth.users (id) on delete set null,
  note text not null default '',
  closed_by text,
  resolution text not null default ''
);
create index if not exists monitor_incidents_monitor on public.monitor_incidents (monitor_id, started_at desc);
create index if not exists monitor_incidents_org on public.monitor_incidents (org_id, started_at desc);
create unique index if not exists monitor_incidents_one_open on public.monitor_incidents (monitor_id, kind) where ended_at is null;

create table if not exists public.monitor_hourly (
  monitor_id uuid not null references public.monitors (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  hour timestamptz not null,
  n integer not null default 0,
  ok integer not null default 0,
  lat_n integer not null default 0,
  lat_sum bigint not null default 0,
  lat_max integer,
  p50 integer,
  p95 integer,
  primary key (monitor_id, hour)
);
create index if not exists monitor_hourly_org on public.monitor_hourly (org_id, hour desc);

-- 3. Droits : membres de l'équipe et administrateurs de NEXORA en lecture ; modifications par les fonctions.
create or replace function public.nx_can_read_org(p_org uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = auth.uid())
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.app_role in ('admin', 'superadmin'));
$$;

create or replace function public.nx_can_edit_org(p_org uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = auth.uid() and m.role in ('owner', 'admin', 'editor'))
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.app_role in ('admin', 'superadmin'));
$$;

alter table public.monitor_incidents enable row level security;
alter table public.monitor_hourly enable row level security;
drop policy if exists "monitor_incidents_read" on public.monitor_incidents;
create policy "monitor_incidents_read" on public.monitor_incidents for select to authenticated using (public.nx_can_read_org(org_id));
drop policy if exists "monitor_hourly_read" on public.monitor_hourly;
create policy "monitor_hourly_read" on public.monitor_hourly for select to authenticated using (public.nx_can_read_org(org_id));
revoke all on public.monitor_incidents, public.monitor_hourly from anon;
grant select on public.monitor_incidents, public.monitor_hourly to authenticated;

-- 4. Moteur (exécuté par pg_cron avec les droits du propriétaire).

-- Message en français pour une erreur de pg_net (libcurl).
create or replace function public.nx_monitor_reason(p_error text, p_timed_out boolean)
returns text
language sql immutable
as $$
  select case
    when coalesce(p_timed_out, false) or p_error ilike '%timed out%' or p_error ilike '%timeout%' then 'délai dépassé'
    when p_error ilike '%resolve host%' or p_error ilike '%resolve%' then 'nom de domaine introuvable (DNS)'
    when p_error ilike '%connection refused%' or p_error ilike '%couldn''t connect%' or p_error ilike '%could not connect%' then 'connexion refusée'
    when p_error ilike '%ssl%' or p_error ilike '%certificate%' or p_error ilike '%tls%' then 'erreur de certificat ou TLS'
    when p_error ilike '%reset%' or p_error ilike '%empty reply%' then 'connexion coupée par le serveur'
    when p_error is null or p_error = '' then 'injoignable'
    else left(p_error, 120)
  end;
$$;

-- Notification dans NEXORA pour les membres qui peuvent agir (propriétaire, administrateurs, éditeurs).
create or replace function public.nx_monitor_notify(p_monitor public.monitors, p_title text, p_body text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_monitor.muted_until is not null and p_monitor.muted_until > now() then return; end if;
  insert into public.notifications (user_id, kind, title, body, link)
  select m.user_id, 'monitor', left(p_title, 140), left(p_body, 500), null
  from public.organization_members m
  where m.org_id = p_monitor.org_id and m.role in ('owner', 'admin', 'editor');
end
$$;

-- Enregistre une vérification et fait évoluer l'état du site, ses incidents et ses notifications.
create or replace function public.nx_monitor_record(p_monitor uuid, p_at timestamptz, p_ok boolean, p_status integer, p_latency integer, p_error text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  m public.monitors;
  v_name text;
  v_down public.monitor_incidents;
  v_slow public.monitor_incidents;
  v_status text;
  v_slow_now boolean;
begin
  select * into m from public.monitors where id = p_monitor for update;
  if not found then return; end if;
  v_name := coalesce(nullif(m.name, ''), m.url);
  insert into public.monitor_checks (monitor_id, org_id, checked_at, ok, status_code, latency_ms, error)
  values (m.id, m.org_id, p_at, p_ok, p_status, case when p_ok then p_latency end, case when p_ok then null else p_error end);
  select * into v_down from public.monitor_incidents where monitor_id = m.id and kind = 'down' and ended_at is null;
  select * into v_slow from public.monitor_incidents where monitor_id = m.id and kind = 'slow' and ended_at is null;

  if p_ok then
    m.fail_streak := 0;
    m.first_fail_at := null;
    m.last_ok_at := p_at;
    if v_down.id is not null then
      update public.monitor_incidents set ended_at = p_at, closed_by = 'auto', resolution = 'Le site répond de nouveau' where id = v_down.id;
      perform public.nx_monitor_notify(m, v_name || ' est de nouveau en ligne',
        'Rétabli après ' || public.nx_duration(p_at - v_down.started_at) || ' de panne (' || coalesce(p_latency, 0) || ' ms). Vérifié par les serveurs NEXORA.');
      v_down.id := null;
    end if;
    v_slow_now := m.threshold_ms > 0 and coalesce(p_latency, 0) > m.threshold_ms;
    m.slow_streak := case when v_slow_now then m.slow_streak + 1 else 0 end;
    if v_slow_now and v_slow.id is null and m.slow_streak >= 3 then
      insert into public.monitor_incidents (monitor_id, org_id, kind, started_at, cause, last_cause, checks, notified, notified_at)
      values (m.id, m.org_id, 'slow', p_at, p_latency || ' ms (seuil ' || m.threshold_ms || ' ms)', p_latency || ' ms', m.slow_streak, 1, now())
      returning * into v_slow;
      perform public.nx_monitor_notify(m, v_name || ' est lent', p_latency || ' ms pour un seuil de ' || m.threshold_ms || ' ms, plusieurs fois de suite.');
    elsif v_slow_now and v_slow.id is not null then
      update public.monitor_incidents set checks = checks + 1, last_cause = p_latency || ' ms' where id = v_slow.id;
    elsif not v_slow_now and v_slow.id is not null then
      update public.monitor_incidents set ended_at = p_at, closed_by = 'auto', resolution = 'Temps de réponse revenu sous le seuil' where id = v_slow.id;
      v_slow.id := null;
    end if;
  else
    m.fail_streak := m.fail_streak + 1;
    m.slow_streak := 0;
    if m.fail_streak = 1 then m.first_fail_at := p_at; end if;
    if v_down.id is null and m.fail_streak >= greatest(1, m.confirm_count) then
      if v_slow.id is not null then
        update public.monitor_incidents set ended_at = p_at, closed_by = 'auto', resolution = 'Le site est tombé en panne' where id = v_slow.id;
        v_slow.id := null;
      end if;
      insert into public.monitor_incidents (monitor_id, org_id, kind, started_at, cause, last_cause, checks, notified, notified_at)
      values (m.id, m.org_id, 'down', coalesce(m.first_fail_at, p_at), coalesce(p_error, 'injoignable'), coalesce(p_error, 'injoignable'), m.fail_streak, 1, now())
      returning * into v_down;
      perform public.nx_monitor_notify(m, v_name || ' est hors ligne', upper(left(coalesce(p_error, 'injoignable'), 1)) || substr(coalesce(p_error, 'injoignable'), 2) || ' · ' || m.fail_streak || ' vérifications en échec de suite. Vérifié par les serveurs NEXORA.');
    elsif v_down.id is not null then
      update public.monitor_incidents set checks = checks + 1, last_cause = coalesce(p_error, last_cause) where id = v_down.id;
      -- Rappel toutes les heures tant que la panne dure et que personne ne l'a prise en charge.
      if v_down.ack_at is null and coalesce(v_down.notified_at, v_down.started_at) < now() - interval '60 minutes' then
        update public.monitor_incidents set notified = notified + 1, notified_at = now() where id = v_down.id;
        perform public.nx_monitor_notify(m, v_name || ' est toujours hors ligne', 'Depuis ' || public.nx_duration(p_at - v_down.started_at) || ' (' || coalesce(p_error, 'injoignable') || ').');
      end if;
    end if;
  end if;

  v_status := case when v_down.id is not null then 'down' when v_slow.id is not null then 'degraded' when p_ok then 'up' else m.last_status end;
  update public.monitors set
    last_status = v_status,
    status_since = case when v_status is distinct from m.last_status or m.status_since is null then (case when v_status = 'down' then v_down.started_at else p_at end) else m.status_since end,
    last_checked_at = p_at,
    last_latency_ms = case when p_ok then p_latency else m.last_latency_ms end,
    last_error = case when p_ok then null else p_error end,
    fail_streak = m.fail_streak,
    slow_streak = m.slow_streak,
    first_fail_at = m.first_fail_at,
    last_ok_at = m.last_ok_at,
    updated_at = now()
  where id = m.id;
end
$$;

-- Durée lisible (« 12 min », « 2 h 05 », « 3 jours »).
create or replace function public.nx_duration(p interval)
returns text
language sql immutable
as $$
  select case
    when extract(epoch from p) < 60 then 'moins d’une minute'
    when extract(epoch from p) < 3600 then floor(extract(epoch from p) / 60)::int || ' min'
    when extract(epoch from p) < 172800 then floor(extract(epoch from p) / 3600)::int || ' h ' || lpad((floor(extract(epoch from p) / 60)::int % 60)::text, 2, '0')
    else floor(extract(epoch from p) / 86400)::int || ' jours'
  end;
$$;

-- Lit les réponses reçues par pg_net (et compte comme échecs les requêtes restées sans réponse).
create or replace function public.collect_monitor_results()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  q record;
  v_ok boolean;
  v_err text;
  v_lat integer;
  v_expected integer;
  v_done integer := 0;
begin
  -- Une seule collecte à la fois (deux tâches planifiées peuvent tomber sur la même minute).
  if not pg_try_advisory_xact_lock(4210022) then return 0; end if;
  for q in
    select r.monitor_id, r.request_id, r.started_at, h.id as hid, h.status_code, h.content, h.timed_out, h.error_msg, h.created,
           mo.expected_status, mo.keyword
    from public.monitor_requests r
    join public.monitors mo on mo.id = r.monitor_id
    left join net._http_response h on h.id = r.request_id
    where h.id is not null or r.started_at < now() - interval '2 minutes'
    order by r.started_at
  loop
    delete from public.monitor_requests where monitor_id = q.monitor_id and request_id = q.request_id;
    v_expected := coalesce(q.expected_status, 200);
    v_lat := case when q.hid is not null and q.created is not null then greatest(0, round(extract(epoch from (q.created - q.started_at)) * 1000))::int end;
    if q.hid is null then
      v_ok := false; v_err := 'pas de réponse (délai dépassé)';
    elsif coalesce(q.timed_out, false) or q.status_code is null then
      v_ok := false; v_err := public.nx_monitor_reason(q.error_msg, q.timed_out);
    elsif not (q.status_code = v_expected or (v_expected = 200 and q.status_code between 200 and 399)) then
      v_ok := false; v_err := 'statut ' || q.status_code;
    elsif coalesce(q.keyword, '') <> '' and position(lower(q.keyword) in lower(coalesce(q.content, ''))) = 0 then
      v_ok := false; v_err := 'mot-clé absent';
    else
      v_ok := true; v_err := null;
    end if;
    perform public.nx_monitor_record(q.monitor_id, q.started_at, v_ok, q.status_code, v_lat, v_err);
    v_done := v_done + 1;
  end loop;
  -- Requêtes orphelines (site supprimé entre-temps).
  delete from public.monitor_requests r where r.started_at < now() - interval '1 day';
  return v_done;
end
$$;

-- Lance les vérifications dues (après avoir lu les réponses déjà arrivées, pour tenir le rythme demandé).
create or replace function public.run_monitor_checks()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  mo record;
  v_rid bigint;
  v_n integer := 0;
begin
  perform public.collect_monitor_results();
  for mo in
    select m.id, m.url from public.monitors m
    where m.active
      and m.url ~* '^https?://'
      and (m.last_checked_at is null or m.last_checked_at <= now() - make_interval(mins => greatest(1, m.interval_minutes)) + interval '25 seconds')
      and not exists (select 1 from public.monitor_requests r where r.monitor_id = m.id)
    order by m.last_checked_at nulls first
    limit 500
  loop
    v_rid := net.http_get(
      url := mo.url,
      headers := jsonb_build_object('User-Agent', 'Mozilla/5.0 (compatible; NEXORA-Supervision/1.0; +serveur)', 'Cache-Control', 'no-cache', 'Accept', 'text/html,application/json;q=0.9,*/*;q=0.8'),
      timeout_milliseconds := 15000
    );
    insert into public.monitor_requests (monitor_id, request_id, started_at) values (mo.id, v_rid, clock_timestamp());
    v_n := v_n + 1;
  end loop;
  return v_n;
end
$$;

-- Agrégats horaires des heures terminées (les 31 derniers jours au premier passage).
create or replace function public.nx_monitor_rollup()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_from timestamptz;
  v_to timestamptz := date_trunc('hour', now());
  v_n integer;
begin
  select coalesce(max(hour) - interval '2 hours', now() - interval '31 days') into v_from from public.monitor_hourly;
  insert into public.monitor_hourly as h (monitor_id, org_id, hour, n, ok, lat_n, lat_sum, lat_max, p50, p95)
  select c.monitor_id, min(c.org_id::text)::uuid, date_trunc('hour', c.checked_at), count(*), count(*) filter (where c.ok),
         count(c.latency_ms), coalesce(sum(c.latency_ms), 0), max(c.latency_ms),
         round(percentile_cont(0.5) within group (order by c.latency_ms))::int,
         round(percentile_cont(0.95) within group (order by c.latency_ms))::int
  from public.monitor_checks c
  where c.checked_at >= date_trunc('hour', v_from) and c.checked_at < v_to
  group by c.monitor_id, date_trunc('hour', c.checked_at)
  on conflict (monitor_id, hour) do update set n = excluded.n, ok = excluded.ok, lat_n = excluded.lat_n, lat_sum = excluded.lat_sum,
    lat_max = excluded.lat_max, p50 = excluded.p50, p95 = excluded.p95;
  get diagnostics v_n = row_count;
  return v_n;
end
$$;

-- Conservation : vérifications détaillées 31 jours, agrégats et incidents clos 400 jours.
create or replace function public.nx_monitor_cleanup()
returns void
language sql security definer set search_path = public
as $$
  delete from public.monitor_checks where checked_at < now() - interval '31 days';
  delete from public.monitor_hourly where hour < now() - interval '400 days';
  delete from public.monitor_incidents where ended_at is not null and ended_at < now() - interval '400 days';
$$;

revoke all on function public.run_monitor_checks(), public.collect_monitor_results(), public.nx_monitor_rollup(), public.nx_monitor_cleanup(),
  public.nx_monitor_record(uuid, timestamptz, boolean, integer, integer, text), public.nx_monitor_notify(public.monitors, text, text) from public, anon, authenticated;

-- 5. Lecture pour les tableaux de bord (droits de l'appelant : la sécurité des lignes s'applique).

-- Vue d'ensemble : un résumé et un bandeau de disponibilité par site visible, sur p_hours heures.
create or replace function public.monitor_overview(p_org uuid default null, p_hours integer default 24, p_buckets integer default 48)
returns jsonb
language plpgsql stable security invoker set search_path = public
as $$
declare
  v_hours integer := greatest(1, least(coalesce(p_hours, 24), 24 * 90));
  v_buckets integer := greatest(6, least(coalesce(p_buckets, 48), 180));
  v_to timestamptz := now();
  v_from timestamptz := now() - make_interval(hours => greatest(1, least(coalesce(p_hours, 24), 24 * 90)));
  v_step double precision;
  v_sites jsonb;
  v_cut timestamptz := date_trunc('hour', now()) - interval '1 hour';
begin
  v_step := extract(epoch from (v_to - v_from)) / v_buckets;
  with mon as (
    select m.* from public.monitors m where p_org is null or m.org_id = p_org
  ),
  src as (
    -- Vérifications détaillées jusqu'à 7 jours, agrégats horaires au-delà.
    select c.monitor_id, c.checked_at as t, 1 as n, (case when c.ok then 1 else 0 end) as ok, c.latency_ms as lat, null::integer as p95h
    from public.monitor_checks c join mon on mon.id = c.monitor_id
    where v_hours <= 168 and c.checked_at >= v_from
    union all
    select h.monitor_id, h.hour, h.n, h.ok, case when h.lat_n > 0 then (h.lat_sum / h.lat_n)::int end, h.p95
    from public.monitor_hourly h join mon on mon.id = h.monitor_id
    where v_hours > 168 and h.hour >= v_from and h.hour < v_cut
    union all
    -- Les deux dernières heures ne sont pas encore toutes agrégées : vérifications détaillées.
    select c.monitor_id, c.checked_at, 1, (case when c.ok then 1 else 0 end), c.latency_ms, null::integer
    from public.monitor_checks c join mon on mon.id = c.monitor_id
    where v_hours > 168 and c.checked_at >= v_cut
  ),
  b as (
    select monitor_id, least(v_buckets - 1, floor(extract(epoch from (t - v_from)) / v_step)::int) as i,
           sum(n) as n, sum(ok) as ok,
           round(percentile_cont(0.95) within group (order by coalesce(p95h, lat)))::int as p95
    from src group by 1, 2
  ),
  tot as (
    select monitor_id, sum(n) as n, sum(ok) as ok,
           round(percentile_cont(0.5) within group (order by lat))::int as p50,
           round(percentile_cont(0.95) within group (order by coalesce(p95h, lat)))::int as p95,
           round(avg(lat))::int as avg
    from src group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', mon.id, 'org_id', mon.org_id, 'org', (select o.name from public.organizations o where o.id = mon.org_id),
    'name', mon.name, 'url', mon.url, 'active', mon.active, 'interval_minutes', mon.interval_minutes,
    'threshold_ms', mon.threshold_ms, 'confirm_count', mon.confirm_count, 'keyword', mon.keyword, 'expected_status', mon.expected_status,
    'app_site_id', mon.app_site_id, 'muted_until', mon.muted_until,
    'status', case when not mon.active then 'paused' else coalesce(mon.last_status, 'unknown') end,
    'status_since', mon.status_since, 'last_checked_at', mon.last_checked_at, 'last_latency_ms', mon.last_latency_ms, 'last_error', mon.last_error,
    'n', coalesce(tot.n, 0), 'fails', coalesce(tot.n - tot.ok, 0),
    'avail', case when coalesce(tot.n, 0) > 0 then round(tot.ok * 100.0 / tot.n, 3) end,
    'p50', tot.p50, 'p95', tot.p95, 'avg', tot.avg,
    'open', (select count(*) from public.monitor_incidents i where i.monitor_id = mon.id and i.ended_at is null),
    'bars', (select jsonb_agg(jsonb_build_object(
        't', v_from + make_interval(secs => g * v_step), 'n', coalesce(b.n, 0), 'fails', coalesce(b.n - b.ok, 0),
        'avail', case when coalesce(b.n, 0) > 0 then round(b.ok * 100.0 / b.n, 2) end, 'p95', b.p95) order by g)
      from generate_series(0, v_buckets - 1) g left join b on b.monitor_id = mon.id and b.i = g)
  ) order by mon.name, mon.url), '[]'::jsonb)
  into v_sites
  from mon left join tot on tot.monitor_id = mon.id;

  return jsonb_build_object(
    'from', v_from, 'to', v_to, 'hours', v_hours, 'step', round(v_step * 1000), 'sites', v_sites,
    'incidents', (select coalesce(jsonb_agg(row_to_json(x) order by x.started_at desc), '[]'::jsonb) from (
      select i.id, i.monitor_id, i.org_id, i.kind, i.started_at, i.ended_at, i.cause, i.last_cause, i.checks, i.notified, i.ack_at, i.note,
             coalesce(nullif(m.name, ''), m.url) as site
      from public.monitor_incidents i join public.monitors m on m.id = i.monitor_id
      where (p_org is null or i.org_id = p_org) and i.started_at < v_to and (i.ended_at is null or i.ended_at > v_from)
      order by i.started_at desc limit 200) x)
  );
end
$$;

-- Courbes d'un site : disponibilité et temps de réponse par tranche, incidents et dernières vérifications.
create or replace function public.monitor_series(p_monitor uuid, p_hours integer default 24, p_buckets integer default 96)
returns jsonb
language plpgsql stable security invoker set search_path = public
as $$
declare
  v_hours integer := greatest(1, least(coalesce(p_hours, 24), 24 * 90));
  v_buckets integer := greatest(6, least(coalesce(p_buckets, 96), 400));
  v_to timestamptz := now();
  v_from timestamptz := now() - make_interval(hours => greatest(1, least(coalesce(p_hours, 24), 24 * 90)));
  v_step double precision;
  v_cut timestamptz := date_trunc('hour', now()) - interval '1 hour';
begin
  if not exists (select 1 from public.monitors where id = p_monitor) then return null; end if;
  v_step := extract(epoch from (v_to - v_from)) / v_buckets;
  return (
    with src as (
      select c.checked_at as t, 1 as n, (case when c.ok then 1 else 0 end) as ok, c.latency_ms as lat, null::integer as p50h, null::integer as p95h, c.latency_ms as mx
      from public.monitor_checks c where v_hours <= 168 and c.monitor_id = p_monitor and c.checked_at >= v_from
      union all
      select h.hour, h.n, h.ok, case when h.lat_n > 0 then (h.lat_sum / h.lat_n)::int end, h.p50, h.p95, h.lat_max
      from public.monitor_hourly h where v_hours > 168 and h.monitor_id = p_monitor and h.hour >= v_from and h.hour < v_cut
      union all
      select c.checked_at, 1, (case when c.ok then 1 else 0 end), c.latency_ms, null::integer, null::integer, c.latency_ms
      from public.monitor_checks c where v_hours > 168 and c.monitor_id = p_monitor and c.checked_at >= v_cut
    ),
    b as (
      select least(v_buckets - 1, floor(extract(epoch from (t - v_from)) / v_step)::int) as i, sum(n) as n, sum(ok) as ok,
             round(avg(lat))::int as avg,
             round(percentile_cont(0.5) within group (order by coalesce(p50h, lat)))::int as p50,
             round(percentile_cont(0.95) within group (order by coalesce(p95h, lat)))::int as p95,
             max(mx) as max
      from src group by 1
    )
    select jsonb_build_object(
      'from', v_from, 'to', v_to, 'hours', v_hours, 'step', round(v_step * 1000), 'hourly', v_hours > 168,
      'points', (select jsonb_agg(jsonb_build_object('t', v_from + make_interval(secs => g * v_step), 'n', coalesce(b.n, 0), 'fails', coalesce(b.n - b.ok, 0),
          'avail', case when coalesce(b.n, 0) > 0 then round(b.ok * 100.0 / b.n, 2) end, 'avg', b.avg, 'p50', b.p50, 'p95', b.p95, 'max', b.max) order by g)
        from generate_series(0, v_buckets - 1) g left join b on b.i = g),
      'totals', (select jsonb_build_object('n', coalesce(sum(n), 0), 'fails', coalesce(sum(n) - sum(ok), 0),
          'avail', case when coalesce(sum(n), 0) > 0 then round(sum(ok) * 100.0 / sum(n), 3) end,
          'avg', round(avg(lat))::int, 'p50', round(percentile_cont(0.5) within group (order by coalesce(p50h, lat)))::int,
          'p95', round(percentile_cont(0.95) within group (order by coalesce(p95h, lat)))::int, 'max', max(mx)) from src),
      'incidents', (select coalesce(jsonb_agg(row_to_json(i) order by i.started_at desc), '[]'::jsonb) from public.monitor_incidents i
        where i.monitor_id = p_monitor and i.started_at < v_to and (i.ended_at is null or i.ended_at > v_from)),
      'recent', (select coalesce(jsonb_agg(row_to_json(c) order by c.checked_at desc), '[]'::jsonb) from (
        select checked_at, ok, status_code, latency_ms, error from public.monitor_checks where monitor_id = p_monitor order by checked_at desc limit 50) c)
    )
  );
end
$$;

-- Prise en charge, note ou clôture d'un incident (propriétaire, administrateurs et éditeurs de l'équipe).
create or replace function public.monitor_incident_action(p_incident uuid, p_action text, p_note text default null)
returns public.monitor_incidents
language plpgsql security definer set search_path = public
as $$
declare
  v public.monitor_incidents;
begin
  select * into v from public.monitor_incidents where id = p_incident for update;
  if not found then raise exception 'Incident introuvable.'; end if;
  if not public.nx_can_edit_org(v.org_id) then raise exception 'Droits insuffisants pour cet incident.'; end if;
  if p_action = 'ack' then
    update public.monitor_incidents set ack_at = case when ack_at is null then now() end, ack_by = case when ack_at is null then auth.uid() end where id = v.id returning * into v;
  elsif p_action = 'note' then
    update public.monitor_incidents set note = left(coalesce(p_note, ''), 2000) where id = v.id returning * into v;
  elsif p_action = 'close' then
    if v.ended_at is null then
      update public.monitor_incidents set ended_at = now(), closed_by = 'manuel', resolution = left(coalesce(nullif(p_note, ''), 'Clos à la main'), 500) where id = v.id returning * into v;
      -- Le site sera de nouveau déclaré en panne s'il échoue encore après confirmation.
      update public.monitors set fail_streak = 0, slow_streak = 0, last_status = 'unknown' where id = v.monitor_id and v.kind = 'down';
    end if;
  else
    raise exception 'Action inconnue.';
  end if;
  return v;
end
$$;

grant execute on function public.monitor_overview(uuid, integer, integer), public.monitor_series(uuid, integer, integer), public.monitor_incident_action(uuid, text, text) to authenticated;
revoke execute on function public.monitor_overview(uuid, integer, integer), public.monitor_series(uuid, integer, integer), public.monitor_incident_action(uuid, text, text) from anon;

-- 6. Tâches planifiées (si pg_cron est installé ; la migration 20261103000002 crée les deux premières).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where command ilike '%run_monitor_checks%') then
      perform cron.schedule('nexora-monitor-checks', '* * * * *', 'select public.run_monitor_checks()');
    end if;
    if not exists (select 1 from cron.job where command ilike '%nx_monitor_rollup%') then
      perform cron.schedule('nexora-monitor-rollup', '7 * * * *', 'select public.nx_monitor_rollup()');
    end if;
    if not exists (select 1 from cron.job where command ilike '%nx_monitor_cleanup%') then
      perform cron.schedule('nexora-monitor-cleanup', '40 3 * * *', 'select public.nx_monitor_cleanup()');
    end if;
  end if;
end
$$;
