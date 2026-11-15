-- NEXORA #125 : le travail en équipe est retiré de NEXORA (logiciel, site vitrine, offres) ; les administrateurs ont
-- tous les droits sur NEXORA et sur toutes ses données ; section « Données » du back office (NEX-SYSTEM, /nex-system/).
-- Aucune donnée n'est supprimée : équipes, membres et invitations déjà créés restent en base (lisibles et modifiables
-- depuis la section « Données »). Idempotente : peut être rejouée sans effet de bord.

-- ---------- 1. Offres : plus de mention de l'équipe ni des membres ----------
-- Copie dans nexora/app/renderer/nx/offres/catalog.js (FALLBACK, sansEquipe). La limite « members » reste dans les
-- données (lue par les contrôles des anciennes équipes) mais n'est plus affichée nulle part.
update public.plans p
set features = (
  select coalesce(jsonb_agg(to_jsonb(x.v) order by x.o), '[]'::jsonb)
  from (
    select t.o, btrim(regexp_replace(regexp_replace(t.f, ',\s*(l''|l’)?équipes?\M', '', 'gi'), ',?\s*[0-9]+\s+membres?\M', '', 'gi')) as v
    from jsonb_array_elements_text(p.features) with ordinality as t(f, o)
  ) x
  where x.v <> '' and x.v !~* '\m(équipes?|membres?)\M'
), updated_at = now()
where jsonb_typeof(p.features) = 'array' and p.features::text ~* '\m(équipes?|membres?)\M';

-- ---------- 2. Administrateurs : tous les droits ----------
-- Un seul rôle d'administration : « admin » devient « superadmin » (comptes existants et chaque nomination à venir),
-- si bien que tous les contrôles existants de la base et des fonctions Edge (admin-users : suppression de comptes,
-- comptes d'administrateurs ; configuration ; secret du Worker) laissent passer chaque administrateur.
create or replace function public.nx_admin_full_role()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if new.app_role::text = 'admin' then new.app_role := 'superadmin'; end if;
  return new;
end
$$;
drop trigger if exists nx_admin_full_role on public.profiles;
create trigger nx_admin_full_role before insert or update of app_role on public.profiles
  for each row execute function public.nx_admin_full_role();
update public.profiles set app_role = 'superadmin' where app_role::text = 'admin';

-- ---------- 3. Section « Données » du back office ----------
-- Lire, rechercher, modifier, ajouter et supprimer n'importe quelle ligne de n'importe quelle table du schéma public,
-- réservé aux administrateurs (nx_admin_required), sans clé de service dans le navigateur. Noms de tables et de colonnes
-- vérifiés dans le catalogue, valeurs converties par jsonb_populate_record (aucune valeur collée dans le SQL). Chaque
-- écriture est journalisée dans audit_logs (avant et après) ; le journal d'audit lui-même reste en lecture seule.

-- Table du schéma public (tables ordinaires et partitionnées), sinon erreur.
create or replace function public.nx_admin_data_rel(p_table text)
returns regclass
language plpgsql stable security definer set search_path = public
as $$
declare
  v regclass;
begin
  select c.oid::regclass into v
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname = p_table;
  if v is null then raise exception 'Table inconnue : %.', p_table using errcode = '42P01'; end if;
  return v;
end
$$;

-- Colonnes de la clé primaire, dans l'ordre de la clé.
create or replace function public.nx_admin_data_key(p_rel regclass)
returns text[]
language sql stable security definer set search_path = public
as $$
  select coalesce(array_agg(a.attname::text order by k.n), '{}')
  from pg_index i
  cross join lateral unnest(i.indkey::int2[]) with ordinality as k(attnum, n)
  join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
  where i.indrelid = p_rel and i.indisprimary;
$$;

-- Colonnes modifiables (ni calculées, ni identités « always ») parmi les clés d'un objet JSON.
create or replace function public.nx_admin_data_cols(p_rel regclass, p_values jsonb)
returns text[]
language sql stable security definer set search_path = public
as $$
  select coalesce(array_agg(a.attname::text order by a.attnum), '{}')
  from pg_attribute a
  where a.attrelid = p_rel and a.attnum > 0 and not a.attisdropped and a.attgenerated = '' and a.attidentity <> 'a'
    and p_values ? a.attname::text;
$$;

-- Condition « t.clé = r.clé » sur toute la clé primaire ; refus sans clé primaire ou si la clé est incomplète.
create or replace function public.nx_admin_data_where(p_rel regclass, p_key jsonb)
returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  k text[] := public.nx_admin_data_key(p_rel);
begin
  if cardinality(k) = 0 then raise exception 'Cette table n’a pas de clé primaire : modifiez-la depuis l’éditeur SQL de Supabase.'; end if;
  if p_key is null or jsonb_typeof(p_key) <> 'object' or not (p_key ?& k) then raise exception 'Clé de la ligne incomplète (attendu : %).', array_to_string(k, ', '); end if;
  return (select string_agg(format('t.%1$I is not distinct from r.%1$I', c), ' and ') from unnest(k) as c);
end
$$;

create or replace function public.nx_admin_data_log(p_action text, p_table text, p_meta jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if to_regclass('public.audit_logs') is null then return; end if;
  execute 'insert into public.audit_logs (action, actor_id, entity, meta) values ($1, $2, $3, $4)'
    using p_action, auth.uid(), p_table, coalesce(p_meta, '{}'::jsonb);
end
$$;

create or replace function public.nx_admin_data_guard(p_table text)
returns void
language plpgsql stable security definer set search_path = public
as $$
begin
  if p_table = 'audit_logs' then raise exception 'Le journal d’audit est en lecture seule : il garde la trace de chaque modification.'; end if;
end
$$;

-- Liste des tables : nom, nombre de lignes estimé, colonnes (type, valeur par défaut, obligatoire), clé primaire.
create or replace function public.nx_admin_data_tables()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  perform public.nx_admin_required();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', c.relname,
      'rows', greatest(c.reltuples, 0)::bigint,
      'readonly', c.relname = 'audit_logs',
      'key', to_jsonb(public.nx_admin_data_key(c.oid::regclass)),
      'columns', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'name', a.attname, 'type', format_type(a.atttypid, a.atttypmod), 'nullable', not a.attnotnull,
          'default', pg_get_expr(d.adbin, d.adrelid), 'generated', a.attgenerated <> '' or a.attidentity = 'a'
        ) order by a.attnum), '[]'::jsonb)
        from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
        where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      )
    ) order by c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  ), '[]'::jsonb);
