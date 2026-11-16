-- NEXORA #127 : NEXORA REFERRAL sans manipulation : les e-mails des parrains partent tout seuls.
-- Jusqu'ici, « Inviter un parrain » affichait un lien et un code à recopier à la main (le lien, construit sur
-- l'adresse de NEXORA web, menait en plus à une page 404) et chaque nouveau code du mois devait être transmis par
-- l'administrateur. Désormais :
--   * l'invitation part par e-mail dès sa création : bouton « Activer mon espace de parrain » (lien vers /referral/
--     avec le code déjà rempli), code d'accès du mois, étapes ; renvoi possible depuis le back office ;
--   * un nouveau lien ou un nouveau code créé dans le back office est envoyé aussitôt ;
--   * le code de chaque mois est envoyé automatiquement (tâche quotidienne : codes pas encore envoyés ni saisis ;
--     les parrains invités reçoivent de nouveau leur invitation avec le code du mois) ;
--   * l'espace des parrains propose « Recevoir mon code par e-mail » (adresse du parrain seulement, une fois toutes
--     les 5 minutes).
-- Envois par nx_brevo_post (clé Brevo du coffre, expéditeur des alertes), journal nx_email_log, quota du jour.
-- Rejouable sans effet en double.

-- ---------- 1. Outils ----------
-- Adresse de l'espace des parrains : même domaine que NEXORA web (app_config.web_url), chemin /referral/.
create or replace function public.nx_referral_portal_url()
returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  v_web text;
begin
  select value #>> '{}' into v_web from public.app_config where key = 'web_url';
  return coalesce(substring(coalesce(nullif(v_web, ''), 'https://nexoradevs.online/studio/') from '^(https?://[^/?#]+)'), 'https://nexoradevs.online') || '/referral/';
end
$$;

-- Mois en toutes lettres (« novembre 2026 »), indépendant de la langue du serveur.
create or replace function public.nx_month_fr(p date)
returns text
language sql immutable set search_path = public
as $$
  select (array['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'])[extract(month from p)::int]
    || ' ' || extract(year from p)::int;
$$;

-- Taux à la française (« 30 », « 2,5 »).
create or replace function public.nx_pct_fr(p numeric)
returns text
language sql immutable set search_path = public
as $$
  select replace(trim_scale(coalesce(p, 0))::text, '.', ',');
$$;

-- Date d'envoi du code du mois (une ligne par parrain et par mois).
alter table public.nx_partner_access_codes add column if not exists mailed_at timestamptz;

