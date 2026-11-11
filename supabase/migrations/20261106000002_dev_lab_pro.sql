-- NEXORA #052 : outils Pro du Dev Lab (assistant IA sur tout le projet, débogueur, mise en ligne en un clic,
-- contrôles avant mise en ligne, explorateur de bases de données) : permission « devlab_pro » réservée à Pro.
-- Lue par nx_plan_status (perms de l'offre) ; aucune consommation de quota, donc pas de règle dans nx_feature_rule.
-- Idempotente : la permission n'est ajoutée qu'aux offres qui ne l'ont pas encore (réglage du back office conservé).
update public.plans set perms = perms || jsonb_build_object('devlab_pro', id in ('pro', 'team', 'enterprise')) where not (perms ? 'devlab_pro');

-- Ligne ajoutée à la liste des avantages de Pro, une seule fois.
update public.plans
set features = features || '["Dev Lab Pro : assistant IA sur tout le projet, débogueur, mise en ligne, contrôles et bases de données"]'::jsonb,
    updated_at = now()
where id = 'pro' and not exists (select 1 from jsonb_array_elements_text(features) f where f like 'Dev Lab Pro%');
