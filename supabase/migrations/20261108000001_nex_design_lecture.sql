-- NEXORA #075 : liens en lecture seule de NEX-DESIGN, avec toutes les pages (le lien de partage d'origine ne montrait
-- qu'une vignette). Ce sont des liens de la table des liens de validation (design_review_links) au mode « view » :
-- la personne qui a le lien voit toutes les pages, sans compte, mais ne peut pas déposer d'avis.
-- Idempotente ; suppose 20261106000003 (liens de validation) et 20261106000005 (vidéos du Studio).

alter table public.design_review_links add column if not exists mode text not null default 'review';
do $$ begin
  alter table public.design_review_links add constraint design_review_links_mode check (mode in ('review', 'view'));
exception when duplicate_object then null; end $$;

create or replace function public.nx_review_get(p_token text)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'name', l.name, 'kind', l.kind, 'mode', l.mode, 'media_url', l.media_url, 'pages', l.pages, 'created_at', l.created_at,
    'reviews', case when l.mode = 'view' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('author', r.author, 'decision', r.decision, 'comment', r.comment, 'page', r.page, 'x', r.x, 'y', r.y, 't', r.t, 'created_at', r.created_at) order by r.created_at desc) from public.design_reviews r where r.token = l.token), '[]'::jsonb) end)
  from public.design_review_links l
  where l.token = p_token and l.active;
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
