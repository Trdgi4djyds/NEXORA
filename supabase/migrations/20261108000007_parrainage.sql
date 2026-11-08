-- NEXORA #090 : NEXORA REFERRAL, programme de parrainage lié à l'abonnement Pro, et offre Pro à 25 $.
--   * Offre Pro : 25 $ par mois, 250 $ par an en achat direct (premier passage seulement, repère « offres_v4 »).
--   * Parrainage (app_config « referral », réglable dans le back office) : le client qui passe par le lien ou le code
--     promo d'un parrain a 30 % de remise sur chaque paiement Pro (17,50 $ par mois, 175 $ par an) tant que son
--     abonnement continue ; le parrain touche 25 % de ce que paie son filleul, remise déduite (4,375 $ par mois,
--     43,75 $ par an) ; le reste revient en caisse à NEXORA (13,125 $ par mois). Gains disponibles 30 jours après
--     le paiement (délai des remboursements), retrait à partir de 20 $.
--   * Parrains (nx_partners) : créés seulement depuis le back office (adresse e-mail, nom), avec un lien d'invitation
--     (jeton de 64 caractères) et un code d'accès mensuel (nx_partner_access_codes), que l'équipe leur transmet. Le
--     parrain ouvre le lien, se connecte avec son adresse e-mail (lien de connexion de NEXORA), puis saisit le code :
--     son compte est lié. Chaque mois, un nouveau code (visible dans le back office) est demandé à la première
--     connexion du mois ; 5 codes faux bloquent la saisie 30 minutes.
--   * Espace des parrains (/referral/, fonctions nx_partner_*) : codes promo et liens, filleuls, revenus récurrents,
--     historique des gains, demandes de retrait.
--   * Filleuls (nx_referrals) : lien ou code saisi avant un premier abonnement (nx_referral_attach), un seul parrain
--     par compte, jamais son propre code. Le Worker applique la remise au paiement (coupon Stripe) ; chaque paiement
--     reçu (invoice.paid, nx_billing_apply) ou enregistré par l'équipe (nx_admin_referral_payment) crée la commission.
--   * Back office (nx_admin_partner*, nx_admin_payout_update, nx_admin_commission_cancel, nx_admin_referral_*) :
--     parrains, codes du mois, filleuls, commissions, retraits, réglages, bilan (encaissé, remises, commissions, part
--     de NEXORA).
-- Montants des commissions en centimes avec 4 décimales (437,5 centimes = 4,375 $), retraits en centimes entiers.
-- Idempotente ; après 20261108000002 à 20261108000006. Les réglages et les prix modifiés ensuite dans le back office
-- sont conservés.

-- ---------- 1. Offre Pro à 25 $ (premier passage seulement) ----------
do $$
begin
  if exists (select 1 from public.app_config where key = 'offres_v4') then return; end if;
  update public.plans set price_month_cents = 2500, price_year_cents = 25000, updated_at = now() where id = 'pro';
  insert into public.app_config (key, value, description)
  values ('offres_v4', to_jsonb(now()), 'Pro à 25 $ (250 $ par an) et parrainage NEXORA REFERRAL (#090) appliqués')
  on conflict (key) do nothing;
end
$$;

-- ---------- 2. Réglages et outils ----------
insert into public.app_config (key, value, description)
values ('referral', '{"enabled": true, "discount_pct": 30, "commission_pct": 25, "min_payout_cents": 2000, "hold_days": 30,
  "max_codes": 20, "cookie_days": 90, "methods": ["paypal", "bank", "mobile_money"]}'::jsonb,
  'Parrainage NEXORA REFERRAL (#090) : remise du filleul, commission du parrain, retrait minimum, délai de disponibilité')
on conflict (key) do nothing;

-- Réglages complets (valeurs par défaut pour les clés absentes).
create or replace function public.nx_referral_cfg()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select '{"enabled": true, "discount_pct": 30, "commission_pct": 25, "min_payout_cents": 2000, "hold_days": 30,
    "max_codes": 20, "cookie_days": 90, "methods": ["paypal", "bank", "mobile_money"]}'::jsonb
    || coalesce((select case when jsonb_typeof(value) = 'object' then value end from public.app_config where key = 'referral'), '{}'::jsonb);
$$;

-- Prix de Pro, sans et avec la remise du parrainage.
create or replace function public.nx_referral_prices()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('discount_pct', x.d, 'commission_pct', x.cm, 'list_month_cents', x.lm, 'list_year_cents', x.ly,
    'month_cents', round(x.lm * (100 - x.d) / 100.0)::integer, 'year_cents', round(x.ly * (100 - x.d) / 100.0)::integer)
  from (select coalesce((select price_month_cents from public.plans where id = 'pro'), 2500) as lm,
               coalesce((select price_year_cents from public.plans where id = 'pro'), 25000) as ly,
               (public.nx_referral_cfg() ->> 'discount_pct')::numeric as d,
               (public.nx_referral_cfg() ->> 'commission_pct')::numeric as cm) x;
$$;

-- Premier jour du mois en cours (UTC) : les codes d'accès des parrains changent chaque mois.
create or replace function public.nx_month_start()
returns date
language sql stable set search_path = public
as $$ select (date_trunc('month', now() at time zone 'utc'))::date; $$;

create or replace function public.nx_month_end()
returns timestamptz
language sql stable set search_path = public
as $$ select (date_trunc('month', now() at time zone 'utc') + interval '1 month') at time zone 'utc'; $$;

-- Code lisible (sans 0, O, 1, I, L), par groupes de 4 : XXXX-XXXX.
create or replace function public.nx_referral_random(p_len integer default 8)
returns text
language plpgsql volatile set search_path = public
as $$
declare
  a constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  h text := md5(gen_random_uuid()::text || clock_timestamp()::text) || md5(gen_random_uuid()::text);
  k text := '';
  i integer;
begin
  for i in 0..least(greatest(p_len, 4), 32) - 1 loop
    if i > 0 and i % 4 = 0 then k := k || '-'; end if;
    k := k || substr(a, (('x' || substr(h, i * 2 + 1, 2))::bit(8)::integer % length(a)) + 1, 1);
  end loop;
  return k;
end
$$;

create or replace function public.nx_mask_email(p_email text)
returns text
language sql immutable set search_path = public
as $$
  select case when coalesce(p_email, '') = '' or position('@' in p_email) = 0 then ''
    else left(split_part(p_email, '@', 1), 2) || '•••@' || split_part(p_email, '@', 2) end;
$$;

-- Montant lisible en dollars : 2500 → « 25 $ », 1750 → « 17,50 $ ».
create or replace function public.nx_money_fr(p_cents numeric)
returns text
language sql immutable set search_path = public
as $$
  select replace(regexp_replace(to_char(round(coalesce(p_cents, 0)) / 100.0, 'FM9999999990.00'), '\.00$', ''), '.', ',') || ' $';
$$;

