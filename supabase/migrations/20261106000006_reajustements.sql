-- NEXORA #059 : réajustements de sécurité et des offres.
-- 1. Droits des fonctions (A-033) : nx_monitor_hook_token, nx_org_perm et rum_summary sont réservées aux comptes
--    connectés. La migration 20261105000008 les retirait à « anon » sans les retirer à PUBLIC, qui les accorde
--    à tout le monde par défaut : elles restaient appelables sans compte.
--    Restent publiques par conception, chacune protégée par un jeton, un secret ou un lien (liste « anonOk » de
--    scripts/valider.mjs) : nx_heartbeat_ping et nx_deploy_mark (jeton), nx_probe_jobs et nx_probe_report
--    (secret partagé avec Cloudflare), nx_rum_collect (clé du site, débit limité), nx_status_page,
--    nx_status_subscribe, nx_status_confirm et nx_status_unsubscribe (page de statut publique, jetons, débit
--    limité), nx_review_get et nx_review_post (liens de validation).
-- 2. Pro passe de 18 $ à 24 $ par mois (de 180 $ à 240 $ par an).
-- 3. L'assistant IA utilise la clé de l'utilisateur (ou Ollama sur son PC) : plus de quota de requêtes.
-- 4. Les fonctions de base du Dev Lab (dossiers, éditeur, terminal, Git, aperçu) entrent dans l'offre Gratuite ;
--    ce contrôle est fait par l'application (src/plan.js), la permission « devlab » garde les outils avancés.
-- Idempotente : un prix, une limite ou un texte modifié dans le back office est conservé ; les fonctions absentes
-- (migrations précédentes non appliquées) sont ignorées.

do $$
declare
  f text;
begin
  foreach f in array array['public.nx_monitor_hook_token(uuid)', 'public.nx_org_perm(uuid, text)', 'public.rum_summary(uuid, integer)'] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon', f);
      execute format('grant execute on function %s to authenticated', f);
    end if;
  end loop;
end $$;

update public.plans set price_month_cents = 2400, updated_at = now() where id = 'pro' and price_month_cents = 1800;
update public.plans set price_year_cents = 24000, updated_at = now() where id = 'pro' and price_year_cents = 18000;

update public.plans set limits = limits || '{"ai_requests_month": -1}'::jsonb, updated_at = now()
where (id, limits ->> 'ai_requests_month') in (('free', '30'), ('standard', '500'), ('pro', '3000'));

-- Textes des avantages : seuls les textes d'origine sont remplacés ; « null » retire la ligne.
with map(old, new) as (values
  ('30 requêtes IA par mois, 3 audits de sécurité par jour', 'Assistant IA avec ta propre clé, sans limite ; 3 audits de sécurité par jour'),
  ('Dev Lab, Desktop Builder et prévisualisation', 'Desktop Builder : logiciels Windows installables'),
  ('500 requêtes IA par mois', 'Dev Lab avancé : Problèmes, scripts, tests, API, Git avancé, partage en ligne'),
  ('3 000 requêtes IA par mois', null)
)
update public.plans p
set features = (
    select coalesce(jsonb_agg(to_jsonb(coalesce(m.new, e.f)) order by e.n) filter (where m.old is null or m.new is not null), '[]'::jsonb)
    from jsonb_array_elements_text(p.features) with ordinality as e(f, n)
    left join map m on m.old = e.f),
  updated_at = now()
where p.id in ('free', 'standard', 'pro')
  and exists (select 1 from jsonb_array_elements_text(p.features) as x(f) join map m on m.old = x.f);

update public.plans
set features = features || '["Dev Lab : dossiers, éditeur, terminal, Git et aperçu"]'::jsonb, updated_at = now()
where id = 'free' and not exists (select 1 from jsonb_array_elements_text(features) f where f like 'Dev Lab%');
