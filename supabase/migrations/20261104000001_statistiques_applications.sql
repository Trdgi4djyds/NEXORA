-- NEXORA #018 — Statistiques et rapports de plantage des applications de l'App Builder.
-- Chaque application inscrite reçoit une clé d'envoi (ingest_key) intégrée à l'APK : l'application
-- n'écrit qu'au travers de app_track (clé vérifiée, volume limité) ; seul le propriétaire lit ses données.
-- Aucune donnée personnelle : identifiant d'installation tiré au hasard sur le téléphone, modèle,
-- version d'Android et de l'application, langue, et trace des plantages. Conservation : 180 jours.
-- Idempotent : peut être appliqué plusieurs fois.

create table if not exists public.app_insights_apps (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  app_id text not null check (char_length(app_id) between 3 and 150),
  name text not null default '',
  ingest_key text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  unique (owner, app_id)
);

create table if not exists public.app_insights_events (
  id bigint generated always as identity primary key,
  app uuid not null references public.app_insights_apps (id) on delete cascade,
  at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  kind text not null check (kind in ('launch', 'crash', 'error')),
  install text not null,
  version text,
  version_code bigint,
  os text,
  model text,
  locale text,
  signature text,
  detail jsonb
);
create index if not exists app_insights_events_app_at on public.app_insights_events (app, at desc);
create index if not exists app_insights_events_install on public.app_insights_events (app, install, received_at desc);

alter table public.app_insights_apps enable row level security;
alter table public.app_insights_events enable row level security;

drop policy if exists "app_insights_apps_owner" on public.app_insights_apps;
create policy "app_insights_apps_owner" on public.app_insights_apps
  for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "app_insights_events_owner_read" on public.app_insights_events;
create policy "app_insights_events_owner_read" on public.app_insights_events
  for select to authenticated using (exists (select 1 from public.app_insights_apps a where a.id = app and a.owner = auth.uid()));

drop policy if exists "app_insights_events_owner_delete" on public.app_insights_events;
create policy "app_insights_events_owner_delete" on public.app_insights_events
  for delete to authenticated using (exists (select 1 from public.app_insights_apps a where a.id = app and a.owner = auth.uid()));

revoke all on public.app_insights_apps, public.app_insights_events from anon;
grant select, insert, update, delete on public.app_insights_apps to authenticated;
grant select, delete on public.app_insights_events to authenticated;

-- Inscription (ou nouvelle lecture) d'une application du compte connecté : renvoie sa clé d'envoi.
create or replace function public.app_insights_register(p_app_id text, p_name text default '')
returns table (id uuid, ingest_key text)
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Connexion requise.'; end if;
  return query
    insert into public.app_insights_apps as a (owner, app_id, name)
    values (uid, left(trim(p_app_id), 150), left(coalesce(p_name, ''), 120))
    on conflict (owner, app_id) do update set name = excluded.name
    returning a.id, a.ingest_key;
end
$$;

-- Envoi par les applications (rôle anon). Clé inconnue : rien n'est écrit. Au plus 50 événements par appel
-- et 200 par installation et par heure ; textes tronqués, détail limité à 8 Ko.
create or replace function public.app_track(p_key text, p_events jsonb)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_app uuid;
  v_event jsonb;
  v_kind text;
  v_install text;
  v_at timestamptz;
  v_recent integer;
  v_done integer := 0;
begin
  select a.id into v_app from public.app_insights_apps a where a.ingest_key = p_key;
  if v_app is null or jsonb_typeof(p_events) <> 'array' then return 0; end if;
  for v_event in select value from jsonb_array_elements(p_events) limit 50 loop
    v_kind := v_event ->> 'kind';
    v_install := left(coalesce(v_event ->> 'install', ''), 64);
    continue when v_kind not in ('launch', 'crash', 'error') or v_install = '';
    select count(*) into v_recent from public.app_insights_events e
      where e.app = v_app and e.install = v_install and e.received_at > now() - interval '1 hour';
    continue when v_recent >= 200;
    begin
      v_at := to_timestamp((v_event ->> 'at')::double precision / 1000);
    exception when others then
      v_at := now();
    end;
    if v_at is null or v_at > now() + interval '1 day' or v_at < now() - interval '30 days' then v_at := now(); end if;
    insert into public.app_insights_events (app, at, kind, install, version, version_code, os, model, locale, signature, detail)
    values (
      v_app, v_at, v_kind, v_install,
      left(v_event ->> 'version', 40),
      case when (v_event ->> 'version_code') ~ '^\d{1,12}$' then (v_event ->> 'version_code')::bigint end,
      left(v_event ->> 'os', 60), left(v_event ->> 'model', 80), left(v_event ->> 'locale', 20),
      left(v_event ->> 'signature', 300),
      case when octet_length(coalesce(v_event -> 'detail', 'null'::jsonb)::text) <= 8192 then v_event -> 'detail'
           else jsonb_build_object('message', left(v_event -> 'detail' ->> 'message', 500), 'stack', left(v_event -> 'detail' ->> 'stack', 6000)) end
    );
    v_done := v_done + 1;
  end loop;
  return v_done;
