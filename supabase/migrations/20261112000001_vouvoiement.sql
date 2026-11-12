-- NEXORA #115 : vouvoiement dans les textes écrits par la base (messages d'erreur montrés dans NEXORA, e-mails
-- des alertes, des factures, des pages de statut, des licences et du parrainage), règle R8.
--
-- Chaque fonction ci-dessous est la dernière définition des migrations précédentes, recopiée telle quelle : seuls
-- ses textes passent du tutoiement au vouvoiement (conversion de scripts/vouvoiement.mjs, relue). Aucun changement
-- de signature, de droits ni de comportement ; « create or replace » garde les droits accordés.
-- Les textes des offres et le pied des factures ne sont remplacés que s'ils sont encore ceux d'origine (un texte
-- modifié depuis le back office est gardé). Idempotente : peut être rejouée sans effet de bord.

-- ---------- Fonctions (textes au vouvoiement) ----------
-- E-mail de test depuis le back office (le résultat se lit dans net._http_response).
create or replace function public.nx_brevo_test(p_to text)
returns bigint
language sql security definer set search_path = public
as $$
  select public.nx_brevo_send(p_to, '', 'Test des alertes NEXORA',
    'Cet e-mail confirme que les alertes de supervision de NEXORA partent bien par Brevo. Vous recevrez un message de ce type quand un site surveillé tombe en panne, devient lent ou revient en ligne.',
    'Test');
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
    raise exception 'Les e-mails ne sont pas configurés : enregistrez la clé API Brevo et l’expéditeur (back office → Supabase → E-mails (Brevo)).';
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
      raise exception 'Les e-mails ne sont pas configurés : enregistrez la clé API Brevo et l’expéditeur (back office → Supabase → E-mails (Brevo)).';
    end if;
    insert into public.nx_email_log (user_id, request_id, kind, to_email) values (r.id, v_id, left(coalesce(nullif(p_tag, ''), 'maj'), 40), r.email);
    v_sent := v_sent + 1;
  end loop;
  return jsonb_build_object('ok', true, 'count', v_sent);
end
$$;

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
    raise exception 'La facture % est émise : elle ne peut plus être modifiée. Annulez-la, puis créez une nouvelle facture.', old.number;
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
  if jsonb_array_length(v.lines) = 0 then raise exception 'Ajoutez au moins une ligne à la facture.'; end if;
  if coalesce(v.customer ->> 'name', '') = '' then raise exception 'Indiquez le nom du client.'; end if;
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
  if v.number is null then raise exception 'Émettez la facture avant de l’envoyer.'; end if;
  if v.status = 'annulee' then raise exception 'La facture % est annulée : elle ne peut pas être envoyée.', v.number; end if;
  if coalesce(p_to, '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Adresse e-mail invalide : %.', p_to; end if;
  if coalesce(p_pdf_base64, '') = '' or length(p_pdf_base64) > 6000000 or p_pdf_base64 !~ '^[A-Za-z0-9+/=]+$' then
    raise exception 'PDF de la facture absent, invalide ou trop lourd.';
  end if;
  perform public.nx_email_quota(1);
  v_id := public.nx_brevo_post(p_to, p_to_name, p_subject, p_html, p_text, 'facture',
    jsonb_build_array(jsonb_build_object('content', p_pdf_base64, 'name', v_name)));
  if v_id is null then
    raise exception 'Les e-mails ne sont pas configurés : enregistrez la clé API Brevo et l’expéditeur (back office → Supabase → E-mails (Brevo)).';
  end if;
  insert into public.nx_email_log (user_id, request_id, kind, to_email) values (v.user_id, v_id, 'facture', p_to);
  update public.invoices set sent_at = now(), sent_to = p_to, status = case when status = 'emise' then 'envoyee' else status end
  where id = p_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'to', p_to);
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
      message = format('Limite de votre offre %s atteinte : %s %s au maximum. Passez à une offre supérieure dans Mon compte → Offre et usage.', public.nx_plan_label(v_plan), v_limit, v_label),
      hint = 'nx_limit:' || v_key;
  end if;
  return new;
end
$$;

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
      message = format('Votre offre %s permet %s membre%s par espace : passez à une offre supérieure pour inviter quelqu’un.', public.nx_plan_label(v_plan), v_limit, case when v_limit > 1 then 's' else '' end),
      hint = 'nx_limit:members';
  end if;
  return new;
end
$$;

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
    raise exception 'Connectez-vous à votre compte NEXORA pour recevoir les alertes par e-mail.';
  end if;
  select u.plan_id into v_plan from public.nx_user_plan(v_uid) u;
  if not public.nx_is_admin() and not public.nx_perm(coalesce(v_plan, 'free'), 'alerts') then
    raise exception 'Les alertes par e-mail font partie de l’offre Standard : avec l’offre %, elles restent affichées dans NEXORA.', public.nx_plan_label(coalesce(v_plan, 'free'));
  end if;
  select u.email, coalesce(p.full_name, '') into v_email, v_name
  from auth.users u left join public.profiles p on p.id = u.id
  where u.id = v_uid;
  if coalesce(v_email, '') = '' then
    raise exception 'Votre compte NEXORA n’a pas d’adresse e-mail.';
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

