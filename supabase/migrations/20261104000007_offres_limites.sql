-- NEXORA #037 : offres Gratuit (0 $), Standard (10 $) et Pro (25 $) par mois.
-- Les limites (nombres) et les permissions (fonctions incluses) de chaque offre sont lues par le serveur :
--   * nx_plan_status    : offre, limites, permissions et consommation de l'utilisateur et d'un espace ;
--   * nx_use_feature    : autorise une fonction réservée et consomme son quota de façon atomique ;
--   * nx_app_claim / nx_app_status / nx_app_release : applications de l'App Builder ; en offre Gratuite,
--     2 applications au plus, créées depuis une adresse web accessible, essai de 7 jours chacune ;
--   * déclencheurs de limite sur les projets, documents NEX-DESIGN, sites surveillés, membres et fichiers.
-- Offre effective d'un utilisateur : la meilleure offre active parmi ses espaces (personnel ou équipes).
-- Les administrateurs de NEXORA ne sont pas limités.
-- Idempotente : peut être appliquée plusieurs fois. Les offres ne sont créées qu'au premier passage (la ligne
-- « standard » sert de repère) : les réglages faits ensuite dans le back office sont conservés.

-- ---------- 1. Offres ----------
alter table public.plans add column if not exists perms jsonb not null default '{}'::jsonb;
alter table public.plans add column if not exists badge text not null default '';

do $$
declare
  v_free_perms jsonb := '{
    "responsive": true, "browser": true, "multiscreen": true, "dashboard": true,
    "design_extended": false, "design_full": false, "responsive_advanced": false,
    "source_import": false, "apk": false, "pwa": false, "play_publish": false,
    "crawler": false, "audits_advanced": false, "devlab": false, "desktop_builder": false,
    "push": false, "inapp": false, "alerts": false, "projects_management": false,
    "standard_support": false, "studio_advanced": false, "transform_extended": false,
    "projects_multi": false, "notifications_advanced": false, "messaging_events": false,
    "automation": false, "custom_notifications": false, "api_sdk": false, "integrations": false,
    "priority_support": false, "early_access": false
  }'::jsonb;
  v_standard_perms jsonb;
  v_pro_perms jsonb;
begin
  if exists (select 1 from public.plans where id = 'standard') then return; end if;
  v_standard_perms := v_free_perms || '{
    "design_extended": true, "responsive_advanced": true, "source_import": true, "apk": true, "pwa": true,
    "play_publish": true, "crawler": true, "audits_advanced": true, "devlab": true, "desktop_builder": true,
    "push": true, "inapp": true, "alerts": true, "projects_management": true, "standard_support": true
  }'::jsonb;
  select jsonb_object_agg(key, true) into v_pro_perms from jsonb_each(v_free_perms);

  insert into public.plans (id, name, description, price_month_cents, price_year_cents, currency, sort, active, limits, features, perms, badge)
  values
    ('free', 'Gratuit', 'Découvre NEXORA et teste tes premières applications.', 0, 0, 'USD', 1, true,
      '{"projects": 3, "designs": 3, "members": 1, "monitors": 1, "storage_mb": 200, "apps": 2, "app_trial_days": 7,
        "ai_requests_month": 30, "scans_per_day": 3, "crawls_per_day": 0, "builds_month": 0, "push_month": 0}'::jsonb,
      '["NEX-DESIGN limité (3 documents)", "2 applications créées depuis une adresse web, essai de 7 jours chacune",
        "Responsive Design et prévisualisation multi-écrans", "Browser : navigation et consultation de sites",
        "Tableau de bord", "30 requêtes IA par mois, 3 audits de sécurité par jour"]'::jsonb,
      v_free_perms, ''),
    ('standard', 'Standard', 'Pour créer, importer et publier tes projets.', 1000, 10000, 'USD', 2, true,
      '{"projects": 25, "designs": 50, "members": 3, "monitors": 10, "storage_mb": 5120, "apps": 10, "app_trial_days": 0,
        "ai_requests_month": 500, "scans_per_day": 30, "crawls_per_day": 20, "builds_month": 60, "push_month": 10000}'::jsonb,
      '["Tout le Gratuit, sans limite d’essai", "Import de projets web et de code source",
        "Génération Android et APK (60 constructions par mois)", "NEX-DESIGN étendu (50 documents)",
        "Responsive avancé, Crawler et audits avancés", "Dev Lab, Desktop Builder et prévisualisation",
        "500 requêtes IA par mois", "Notifications push et in-app, alertes et rappels",
        "Gestion de projets (25 projets, 3 membres)", "Assistance standard"]'::jsonb,
      v_standard_perms, 'Le plus choisi'),
    ('pro', 'Pro', 'Toute la puissance de NEXORA, sans compromis.', 2500, 25000, 'USD', 3, true,
      '{"projects": 200, "designs": -1, "members": 10, "monitors": 50, "storage_mb": 51200, "apps": 50, "app_trial_days": 0,
        "ai_requests_month": 3000, "scans_per_day": 200, "crawls_per_day": 150, "builds_month": 400, "push_month": 100000}'::jsonb,
      '["Tout Standard", "NEX-DESIGN complet, documents illimités",
        "Création et transformation étendues (400 constructions par mois)", "Projets multiples (200 projets, 10 membres)",
        "3 000 requêtes IA par mois", "Studio 3D avancé",
        "Notifications avancées et personnalisées, événements de messagerie", "Automatisations",
        "API, SDK et outils d’intégration", "Support prioritaire et accès en avant-première aux nouveautés"]'::jsonb,
      v_pro_perms, 'Tout inclus')
  on conflict (id) do update set
    name = excluded.name, description = excluded.description, price_month_cents = excluded.price_month_cents,
    price_year_cents = excluded.price_year_cents, currency = excluded.currency, sort = excluded.sort, active = true,
    limits = excluded.limits, features = excluded.features, perms = excluded.perms, badge = excluded.badge, updated_at = now();

  -- Anciennes offres Équipe et Entreprise : retirées de la vente, gardées pour l'historique (clés étrangères) ;
  -- les espaces abonnés passent à Pro.
  update public.plans set active = false, perms = v_pro_perms, sort = sort + 10, updated_at = now() where id in ('team', 'enterprise');
  update public.subscriptions set plan_id = 'pro', updated_at = now() where plan_id in ('team', 'enterprise');
