-- NEXORA #031 — E-mails aux couleurs de NEXORA et factures PDF. Idempotent.
-- Repose sur 20261104000004 (nx_html, clé Brevo dans le coffre, app_config.email_alerts : expéditeur) et
-- 20261104000005 (journal des envois nx_email_log).
--  * Alertes de supervision : nx_brevo_send garde sa signature mais met l'alerte dans le modèle enregistré
--    depuis le back office (app_config.email_templates.alert, variables {{titre}}…), couleur selon la gravité.
--  * Back office (administrateurs) : e-mail d'exemple, annonce de mise à jour à un public, facture avec son
--    PDF en pièce jointe ; quota quotidien de Brevo vérifié avant chaque envoi.
--  * Factures : table invoices (lignes, totaux calculés par la base, numérotation NX-AAAA-0001 à l'émission,
--    facture émise non modifiable), émetteur dans nx_private_config (lisible par les administrateurs seuls).

-- Administrateur de NEXORA (rôle admin ou superadmin).
create or replace function public.nx_is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.app_role in ('admin', 'superadmin'));
$$;

-- Journal des envois (créé par la migration 20261104000005) : ouvert aux envois sans compte destinataire.
create table if not exists public.nx_email_log (
  id bigserial primary key,
  user_id uuid,
  request_id bigint,
  kind text not null default 'alerte',
  created_at timestamptz not null default now()
);
alter table public.nx_email_log alter column user_id drop not null;
alter table public.nx_email_log add column if not exists to_email text;
create index if not exists nx_email_log_at on public.nx_email_log (created_at desc);
alter table public.nx_email_log enable row level security;
-- Les administrateurs lisent le journal (quota du jour, derniers envois) ; les écritures passent par les fonctions.
drop policy if exists nx_email_log_admin on public.nx_email_log;
create policy nx_email_log_admin on public.nx_email_log for select to authenticated using (public.nx_is_admin());
revoke all on public.nx_email_log from anon;
grant select on public.nx_email_log to authenticated;

-- Modèles des e-mails envoyés par la base (écrits par le back office → E-mails → « Appliquer les modèles »).
insert into public.app_config (key, value, description)
values ('email_templates', '{}'::jsonb, 'Modèles des e-mails envoyés par la base (NEXORA #031), enregistrés depuis le back office → E-mails')
on conflict (key) do nothing;