-- E-mails aux abonnés des pages de statut qui montrent ce site (ouverture et fin d'incident).
create or replace function public.nx_status_broadcast(p_monitor public.monitors, p_title text, p_body text)
returns integer
language plpgsql security definer set search_path = public, extensions
as $$
declare
  p record;
  s record;
  v_web text;
  v_n integer := 0;
  v_id bigint;
  v_html text;
begin
  select value #>> '{}' into v_web from public.app_config where key = 'web_url';
  v_web := coalesce(nullif(v_web, ''), 'https://nexora.abrahamtogbonon0.workers.dev/');
  for p in select * from public.status_pages where published and p_monitor.id = any (monitor_ids) loop
    for s in select * from public.status_subscribers where page_id = p.id and confirmed_at is not null order by created_at limit 200 loop
      begin
        perform public.nx_email_quota(1);
      exception when others then
        return v_n;
      end;
      v_html := '<div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:28px 24px;color:#1d1d1f">'
        || '<div style="font-size:13px;font-weight:600;color:#6e6e73;margin-bottom:10px">' || public.nx_html(p.title) || '</div>'
        || '<h1 style="font-size:20px;line-height:1.3;margin:0 0 12px">' || public.nx_html(p_title) || '</h1>'
        || '<p style="font-size:15px;line-height:1.55;margin:0 0 22px;color:#3a3a3c">' || public.nx_html(p_body) || '</p>'
        || '<a href="' || public.nx_html(v_web || 'status/?p=' || p.slug) || '" style="display:inline-block;background:#1d1d1f;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;font-size:14px">Voir l’état des services</a>'
        || '<p style="font-size:12px;line-height:1.5;color:#6e6e73;margin:28px 0 0">Vous recevez ce message car vous suivez cette page. <a href="' || public.nx_html(v_web || 'status/?p=' || p.slug || '&stop=' || s.token) || '" style="color:#6e6e73">Ne plus recevoir</a></div>';
      v_id := public.nx_brevo_post(s.email, '', p.title || ' : ' || p_title, v_html, p_title || E'\n\n' || p_body || E'\n\n' || v_web || 'status/?p=' || p.slug, 'statut', null);
      if v_id is not null then
        insert into public.nx_email_log (user_id, request_id, kind, to_email) values (null, v_id, 'statut', s.email);
        v_n := v_n + 1;
      end if;
    end loop;
  end loop;
  return v_n;
exception when others then
  raise warning 'NEXORA : abonnés de la page de statut non prévenus (%).', sqlerrm;
  return v_n;
end
$$;

-- Lit les réponses reçues par pg_net selon le type (remplace la version de 20261104000002).
create or replace function public.collect_monitor_results()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  q record;
  mo public.monitors;
  v_ok boolean;
  v_err text;
  v_lat integer;
  v_expected integer;
  v_done integer := 0;
  v_json jsonb;
  v_val text;
  v_days integer;
  v_hash text;
  v_name text;
begin
  if not pg_try_advisory_xact_lock(4210022) then return 0; end if;
  for q in
    select r.monitor_id, r.request_id, r.started_at, h.id as hid, h.status_code, h.content, h.timed_out, h.error_msg, h.created
    from public.monitor_requests r
    left join net._http_response h on h.id = r.request_id
    where h.id is not null or r.started_at < now() - interval '2 minutes'
    order by r.started_at
  loop
    delete from public.monitor_requests where monitor_id = q.monitor_id and request_id = q.request_id;
    select * into mo from public.monitors where id = q.monitor_id;
    if not found then continue; end if;
    v_name := coalesce(nullif(mo.name, ''), mo.url);
    v_expected := coalesce(mo.expected_status, 200);
    v_lat := case when q.hid is not null and q.created is not null then greatest(0, round(extract(epoch from (q.created - q.started_at)) * 1000))::int end;
    v_ok := null; v_err := null;
    if q.hid is null then
      v_ok := false; v_err := 'pas de réponse (délai dépassé)';
    elsif coalesce(q.timed_out, false) or q.status_code is null then
      v_ok := false; v_err := public.nx_monitor_reason(q.error_msg, q.timed_out);
    end if;

    if mo.kind = 'domain' then
      -- Expiration du domaine : pas de mesure de disponibilité, seulement l'échéance.
      update public.monitors set domain_checked_at = now(), last_checked_at = now() where id = mo.id;
      if v_ok is distinct from false and q.status_code = 200 then
        begin
          v_json := q.content::jsonb;
          select floor(extract(epoch from (e ->> 'eventDate')::timestamptz - now()) / 86400)::int into v_days
          from jsonb_array_elements(coalesce(v_json -> 'events', '[]'::jsonb)) e where e ->> 'eventAction' ilike '%expir%' limit 1;
        exception when others then v_days := null;
        end;
        if v_days is not null then
          update public.monitors set domain_days = v_days, last_status = 'up', last_error = null where id = mo.id;
          if v_days <= mo.domain_warn_days then
            perform public.nx_monitor_event(mo, 'domain', 'expire dans ' || v_days || ' jour(s)', 'Le domaine de ' || v_name || ' expire dans ' || v_days || ' jour(s)', 'Renouvelez-le chez votre registraire et activez le renouvellement automatique.');
          elsif exists (select 1 from public.monitor_incidents where monitor_id = mo.id and kind = 'domain' and ended_at is null) then
            update public.monitor_incidents set ended_at = now(), closed_by = 'auto', resolution = 'Domaine renouvelé' where monitor_id = mo.id and kind = 'domain' and ended_at is null;
            perform public.nx_monitor_notify(mo, 'Le domaine de ' || v_name || ' a été renouvelé', v_days || ' jours restants.');
          end if;
        end if;
      end if;
      v_done := v_done + 1;
      continue;
    end if;

    if v_ok is null and mo.kind = 'dns' then
      begin
        v_json := q.content::jsonb;
        select string_agg(a ->> 'data', ' | ' order by a ->> 'data') into v_val from jsonb_array_elements(coalesce(v_json -> 'Answer', '[]'::jsonb)) a;
      exception when others then v_val := null;
      end;
      if coalesce(v_val, '') = '' then v_ok := false; v_err := 'aucun enregistrement ' || mo.dns_type;
      elsif coalesce(mo.dns_expect, '') <> '' and position(lower(mo.dns_expect) in lower(v_val)) = 0 then v_ok := false; v_err := mo.dns_type || ' = ' || left(v_val, 80) || ' (attendu ' || mo.dns_expect || ')';
      else v_ok := true;
      end if;
      if v_ok and mo.dns_watch and mo.dns_last is not null and mo.dns_last <> v_val then
        perform public.nx_monitor_event(mo, 'change', 'DNS : ' || left(mo.dns_last, 60) || ' → ' || left(v_val, 60), 'L’enregistrement DNS de ' || v_name || ' a changé', 'Nouvelle valeur : ' || left(v_val, 200) || '. Vérifiez qu’il s’agit bien d’une modification de votre part.');
      end if;
      if v_ok then update public.monitors set dns_last = v_val where id = mo.id; end if;
    elsif v_ok is null then
      if not (q.status_code = v_expected or (v_expected = 200 and q.status_code between 200 and 399)) then
        v_ok := false; v_err := 'statut ' || q.status_code;
      elsif coalesce(mo.keyword, '') <> '' and position(lower(mo.keyword) in lower(coalesce(q.content, ''))) = 0 then
        v_ok := false; v_err := 'mot-clé absent';
      elsif mo.kind = 'api' and coalesce(mo.json_path, '') <> '' then
        begin
          v_val := public.nx_json_pick(q.content::jsonb, mo.json_path);
          v_ok := case mo.json_op
            when 'exists' then v_val is not null
            when 'contains' then position(coalesce(mo.json_expect, '') in coalesce(v_val, '')) > 0
            when 'not' then v_val is distinct from mo.json_expect
            when 'lt' then v_val::numeric < mo.json_expect::numeric
            when 'gt' then v_val::numeric > mo.json_expect::numeric
            else v_val is not distinct from mo.json_expect
          end;
          if not v_ok then v_err := mo.json_path || ' = ' || coalesce(left(v_val, 60), 'absent'); end if;
        exception when others then
          v_ok := false; v_err := 'réponse non JSON';
        end;
      else
        v_ok := true;
      end if;
      -- Contenu modifié (défiguration, page remplacée).
      if v_ok and mo.watch_change and mo.kind = 'http' then
        v_hash := public.nx_content_hash(q.content);
        if mo.content_hash is not null and mo.content_hash <> v_hash then
          perform public.nx_monitor_event(mo, 'change', 'contenu modifié', 'Le contenu de ' || v_name || ' a changé', 'Vérifiez qu’il s’agit bien d’une mise à jour de votre part.');
        end if;
        update public.monitors set content_hash = v_hash where id = mo.id;
      end if;
    end if;
    perform public.nx_monitor_record(q.monitor_id, q.started_at, v_ok, q.status_code, v_lat, v_err);
    v_done := v_done + 1;
  end loop;
  delete from public.monitor_requests r where r.started_at < now() - interval '1 day';
  return v_done;
end
$$;

create or replace function public.nx_status_subscribe(p_slug text, p_email text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare
  p public.status_pages;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_token text;
  v_web text;
  v_id bigint;
  v_link text;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 200 then return jsonb_build_object('ok', false, 'message', 'Adresse e-mail invalide.'); end if;
  select * into p from public.status_pages where slug = lower(p_slug) and published;
  if not found then return jsonb_build_object('ok', false, 'message', 'Page introuvable.'); end if;
  if exists (select 1 from public.status_subscribers where page_id = p.id and email = v_email and (confirmed_at is not null or created_at > now() - interval '1 hour')) then
    return jsonb_build_object('ok', true);
  end if;
  if (select count(*) from public.status_subscribers where page_id = p.id) >= 500 then return jsonb_build_object('ok', false, 'message', 'Les abonnements à cette page sont complets.'); end if;
  if (select count(*) from public.status_subscribers where created_at > now() - interval '1 hour') >= 100 then return jsonb_build_object('ok', false, 'message', 'Réessayez dans un moment.'); end if;
  begin
    perform public.nx_email_quota(1);
  exception when others then
    return jsonb_build_object('ok', false, 'message', 'Réessayez plus tard.');
  end;
  v_token := md5(random()::text || clock_timestamp()::text || v_email);
  insert into public.status_subscribers (page_id, email, token) values (p.id, v_email, v_token)
  on conflict (page_id, email) do update set token = excluded.token, created_at = now();
  select value #>> '{}' into v_web from public.app_config where key = 'web_url';
  v_web := coalesce(nullif(v_web, ''), 'https://nexora.abrahamtogbonon0.workers.dev/');
  v_link := v_web || 'status/?p=' || p.slug || '&confirm=' || v_token;
  v_id := public.nx_brevo_post(v_email, '', 'Confirmez votre abonnement : ' || p.title,
    '<div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:28px 24px;color:#1d1d1f"><h1 style="font-size:20px;margin:0 0 12px">' || public.nx_html(p.title) || '</h1>'
    || '<p style="font-size:15px;line-height:1.55;color:#3a3a3c">Confirmez votre adresse pour être prévenu des incidents et de leur résolution.</p>'
    || '<a href="' || public.nx_html(v_link) || '" style="display:inline-block;background:#1d1d1f;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;font-size:14px">Confirmer mon abonnement</a>'
    || '<p style="font-size:12px;color:#6e6e73;margin-top:24px">Si vous n’avez rien demandé, ignorez ce message.</p></div>',
    'Confirmez votre abonnement : ' || v_link, 'statut', null);
  if v_id is not null then insert into public.nx_email_log (user_id, request_id, kind, to_email) values (null, v_id, 'statut', v_email); end if;
  return jsonb_build_object('ok', true);
end
$$;

create or replace function public.nx_review_post(p_token text, p_author text, p_decision text, p_comment text, p_page integer, p_x double precision default null, p_y double precision default null, p_t double precision default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_link public.design_review_links;
begin
  select * into v_link from public.design_review_links where token = p_token and active;
  if not found then raise exception 'Lien de validation introuvable ou fermé.'; end if;
  if v_link.mode = 'view' then raise exception 'Ce lien est en lecture seule.'; end if;
  if (select count(*) from public.design_reviews where token = p_token) >= 300 then raise exception 'Ce lien a reçu le nombre maximal d’avis.'; end if;
  if coalesce(trim(p_author), '') = '' then raise exception 'Indiquez votre nom.'; end if;
  insert into public.design_reviews (token, author, decision, comment, page, x, y, t)
  values (p_token, left(trim(p_author), 80), case when p_decision in ('approve', 'changes', 'comment') then p_decision else 'comment' end, left(coalesce(p_comment, ''), 2000),
    greatest(0, least(coalesce(p_page, 0), jsonb_array_length(v_link.pages) - 1)),
    case when p_x between 0 and 1 then p_x end, case when p_y between 0 and 1 then p_y end,
    case when v_link.kind = 'video' and p_t between 0 and 36000 then round(p_t::numeric, 2)::double precision end);
  return (public.nx_review_get(p_token)) -> 'reviews';
end;
$$;

-- ---------- 5. Licences ----------
create or replace function public.nx_license_get(p_uid uuid, p_source text default 'app')
returns public.nx_licenses
language plpgsql security definer set search_path = public
as $$
declare
  l public.nx_licenses;
  i integer;
begin
  select * into l from public.nx_licenses where user_id = p_uid;
  if found then return l; end if;
  for i in 1..5 loop
    begin
      insert into public.nx_licenses (key, user_id, source) values (public.nx_license_new_key(), p_uid, left(coalesce(p_source, 'app'), 20)) returning * into l;
      return l;
    exception when unique_violation then
      select * into l from public.nx_licenses where user_id = p_uid;
      if found then return l; end if;
    end;
  end loop;
  raise exception 'La clé de licence n’a pas pu être créée. Réessayez dans un instant.';
end
$$;

create or replace function public.nx_license_check(p_device text, p_key text default null, p_version text default '', p_os text default '',
  p_name text default '', p_nonce text default '', p_secret text default null, p_ip text default null, p_integrity jsonb default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := public.nx_is_admin();
  v_pol jsonb := public.nx_policy('license_policy');
  v_rel jsonb := public.nx_policy('release_policy');
  v_email text;
  v_norm text;
  v_gmail boolean;
  v_ip text := public.nx_request_ip(p_secret, p_ip);
  v_ver text := left(coalesce(p_version, ''), 40);
  l public.nx_licenses;
  d public.nx_devices;
  v_paid text;
  v_plan text;
  v_link public.nx_device_accounts;
  v_accounts integer;
  v_gmails integer;
  v_devices integer;
  v_max_devices integer;
  v_session uuid;
  v_trial_refused boolean := false;
  v_row public.plans;
  v_reason text;
  v_msg text;
  v_detail jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    insert into public.nx_license_checks (ok, reason, ip, app_version) values (false, 'auth', v_ip, v_ver);
    return jsonb_build_object('ok', false, 'reason', 'auth', 'message', 'Connectez-vous à votre compte NEXORA pour ouvrir le logiciel.', 'nonce', p_nonce, 'server_time', now());
  end if;
  if coalesce(length(p_device), 0) < 16 then raise exception 'Appareil non reconnu.'; end if;
  select email into v_email from auth.users where id = v_uid;
  v_email := coalesce(v_email, '');
  v_norm := public.nx_email_norm(v_email);
  v_gmail := public.nx_is_gmail(v_email);
  l := public.nx_license_get(v_uid, 'app');

  insert into public.nx_devices (device_hash, name, os, app_version, first_ip, last_ip)
  values (left(p_device, 128), left(coalesce(p_name, ''), 80), left(coalesce(p_os, ''), 80), v_ver, v_ip, v_ip)
  on conflict (device_hash) do update set name = coalesce(nullif(excluded.name, ''), nx_devices.name), os = coalesce(nullif(excluded.os, ''), nx_devices.os),
    app_version = coalesce(nullif(excluded.app_version, ''), nx_devices.app_version), last_ip = coalesce(excluded.last_ip, nx_devices.last_ip), last_seen = now()
  returning * into d;

  v_paid := public.nx_paid_or_granted(v_uid);
  select * into v_link from public.nx_device_accounts where device_id = d.id and user_id = v_uid;

  -- Intégrité et version : vérifiées avant tout le reste (installation modifiée, version non autorisée).
  if p_integrity is not null and jsonb_typeof(p_integrity) = 'object' and coalesce((p_integrity ->> 'ok')::boolean, true) = false then
    v_reason := 'integrity';
    v_msg := 'Échec du contrôle d’intégrité — Installation non authentifiée. Ouvrez NEXORA Devs Toolbox pour la réparer.';
    v_detail := jsonb_build_object('file', left(coalesce(p_integrity ->> 'file', ''), 200), 'kind', left(coalesce(p_integrity ->> 'reason', ''), 60));
  elsif coalesce((v_rel ->> 'block_outdated')::boolean, true)
    and (public.nx_version_num(v_ver) < public.nx_version_num(coalesce(v_rel ->> 'min_version', '0'))
      or coalesce(case when coalesce(p_integrity ->> 'manifest_version', '') ~ '^\d{1,15}$' then (p_integrity ->> 'manifest_version')::bigint end, 0)
         < coalesce(case when coalesce(v_rel ->> 'min_manifest_version', '') ~ '^\d{1,15}$' then (v_rel ->> 'min_manifest_version')::bigint end, 0)) then
    v_reason := 'outdated';
    v_msg := 'Cette version de NEXORA n’est plus autorisée. NEXORA Devs Toolbox installe la version à jour.';
    v_detail := jsonb_build_object('min_version', v_rel ->> 'min_version', 'version', v_ver);
  elsif p_key is not null and trim(p_key) <> '' and upper(trim(p_key)) <> l.key then
    v_reason := 'key_mismatch'; v_msg := 'Cette clé de licence n’appartient pas à ce compte. Connectez-vous avec le compte de la licence, ou retrouvez votre clé sur le site de NEXORA (Ma licence).';
  elsif l.status <> 'active' then
    v_reason := 'revoked'; v_msg := 'Cette licence a été désactivée. Contactez l’assistance de NEXORA.';
  elsif d.blocked and not v_admin then
    v_reason := 'device_blocked'; v_msg := 'Cet ordinateur n’est plus autorisé à utiliser NEXORA. Contactez l’assistance.';
  elsif v_link.user_id is null and v_paid = 'free' and not v_admin then
    select count(*) into v_accounts from public.nx_device_accounts where device_id = d.id;
    select count(distinct email_norm) into v_gmails from public.nx_device_accounts where device_id = d.id and is_gmail and email_norm <> v_norm;
    if v_accounts >= public.nx_policy_int(v_pol, 'free_accounts_per_device', 3, 1, 50) then
      v_reason := 'device_accounts'; v_msg := 'Cet ordinateur a atteint le nombre de comptes NEXORA gratuits autorisés. Reconnectez-vous avec l’un d’eux, ou passez à Pro.';
    elsif v_gmail and v_gmails >= public.nx_policy_int(v_pol, 'gmail_per_device', 3, 1, 50) then
      v_reason := 'device_gmail'; v_msg := 'Cet ordinateur a atteint le nombre d’adresses Gmail autorisées en offre Gratuite. Reconnectez-vous avec l’une d’elles, ou passez à Pro.';
    end if;
  end if;
  -- Ordinateurs par licence (un ordinateur libéré depuis « Ma licence » ne compte plus).
  if v_reason is null and not v_admin and (v_link.user_id is null or v_link.released) then
    v_max_devices := coalesce(l.max_devices, case when v_paid = 'free' then public.nx_policy_int(v_pol, 'free_devices', 3, 1, 100) else public.nx_policy_int(v_pol, 'pro_devices', 5, 1, 100) end);
    select count(*) into v_devices from public.nx_device_accounts where user_id = v_uid and not released and device_id <> d.id;
    if v_devices >= v_max_devices then
      v_reason := 'device_limit';
      v_msg := 'Votre licence est déjà utilisée sur ' || v_devices || ' ordinateur' || case when v_devices > 1 then 's' else '' end || '. Libérez un ordinateur depuis le site de NEXORA (Ma licence), puis réessayez.';
    end if;
  end if;

  if v_reason is not null then
    insert into public.nx_license_checks (user_id, device_id, ok, reason, plan, ip, app_version, detail) values (v_uid, d.id, false, v_reason, v_paid, v_ip, v_ver, v_detail);
    return jsonb_build_object('ok', false, 'reason', v_reason, 'message', v_msg, 'license_key', l.key, 'email', v_email, 'nonce', p_nonce, 'device', p_device,
      'release', v_rel, 'server_time', now());
  end if;

  insert into public.nx_device_accounts (device_id, user_id, email, email_norm, is_gmail, last_ip)
  values (d.id, v_uid, v_email, v_norm, v_gmail, v_ip)
  on conflict (device_id, user_id) do update set email = excluded.email, email_norm = excluded.email_norm, is_gmail = excluded.is_gmail,
    last_ip = coalesce(excluded.last_ip, nx_device_accounts.last_ip), last_seen = now(), released = false;

  -- Essai complet (durée réglable) : une fois par compte et une fois par ordinateur.
  if l.trial_ends_at is null then
    if d.trial_user is null or d.trial_user = v_uid then
      update public.nx_licenses set trial_ends_at = now() + make_interval(hours => public.nx_policy_int(v_pol, 'trial_hours', 24, 0, 2160)) where id = l.id returning * into l;
      update public.nx_devices set trial_user = v_uid where id = d.id;
    else
      update public.nx_licenses set trial_ends_at = now() where id = l.id returning * into l;
      v_trial_refused := true;
    end if;
  end if;
  update public.nx_licenses set activated_at = coalesce(activated_at, now()), last_check_at = now() where id = l.id returning * into l;

  select u.plan_id into v_plan from public.nx_user_plan(v_uid) u;
  v_plan := coalesce(v_plan, 'free');
  select * into v_row from public.plans where id = v_plan;
  insert into public.nx_sessions (user_id, device_id, ip, app_version) values (v_uid, d.id, v_ip, v_ver) returning id into v_session;
  insert into public.nx_license_checks (user_id, device_id, ok, reason, plan, ip, app_version) values (v_uid, d.id, true, '', v_plan, v_ip, v_ver);
  update public.profiles set last_seen_at = now() where id = v_uid;

  return jsonb_build_object(
    'ok', true, 'user', v_uid, 'email', v_email, 'admin', v_admin, 'license_key', l.key,
    'plan', v_plan, 'plan_name', coalesce(v_row.name, v_plan), 'paid_plan', v_paid,
    'granted', public.nx_granted_plan(v_uid) is not null, 'granted_until', case when public.nx_granted_plan(v_uid) is not null then l.override_until end,
    'trial', v_paid = 'free' and coalesce(l.trial_ends_at > now(), false), 'trial_ends_at', l.trial_ends_at, 'trial_refused', v_trial_refused,
    'perms', coalesce(v_row.perms, '{}'::jsonb), 'limits', coalesce(v_row.limits, '{}'::jsonb),
    'device', p_device, 'device_id', d.id, 'session_id', v_session, 'ip', v_ip,
    'accounts_on_device', (select count(*) from public.nx_device_accounts where device_id = d.id),
    'check_minutes', public.nx_policy_int(v_pol, 'check_minutes', 10, 2, 120), 'release', v_rel,
    'nonce', p_nonce, 'server_time', now());
end
$$;

create or replace function public.nx_license_device_release(p_device uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  update public.nx_device_accounts set released = true where device_id = p_device and user_id = auth.uid();
  if not found then raise exception 'Ordinateur introuvable sur votre licence.'; end if;
  return jsonb_build_object('ok', true);
end
$$;

-- Attribuer (ou modifier) la licence d'un compte par son adresse : offre imposée, durée en jours (vide : sans fin).
create or replace function public.nx_admin_license_grant(p_email text, p_plan text, p_days integer default null, p_note text default '', p_max_devices integer default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid;
  l public.nx_licenses;
begin
  perform public.nx_admin_required();
  if p_plan not in ('free', 'pro', 'auto') then raise exception 'Offre inconnue : choisissez Gratuit, Pro ou Automatique.'; end if;
  select id into v_uid from auth.users where lower(email) = lower(trim(coalesce(p_email, ''))) limit 1;
  if v_uid is null then raise exception 'Aucun compte NEXORA avec cette adresse : la personne doit d’abord créer son compte (site, page « Ma licence »).'; end if;
  l := public.nx_license_get(v_uid, 'admin');
  update public.nx_licenses set
    plan_override = case when p_plan = 'auto' then null else p_plan end,
    override_until = case when p_plan = 'auto' or coalesce(p_days, 0) <= 0 then null else now() + make_interval(days => least(p_days, 3650)) end,
    note = left(coalesce(p_note, ''), 500), max_devices = p_max_devices, status = 'active',
    granted_by = auth.uid(), granted_at = now()
  where id = l.id returning * into l;
  return to_jsonb(l);
end
$$;

-- Nouvelle clé (ancienne clé aussitôt refusée).
create or replace function public.nx_admin_license_rekey(p_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_key text;
  i integer;
begin
  perform public.nx_admin_required();
  for i in 1..8 loop
    v_key := public.nx_license_new_key();
    begin
      update public.nx_licenses set key = v_key, granted_by = auth.uid(), granted_at = now() where id = p_id;
      if not found then raise exception 'Licence introuvable.'; end if;
      return v_key;
    exception when unique_violation then null;
    end;
  end loop;
  raise exception 'Nouvelle clé impossible : réessayez.';
end
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
      'message', 'Connectez-vous à votre compte NEXORA (gratuit) pour utiliser cette fonction.');
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
      'message', format('Mettez NEXORA à jour pour construire : les constructions sont désormais comptées par application (%s par mois).',
        public.nx_limit(v_plan, 'builds_per_app_month')));
  end if;
  if v_rule.perm is not null and not public.nx_perm(v_plan, v_rule.perm) then
    v_need := public.nx_plan_needed(v_rule.perm, v_rule.metric);
    return jsonb_build_object('ok', false, 'reason', 'plan', 'plan', v_plan, 'plan_name', public.nx_plan_label(v_plan),
      'need', v_need, 'need_name', public.nx_plan_label(v_need), 'feature', p_feature,
      'message', format('%s fait partie de l’offre %s. Votre offre actuelle : %s.', v_rule.label, public.nx_plan_label(coalesce(v_need, 'pro')), public.nx_plan_label(v_plan)));
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
      'message', format('%s n’est pas inclus dans l’offre %s : passez à l’offre %s.', v_rule.label, public.nx_plan_label(v_plan), public.nx_plan_label(coalesce(v_need, 'pro'))));
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
    return jsonb_build_object('ok', false, 'reason', 'auth', 'message', 'Connectez-vous à votre compte NEXORA (gratuit) pour créer une application.');
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
        'message', 'Indiquez l’adresse d’un site accessible sur Internet (https://…) : les adresses locales ne sont pas acceptées.');
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
          when v_trial > 0 then format('Vous avez déjà utilisé vos %s applications d’essai de l’offre %s. Passez à Pro pour créer d’autres applications, sans limite de durée.', v_limit, public.nx_plan_label(v_plan))
          when public.nx_limit(v_plan, 'apps_lifetime') > 0 then format('Vous avez déjà créé vos %s applications : c’est la limite de votre offre, Android et Windows confondus, applications supprimées comprises. Passez à Pro pour en créer d’autres.', v_limit)
          else format('Votre offre %s permet %s applications. Supprimez une application ou passez à une offre supérieure.', public.nx_plan_label(v_plan), v_limit) end);
    end if;
  end if;
  insert into public.nx_app_trials (user_id, org_id, local_id, name, source_kind, source_url, plan_at_creation, trial_ends_at, platform)
  values (v_uid, coalesce(p_org, v_org), v_local, left(coalesce(p_name, ''), 120), v_kind, left(p_url, 2000), v_plan,
    case when not v_admin and v_trial > 0 then now() + make_interval(days => v_trial) else null end, v_platform)
  returning * into v_row;
  return public.nx_app_state(v_row, v_plan, v_admin);
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
      'message', 'Connectez-vous à votre compte NEXORA (gratuit) pour construire une application.');
  end if;
  if v_feature is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown', 'message', 'Cette fonction n’est pas disponible.');
  end if;
  if v_local = '' then
    return jsonb_build_object('ok', false, 'reason', 'app', 'message', 'Application inconnue : enregistrez-la, puis relancez la construction.');
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
        then format('L’essai de « %s » est terminé : passez à Pro pour la débloquer.', v_name)
        else format('« %s » dépasse les %s applications de votre offre : elle reste verrouillée. Passez à Pro pour la débloquer.', v_name, public.nx_limit(v_plan, 'apps')) end);
  end if;
  -- 3. Constructions de cette application ce mois-ci.
  v_limit := case when v_admin then -1 else public.nx_limit(v_plan, 'builds_per_app_month') end;
  if v_limit = 0 then
    return jsonb_build_object('ok', false, 'reason', 'plan', 'plan', v_plan, 'plan_name', public.nx_plan_label(v_plan), 'need', 'pro',
      'need_name', public.nx_plan_label('pro'), 'feature', v_feature,
      'message', 'La construction d’applications n’est pas incluse dans votre offre : passez à Pro.');
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
      raise exception 'Votre offre suit les statistiques et les plantages de % applications : passez à Pro pour en suivre d’autres.', v_limit;
    end if;
  end if;
  return query
    insert into public.app_insights_apps as a (owner, app_id, name)
    values (uid, v_app, left(coalesce(p_name, ''), 120))
    on conflict (owner, app_id) do update set name = excluded.name
    returning a.id, a.ingest_key;
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
  if p.status = 'suspended' then raise exception 'Votre accès de parrain est suspendu : écrivez à l’équipe NEXORA.'; end if;
  if p.unlocked_month is distinct from public.nx_month_start() then raise exception 'Saisissez d’abord le code d’accès du mois.'; end if;
  update public.nx_partners set last_seen_at = now() where id = p.id;
  return p;
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
    raise exception 'Ce code est réservé : choisissez-en un autre.';
  end if;
  if (select count(*) from public.nx_referral_codes where partner_id = p.id) >= v_max then
    raise exception 'Vous avez atteint le nombre maximal de codes (%).', v_max;
  end if;
  if exists (select 1 from public.nx_referral_codes where upper(code) = v) then raise exception 'Ce code est déjà pris : choisissez-en un autre.'; end if;
  insert into public.nx_referral_codes (partner_id, code, label) values (p.id, v, left(trim(coalesce(p_label, '')), 60)) returning * into c;
  return to_jsonb(c);
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
    raise exception 'Choisissez un moyen de versement proposé.';
  end if;
  if length(trim(coalesce(p_details, ''))) < 4 then
    raise exception 'Indiquez où verser vos gains (adresse PayPal, IBAN ou numéro Mobile Money).';
  end if;
  if exists (select 1 from public.nx_payouts where partner_id = p.id and status in ('requested', 'approved')) then
    raise exception 'Une demande de retrait est déjà en cours : attendez son traitement.';
  end if;
  if coalesce(p_amount_cents, 0) < v_min then raise exception 'Le retrait minimum est de %.', public.nx_money_fr(v_min); end if;
  v_avail := (public.nx_partner_balance(p.id) ->> 'available_cents')::numeric;
  if p_amount_cents > floor(v_avail) then
    raise exception 'Montant supérieur à vos gains disponibles (%).', public.nx_money_fr(floor(v_avail));
  end if;
  insert into public.nx_payouts (partner_id, amount_cents, method, details)
  values (p.id, p_amount_cents, p_method, left(trim(p_details), 300)) returning * into o;
  update public.nx_partners set payout_method = p_method, payout_details = left(trim(p_details), 300) where id = p.id;
  perform public.nx_referral_audit('payout.request', jsonb_build_object('partner', p.id, 'payout', o.id, 'amount_cents', o.amount_cents));
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
    raise exception 'Choisissez un moyen de versement proposé.';
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
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Indiquez le nom du parrain.'; end if;
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
    raise exception 'Indiquez la référence du versement (numéro de transaction).';
  end if;
  update public.nx_payouts set status = p_status, reference = left(trim(coalesce(p_reference, reference)), 120),
    admin_note = left(coalesce(nullif(p_note, ''), admin_note), 500), processed_at = now(), processed_by = auth.uid()
  where id = o.id returning * into o;
  perform public.nx_referral_audit('payout.' || p_status, jsonb_build_object('payout', o.id, 'partner', o.partner_id, 'amount_cents', o.amount_cents));
  return to_jsonb(o);
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
  if coalesce(p_paid_cents, 0) <= 0 then raise exception 'Indiquez le montant payé.'; end if;
  if not public.nx_referral_commission_add(p_user, p_paid_cents, 'usd', 'manual', v_ref, p_period) then
    raise exception 'Ce compte n’a pas de parrain actif.';
  end if;
  update public.nx_commissions set note = left(coalesce(p_note, ''), 300) where source_ref = v_ref returning * into c;
  perform public.nx_referral_audit('commission.manual', jsonb_build_object('commission', c.id, 'user', p_user, 'paid_cents', p_paid_cents));
  return to_jsonb(c);
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
      perform public.nx_brevo_send(b.email, b.full_name, 'Votre abonnement NEXORA Pro se termine dans 7 jours',
        'Bonjour' || case when b.full_name <> '' then ' ' || b.full_name else '' end || E',\n\nTon abonnement NEXORA Pro prend fin le ' || v_date || E'. Ensuite, votre compte repassera en offre Gratuite (Responsive Lab, Browser Lab et 2 applications).\n\nPour le garder, réactivez-le depuis le site de NEXORA, page « Ma licence ».\n\nL’équipe NEXORA', 'Abonnement');
    else
      perform public.nx_brevo_send(b.email, b.full_name, 'Votre abonnement NEXORA Pro se renouvelle dans 7 jours',
        'Bonjour' || case when b.full_name <> '' then ' ' || b.full_name else '' end || E',\n\nTon abonnement NEXORA Pro sera renouvelé automatiquement le ' || v_date || ' (' || public.nx_money_fr(v_amount) || case when b.period = 'year' then ' pour un an' else ' pour un mois' end || case when b.referred then ', remise du parrainage comprise' else '' end || E').\n\nRien à faire de votre côté. Pour changer de moyen de paiement ou résilier, ouvrez le site de NEXORA, page « Ma licence ».\n\nL’équipe NEXORA', 'Abonnement');
    end if;
    update public.nx_billing set reminded_for = b.current_period_end where user_id = b.user_id;
    n := n + 1;
  end loop;
  return n;