-- ---------- 2. E-mail d'un parrain ----------
-- Parrain invité : invitation (lien d'activation avec le code déjà rempli, code, étapes). Parrain actif : code du mois
-- (lien vers l'espace avec le code déjà rempli). p_note : phrase ajoutée en tête (nouveau lien, nouveau code).
-- Ne lève pas d'erreur : renvoie { sent, reason } (config : Brevo non réglé ; quota : quota du jour atteint ; error : envoi
-- refusé par la base).
create or replace function public.nx_partner_mail(p_partner uuid, p_note text default '')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  p public.nx_partners;
  c public.nx_partner_access_codes;
  r jsonb := public.nx_referral_prices();
  v_portal text := public.nx_referral_portal_url();
  v_invite boolean;
  v_first text;
  v_month text;
  v_until text;
  v_link text;
  v_subject text;
  v_title text;
  v_btn text;
  v_intro text;
  v_steps text;
  v_html text;
  v_text text;
  v_id bigint;
  v_p constant text := 'margin:0 0 14px;font-size:15px;line-height:1.6;color:#3d3d3d';
begin
  select * into p from public.nx_partners where id = p_partner;
  if not found then return jsonb_build_object('sent', false, 'reason', 'partner'); end if;
  if p.status = 'suspended' then return jsonb_build_object('sent', false, 'reason', 'suspended', 'to', p.email); end if;
  v_invite := p.status = 'invited';
  if v_invite and p.invite_token is null then
    update public.nx_partners set invite_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), invite_created_at = now()
    where id = p.id returning * into p;
  end if;
  c := public.nx_partner_access_code(p.id, false);
  begin
    perform public.nx_email_quota(1);
  exception when others then
    return jsonb_build_object('sent', false, 'reason', 'quota', 'message', sqlerrm, 'to', p.email);
  end;
  v_first := coalesce(nullif(split_part(trim(p.name), ' ', 1), ''), 'à vous');
  v_month := public.nx_month_fr(c.month);
  v_until := to_char(c.month + interval '1 month' - interval '1 day', 'DD/MM/YYYY'); -- dernier jour du mois
  if v_invite then
    v_link := v_portal || '#/invitation/' || p.invite_token || '/' || c.code;
    v_subject := 'Votre invitation au programme de parrainage NEXORA';
    v_title := 'Bienvenue, ' || v_first || '.';
    v_btn := 'Activer mon espace de parrain';
    v_intro := 'L’équipe NEXORA vous invite au programme de parrainage NEXORA REFERRAL : vos filleuls ont '
      || public.nx_pct_fr((r ->> 'discount_pct')::numeric) || ' % de remise sur l’offre Pro, à chaque paiement, et vous touchez '
      || public.nx_pct_fr((r ->> 'commission_pct')::numeric) || ' % de ce qu’ils paient.';
    v_steps := '<ol style="margin:0 0 18px;padding-left:20px;font-size:14.5px;line-height:1.7;color:#3d3d3d">'
      || '<li>Cliquez sur « ' || v_btn || ' ».</li>'
      || '<li>Confirmez votre adresse, <b>' || public.nx_html(p.email) || '</b> : un lien de connexion vous est envoyé, sans mot de passe. Ouvrez-le sur le même appareil.</li>'
      || '<li>Votre code est déjà rempli : cliquez sur « Activer mon accès ». Votre espace s’ouvre.</li></ol>';
  else
    v_link := v_portal || '#/code/' || c.code;
    v_subject := 'Votre code d’accès NEXORA REFERRAL de ' || v_month;
    v_title := 'Votre code de ' || v_month || '.';
    v_btn := 'Ouvrir mon espace de parrain';
    v_intro := 'Pour votre sécurité, l’accès à votre espace de parrain change chaque mois. Voici votre code de ' || v_month
      || ' : le bouton ouvre votre espace avec le code déjà rempli.';
    v_steps := '';
  end if;
  v_html := '<p style="margin:0 0 16px"><span style="display:inline-block;padding:6px 13px;border-radius:999px;border:1px solid #d6d6d6;font-size:12.5px;font-weight:500;color:#6b6b6b">/&nbsp;NEXORA REFERRAL</span></p>'
    || '<h1 style="margin:0 0 18px;font-size:28px;line-height:1.15;font-weight:300;letter-spacing:-.5px;color:#0a0a0a">' || public.nx_html(v_title) || '</h1>'
    || '<p style="' || v_p || '">Bonjour ' || public.nx_html(v_first) || ',</p>'
    || case when coalesce(p_note, '') <> '' then '<p style="' || v_p || '"><b>' || public.nx_html(p_note) || '</b></p>' else '' end
    || '<p style="' || v_p || '">' || public.nx_html(v_intro) || '</p>'
    || '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0"><tr><td align="center" bgcolor="#0a0a0a" style="border-radius:999px;background:#0a0a0a">'
    || '<a href="' || public.nx_html(v_link) || '" target="_blank" style="display:inline-block;padding:15px 30px;font-size:15px;font-weight:600;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:999px">'
    || public.nx_html(v_btn) || '&nbsp;&nbsp;&#8599;</a></td></tr></table>'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px"><tr><td style="background:#f5f5f5;border-radius:20px;padding:16px 22px">'
    || '<div style="margin:0 0 4px;font-size:12.5px;line-height:1.5;color:#6b6b6b">Code d’accès de ' || public.nx_html(v_month) || ' · valable jusqu’au ' || v_until || '</div>'
    || '<div style="font-size:26px;line-height:1.3;font-weight:600;letter-spacing:4px;color:#0a0a0a;font-family:Menlo,Consolas,monospace">' || public.nx_html(c.code) || '</div></td></tr></table>'
    || v_steps
    || '<p style="margin:0;font-size:13px;line-height:1.6;color:#6b6b6b">Un nouveau code vous est envoyé automatiquement au début de chaque mois. Si le bouton ne s’ouvre pas, copiez ce lien dans votre navigateur :<br>'
    || '<a href="' || public.nx_html(v_link) || '" target="_blank" style="color:#0a0a0a;word-break:break-all">' || public.nx_html(v_link) || '</a></p>';
  v_text := v_title || E'\n\nBonjour ' || v_first || E',\n\n'
    || case when coalesce(p_note, '') <> '' then p_note || E'\n\n' else '' end
    || v_intro || E'\n\n' || v_btn || ' : ' || v_link || E'\n\nCode d’accès de ' || v_month || ' (valable jusqu’au ' || v_until || ') : ' || c.code
    || case when v_invite then E'\n\n1. Ouvrez le lien ci-dessus.\n2. Confirmez votre adresse (' || p.email || E') : un lien de connexion vous est envoyé, sans mot de passe.\n3. Votre code est déjà rempli : cliquez sur « Activer mon accès ».' else '' end
    || E'\n\nUn nouveau code vous est envoyé automatiquement au début de chaque mois.\n\nL’équipe NEXORA';
  begin
    v_id := public.nx_brevo_post(p.email, p.name, v_subject, v_html, v_text, 'parrainage', null);
  exception when others then
    return jsonb_build_object('sent', false, 'reason', 'error', 'message', sqlerrm, 'to', p.email);
  end;
  if v_id is null then return jsonb_build_object('sent', false, 'reason', 'config', 'to', p.email); end if;
  insert into public.nx_email_log (user_id, request_id, kind, to_email)
  values (p.user_id, v_id, case when v_invite then 'parrainage-invitation' else 'parrainage-code' end, p.email);
  update public.nx_partner_access_codes set mailed_at = now() where partner_id = p.id and month = c.month;
  return jsonb_build_object('sent', true, 'id', v_id, 'to', p.email, 'kind', case when v_invite then 'invite' else 'code' end, 'link', v_link);
