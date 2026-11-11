-- NEXORA #055 : Studio 3D & Motion : validation des vidéos par un client (lien sans compte, commentaires à une
-- seconde précise) et bibliothèque d'équipe 3D (mises en scène partagées). S'appuie sur 20261106000003 (liens,
-- avis, bibliothèques) et 20261106000004 (notifications). Idempotente.

-- ---------- Liens de validation : type « vidéo » ----------
alter table public.design_review_links add column if not exists kind text not null default 'design';
alter table public.design_review_links add column if not exists media_url text;
alter table public.design_review_links drop constraint if exists design_review_links_kind_check;
alter table public.design_review_links add constraint design_review_links_kind_check check (kind in ('design', 'video'));
alter table public.design_reviews add column if not exists t double precision;

create or replace function public.nx_review_get(p_token text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'name', l.name, 'kind', l.kind, 'media_url', l.media_url, 'pages', l.pages, 'created_at', l.created_at,
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('author', r.author, 'decision', r.decision, 'comment', r.comment, 'page', r.page, 'x', r.x, 'y', r.y, 't', r.t, 'created_at', r.created_at) order by r.created_at desc) from public.design_reviews r where r.token = l.token), '[]'::jsonb))
  from public.design_review_links l
  where l.token = p_token and l.active;
$$;

-- Ancienne signature (sans instant de la vidéo) retirée : une seule fonction, appelable avec ou sans p_t.
drop function if exists public.nx_review_post(text, text, text, text, integer, double precision, double precision);
create or replace function public.nx_review_post(p_token text, p_author text, p_decision text, p_comment text, p_page integer, p_x double precision default null, p_y double precision default null, p_t double precision default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_link public.design_review_links;
begin
  select * into v_link from public.design_review_links where token = p_token and active;
  if not found then raise exception 'Lien de validation introuvable ou fermé.'; end if;
  if (select count(*) from public.design_reviews where token = p_token) >= 300 then raise exception 'Ce lien a reçu le nombre maximal d’avis.'; end if;
  if coalesce(trim(p_author), '') = '' then raise exception 'Indique ton nom.'; end if;
  insert into public.design_reviews (token, author, decision, comment, page, x, y, t)
  values (p_token, left(trim(p_author), 80), case when p_decision in ('approve', 'changes', 'comment') then p_decision else 'comment' end, left(coalesce(p_comment, ''), 2000),
    greatest(0, least(coalesce(p_page, 0), jsonb_array_length(v_link.pages) - 1)),
    case when p_x between 0 and 1 then p_x end, case when p_y between 0 and 1 then p_y end,
    case when v_link.kind = 'video' and p_t between 0 and 36000 then round(p_t::numeric, 2)::double precision end);
  return (public.nx_review_get(p_token)) -> 'reviews';
end;
$$;
revoke all on function public.nx_review_get(text) from public;
revoke all on function public.nx_review_post(text, text, text, text, integer, double precision, double precision, double precision) from public;
grant execute on function public.nx_review_get(text) to anon, authenticated;
grant execute on function public.nx_review_post(text, text, text, text, integer, double precision, double precision, double precision) to anon, authenticated;

-- Notification : pour une vidéo, l'instant remplace le numéro de page.
create or replace function public.nx_review_place(p_kind text, p_page integer, p_t double precision)
returns text language sql immutable set search_path = public
as $$ select case when p_kind = 'video' and p_t is not null then format(' (à %s:%s)', floor(p_t / 60)::int, lpad((floor(p_t)::int % 60)::text, 2, '0')) when p_kind = 'video' then '' else format(' (page %s)', p_page + 1) end $$;

-- Déclencheur des avis (20261106000004) redéfini : instant de la vidéo dans le texte, lien et e-mail du Studio pour une vidéo.
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
  v_body := coalesce(nullif(btrim(new.comment), ''), 'Sans commentaire.') || public.nx_review_place(v_link.kind, new.page, new.t);

  insert into public.notifications (user_id, kind, title, body, link)
  select distinct m.user_id, 'design_review', left(v_title, 140), left(v_body, 500),
    case when v_link.kind = 'video' then v_link.doc_local_id else 'design:' || v_link.doc_local_id end
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
            using v_email, coalesce(v_name, ''), v_title,
              v_body || case when v_link.kind = 'video' then E'\n\nOuvre la scène dans le Studio 3D & Motion de NEXORA pour voir tous les avis.' else E'\n\nOuvre le document dans NEXORA pour voir l''avis et ses épingles.' end,
              case when v_link.kind = 'video' then 'Studio 3D & Motion' else 'NEX-DESIGN' end;
        exception when others then
          raise warning 'NEXORA : e-mail de validation non envoyé (%).', sqlerrm;
        end;
      end if;
    end if;
  end if;
  return new;
end
$$;
revoke all on function public.nx_review_notify() from public, anon, authenticated;

-- ---------- Vidéos à valider : compartiment de stockage ----------
-- Lecture publique par l'adresse (chemin aléatoire, donnée au client avec le lien) ; dépôt et suppression par le
-- propriétaire, les administrateurs et les éditeurs de l'espace, dans le dossier de l'espace (<espace>/<fichier>).
do $$
begin
  if to_regclass('storage.buckets') is null then return; end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('studio-reviews', 'studio-reviews', true, 104857600, array['video/mp4'])
  on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  execute 'drop policy if exists "studio_reviews_insert" on storage.objects';
  execute $p$create policy "studio_reviews_insert" on storage.objects for insert to authenticated
    with check (bucket_id = 'studio-reviews' and exists (select 1 from public.organization_members m where m.user_id = (select auth.uid()) and m.role in ('owner', 'admin', 'editor') and m.org_id::text = (storage.foldername(name))[1]))$p$;
  execute 'drop policy if exists "studio_reviews_delete" on storage.objects';
  execute $p$create policy "studio_reviews_delete" on storage.objects for delete to authenticated
    using (bucket_id = 'studio-reviews' and exists (select 1 from public.organization_members m where m.user_id = (select auth.uid()) and m.role in ('owner', 'admin', 'editor') and m.org_id::text = (storage.foldername(name))[1]))$p$;
end
$$;

-- ---------- Bibliothèque d'équipe 3D ----------
alter table public.design_libraries drop constraint if exists design_libraries_kind_check;
alter table public.design_libraries add constraint design_libraries_kind_check check (kind in ('components', 'variables', 'brand', 'studio'));