end
$$;

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
    || '<p style="margin:0"><b style="color:#0a0a0a;letter-spacing:1.5px">NEXORA</b> · créez, testez et publiez vos sites et applications.</p>'
    || '</td></tr></table></td></tr></table></body></html>';
end
$$;


-- ---------- Offres : descriptions et avantages d'origine ----------
with map(old, new) as (values
  ('Découvre NEXORA et teste tes premières applications.', 'Découvrez NEXORA et testez vos premières applications.'),
  ('Pour créer, importer et publier tes projets.', 'Pour créer, importer et publier vos projets.'),
  ('Le Responsive Lab et le Browser Lab, gratuits pour toujours. Tout NEXORA pendant ton premier jour.', 'Le Responsive Lab et le Browser Lab, gratuits pour toujours. Tout NEXORA pendant votre premier jour.')
)
update public.plans p
set description = m.new, updated_at = now()
from map m
where p.description = m.old;

with map(old, new) as (values
  ('Assistant IA avec ta propre clé', 'Assistant IA avec votre propre clé'),
  ('Assistant IA avec ta propre clé, sans limite ; 3 audits de sécurité par jour', 'Assistant IA avec votre propre clé, sans limite ; 3 audits de sécurité par jour'),
  ('Tout NEXORA gratuitement pendant ton premier jour', 'Tout NEXORA gratuitement pendant votre premier jour'),
  ('Tout NEXORA pendant ton premier jour', 'Tout NEXORA pendant votre premier jour')
)
update public.plans p
set features = (
    select coalesce(jsonb_agg(to_jsonb(coalesce(m.new, e.f)) order by e.n), '[]'::jsonb)
    from jsonb_array_elements_text(p.features) with ordinality as e(f, n)
    left join map m on m.old = e.f),
  updated_at = now()
where jsonb_typeof(p.features) = 'array'
  and exists (select 1 from jsonb_array_elements_text(p.features) as x(f) join map m on m.old = x.f);

-- ---------- Factures : pied de page d'origine ----------
update public.nx_private_config
set value = jsonb_set(value, '{footer}', to_jsonb('Merci de votre confiance.'::text))
where key = 'invoice_issuer' and value ->> 'footer' = 'Merci de ta confiance.';
