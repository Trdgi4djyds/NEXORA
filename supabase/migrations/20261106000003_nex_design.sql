-- NEXORA #053 : NEX-DESIGN : liens de validation par un client (pages publiées en images, avis sans compte)
-- et bibliothèques d'équipe (composants, variables, kits de marque partagés par les membres d'un espace).
-- Idempotente : peut être appliquée plusieurs fois.

-- ---------- Liens de validation ----------
create table if not exists public.design_review_links (
  token text primary key default replace(gen_random_uuid()::text, '-', ''),
  org_id uuid not null references public.organizations(id) on delete cascade,
  doc_local_id text not null,
  name text not null default 'Design',
  pages jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists design_review_links_doc on public.design_review_links (org_id, doc_local_id);

create table if not exists public.design_reviews (
  id uuid primary key default gen_random_uuid(),
  token text not null references public.design_review_links(token) on delete cascade,
  author text not null,
  decision text not null default 'comment' check (decision in ('approve', 'changes', 'comment')),
  comment text not null default '',
  page integer not null default 0,
  x double precision,
  y double precision,
  created_at timestamptz not null default now()
);
create index if not exists design_reviews_token on public.design_reviews (token, created_at);

alter table public.design_review_links enable row level security;
alter table public.design_reviews enable row level security;

-- Membres de l'espace : lecture des liens et des avis ; création et fermeture par le propriétaire, les
-- administrateurs et les éditeurs (mêmes rôles que les autres écritures de l'espace).
drop policy if exists "design_review_links_member" on public.design_review_links;
drop policy if exists "design_review_links_read" on public.design_review_links;
create policy "design_review_links_read" on public.design_review_links for select to authenticated
  using (exists (select 1 from public.organization_members m where m.org_id = design_review_links.org_id and m.user_id = (select auth.uid())));
drop policy if exists "design_review_links_write" on public.design_review_links;
create policy "design_review_links_write" on public.design_review_links for all to authenticated
  using (exists (select 1 from public.organization_members m where m.org_id = design_review_links.org_id and m.user_id = (select auth.uid()) and m.role in ('owner', 'admin', 'editor')))
  with check (exists (select 1 from public.organization_members m where m.org_id = design_review_links.org_id and m.user_id = (select auth.uid()) and m.role in ('owner', 'admin', 'editor')));
drop policy if exists "design_reviews_member_read" on public.design_reviews;
create policy "design_reviews_member_read" on public.design_reviews for select to authenticated
  using (exists (select 1 from public.design_review_links l join public.organization_members m on m.org_id = l.org_id where l.token = design_reviews.token and m.user_id = (select auth.uid())));

-- Personne qui a le lien (sans compte) : lecture du lien actif et de ses avis.
create or replace function public.nx_review_get(p_token text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'name', l.name, 'pages', l.pages, 'created_at', l.created_at,
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('author', r.author, 'decision', r.decision, 'comment', r.comment, 'page', r.page, 'x', r.x, 'y', r.y, 'created_at', r.created_at) order by r.created_at desc) from public.design_reviews r where r.token = l.token), '[]'::jsonb))
  from public.design_review_links l
  where l.token = p_token and l.active;
$$;

-- Avis déposé avec le lien : textes limités, 300 avis au plus par lien.
create or replace function public.nx_review_post(p_token text, p_author text, p_decision text, p_comment text, p_page integer, p_x double precision default null, p_y double precision default null)
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
  insert into public.design_reviews (token, author, decision, comment, page, x, y)
  values (p_token, left(trim(p_author), 80), case when p_decision in ('approve', 'changes', 'comment') then p_decision else 'comment' end, left(coalesce(p_comment, ''), 2000),
    greatest(0, least(coalesce(p_page, 0), jsonb_array_length(v_link.pages) - 1)),
    case when p_x between 0 and 1 then p_x end, case when p_y between 0 and 1 then p_y end);
  return (public.nx_review_get(p_token)) -> 'reviews';
end;
$$;

revoke all on function public.nx_review_get(text) from public;
revoke all on function public.nx_review_post(text, text, text, text, integer, double precision, double precision) from public;
grant execute on function public.nx_review_get(text) to anon, authenticated;
grant execute on function public.nx_review_post(text, text, text, text, integer, double precision, double precision) to anon, authenticated;

-- ---------- Bibliothèques d'équipe ----------
create table if not exists public.design_libraries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('components', 'variables', 'brand')),
  name text not null,
  data jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (org_id, kind, name)
);
alter table public.design_libraries enable row level security;
drop policy if exists "design_libraries_member" on public.design_libraries;
drop policy if exists "design_libraries_read" on public.design_libraries;
create policy "design_libraries_read" on public.design_libraries for select to authenticated
  using (exists (select 1 from public.organization_members m where m.org_id = design_libraries.org_id and m.user_id = (select auth.uid())));
drop policy if exists "design_libraries_write" on public.design_libraries;
create policy "design_libraries_write" on public.design_libraries for all to authenticated
  using (exists (select 1 from public.organization_members m where m.org_id = design_libraries.org_id and m.user_id = (select auth.uid()) and m.role in ('owner', 'admin', 'editor')))
  with check (exists (select 1 from public.organization_members m where m.org_id = design_libraries.org_id and m.user_id = (select auth.uid()) and m.role in ('owner', 'admin', 'editor')));

grant select, insert, update, delete on public.design_review_links, public.design_libraries to authenticated;
grant select on public.design_reviews to authenticated;