-- Journal d'audit du back office (si la table existe) : actions sur les parrains, les codes et les retraits.
create or replace function public.nx_referral_audit(p_action text, p_meta jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if to_regclass('public.audit_logs') is null then return; end if;
  execute 'insert into public.audit_logs (action, actor_id, entity, meta) values ($1, $2, $3, $4)'
    using p_action, auth.uid(), 'referral', coalesce(p_meta, '{}'::jsonb);
exception when others then
  null;
end
$$;

-- ---------- 3. Tables ----------
create table if not exists public.nx_partners (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null default '',
  user_id uuid unique references auth.users(id) on delete set null,
  status text not null default 'invited' check (status in ('invited', 'active', 'suspended')),
  invite_token text unique,
  invite_created_at timestamptz,
  note text not null default '',
  payout_method text not null default '',
  payout_details text not null default '',
  unlocked_month date,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  last_seen_at timestamptz
);
create unique index if not exists nx_partners_email on public.nx_partners (lower(email));

create table if not exists public.nx_partner_access_codes (
  partner_id uuid not null references public.nx_partners(id) on delete cascade,
  month date not null,
  code text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  primary key (partner_id, month)
);

create table if not exists public.nx_referral_codes (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.nx_partners(id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9-]{2,23}$'),
  label text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists nx_referral_codes_code on public.nx_referral_codes (upper(code));
create index if not exists nx_referral_codes_partner on public.nx_referral_codes (partner_id);

create table if not exists public.nx_referrals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  partner_id uuid not null references public.nx_partners(id) on delete cascade,
  code_id uuid references public.nx_referral_codes(id) on delete set null,
  code text not null default '',
  source text not null default 'code' check (source in ('code', 'link', 'admin')),
  created_at timestamptz not null default now()
);
create index if not exists nx_referrals_partner on public.nx_referrals (partner_id, created_at desc);

create table if not exists public.nx_commissions (
  id bigserial primary key,
  partner_id uuid not null references public.nx_partners(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  source text not null default 'stripe',
  source_ref text not null unique,
  period text not null default 'month' check (period in ('month', 'year')),
  paid_cents integer not null check (paid_cents > 0),
  list_cents integer not null default 0,
  rate numeric(6, 3) not null,
  amount_cents numeric(14, 4) not null,
  currency text not null default 'usd',
  status text not null default 'valid' check (status in ('valid', 'canceled')),
  available_at timestamptz not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  canceled_at timestamptz
);
create index if not exists nx_commissions_partner on public.nx_commissions (partner_id, created_at desc);
create index if not exists nx_commissions_user on public.nx_commissions (user_id, created_at desc);

create table if not exists public.nx_payouts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.nx_partners(id) on delete cascade,
  amount_cents bigint not null check (amount_cents > 0),
  method text not null,
  details text not null default '',
  status text not null default 'requested' check (status in ('requested', 'approved', 'paid', 'rejected', 'canceled')),
  reference text not null default '',
  admin_note text not null default '',
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid
);
-- Une seule demande ouverte par parrain.
create unique index if not exists nx_payouts_open on public.nx_payouts (partner_id) where status in ('requested', 'approved');
create index if not exists nx_payouts_partner on public.nx_payouts (partner_id, requested_at desc);

alter table public.nx_partners enable row level security;
alter table public.nx_partner_access_codes enable row level security;
alter table public.nx_referral_codes enable row level security;
alter table public.nx_referrals enable row level security;
alter table public.nx_commissions enable row level security;
alter table public.nx_payouts enable row level security;
-- Lecture réservée aux administrateurs de NEXORA (back office). Les parrains et les clients passent par les
-- fonctions ci-dessous (le code d'accès du mois est vérifié à chaque appel) ; aucune écriture directe.
drop policy if exists nx_partners_admin on public.nx_partners;
create policy nx_partners_admin on public.nx_partners for select to authenticated using (public.nx_is_admin());
drop policy if exists nx_partner_access_codes_admin on public.nx_partner_access_codes;
create policy nx_partner_access_codes_admin on public.nx_partner_access_codes for select to authenticated using (public.nx_is_admin());
drop policy if exists nx_referral_codes_admin on public.nx_referral_codes;
create policy nx_referral_codes_admin on public.nx_referral_codes for select to authenticated using (public.nx_is_admin());
drop policy if exists nx_referrals_admin on public.nx_referrals;
create policy nx_referrals_admin on public.nx_referrals for select to authenticated using (public.nx_is_admin());
drop policy if exists nx_commissions_admin on public.nx_commissions;
create policy nx_commissions_admin on public.nx_commissions for select to authenticated using (public.nx_is_admin());
drop policy if exists nx_payouts_admin on public.nx_payouts;
create policy nx_payouts_admin on public.nx_payouts for select to authenticated using (public.nx_is_admin());
revoke all on public.nx_partners, public.nx_partner_access_codes, public.nx_referral_codes, public.nx_referrals,
  public.nx_commissions, public.nx_payouts from anon, authenticated;
grant select on public.nx_partners, public.nx_partner_access_codes, public.nx_referral_codes, public.nx_referrals,
  public.nx_commissions, public.nx_payouts to authenticated;

-- ---------- 4. Outils internes ----------
-- Code d'accès du mois d'un parrain (créé au besoin ; p_regenerate : nouveau code, à ressaisir par le parrain).
create or replace function public.nx_partner_access_code(p_partner uuid, p_regenerate boolean default false)
returns public.nx_partner_access_codes
language plpgsql security definer set search_path = public
as $$
declare
  c public.nx_partner_access_codes;
  m date := public.nx_month_start();
begin
  if p_regenerate then
    delete from public.nx_partner_access_codes where partner_id = p_partner and month = m;
    update public.nx_partners set unlocked_month = null where id = p_partner and unlocked_month = m;
  end if;
  insert into public.nx_partner_access_codes (partner_id, month, code) values (p_partner, m, public.nx_referral_random(8))
  on conflict (partner_id, month) do nothing;
  select * into c from public.nx_partner_access_codes where partner_id = p_partner and month = m;
  return c;
end
$$;

-- Codes du mois de tous les parrains non suspendus (tâche du 1er du mois et back office).
create or replace function public.nx_referral_month_codes()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  p record;
  n integer := 0;
begin
  for p in select id from public.nx_partners where status <> 'suspended' loop
    perform public.nx_partner_access_code(p.id, false);
    n := n + 1;
  end loop;
  return n;
end
$$;

-- Essai d'un code d'accès : bon code → espace ouvert pour le mois ; 5 erreurs → saisie bloquée 30 minutes. Ne lève
-- jamais d'erreur (le compteur d'essais doit être gardé) : l'appelant renvoie le refus.
create or replace function public.nx_partner_try_code(p_partner uuid, p_code text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  c public.nx_partner_access_codes;
  v_norm text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  perform 1 from public.nx_partners where id = p_partner for update;
  select * into c from public.nx_partner_access_codes where partner_id = p_partner and month = public.nx_month_start();
  if found and v_norm <> '' and replace(c.code, '-', '') = v_norm then
    update public.nx_partners set failed_attempts = 0, locked_until = null, unlocked_month = public.nx_month_start(), last_seen_at = now()
    where id = p_partner;
    update public.nx_partner_access_codes set used_at = coalesce(used_at, now()) where partner_id = p_partner and month = c.month;
    return true;
  end if;
  update public.nx_partners set
    locked_until = case when failed_attempts + 1 >= 5 then now() + interval '30 minutes' else locked_until end,
    failed_attempts = case when failed_attempts + 1 >= 5 then 0 else failed_attempts + 1 end
  where id = p_partner;
  return false;
end
$$;

-- Parrain connecté, actif et dont le code du mois est saisi ; sinon erreur.
create or replace function public.nx_partner_gate()
returns public.nx_partners
language plpgsql security definer set search_path = public
as $$
declare
  p public.nx_partners;
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  select * into p from public.nx_partners where user_id = auth.uid();
  if not found then raise exception 'Cet espace est réservé aux parrains de NEXORA.'; end if;
  if p.status = 'suspended' then raise exception 'Ton accès de parrain est suspendu : écris à l’équipe NEXORA.'; end if;
  if p.unlocked_month is distinct from public.nx_month_start() then raise exception 'Saisis d’abord le code d’accès du mois.'; end if;
  update public.nx_partners set last_seen_at = now() where id = p.id;
  return p;
end
$$;

-- Soldes d'un parrain : gagné, en attente (délai), disponible (après les retraits demandés et versés), versé.
create or replace function public.nx_partner_balance(p_partner uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  with c as (
    select coalesce(sum(amount_cents), 0) as earned,
           coalesce(sum(amount_cents) filter (where available_at > now()), 0) as pending,
           coalesce(sum(amount_cents) filter (where available_at <= now()), 0) as matured
    from public.nx_commissions where partner_id = p_partner and status = 'valid'
  ), o as (
    select coalesce(sum(amount_cents) filter (where status in ('requested', 'approved')), 0) as reserved,
           coalesce(sum(amount_cents) filter (where status = 'paid'), 0) as paid
    from public.nx_payouts where partner_id = p_partner
  )
  select jsonb_build_object('earned_cents', c.earned, 'pending_cents', c.pending, 'matured_cents', c.matured,
    'reserved_cents', o.reserved, 'paid_cents', o.paid, 'available_cents', greatest(c.matured - o.reserved - o.paid, 0))
  from c, o;
$$;

-- Filleul payant en ce moment : abonnement actif chez le prestataire, sinon paiement enregistré récent (35 jours pour
-- un mois, 370 jours pour un an).
create or replace function public.nx_referral_active(p_user uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select b.status in ('active', 'trialing', 'past_due') from public.nx_billing b where b.user_id = p_user and b.status <> 'none'),
    (select c.created_at > now() - case when c.period = 'year' then interval '370 days' else interval '35 days' end
       from public.nx_commissions c where c.user_id = p_user and c.status = 'valid' order by c.created_at desc limit 1),
    false);
$$;

-- Revenus récurrents mensuels (commission) d'un parrain, ou de tous (p_partner null) : dernière commission de chaque
-- filleul payant, ramenée au mois.
create or replace function public.nx_referral_mrr(p_partner uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('payers', count(*),
    'commission_cents', coalesce(sum(case when lc.period = 'year' then lc.amount_cents / 12 else lc.amount_cents end), 0),
    'gross_cents', coalesce(sum(case when lc.period = 'year' then lc.paid_cents / 12.0 else lc.paid_cents end), 0))
  from public.nx_referrals r
  join lateral (select c.amount_cents, c.paid_cents, c.period from public.nx_commissions c
    where c.user_id = r.user_id and c.partner_id = r.partner_id and c.status = 'valid' order by c.created_at desc limit 1) lc on true
  where (p_partner is null or r.partner_id = p_partner) and public.nx_referral_active(r.user_id);
$$;

-- Commission d'un paiement reçu d'un filleul (montant payé, remise déduite). Une seule par paiement (p_ref).
create or replace function public.nx_referral_commission_add(p_user uuid, p_paid_cents integer, p_currency text, p_source text,
  p_ref text, p_period text default 'month')
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_partner uuid;
  cfg jsonb := public.nx_referral_cfg();
  v_rate numeric := (cfg ->> 'commission_pct')::numeric;
  v_period text := case when p_period = 'year' then 'year' else 'month' end;
  v_list integer;
begin
  if p_user is null or coalesce(p_paid_cents, 0) <= 0 or coalesce(p_ref, '') = '' then return false; end if;
  select r.partner_id into v_partner from public.nx_referrals r join public.nx_partners p on p.id = r.partner_id
  where r.user_id = p_user and p.status = 'active';
  if v_partner is null then return false; end if;
  select case when v_period = 'year' then price_year_cents else price_month_cents end into v_list from public.plans where id = 'pro';
  insert into public.nx_commissions (partner_id, user_id, source, source_ref, period, paid_cents, list_cents, rate, amount_cents, currency, available_at)
  values (v_partner, p_user, left(coalesce(p_source, 'stripe'), 20), left(p_ref, 160), v_period, p_paid_cents, coalesce(v_list, 0), v_rate,
    round(p_paid_cents * v_rate / 100.0, 4), lower(left(coalesce(p_currency, 'usd'), 8)), now() + make_interval(days => (cfg ->> 'hold_days')::integer))
  on conflict (source_ref) do nothing;
  return found;
end
$$;

-- ---------- 5. Lectures publiques ----------
-- Code promo ou lien d'un parrain (site vitrine, NEXORA) : valide ou non, remise et prix avec la remise.
create or replace function public.nx_referral_resolve(p_code text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v text := upper(trim(coalesce(p_code, '')));
  c public.nx_referral_codes;
  p public.nx_partners;
begin
  if v !~ '^[A-Z0-9][A-Z0-9-]{2,23}$' or not coalesce((public.nx_referral_cfg() ->> 'enabled')::boolean, true) then
    return jsonb_build_object('valid', false);
  end if;
  select * into c from public.nx_referral_codes where upper(code) = v;
  if not found or not c.active then return jsonb_build_object('valid', false); end if;
  select * into p from public.nx_partners where id = c.partner_id;
  if p.status <> 'active' then return jsonb_build_object('valid', false); end if;
  return jsonb_build_object('valid', true, 'code', c.code, 'partner', split_part(trim(p.name), ' ', 1)) || public.nx_referral_prices();
end
$$;

-- Lien d'invitation d'un parrain : adresse masquée (le parrain sait laquelle utiliser), jamais l'adresse complète.
create or replace function public.nx_partner_invite_info(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  p public.nx_partners;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then return jsonb_build_object('valid', false, 'reason', 'unknown'); end if;
  select * into p from public.nx_partners where invite_token = p_token;
  if not found then return jsonb_build_object('valid', false, 'reason', 'unknown'); end if;
  if p.status = 'suspended' then return jsonb_build_object('valid', false, 'reason', 'suspended'); end if;
  return jsonb_build_object('valid', true, 'email', public.nx_mask_email(p.email), 'name', split_part(trim(p.name), ' ', 1),
    'expires_at', public.nx_month_end());
end
$$;

-- ---------- 6. Clients : parrainage du compte ----------
-- Parrainage du compte connecté et prix de Pro qui s'appliquent à lui.
create or replace function public.nx_referral_mine()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  r record;
  v_paid text;
begin
  if auth.uid() is null then return jsonb_build_object('referred', false, 'eligible', false) || public.nx_referral_prices(); end if;
  select x.code, x.created_at, x.source, p.name into r from public.nx_referrals x join public.nx_partners p on p.id = x.partner_id where x.user_id = auth.uid();
  if not found then
    -- eligible : un code peut encore être saisi (aucun abonnement payé, aucun paiement : règle de nx_referral_attach).
    select pp.plan_id into v_paid from public.nx_paid_plan(auth.uid()) pp;
    return jsonb_build_object('referred', false, 'eligible', coalesce(v_paid, 'free') = 'free'
      and not exists (select 1 from public.nx_payments where user_id = auth.uid() and amount_cents > 0)) || public.nx_referral_prices();
  end if;
  return jsonb_build_object('referred', true, 'code', r.code, 'source', r.source, 'since', r.created_at,
    'partner', split_part(trim(r.name), ' ', 1)) || public.nx_referral_prices();
end
$$;

-- Lien ou code saisi par un client avant son premier abonnement Pro : un seul parrain par compte, définitif.
create or replace function public.nx_referral_attach(p_code text, p_source text default 'code')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v text := upper(trim(coalesce(p_code, '')));
  c public.nx_referral_codes;
  p public.nx_partners;
  v_paid text;
begin
  if v_uid is null then raise exception 'Connexion requise.'; end if;
  if exists (select 1 from public.nx_referrals where user_id = v_uid) then
    return jsonb_build_object('ok', true, 'already', true) || public.nx_referral_mine();
  end if;
  if not coalesce((public.nx_referral_resolve(v) ->> 'valid')::boolean, false) then
    return jsonb_build_object('ok', false, 'reason', 'unknown');
  end if;
  select * into c from public.nx_referral_codes where upper(code) = v;
  select * into p from public.nx_partners where id = c.partner_id;
  if p.user_id = v_uid then return jsonb_build_object('ok', false, 'reason', 'self'); end if;
  select pp.plan_id into v_paid from public.nx_paid_plan(v_uid) pp;
  if coalesce(v_paid, 'free') <> 'free' or exists (select 1 from public.nx_payments where user_id = v_uid and amount_cents > 0) then
    return jsonb_build_object('ok', false, 'reason', 'customer');
  end if;
  insert into public.nx_referrals (user_id, partner_id, code_id, code, source)
  values (v_uid, p.id, c.id, c.code, case when p_source = 'link' then 'link' else 'code' end)
  on conflict (user_id) do nothing;
  return jsonb_build_object('ok', true, 'already', false) || public.nx_referral_mine();
end
$$;

-- ---------- 7. Espace des parrains ----------
-- État du compte connecté vu par l'espace des parrains (aucun code exigé : il dit lequel demander).
create or replace function public.nx_partner_me()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  p public.nx_partners;
  v_email text;
begin
  if auth.uid() is null then return jsonb_build_object('partner', false, 'auth', false); end if;
  select * into p from public.nx_partners where user_id = auth.uid();
  if not found then
    select email into v_email from auth.users where id = auth.uid();
    return jsonb_build_object('partner', false, 'auth', true, 'email', v_email,
      'invited', exists (select 1 from public.nx_partners where lower(email) = lower(coalesce(v_email, '')) and status = 'invited'));
  end if;
  return jsonb_build_object('partner', true, 'auth', true, 'id', p.id, 'name', p.name, 'email', p.email, 'status', p.status,
    'needs_code', p.unlocked_month is distinct from public.nx_month_start(), 'month', public.nx_month_start(), 'code_expires_at', public.nx_month_end(),
    'locked_until', case when p.locked_until > now() then p.locked_until end, 'payout_method', p.payout_method, 'payout_details', p.payout_details,
    'activated_at', p.activated_at);
end
$$;

-- Activation : lien d'invitation + adresse e-mail du compte connecté + code d'accès du mois.
create or replace function public.nx_partner_activate(p_token text, p_code text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  p public.nx_partners;
begin
  if v_uid is null then raise exception 'Connexion requise.'; end if;
  select email into v_email from auth.users where id = v_uid;
  select * into p from public.nx_partners where invite_token = p_token and coalesce(p_token, '') ~ '^[0-9a-f]{64}$' for update;
  if not found or p.status <> 'invited' then return jsonb_build_object('ok', false, 'reason', 'invite'); end if;
  if lower(p.email) <> lower(coalesce(v_email, '')) then
    return jsonb_build_object('ok', false, 'reason', 'email', 'expected', public.nx_mask_email(p.email));
  end if;
  if exists (select 1 from public.nx_partners where user_id = v_uid and id <> p.id) then
    return jsonb_build_object('ok', false, 'reason', 'already');
  end if;
  if p.locked_until > now() then return jsonb_build_object('ok', false, 'reason', 'locked', 'until', p.locked_until); end if;
  if not public.nx_partner_try_code(p.id, p_code) then
    select * into p from public.nx_partners where id = p.id;
    return jsonb_build_object('ok', false, 'reason', case when p.locked_until > now() then 'locked' else 'code' end, 'until', p.locked_until,
      'left', 5 - p.failed_attempts);
  end if;
  update public.nx_partners set user_id = v_uid, status = 'active', activated_at = now(), invite_token = null where id = p.id;
  perform public.nx_referral_audit('partner.activate', jsonb_build_object('partner', p.id, 'email', p.email));
  return jsonb_build_object('ok', true) || public.nx_partner_me();
end
$$;

-- Code d'accès du mois (première connexion du mois).
create or replace function public.nx_partner_unlock(p_code text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  p public.nx_partners;
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  select * into p from public.nx_partners where user_id = auth.uid();
  if not found then return jsonb_build_object('ok', false, 'reason', 'partner'); end if;
  if p.status = 'suspended' then return jsonb_build_object('ok', false, 'reason', 'suspended'); end if;
  if p.locked_until > now() then return jsonb_build_object('ok', false, 'reason', 'locked', 'until', p.locked_until); end if;
  if not public.nx_partner_try_code(p.id, p_code) then
    select * into p from public.nx_partners where id = p.id;
    return jsonb_build_object('ok', false, 'reason', case when p.locked_until > now() then 'locked' else 'code' end, 'until', p.locked_until,
      'left', 5 - p.failed_attempts);
  end if;
  return jsonb_build_object('ok', true) || public.nx_partner_me();
end
$$;

-- Tableau de bord : soldes, revenus récurrents, filleuls, gains des 12 derniers mois, règles du programme.
create or replace function public.nx_partner_dashboard()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  p public.nx_partners := public.nx_partner_gate();
  m date := public.nx_month_start();
begin
  return jsonb_build_object(
    'balance', public.nx_partner_balance(p.id),
    'recurring', public.nx_referral_mrr(p.id),
    'referrals', (select count(*) from public.nx_referrals where partner_id = p.id),
    'referrals_month', (select count(*) from public.nx_referrals where partner_id = p.id and created_at >= m),
    'month_cents', (select coalesce(sum(amount_cents), 0) from public.nx_commissions where partner_id = p.id and status = 'valid' and created_at >= m),
    'codes', (select count(*) from public.nx_referral_codes where partner_id = p.id and active),
    'series', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(g.mm, 'YYYY-MM'), 'amount_cents', coalesce(s.total, 0)) order by g.mm), '[]'::jsonb)
      from generate_series(m - interval '11 months', m::timestamp, interval '1 month') g(mm)
      left join (select date_trunc('month', created_at at time zone 'utc') as mm, sum(amount_cents) as total from public.nx_commissions
        where partner_id = p.id and status = 'valid' group by 1) s on s.mm = g.mm),
    'rules', public.nx_referral_prices() || jsonb_build_object('min_payout_cents', (public.nx_referral_cfg() ->> 'min_payout_cents')::bigint,
      'hold_days', (public.nx_referral_cfg() ->> 'hold_days')::integer, 'methods', public.nx_referral_cfg() -> 'methods',
      'max_codes', (public.nx_referral_cfg() ->> 'max_codes')::integer, 'cookie_days', (public.nx_referral_cfg() ->> 'cookie_days')::integer),
    'open_payout', (select to_jsonb(o) from public.nx_payouts o where o.partner_id = p.id and o.status in ('requested', 'approved') limit 1));
end
$$;

create or replace function public.nx_partner_codes()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  p public.nx_partners := public.nx_partner_gate();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'code', c.code, 'label', c.label, 'active', c.active, 'created_at', c.created_at,
      'referrals', (select count(*) from public.nx_referrals r where r.code_id = c.id),
      'payers', (select count(*) from public.nx_referrals r where r.code_id = c.id and public.nx_referral_active(r.user_id)),
      'earned_cents', (select coalesce(sum(m.amount_cents), 0) from public.nx_commissions m join public.nx_referrals r on r.user_id = m.user_id
        where r.code_id = c.id and m.partner_id = p.id and m.status = 'valid')) order by c.created_at desc)
    from public.nx_referral_codes c where c.partner_id = p.id), '[]'::jsonb);
