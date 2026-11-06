-- NEXORA #054 : avis de validation NEX-DESIGN (liens #/revue/…, migration 20261106000003) : chaque avis crée une
-- notification dans NEXORA pour la personne qui a créé le lien (à défaut : propriétaire, administrateurs et
-- éditeurs de l'espace). Les décisions (« Approuver », « Demander des changements ») partent aussi par e-mail
-- quand les alertes e-mail sont actives, au plus une fois par lien toutes les 15 minutes.
-- Idempotente ; à appliquer après 20261106000003_nex_design.sql.

create or replace function public.nx_review_notify()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_link public.design_review_links;
  v_title text;
  v_body text;
  v_cfg jsonb;
  v_email text;
  v_name text := '';
begin
  select * into v_link from public.design_review_links where token = new.token;
  if not found then return new; end if;
  v_title := case new.decision
    when 'approve' then format('%s a approuvé « %s »', new.author, v_link.name)
    when 'changes' then format('%s demande des changements sur « %s »', new.author, v_link.name)
    else format('Nouveau commentaire de %s sur « %s »', new.author, v_link.name) end;
  v_body := coalesce(nullif(btrim(new.comment), ''), 'Sans commentaire.') || format(' (page %s)', new.page + 1);

  insert into public.notifications (user_id, kind, title, body, link)
  select distinct m.user_id, 'design_review', left(v_title, 140), left(v_body, 500), 'design:' || v_link.doc_local_id
  from public.organization_members m
  where m.org_id = v_link.org_id
    and (m.user_id = v_link.created_by or (v_link.created_by is null and m.role in ('owner', 'admin', 'editor')));

  -- E-mail : décisions seulement, une fois par lien toutes les 15 minutes, si les alertes e-mail sont actives.
  if new.decision in ('approve', 'changes') and v_link.created_by is not null
    and to_regprocedure('public.nx_brevo_send(text,text,text,text,text)') is not null
    and to_regclass('public.app_config') is not null
    and not exists (select 1 from public.design_reviews r where r.token = new.token and r.id <> new.id
      and r.decision in ('approve', 'changes') and r.created_at > now() - interval '15 minutes') then
    execute 'select value from public.app_config where key = $1' into v_cfg using 'email_alerts';
    if coalesce((v_cfg ->> 'enabled')::boolean, false) then
      select u.email into v_email from auth.users u where u.id = v_link.created_by;
      if to_regclass('public.profiles') is not null then
        execute 'select coalesce(full_name, '''') from public.profiles where id = $1' into v_name using v_link.created_by;
      end if;
      if v_email is not null then
        begin
          execute 'select public.nx_brevo_send($1, $2, $3, $4, $5)'
            using v_email, coalesce(v_name, ''), v_title, v_body || E'\n\nOuvre le document dans NEXORA pour voir l''avis et ses épingles.', 'NEX-DESIGN';
        exception when others then
          raise warning 'NEXORA : e-mail de validation non envoyé (%).', sqlerrm;
        end;
      end if;
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists nx_review_notify on public.design_reviews;
create trigger nx_review_notify after insert on public.design_reviews
  for each row execute function public.nx_review_notify();

revoke all on function public.nx_review_notify() from public, anon, authenticated;
