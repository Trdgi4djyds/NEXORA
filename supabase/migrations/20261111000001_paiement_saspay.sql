-- NEXORA #107 : paiement de l'offre Pro par SasPay (Mobile Money et carte), à la place de Stripe.
-- SasPay n'a pas d'abonnement automatique : chaque paiement réussi ouvre Pro pour un mois ou un an, à partir de la
-- fin de la période déjà payée (prolongation) ou d'aujourd'hui. Pro s'arrête seul après cette date (nx_org_plan :
-- 3 jours de grâce) ; la relance 7 jours avant (nx_billing_remind) invite à prolonger (cancel_at_period_end).
--   * nx_pay_sessions       : sessions de paiement ouvertes par le Worker (session SasPay, compte, période, montant).
--                             Le webhook « transaction.success » ne porte ni metadata ni session : le paiement est
--                             rattaché au compte par la session dont le statut renvoie la même transaction.
--   * nx_pay_session_open   : session créée (Worker, secret partagé).
--   * nx_pay_session_find   : session retrouvée par la référence de l'adresse de retour (Worker).
--   * nx_pay_sessions_pending : sessions encore en attente (3 jours) et transaction déjà appliquée ou non (webhook).
--   * nx_pay_session_fail   : paiement échoué ou annulé (vérifié par le Worker).
--   * nx_pay_apply          : paiement VÉRIFIÉ (GET /payments/{id}/verify/ = SUCCESS) appliqué une seule fois :
--                             nx_billing_apply (Pro, nx_payments, nx_billing), puis commission du parrain.
-- Rejouable (« Tout appliquer » du back office).

create table if not exists public.nx_pay_sessions (
  id text primary key,
  ref uuid not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  period text not null default 'month',
  amount_cents integer not null,
  currency text not null default 'usd',
  referral_code text,
  checkout_url text not null default '',
  status text not null default 'pending',
  transaction_id text unique,
  net_amount text,
  charged text,
  paid_currency text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists nx_pay_sessions_pending on public.nx_pay_sessions (status, created_at desc);
create index if not exists nx_pay_sessions_user on public.nx_pay_sessions (user_id, created_at desc);
alter table public.nx_pay_sessions enable row level security;
-- Lecture : chacun ses paiements, les administrateurs tout. Aucune écriture directe : tout passe par le Worker.
drop policy if exists nx_pay_sessions_read on public.nx_pay_sessions;
create policy nx_pay_sessions_read on public.nx_pay_sessions for select to authenticated using (user_id = (select auth.uid()) or public.nx_is_admin());

alter table public.nx_billing alter column provider set default 'saspay';

create or replace function public.nx_pay_session_open(p_secret text, p_id text, p_ref uuid, p_user uuid, p_period text, p_amount integer,
  p_currency text default 'usd', p_referral text default null, p_url text default '')
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not public.nx_worker_secret_ok(p_secret) then raise exception 'Accès refusé.'; end if;
  if coalesce(p_id, '') = '' or p_user is null or coalesce(p_amount, 0) <= 0 then return jsonb_build_object('ok', false, 'reason', 'bad_request'); end if;
  insert into public.nx_pay_sessions (id, ref, user_id, period, amount_cents, currency, referral_code, checkout_url)
  values (left(p_id, 80), p_ref, p_user, case when p_period = 'year' then 'year' else 'month' end, p_amount, lower(left(coalesce(p_currency, 'usd'), 8)),
    nullif(left(coalesce(p_referral, ''), 24), ''), left(coalesce(p_url, ''), 500))
  on conflict (id) do nothing;
  return jsonb_build_object('ok', true, 'id', p_id);
end
$$;

create or replace function public.nx_pay_session_find(p_secret text, p_ref uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  s public.nx_pay_sessions;
begin
  if not public.nx_worker_secret_ok(p_secret) then raise exception 'Accès refusé.'; end if;
  select * into s from public.nx_pay_sessions where ref = p_ref;
  if not found then return null; end if;
  return jsonb_build_object('id', s.id, 'ref', s.ref, 'user_id', s.user_id, 'period', s.period, 'amount_cents', s.amount_cents, 'status', s.status,
    'period_end', (select b.current_period_end from public.nx_billing b where b.user_id = s.user_id));
end
$$;

create or replace function public.nx_pay_sessions_pending(p_secret text, p_transaction text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.nx_worker_secret_ok(p_secret) then raise exception 'Accès refusé.'; end if;
  return jsonb_build_object(
    'known', exists (select 1 from public.nx_pay_sessions where transaction_id = p_transaction and status in ('paid', 'failed')),
    'sessions', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'ref', x.ref, 'user_id', x.user_id) order by x.created_at desc), '[]'::jsonb)
      from (select id, ref, user_id, created_at from public.nx_pay_sessions
        where status = 'pending' and created_at > now() - interval '3 days' order by created_at desc limit 25) x));
