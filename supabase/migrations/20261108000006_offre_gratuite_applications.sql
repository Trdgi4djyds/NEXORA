-- NEXORA #087 : offre Gratuite à 2 applications (Android ou Windows) et offre Pro à 18 $ par mois (180 $ par an).
--   * Gratuit : 2 applications au total, App Builder et Desktop Builder confondus, applications supprimées
--     comprises (la limite « apps » se lit à vie quand « apps_lifetime » vaut 1) ; tout l'App Builder et tout le
--     Desktop Builder pour ces applications (APK, AAB, PWA, Play Store, notifications push, messagerie, achats
--     intégrés, statistiques et plantages, logiciels Windows) ; 5 constructions par application et par mois
--     (« builds_per_app_month »), donc 10 au plus par mois (« builds_month ») ; 1 000 envois push par mois.
--   * Pro : 18 $ par mois ou 180 $ par an ; jusqu'à 50 applications, sans limite par application (400
--     constructions par mois).
--   * nx_app_build : construction d'une application (APK ou AAB, logiciel Windows). L'application est réservée
--     sur le compte à sa première construction (dans la limite de l'offre), puis la construction est comptée pour
--     l'application et pour le compte. Le processus principal de NEXORA l'appelle avant android:build et
--     desktop:build (src/plan.js).
--   * nx_use_feature refuse une construction comptée hors de nx_app_build quand l'offre limite les constructions
--     par application (ancienne version de NEXORA, appel direct). Le paquet PWA (fichiers du site) n'est plus
--     une construction.
--   * Une application au-delà de la limite (créée pendant l'essai d'un jour ou avec Pro, puis retour à l'offre
--     Gratuite) reste verrouillée : seules les premières applications créées restent utilisables.
--   * app_config.support_email : nexoradevstoolbox@gmail.com, si aucune adresse n'est encore renseignée.
-- Idempotente ; après 20261104000007, 20261105000008 et 20261108000002 à 20261108000005. Les offres ne sont
-- réécrites qu'au premier passage (repère app_config « offres_v3 ») : les prix, limites et textes modifiés ensuite
-- dans le back office sont conservés.

-- ---------- 1. Plateforme de chaque application ----------
alter table public.nx_app_trials add column if not exists platform text not null default 'android';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nx_app_trials_platform_check') then
    alter table public.nx_app_trials add constraint nx_app_trials_platform_check check (platform in ('android', 'windows'));
  end if;
end
$$;

-- ---------- 2. Offres (premier passage seulement) ----------
do $$
begin
  if exists (select 1 from public.app_config where key = 'offres_v3') then return; end if;
  update public.plans set
    description = 'Responsive Lab et Browser Lab complets, et 2 applications Android ou Windows. Gratuit, sans limite de durée.',
    limits = limits || '{"apps": 2, "apps_lifetime": 1, "app_trial_days": 0, "builds_per_app_month": 5, "builds_month": 10, "push_month": 1000}'::jsonb,
    perms = perms || '{"apk": true, "pwa": true, "source_import": true, "play_publish": true, "push": true, "inapp": true,
      "automation": true, "custom_notifications": true, "messaging_events": true, "integrations": true, "desktop_builder": true}'::jsonb,
    features = '["Responsive Lab complet : tous les modèles d’appareils, vidéo et outils de développement",
      "Browser Lab complet : inspection, réseau, console, tests et extraction",
      "2 applications Android ou Windows au total, applications supprimées comprises",
      "Tout l’App Builder et le Desktop Builder pour ces applications, 5 constructions par application et par mois",
      "NEX-DESIGN découverte (3 documents)", "1 audit de sécurité par jour, 1 site surveillé",
      "Assistant IA avec ta propre clé", "Tout NEXORA pendant ton premier jour"]'::jsonb,
    updated_at = now()
  where id = 'free';
  update public.plans set
    price_month_cents = 1800, price_year_cents = 18000,
    limits = limits || '{"apps_lifetime": 0, "builds_per_app_month": -1}'::jsonb,
    features = '["Les 9 espaces sans restriction",
      "Dev Lab complet : éditeur, terminal, Git, débogueur, tests, bases de données, mise en ligne",
      "Jusqu’à 50 applications Android ou Windows, sans limite par application (400 constructions par mois)",
      "NEX-DESIGN complet : documents illimités, IA, prototype, code, équipe", "Studio 3D & Motion avancé",
      "Sécurité : audits avancés, 50 sites surveillés 24 h/24, page de statut", "200 projets, 10 membres, 50 Go",
      "Assistance prioritaire"]'::jsonb,
    updated_at = now()
  where id = 'pro';
  -- Anciennes offres (lues comme Pro) : pas de limite par application.
  update public.plans set limits = limits || '{"apps_lifetime": 0, "builds_per_app_month": -1}'::jsonb, updated_at = now()
  where id in ('standard', 'team', 'enterprise');
  insert into public.app_config (key, value, description)
  values ('support_email', to_jsonb('nexoradevstoolbox@gmail.com'::text), 'Adresse de contact et d’assistance (site vitrine, application)')
  on conflict (key) do update set value = excluded.value
  where coalesce(public.app_config.value #>> '{}', '') = '';
  insert into public.app_config (key, value, description) values ('offres_v3', to_jsonb(now()), 'Offre Gratuite à 2 applications et Pro à 18 $ (#087) appliquées')
  on conflict (key) do nothing;
end
$$;

-- ---------- 3. Catalogue des fonctions : le paquet PWA n'est plus une construction ----------
create or replace function public.nx_feature_rule(p_feature text, out perm text, out metric text, out per text, out label text)
language sql immutable
as $$
  select r.perm, r.metric, r.per, r.label from (values
    ('apk', 'apk', 'builds_month', 'month', 'La génération d’APK'),
    ('pwa', 'pwa', null, null, 'Le paquet PWA'),
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

-- ---------- 4. Fonctions contrôlées (constructions comptées par application) ----------
-- Même fonction que la migration 20261104000007, avec le refus d'une construction comptée hors de nx_app_build
-- quand l'offre limite les constructions par application.
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
  -- NEXORA #087 : avec une limite par application, la construction passe par nx_app_build.
  if v_rule.metric = 'builds_month' and not coalesce(p_check_only, false)
     and coalesce(current_setting('nx.app_build', true), '') <> 'on'
     and public.nx_limit(v_plan, 'builds_per_app_month') > 0 then
    return jsonb_build_object('ok', false, 'reason', 'update', 'plan', v_plan, 'plan_name', public.nx_plan_label(v_plan), 'feature', p_feature,
      'message', format('Mets NEXORA à jour pour construire : les constructions sont désormais comptées par application (%s par mois).',
        public.nx_limit(v_plan, 'builds_per_app_month')));
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

-- ---------- 5. Applications (App Builder et Desktop Builder) ----------
-- Applications comptées pour la limite de l'offre : à vie (toutes, supprimées comprises) quand « apps_lifetime »
-- vaut 1, les essais quand l'offre a des jours d'essai (ancienne offre Gratuite du #037), sinon les actives.
create or replace function public.nx_app_used(p_uid uuid, p_plan text)
returns integer
language sql stable security definer set search_path = public
as $$
  select count(*)::integer from public.nx_app_trials t
  where t.user_id = p_uid
    and case
      when public.nx_limit(p_plan, 'app_trial_days') > 0 then t.trial_ends_at is not null
      when public.nx_limit(p_plan, 'apps_lifetime') > 0 then true
      else t.deleted_at is null
    end;
$$;

-- État d'une application pour l'offre actuelle : active, trial (essai en cours), expired (essai terminé) ou plan
-- (au-delà de la limite de l'offre : créée pendant l'essai d'un jour ou avec une offre payante qui n'est plus
-- active). Avec une limite à vie, seules les premières applications créées restent actives, supprimées comprises
-- (supprimer une application n'en débloque pas une autre). Constructions de l'application ce mois-ci.
create or replace function public.nx_app_state(p_row public.nx_app_trials, p_plan text, p_admin boolean)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_status text;
  v_trial integer := public.nx_limit(p_plan, 'app_trial_days');
  v_limit integer := public.nx_limit(p_plan, 'apps');
  v_rank integer;
  v_builds integer;
  v_blimit integer := case when p_admin then -1 else public.nx_limit(p_plan, 'builds_per_app_month') end;
begin
  if p_admin then v_status := 'active';
  elsif v_trial > 0 then
    v_status := case when p_row.trial_ends_at is null then 'plan' when p_row.trial_ends_at > now() then 'trial' else 'expired' end;
  elsif public.nx_limit(p_plan, 'apps_lifetime') > 0 and v_limit >= 0 then
    select count(*) into v_rank from public.nx_app_trials t
    where t.user_id = p_row.user_id and (t.created_at, t.id) < (p_row.created_at, p_row.id);
    v_status := case when v_rank < v_limit then 'active' else 'plan' end;
  else v_status := 'active';
  end if;
  select q.value into v_builds from public.nx_quota_usage q
  where q.subject_id = p_row.id and q.metric = 'app_builds_month' and q.period_start = public.nx_period('month');
  return jsonb_build_object('ok', true, 'local_id', p_row.local_id, 'name', p_row.name, 'source_kind', p_row.source_kind,
    'platform', p_row.platform, 'status', v_status, 'created_at', p_row.created_at, 'trial_ends_at', p_row.trial_ends_at,
    'days_left', case when v_status = 'trial' then greatest(0, ceil(extract(epoch from (p_row.trial_ends_at - now())) / 86400))::integer else null end,
    'deleted', p_row.deleted_at is not null, 'builds_month', coalesce(v_builds, 0), 'builds_limit', v_blimit);
end
$$;

-- Réserve une application sur le compte (Android ou Windows). Une application déjà réservée, même supprimée,
-- est reprise sans compter une nouvelle place.
drop function if exists public.nx_app_claim(text, text, text, text, uuid);
create or replace function public.nx_app_claim(p_local_id text, p_name text default '', p_source_kind text default 'url', p_url text default null,
  p_org uuid default null, p_platform text default 'android')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_local text := left(trim(coalesce(p_local_id, '')), 80);
  v_kind text := case when p_source_kind in ('url', 'folder', 'project') then p_source_kind else 'url' end;
  v_platform text := case when p_platform = 'windows' then 'windows' else 'android' end;
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
    v_count := public.nx_app_used(v_uid, v_plan);
    if v_count >= v_limit then
      return jsonb_build_object('ok', false, 'reason', 'quota', 'plan', v_plan, 'plan_name', public.nx_plan_label(v_plan), 'limit', v_limit, 'used', v_count,
        'need', (select p.id from public.plans p where p.active and p.price_month_cents > public.nx_plan_rank(v_plan) order by p.price_month_cents limit 1),
        'message', case
          when v_trial > 0 then format('Tu as déjà utilisé tes %s applications d’essai de l’offre %s. Passe à Pro pour créer d’autres applications, sans limite de durée.', v_limit, public.nx_plan_label(v_plan))
          when public.nx_limit(v_plan, 'apps_lifetime') > 0 then format('Tu as déjà créé tes %s applications : c’est la limite de ton offre, Android et Windows confondus, applications supprimées comprises. Passe à Pro pour en créer d’autres.', v_limit)
          else format('Ton offre %s permet %s applications. Supprime une application ou passe à une offre supérieure.', public.nx_plan_label(v_plan), v_limit) end);
    end if;
  end if;
  insert into public.nx_app_trials (user_id, org_id, local_id, name, source_kind, source_url, plan_at_creation, trial_ends_at, platform)
  values (v_uid, coalesce(p_org, v_org), v_local, left(coalesce(p_name, ''), 120), v_kind, left(p_url, 2000), v_plan,
    case when not v_admin and v_trial > 0 then now() + make_interval(days => v_trial) else null end, v_platform)
  returning * into v_row;
  return public.nx_app_state(v_row, v_plan, v_admin);
end
$$;

-- États des applications du compte (toutes, ou celles de la liste) et compteur de la limite.
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
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'auth', 'apps', '{}'::jsonb); end if;
  select u.plan_id into v_plan from public.nx_user_plan(v_uid) u;
  v_plan := coalesce(v_plan, 'free');
  v_trial := public.nx_limit(v_plan, 'app_trial_days');
  select coalesce(jsonb_object_agg(t.local_id, public.nx_app_state(t, v_plan, v_admin)), '{}'::jsonb) into v_apps
  from public.nx_app_trials t
  where t.user_id = v_uid and (p_local_ids is null or t.local_id = any (p_local_ids));
  return jsonb_build_object('ok', true, 'plan', v_plan, 'plan_name', public.nx_plan_label(v_plan), 'admin', v_admin,
    'trial_days', greatest(v_trial, 0), 'limit', case when v_admin then -1 else public.nx_limit(v_plan, 'apps') end,
    'used', public.nx_app_used(v_uid, v_plan), 'lifetime', public.nx_limit(v_plan, 'apps_lifetime') > 0,
    'builds_limit', case when v_admin then -1 else public.nx_limit(v_plan, 'builds_per_app_month') end,
    'source_import', v_admin or public.nx_perm(v_plan, 'source_import'), 'apps', v_apps);
end
$$;

-- Construction d'une application : p_feature « apk » (App Builder : APK ou AAB) ou « desktop_builder » (logiciel
-- Windows). Vérifie l'offre et le quota du compte, réserve l'application à sa première construction, refuse une
-- application verrouillée, puis compte la construction pour l'application (limite « builds_per_app_month ») et
-- pour le compte (« builds_month »), de façon atomique.
-- Réponse : { ok, plan, local_id, platform, app_builds_used, app_builds_limit, remaining } ou { ok: false, reason, message }.
create or replace function public.nx_app_build(p_local_id text, p_feature text default 'apk', p_name text default '',
  p_source_kind text default 'url', p_url text default null, p_platform text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_local text := left(trim(coalesce(p_local_id, '')), 80);
  v_feature text := case when p_feature in ('apk', 'desktop_builder') then p_feature else null end;
  v_platform text := case when p_feature = 'desktop_builder' or p_platform = 'windows' then 'windows' else 'android' end;
  v_plan text;
  v_admin boolean := public.nx_is_admin();
  v_row public.nx_app_trials;
  v_state jsonb;
  v_claim jsonb;
  v_use jsonb;
  v_limit integer;
  v_used integer;
  v_period date := public.nx_period('month');
  v_name text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth', 'need', 'free', 'need_name', public.nx_plan_label('free'),
      'message', 'Connecte-toi à ton compte NEXORA (gratuit) pour construire une application.');
  end if;
  if v_feature is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown', 'message', 'Cette fonction n’est pas disponible.');
  end if;
  if v_local = '' then
    return jsonb_build_object('ok', false, 'reason', 'app', 'message', 'Application inconnue : enregistre-la, puis relance la construction.');
  end if;
  select u.plan_id into v_plan from public.nx_user_plan(v_uid) u;
  v_plan := coalesce(v_plan, 'free');
  -- 1. Offre et quota du compte (vérification sans consommer).
  v_use := public.nx_use_feature(v_feature, 1, true);
  if not coalesce((v_use ->> 'ok')::boolean, false) then return v_use; end if;
  -- 2. Application réservée sur le compte (à sa première construction, dans la limite de l'offre).
  select * into v_row from public.nx_app_trials t where t.user_id = v_uid and t.local_id = v_local;
  if not found or v_row.deleted_at is not null then
    v_claim := public.nx_app_claim(v_local, p_name, p_source_kind, p_url, null, v_platform);
    if not coalesce((v_claim ->> 'ok')::boolean, false) then return v_claim || jsonb_build_object('feature', v_feature); end if;
    select * into v_row from public.nx_app_trials t where t.user_id = v_uid and t.local_id = v_local;
  end if;
  v_name := coalesce(nullif(v_row.name, ''), nullif(p_name, ''), 'Cette application');
  v_state := public.nx_app_state(v_row, v_plan, v_admin);
  if v_state ->> 'status' not in ('active', 'trial') then
    return jsonb_build_object('ok', false, 'reason', coalesce(v_state ->> 'status', 'plan'), 'plan', v_plan, 'plan_name', public.nx_plan_label(v_plan),
      'need', 'pro', 'need_name', public.nx_plan_label('pro'), 'feature', v_feature, 'local_id', v_local,
      'message', case when v_state ->> 'status' = 'expired'
        then format('L’essai de « %s » est terminé : passe à Pro pour la débloquer.', v_name)
        else format('« %s » dépasse les %s applications de ton offre : elle reste verrouillée. Passe à Pro pour la débloquer.', v_name, public.nx_limit(v_plan, 'apps')) end);
  end if;
  -- 3. Constructions de cette application ce mois-ci.
  v_limit := case when v_admin then -1 else public.nx_limit(v_plan, 'builds_per_app_month') end;
  if v_limit = 0 then
    return jsonb_build_object('ok', false, 'reason', 'plan', 'plan', v_plan, 'plan_name', public.nx_plan_label(v_plan), 'need', 'pro',
      'need_name', public.nx_plan_label('pro'), 'feature', v_feature,
      'message', 'La construction d’applications n’est pas incluse dans ton offre : passe à Pro.');
  end if;
  if v_limit > 0 then
    insert into public.nx_quota_usage as q (subject_id, metric, period_start, value)
      values (v_row.id, 'app_builds_month', v_period, 1)
      on conflict (subject_id, metric, period_start) do update set value = q.value + 1, updated_at = now()
      where q.value + 1 <= v_limit
      returning q.value into v_used;
    if not found then
      select q.value into v_used from public.nx_quota_usage q
      where q.subject_id = v_row.id and q.metric = 'app_builds_month' and q.period_start = v_period;
      return jsonb_build_object('ok', false, 'reason', 'quota', 'plan', v_plan, 'plan_name', public.nx_plan_label(v_plan),
        'need', 'pro', 'need_name', public.nx_plan_label('pro'), 'feature', v_feature, 'local_id', v_local,
        'limit', v_limit, 'used', coalesce(v_used, v_limit),
        'message', format('« %s » a déjà utilisé ses %s constructions de ce mois-ci. Le compteur repart le 1ᵉʳ du mois ; avec Pro, les constructions ne sont pas limitées par application.',
          v_name, v_limit));
    end if;
  else
    -- Sans limite par application : compté quand même (statistiques, back office).
    insert into public.nx_quota_usage as q (subject_id, metric, period_start, value)
      values (v_row.id, 'app_builds_month', v_period, 1)
      on conflict (subject_id, metric, period_start) do update set value = q.value + 1, updated_at = now()
      returning q.value into v_used;
  end if;
  -- 4. Construction comptée pour le compte (quota mensuel de l'offre).
  perform set_config('nx.app_build', 'on', true);
  v_use := public.nx_use_feature(v_feature, 1, false);
  perform set_config('nx.app_build', '', true);
  if not coalesce((v_use ->> 'ok')::boolean, false) then
    -- Quota du compte atteint entre-temps : la construction n'est pas comptée pour l'application.
    update public.nx_quota_usage set value = greatest(0, value - 1), updated_at = now()
    where subject_id = v_row.id and metric = 'app_builds_month' and period_start = v_period;
    return v_use;
  end if;
  return jsonb_build_object('ok', true, 'plan', v_plan, 'plan_name', public.nx_plan_label(v_plan), 'local_id', v_local, 'platform', v_row.platform,
    'app_builds_used', v_used, 'app_builds_limit', v_limit, 'remaining', case when v_limit > 0 then v_limit - v_used else -1 end);
end
$$;

-- ---------- 6. Offre et usage : applications comptées comme la limite ----------
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
  v_quota := v_quota || jsonb_build_object('apps', public.nx_app_used(v_uid, v_plan));
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

-- ---------- 7. Statistiques et plantages : inclus pour les applications de l'offre Gratuite ----------
create or replace function public.app_insights_register(p_app_id text, p_name text default '')
returns table (id uuid, ingest_key text)
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_plan text;
  v_app text := left(trim(coalesce(p_app_id, '')), 150);
  v_limit integer;
begin
  if uid is null then raise exception 'Connexion requise.'; end if;
  select u.plan_id into v_plan from public.nx_user_plan(uid) u;
  v_plan := coalesce(v_plan, 'free');
  if not public.nx_is_admin() and not public.nx_perm(v_plan, 'api_sdk') then
    if not (public.nx_perm(v_plan, 'apk') or public.nx_perm(v_plan, 'desktop_builder')) then
      raise exception 'Le SDK de statistiques et de plantages fait partie de l’offre Pro (offre actuelle : %).', public.nx_plan_label(v_plan);
    end if;
    -- Offre qui construit des applications sans le SDK complet : autant d'applications suivies que sa limite.
    v_limit := public.nx_limit(v_plan, 'apps');
    if v_limit >= 0 and (select count(*) from public.app_insights_apps a where a.owner = uid and a.app_id <> v_app) >= v_limit then
      raise exception 'Ton offre suit les statistiques et les plantages de % applications : passe à Pro pour en suivre d’autres.', v_limit;
    end if;
  end if;
  return query
    insert into public.app_insights_apps as a (owner, app_id, name)
    values (uid, v_app, left(coalesce(p_name, ''), 120))
    on conflict (owner, app_id) do update set name = excluded.name
    returning a.id, a.ingest_key;
end
$$;

-- ---------- 8. Droits ----------
revoke all on function public.nx_app_used(uuid, text) from public, anon, authenticated;
revoke all on function public.nx_app_state(public.nx_app_trials, text, boolean) from public, anon, authenticated;
revoke all on function public.nx_use_feature(text, integer, boolean) from public, anon;
revoke all on function public.nx_app_claim(text, text, text, text, uuid, text) from public, anon;
revoke all on function public.nx_app_status(text[]) from public, anon;
revoke all on function public.nx_app_build(text, text, text, text, text, text) from public, anon;
revoke all on function public.nx_plan_status(uuid) from public, anon;
revoke all on function public.app_insights_register(text, text) from public, anon;
grant execute on function public.nx_use_feature(text, integer, boolean) to authenticated;
grant execute on function public.nx_app_claim(text, text, text, text, uuid, text) to authenticated;
grant execute on function public.nx_app_status(text[]) to authenticated;
grant execute on function public.nx_app_build(text, text, text, text, text, text) to authenticated;
grant execute on function public.nx_plan_status(uuid) to authenticated;
grant execute on function public.app_insights_register(text, text) to authenticated;