end
$$;

create or replace function public.nx_partner_code_create(p_code text, p_label text default '')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  p public.nx_partners := public.nx_partner_gate();
  v text := upper(trim(coalesce(p_code, '')));
  c public.nx_referral_codes;
  v_max integer := (public.nx_referral_cfg() ->> 'max_codes')::integer;
begin
  if v !~ '^[A-Z0-9][A-Z0-9-]{2,23}$' or v like '%--%' or v like '%-' then
    raise exception 'Un code promo compte de 3 à 24 caractères : lettres, chiffres et tirets (pas à la fin).';
  end if;
  if v in ('NEXORA', 'ADMIN', 'SUPPORT', 'PRO', 'GRATUIT', 'FREE', 'TEST', 'PROMO', 'NEXORA-PRO') then
    raise exception 'Ce code est réservé : choisis-en un autre.';
  end if;
  if (select count(*) from public.nx_referral_codes where partner_id = p.id) >= v_max then
    raise exception 'Tu as atteint le nombre maximal de codes (%).', v_max;
  end if;
  if exists (select 1 from public.nx_referral_codes where upper(code) = v) then raise exception 'Ce code est déjà pris : choisis-en un autre.'; end if;
  insert into public.nx_referral_codes (partner_id, code, label) values (p.id, v, left(trim(coalesce(p_label, '')), 60)) returning * into c;
  return to_jsonb(c);