end
$$;

create or replace function public.nx_pay_session_fail(p_secret text, p_id text, p_transaction text default null)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if not public.nx_worker_secret_ok(p_secret) then raise exception 'Accès refusé.'; end if;
  update public.nx_pay_sessions set status = 'failed', transaction_id = coalesce(transaction_id, nullif(left(coalesce(p_transaction, ''), 80), ''))
  where id = p_id and status = 'pending';
  return found;
end
$$;

create or replace function public.nx_pay_apply(p_secret text, p_id text, p_transaction text, p_net text default null, p_charged text default null,
  p_currency text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  s public.nx_pay_sessions;
  v_base timestamptz;
  v_end timestamptz;
  v_r jsonb;
  v_commission boolean := false;
begin
  if not public.nx_worker_secret_ok(p_secret) then raise exception 'Accès refusé.'; end if;
  if coalesce(p_transaction, '') = '' then return jsonb_build_object('ok', false, 'reason', 'transaction'); end if;
  select * into s from public.nx_pay_sessions where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'session'); end if;
  if s.status = 'paid' then
    return jsonb_build_object('ok', true, 'duplicate', true, 'user', s.user_id, 'period', s.period,
      'period_end', (select b.current_period_end from public.nx_billing b where b.user_id = s.user_id));
  end if;
  -- Une transaction ne paie qu'une session.
  if exists (select 1 from public.nx_pay_sessions where transaction_id = p_transaction and id <> s.id) then
    return jsonb_build_object('ok', false, 'reason', 'transaction_used');
  end if;
  -- Prolongation : à partir de la fin de la période payée si elle court encore, sinon d'aujourd'hui.
  select case when b.status in ('active', 'trialing', 'past_due', 'paid') and b.current_period_end > now() then b.current_period_end end
    into v_base from public.nx_billing b where b.user_id = s.user_id;
  v_base := coalesce(v_base, now());
  v_end := v_base + case when s.period = 'year' then interval '1 year' else interval '1 month' end;
  -- Paiement unique, sans renouvellement automatique : cancel_at_period_end = vrai (relance « prolonge »).
  v_r := public.nx_billing_apply(p_secret, 'saspay', 'saspay:' || left(p_transaction, 80), s.user_id, 'active', s.period, v_end, null, null,
    s.amount_cents, s.currency, 'transaction.success', true);
  if coalesce((v_r ->> 'ok')::boolean, false) is not true then return v_r; end if;
  if coalesce((v_r ->> 'duplicate')::boolean, false) is not true then
    -- Commission du parrain : montant payé par le filleul (remise comprise), une par transaction.
    v_commission := public.nx_referral_commission_add(s.user_id, s.amount_cents, s.currency, 'saspay', 'saspay:' || left(p_transaction, 80), s.period);
  end if;
  update public.nx_pay_sessions set status = 'paid', transaction_id = left(p_transaction, 80), paid_at = now(),
    net_amount = left(p_net, 24), charged = left(p_charged, 24), paid_currency = left(p_currency, 8)
  where id = s.id;
  return v_r || jsonb_build_object('period', s.period, 'period_end', v_end, 'commission', v_commission);
end
$$;

revoke all on function public.nx_pay_session_open(text, text, uuid, uuid, text, integer, text, text, text), public.nx_pay_session_find(text, uuid),
  public.nx_pay_sessions_pending(text, text), public.nx_pay_session_fail(text, text, text), public.nx_pay_apply(text, text, text, text, text, text)
  from public, anon, authenticated;
-- Le Worker les appelle avec la clé publique et le secret partagé (vérifié dans chaque fonction), comme nx_billing_apply.
grant execute on function public.nx_pay_session_open(text, text, uuid, uuid, text, integer, text, text, text), public.nx_pay_session_find(text, uuid),
  public.nx_pay_sessions_pending(text, text), public.nx_pay_session_fail(text, text, text), public.nx_pay_apply(text, text, text, text, text, text)
  to anon, authenticated;