end
$$;

-- Tableau de bord du propriétaire (droits de l'appelant : la sécurité des lignes s'applique).
create or replace function public.app_insights_summary(p_app uuid, p_days integer default 30)
returns jsonb
language sql stable security invoker set search_path = public
as $$
  with ev as (
    select * from public.app_insights_events
    where app = p_app and at > now() - make_interval(days => greatest(1, least(p_days, 180)))
  ),
  days as (
    select generate_series(date_trunc('day', now()) - make_interval(days => greatest(1, least(p_days, 180)) - 1), date_trunc('day', now()), interval '1 day')::date as day
  )
  select jsonb_build_object(
    'days', greatest(1, least(p_days, 180)),
    'totals', (select jsonb_build_object(
      'installs', count(distinct install),
      'launches', count(*) filter (where kind = 'launch'),
      'crashes', count(*) filter (where kind = 'crash'),
      'errors', count(*) filter (where kind = 'error'),
      'crashInstalls', count(distinct install) filter (where kind = 'crash'),
      'last', max(at)
    ) from ev),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object(
      'day', d.day,
      'installs', (select count(distinct install) from ev where at::date = d.day),
      'launches', (select count(*) from ev where at::date = d.day and kind = 'launch'),
      'crashes', (select count(*) from ev where at::date = d.day and kind = 'crash')
    ) order by d.day), '[]'::jsonb) from days d),
    'versions', (select coalesce(jsonb_agg(v order by v.installs desc), '[]'::jsonb) from (
      select coalesce(version, '?') as version, count(distinct install) as installs, count(*) filter (where kind = 'crash') as crashes
      from ev group by 1 order by 2 desc limit 8) v),
    'models', (select coalesce(jsonb_agg(m order by m.installs desc), '[]'::jsonb) from (
      select coalesce(model, '?') as model, count(distinct install) as installs from ev group by 1 order by 2 desc limit 8) m),
    'os', (select coalesce(jsonb_agg(o order by o.installs desc), '[]'::jsonb) from (
      select coalesce(os, '?') as os, count(distinct install) as installs from ev group by 1 order by 2 desc limit 8) o),
    'crashes', (select coalesce(jsonb_agg(c order by c.count desc), '[]'::jsonb) from (
      select g.signature, g.kind, count(*) as count, count(distinct g.install) as installs, max(g.at) as last,
        (array_agg(g.version order by g.at desc))[1] as version,
        (array_agg(g.model order by g.at desc))[1] as model,
        (array_agg(g.detail order by g.at desc))[1] as detail
      from ev g where g.kind in ('crash', 'error') group by g.signature, g.kind order by count(*) desc limit 20) c)
  );
$$;

revoke all on function public.app_track(text, jsonb) from public;
grant execute on function public.app_track(text, jsonb) to anon, authenticated;
revoke all on function public.app_insights_register(text, text) from public, anon;
grant execute on function public.app_insights_register(text, text) to authenticated;
revoke all on function public.app_insights_summary(uuid, integer) from public, anon;
grant execute on function public.app_insights_summary(uuid, integer) to authenticated;

-- Nettoyage quotidien : événements de plus de 180 jours (tâche créée une seule fois, si pg_cron est là).
create or replace function public.app_insights_cleanup()
returns void language sql security definer set search_path = public
as $$ delete from public.app_insights_events where received_at < now() - interval '180 days'; $$;
revoke all on function public.app_insights_cleanup() from public, anon, authenticated;

do $$
begin
  -- Deux tests séparés : sans pg_cron, la table cron.job n'existe pas et ne doit pas être lue.
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where command ilike '%app_insights_cleanup%') then
      perform cron.schedule('nexora-app-insights-cleanup', '45 3 * * *', 'select public.app_insights_cleanup()');
    end if;
  end if;
end
$$;