end
$$;

create or replace function public.nx_partner_code_update(p_id uuid, p_active boolean default null, p_label text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  p public.nx_partners := public.nx_partner_gate();
  c public.nx_referral_codes;
begin
  update public.nx_referral_codes set active = coalesce(p_active, active), label = coalesce(left(trim(p_label), 60), label)
  where id = p_id and partner_id = p.id returning * into c;
  if not found then raise exception 'Code introuvable.'; end if;
  return to_jsonb(c);
end
$$;

-- Filleuls du parrain : adresse masquée, code, état de l'abonnement, gains.
create or replace function public.nx_partner_referrals(p_limit integer default 200)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  p public.nx_partners := public.nx_partner_gate();
begin
  return coalesce((select jsonb_agg(x.j order by x.created_at desc) from (
    select r.created_at, jsonb_build_object('who', public.nx_mask_email(u.email), 'since', r.created_at, 'code', r.code, 'source', r.source,
      'active', public.nx_referral_active(r.user_id), 'period', coalesce(b.period, lc.period),
      'payments', (select count(*) from public.nx_commissions m where m.user_id = r.user_id and m.partner_id = p.id and m.status = 'valid'),
      'earned_cents', (select coalesce(sum(m.amount_cents), 0) from public.nx_commissions m where m.user_id = r.user_id and m.partner_id = p.id and m.status = 'valid'),
      'last_payment_at', lc.created_at, 'renews_at', case when b.status in ('active', 'trialing', 'past_due') and not b.cancel_at_period_end then b.current_period_end end) as j
    from public.nx_referrals r
    left join auth.users u on u.id = r.user_id
    left join public.nx_billing b on b.user_id = r.user_id
    left join lateral (select m.created_at, m.period from public.nx_commissions m where m.user_id = r.user_id and m.partner_id = p.id and m.status = 'valid'
      order by m.created_at desc limit 1) lc on true
    where r.partner_id = p.id order by r.created_at desc limit least(greatest(coalesce(p_limit, 200), 1), 500)) x), '[]'::jsonb);
end
$$;

-- Historique des gains : une ligne par paiement de filleul.
create or replace function public.nx_partner_commissions(p_limit integer default 100, p_offset integer default 0)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  p public.nx_partners := public.nx_partner_gate();
begin
  return jsonb_build_object('total', (select count(*) from public.nx_commissions where partner_id = p.id),
    'rows', coalesce((select jsonb_agg(x.j order by x.created_at desc, x.id desc) from (
      select c.created_at, c.id, jsonb_build_object('id', c.id, 'at', c.created_at, 'who', public.nx_mask_email(u.email), 'period', c.period,
        'paid_cents', c.paid_cents, 'list_cents', c.list_cents, 'rate', c.rate, 'amount_cents', c.amount_cents, 'currency', c.currency,
        'state', case when c.status = 'canceled' then 'canceled' when c.available_at > now() then 'pending' else 'available' end,
        'available_at', c.available_at, 'note', c.note) as j
      from public.nx_commissions c left join auth.users u on u.id = c.user_id
      where c.partner_id = p.id order by c.created_at desc, c.id desc
      limit least(greatest(coalesce(p_limit, 100), 1), 500) offset greatest(coalesce(p_offset, 0), 0)) x), '[]'::jsonb));
end
$$;

create or replace function public.nx_partner_payouts()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  p public.nx_partners := public.nx_partner_gate();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'amount_cents', o.amount_cents, 'method', o.method, 'details', o.details,
      'status', o.status, 'reference', o.reference, 'note', o.admin_note, 'requested_at', o.requested_at, 'processed_at', o.processed_at)
      order by o.requested_at desc)
    from public.nx_payouts o where o.partner_id = p.id), '[]'::jsonb);
