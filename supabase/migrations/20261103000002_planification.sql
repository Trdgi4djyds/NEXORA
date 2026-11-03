-- NEXORA #007 — Tâches planifiées (pg_cron) : vérification des sites surveillés, collecte des
-- résultats (pg_net) et nettoyage quotidien. Les fonctions existent déjà dans la base
-- (run_monitor_checks, collect_monitor_results, cleanup_old_data) ; cette migration ne crée une
-- tâche que si aucune tâche existante n'appelle déjà la fonction. Idempotent.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from cron.job where command ilike '%run_monitor_checks%') then
    perform cron.schedule('nexora-monitor-checks', '* * * * *', 'select public.run_monitor_checks()');
  end if;
  if not exists (select 1 from cron.job where command ilike '%collect_monitor_results%') then
    perform cron.schedule('nexora-monitor-results', '* * * * *', 'select public.collect_monitor_results()');
  end if;
  if not exists (select 1 from cron.job where command ilike '%cleanup_old_data%') then
    perform cron.schedule('nexora-cleanup', '30 3 * * *', 'select public.cleanup_old_data()');
  end if;
end
$$;