end
$$;

-- ---------- 2. Offre effective, limites et permissions ----------
create or replace function public.nx_org_plan(p_org uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select s.plan_id from public.subscriptions s
    where s.org_id = p_org and s.status in ('active', 'trialing', 'past_due')
      and (s.current_period_end is null or s.current_period_end > now() - interval '3 days')
    order by s.created_at desc limit 1
  ), 'free');
$$;

create or replace function public.nx_plan_rank(p_plan text)
returns integer
language sql stable security definer set search_path = public
as $$
  select coalesce((select p.price_month_cents from public.plans p where p.id = p_plan), 0);
$$;

-- Meilleure offre parmi les espaces de l'utilisateur ; org_id : l'espace qui la fournit (quotas comptés sur lui).
create or replace function public.nx_user_plan(p_uid uuid)
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

-- Limite d'une offre : -1 = illimité (clé absente comprise).
create or replace function public.nx_limit(p_plan text, p_key text)
returns integer
language sql stable security definer set search_path = public
as $$
  select coalesce((select (p.limits ->> p_key)::integer from public.plans p where p.id = p_plan), -1);
$$;

create or replace function public.nx_perm(p_plan text, p_key text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select (p.perms ->> p_key)::boolean from public.plans p where p.id = p_plan), false);
$$;

-- Catalogue des fonctions contrôlées : permission requise, quota consommé et sa période.
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
    ('ai', null, 'ai_requests_month', 'month', 'L’assistant IA')
  ) r(f, perm, metric, per, label)
  where r.f = p_feature;
$$;

-- Offre la moins chère qui inclut une permission ou un quota non nul.
create or replace function public.nx_plan_needed(p_perm text, p_metric text)
returns text
language sql stable security definer set search_path = public
as $$
  select p.id from public.plans p
  where p.active
    and (p_perm is null or coalesce((p.perms ->> p_perm)::boolean, false))
    and (p_metric is null or coalesce((p.limits ->> p_metric)::integer, -1) <> 0)
  order by p.price_month_cents, p.sort limit 1;
$$;

create or replace function public.nx_plan_label(p_plan text)
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce((select p.name from public.plans p where p.id = p_plan), p_plan);
$$;

-- ---------- 3. Quotas consommés ----------
-- subject_id : espace qui fournit l'offre (ou l'utilisateur sans espace). period_start : jour ou 1er du mois (UTC).
create table if not exists public.nx_quota_usage (
  subject_id uuid not null,
  metric text not null,
  period_start date not null,
  value integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (subject_id, metric, period_start)
);
alter table public.nx_quota_usage enable row level security;
drop policy if exists "nx_quota_usage_read" on public.nx_quota_usage;
create policy "nx_quota_usage_read" on public.nx_quota_usage for select to authenticated
  using (subject_id = auth.uid() or public.nx_can_read_org(subject_id));
revoke all on public.nx_quota_usage from anon;
revoke insert, update, delete on public.nx_quota_usage from authenticated;
grant select on public.nx_quota_usage to authenticated;

create or replace function public.nx_period(p_per text)
returns date
language sql stable
as $$
  select case when p_per = 'day' then (now() at time zone 'utc')::date
    else date_trunc('month', now() at time zone 'utc')::date end;
$$;

create or replace function public.nx_metric_period(p_metric text)
returns text
language sql immutable
as $$
  select case when p_metric like '%_per_day' then 'day' else 'month' end;