end
$$;

-- Demande de retrait : au moins le minimum, au plus le disponible, une demande ouverte à la fois.
create or replace function public.nx_partner_payout_request(p_amount_cents bigint, p_method text, p_details text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  p public.nx_partners := public.nx_partner_gate();
  cfg jsonb := public.nx_referral_cfg();
  v_min bigint := (cfg ->> 'min_payout_cents')::bigint;
  v_avail numeric;
  o public.nx_payouts;
begin
  perform 1 from public.nx_partners where id = p.id for update;
  if not exists (select 1 from jsonb_array_elements_text(cfg -> 'methods') m where m = p_method) then
    raise exception 'Choisis un moyen de versement proposé.';
  end if;
  if length(trim(coalesce(p_details, ''))) < 4 then
    raise exception 'Indique où verser tes gains (adresse PayPal, IBAN ou numéro Mobile Money).';
  end if;
  if exists (select 1 from public.nx_payouts where partner_id = p.id and status in ('requested', 'approved')) then
    raise exception 'Une demande de retrait est déjà en cours : attends son traitement.';
  end if;
  if coalesce(p_amount_cents, 0) < v_min then raise exception 'Le retrait minimum est de %.', public.nx_money_fr(v_min); end if;
  v_avail := (public.nx_partner_balance(p.id) ->> 'available_cents')::numeric;
  if p_amount_cents > floor(v_avail) then
    raise exception 'Montant supérieur à tes gains disponibles (%).', public.nx_money_fr(floor(v_avail));
  end if;
  insert into public.nx_payouts (partner_id, amount_cents, method, details)
  values (p.id, p_amount_cents, p_method, left(trim(p_details), 300)) returning * into o;
  update public.nx_partners set payout_method = p_method, payout_details = left(trim(p_details), 300) where id = p.id;
  perform public.nx_referral_audit('payout.request', jsonb_build_object('partner', p.id, 'payout', o.id, 'amount_cents', o.amount_cents));
  return to_jsonb(o);
end
$$;

create or replace function public.nx_partner_payout_cancel(p_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  p public.nx_partners := public.nx_partner_gate();
  o public.nx_payouts;
begin
  update public.nx_payouts set status = 'canceled', processed_at = now() where id = p_id and partner_id = p.id and status = 'requested' returning * into o;
  if not found then raise exception 'Cette demande ne peut plus être annulée.'; end if;
  return to_jsonb(o);
end
$$;

-- Moyen de versement préféré (prérempli dans les demandes de retrait).
create or replace function public.nx_partner_profile_set(p_method text, p_details text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  p public.nx_partners := public.nx_partner_gate();
begin
  if coalesce(p_method, '') <> '' and not exists (select 1 from jsonb_array_elements_text(public.nx_referral_cfg() -> 'methods') m where m = p_method) then
    raise exception 'Choisis un moyen de versement proposé.';
  end if;
  update public.nx_partners set payout_method = coalesce(p_method, ''), payout_details = left(trim(coalesce(p_details, '')), 300) where id = p.id;
  return public.nx_partner_me();
end
$$;

-- ---------- 8. Back office ----------
create or replace function public.nx_admin_partner_create(p_email text, p_name text, p_note text default '')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  p public.nx_partners;
  c public.nx_partner_access_codes;
begin
  if not public.nx_is_admin() then raise exception 'Réservé aux administrateurs de NEXORA.'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Adresse e-mail invalide.'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Indique le nom du parrain.'; end if;
  if exists (select 1 from public.nx_partners where lower(email) = v_email) then raise exception 'Un parrain existe déjà avec cette adresse.'; end if;
  insert into public.nx_partners (email, name, note, invite_token, invite_created_at, created_by)
  values (v_email, left(trim(p_name), 80), left(coalesce(p_note, ''), 500),
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), now(), auth.uid())
  returning * into p;
  c := public.nx_partner_access_code(p.id, false);
  perform public.nx_referral_audit('partner.create', jsonb_build_object('partner', p.id, 'email', p.email));
  return jsonb_build_object('partner', to_jsonb(p), 'invite_token', p.invite_token, 'code', c.code, 'month', c.month, 'expires_at', public.nx_month_end());
end
$$;

-- Parrains avec leurs chiffres et le code du mois (créé au besoin).
create or replace function public.nx_admin_partners()
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not public.nx_is_admin() then raise exception 'Réservé aux administrateurs de NEXORA.'; end if;
  perform public.nx_referral_month_codes();
  return coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object(
      'month_code', (select a.code from public.nx_partner_access_codes a where a.partner_id = p.id and a.month = public.nx_month_start()),
      'month_code_used_at', (select a.used_at from public.nx_partner_access_codes a where a.partner_id = p.id and a.month = public.nx_month_start()),
      'unlocked', p.unlocked_month = public.nx_month_start(),
      'codes', (select count(*) from public.nx_referral_codes c where c.partner_id = p.id),
      'referrals', (select count(*) from public.nx_referrals r where r.partner_id = p.id),
      'recurring', public.nx_referral_mrr(p.id),
      'balance', public.nx_partner_balance(p.id)) order by p.created_at desc)
    from public.nx_partners p), '[]'::jsonb);
