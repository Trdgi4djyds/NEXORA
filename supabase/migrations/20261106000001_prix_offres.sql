-- NEXORA #051 : nouveaux prix des offres en dollars : Gratuit 0 $, Standard 12 $ par mois (120 $ par an),
-- Pro 18 $ par mois (180 $ par an), au lieu de 10 $ (100 $) et 25 $ (250 $).
-- La migration des offres (20261104000007) crée déjà les offres à ces prix au premier passage. Celle-ci corrige
-- les offres créées plus tôt aux anciens prix.
-- Idempotente : seul un prix encore égal à l'ancien est changé ; un prix modifié ensuite dans le back office
-- est conservé.

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