end
$$;

-- Codes du mois pas encore envoyés ni saisis (tâche quotidienne et bouton du back office) ; s'arrête si Brevo n'est
-- pas réglé ou si le quota du jour est atteint (les suivants partent au passage suivant).
create or replace function public.nx_referral_month_mail()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  x record;
  r jsonb;
  n integer := 0;
  v_stop text := '';
begin
  perform public.nx_referral_month_codes();
  for x in
    select pa.id from public.nx_partners pa
    join public.nx_partner_access_codes a on a.partner_id = pa.id and a.month = public.nx_month_start()
    where pa.status <> 'suspended' and a.mailed_at is null and pa.unlocked_month is distinct from public.nx_month_start()
    order by pa.created_at
    limit 200
  loop
    r := public.nx_partner_mail(x.id, '');
    if coalesce((r ->> 'sent')::boolean, false) then
      n := n + 1;
    elsif r ->> 'reason' in ('config', 'quota') then
      v_stop := r ->> 'reason';
      exit;
    end if;
  end loop;
  return jsonb_build_object('sent', n, 'stopped', nullif(v_stop, ''),
    'left', (select count(*) from public.nx_partners pa join public.nx_partner_access_codes a on a.partner_id = pa.id and a.month = public.nx_month_start()
      where pa.status <> 'suspended' and a.mailed_at is null and pa.unlocked_month is distinct from public.nx_month_start()));
end
$$;

-- ---------- 3. Back office ----------
-- Invitation : parrain créé puis e-mail envoyé aussitôt (lien, code, étapes).
create or replace function public.nx_admin_partner_create(p_email text, p_name text, p_note text default '')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  p public.nx_partners;
  c public.nx_partner_access_codes;
  v_mail jsonb;
