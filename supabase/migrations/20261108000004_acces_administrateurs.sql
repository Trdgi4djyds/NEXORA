-- NEXORA #084 : les administrateurs de NEXORA (profiles.app_role = admin ou superadmin) ont un accès total au
-- logiciel, quelle que soit leur offre : leur offre effective est Pro (toutes les fonctions). Les quotas et les
-- limites de données ne les concernaient déjà pas (nx_use_feature, déclencheurs des limites), ni les limites
-- d'ordinateurs et de comptes par PC (nx_license_check). Idempotente ; à appliquer après 20261108000003.

create or replace function public.nx_is_admin_uid(p_uid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles p where p.id = p_uid and p.app_role in ('admin', 'superadmin')); $$;

create or replace function public.nx_user_plan(p_uid uuid)
returns table (plan_id text, org_id uuid)
language sql stable security definer set search_path = public
as $$
  select x.plan_id, x.org_id from (
    select 'pro'::text as plan_id, (select p.org_id from public.nx_paid_plan(p_uid) p) as org_id, -1 as prio
    where public.nx_is_admin_uid(p_uid)
    union all
    select public.nx_granted_plan(p_uid), (select p.org_id from public.nx_paid_plan(p_uid) p), 0
    where public.nx_granted_plan(p_uid) is not null
    union all
    select p.plan_id, p.org_id, 1 from public.nx_paid_plan(p_uid) p
    union all
    select 'pro', (select p.org_id from public.nx_paid_plan(p_uid) p), 2
    from public.nx_licenses l where l.user_id = p_uid and l.status = 'active' and l.trial_ends_at > now()
  ) x
  order by (x.prio < 0) desc, (x.prio = 0) desc, public.nx_plan_rank(x.plan_id) desc, x.prio
  limit 1;
$$;

revoke all on function public.nx_is_admin_uid(uuid) from public, anon, authenticated;