-- Réglages réservés aux administrateurs (émetteur des factures…).
create table if not exists public.nx_private_config (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.nx_private_config enable row level security;
drop policy if exists nx_private_config_admin on public.nx_private_config;
create policy nx_private_config_admin on public.nx_private_config
  for all to authenticated using (public.nx_is_admin()) with check (public.nx_is_admin());
revoke all on public.nx_private_config from anon;
grant select, insert, update on public.nx_private_config to authenticated;
insert into public.nx_private_config (key, value) values ('invoice_issuer', jsonb_build_object(
  'name', 'NEXORA', 'address', '', 'email', '', 'phone', '', 'website', 'https://nexora.abrahamtogbonon0.workers.dev/',
  'tax_id', '', 'vat_note', 'TVA non applicable', 'currency', 'EUR', 'tax_rate', 0, 'due_days', 30, 'prefix', 'NX',
  'payment', '', 'footer', 'Merci de ta confiance.'))
on conflict (key) do nothing;

-- Remplace les variables {{nom}} d'un modèle. Les valeurs sont insérées telles quelles : à échapper avant.
create or replace function public.nx_email_render(p_tpl text, p_vars jsonb)
returns text
language plpgsql immutable
as $$
declare
  k text;
  v text;
  r text := coalesce(p_tpl, '');
begin
  for k, v in select key, value from jsonb_each_text(coalesce(p_vars, '{}'::jsonb)) loop
    r := replace(r, '{{' || k || '}}', coalesce(v, ''));
  end loop;
  return r;
end
$$;

-- Retire le pictogramme de tête d'un texte d'alerte (pastilles de couleur, symboles, espaces).
create or replace function public.nx_strip_icon(p text)
returns text
language plpgsql immutable
as $$
declare
  s text := coalesce(p, '');
  c integer;
begin
  loop
    exit when s = '';
    c := ascii(left(s, 1));
    exit when not (c in (9, 10, 13, 32, 160, 8205, 65039) or c between 8192 and 8303 or c between 8592 and 11263 or c between 126976 and 129791);
    s := substr(s, 2);
  end loop;
  return s;
end
$$;

-- Envoi d'un e-mail par l'API Brevo (HTML, texte, étiquette, pièces jointes [{content: base64, name}]) ;
-- renvoie l'identifiant de la requête pg_net, ou null si la clé, l'expéditeur ou le destinataire manquent.
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
    'htmlContent', coalesce(p_html, ''),
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

-- Alerte de supervision (même signature qu'en 20261104000004, appelée par le déclencheur des notifications
-- et par nx_alert_email) : niveau déduit du texte, date à l'heure du destinataire, modèle du back office.
create or replace function public.nx_brevo_send(p_to text, p_to_name text, p_subject text, p_text text, p_kicker text default 'Supervision')
returns bigint
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_tpl text;
  v_web text;
  v_all text := coalesce(p_subject, '') || ' ' || coalesce(p_text, '');
  v_title text := left(coalesce(nullif(public.nx_strip_icon(p_subject), ''), 'Alerte NEXORA'), 200);
  v_msg text := public.nx_strip_icon(p_text);
  v_label text;
  v_color text;
  v_tint text;
  v_tz text;
  v_at timestamp;
  v_date text;
  v_html text;
  v_months text[] := array['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
begin
  select value -> 'alert' ->> 'html' into v_tpl from public.app_config where key = 'email_templates';
  select value #>> '{}' into v_web from public.app_config where key = 'web_url';
  v_web := coalesce(nullif(v_web, ''), 'https://nexora.abrahamtogbonon0.workers.dev/');
  if v_msg = '' then v_msg := v_title; end if;

  if lower(coalesce(p_kicker, '')) = 'test' then
    v_label := 'Test'; v_color := '#4f62f5'; v_tint := '#eef0ff';
  elsif v_all ~ '🟢' or v_all ~* '(de nouveau|renouvel|normalement|rétabli)' then
    v_label := 'Retour à la normale'; v_color := '#1f9d55'; v_tint := '#e7f6ee';
  elsif v_all ~* 'certificat' then
    if v_all ~ '🔴' or v_all ~* 'a expiré' then
      v_label := 'Certificat expiré'; v_color := '#e5302a'; v_tint := '#fdecec';
    else
      v_label := 'Certificat bientôt expiré'; v_color := '#d97706'; v_tint := '#fff4e0';
    end if;
  elsif v_all ~ '🔴' or v_all ~* '(hors ligne|injoignable|panne)' then
    v_label := 'Site hors ligne'; v_color := '#e5302a'; v_tint := '#fdecec';
  elsif v_all ~ '🟠' or v_all ~* '(est lent|lenteur|ralenti)' then
    v_label := 'Lenteur'; v_color := '#d97706'; v_tint := '#fff4e0';
  else
    v_label := 'Alerte'; v_color := '#7b4fe6'; v_tint := '#f3eefe';
  end if;

  select nullif(p.timezone, '') into v_tz from public.profiles p where lower(p.email) = lower(p_to) limit 1;
  begin
    v_at := now() at time zone coalesce(v_tz, 'Europe/Paris');
  exception when others then
    v_at := now() at time zone 'Europe/Paris';
  end;
  v_date := extract(day from v_at)::int || ' ' || v_months[extract(month from v_at)::int] || ' ' || extract(year from v_at)::int || ' à ' || to_char(v_at, 'HH24:MI');

  if coalesce(v_tpl, '') <> '' then
    v_html := public.nx_email_render(v_tpl, jsonb_build_object(
      'titre', public.nx_html(v_title),
      'message', replace(public.nx_html(v_msg), E'\n', '<br>'),
      'niveau', public.nx_html(v_label),
      'couleur', v_color,
      'fond', v_tint,
      'date', public.nx_html(v_date),
      'lien', public.nx_html(v_web),
      'kicker', public.nx_html(coalesce(nullif(p_kicker, ''), 'Supervision')),
      'apercu', public.nx_html(left(v_msg, 140)),
      'annee', extract(year from v_at)::int::text));
  else
    -- Modèles pas encore enregistrés depuis le back office : version simple.
    v_html := '<div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:28px 24px;color:#1d1d1f">'
      || '<div style="font-size:13px;font-weight:600;color:' || v_color || ';margin-bottom:10px">NEXORA · ' || public.nx_html(v_label) || '</div>'
      || '<h1 style="font-size:20px;line-height:1.3;margin:0 0 12px">' || public.nx_html(v_title) || '</h1>'
      || '<p style="font-size:15px;line-height:1.55;margin:0 0 22px;color:#3a3a3c">' || replace(public.nx_html(v_msg), E'\n', '<br>') || '</p>'
      || '<a href="' || public.nx_html(v_web) || '" style="display:inline-block;background:' || v_color || ';color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;font-size:14px">Ouvrir NEXORA</a>'
      || '<p style="font-size:12px;line-height:1.5;color:#6e6e73;margin:28px 0 0">' || public.nx_html(v_date) || '</p></div>';
  end if;

  return public.nx_brevo_post(p_to, p_to_name, v_title, v_html, v_msg || E'\n\n' || v_web,
    case when lower(coalesce(p_kicker, '')) = 'test' then 'test' else 'supervision' end, null);
end
$$;

-- Quota quotidien de Brevo (300 par jour en offre gratuite, réglable par app_config.email_alerts.daily_limit) :
-- 20 e-mails restent toujours libres pour les e-mails des comptes (inscription, mot de passe…).
create or replace function public.nx_email_quota(p_needed integer)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_limit integer;
  v_sent integer;
  v_left integer;
begin
  select coalesce(nullif(value ->> 'daily_limit', '')::integer, 300) into v_limit from public.app_config where key = 'email_alerts';
  v_limit := coalesce(v_limit, 300) - 20;
  select count(*) into v_sent from public.nx_email_log where created_at > now() - interval '1 day';
  v_left := greatest(v_limit - v_sent, 0);
  if p_needed > v_left then
    raise exception 'Quota Brevo du jour atteint : % e-mail(s) à envoyer, % restant(s) aujourd’hui (% par jour, 20 gardés pour les e-mails des comptes).', p_needed, v_left, v_limit + 20;
  end if;
  return v_left;
end
$$;

-- Destinataires d'une annonce : all, admins, me, plan:<offre> (membres d'un espace abonné à cette offre).
create or replace function public.nx_email_audience(p_audience text)
returns table (id uuid, email text, full_name text, first_name text)
language sql stable security definer set search_path = public
as $$
  select p.id, p.email, coalesce(p.full_name, ''), split_part(btrim(coalesce(p.full_name, '')), ' ', 1)
  from public.profiles p
  where coalesce(p.email, '') <> '' and coalesce(p.status, 'active') <> 'suspended'
    and (
      p_audience = 'all'
      or (p_audience = 'admins' and p.app_role in ('admin', 'superadmin'))
      or (p_audience = 'me' and p.id = auth.uid())
      or (p_audience like 'plan:%' and exists (
        select 1 from public.organization_members m join public.subscriptions s on s.org_id = m.org_id
        where m.user_id = p.id and s.plan_id = substr(p_audience, 6) and s.status in ('active', 'trialing')))
    );
$$;

-- E-mail unique depuis le back office (exemple d'un modèle…).
create or replace function public.nx_email_send_admin(p_to text, p_to_name text, p_subject text, p_html text, p_text text default '', p_tag text default 'admin')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_id bigint;
begin
  if not public.nx_is_admin() then raise exception 'Réservé aux administrateurs de NEXORA.'; end if;
  if coalesce(p_to, '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Adresse e-mail invalide : %.', p_to; end if;
  perform public.nx_email_quota(1);
  v_id := public.nx_brevo_post(p_to, p_to_name, p_subject, p_html, p_text, p_tag, null);
  if v_id is null then
    raise exception 'Les e-mails ne sont pas configurés : enregistre la clé API Brevo et l’expéditeur (back office → Supabase → E-mails (Brevo)).';
  end if;
  insert into public.nx_email_log (user_id, request_id, kind, to_email)
  values ((select p.id from public.profiles p where lower(p.email) = lower(p_to) limit 1), v_id, left(coalesce(nullif(p_tag, ''), 'admin'), 40), p_to);
  return jsonb_build_object('ok', true, 'id', v_id, 'to', p_to);
end
$$;

-- Annonce (mise à jour…) envoyée à un public ; {{salutation}} devient « Bonjour Prénom, ». p_dry_run : compte seulement.
create or replace function public.nx_email_broadcast(p_audience text, p_subject text, p_html text, p_text text, p_tag text default 'maj', p_dry_run boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  r record;
  v_n integer;
  v_sent integer := 0;
  v_hello text;
  v_id bigint;
begin
  if not public.nx_is_admin() then raise exception 'Réservé aux administrateurs de NEXORA.'; end if;
  select count(*) into v_n from public.nx_email_audience(p_audience);
  if p_dry_run then return jsonb_build_object('count', v_n); end if;
  if v_n = 0 then raise exception 'Personne ne correspond à ce public.'; end if;
  perform public.nx_email_quota(v_n);
  for r in select * from public.nx_email_audience(p_audience) loop
    v_hello := case when r.first_name <> '' then 'Bonjour ' || r.first_name || ',' else 'Bonjour,' end;
    v_id := public.nx_brevo_post(r.email, r.full_name, p_subject,
      replace(p_html, '{{salutation}}', public.nx_html(v_hello)), replace(coalesce(p_text, ''), '{{salutation}}', v_hello), p_tag, null);
    if v_id is null then
      raise exception 'Les e-mails ne sont pas configurés : enregistre la clé API Brevo et l’expéditeur (back office → Supabase → E-mails (Brevo)).';
    end if;
    insert into public.nx_email_log (user_id, request_id, kind, to_email) values (r.id, v_id, left(coalesce(nullif(p_tag, ''), 'maj'), 40), r.email);
    v_sent := v_sent + 1;
  end loop;
  return jsonb_build_object('ok', true, 'count', v_sent);
end
$$;

-- Réponse de Brevo à un envoi (null tant qu'elle n'est pas arrivée).
create or replace function public.nx_email_result(p_id bigint)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.nx_is_admin() then return null; end if;
  select jsonb_build_object('status', r.status_code, 'error', r.error_msg, 'content', left(r.content::text, 300))
    into v
  from net._http_response r
  where r.id = p_id;
  return v;
end
$$;

-- Modèles des e-mails envoyés par la base, enregistrés depuis le back office.
create or replace function public.nx_email_templates_save(p jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.nx_is_admin() then raise exception 'Réservé aux administrateurs de NEXORA.'; end if;
  if p is null or jsonb_typeof(p) <> 'object' or coalesce(p -> 'alert' ->> 'html', '') = '' then
    raise exception 'Modèles d’e-mails invalides.';
  end if;
  insert into public.app_config (key, value, description, updated_at, updated_by)
  values ('email_templates', p, 'Modèles des e-mails envoyés par la base (NEXORA #031), enregistrés depuis le back office → E-mails', now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
end
$$;

/* ---------------------------------------------------------------- Factures */

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text unique,
  status text not null default 'brouillon' check (status in ('brouillon', 'emise', 'envoyee', 'payee', 'annulee')),
  user_id uuid references public.profiles (id) on delete set null,
  org_id uuid references public.organizations (id) on delete set null,
  customer jsonb not null default '{}'::jsonb,
  lines jsonb not null default '[]'::jsonb,
  currency text not null default 'EUR',
  tax_rate numeric(5, 2) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  subtotal_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  total_cents bigint not null default 0,
  issued_at date,
  due_at date,
  paid_at timestamptz,
  notes text not null default '',
  issuer jsonb,
  sent_at timestamptz,
  sent_to text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists invoices_created on public.invoices (created_at desc);
create index if not exists invoices_user on public.invoices (user_id);
create index if not exists invoices_org on public.invoices (org_id);

-- Totaux calculés par la base ; une facture émise (numérotée) ne change plus que de statut, d'échéance ou de note.
create or replace function public.nx_invoice_before()
returns trigger
language plpgsql set search_path = public
as $$
declare
  l jsonb;
  v_sub numeric := 0;
begin
  if tg_op = 'UPDATE' and old.number is not null and (
    new.lines is distinct from old.lines or new.customer is distinct from old.customer or new.tax_rate is distinct from old.tax_rate
    or new.currency is distinct from old.currency or new.number is distinct from old.number or new.issued_at is distinct from old.issued_at
    or new.issuer is distinct from old.issuer or new.user_id is distinct from old.user_id or new.org_id is distinct from old.org_id) then
    raise exception 'La facture % est émise : elle ne peut plus être modifiée. Annule-la, puis crée une nouvelle facture.', old.number;
  end if;
  -- Le numéro n'est attribué que par nx_invoice_issue (numérotation continue).
  if new.number is distinct from (case when tg_op = 'UPDATE' then old.number end)
     and coalesce(current_setting('nx.invoice_issue', true), '') <> '1' then
    raise exception 'Le numéro d’une facture est attribué à son émission (bouton « Émettre »).';
  end if;
  if jsonb_typeof(new.lines) <> 'array' then raise exception 'Lignes de facture invalides.'; end if;
  for l in select * from jsonb_array_elements(new.lines) loop
    v_sub := v_sub + round(coalesce(nullif(l ->> 'qty', '')::numeric, 0) * coalesce(nullif(l ->> 'unit_cents', '')::numeric, 0));
  end loop;
  new.subtotal_cents := v_sub;
  new.tax_cents := round(v_sub * new.tax_rate / 100);
  new.total_cents := new.subtotal_cents + new.tax_cents;
  new.updated_at := now();
  return new;
end
$$;
drop trigger if exists nx_invoice_before on public.invoices;
create trigger nx_invoice_before before insert or update on public.invoices
  for each row execute function public.nx_invoice_before();

alter table public.invoices enable row level security;
drop policy if exists invoices_admin_select on public.invoices;
drop policy if exists invoices_admin_insert on public.invoices;
drop policy if exists invoices_admin_update on public.invoices;
drop policy if exists invoices_admin_delete on public.invoices;
drop policy if exists invoices_customer_select on public.invoices;
create policy invoices_admin_select on public.invoices for select to authenticated using (public.nx_is_admin());
create policy invoices_admin_insert on public.invoices for insert to authenticated with check (public.nx_is_admin() and number is null);
create policy invoices_admin_update on public.invoices for update to authenticated using (public.nx_is_admin()) with check (public.nx_is_admin());
-- Seuls les brouillons se suppriment : la numérotation des factures émises reste continue.
create policy invoices_admin_delete on public.invoices for delete to authenticated using (public.nx_is_admin() and number is null);
-- Le client voit ses factures émises (compte, ou propriétaire / administrateur de l'espace facturé).
create policy invoices_customer_select on public.invoices for select to authenticated using (
  number is not null and (user_id = auth.uid() or exists (
    select 1 from public.organization_members m where m.org_id = invoices.org_id and m.user_id = auth.uid() and m.role in ('owner', 'admin'))));
revoke all on public.invoices from anon;
grant select, insert, update, delete on public.invoices to authenticated;

create table if not exists public.nx_invoice_counters (
  year integer primary key,
  last integer not null default 0
);
alter table public.nx_invoice_counters enable row level security;
revoke all on public.nx_invoice_counters from anon, authenticated;

-- Émission : numéro suivant de l'année (préfixe de l'émetteur), date du jour, échéance, émetteur figé.
create or replace function public.nx_invoice_issue(p_id uuid)
returns public.invoices
language plpgsql security definer set search_path = public
as $$
declare
  v public.invoices;
  v_issuer jsonb;
  v_prefix text;
  v_year integer := extract(year from current_date)::integer;
  v_n integer;
begin
  if not public.nx_is_admin() then raise exception 'Réservé aux administrateurs de NEXORA.'; end if;
  select * into v from public.invoices where id = p_id for update;
  if not found then raise exception 'Facture introuvable.'; end if;
  if v.number is not null then return v; end if;
  if jsonb_array_length(v.lines) = 0 then raise exception 'Ajoute au moins une ligne à la facture.'; end if;
  if coalesce(v.customer ->> 'name', '') = '' then raise exception 'Indique le nom du client.'; end if;
  select value into v_issuer from public.nx_private_config where key = 'invoice_issuer';
  v_prefix := coalesce(nullif(regexp_replace(coalesce(v_issuer ->> 'prefix', 'NX'), '[^A-Za-z0-9]', '', 'g'), ''), 'NX');
  insert into public.nx_invoice_counters (year, last) values (v_year, 1)
  on conflict (year) do update set last = public.nx_invoice_counters.last + 1
  returning last into v_n;
  perform set_config('nx.invoice_issue', '1', true);
  update public.invoices set
    number = v_prefix || '-' || v_year || '-' || lpad(v_n::text, 4, '0'),
    status = 'emise',
    issued_at = current_date,
    due_at = coalesce(due_at, current_date + coalesce(nullif(v_issuer ->> 'due_days', '')::integer, 30)),
    issuer = coalesce(v_issuer, '{}'::jsonb)
  where id = p_id
  returning * into v;
  perform set_config('nx.invoice_issue', '', true);
  return v;
end
$$;

-- Envoi d'une facture émise, avec son PDF (base64) en pièce jointe.
create or replace function public.nx_invoice_send(p_id uuid, p_to text, p_to_name text, p_subject text, p_html text, p_text text, p_pdf_base64 text, p_filename text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v public.invoices;
  v_id bigint;
  v_name text := coalesce(nullif(regexp_replace(coalesce(p_filename, ''), '[^A-Za-z0-9._-]', '-', 'g'), ''), 'facture.pdf');
begin
  if not public.nx_is_admin() then raise exception 'Réservé aux administrateurs de NEXORA.'; end if;
  select * into v from public.invoices where id = p_id;
  if not found then raise exception 'Facture introuvable.'; end if;
  if v.number is null then raise exception 'Émets la facture avant de l’envoyer.'; end if;
  if v.status = 'annulee' then raise exception 'La facture % est annulée : elle ne peut pas être envoyée.', v.number; end if;
  if coalesce(p_to, '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Adresse e-mail invalide : %.', p_to; end if;
  if coalesce(p_pdf_base64, '') = '' or length(p_pdf_base64) > 6000000 or p_pdf_base64 !~ '^[A-Za-z0-9+/=]+$' then
    raise exception 'PDF de la facture absent, invalide ou trop lourd.';
  end if;
  perform public.nx_email_quota(1);
  v_id := public.nx_brevo_post(p_to, p_to_name, p_subject, p_html, p_text, 'facture',
    jsonb_build_array(jsonb_build_object('content', p_pdf_base64, 'name', v_name)));
  if v_id is null then
    raise exception 'Les e-mails ne sont pas configurés : enregistre la clé API Brevo et l’expéditeur (back office → Supabase → E-mails (Brevo)).';
  end if;
  insert into public.nx_email_log (user_id, request_id, kind, to_email) values (v.user_id, v_id, 'facture', p_to);
  update public.invoices set sent_at = now(), sent_to = p_to, status = case when status = 'emise' then 'envoyee' else status end
  where id = p_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'to', p_to);
end
$$;

/* ---------------------------------------------------------------- Droits */

revoke all on function public.nx_email_render(text, jsonb) from public, anon, authenticated;
revoke all on function public.nx_strip_icon(text) from public, anon, authenticated;
revoke all on function public.nx_brevo_post(text, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.nx_brevo_send(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.nx_email_quota(integer) from public, anon, authenticated;
revoke all on function public.nx_email_audience(text) from public, anon, authenticated;
revoke all on function public.nx_invoice_before() from public, anon, authenticated;
revoke all on function public.nx_is_admin() from public, anon;
revoke all on function public.nx_email_send_admin(text, text, text, text, text, text) from public, anon;
revoke all on function public.nx_email_broadcast(text, text, text, text, text, boolean) from public, anon;
revoke all on function public.nx_email_result(bigint) from public, anon;
revoke all on function public.nx_email_templates_save(jsonb) from public, anon;
revoke all on function public.nx_invoice_issue(uuid) from public, anon;
revoke all on function public.nx_invoice_send(uuid, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.nx_is_admin() to authenticated;
grant execute on function public.nx_email_send_admin(text, text, text, text, text, text) to authenticated;
grant execute on function public.nx_email_broadcast(text, text, text, text, text, boolean) to authenticated;
grant execute on function public.nx_email_result(bigint) to authenticated;
grant execute on function public.nx_email_templates_save(jsonb) to authenticated;
grant execute on function public.nx_invoice_issue(uuid) to authenticated;
grant execute on function public.nx_invoice_send(uuid, text, text, text, text, text, text, text) to authenticated;