begin
  if not public.nx_is_admin() then raise exception 'Réservé aux administrateurs de NEXORA.'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Adresse e-mail invalide.'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Indiquez le nom du parrain.'; end if;
  if exists (select 1 from public.nx_partners where lower(email) = v_email) then raise exception 'Un parrain existe déjà avec cette adresse.'; end if;
  insert into public.nx_partners (email, name, note, invite_token, invite_created_at, created_by)
  values (v_email, left(trim(p_name), 80), left(coalesce(p_note, ''), 500),
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), now(), auth.uid())
  returning * into p;
  c := public.nx_partner_access_code(p.id, false);
  perform public.nx_referral_audit('partner.create', jsonb_build_object('partner', p.id, 'email', p.email));
  v_mail := public.nx_partner_mail(p.id, '');
  return jsonb_build_object('partner', to_jsonb(p), 'invite_token', p.invite_token, 'code', c.code, 'month', c.month, 'expires_at', public.nx_month_end(),
    'link', public.nx_referral_portal_url() || '#/invitation/' || p.invite_token || '/' || c.code, 'email', v_mail);
end
$$;

-- Renvoi : invitation (parrain invité) ou code du mois (parrain actif).
create or replace function public.nx_admin_partner_send(p_partner uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_mail jsonb;
begin
  if not public.nx_is_admin() then raise exception 'Réservé aux administrateurs de NEXORA.'; end if;
  if not exists (select 1 from public.nx_partners where id = p_partner) then raise exception 'Parrain introuvable.'; end if;
  v_mail := public.nx_partner_mail(p_partner, '');
  perform public.nx_referral_audit('partner.mail', jsonb_build_object('partner', p_partner, 'sent', v_mail -> 'sent', 'reason', v_mail -> 'reason'));
  return v_mail;
end
$$;

-- Nouveau lien d'invitation : l'ancien ne marche plus, le nouveau part aussitôt par e-mail.
create or replace function public.nx_admin_partner_invite_reset(p_partner uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  p public.nx_partners;
  v_mail jsonb;
begin
  if not public.nx_is_admin() then raise exception 'Réservé aux administrateurs de NEXORA.'; end if;
  update public.nx_partners set invite_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), invite_created_at = now()
  where id = p_partner and user_id is null and status = 'invited' returning * into p;
  if not found then raise exception 'Ce parrain a déjà activé son accès : il se connecte avec son adresse e-mail et le code du mois.'; end if;
  perform public.nx_referral_audit('partner.invite_reset', jsonb_build_object('partner', p.id));
  v_mail := public.nx_partner_mail(p.id, 'Votre lien d’invitation a été renouvelé : l’ancien ne fonctionne plus.');
  return jsonb_build_object('invite_token', p.invite_token, 'link', v_mail ->> 'link', 'email', v_mail);
end
$$;

-- Code du mois ; p_regenerate : nouveau code (l'ancien ne marche plus), envoyé aussitôt par e-mail.
create or replace function public.nx_admin_partner_code(p_partner uuid, p_regenerate boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  c public.nx_partner_access_codes;
  v_mail jsonb;
begin
  if not public.nx_is_admin() then raise exception 'Réservé aux administrateurs de NEXORA.'; end if;
  if not exists (select 1 from public.nx_partners where id = p_partner) then raise exception 'Parrain introuvable.'; end if;
  c := public.nx_partner_access_code(p_partner, coalesce(p_regenerate, false));
  if p_regenerate then
    perform public.nx_referral_audit('partner.code_regenerate', jsonb_build_object('partner', p_partner));
    v_mail := public.nx_partner_mail(p_partner, 'Un nouveau code d’accès a été créé pour vous : l’ancien ne fonctionne plus.');
  end if;
  return jsonb_build_object('code', c.code, 'month', c.month, 'used_at', c.used_at, 'expires_at', public.nx_month_end(), 'email', v_mail);
end
$$;

-- Codes du mois pas encore envoyés : envoi immédiat depuis le back office.
create or replace function public.nx_admin_referral_mail_month()
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if not public.nx_is_admin() then raise exception 'Réservé aux administrateurs de NEXORA.'; end if;
  return public.nx_referral_month_mail();
end
$$;

-- Parrains avec leurs chiffres, le code du mois et sa date d'envoi.
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
      'month_code_mailed_at', (select a.mailed_at from public.nx_partner_access_codes a where a.partner_id = p.id and a.month = public.nx_month_start()),
      'unlocked', p.unlocked_month = public.nx_month_start(),
      'codes', (select count(*) from public.nx_referral_codes c where c.partner_id = p.id),
      'referrals', (select count(*) from public.nx_referrals r where r.partner_id = p.id),
      'recurring', public.nx_referral_mrr(p.id),
      'balance', public.nx_partner_balance(p.id)) order by p.created_at desc)
    from public.nx_partners p), '[]'::jsonb);