end
$$;

-- Lignes d'une table : recherche dans toute la ligne, tri sur une colonne, pages de 500 lignes au plus.
create or replace function public.nx_admin_data_rows(p_table text, p_search text default null, p_order text default null, p_desc boolean default true, p_limit integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_rel regclass;
  v_where text := '';
  v_order text := '';
  v_total bigint;
  v_rows jsonb;
begin
  perform public.nx_admin_required();
  v_rel := public.nx_admin_data_rel(p_table);
  if coalesce(btrim(p_search), '') <> '' then v_where := format(' where t::text ilike %L', '%' || btrim(p_search) || '%'); end if;
  if p_order is not null and exists (select 1 from pg_attribute where attrelid = v_rel and attname = p_order and attnum > 0 and not attisdropped) then
    v_order := format(' order by t.%I %s nulls last', p_order, case when coalesce(p_desc, true) then 'desc' else 'asc' end);
  end if;
  execute format('select count(*) from %s t%s', v_rel, v_where) into v_total;
  execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from (select t.* from %s t%s%s limit %s offset %s) x',
    v_rel, v_where, v_order, least(greatest(coalesce(p_limit, 50), 1), 500), greatest(coalesce(p_offset, 0), 0)) into v_rows;
  return jsonb_build_object('total', v_total, 'rows', v_rows, 'key', to_jsonb(public.nx_admin_data_key(v_rel)));
end
$$;

