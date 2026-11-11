-- NEXORA #084 : dernière publication vérifiée par le service de sécurité (Worker), gardée dans app_config
-- (« release_latest ») pour continuer à déclarer la publication officielle quand GitHub ne répond pas ou répond une
-- erreur mise en cache. Écrite seulement par le Worker (secret partagé) et seulement si le numéro de manifeste
-- augmente ; relue avec la politique des versions (nx_release_policy). Idempotente ; après 20261108000003.

create or replace function public.nx_release_seen(p_secret text, p_publication jsonb)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_old bigint;
  v_new bigint;
begin
  if not public.nx_worker_secret_ok(p_secret) then raise exception 'Accès refusé.'; end if;
  if p_publication is null or jsonb_typeof(p_publication) <> 'object' then return false; end if;
  v_new := case when coalesce(p_publication ->> 'manifest_version', '') ~ '^\d{1,15}$' then (p_publication ->> 'manifest_version')::bigint else 0 end;
  select case when coalesce(value ->> 'manifest_version', '') ~ '^\d{1,15}$' then (value ->> 'manifest_version')::bigint else 0 end
    into v_old from public.app_config where key = 'release_latest';
  if v_new <= coalesce(v_old, 0) or coalesce(p_publication ->> 'manifest_sha256', '') !~ '^[0-9a-f]{64}$' then return false; end if;
  insert into public.app_config (key, value, description)
  values ('release_latest', jsonb_build_object(
      'version', left(coalesce(p_publication ->> 'version', ''), 40), 'manifest_version', v_new,
      'manifest_sha256', p_publication ->> 'manifest_sha256', 'issued_at', left(coalesce(p_publication ->> 'issued_at', ''), 40),
      'expires_at', left(coalesce(p_publication ->> 'expires_at', ''), 40), 'release', left(coalesce(p_publication ->> 'release', 'stable'), 20),
      'tag', left(coalesce(p_publication ->> 'tag', ''), 60), 'seen_at', now()),
    'Dernière publication de NEXORA Devs Toolbox vérifiée par le service de sécurité (#084).')
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return true;
end
$$;

create or replace function public.nx_release_policy()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select public.nx_policy('release_policy')
    || jsonb_build_object('latest_seen', nullif(public.nx_policy('release_latest'), '{}'::jsonb));
$$;

revoke all on function public.nx_release_seen(text, jsonb) from public;
grant execute on function public.nx_release_seen(text, jsonb) to anon, authenticated;
grant execute on function public.nx_release_policy() to anon, authenticated;
