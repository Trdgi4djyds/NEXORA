-- NEXORA #104 : e-mails construits par la base dans la direction « Horizon » (comme les modèles du back office).
-- Les e-mails écrits directement en SQL (alerte de secours sans modèle, incidents des pages de statut, confirmation
-- d'abonnement, rapport mensuel) n'étaient qu'un bloc de texte sans cadre. nx_email_frame les pose dans le même cadre
-- que les modèles du back office : logo et nom de NEXORA, carte blanche à grands rayons et filet noir, police Urbanist
-- (Helvetica ou Arial sinon), boutons en pilule, pied de page. Les e-mails déjà mis en page par un modèle (document
-- HTML complet, « <!doctype ») passent sans changement. nx_brevo_post garde sa signature et son comportement ; seul le
-- contenu HTML passe par nx_email_frame. Rejouable sans effet en double.

create or replace function public.nx_email_frame(p_html text)
returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  v_web text;
  v_inner text;
  v_font constant text := 'Urbanist,''Helvetica Neue'',Helvetica,Arial,sans-serif';
begin
  if coalesce(p_html, '') = '' or p_html ~* '<!doctype' then
    return p_html;
  end if;
  select value #>> '{}' into v_web from public.app_config where key = 'web_url';
  v_web := coalesce(nullif(v_web, ''), 'https://nexoradevs.online/studio/');
  if right(v_web, 1) <> '/' then v_web := v_web || '/'; end if;
  -- Contenu simple : police de la marque, encre noire, boutons en pilule, marge intérieure portée par la carte.
  v_inner := replace(p_html, 'font-family:Inter,Segoe UI,Arial,sans-serif', 'font-family:' || v_font);
  v_inner := replace(v_inner, '#1d1d1f', '#0a0a0a');
  v_inner := replace(v_inner, '#3a3a3c', '#3d3d3d');
  v_inner := replace(v_inner, '#6e6e73', '#6b6b6b');
  v_inner := replace(v_inner, 'padding:28px 24px', 'padding:0');
  v_inner := regexp_replace(v_inner, 'border-radius:[0-9]+px', 'border-radius:999px', 'g');
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8">'
    || '<meta name="viewport" content="width=device-width,initial-scale=1">'
    || '<meta name="color-scheme" content="light">'
    || '<link href="https://fonts.googleapis.com/css2?family=Urbanist:wght@300;400;500;600;700&amp;display=swap" rel="stylesheet">'
    || '</head><body style="margin:0;padding:0;background:#f2f2f2;font-family:' || v_font || '">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f2f2"><tr><td align="center" style="padding:36px 16px">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;border-collapse:separate">'
    || '<tr><td style="padding:0 8px 18px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
    || '<td style="vertical-align:middle"><a href="' || public.nx_html(v_web) || '" target="_blank"><img src="' || public.nx_html(v_web || 'logo.png')
    || '" width="36" height="36" alt="NEXORA" style="display:block;width:36px;height:36px;border-radius:10px"></a></td>'
    || '<td style="vertical-align:middle;padding-left:11px;font-size:16px;font-weight:600;letter-spacing:3px;color:#0a0a0a">NEXORA</td>'
    || '</tr></table></td></tr>'
    || '<tr><td style="background:#ffffff;border:1px solid #e3e3e3;border-radius:28px;overflow:hidden">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate">'
    || '<tr><td height="8" style="height:8px;line-height:8px;font-size:0;background:#0a0a0a;border-radius:27px 27px 0 0">&nbsp;</td></tr>'
    || '<tr><td style="padding:32px 38px 30px">' || v_inner || '</td></tr></table></td></tr>'
    || '<tr><td align="center" style="padding:24px 24px 6px;font-size:12.5px;line-height:1.6;color:#6b6b6b">'
    || '<p style="margin:0 0 12px"><a href="' || public.nx_html(v_web) || '" target="_blank" style="display:inline-block;padding:8px 16px;border-radius:999px;border:1px solid #d6d6d6;color:#0a0a0a;text-decoration:none;font-weight:600">Ouvrir NEXORA&nbsp;&#8599;</a></p>'
    || '<p style="margin:0"><b style="color:#0a0a0a;letter-spacing:1.5px">NEXORA</b> · crée, teste et publie tes sites et applications.</p>'
    || '</td></tr></table></td></tr></table></body></html>';
end
$$;

create or replace function public.nx_brevo_post(p_to text, p_to_name text, p_subject text, p_html text, p_text text, p_tag text, p_attachments jsonb default null)
returns bigint
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_key text;
  v_cfg jsonb;
  v_to jsonb;
  v_body jsonb;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'brevo_api_key';
  select value into v_cfg from public.app_config where key = 'email_alerts';
  if v_key is null or coalesce(v_cfg ->> 'sender_email', '') = '' or coalesce(p_to, '') = '' then
    return null;
  end if;
  v_to := jsonb_build_object('email', p_to);
  if coalesce(p_to_name, '') <> '' then v_to := v_to || jsonb_build_object('name', p_to_name); end if;
  v_body := jsonb_build_object(
    'sender', jsonb_build_object('email', v_cfg ->> 'sender_email', 'name', coalesce(nullif(v_cfg ->> 'sender_name', ''), 'NEXORA')),
    'to', jsonb_build_array(v_to),
    'subject', left(coalesce(nullif(p_subject, ''), 'NEXORA'), 200),
    'htmlContent', coalesce(public.nx_email_frame(p_html), ''),
    'tags', jsonb_build_array('nexora-' || lower(coalesce(nullif(p_tag, ''), 'email'))));
  if coalesce(p_text, '') <> '' then v_body := v_body || jsonb_build_object('textContent', p_text); end if;
  if p_attachments is not null and jsonb_typeof(p_attachments) = 'array' and jsonb_array_length(p_attachments) > 0 then
    v_body := v_body || jsonb_build_object('attachment', p_attachments);
  end if;
  return net.http_post(
    url := 'https://api.brevo.com/v3/smtp/email',
    body := v_body,
    headers := jsonb_build_object('api-key', v_key, 'Content-Type', 'application/json', 'Accept', 'application/json'),
    timeout_milliseconds := 15000
  );
end
$$;

revoke all on function public.nx_email_frame(text) from public, anon, authenticated;
revoke all on function public.nx_brevo_post(text, text, text, text, text, text, jsonb) from public, anon, authenticated;