end
$$;

-- Suspendre, réactiver, renommer, annoter, débloquer la saisie du code.
create or replace function public.nx_admin_partner_update(p_partner uuid, p_status text default null, p_name text default null,
  p_note text default null, p_unlock boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  p public.nx_partners;
begin
  if not public.nx_is_admin() then raise exception 'Réservé aux administrateurs de NEXORA.'; end if;
  if p_status is not null and p_status not in ('active', 'suspended') then raise exception 'État inconnu.'; end if;
  update public.nx_partners set
    status = case when p_status = 'suspended' then 'suspended' when p_status = 'active' then case when user_id is null then 'invited' else 'active' end else status end,
    name = coalesce(nullif(left(trim(p_name), 80), ''), name), note = coalesce(left(p_note, 500), note),
    failed_attempts = case when p_unlock then 0 else failed_attempts end, locked_until = case when p_unlock then null else locked_until end
  where id = p_partner returning * into p;
  if not found then raise exception 'Parrain introuvable.'; end if;
  perform public.nx_referral_audit('partner.update', jsonb_build_object('partner', p.id, 'status', p.status, 'unlock', p_unlock));
  return to_jsonb(p);
end
$$;

-- Nouveau lien d'invitation (parrain pas encore activé) : l'ancien lien ne marche plus.
create or replace function public.nx_admin_partner_invite_reset(p_partner uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  p public.nx_partners;
begin
  if not public.nx_is_admin() then raise exception 'Réservé aux administrateurs de NEXORA.'; end if;
  update public.nx_partners set invite_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), invite_created_at = now()
  where id = p_partner and user_id is null and status = 'invited' returning * into p;
  if not found then raise exception 'Ce parrain a déjà activé son accès : il se connecte avec son adresse e-mail et le code du mois.'; end if;
  perform public.nx_referral_audit('partner.invite_reset', jsonb_build_object('partner', p.id));
  return jsonb_build_object('invite_token', p.invite_token);
end
$$;

-- Code d'accès du mois d'un parrain ; p_regenerate : nouveau code (l'ancien ne marche plus, à ressaisir).
create or replace function public.nx_admin_partner_code(p_partner uuid, p_regenerate boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  c public.nx_partner_access_codes;
begin
  if not public.nx_is_admin() then raise exception 'Réservé aux administrateurs de NEXORA.'; end if;
  if not exists (select 1 from public.nx_partners where id = p_partner) then raise exception 'Parrain introuvable.'; end if;
  c := public.nx_partner_access_code(p_partner, coalesce(p_regenerate, false));
  if p_regenerate then perform public.nx_referral_audit('partner.code_regenerate', jsonb_build_object('partner', p_partner)); end if;
  return jsonb_build_object('code', c.code, 'month', c.month, 'used_at', c.used_at, 'expires_at', public.nx_month_end());
end
$$;

-- Filleuls de tous les parrains (adresse complète : back office seulement).
create or replace function public.nx_admin_referrals(p_limit integer default 300)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not public.nx_is_admin() then raise exception 'Réservé aux administrateurs de NEXORA.'; end if;
  return coalesce((select jsonb_agg(x.j order by x.created_at desc) from (
    select r.created_at, jsonb_build_object('user_id', r.user_id, 'email', u.email, 'partner_id', r.partner_id, 'partner', p.name, 'code', r.code,
      'source', r.source, 'since', r.created_at, 'active', public.nx_referral_active(r.user_id), 'billing', b.status, 'period', b.period,
      'payments', (select count(*) from public.nx_commissions m where m.user_id = r.user_id and m.status = 'valid'),
      'paid_cents', (select coalesce(sum(m.paid_cents), 0) from public.nx_commissions m where m.user_id = r.user_id and m.status = 'valid'),
      'commission_cents', (select coalesce(sum(m.amount_cents), 0) from public.nx_commissions m where m.user_id = r.user_id and m.status = 'valid')) as j
    from public.nx_referrals r join public.nx_partners p on p.id = r.partner_id
    left join auth.users u on u.id = r.user_id left join public.nx_billing b on b.user_id = r.user_id
    order by r.created_at desc limit least(greatest(coalesce(p_limit, 300), 1), 2000)) x), '[]'::jsonb);
end
$$;

-- Retraits : demandé → approuvé, versé (référence obligatoire) ou refusé.
create or replace function public.nx_admin_payout_update(p_payout uuid, p_status text, p_reference text default '', p_note text default '')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  o public.nx_payouts;
begin
  if not public.nx_is_admin() then raise exception 'Réservé aux administrateurs de NEXORA.'; end if;
  select * into o from public.nx_payouts where id = p_payout for update;
  if not found then raise exception 'Retrait introuvable.'; end if;
  if not ((o.status = 'requested' and p_status in ('approved', 'paid', 'rejected')) or (o.status = 'approved' and p_status in ('paid', 'rejected'))) then
    raise exception 'Ce retrait est déjà traité.';
  end if;
  if p_status = 'paid' and length(trim(coalesce(p_reference, ''))) < 3 then
    raise exception 'Indique la référence du versement (numéro de transaction).';
  end if;
  update public.nx_payouts set status = p_status, reference = left(trim(coalesce(p_reference, reference)), 120),
    admin_note = left(coalesce(nullif(p_note, ''), admin_note), 500), processed_at = now(), processed_by = auth.uid()
  where id = o.id returning * into o;
  perform public.nx_referral_audit('payout.' || p_status, jsonb_build_object('payout', o.id, 'partner', o.partner_id, 'amount_cents', o.amount_cents));
  return to_jsonb(o);
end
$$;

-- Annuler une commission (paiement remboursé, fraude) : elle sort des soldes.
create or replace function public.nx_admin_commission_cancel(p_id bigint, p_note text default '')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  c public.nx_commissions;
begin
  if not public.nx_is_admin() then raise exception 'Réservé aux administrateurs de NEXORA.'; end if;
  update public.nx_commissions set status = 'canceled', canceled_at = now(), note = left(coalesce(nullif(p_note, ''), note), 300)
  where id = p_id and status = 'valid' returning * into c;
  if not found then raise exception 'Commission introuvable ou déjà annulée.'; end if;
  perform public.nx_referral_audit('commission.cancel', jsonb_build_object('commission', c.id, 'partner', c.partner_id, 'amount_cents', c.amount_cents));
  return to_jsonb(c);
end
$$;

-- Paiement reçu hors ligne d'un filleul (activation de Pro par l'équipe) : crée la commission du parrain.
create or replace function public.nx_admin_referral_payment(p_user uuid, p_paid_cents integer, p_period text default 'month', p_note text default '')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_ref text := 'manual:' || gen_random_uuid()::text;
  c public.nx_commissions;
begin
  if not public.nx_is_admin() then raise exception 'Réservé aux administrateurs de NEXORA.'; end if;
  if coalesce(p_paid_cents, 0) <= 0 then raise exception 'Indique le montant payé.'; end if;
  if not public.nx_referral_commission_add(p_user, p_paid_cents, 'usd', 'manual', v_ref, p_period) then
    raise exception 'Ce compte n’a pas de parrain actif.';
  end if;
  update public.nx_commissions set note = left(coalesce(p_note, ''), 300) where source_ref = v_ref returning * into c;
  perform public.nx_referral_audit('commission.manual', jsonb_build_object('commission', c.id, 'user', p_user, 'paid_cents', p_paid_cents));
  return to_jsonb(c);
end
$$;

-- Rattacher un compte à un code (client venu par un parrain sans avoir saisi le code).
create or replace function public.nx_admin_referral_assign(p_email text, p_code text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid;
  c public.nx_referral_codes;
  p public.nx_partners;
begin
  if not public.nx_is_admin() then raise exception 'Réservé aux administrateurs de NEXORA.'; end if;
  select id into v_uid from auth.users where lower(email) = lower(trim(coalesce(p_email, ''))) limit 1;
  if v_uid is null then raise exception 'Aucun compte NEXORA avec cette adresse.'; end if;
  if exists (select 1 from public.nx_referrals where user_id = v_uid) then raise exception 'Ce compte a déjà un parrain.'; end if;
  select * into c from public.nx_referral_codes where upper(code) = upper(trim(coalesce(p_code, '')));
  if not found then raise exception 'Code promo inconnu.'; end if;
  select * into p from public.nx_partners where id = c.partner_id;
  if p.user_id = v_uid then raise exception 'Un parrain ne peut pas être son propre filleul.'; end if;
  insert into public.nx_referrals (user_id, partner_id, code_id, code, source) values (v_uid, p.id, c.id, c.code, 'admin');
  perform public.nx_referral_audit('referral.assign', jsonb_build_object('user', v_uid, 'partner', p.id, 'code', c.code));
  return jsonb_build_object('ok', true, 'user_id', v_uid, 'partner', p.name, 'code', c.code);
end
$$;

-- Réglages du programme, contrôlés (les clés inconnues sont ignorées).
create or replace function public.nx_admin_referral_settings(p_value jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v jsonb := public.nx_referral_cfg() || coalesce(p_value, '{}'::jsonb);
  clean jsonb;
  m text;
begin
  if not public.nx_is_admin() then raise exception 'Réservé aux administrateurs de NEXORA.'; end if;
  if (v ->> 'discount_pct')::numeric not between 0 and 90 then raise exception 'La remise va de 0 à 90 %%.'; end if;
  if (v ->> 'commission_pct')::numeric not between 0 and 90 then raise exception 'La commission va de 0 à 90 %%.'; end if;
  if (v ->> 'min_payout_cents')::bigint < 0 then raise exception 'Le retrait minimum ne peut pas être négatif.'; end if;
  if (v ->> 'hold_days')::integer not between 0 and 365 then raise exception 'Le délai va de 0 à 365 jours.'; end if;
  if (v ->> 'max_codes')::integer not between 1 and 100 then raise exception 'De 1 à 100 codes par parrain.'; end if;
  if (v ->> 'cookie_days')::integer not between 1 and 365 then raise exception 'Le lien reste mémorisé de 1 à 365 jours.'; end if;
  if jsonb_typeof(v -> 'methods') <> 'array' or jsonb_array_length(v -> 'methods') = 0 then raise exception 'Garde au moins un moyen de versement.'; end if;
  for m in select jsonb_array_elements_text(v -> 'methods') loop
    if m not in ('paypal', 'bank', 'mobile_money') then raise exception 'Moyen de versement inconnu : %.', m; end if;
  end loop;
  clean := jsonb_build_object('enabled', coalesce((v ->> 'enabled')::boolean, true), 'discount_pct', (v ->> 'discount_pct')::numeric,
    'commission_pct', (v ->> 'commission_pct')::numeric, 'min_payout_cents', (v ->> 'min_payout_cents')::bigint, 'hold_days', (v ->> 'hold_days')::integer,
    'max_codes', (v ->> 'max_codes')::integer, 'cookie_days', (v ->> 'cookie_days')::integer, 'methods', v -> 'methods');
  insert into public.app_config (key, value, description) values ('referral', clean,
    'Parrainage NEXORA REFERRAL (#090) : remise du filleul, commission du parrain, retrait minimum, délai de disponibilité')
  on conflict (key) do update set value = excluded.value, updated_at = now();
  perform public.nx_referral_audit('referral.settings', clean);
  return clean;
end
$$;

-- Bilan du programme : encaissé auprès des filleuls, remises, commissions, versé, part de NEXORA, 12 derniers mois.
create or replace function public.nx_admin_referral_overview()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  m date := public.nx_month_start();
begin
  if not public.nx_is_admin() then raise exception 'Réservé aux administrateurs de NEXORA.'; end if;
  return (select jsonb_build_object(
    'partners', (select jsonb_build_object('invited', count(*) filter (where status = 'invited'), 'active', count(*) filter (where status = 'active'),
      'suspended', count(*) filter (where status = 'suspended')) from public.nx_partners),
    'referrals', (select count(*) from public.nx_referrals),
    'referrals_month', (select count(*) from public.nx_referrals where created_at >= m),
    'gross_cents', c.gross, 'list_cents', c.list, 'discount_cents', greatest(c.list - c.gross, 0), 'commission_cents', c.comm,
    'net_cents', c.gross - c.comm, 'payments', c.n,
    'paid_out_cents', (select coalesce(sum(amount_cents), 0) from public.nx_payouts where status = 'paid'),
    'open_payouts', (select jsonb_build_object('count', count(*), 'amount_cents', coalesce(sum(amount_cents), 0)) from public.nx_payouts where status in ('requested', 'approved')),
    'recurring', public.nx_referral_mrr(null),
    'series', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(g.mm, 'YYYY-MM'), 'gross_cents', coalesce(s.gross, 0), 'commission_cents', coalesce(s.comm, 0)) order by g.mm), '[]'::jsonb)
      from generate_series(m - interval '11 months', m::timestamp, interval '1 month') g(mm)
      left join (select date_trunc('month', created_at at time zone 'utc') as mm, sum(paid_cents) as gross, sum(amount_cents) as comm
        from public.nx_commissions where status = 'valid' group by 1) s on s.mm = g.mm),
    'rules', public.nx_referral_cfg() || public.nx_referral_prices())
  from (select coalesce(sum(paid_cents), 0) as gross, coalesce(sum(list_cents), 0) as list, coalesce(sum(amount_cents), 0) as comm, count(*) as n
    from public.nx_commissions where status = 'valid') c);
