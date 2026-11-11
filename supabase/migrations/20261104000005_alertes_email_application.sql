-- NEXORA #030 — Alertes e-mail de l'application Windows par les serveurs NEXORA (Brevo) : la supervision locale envoie ses alertes à l'adresse du compte connecté, sans réglage chez l'utilisateur. Plafond : 20 par heure et 60 par jour et par compte. Idempotent.
-- Repose sur public.nx_brevo_send (migration 20261104000004) : clé API Brevo dans le coffre et expéditeur
-- dans app_config.email_alerts, réglés dans le back office (section Supabase, carte « E-mails (Brevo) »).
-- Le destinataire est toujours l'adresse du compte qui appelle : impossible d'écrire à quelqu'un d'autre.
create table if not exists public.nx_email_log (
  id bigserial primary key,
  user_id uuid not null,
  request_id bigint,
  kind text not null default 'alerte',
  created_at timestamptz not null default now()
);
create index if not exists nx_email_log_user_at on public.nx_email_log (user_id, created_at desc);
create index if not exists nx_email_log_request on public.nx_email_log (request_id);
-- Aucune politique : la table n'est lue et écrite que par les fonctions ci-dessous.
alter table public.nx_email_log enable row level security;

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
begin
  if v_uid is null then
    raise exception 'Connecte-toi à ton compte NEXORA pour recevoir les alertes par e-mail.';
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
    raise exception 'Les e-mails ne sont pas encore configurés sur les serveurs NEXORA (clé Brevo ou expéditeur manquants dans le back office).';
  end if;
  delete from public.nx_email_log where user_id = v_uid and created_at < now() - interval '30 days';
  insert into public.nx_email_log (user_id, request_id, kind) values (v_uid, v_id, v_kind);
  return jsonb_build_object('ok', true, 'id', v_id, 'to', v_email);
end
$$;

-- Réponse de Brevo à un envoi de l'appelant (null tant qu'elle n'est pas arrivée).
create or replace function public.nx_alert_email_result(p_id bigint)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v jsonb;
begin
  if auth.uid() is null or not exists (select 1 from public.nx_email_log where request_id = p_id and user_id = auth.uid()) then
    return null;
  end if;
  select jsonb_build_object('status', r.status_code, 'error', r.error_msg, 'content', left(r.content::text, 300))
    into v
  from net._http_response r
  where r.id = p_id;
  return v;
end
$$;

revoke all on function public.nx_alert_email(text, text, text) from public, anon;
revoke all on function public.nx_alert_email_result(bigint) from public, anon;
grant execute on function public.nx_alert_email(text, text, text) to authenticated;
grant execute on function public.nx_alert_email_result(bigint) to authenticated;