$$;

-- Autorise une fonction et consomme son quota. p_check_only : vérifie sans consommer.
-- Réponse : { ok, plan, plan_name, remaining } ou { ok: false, reason: auth|plan|quota|unknown, need, need_name, message }.
create or replace function public.nx_use_feature(p_feature text, p_amount integer default 1, p_check_only boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rule record;
  v_plan text;
  v_org uuid;
  v_subject uuid;
  v_limit integer;
  v_used integer;
  v_amount integer := greatest(1, least(coalesce(p_amount, 1), 100));
  v_period date;
  v_need text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth', 'need', 'free', 'need_name', public.nx_plan_label('free'),
      'message', 'Connecte-toi à ton compte NEXORA (gratuit) pour utiliser cette fonction.');
  end if;
  select * into v_rule from public.nx_feature_rule(p_feature);
  if v_rule.label is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown', 'message', 'Cette fonction n’est pas disponible.');
  end if;
  select u.plan_id, u.org_id into v_plan, v_org from public.nx_user_plan(v_uid) u;
  v_plan := coalesce(v_plan, 'free');
  v_subject := coalesce(v_org, v_uid);
  if public.nx_is_admin() then
    return jsonb_build_object('ok', true, 'plan', v_plan, 'plan_name', public.nx_plan_label(v_plan), 'admin', true, 'remaining', -1);
  end if;
  if v_rule.perm is not null and not public.nx_perm(v_plan, v_rule.perm) then
    v_need := public.nx_plan_needed(v_rule.perm, v_rule.metric);
    return jsonb_build_object('ok', false, 'reason', 'plan', 'plan', v_plan, 'plan_name', public.nx_plan_label(v_plan),
      'need', v_need, 'need_name', public.nx_plan_label(v_need), 'feature', p_feature,
      'message', format('%s fait partie de l’offre %s. Ton offre actuelle : %s.', v_rule.label, public.nx_plan_label(coalesce(v_need, 'pro')), public.nx_plan_label(v_plan)));
  end if;
  if v_rule.metric is null then
    return jsonb_build_object('ok', true, 'plan', v_plan, 'plan_name', public.nx_plan_label(v_plan), 'remaining', -1);
  end if;
  v_limit := public.nx_limit(v_plan, v_rule.metric);
  v_period := public.nx_period(v_rule.per);
  if v_limit = 0 then
    v_need := public.nx_plan_needed(v_rule.perm, v_rule.metric);
    return jsonb_build_object('ok', false, 'reason', 'plan', 'plan', v_plan, 'plan_name', public.nx_plan_label(v_plan),
      'need', v_need, 'need_name', public.nx_plan_label(v_need), 'feature', p_feature,
      'message', format('%s n’est pas inclus dans l’offre %s : passe à l’offre %s.', v_rule.label, public.nx_plan_label(v_plan), public.nx_plan_label(coalesce(v_need, 'pro'))));
  end if;
  if v_limit > 0 then
    select q.value into v_used from public.nx_quota_usage q
      where q.subject_id = v_subject and q.metric = v_rule.metric and q.period_start = v_period;
    v_used := coalesce(v_used, 0);
    if v_used + v_amount > v_limit then
      v_need := (select p.id from public.plans p where p.active and p.price_month_cents > public.nx_plan_rank(v_plan)
        order by p.price_month_cents limit 1);
      return jsonb_build_object('ok', false, 'reason', 'quota', 'plan', v_plan, 'plan_name', public.nx_plan_label(v_plan),
        'need', v_need, 'need_name', public.nx_plan_label(v_need), 'feature', p_feature, 'limit', v_limit, 'used', v_used,
        'message', format('Quota atteint pour %s : %s sur %s %s avec l’offre %s.', lower(left(v_rule.label, 1)) || substr(v_rule.label, 2), v_used, v_limit,
          case when v_rule.per = 'day' then 'aujourd’hui' else 'ce mois-ci' end, public.nx_plan_label(v_plan)));
    end if;
    if p_check_only then
      return jsonb_build_object('ok', true, 'plan', v_plan, 'plan_name', public.nx_plan_label(v_plan), 'limit', v_limit, 'used', v_used, 'remaining', v_limit - v_used);
    end if;
    -- Consommation atomique : la ligne est verrouillée par ON CONFLICT ; le plafond est revérifié au moment d'écrire.
    insert into public.nx_quota_usage as q (subject_id, metric, period_start, value)
      values (v_subject, v_rule.metric, v_period, v_amount)
      on conflict (subject_id, metric, period_start) do update set value = q.value + excluded.value, updated_at = now()
      where q.value + excluded.value <= v_limit
      returning q.value into v_used;
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'quota', 'plan', v_plan, 'plan_name', public.nx_plan_label(v_plan), 'feature', p_feature,
        'limit', v_limit, 'message', format('Quota atteint avec l’offre %s.', public.nx_plan_label(v_plan)));
    end if;
    return jsonb_build_object('ok', true, 'plan', v_plan, 'plan_name', public.nx_plan_label(v_plan), 'limit', v_limit, 'used', v_used, 'remaining', v_limit - v_used);
  end if;
  -- Illimité : on compte quand même (statistiques du back office).
  if not p_check_only then
    insert into public.nx_quota_usage as q (subject_id, metric, period_start, value)
      values (v_subject, v_rule.metric, v_period, v_amount)
      on conflict (subject_id, metric, period_start) do update set value = q.value + excluded.value, updated_at = now();
  end if;
  return jsonb_build_object('ok', true, 'plan', v_plan, 'plan_name', public.nx_plan_label(v_plan), 'remaining', -1);
