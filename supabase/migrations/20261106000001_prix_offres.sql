-- NEXORA #051 : nouveaux prix des offres en dollars : Gratuit 0 $, Standard 12 $ par mois (120 $ par an),
-- Pro 18 $ par mois (180 $ par an), au lieu de 10 $ (100 $) et 25 $ (250 $).
-- La migration des offres (20261104000007) crée déjà les offres à ces prix au premier passage. Celle-ci corrige
-- les offres créées plus tôt aux anciens prix.
-- Idempotente : seul un prix encore égal à l'ancien est changé ; un prix modifié ensuite dans le back office
-- est conservé.
-- NEXORA #090 : sans effet après une réécriture plus récente des offres (repères offres_v2 à offres_v4 de app_config) :
-- rejouée par « Tout appliquer », elle ramenait le Pro à 25 $ du #090 à 18 $ (puis le #059 à 24 $, cause d'A-053).

do $$
begin
  if to_regclass('public.app_config') is not null then
    if exists (select 1 from public.app_config where key in ('offres_v2', 'offres_v3', 'offres_v4')) then return; end if;
  end if;

  update public.plans
  set price_month_cents = 1200, updated_at = now()
  where id = 'standard' and price_month_cents = 1000;

  update public.plans
  set price_year_cents = 12000, updated_at = now()
  where id = 'standard' and price_year_cents = 10000;

  update public.plans
  set price_month_cents = 1800, updated_at = now()
  where id = 'pro' and price_month_cents = 2500;

  update public.plans
  set price_year_cents = 18000, updated_at = now()
  where id = 'pro' and price_year_cents = 25000;
end
$$;