-- Modifier une ligne (désignée par sa clé primaire) : seules les colonnes présentes dans p_values changent.
create or replace function public.nx_admin_data_update(p_table text, p_key jsonb, p_values jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_rel regclass;
  v_cond text;
  v_cols text[];
  v_old jsonb;
  v_new jsonb;
begin
  perform public.nx_admin_required();
  perform public.nx_admin_data_guard(p_table);
  v_rel := public.nx_admin_data_rel(p_table);
  v_cond := public.nx_admin_data_where(v_rel, p_key);
  v_cols := public.nx_admin_data_cols(v_rel, coalesce(p_values, '{}'::jsonb));
  if cardinality(v_cols) = 0 then raise exception 'Aucune colonne modifiable dans la demande.'; end if;
  execute format('select to_jsonb(t) from %1$s t, jsonb_populate_record(null::%1$s, $1) r where %2$s', v_rel, v_cond) using p_key into v_old;
  if v_old is null then raise exception 'Ligne introuvable : elle a peut-être été supprimée.'; end if;
  execute format('update %1$s t set (%2$s) = (select %3$s from jsonb_populate_record(null::%1$s, $2) v) from jsonb_populate_record(null::%1$s, $1) r where %4$s returning to_jsonb(t)',
    v_rel,
    (select string_agg(format('%I', c), ', ') from unnest(v_cols) c),
    (select string_agg(format('v.%I', c), ', ') from unnest(v_cols) c),
    v_cond) using p_key, p_values into v_new;
  perform public.nx_admin_data_log('data.update', p_table, jsonb_build_object('key', p_key, 'before', v_old, 'after', v_new));
  return v_new;
end
$$;

-- Ajouter une ligne : colonnes absentes = valeurs par défaut de la table.
create or replace function public.nx_admin_data_insert(p_table text, p_values jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_rel regclass;
  v_cols text[];
  v_new jsonb;
begin
  perform public.nx_admin_required();
  perform public.nx_admin_data_guard(p_table);
  v_rel := public.nx_admin_data_rel(p_table);
  v_cols := public.nx_admin_data_cols(v_rel, coalesce(p_values, '{}'::jsonb));
  if cardinality(v_cols) = 0 then
    execute format('insert into %s as t default values returning to_jsonb(t)', v_rel) into v_new;
  else
    execute format('insert into %1$s as t (%2$s) select %3$s from jsonb_populate_record(null::%1$s, $1) v returning to_jsonb(t)',
      v_rel,
      (select string_agg(format('%I', c), ', ') from unnest(v_cols) c),
      (select string_agg(format('v.%I', c), ', ') from unnest(v_cols) c)) using p_values into v_new;
  end if;
  perform public.nx_admin_data_log('data.insert', p_table, jsonb_build_object('after', v_new));
  return v_new;
end
$$;

-- Supprimer une ligne (désignée par sa clé primaire) ; la ligne supprimée est gardée dans le journal d'audit.
create or replace function public.nx_admin_data_delete(p_table text, p_key jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_rel regclass;
  v_old jsonb;
begin
  perform public.nx_admin_required();
  perform public.nx_admin_data_guard(p_table);
  v_rel := public.nx_admin_data_rel(p_table);
  execute format('delete from %1$s t using jsonb_populate_record(null::%1$s, $1) r where %2$s returning to_jsonb(t)', v_rel, public.nx_admin_data_where(v_rel, p_key))
    using p_key into v_old;
  if v_old is null then raise exception 'Ligne introuvable : elle a peut-être déjà été supprimée.'; end if;
  perform public.nx_admin_data_log('data.delete', p_table, jsonb_build_object('key', p_key, 'before', v_old));
  return v_old;
end
$$;

-- Droits : les fonctions internes ne sont appelables que par les fonctions ci-dessus ; les fonctions de la section
-- « Données » par les comptes connectés (refus à l'intérieur pour tout compte qui n'est pas administrateur).
revoke all on function public.nx_admin_full_role() from public, anon, authenticated;
revoke all on function public.nx_admin_data_rel(text) from public, anon, authenticated;
revoke all on function public.nx_admin_data_key(regclass) from public, anon, authenticated;
revoke all on function public.nx_admin_data_cols(regclass, jsonb) from public, anon, authenticated;
revoke all on function public.nx_admin_data_where(regclass, jsonb) from public, anon, authenticated;
revoke all on function public.nx_admin_data_log(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.nx_admin_data_guard(text) from public, anon, authenticated;
revoke all on function public.nx_admin_data_tables() from public, anon;
revoke all on function public.nx_admin_data_rows(text, text, text, boolean, integer, integer) from public, anon;
revoke all on function public.nx_admin_data_update(text, jsonb, jsonb) from public, anon;
revoke all on function public.nx_admin_data_insert(text, jsonb) from public, anon;
revoke all on function public.nx_admin_data_delete(text, jsonb) from public, anon;
grant execute on function public.nx_admin_data_tables() to authenticated;
grant execute on function public.nx_admin_data_rows(text, text, text, boolean, integer, integer) to authenticated;
grant execute on function public.nx_admin_data_update(text, jsonb, jsonb) to authenticated;
grant execute on function public.nx_admin_data_insert(text, jsonb) to authenticated;
grant execute on function public.nx_admin_data_delete(text, jsonb) to authenticated;