end
$$;

-- ---------- 4. Applications de l'App Builder (essai de l'offre Gratuite) ----------
create table if not exists public.nx_app_trials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete set null,
  local_id text not null,
  name text not null default '',
  source_kind text not null default 'url' check (source_kind in ('url', 'folder', 'project')),
  source_url text,
  plan_at_creation text not null default 'free',
  created_at timestamptz not null default now(),
  trial_ends_at timestamptz,
  deleted_at timestamptz,
  unique (user_id, local_id)
);
create index if not exists nx_app_trials_user on public.nx_app_trials (user_id, created_at desc);
alter table public.nx_app_trials enable row level security;
drop policy if exists "nx_app_trials_read" on public.nx_app_trials;
create policy "nx_app_trials_read" on public.nx_app_trials for select to authenticated
  using (user_id = auth.uid() or public.nx_is_admin());
revoke all on public.nx_app_trials from anon;
revoke insert, update, delete on public.nx_app_trials from authenticated;
grant select on public.nx_app_trials to authenticated;

-- Adresse publique accessible : http(s), nom de domaine avec point, ni localhost ni adresse privée.
create or replace function public.nx_public_url(p_url text)
returns boolean
language plpgsql immutable
as $$
declare
  v_host text;
begin
  if p_url is null or p_url !~* '^https?://[^[:space:]/?#]+([/?#][^[:space:]]*)?$' then return false; end if;
  v_host := lower(substring(p_url from '^https?://(?:[^@/]*@)?([^:/?#]+)'));
  if v_host is null or position('.' in v_host) = 0 then return false; end if;
  if v_host ~ '^(localhost|.*\.local|.*\.internal|.*\.localhost)$' then return false; end if;
  if v_host ~ '^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)' then return false; end if;
  return v_host ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$';
end
$$;

