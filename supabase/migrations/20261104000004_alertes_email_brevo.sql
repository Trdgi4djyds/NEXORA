-- NEXORA #029 — Alertes de supervision par e-mail avec Brevo : chaque notification « monitor » (panne, lenteur, retour en ligne, rappel) est aussi envoyée par e-mail, par l'API Brevo (pg_net). Clé API chiffrée dans Supabase Vault. Idempotent.
-- Réglages : app_config.email_alerts = { enabled, sender_email, sender_name } (désactivé par défaut) ; clé API
-- enregistrée par public.nx_brevo_set_key() depuis le back office (section Supabase, carte « E-mails (Brevo) »).
-- Les fonctions ne sont accessibles qu'au propriétaire de la base (back office par l'API de gestion), jamais
-- aux rôles anon et authenticated. Une alerte qui ne part pas n'empêche jamais la notification dans NEXORA.
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

insert into public.app_config (key, value, description)
values (
  'email_alerts',
  jsonb_build_object('enabled', false, 'sender_email', '', 'sender_name', 'NEXORA'),
  'Alertes de supervision par e-mail (Brevo) : activation et expéditeur'
)
on conflict (key) do nothing;

-- Texte sûr dans un e-mail HTML.
create or replace function public.nx_html(p text)
returns text
language sql immutable
as $$
  select replace(replace(replace(replace(coalesce(p, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
$$;

-- Clé API Brevo (xkeysib-…) gardée chiffrée dans le coffre ; remplace l'ancienne si elle existe.
create or replace function public.nx_brevo_set_key(p_key text)
returns void
language plpgsql security definer set search_path = public, vault
as $$
declare
  v_id uuid;
begin
  if p_key is null or p_key !~ '^xkeysib-[A-Za-z0-9-]{20,}$' then
    raise exception 'Clé API Brevo invalide : elle commence par xkeysib-.';
  end if;
  select id into v_id from vault.secrets where name = 'brevo_api_key';
  if v_id is null then
    perform vault.create_secret(p_key, 'brevo_api_key', 'Clé API Brevo : alertes e-mail de NEXORA');
  else
    perform vault.update_secret(v_id, p_key);
  end if;
end
$$;

-- Envoi d'un e-mail par l'API Brevo ; renvoie l'identifiant de la requête pg_net (réponse dans
-- net._http_response), ou null si la clé, l'expéditeur ou le destinataire manquent.
create or replace function public.nx_brevo_send(p_to text, p_to_name text, p_subject text, p_text text, p_kicker text default 'Supervision')
returns bigint
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_key text;
  v_cfg jsonb;
  v_web text;
  v_to jsonb;
  v_html text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'brevo_api_key';
  select value into v_cfg from public.app_config where key = 'email_alerts';
  if v_key is null or coalesce(v_cfg ->> 'sender_email', '') = '' or coalesce(p_to, '') = '' then
    return null;
  end if;
  select value #>> '{}' into v_web from public.app_config where key = 'web_url';
  v_to := jsonb_build_object('email', p_to);
  if coalesce(p_to_name, '') <> '' then v_to := v_to || jsonb_build_object('name', p_to_name); end if;
  v_html := '<div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:28px 24px;color:#1d1d1f">'
    || '<div style="font-size:13px;font-weight:600;color:#007aff;margin-bottom:10px">NEXORA · ' || public.nx_html(p_kicker) || '</div>'
    || '<h1 style="font-size:20px;line-height:1.3;margin:0 0 12px">' || public.nx_html(p_subject) || '</h1>'
    || '<p style="font-size:15px;line-height:1.55;margin:0 0 22px;color:#3a3a3c">' || public.nx_html(p_text) || '</p>'
    || case when coalesce(v_web, '') <> '' then
         '<a href="' || public.nx_html(v_web) || '" style="display:inline-block;background:#007aff;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;font-size:14px">Ouvrir NEXORA</a>'
       else '' end
    || '<p style="font-size:12px;line-height:1.5;color:#6e6e73;margin:28px 0 0">Tu reçois cet e-mail parce que tu suis ce site dans une équipe NEXORA.</p>'
    || '</div>';
  return net.http_post(
    url := 'https://api.brevo.com/v3/smtp/email',
    body := jsonb_build_object(
      'sender', jsonb_build_object('email', v_cfg ->> 'sender_email', 'name', coalesce(nullif(v_cfg ->> 'sender_name', ''), 'NEXORA')),
      'to', jsonb_build_array(v_to),
      'subject', left(p_subject, 200),
      'textContent', p_text || case when coalesce(v_web, '') <> '' then E'\n\n' || v_web else '' end,
      'htmlContent', v_html,
      'tags', jsonb_build_array('nexora-' || lower(p_kicker))
    ),
    headers := jsonb_build_object('api-key', v_key, 'Content-Type', 'application/json', 'Accept', 'application/json'),
    timeout_milliseconds := 10000
  );
end
$$;

-- E-mail de test depuis le back office (le résultat se lit dans net._http_response).
create or replace function public.nx_brevo_test(p_to text)
returns bigint
language sql security definer set search_path = public
as $$
  select public.nx_brevo_send(p_to, '', 'Test des alertes NEXORA',
    'Cet e-mail confirme que les alertes de supervision de NEXORA partent bien par Brevo. Tu recevras un message de ce type quand un site surveillé tombe en panne, devient lent ou revient en ligne.',
    'Test');
$$;

-- Chaque notification de supervision part aussi par e-mail, si les alertes sont activées.
create or replace function public.nx_notification_email()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_cfg jsonb;
  v_email text;
  v_name text;
begin
  select value into v_cfg from public.app_config where key = 'email_alerts';
  if coalesce((v_cfg ->> 'enabled')::boolean, false) is not true then return new; end if;
  select u.email, coalesce(p.full_name, '') into v_email, v_name
  from auth.users u left join public.profiles p on p.id = u.id
  where u.id = new.user_id;
  begin
    perform public.nx_brevo_send(v_email, v_name, new.title, new.body);
  exception when others then
    raise warning 'NEXORA : alerte e-mail non envoyée (%).', sqlerrm;
  end;
  return new;
end
$$;

drop trigger if exists nx_notification_email on public.notifications;
create trigger nx_notification_email
  after insert on public.notifications
  for each row when (new.kind = 'monitor')
  execute function public.nx_notification_email();

revoke all on function public.nx_brevo_set_key(text) from public, anon, authenticated;
revoke all on function public.nx_brevo_send(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.nx_brevo_test(text) from public, anon, authenticated;
revoke all on function public.nx_notification_email() from public, anon, authenticated;