end
$$;

-- ---------- 4. Espace des parrains ----------
-- Lien d'invitation : l'adresse complète est renvoyée pour pré-remplir la connexion (le jeton, secret, n'est envoyé
-- qu'à cette adresse).
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
  return jsonb_build_object('valid', true, 'email', public.nx_mask_email(p.email), 'address', p.email, 'name', split_part(trim(p.name), ' ', 1),
    'expires_at', public.nx_month_end());
end
$$;

-- « Recevoir mon code par e-mail » : parrain connecté, ou invité connecté avec l'adresse invitée ; toujours envoyé à
-- l'adresse du parrain, au plus une fois toutes les 5 minutes.
create or replace function public.nx_partner_code_mail()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  p public.nx_partners;
  c public.nx_partner_access_codes;
  r jsonb;
begin
  if v_uid is null then raise exception 'Connexion requise.'; end if;
  select * into p from public.nx_partners where user_id = v_uid;
  if not found then
    select email into v_email from auth.users where id = v_uid;
    select * into p from public.nx_partners where lower(email) = lower(coalesce(v_email, '')) and status = 'invited' and user_id is null;
    if not found then return jsonb_build_object('sent', false, 'reason', 'partner'); end if;
  end if;
  if p.status = 'suspended' then return jsonb_build_object('sent', false, 'reason', 'suspended'); end if;
  select * into c from public.nx_partner_access_codes where partner_id = p.id and month = public.nx_month_start();
  if found and c.mailed_at > now() - interval '5 minutes' then
    return jsonb_build_object('sent', false, 'reason', 'recent', 'to', public.nx_mask_email(p.email));
  end if;
  r := public.nx_partner_mail(p.id, '');
  return jsonb_build_object('sent', coalesce((r ->> 'sent')::boolean, false), 'reason', r ->> 'reason', 'to', public.nx_mask_email(p.email));
end
$$;

-- ---------- 5. Tâche planifiée : codes du mois envoyés chaque jour à 6 h (UTC), dès le 1er ----------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where command ilike '%nx_referral_month_mail%') then
      perform cron.schedule('nexora-referral-mail', '0 6 * * *', 'select public.nx_referral_month_mail()');
    end if;
  end if;
end
$$;

-- ---------- 6. Droits ----------
revoke all on function public.nx_referral_portal_url(), public.nx_month_fr(date), public.nx_pct_fr(numeric),
  public.nx_partner_mail(uuid, text), public.nx_referral_month_mail() from public, anon, authenticated;
revoke all on function public.nx_admin_partner_create(text, text, text), public.nx_admin_partner_send(uuid), public.nx_admin_partner_invite_reset(uuid),
  public.nx_admin_partner_code(uuid, boolean), public.nx_admin_referral_mail_month(), public.nx_admin_partners(), public.nx_partner_code_mail() from public, anon;
grant execute on function public.nx_admin_partner_create(text, text, text), public.nx_admin_partner_send(uuid), public.nx_admin_partner_invite_reset(uuid),
  public.nx_admin_partner_code(uuid, boolean), public.nx_admin_referral_mail_month(), public.nx_admin_partners(), public.nx_partner_code_mail() to authenticated;
grant execute on function public.nx_partner_invite_info(text) to anon, authenticated;
