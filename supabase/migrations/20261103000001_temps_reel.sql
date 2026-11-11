-- NEXORA #007 — Temps réel : ajoute à la publication supabase_realtime les tables que l'application
-- et le back office écoutent (postgres_changes). Sans elles, notifications, changements d'offre,
-- drapeaux, configuration et réponses du support n'arrivent qu'au rechargement.
-- Idempotent : une table déjà publiée n'est pas ajoutée une seconde fois.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array[
    'announcements', 'app_config', 'design_documents', 'feature_flags', 'monitors', 'notifications',
    'organization_members', 'profiles', 'projects', 'studio_items', 'subscriptions', 'ticket_messages'
  ] loop
    if to_regclass(format('public.%I', t)) is not null and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end
$$;
