-- NEXORA #048 — Fiabilité : sécurité et supervision.
-- Vérifications par le serveur : API (méthode, en-têtes, corps, valeur JSON), DNS (valeur attendue, changement),
-- expiration du nom de domaine (RDAP), signal de vie des tâches planifiées, contenu modifié ; fenêtres de
-- maintenance (aucune mesure, aucune alerte), repères de déploiement envoyés par une intégration continue,
-- webhooks d'équipe, escalade, heures calmes, objectif de disponibilité, confirmation des pannes depuis une
-- deuxième région (Worker Cloudflare), pages de statut publiques avec abonnement par e-mail, mesure des
-- visiteurs réels (Web Vitals), rapport mensuel par e-mail ; nouvelles fonctions des offres ; corrections du
-- conseiller de performance (A-024). Idempotent. Suppose les migrations 20261104000002 à 20261104000007.

-- 1. Sites surveillés : types et réglages.
alter table public.monitors add column if not exists kind text not null default 'http';
alter table public.monitors add column if not exists method text not null default 'GET';
alter table public.monitors add column if not exists req_headers jsonb not null default '{}'::jsonb;
alter table public.monitors add column if not exists req_body text;
alter table public.monitors add column if not exists json_path text;
alter table public.monitors add column if not exists json_op text not null default 'equals';
alter table public.monitors add column if not exists json_expect text;
alter table public.monitors add column if not exists heartbeat_token text;
alter table public.monitors add column if not exists heartbeat_grace_min integer not null default 5;
alter table public.monitors add column if not exists last_ping_at timestamptz;
alter table public.monitors add column if not exists dns_type text not null default 'A';
alter table public.monitors add column if not exists dns_expect text;
alter table public.monitors add column if not exists dns_watch boolean not null default false;
alter table public.monitors add column if not exists dns_last text;
alter table public.monitors add column if not exists domain_warn_days integer not null default 30;
alter table public.monitors add column if not exists domain_days integer;
alter table public.monitors add column if not exists domain_checked_at timestamptz;
alter table public.monitors add column if not exists watch_change boolean not null default false;
alter table public.monitors add column if not exists content_hash text;
alter table public.monitors add column if not exists slo numeric(6,3) not null default 99.9;
alter table public.monitors add column if not exists escalate_min integer not null default 0;
alter table public.monitors add column if not exists regional_status text;
alter table public.monitors add column if not exists regional_at timestamptz;
alter table public.monitors add column if not exists regional_colo text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'monitors_kind_check') then
    alter table public.monitors add constraint monitors_kind_check check (kind in ('http', 'api', 'heartbeat', 'dns', 'domain'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'monitors_dns_type_check') then
    alter table public.monitors add constraint monitors_dns_type_check check (dns_type in ('A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'CAA'));
  end if;
end
$$;
create unique index if not exists monitors_heartbeat_token on public.monitors (heartbeat_token) where heartbeat_token is not null;

-- Jeton du signal de vie, créé une seule fois.
create or replace function public.nx_monitor_defaults()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.kind = 'heartbeat' and new.heartbeat_token is null then
    new.heartbeat_token := substr(md5(random()::text || clock_timestamp()::text || coalesce(new.id::text, '')), 1, 24);
  end if;
  new.slo := least(99.999, greatest(90, coalesce(new.slo, 99.9)));
  new.heartbeat_grace_min := least(1440, greatest(1, coalesce(new.heartbeat_grace_min, 5)));
  return new;
end
$$;
drop trigger if exists nx_monitor_defaults on public.monitors;
create trigger nx_monitor_defaults before insert or update on public.monitors for each row execute function public.nx_monitor_defaults();

alter table public.monitor_incidents add column if not exists escalated_at timestamptz;
alter table public.monitor_incidents drop constraint if exists monitor_incidents_kind_check;
alter table public.monitor_incidents add constraint monitor_incidents_kind_check check (kind in ('down', 'slow', 'change', 'domain'));

-- 2. Maintenance, déploiements, webhooks, préférences d'alerte, deuxième région.
create table if not exists public.monitor_maintenance (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  monitor_id uuid references public.monitors (id) on delete cascade,
  local_id text,
  label text not null default 'Maintenance',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  recur text not null default 'none' check (recur in ('none', 'daily', 'weekly')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists monitor_maintenance_org on public.monitor_maintenance (org_id);
create index if not exists monitor_maintenance_monitor on public.monitor_maintenance (monitor_id);
create index if not exists monitor_maintenance_created_by on public.monitor_maintenance (created_by);

create table if not exists public.monitor_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  monitor_id uuid references public.monitors (id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null default 'deploy',
  label text not null default '',
  source text not null default 'serveur'
);
create index if not exists monitor_events_org on public.monitor_events (org_id, at desc);
create index if not exists monitor_events_monitor on public.monitor_events (monitor_id);

create table if not exists public.monitor_hooks (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.monitor_webhooks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null default '',
  url text not null check (url ~* '^https://'),
  events text not null default 'all' check (events in ('all', 'critical', 'escalation')),
  enabled boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists monitor_webhooks_org on public.monitor_webhooks (org_id);
create index if not exists monitor_webhooks_created_by on public.monitor_webhooks (created_by);

create table if not exists public.nx_alert_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  quiet_from smallint check (quiet_from between 0 and 23),
  quiet_to smallint check (quiet_to between 0 and 23),
  updated_at timestamptz not null default now()
);

create table if not exists public.monitor_probe_jobs (
  monitor_id uuid primary key references public.monitors (id) on delete cascade,
  url text not null,
  created_at timestamptz not null default now()
);

-- 3. Pages de statut et abonnés.
create table if not exists public.status_pages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  title text not null default 'Statut des services',
  intro text not null default '',
  monitor_ids uuid[] not null default '{}',
  published boolean not null default true,
  show_incidents boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists status_pages_org on public.status_pages (org_id);
create index if not exists status_pages_created_by on public.status_pages (created_by);

create table if not exists public.status_subscribers (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.status_pages (id) on delete cascade,
  email text not null,
  token text not null unique,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (page_id, email)
);

-- 4. Visiteurs réels.
create table if not exists public.rum_sites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  key text not null unique default substr(md5(random()::text || clock_timestamp()::text), 1, 24),
  name text not null default '',
  origins text[] not null default '{}',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists rum_sites_org on public.rum_sites (org_id);
create index if not exists rum_sites_created_by on public.rum_sites (created_by);

create table if not exists public.rum_events (
  id bigserial primary key,
  site_id uuid not null references public.rum_sites (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  at timestamptz not null default now(),
  path text not null default '/',
  device text not null default 'desktop',
  lcp integer, inp integer, cls numeric(8,4), fcp integer, ttfb integer,
  err text, err_src text
);
create index if not exists rum_events_site_at on public.rum_events (site_id, at desc);
create index if not exists rum_events_org on public.rum_events (org_id);

-- 5. Droits : lecture par l'équipe, modification par les éditeurs ; le reste passe par les fonctions.
alter table public.monitor_maintenance enable row level security;
alter table public.monitor_events enable row level security;
alter table public.monitor_hooks enable row level security;
alter table public.monitor_webhooks enable row level security;
alter table public.nx_alert_prefs enable row level security;
alter table public.monitor_probe_jobs enable row level security;
alter table public.status_pages enable row level security;
alter table public.status_subscribers enable row level security;
alter table public.rum_sites enable row level security;
alter table public.rum_events enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['monitor_maintenance', 'monitor_events', 'monitor_webhooks', 'status_pages', 'rum_sites'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.nx_can_read_org(org_id))', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.nx_can_edit_org(org_id)) with check (public.nx_can_edit_org(org_id))', t || '_write', t);
  end loop;
end
$$;
drop policy if exists rum_events_read on public.rum_events;
create policy rum_events_read on public.rum_events for select to authenticated using (public.nx_can_read_org(org_id));
drop policy if exists nx_alert_prefs_own on public.nx_alert_prefs;
create policy nx_alert_prefs_own on public.nx_alert_prefs for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.monitor_maintenance, public.monitor_events, public.monitor_hooks, public.monitor_webhooks, public.nx_alert_prefs,
  public.monitor_probe_jobs, public.status_pages, public.status_subscribers, public.rum_sites, public.rum_events from anon;
grant select, insert, update, delete on public.monitor_maintenance, public.monitor_events, public.monitor_webhooks, public.status_pages, public.rum_sites, public.nx_alert_prefs to authenticated;
grant select on public.rum_events to authenticated;
revoke all on public.monitor_hooks, public.monitor_probe_jobs, public.status_subscribers from authenticated;

-- 6. Offres : nouvelles fonctions (page de statut : Standard ; parcours, deuxième région : Pro ; intégration
-- continue et visiteurs réels : permission « API et SDK », Pro). Clés ajoutées seulement si absentes.
update public.plans set perms = perms || jsonb_build_object('status_page', id in ('standard', 'pro', 'team', 'enterprise')) where not (perms ? 'status_page');
update public.plans set perms = perms || jsonb_build_object('synthetic', id in ('pro', 'team', 'enterprise')) where not (perms ? 'synthetic');
update public.plans set perms = perms || jsonb_build_object('multi_region', id in ('pro', 'team', 'enterprise')) where not (perms ? 'multi_region');

create or replace function public.nx_feature_rule(p_feature text, out perm text, out metric text, out per text, out label text)
language sql immutable
as $$
  select r.perm, r.metric, r.per, r.label from (values
    ('apk', 'apk', 'builds_month', 'month', 'La génération d’APK'),
    ('pwa', 'pwa', 'builds_month', 'month', 'Le paquet PWA'),
    ('source_import', 'source_import', null, null, 'L’import de dossiers et de code source'),
    ('play_publish', 'play_publish', null, null, 'La publication sur le Play Store'),
    ('push', 'push', 'push_month', 'month', 'Les notifications push'),
    ('inapp', 'inapp', null, null, 'Les messages in-app'),
    ('automation', 'automation', null, null, 'Les notifications programmées et les automatisations'),
    ('custom_notifications', 'custom_notifications', null, null, 'Les notifications personnalisées'),
    ('messaging_events', 'messaging_events', null, null, 'Les événements de messagerie'),
    ('integrations', 'integrations', null, null, 'Les achats intégrés et les outils d’intégration'),
    ('api_sdk', 'api_sdk', null, null, 'L’API et le SDK de statistiques'),
    ('crawler', 'crawler', 'crawls_per_day', 'day', 'Le Crawler (aspirateur de site)'),
    ('audit_advanced', 'audits_advanced', null, null, 'Les tests et audits avancés'),
    ('devlab', 'devlab', null, null, 'Le Dev Lab'),
    ('desktop_builder', 'desktop_builder', 'builds_month', 'month', 'Le Desktop Builder'),
    ('responsive_advanced', 'responsive_advanced', null, null, 'Le Responsive avancé'),
    ('studio_advanced', 'studio_advanced', null, null, 'Le Studio 3D avancé'),
    ('design_extended', 'design_extended', null, null, 'NEX-DESIGN étendu'),
    ('design_full', 'design_full', null, null, 'NEX-DESIGN complet'),
    ('alerts', 'alerts', null, null, 'Les alertes par e-mail'),
    ('scan', null, 'scans_per_day', 'day', 'L’audit de sécurité'),
    ('ai', null, 'ai_requests_month', 'month', 'L’assistant IA'),
    ('ci_export', 'api_sdk', null, null, 'L’intégration continue et l’export SARIF'),
    ('rum', 'api_sdk', null, null, 'La mesure des visiteurs réels'),
    ('synthetic', 'synthetic', null, null, 'Les parcours rejoués'),
    ('status_page', 'status_page', null, null, 'La page de statut publique'),
    ('multi_region', 'multi_region', null, null, 'La confirmation depuis une deuxième région')
  ) r(f, perm, metric, per, label)
  where r.f = p_feature;
$$;

create or replace function public.nx_org_perm(p_org uuid, p_key text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.nx_perm(public.nx_org_plan(p_org), p_key);
$$;

create or replace function public.nx_check_org_perm()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_key text := tg_argv[0];
  v_label text := tg_argv[1];
  v_need text := tg_argv[2];
begin
  if public.nx_is_admin() or public.nx_org_perm(new.org_id, v_key) then return new; end if;
  raise exception '% fait partie de l’offre %.', v_label, v_need using errcode = 'P0001';
end
$$;
drop trigger if exists nx_perm_status_pages on public.status_pages;
create trigger nx_perm_status_pages before insert on public.status_pages for each row execute function public.nx_check_org_perm('status_page', 'La page de statut publique', 'Standard');
drop trigger if exists nx_perm_rum_sites on public.rum_sites;
create trigger nx_perm_rum_sites before insert on public.rum_sites for each row execute function public.nx_check_org_perm('api_sdk', 'La mesure des visiteurs réels', 'Pro');

-- 7. Outils du moteur.
create or replace function public.nx_monitor_in_maint(p_monitor public.monitors)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.monitor_maintenance w
    where w.org_id = p_monitor.org_id and (w.monitor_id is null or w.monitor_id = p_monitor.id) and now() >= w.starts_at
      and case w.recur
        when 'daily' then mod(extract(epoch from now() - w.starts_at)::bigint, 86400) < extract(epoch from w.ends_at - w.starts_at)
        when 'weekly' then mod(extract(epoch from now() - w.starts_at)::bigint, 604800) < extract(epoch from w.ends_at - w.starts_at)
        else now() < w.ends_at
      end
  );
$$;

-- Corps du message d'un webhook selon le service qui le reçoit.
create or replace function public.nx_webhook_body(p_url text, p_title text, p_body text, p_level text)
returns jsonb
language sql immutable
set search_path = public
as $$
  select case
    when p_url ~* 'hooks\.slack\.com|chat\.googleapis\.com' then jsonb_build_object('text', '*' || p_title || E'*\n' || p_body)
    when p_url ~* 'discord(app)?\.com/api/webhooks' then jsonb_build_object('username', 'NEXORA', 'embeds', jsonb_build_array(jsonb_build_object('title', left(p_title, 250), 'description', left(p_body, 4000),
      'color', case p_level when 'critique' then 15020074 when 'ok' then 2071893 else 14251782 end)))
    when p_url ~* 'webhook\.office\.com|logic\.azure\.com|powerplatform|powerautomate' then jsonb_build_object('@type', 'MessageCard', '@context', 'https://schema.org/extensions', 'summary', p_title,
      'themeColor', case p_level when 'critique' then 'e5302a' when 'ok' then '1f9d55' else 'd97706' end, 'title', p_title, 'text', p_body)
    else jsonb_build_object('source', 'nexora', 'level', p_level, 'title', p_title, 'text', p_body, 'at', now())
  end;
$$;

create or replace function public.nx_monitor_webhooks(p_monitor public.monitors, p_title text, p_body text, p_level text, p_escalation boolean default false)
returns integer
language plpgsql security definer set search_path = public, extensions
as $$
declare
  h record;
  v_n integer := 0;
begin
  for h in select * from public.monitor_webhooks where org_id = p_monitor.org_id and enabled loop
    if h.events = 'critical' and p_level <> 'critique' then continue; end if;
    if h.events = 'escalation' and not p_escalation then continue; end if;
    perform net.http_post(url := h.url, body := public.nx_webhook_body(h.url, p_title, p_body, p_level),
      headers := jsonb_build_object('Content-Type', 'application/json'), timeout_milliseconds := 10000);
    v_n := v_n + 1;
  end loop;
  return v_n;
exception when others then
  raise warning 'NEXORA : webhook non envoyé (%).', sqlerrm;
  return v_n;
end
$$;

-- E-mails aux abonnés des pages de statut qui montrent ce site (ouverture et fin d'incident).
create or replace function public.nx_status_broadcast(p_monitor public.monitors, p_title text, p_body text)
returns integer
language plpgsql security definer set search_path = public, extensions
as $$
declare
  p record;
  s record;
  v_web text;
  v_n integer := 0;
  v_id bigint;
  v_html text;
begin
  select value #>> '{}' into v_web from public.app_config where key = 'web_url';
  v_web := coalesce(nullif(v_web, ''), 'https://nexora.abrahamtogbonon0.workers.dev/');
  for p in select * from public.status_pages where published and p_monitor.id = any (monitor_ids) loop
    for s in select * from public.status_subscribers where page_id = p.id and confirmed_at is not null order by created_at limit 200 loop
      begin
        perform public.nx_email_quota(1);
      exception when others then
        return v_n;
      end;
      v_html := '<div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:28px 24px;color:#1d1d1f">'
        || '<div style="font-size:13px;font-weight:600;color:#6e6e73;margin-bottom:10px">' || public.nx_html(p.title) || '</div>'
        || '<h1 style="font-size:20px;line-height:1.3;margin:0 0 12px">' || public.nx_html(p_title) || '</h1>'
        || '<p style="font-size:15px;line-height:1.55;margin:0 0 22px;color:#3a3a3c">' || public.nx_html(p_body) || '</p>'
        || '<a href="' || public.nx_html(v_web || 'status/?p=' || p.slug) || '" style="display:inline-block;background:#1d1d1f;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;font-size:14px">Voir l’état des services</a>'
        || '<p style="font-size:12px;line-height:1.5;color:#6e6e73;margin:28px 0 0">Tu reçois ce message car tu suis cette page. <a href="' || public.nx_html(v_web || 'status/?p=' || p.slug || '&stop=' || s.token) || '" style="color:#6e6e73">Ne plus recevoir</a></div>';
      v_id := public.nx_brevo_post(s.email, '', p.title || ' : ' || p_title, v_html, p_title || E'\n\n' || p_body || E'\n\n' || v_web || 'status/?p=' || p.slug, 'statut', null);
      if v_id is not null then
        insert into public.nx_email_log (user_id, request_id, kind, to_email) values (null, v_id, 'statut', s.email);
        v_n := v_n + 1;
      end if;
    end loop;
  end loop;
  return v_n;
exception when others then
  raise warning 'NEXORA : abonnés de la page de statut non prévenus (%).', sqlerrm;
  return v_n;
end
$$;

-- Notification dans NEXORA (même signature qu'en 20261104000002), plus webhooks et abonnés des pages de statut.
-- Rien pendant une maintenance.
create or replace function public.nx_monitor_notify(p_monitor public.monitors, p_title text, p_body text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_level text := case when p_title ~* '(de nouveau|renouvel|normalement|rétabli)' then 'ok' when p_title ~* '(hors ligne|expiré|escalade)' then 'critique' else 'alerte' end;
begin
  if p_monitor.muted_until is not null and p_monitor.muted_until > now() then return; end if;
  if public.nx_monitor_in_maint(p_monitor) then return; end if;
  insert into public.notifications (user_id, kind, title, body, link)
  select m.user_id, 'monitor', left(p_title, 140), left(p_body, 500), null
  from public.organization_members m
  where m.org_id = p_monitor.org_id and m.role in ('owner', 'admin', 'editor');
  perform public.nx_monitor_webhooks(p_monitor, p_title, p_body, v_level, p_title ~* '^escalade');
  if p_title ~* '(hors ligne|de nouveau en ligne|est lent|répond de nouveau)' then
    perform public.nx_status_broadcast(p_monitor, p_title, p_body);
  end if;
end
$$;

-- Incident d'un autre type (contenu modifié, domaine) : ouvert une fois, notifié.
create or replace function public.nx_monitor_event(p_monitor public.monitors, p_kind text, p_cause text, p_title text, p_body text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from public.monitor_incidents where monitor_id = p_monitor.id and kind = p_kind and ended_at is null) then
    update public.monitor_incidents set checks = checks + 1, last_cause = left(p_cause, 300) where monitor_id = p_monitor.id and kind = p_kind and ended_at is null;
    return;
  end if;
  insert into public.monitor_incidents (monitor_id, org_id, kind, started_at, cause, last_cause, notified, notified_at)
  values (p_monitor.id, p_monitor.org_id, p_kind, now(), left(p_cause, 300), left(p_cause, 300), 1, now());
  perform public.nx_monitor_notify(p_monitor, p_title, p_body);
end
$$;

-- Escalade : propriétaire et administrateurs de l'équipe, webhooks réservés aux escalades.
create or replace function public.nx_monitor_escalate(p_monitor public.monitors, p_incident public.monitor_incidents, p_error text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_name text := coalesce(nullif(p_monitor.name, ''), p_monitor.url);
  v_title text := 'Escalade : ' || v_name || ' est toujours hors ligne';
  v_body text := 'Hors ligne depuis ' || public.nx_duration(now() - p_incident.started_at) || ' (' || coalesce(p_error, 'injoignable') || '), et personne n’a pris l’incident en charge.';
begin
  update public.monitor_incidents set escalated_at = now() where id = p_incident.id;
  insert into public.notifications (user_id, kind, title, body, link)
  select m.user_id, 'monitor', left(v_title, 140), left(v_body, 500), null
  from public.organization_members m where m.org_id = p_monitor.org_id and m.role in ('owner', 'admin');
  perform public.nx_monitor_webhooks(p_monitor, v_title, v_body, 'critique', true);
end
$$;

-- 8. Moteur : enregistrement d'une vérification (remplace la version de 20261104000002).
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
  v_regional boolean;
begin
  select * into m from public.monitors where id = p_monitor for update;
  if not found then return; end if;
  -- Maintenance : aucune mesure (exclue de la disponibilité), aucun incident.
  if public.nx_monitor_in_maint(m) then
    update public.monitors set last_checked_at = p_at, fail_streak = 0, slow_streak = 0, updated_at = now() where id = m.id;
    return;
  end if;
  v_name := coalesce(nullif(m.name, ''), m.url);
  insert into public.monitor_checks (monitor_id, org_id, checked_at, ok, status_code, latency_ms, error)
  values (m.id, m.org_id, p_at, p_ok, p_status, case when p_ok then p_latency end, case when p_ok then null else p_error end);
  select * into v_down from public.monitor_incidents where monitor_id = m.id and kind = 'down' and ended_at is null;
  select * into v_slow from public.monitor_incidents where monitor_id = m.id and kind = 'slow' and ended_at is null;
  v_regional := m.kind in ('http', 'api') and public.nx_org_perm(m.org_id, 'multi_region')
    and exists (select 1 from vault.decrypted_secrets where name = 'nx_probe_secret');

  if p_ok then
    m.fail_streak := 0;
    m.first_fail_at := null;
    m.last_ok_at := p_at;
    if v_down.id is not null then
      update public.monitor_incidents set ended_at = p_at, closed_by = 'auto', resolution = 'Le site répond de nouveau' where id = v_down.id;
      perform public.nx_monitor_notify(m, v_name || ' est de nouveau en ligne',
        'Rétabli après ' || public.nx_duration(p_at - v_down.started_at) || ' de panne' || case when p_latency is not null then ' (' || p_latency || ' ms)' else '' end || '. Vérifié par les serveurs NEXORA.');
      v_down.id := null;
    end if;
    v_slow_now := m.kind <> 'heartbeat' and m.threshold_ms > 0 and coalesce(p_latency, 0) > m.threshold_ms;
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
      perform public.nx_monitor_notify(m, v_name || ' répond de nouveau normalement', 'Temps de réponse revenu sous le seuil.');
      v_slow.id := null;
    end if;
  else
    m.fail_streak := m.fail_streak + 1;
    m.slow_streak := 0;
    if m.fail_streak = 1 then m.first_fail_at := p_at; end if;
    -- Deuxième région (offre Pro) : le Worker revérifie ; une panne vue d'un seul endroit n'est pas confirmée.
    if v_regional and v_down.id is null then
      insert into public.monitor_probe_jobs (monitor_id, url) values (m.id, m.url) on conflict (monitor_id) do nothing;
    end if;
    if v_down.id is null and m.fail_streak >= greatest(1, m.confirm_count)
      and not (v_regional and m.regional_status = 'up' and m.regional_at > now() - interval '3 minutes')
      and not (v_regional and (m.regional_at is null or m.regional_at < now() - interval '3 minutes') and m.fail_streak < greatest(1, m.confirm_count) + 2) then
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
      if v_down.ack_at is null and m.escalate_min > 0 and v_down.escalated_at is null and v_down.started_at < now() - make_interval(mins => m.escalate_min) then
        perform public.nx_monitor_escalate(m, v_down, p_error);
      end if;
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

-- Valeur d'un chemin simple dans un JSON (« data.items[0].status », « $.status »).
create or replace function public.nx_json_pick(p_json jsonb, p_path text)
returns text
language sql immutable
set search_path = public
as $$
  select p_json #>> string_to_array(regexp_replace(regexp_replace(coalesce(p_path, ''), '^\$\.?', ''), '\[(\d+)\]', '.\1', 'g'), '.');
$$;

-- Empreinte du texte visible d'une page (scripts, styles, nombres longs ignorés).
create or replace function public.nx_content_hash(p text)
returns text
language sql immutable
set search_path = public
as $$
  select left(md5(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    regexp_replace(coalesce(p, ''), '<(script|style|noscript|template)[^>]*>.*?</\1>', ' ', 'gis'),
    '<!--.*?-->', ' ', 'gs'), '<[^>]+>', ' ', 'g'), '[0-9]{3,}', '#', 'g'), '\s+', ' ', 'g')), 16);
$$;

-- Lit les réponses reçues par pg_net selon le type (remplace la version de 20261104000002).
create or replace function public.collect_monitor_results()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  q record;
  mo public.monitors;
  v_ok boolean;
  v_err text;
  v_lat integer;
  v_expected integer;
  v_done integer := 0;
  v_json jsonb;
  v_val text;
  v_days integer;
  v_hash text;
  v_name text;
begin
  if not pg_try_advisory_xact_lock(4210022) then return 0; end if;
  for q in
    select r.monitor_id, r.request_id, r.started_at, h.id as hid, h.status_code, h.content, h.timed_out, h.error_msg, h.created
    from public.monitor_requests r
    left join net._http_response h on h.id = r.request_id
    where h.id is not null or r.started_at < now() - interval '2 minutes'
    order by r.started_at
  loop
    delete from public.monitor_requests where monitor_id = q.monitor_id and request_id = q.request_id;
    select * into mo from public.monitors where id = q.monitor_id;
    if not found then continue; end if;
    v_name := coalesce(nullif(mo.name, ''), mo.url);
    v_expected := coalesce(mo.expected_status, 200);
    v_lat := case when q.hid is not null and q.created is not null then greatest(0, round(extract(epoch from (q.created - q.started_at)) * 1000))::int end;
    v_ok := null; v_err := null;
    if q.hid is null then
      v_ok := false; v_err := 'pas de réponse (délai dépassé)';
    elsif coalesce(q.timed_out, false) or q.status_code is null then
      v_ok := false; v_err := public.nx_monitor_reason(q.error_msg, q.timed_out);
    end if;

    if mo.kind = 'domain' then
      -- Expiration du domaine : pas de mesure de disponibilité, seulement l'échéance.
      update public.monitors set domain_checked_at = now(), last_checked_at = now() where id = mo.id;
      if v_ok is distinct from false and q.status_code = 200 then
        begin
          v_json := q.content::jsonb;
          select floor(extract(epoch from (e ->> 'eventDate')::timestamptz - now()) / 86400)::int into v_days
          from jsonb_array_elements(coalesce(v_json -> 'events', '[]'::jsonb)) e where e ->> 'eventAction' ilike '%expir%' limit 1;
        exception when others then v_days := null;
        end;
        if v_days is not null then
          update public.monitors set domain_days = v_days, last_status = 'up', last_error = null where id = mo.id;
          if v_days <= mo.domain_warn_days then
            perform public.nx_monitor_event(mo, 'domain', 'expire dans ' || v_days || ' jour(s)', 'Le domaine de ' || v_name || ' expire dans ' || v_days || ' jour(s)', 'Renouvelle-le chez ton registraire et active le renouvellement automatique.');
          elsif exists (select 1 from public.monitor_incidents where monitor_id = mo.id and kind = 'domain' and ended_at is null) then
            update public.monitor_incidents set ended_at = now(), closed_by = 'auto', resolution = 'Domaine renouvelé' where monitor_id = mo.id and kind = 'domain' and ended_at is null;
            perform public.nx_monitor_notify(mo, 'Le domaine de ' || v_name || ' a été renouvelé', v_days || ' jours restants.');
          end if;
        end if;
      end if;
      v_done := v_done + 1;
      continue;
    end if;

    if v_ok is null and mo.kind = 'dns' then
      begin
        v_json := q.content::jsonb;
        select string_agg(a ->> 'data', ' | ' order by a ->> 'data') into v_val from jsonb_array_elements(coalesce(v_json -> 'Answer', '[]'::jsonb)) a;
      exception when others then v_val := null;
      end;
      if coalesce(v_val, '') = '' then v_ok := false; v_err := 'aucun enregistrement ' || mo.dns_type;
      elsif coalesce(mo.dns_expect, '') <> '' and position(lower(mo.dns_expect) in lower(v_val)) = 0 then v_ok := false; v_err := mo.dns_type || ' = ' || left(v_val, 80) || ' (attendu ' || mo.dns_expect || ')';
      else v_ok := true;
      end if;
      if v_ok and mo.dns_watch and mo.dns_last is not null and mo.dns_last <> v_val then
        perform public.nx_monitor_event(mo, 'change', 'DNS : ' || left(mo.dns_last, 60) || ' → ' || left(v_val, 60), 'L’enregistrement DNS de ' || v_name || ' a changé', 'Nouvelle valeur : ' || left(v_val, 200) || '. Vérifie qu’il s’agit bien d’une modification de ta part.');
      end if;
      if v_ok then update public.monitors set dns_last = v_val where id = mo.id; end if;
    elsif v_ok is null then
      if not (q.status_code = v_expected or (v_expected = 200 and q.status_code between 200 and 399)) then
        v_ok := false; v_err := 'statut ' || q.status_code;
      elsif coalesce(mo.keyword, '') <> '' and position(lower(mo.keyword) in lower(coalesce(q.content, ''))) = 0 then
        v_ok := false; v_err := 'mot-clé absent';
      elsif mo.kind = 'api' and coalesce(mo.json_path, '') <> '' then
        begin
          v_val := public.nx_json_pick(q.content::jsonb, mo.json_path);
          v_ok := case mo.json_op
            when 'exists' then v_val is not null
            when 'contains' then position(coalesce(mo.json_expect, '') in coalesce(v_val, '')) > 0
            when 'not' then v_val is distinct from mo.json_expect
            when 'lt' then v_val::numeric < mo.json_expect::numeric
            when 'gt' then v_val::numeric > mo.json_expect::numeric
            else v_val is not distinct from mo.json_expect
          end;
          if not v_ok then v_err := mo.json_path || ' = ' || coalesce(left(v_val, 60), 'absent'); end if;
        exception when others then
          v_ok := false; v_err := 'réponse non JSON';
        end;
      else
        v_ok := true;
      end if;
      -- Contenu modifié (défiguration, page remplacée).
      if v_ok and mo.watch_change and mo.kind = 'http' then
        v_hash := public.nx_content_hash(q.content);
        if mo.content_hash is not null and mo.content_hash <> v_hash then
          perform public.nx_monitor_event(mo, 'change', 'contenu modifié', 'Le contenu de ' || v_name || ' a changé', 'Vérifie qu’il s’agit bien d’une mise à jour de ta part.');
        end if;
        update public.monitors set content_hash = v_hash where id = mo.id;
      end if;
    end if;
    perform public.nx_monitor_record(q.monitor_id, q.started_at, v_ok, q.status_code, v_lat, v_err);
    v_done := v_done + 1;
  end loop;
  delete from public.monitor_requests r where r.started_at < now() - interval '1 day';
  return v_done;
end
$$;

-- Lance les vérifications dues (remplace la version de 20261104000002) ; signal de vie évalué sans requête.
create or replace function public.run_monitor_checks()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  mo record;
  v_rid bigint;
  v_n integer := 0;
  v_host text;
  v_headers jsonb;
  v_body jsonb;
begin
  perform public.collect_monitor_results();
  for mo in
    select m.* from public.monitors m
    where m.active and m.kind <> 'heartbeat'
      and m.url ~* '^https?://'
      and (case when m.kind = 'domain' then m.domain_checked_at is null or m.domain_checked_at <= now() - interval '6 hours'
                else m.last_checked_at is null or m.last_checked_at <= now() - make_interval(mins => greatest(1, m.interval_minutes)) + interval '25 seconds' end)
      and not exists (select 1 from public.monitor_requests r where r.monitor_id = m.id)
    order by m.last_checked_at nulls first
    limit 500
  loop
    v_host := substring(mo.url from '^https?://([^/:?#]+)');
    v_headers := jsonb_build_object('User-Agent', 'Mozilla/5.0 (compatible; NEXORA-Supervision/1.1; +serveur)', 'Cache-Control', 'no-cache', 'Accept', 'text/html,application/json;q=0.9,*/*;q=0.8');
    if mo.kind = 'domain' then
      v_rid := net.http_get(url := 'https://rdap.org/domain/' || regexp_replace(v_host, '^www\.', ''), headers := jsonb_build_object('Accept', 'application/rdap+json, application/json'), timeout_milliseconds := 15000);
    elsif mo.kind = 'dns' then
      v_rid := net.http_get(url := 'https://cloudflare-dns.com/dns-query?name=' || v_host || '&type=' || mo.dns_type, headers := jsonb_build_object('Accept', 'application/dns-json'), timeout_milliseconds := 10000);
    elsif mo.kind = 'api' and upper(mo.method) not in ('GET', 'HEAD') then
      -- pg_net n'envoie que GET et POST : PUT, PATCH et DELETE partent en POST.
      begin v_body := coalesce(nullif(mo.req_body, ''), '{}')::jsonb; exception when others then v_body := to_jsonb(mo.req_body); end;
      v_rid := net.http_post(url := mo.url, body := v_body, headers := v_headers || jsonb_build_object('Content-Type', 'application/json') || coalesce(mo.req_headers, '{}'::jsonb), timeout_milliseconds := 15000);
    else
      v_rid := net.http_get(url := mo.url, headers := v_headers || case when mo.kind = 'api' then coalesce(mo.req_headers, '{}'::jsonb) else '{}'::jsonb end, timeout_milliseconds := 15000);
    end if;
    insert into public.monitor_requests (monitor_id, request_id, started_at) values (mo.id, v_rid, clock_timestamp());
    v_n := v_n + 1;
  end loop;
  -- Signal de vie : en retard au-delà de l'intervalle et du délai de grâce, une fois par minute au plus.
  for mo in
    select m.* from public.monitors m
    where m.active and m.kind = 'heartbeat'
      and coalesce(m.last_ping_at, m.created_at) < now() - make_interval(mins => greatest(1, m.interval_minutes) + m.heartbeat_grace_min)
      and (m.last_checked_at is null or m.last_checked_at < now() - interval '55 seconds')
  loop
    perform public.nx_monitor_record(mo.id, now(), false, 0, null, case when mo.last_ping_at is null then 'aucun signal reçu' else 'aucun signal depuis ' || public.nx_duration(now() - mo.last_ping_at) end);
  end loop;
  return v_n;
end
$$;

-- 9. Signal de vie et déploiements, appelés par le Worker de NEXORA web (adresse publique, sans compte).
create or replace function public.nx_heartbeat_ping(p_token text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  m public.monitors;
begin
  select * into m from public.monitors where heartbeat_token = p_token and kind = 'heartbeat' and active;
  if not found then return jsonb_build_object('ok', false); end if;
  if m.last_ping_at is not null and m.last_ping_at > now() - interval '10 seconds' then return jsonb_build_object('ok', true); end if;
  update public.monitors set last_ping_at = now() where id = m.id;
  perform public.nx_monitor_record(m.id, now(), true, 200, null, null);
  return jsonb_build_object('ok', true);
end
$$;

create or replace function public.nx_monitor_hook_token(p_org uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v text;
begin
  if not public.nx_can_edit_org(p_org) then raise exception 'Droits insuffisants pour cet espace.'; end if;
  insert into public.monitor_hooks (org_id, token) values (p_org, substr(md5(random()::text || clock_timestamp()::text), 1, 28)) on conflict (org_id) do nothing;
  select token into v from public.monitor_hooks where org_id = p_org;
  return v;
end
$$;

create or replace function public.nx_deploy_mark(p_token text, p_label text default '', p_url text default '')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_org uuid;
  v_mon uuid;
begin
  select org_id into v_org from public.monitor_hooks where token = p_token;
  if v_org is null then return jsonb_build_object('ok', false); end if;
  if (select count(*) from public.monitor_events where org_id = v_org and at > now() - interval '1 hour') >= 60 then return jsonb_build_object('ok', false, 'reason', 'limite'); end if;
  if coalesce(p_url, '') <> '' then
    select id into v_mon from public.monitors where org_id = v_org and substring(url from '^https?://([^/:?#]+)') = substring(p_url from '^(?:https?://)?([^/:?#]+)') limit 1;
  end if;
  insert into public.monitor_events (org_id, monitor_id, label, source) values (v_org, v_mon, left(coalesce(nullif(p_label, ''), 'Déploiement'), 140), 'serveur');
  return jsonb_build_object('ok', true);
end
$$;

-- 10. Deuxième région : le Worker de NEXORA web prend les revérifications et rend ses résultats.
create or replace function public.nx_probe_secret_ok(p_secret text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(p_secret, '') <> '' and exists (select 1 from vault.decrypted_secrets where name = 'nx_probe_secret' and decrypted_secret = p_secret);
$$;

create or replace function public.nx_probe_jobs(p_secret text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.nx_probe_secret_ok(p_secret) then return '[]'::jsonb; end if;
  with taken as (
    delete from public.monitor_probe_jobs where monitor_id in (select monitor_id from public.monitor_probe_jobs order by created_at limit 50) returning monitor_id, url
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', monitor_id, 'url', url)), '[]'::jsonb) into v from taken;
  return v;
end
$$;

create or replace function public.nx_probe_report(p_secret text, p_results jsonb)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  r jsonb;
  v_n integer := 0;
begin
  if not public.nx_probe_secret_ok(p_secret) or jsonb_typeof(p_results) <> 'array' then return 0; end if;
  for r in select * from jsonb_array_elements(p_results) limit 100 loop
    update public.monitors set regional_status = case when (r ->> 'ok')::boolean then 'up' else 'down' end, regional_at = now(), regional_colo = left(r ->> 'colo', 20)
    where id = (r ->> 'id')::uuid;
    v_n := v_n + 1;
  end loop;
  return v_n;
end
$$;

-- Secret partagé avec le Worker (variable NX_PROBE_SECRET de Cloudflare) : créé au premier appel, lu par un
-- super-administrateur seulement (éditeur SQL : select public.nx_probe_secret_init();).
create or replace function public.nx_probe_secret_init()
returns text
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v text;
begin
  if auth.uid() is not null and not exists (select 1 from public.profiles where id = auth.uid() and app_role = 'superadmin') then
    raise exception 'Réservé aux super-administrateurs.';
  end if;
  select decrypted_secret into v from vault.decrypted_secrets where name = 'nx_probe_secret';
  if v is null then
    v := md5(random()::text || clock_timestamp()::text) || md5(random()::text);
    perform vault.create_secret(v, 'nx_probe_secret', 'Secret partagé avec le Worker de NEXORA web (deuxième région)');
  end if;
  return v;
end
$$;

-- 11. Pages de statut : lecture publique, abonnement avec confirmation par e-mail.
create or replace function public.nx_status_page(p_slug text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  p public.status_pages;
  v_services jsonb;
  v_incidents jsonb := '[]'::jsonb;
  v_maint jsonb;
  v_overall text;
begin
  select * into p from public.status_pages where slug = lower(p_slug) and published;
  if not found then return null; end if;
  select coalesce(jsonb_agg(s order by s ->> 'name'), '[]'::jsonb) into v_services from (
    select jsonb_build_object(
      'name', coalesce(nullif(m.name, ''), substring(m.url from '^https?://([^/:?#]+)')),
      'status', case when not m.active then 'paused' when public.nx_monitor_in_maint(m) then 'maint' when m.last_status = 'down' then 'down' when m.last_status = 'degraded' then 'degraded' when m.last_status = 'up' then 'up' else 'unknown' end,
      'uptime', (select round(100.0 * sum(h.ok) / nullif(sum(h.n), 0), 3) from public.monitor_hourly h where h.monitor_id = m.id and h.hour > now() - interval '90 days'),
      'days', (select coalesce(jsonb_agg(jsonb_build_object('d', d::date, 'a', (select round(100.0 * sum(h.ok) / nullif(sum(h.n), 0), 2) from public.monitor_hourly h where h.monitor_id = m.id and h.hour >= d and h.hour < d + interval '1 day')) order by d), '[]'::jsonb)
               from generate_series(date_trunc('day', now()) - interval '89 days', date_trunc('day', now()), interval '1 day') d)
    ) s
    from public.monitors m where m.id = any (p.monitor_ids)
  ) x;
  if p.show_incidents then
    select coalesce(jsonb_agg(jsonb_build_object('service', coalesce(nullif(m.name, ''), substring(m.url from '^https?://([^/:?#]+)')), 'kind', i.kind, 'started_at', i.started_at, 'ended_at', i.ended_at, 'cause', i.cause) order by i.started_at desc), '[]'::jsonb)
    into v_incidents
    from (select * from public.monitor_incidents where monitor_id = any (p.monitor_ids) and kind in ('down', 'slow') and started_at > now() - interval '90 days' order by started_at desc limit 25) i
    join public.monitors m on m.id = i.monitor_id;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('label', w.label, 'starts_at', w.starts_at, 'ends_at', w.ends_at, 'recur', w.recur) order by w.starts_at), '[]'::jsonb) into v_maint
  from public.monitor_maintenance w
  where w.org_id = p.org_id and (w.monitor_id is null or w.monitor_id = any (p.monitor_ids)) and (w.recur <> 'none' or w.ends_at > now()) and w.starts_at < now() + interval '14 days';
  v_overall := case when exists (select 1 from jsonb_array_elements(v_services) e where e ->> 'status' = 'down') then 'down'
                    when exists (select 1 from jsonb_array_elements(v_services) e where e ->> 'status' in ('degraded', 'maint')) then 'degraded' else 'up' end;
  return jsonb_build_object('title', p.title, 'intro', p.intro, 'overall', v_overall, 'updated_at', now(), 'services', v_services, 'incidents', v_incidents, 'maintenance', v_maint);
end
$$;

create or replace function public.nx_status_subscribe(p_slug text, p_email text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  p public.status_pages;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_token text;
  v_web text;
  v_id bigint;
  v_link text;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 200 then return jsonb_build_object('ok', false, 'message', 'Adresse e-mail invalide.'); end if;
  select * into p from public.status_pages where slug = lower(p_slug) and published;
  if not found then return jsonb_build_object('ok', false, 'message', 'Page introuvable.'); end if;
  if exists (select 1 from public.status_subscribers where page_id = p.id and email = v_email and (confirmed_at is not null or created_at > now() - interval '1 hour')) then
    return jsonb_build_object('ok', true);
  end if;
  if (select count(*) from public.status_subscribers where page_id = p.id) >= 500 then return jsonb_build_object('ok', false, 'message', 'Les abonnements à cette page sont complets.'); end if;
  if (select count(*) from public.status_subscribers where created_at > now() - interval '1 hour') >= 100 then return jsonb_build_object('ok', false, 'message', 'Réessaie dans un moment.'); end if;
  begin
    perform public.nx_email_quota(1);
  exception when others then
    return jsonb_build_object('ok', false, 'message', 'Réessaie plus tard.');
  end;
  v_token := md5(random()::text || clock_timestamp()::text || v_email);
  insert into public.status_subscribers (page_id, email, token) values (p.id, v_email, v_token)
  on conflict (page_id, email) do update set token = excluded.token, created_at = now();
  select value #>> '{}' into v_web from public.app_config where key = 'web_url';
  v_web := coalesce(nullif(v_web, ''), 'https://nexora.abrahamtogbonon0.workers.dev/');
  v_link := v_web || 'status/?p=' || p.slug || '&confirm=' || v_token;
  v_id := public.nx_brevo_post(v_email, '', 'Confirme ton abonnement : ' || p.title,
    '<div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:28px 24px;color:#1d1d1f"><h1 style="font-size:20px;margin:0 0 12px">' || public.nx_html(p.title) || '</h1>'
    || '<p style="font-size:15px;line-height:1.55;color:#3a3a3c">Confirme ton adresse pour être prévenu des incidents et de leur résolution.</p>'
    || '<a href="' || public.nx_html(v_link) || '" style="display:inline-block;background:#1d1d1f;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;font-size:14px">Confirmer mon abonnement</a>'
    || '<p style="font-size:12px;color:#6e6e73;margin-top:24px">Si tu n’as rien demandé, ignore ce message.</p></div>',
    'Confirme ton abonnement : ' || v_link, 'statut', null);
  if v_id is not null then insert into public.nx_email_log (user_id, request_id, kind, to_email) values (null, v_id, 'statut', v_email); end if;
  return jsonb_build_object('ok', true);
end
$$;

create or replace function public.nx_status_confirm(p_token text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_slug text;
begin
  update public.status_subscribers s set confirmed_at = coalesce(confirmed_at, now()) where token = p_token returning (select slug from public.status_pages where id = s.page_id) into v_slug;
  return jsonb_build_object('ok', v_slug is not null, 'slug', v_slug);
end
$$;

create or replace function public.nx_status_unsubscribe(p_token text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.status_subscribers where token = p_token;
  return jsonb_build_object('ok', true);
end
$$;

-- 12. Visiteurs réels : collecte (sans compte, par la clé du site) et synthèse (équipe).
create or replace function public.nx_rum_collect(p_key text, p_origin text, p_events jsonb)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  s public.rum_sites;
  e jsonb;
  v_n integer := 0;
  v_path text;
begin
  select * into s from public.rum_sites where key = p_key;
  if not found or jsonb_typeof(p_events) <> 'array' then return 0; end if;
  if array_length(s.origins, 1) > 0 and not (lower(coalesce(p_origin, '')) = any (select lower(o) from unnest(s.origins) o)) then return 0; end if;
  if not public.nx_org_perm(s.org_id, 'api_sdk') then return 0; end if;
  if (select count(*) from public.rum_events where site_id = s.id and at > now() - interval '1 minute') > 1200 then return 0; end if;
  for e in select * from jsonb_array_elements(p_events) limit 20 loop
    v_path := left(split_part(split_part(coalesce(e ->> 'path', '/'), '?', 1), '#', 1), 200);
    insert into public.rum_events (site_id, org_id, path, device, lcp, inp, cls, fcp, ttfb, err, err_src)
    values (s.id, s.org_id, coalesce(nullif(v_path, ''), '/'),
      case when e ->> 'device' in ('mobile', 'tablet', 'desktop') then e ->> 'device' else 'desktop' end,
      least(120000, greatest(0, nullif(e ->> 'lcp', '')::numeric))::int, least(60000, greatest(0, nullif(e ->> 'inp', '')::numeric))::int,
      least(10, greatest(0, nullif(e ->> 'cls', '')::numeric)), least(120000, greatest(0, nullif(e ->> 'fcp', '')::numeric))::int,
      least(120000, greatest(0, nullif(e ->> 'ttfb', '')::numeric))::int, left(e ->> 'err', 300), left(e ->> 'src', 200));
    v_n := v_n + 1;
  end loop;
  return v_n;
exception when others then
  return v_n;
end
$$;

create or replace function public.rum_summary(p_site uuid, p_hours integer default 168)
returns jsonb
language sql stable security invoker set search_path = public
as $$
  with ev as (select * from public.rum_events where site_id = p_site and at > now() - make_interval(hours => least(2160, greatest(1, p_hours)))),
  views as (select * from ev where err is null)
  select jsonb_build_object(
    'views', (select count(*) from views),
    'errors_total', (select count(*) from ev where err is not null),
    'p75', jsonb_build_object(
      'lcp', (select percentile_cont(0.75) within group (order by lcp) from views where lcp is not null),
      'inp', (select percentile_cont(0.75) within group (order by inp) from views where inp is not null),
      'cls', (select percentile_cont(0.75) within group (order by cls) from views where cls is not null),
      'ttfb', (select percentile_cont(0.75) within group (order by ttfb) from views where ttfb is not null)),
    'pages', (select coalesce(jsonb_agg(x order by (x ->> 'lcp')::numeric desc nulls last), '[]'::jsonb) from (
      select jsonb_build_object('path', path, 'views', count(*), 'lcp', percentile_cont(0.75) within group (order by lcp), 'inp', percentile_cont(0.75) within group (order by inp), 'cls', percentile_cont(0.75) within group (order by cls)) x
      from views group by path order by count(*) desc limit 8) t),
    'devices', (select coalesce(jsonb_agg(jsonb_build_object('device', device, 'views', n, 'lcp', lcp) order by n desc), '[]'::jsonb) from (
      select device, count(*) n, percentile_cont(0.75) within group (order by lcp) lcp from views group by device) d),
    'errors', (select coalesce(jsonb_agg(jsonb_build_object('message', err, 'source', src, 'path', path, 'count', n) order by n desc), '[]'::jsonb) from (
      select err, max(err_src) src, max(path) path, count(*) n from ev where err is not null group by err order by count(*) desc limit 8) r),
    'series', (select coalesce(jsonb_agg(jsonb_build_object('t', h, 'lcp', lcp) order by h), '[]'::jsonb) from (
      select date_trunc('hour', at) h, percentile_cont(0.75) within group (order by lcp) lcp from views where lcp is not null group by 1) s)
  );
$$;

create or replace function public.nx_rum_cleanup()
returns void
language sql security definer set search_path = public
as $$
  delete from public.rum_events where at < now() - interval '31 days';
  delete from public.monitor_events where at < now() - interval '400 days';
  delete from public.monitor_maintenance where recur = 'none' and ends_at < now() - interval '90 days';
  delete from public.status_subscribers where confirmed_at is null and created_at < now() - interval '7 days';
$$;

-- 13. Heures calmes : les e-mails des alertes non critiques ne partent pas pendant la plage choisie.
create or replace function public.nx_notification_email()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_cfg jsonb;
  v_email text;
  v_name text;
  v_pref public.nx_alert_prefs;
  v_tz text;
  v_hour integer;
begin
  select value into v_cfg from public.app_config where key = 'email_alerts';
  if coalesce((v_cfg ->> 'enabled')::boolean, false) is not true then return new; end if;
  select u.email, coalesce(p.full_name, ''), nullif(p.timezone, '') into v_email, v_name, v_tz
  from auth.users u left join public.profiles p on p.id = u.id
  where u.id = new.user_id;
  select * into v_pref from public.nx_alert_prefs where user_id = new.user_id;
  if v_pref.quiet_from is not null and v_pref.quiet_to is not null and v_pref.quiet_from <> v_pref.quiet_to
    and new.title !~* '(hors ligne|expiré|escalade)' then
    begin
      v_hour := extract(hour from now() at time zone coalesce(v_tz, 'Europe/Paris'))::int;
    exception when others then
      v_hour := extract(hour from now() at time zone 'Europe/Paris')::int;
    end;
    if (v_pref.quiet_from < v_pref.quiet_to and v_hour >= v_pref.quiet_from and v_hour < v_pref.quiet_to)
      or (v_pref.quiet_from > v_pref.quiet_to and (v_hour >= v_pref.quiet_from or v_hour < v_pref.quiet_to)) then
      return new;
    end if;
  end if;
  begin
    perform public.nx_brevo_send(v_email, v_name, new.title, new.body);
  exception when others then
    raise warning 'NEXORA : alerte e-mail non envoyée (%).', sqlerrm;
  end;
  return new;
end
$$;

-- 14. Rapport mensuel par e-mail (offre Standard, propriétaire et administrateurs de l'équipe).
create or replace function public.nx_monitor_monthly_report()
returns integer
language plpgsql security definer set search_path = public, extensions
as $$
declare
  o record;
  u record;
  v_from timestamptz := date_trunc('month', now()) - interval '1 month';
  v_to timestamptz := date_trunc('month', now());
  v_rows text;
  v_html text;
  v_n integer := 0;
  v_id bigint;
  v_month text;
  v_months text[] := array['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
begin
  v_month := v_months[extract(month from v_from)::int] || ' ' || extract(year from v_from)::int;
  for o in select distinct m.org_id from public.monitors m where m.kind <> 'heartbeat' or m.kind = 'heartbeat' loop
    if not public.nx_org_perm(o.org_id, 'alerts') then continue; end if;
    select string_agg('<tr><td style="padding:8px;border-bottom:1px solid #ececf0"><b>' || public.nx_html(coalesce(nullif(m.name, ''), m.url)) || '</b></td>'
      || '<td style="padding:8px;border-bottom:1px solid #ececf0;text-align:right">' || coalesce(to_char(a.avail, 'FM990.00') || ' %', '—') || '</td>'
      || '<td style="padding:8px;border-bottom:1px solid #ececf0;text-align:right">' || to_char(m.slo, 'FM990.0##') || ' %' || case when a.avail is null then '' when a.avail >= m.slo then ' ✓' else ' ✗' end || '</td>'
      || '<td style="padding:8px;border-bottom:1px solid #ececf0;text-align:right">' || coalesce(a.p95::text || ' ms', '—') || '</td>'
      || '<td style="padding:8px;border-bottom:1px solid #ececf0;text-align:right">' || coalesce(i.n, 0) || '</td></tr>', '' order by m.name)
    into v_rows
    from public.monitors m
    left join lateral (select round(100.0 * sum(h.ok) / nullif(sum(h.n), 0), 2) avail, round(avg(h.p95))::int p95 from public.monitor_hourly h where h.monitor_id = m.id and h.hour >= v_from and h.hour < v_to) a on true
    left join lateral (select count(*) n from public.monitor_incidents x where x.monitor_id = m.id and x.started_at >= v_from and x.started_at < v_to) i on true
    where m.org_id = o.org_id and m.kind in ('http', 'api', 'heartbeat');
    if v_rows is null then continue; end if;
    v_html := '<div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto;padding:28px 24px;color:#1d1d1f">'
      || '<div style="font-size:13px;font-weight:600;color:#6e6e73">NEXORA · Supervision</div><h1 style="font-size:20px;margin:6px 0 16px">Rapport de disponibilité · ' || v_month || '</h1>'
      || '<table style="width:100%;border-collapse:collapse;font-size:13px"><tr style="color:#6e6e73;font-size:11px;text-transform:uppercase"><th style="text-align:left;padding:6px 8px">Site</th><th style="text-align:right;padding:6px 8px">Disponibilité</th><th style="text-align:right;padding:6px 8px">Objectif</th><th style="text-align:right;padding:6px 8px">p95</th><th style="text-align:right;padding:6px 8px">Incidents</th></tr>'
      || v_rows || '</table><p style="font-size:12px;color:#6e6e73;margin-top:22px">Détail et rapport PDF dans NEXORA → Sécurité → Supervision → Planning.</p></div>';
    for u in select au.email, coalesce(p.full_name, '') full_name from public.organization_members om join auth.users au on au.id = om.user_id left join public.profiles p on p.id = om.user_id
             where om.org_id = o.org_id and om.role in ('owner', 'admin') loop
      begin
        perform public.nx_email_quota(1);
      exception when others then
        return v_n;
      end;
      v_id := public.nx_brevo_post(u.email, u.full_name, 'Rapport de disponibilité · ' || v_month, v_html, 'Rapport de disponibilité · ' || v_month, 'rapport', null);
      if v_id is not null then insert into public.nx_email_log (user_id, request_id, kind, to_email) values (null, v_id, 'rapport', u.email); v_n := v_n + 1; end if;
    end loop;
  end loop;
  return v_n;
end
$$;

-- 15. Droits d'exécution.
revoke all on function public.nx_monitor_in_maint(public.monitors), public.nx_monitor_webhooks(public.monitors, text, text, text, boolean),
  public.nx_status_broadcast(public.monitors, text, text), public.nx_monitor_event(public.monitors, text, text, text, text),
  public.nx_monitor_escalate(public.monitors, public.monitor_incidents, text), public.nx_monitor_monthly_report(), public.nx_rum_cleanup(),
  public.nx_probe_secret_ok(text), public.nx_probe_secret_init(), public.nx_monitor_defaults(), public.nx_check_org_perm(),
  public.nx_monitor_notify(public.monitors, text, text), public.nx_monitor_record(uuid, timestamptz, boolean, integer, integer, text),
  public.collect_monitor_results(), public.run_monitor_checks(), public.nx_notification_email() from public, anon, authenticated;
grant execute on function public.nx_probe_secret_init() to authenticated;
grant execute on function public.nx_heartbeat_ping(text), public.nx_deploy_mark(text, text, text), public.nx_status_page(text),
  public.nx_status_subscribe(text, text), public.nx_status_confirm(text), public.nx_status_unsubscribe(text),
  public.nx_rum_collect(text, text, jsonb), public.nx_probe_jobs(text), public.nx_probe_report(text, jsonb) to anon, authenticated;
grant execute on function public.nx_monitor_hook_token(uuid), public.rum_summary(uuid, integer), public.nx_org_perm(uuid, text) to authenticated;
revoke execute on function public.nx_monitor_hook_token(uuid), public.rum_summary(uuid, integer), public.nx_org_perm(uuid, text) from anon;

-- 16. Conseiller de performance (A-024) : index en double, clés étrangères sans index des tables de la
-- supervision, politiques qui réévaluent auth.uid() à chaque ligne.
do $$
begin
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'monitor_checks_monitor_idx')
    and exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'monitor_checks_monitor_at') then
    drop index public.monitor_checks_monitor_at;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'monitors' and column_name = 'project_id') then
    create index if not exists monitors_project_id on public.monitors (project_id);
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'monitors' and column_name = 'created_by') then
    create index if not exists monitors_created_by on public.monitors (created_by);
  end if;
  if to_regclass('public.app_insights_apps') is not null then
    drop policy if exists "app_insights_apps_owner" on public.app_insights_apps;
    create policy "app_insights_apps_owner" on public.app_insights_apps for all to authenticated using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
  end if;
  if to_regclass('public.app_insights_events') is not null then
    drop policy if exists "app_insights_events_owner_read" on public.app_insights_events;
    create policy "app_insights_events_owner_read" on public.app_insights_events for select to authenticated using (exists (select 1 from public.app_insights_apps a where a.id = app and a.owner = (select auth.uid())));
    drop policy if exists "app_insights_events_owner_delete" on public.app_insights_events;
    create policy "app_insights_events_owner_delete" on public.app_insights_events for delete to authenticated using (exists (select 1 from public.app_insights_apps a where a.id = app and a.owner = (select auth.uid())));
  end if;
  if to_regclass('public.invoices') is not null then
    drop policy if exists invoices_customer_select on public.invoices;
    create policy invoices_customer_select on public.invoices for select to authenticated using (
      number is not null and (user_id = (select auth.uid()) or exists (
        select 1 from public.organization_members m where m.org_id = invoices.org_id and m.user_id = (select auth.uid()) and m.role in ('owner', 'admin'))));
  end if;
end
$$;
create index if not exists monitor_checks_org on public.monitor_checks (org_id);
create index if not exists monitor_incidents_ack_by on public.monitor_incidents (ack_by);
create index if not exists monitor_requests_monitor on public.monitor_requests (monitor_id);

-- 17. Tâches planifiées.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where command ilike '%nx_monitor_monthly_report%') then
      perform cron.schedule('nexora-monitor-monthly', '15 7 1 * *', 'select public.nx_monitor_monthly_report()');
    end if;
    if not exists (select 1 from cron.job where command ilike '%nx_rum_cleanup%') then
      perform cron.schedule('nexora-rum-cleanup', '55 3 * * *', 'select public.nx_rum_cleanup()');
    end if;
  end if;
end
$$;