-- État d'une application pour l'offre actuelle : active (offre payante ou administrateur), trial (essai en cours),
-- expired (essai terminé) ou plan (créée avec une offre payante qui n'est plus active).
create or replace function public.nx_app_state(p_row public.nx_app_trials, p_plan text, p_admin boolean)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_status text;
  v_trial integer := public.nx_limit(p_plan, 'app_trial_days');
begin
  if p_admin or v_trial <= 0 then v_status := 'active';
  elsif p_row.trial_ends_at is null then v_status := 'plan';
  elsif p_row.trial_ends_at > now() then v_status := 'trial';
  else v_status := 'expired';
  end if;
  return jsonb_build_object('ok', true, 'local_id', p_row.local_id, 'name', p_row.name, 'source_kind', p_row.source_kind,
    'status', v_status, 'created_at', p_row.created_at, 'trial_ends_at', p_row.trial_ends_at,
    'days_left', case when v_status = 'trial' then greatest(0, ceil(extract(epoch from (p_row.trial_ends_at - now())) / 86400))::integer else null end,
    'deleted', p_row.deleted_at is not null);
end
$$;

create or replace function public.nx_app_claim(p_local_id text, p_name text default '', p_source_kind text default 'url', p_url text default null, p_org uuid default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_local text := left(trim(coalesce(p_local_id, '')), 80);
  v_kind text := case when p_source_kind in ('url', 'folder', 'project') then p_source_kind else 'url' end;
  v_row public.nx_app_trials;
  v_plan text;
  v_org uuid;
  v_admin boolean := public.nx_is_admin();
  v_trial integer;
  v_limit integer;
  v_count integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth', 'message', 'Connecte-toi à ton compte NEXORA (gratuit) pour créer une application.');
  end if;
  if v_local = '' then raise exception 'Identifiant d’application manquant.'; end if;
  select u.plan_id, u.org_id into v_plan, v_org from public.nx_user_plan(v_uid) u;
  v_plan := coalesce(v_plan, 'free');
  v_trial := public.nx_limit(v_plan, 'app_trial_days');
  v_limit := public.nx_limit(v_plan, 'apps');
  -- Offre sans import de code : l'application vient forcément d'une adresse web publique.
  if not v_admin and not public.nx_perm(v_plan, 'source_import') then
    if v_kind <> 'url' then
      return jsonb_build_object('ok', false, 'reason', 'source', 'plan', v_plan, 'need', public.nx_plan_needed('source_import', null),
        'need_name', public.nx_plan_label(public.nx_plan_needed('source_import', null)),
        'message', format('Avec l’offre %s, une application se crée uniquement à partir de l’adresse d’un site accessible (https://…).', public.nx_plan_label(v_plan)));
    end if;
    if not public.nx_public_url(p_url) then
      return jsonb_build_object('ok', false, 'reason', 'url', 'plan', v_plan,
        'message', 'Indique l’adresse d’un site accessible sur Internet (https://…) : les adresses locales ne sont pas acceptées.');
    end if;
  end if;
  select * into v_row from public.nx_app_trials t where t.user_id = v_uid and t.local_id = v_local;
  if found then
    update public.nx_app_trials t set name = left(coalesce(nullif(p_name, ''), t.name), 120), source_kind = v_kind,
      source_url = left(coalesce(p_url, t.source_url), 2000), deleted_at = null
    where t.id = v_row.id returning * into v_row;
    return public.nx_app_state(v_row, v_plan, v_admin);
  end if;
  if not v_admin and v_limit >= 0 then
    if v_trial > 0 then
      -- Essais : toutes les applications d'essai créées comptent, même supprimées (pas de nouvel essai en recréant).
      select count(*) into v_count from public.nx_app_trials t where t.user_id = v_uid and t.trial_ends_at is not null;
    else
      select count(*) into v_count from public.nx_app_trials t where t.user_id = v_uid and t.deleted_at is null;
    end if;
    if v_count >= v_limit then
      return jsonb_build_object('ok', false, 'reason', 'quota', 'plan', v_plan, 'plan_name', public.nx_plan_label(v_plan), 'limit', v_limit, 'used', v_count,
        'need', (select p.id from public.plans p where p.active and p.price_month_cents > public.nx_plan_rank(v_plan) order by p.price_month_cents limit 1),
        'message', case when v_trial > 0
          then format('Tu as déjà utilisé tes %s applications d’essai de l’offre %s. Passe à Standard pour créer d’autres applications, sans limite de durée.', v_limit, public.nx_plan_label(v_plan))
          else format('Ton offre %s permet %s applications. Supprime une application ou passe à une offre supérieure.', public.nx_plan_label(v_plan), v_limit) end);
    end if;
  end if;
  insert into public.nx_app_trials (user_id, org_id, local_id, name, source_kind, source_url, plan_at_creation, trial_ends_at)
  values (v_uid, coalesce(p_org, v_org), v_local, left(coalesce(p_name, ''), 120), v_kind, left(p_url, 2000), v_plan,
    case when not v_admin and v_trial > 0 then now() + make_interval(days => v_trial) else null end)
  returning * into v_row;
  return public.nx_app_state(v_row, v_plan, v_admin);
end
$$;

-- États des applications du compte (toutes, ou celles de la liste) et compteur des essais.
create or replace function public.nx_app_status(p_local_ids text[] default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_plan text;
  v_admin boolean := public.nx_is_admin();
  v_trial integer;
  v_apps jsonb;
  v_used integer;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'auth', 'apps', '{}'::jsonb); end if;
  select u.plan_id into v_plan from public.nx_user_plan(v_uid) u;
  v_plan := coalesce(v_plan, 'free');
  v_trial := public.nx_limit(v_plan, 'app_trial_days');
  select coalesce(jsonb_object_agg(t.local_id, public.nx_app_state(t, v_plan, v_admin)), '{}'::jsonb) into v_apps
  from public.nx_app_trials t
  where t.user_id = v_uid and (p_local_ids is null or t.local_id = any (p_local_ids));
  if v_trial > 0 then
    select count(*) into v_used from public.nx_app_trials t where t.user_id = v_uid and t.trial_ends_at is not null;
  else
    select count(*) into v_used from public.nx_app_trials t where t.user_id = v_uid and t.deleted_at is null;
  end if;
  return jsonb_build_object('ok', true, 'plan', v_plan, 'plan_name', public.nx_plan_label(v_plan), 'admin', v_admin,
    'trial_days', greatest(v_trial, 0), 'limit', case when v_admin then -1 else public.nx_limit(v_plan, 'apps') end, 'used', v_used,
    'source_import', v_admin or public.nx_perm(v_plan, 'source_import'), 'apps', v_apps);
end
$$;

-- Application supprimée dans l'App Builder : l'essai reste compté.
create or replace function public.nx_app_release(p_local_id text)
returns boolean
language sql security definer set search_path = public
as $$
  update public.nx_app_trials set deleted_at = now()
  where user_id = auth.uid() and local_id = left(trim(coalesce(p_local_id, '')), 80) and deleted_at is null
  returning true;
$$;

-- Back office : prolonger (ou raccourcir) l'essai d'une application.
create or replace function public.nx_app_trial_extend(p_id uuid, p_days integer)
returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare
  v_end timestamptz;
begin
  if not public.nx_is_admin() then raise exception 'Réservé aux administrateurs.'; end if;
  update public.nx_app_trials
    set trial_ends_at = greatest(now(), coalesce(trial_ends_at, now())) + make_interval(days => greatest(-365, least(coalesce(p_days, 7), 365)))
  where id = p_id returning trial_ends_at into v_end;
  if v_end is null then raise exception 'Application introuvable.'; end if;
  return v_end;
end
$$;

-- ---------- 5. Offre et usage (fenêtre Mon compte, back office, processus principal) ----------
create or replace function public.nx_plan_status(p_org uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := public.nx_is_admin();
  v_plan text;
  v_org uuid;
  v_view uuid;
  v_org_plan text;
  v_subject uuid;
  v_row public.plans;
  v_org_row public.plans;
  v_usage jsonb := '{}'::jsonb;
  v_quota jsonb := '{}'::jsonb;
  v_metric text;
  v_val integer;
begin
  if v_uid is null then raise exception 'Connexion requise.'; end if;
  if p_org is not null and not public.nx_can_read_org(p_org) then raise exception 'Accès refusé à cet espace.'; end if;
  select u.plan_id, u.org_id into v_plan, v_org from public.nx_user_plan(v_uid) u;
  v_plan := coalesce(v_plan, 'free');
  v_subject := coalesce(v_org, v_uid);
  v_view := coalesce(p_org, v_org);
  v_org_plan := case when v_view is null then 'free' else public.nx_org_plan(v_view) end;
  select * into v_row from public.plans where id = v_plan;
  select * into v_org_row from public.plans where id = v_org_plan;
  if v_view is not null then
    v_usage := jsonb_build_object(
      'projects', (select count(*) from public.projects where org_id = v_view),
      'designs', (select count(*) from public.design_documents where org_id = v_view and deleted_at is null),
      'monitors', (select count(*) from public.monitors where org_id = v_view),
      'members', (select count(*) from public.organization_members where org_id = v_view),
      'storage_mb', (select ceil(coalesce(sum(size_bytes), 0) / 1048576.0)::integer from public.assets where org_id = v_view));
  end if;
  foreach v_metric in array array['ai_requests_month', 'scans_per_day', 'crawls_per_day', 'builds_month', 'push_month'] loop
    select q.value into v_val from public.nx_quota_usage q
      where q.subject_id = v_subject and q.metric = v_metric and q.period_start = public.nx_period(public.nx_metric_period(v_metric));
    v_quota := v_quota || jsonb_build_object(v_metric, coalesce(v_val, 0));
    v_val := null;
  end loop;
  v_quota := v_quota || jsonb_build_object('apps', case when public.nx_limit(v_plan, 'app_trial_days') > 0
    then (select count(*) from public.nx_app_trials t where t.user_id = v_uid and t.trial_ends_at is not null)
    else (select count(*) from public.nx_app_trials t where t.user_id = v_uid and t.deleted_at is null) end);
  return jsonb_build_object(
    'plan', v_plan, 'plan_name', coalesce(v_row.name, v_plan), 'admin', v_admin, 'org_id', v_org,
    'view_org', v_view, 'org_plan', v_org_plan, 'org_plan_name', coalesce(v_org_row.name, v_org_plan),
    'limits', coalesce(v_row.limits, '{}'::jsonb), 'perms', coalesce(v_row.perms, '{}'::jsonb),
    'org_limits', coalesce(v_org_row.limits, '{}'::jsonb),
    'usage', v_usage || v_quota,
    'day', public.nx_period('day'), 'month', public.nx_period('month'),
    'checked_at', now());
end
$$;

-- ---------- 6. Limites des données de chaque espace (déclencheurs) ----------
create or replace function public.nx_check_org_limit()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_key text := tg_argv[0];
  v_plan text;
  v_limit integer;
  v_count bigint := 0;
  v_label text;
begin
  if public.nx_is_admin() or coalesce(current_setting('nx.skip_limits', true), '') = 'on' then return new; end if;
  -- Ligne déjà présente (synchronisation par upsert) : ce n'est pas un ajout. Tests imbriqués : chaque champ
  -- de NEW n'est lu que pour la table qui le possède.
  if v_key = 'projects' then
    if exists (select 1 from public.projects p where p.id = new.id
        or (new.local_key is not null and p.org_id = new.org_id and p.local_key = new.local_key)) then return new; end if;
  elsif v_key = 'designs' then
    if exists (select 1 from public.design_documents d where d.id = new.id
        or (new.local_id is not null and d.org_id = new.org_id and d.local_id = new.local_id)) then return new; end if;
  elsif v_key = 'members' then
    if exists (select 1 from public.organization_members m where m.org_id = new.org_id and m.user_id = new.user_id) then return new; end if;
  end if;
  v_plan := public.nx_org_plan(new.org_id);
  v_limit := public.nx_limit(v_plan, v_key);
  if v_limit < 0 then return new; end if;
  if v_key = 'projects' then
    select count(*) into v_count from public.projects where org_id = new.org_id; v_label := 'projets';
  elsif v_key = 'designs' then
    select count(*) into v_count from public.design_documents where org_id = new.org_id and deleted_at is null; v_label := 'documents NEX-DESIGN';
  elsif v_key = 'monitors' then
    select count(*) into v_count from public.monitors where org_id = new.org_id; v_label := 'sites surveillés';
  elsif v_key = 'members' then
    select count(*) into v_count from public.organization_members where org_id = new.org_id; v_label := 'membres';
  elsif v_key = 'storage_mb' then
    select ceil((coalesce(sum(size_bytes), 0) + coalesce(new.size_bytes, 0)) / 1048576.0) - 1 into v_count from public.assets where org_id = new.org_id;
    v_label := 'Mo de stockage';
  end if;
  if v_count >= v_limit then
    raise exception using errcode = 'P0001',
      message = format('Limite de ton offre %s atteinte : %s %s au maximum. Passe à une offre supérieure dans Mon compte → Offre et usage.', public.nx_plan_label(v_plan), v_limit, v_label),
      hint = 'nx_limit:' || v_key;
  end if;
  return new;
end
$$;

drop trigger if exists nx_limit_projects on public.projects;
create trigger nx_limit_projects before insert on public.projects for each row execute function public.nx_check_org_limit('projects');
drop trigger if exists nx_limit_designs on public.design_documents;
create trigger nx_limit_designs before insert on public.design_documents for each row execute function public.nx_check_org_limit('designs');
drop trigger if exists nx_limit_monitors on public.monitors;
create trigger nx_limit_monitors before insert on public.monitors for each row execute function public.nx_check_org_limit('monitors');
drop trigger if exists nx_limit_members on public.organization_members;
create trigger nx_limit_members before insert on public.organization_members for each row execute function public.nx_check_org_limit('members');
drop trigger if exists nx_limit_assets on public.assets;
create trigger nx_limit_assets before insert on public.assets for each row execute function public.nx_check_org_limit('storage_mb');

-- Invitations : refusées d'avance quand les membres et les invitations en attente atteignent la limite.
create or replace function public.nx_check_invite_limit()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_plan text := public.nx_org_plan(new.org_id);
  v_limit integer := public.nx_limit(v_plan, 'members');
  v_count bigint;
begin
  if public.nx_is_admin() or v_limit < 0 then return new; end if;
  select (select count(*) from public.organization_members where org_id = new.org_id)
       + (select count(*) from public.invitations where org_id = new.org_id and status = 'pending') into v_count;
  if v_count >= v_limit then
    raise exception using errcode = 'P0001',
      message = format('Ton offre %s permet %s membre%s par espace : passe à une offre supérieure pour inviter quelqu’un.', public.nx_plan_label(v_plan), v_limit, case when v_limit > 1 then 's' else '' end),
      hint = 'nx_limit:members';
  end if;
  return new;
end
$$;
drop trigger if exists nx_limit_invitations on public.invitations;
create trigger nx_limit_invitations before insert on public.invitations for each row execute function public.nx_check_invite_limit();

-- ---------- 7. Fonctions existantes soumises à l'offre ----------
-- Alertes de supervision par e-mail (migration 20261104000005) : offre Standard ou Pro.
create or replace function public.nx_alert_email(p_subject text, p_text text, p_kind text default 'alerte')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_name text;
  v_hour integer;
  v_day integer;
  v_kind text := case when p_kind = 'test' then 'test' else 'alerte' end;
  v_id bigint;
  v_plan text;
begin
  if v_uid is null then
    raise exception 'Connecte-toi à ton compte NEXORA pour recevoir les alertes par e-mail.';
  end if;
  select u.plan_id into v_plan from public.nx_user_plan(v_uid) u;
  if not public.nx_is_admin() and not public.nx_perm(coalesce(v_plan, 'free'), 'alerts') then
    raise exception 'Les alertes par e-mail font partie de l’offre Standard : avec l’offre %, elles restent affichées dans NEXORA.', public.nx_plan_label(coalesce(v_plan, 'free'));
  end if;
  select u.email, coalesce(p.full_name, '') into v_email, v_name
  from auth.users u left join public.profiles p on p.id = u.id
  where u.id = v_uid;
  if coalesce(v_email, '') = '' then
    raise exception 'Ton compte NEXORA n’a pas d’adresse e-mail.';
  end if;
  select count(*) filter (where created_at > now() - interval '1 hour'), count(*)
    into v_hour, v_day
  from public.nx_email_log
  where user_id = v_uid and created_at > now() - interval '1 day';
  if v_hour >= 20 or v_day >= 60 then
    raise exception 'Limite d’alertes e-mail atteinte (20 par heure, 60 par jour) : les suivantes restent dans NEXORA.';
  end if;
  v_id := public.nx_brevo_send(v_email, v_name, left(coalesce(nullif(p_subject, ''), 'Alerte NEXORA'), 200), left(coalesce(p_text, ''), 2000),
    case when v_kind = 'test' then 'Test' else 'Supervision' end);
  if v_id is null then
    raise exception 'Les alertes par e-mail sont momentanément indisponibles : elles restent affichées dans NEXORA.';
  end if;
  delete from public.nx_email_log where user_id = v_uid and created_at < now() - interval '30 days';
  insert into public.nx_email_log (user_id, request_id, kind) values (v_uid, v_id, v_kind);
  return jsonb_build_object('ok', true, 'id', v_id, 'to', v_email);
end
$$;

-- Statistiques et plantages des applications (SDK, migration 20261104000001) : offre Pro.
create or replace function public.app_insights_register(p_app_id text, p_name text default '')
returns table (id uuid, ingest_key text)
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_plan text;
begin
  if uid is null then raise exception 'Connexion requise.'; end if;
  select u.plan_id into v_plan from public.nx_user_plan(uid) u;
  if not public.nx_is_admin() and not public.nx_perm(coalesce(v_plan, 'free'), 'api_sdk') then
    raise exception 'Le SDK de statistiques et de plantages fait partie de l’offre Pro (offre actuelle : %).', public.nx_plan_label(coalesce(v_plan, 'free'));
  end if;
  return query
    insert into public.app_insights_apps as a (owner, app_id, name)
    values (uid, left(trim(p_app_id), 150), left(coalesce(p_name, ''), 120))
    on conflict (owner, app_id) do update set name = excluded.name
    returning a.id, a.ingest_key;
end
$$;

-- Support prioritaire (offre Pro) : un ticket créé par un compte Pro passe en priorité haute.
create or replace function public.nx_ticket_priority()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_plan text;
begin
  select u.plan_id into v_plan from public.nx_user_plan(new.user_id) u;
  if public.nx_perm(coalesce(v_plan, 'free'), 'priority_support') and new.priority in ('low', 'normal') then
    new.priority := 'high';
  end if;
  return new;
end
$$;
drop trigger if exists nx_priority_support on public.support_tickets;
create trigger nx_priority_support before insert on public.support_tickets for each row execute function public.nx_ticket_priority();

-- ---------- 8. Droits ----------
revoke all on function public.nx_org_plan(uuid) from public, anon;
revoke all on function public.nx_plan_rank(text) from public, anon;
revoke all on function public.nx_user_plan(uuid) from public, anon, authenticated;
revoke all on function public.nx_limit(text, text) from public, anon;
revoke all on function public.nx_perm(text, text) from public, anon;
revoke all on function public.nx_plan_needed(text, text) from public, anon;
revoke all on function public.nx_plan_label(text) from public, anon;
revoke all on function public.nx_app_state(public.nx_app_trials, text, boolean) from public, anon, authenticated;
revoke all on function public.nx_check_org_limit() from public, anon, authenticated;
revoke all on function public.nx_check_invite_limit() from public, anon, authenticated;
revoke all on function public.nx_ticket_priority() from public, anon, authenticated;
revoke all on function public.nx_use_feature(text, integer, boolean) from public, anon;
revoke all on function public.nx_app_claim(text, text, text, text, uuid) from public, anon;
revoke all on function public.nx_app_status(text[]) from public, anon;
revoke all on function public.nx_app_release(text) from public, anon;
revoke all on function public.nx_app_trial_extend(uuid, integer) from public, anon;
revoke all on function public.nx_plan_status(uuid) from public, anon;
grant execute on function public.nx_org_plan(uuid) to authenticated;
grant execute on function public.nx_plan_rank(text) to authenticated;
grant execute on function public.nx_limit(text, text) to authenticated;
grant execute on function public.nx_perm(text, text) to authenticated;
grant execute on function public.nx_plan_needed(text, text) to authenticated;
grant execute on function public.nx_plan_label(text) to authenticated;
grant execute on function public.nx_use_feature(text, integer, boolean) to authenticated;
grant execute on function public.nx_app_claim(text, text, text, text, uuid) to authenticated;
grant execute on function public.nx_app_status(text[]) to authenticated;
grant execute on function public.nx_app_release(text) to authenticated;
grant execute on function public.nx_app_trial_extend(uuid, integer) to authenticated;
grant execute on function public.nx_plan_status(uuid) to authenticated;
grant execute on function public.nx_alert_email(text, text, text) to authenticated;
grant execute on function public.app_insights_register(text, text) to authenticated;