end
$$;

-- ---------- 9. Paiements ----------
-- Version du #076 complétée : commission du parrain sur chaque paiement reçu (invoice.paid, montant payé après la
-- remise). La période (mois ou an) est celle de l'abonnement connu (gardée si l'événement ne la donne pas).
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
  v_commission boolean := false;
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
  -- NEXORA #090 : commission du parrain (une par paiement, l'événement sert de référence).
  if p_kind = 'invoice.paid' and coalesce(p_amount, 0) > 0 then
    v_commission := public.nx_referral_commission_add(v_uid, p_amount, p_currency, left(p_provider, 20), left(p_provider, 20) || ':' || p_event_id,
      (select b.period from public.nx_billing b where b.user_id = v_uid));
  end if;
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
  return jsonb_build_object('ok', true, 'user', v_uid, 'org', v_org, 'active', v_active, 'commission', v_commission);
end
$$;

-- Relance 7 jours avant le renouvellement : prix réel de Pro (avec la remise du parrainage si le compte en a une).
create or replace function public.nx_billing_remind()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  b record;
  n integer := 0;
  v_date text;
  v_prices jsonb := public.nx_referral_prices();
  v_amount integer;
begin
  if to_regprocedure('public.nx_brevo_send(text, text, text, text, text)') is null then return 0; end if;
  for b in
    select x.*, u.email, coalesce(p.full_name, '') as full_name, exists (select 1 from public.nx_referrals r where r.user_id = x.user_id) as referred
    from public.nx_billing x
    join auth.users u on u.id = x.user_id left join public.profiles p on p.id = x.user_id
    where x.status in ('active', 'trialing', 'past_due') and x.current_period_end between now() + interval '6 days' and now() + interval '7 days'
      and x.reminded_for is distinct from x.current_period_end and coalesce(u.email, '') <> ''
    limit 200
  loop
    v_date := to_char(b.current_period_end, 'DD/MM/YYYY');
    v_amount := ((v_prices ->> (case when b.referred then '' else 'list_' end || case when b.period = 'year' then 'year_cents' else 'month_cents' end))::integer);
    if b.cancel_at_period_end then
      perform public.nx_brevo_send(b.email, b.full_name, 'Ton abonnement NEXORA Pro se termine dans 7 jours',
        'Bonjour' || case when b.full_name <> '' then ' ' || b.full_name else '' end || E',\n\nTon abonnement NEXORA Pro prend fin le ' || v_date || E'. Ensuite, ton compte repassera en offre Gratuite (Responsive Lab, Browser Lab et 2 applications).\n\nPour le garder, réactive-le depuis le site de NEXORA, page « Ma licence ».\n\nL’équipe NEXORA', 'Abonnement');
    else
      perform public.nx_brevo_send(b.email, b.full_name, 'Ton abonnement NEXORA Pro se renouvelle dans 7 jours',
        'Bonjour' || case when b.full_name <> '' then ' ' || b.full_name else '' end || E',\n\nTon abonnement NEXORA Pro sera renouvelé automatiquement le ' || v_date || ' (' || public.nx_money_fr(v_amount) || case when b.period = 'year' then ' pour un an' else ' pour un mois' end || case when b.referred then ', remise du parrainage comprise' else '' end || E').\n\nRien à faire de ton côté. Pour changer de moyen de paiement ou résilier, ouvre le site de NEXORA, page « Ma licence ».\n\nL’équipe NEXORA', 'Abonnement');
    end if;
    update public.nx_billing set reminded_for = b.current_period_end where user_id = b.user_id;
    n := n + 1;
  end loop;
  return n;
