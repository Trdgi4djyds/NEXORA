-- NEXORA #025 — Adresse publique de NEXORA web (Cloudflare Workers) dans app_config.web_url : liens de partage (NEX-DESIGN) et d'invitation créés par l'application Windows. Ne remplace pas une valeur déjà réglée. Idempotent.
-- L'application lit app_config au démarrage et suit ses changements en temps réel (cloud.config.web_url).
-- Pour changer l'adresse plus tard : back office → Configuration (clé web_url).
insert into public.app_config (key, value, description)
values (
  'web_url',
  to_jsonb('https://nexora.abrahamtogbonon0.workers.dev/'::text),
  'Adresse publique de NEXORA web (liens de partage et d''invitation)'
)
on conflict (key) do nothing;
