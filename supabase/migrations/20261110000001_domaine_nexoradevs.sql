-- NEXORA #096 — Domaine principal nexoradevs.online : site vitrine à la racine, NEXORA web à /studio/.
-- L'adresse workers.dev d'origine est désactivée dans Cloudflare. Remplace seulement les anciennes valeurs par défaut
-- (une adresse réglée à la main dans le back office est gardée). Idempotent.

-- Adresse publique de NEXORA web (liens de partage et d'invitation créés par l'application Windows, cloud.config.web_url).
update public.app_config
   set value = to_jsonb('https://nexoradevs.online/studio/'::text)
 where key = 'web_url'
   and coalesce(value #>> '{}', '') in ('', 'https://nexora.abrahamtogbonon0.workers.dev/', 'https://nexora.abrahamtogbonon0.workers.dev');

insert into public.app_config (key, value, description)
values ('web_url', to_jsonb('https://nexoradevs.online/studio/'::text), 'Adresse publique de NEXORA web (liens de partage et d''invitation)')
on conflict (key) do nothing;

-- Site de l'émetteur des factures.
update public.nx_private_config
   set value = jsonb_set(value, '{website}', to_jsonb('https://nexoradevs.online/'::text))
 where key = 'invoice_issuer'
   and coalesce(value ->> 'website', '') in ('', 'https://nexora.abrahamtogbonon0.workers.dev/', 'https://nexora.abrahamtogbonon0.workers.dev');