end
$$;

-- Codes d'accès du mois créés le 1er à 0 h 05 (UTC), pour qu'ils soient prêts dans le back office.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where command ilike '%nx_referral_month_codes%') then
      perform cron.schedule('nexora-referral-codes', '5 0 1 * *', 'select public.nx_referral_month_codes()');
    end if;
  end if;
end
$$;

-- ---------- 10. Droits ----------
revoke all on function public.nx_referral_cfg(), public.nx_referral_prices(), public.nx_referral_random(integer), public.nx_referral_audit(text, jsonb),
  public.nx_partner_access_code(uuid, boolean), public.nx_referral_month_codes(), public.nx_partner_try_code(uuid, text), public.nx_partner_gate(),
  public.nx_partner_balance(uuid), public.nx_referral_active(uuid), public.nx_referral_mrr(uuid),
  public.nx_referral_commission_add(uuid, integer, text, text, text, text),
  public.nx_referral_resolve(text), public.nx_partner_invite_info(text), public.nx_referral_mine(), public.nx_referral_attach(text, text),
  public.nx_partner_me(), public.nx_partner_activate(text, text), public.nx_partner_unlock(text), public.nx_partner_dashboard(), public.nx_partner_codes(),
  public.nx_partner_code_create(text, text), public.nx_partner_code_update(uuid, boolean, text), public.nx_partner_referrals(integer),
  public.nx_partner_commissions(integer, integer), public.nx_partner_payouts(), public.nx_partner_payout_request(bigint, text, text),
  public.nx_partner_payout_cancel(uuid), public.nx_partner_profile_set(text, text),
  public.nx_admin_partner_create(text, text, text), public.nx_admin_partners(), public.nx_admin_partner_update(uuid, text, text, text, boolean),
  public.nx_admin_partner_invite_reset(uuid), public.nx_admin_partner_code(uuid, boolean), public.nx_admin_referrals(integer),
  public.nx_admin_payout_update(uuid, text, text, text), public.nx_admin_commission_cancel(bigint, text),
  public.nx_admin_referral_payment(uuid, integer, text, text), public.nx_admin_referral_assign(text, text), public.nx_admin_referral_settings(jsonb),
  public.nx_admin_referral_overview(), public.nx_billing_remind()
  from public, anon, authenticated;
-- Lectures publiques (site vitrine, lien d'invitation) : aucune donnée personnelle.
grant execute on function public.nx_referral_resolve(text), public.nx_partner_invite_info(text), public.nx_referral_mine() to anon, authenticated;
grant execute on function public.nx_referral_attach(text, text), public.nx_partner_me(), public.nx_partner_activate(text, text), public.nx_partner_unlock(text),
  public.nx_partner_dashboard(), public.nx_partner_codes(), public.nx_partner_code_create(text, text), public.nx_partner_code_update(uuid, boolean, text),
  public.nx_partner_referrals(integer), public.nx_partner_commissions(integer, integer), public.nx_partner_payouts(),
  public.nx_partner_payout_request(bigint, text, text), public.nx_partner_payout_cancel(uuid), public.nx_partner_profile_set(text, text),
  public.nx_admin_partner_create(text, text, text), public.nx_admin_partners(), public.nx_admin_partner_update(uuid, text, text, text, boolean),
  public.nx_admin_partner_invite_reset(uuid), public.nx_admin_partner_code(uuid, boolean), public.nx_admin_referrals(integer),
  public.nx_admin_payout_update(uuid, text, text, text), public.nx_admin_commission_cancel(bigint, text),
  public.nx_admin_referral_payment(uuid, integer, text, text), public.nx_admin_referral_assign(text, text), public.nx_admin_referral_settings(jsonb),
  public.nx_admin_referral_overview() to authenticated;
-- Le Worker appelle nx_billing_apply avec la clé publique et le secret partagé (vérifié dans la fonction).
grant execute on function public.nx_billing_apply(text, text, text, uuid, text, text, timestamptz, text, text, integer, text, text, boolean) to anon, authenticated;
