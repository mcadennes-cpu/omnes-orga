-- =====================================================================
-- Etape 22 / MOD-1 / sous-etape 6F-1
-- Activer un plan de roulement a une date choisie
--
-- Deuxieme -- et derniere -- porte d'ecriture des plans, apres celle de
-- 6E-2. Les policies RLS n'accordent toujours aucune ecriture directe.
--
-- ⚠ CE QUE CETTE FONCTION NE FAIT PAS : archiver le plan remplace.
--
-- La doc de MOD-1 annoncait « l'ancien est archive avec sa effective_to ».
-- Pris au pied de la lettre, ce serait un bug : `getRotationPlans()` ne
-- charge que les plans `active` (rotationUtils.ts), et `plan_applicable()`
-- filtre pareil. Un plan archive disparaitrait donc de la resolution POUR
-- LES DATES PASSEES QU'IL COUVRAIT -- « quel roulement s'appliquait en
-- mars ? » n'aurait plus de reponse, ce que MOD-1 vient precisement
-- corriger.
--
-- Le statut se lit donc ainsi :
--   draft    -- prepare, hors de la frise
--   active   -- DANS la frise : passe, present ou futur
--   archived -- retire de la frise (un brouillon abandonne, un plan qui
--               n'a jamais servi). Pas « perime ».
--
-- « En vigueur aujourd'hui » n'est pas un statut, c'est un calcul :
-- active ET current_date dans [effective_from, effective_to]. C'est deja
-- ce que fait `estEnVigueur()` dans l'ecran de 6D.
--
-- Idempotent : reexecutable sans dommage.
-- =====================================================================

create or replace function agenda.activer_plan_roulement(
  p_plan_id            uuid,
  p_effective_from     date,
  p_verifier_seulement boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = agenda, public
as $$
declare
  v_plan       agenda.rotation_plans;
  v_sortant    agenda.rotation_plans;
  v_conflit    text;
  v_regles     integer;
begin
  -- --- 1. Qui appelle ---------------------------------------------------
  if not agenda.est_coordinateur() then
    raise exception 'Activation d''un plan de roulement reservee aux coordinateurs';
  end if;

  select * into v_plan from agenda.rotation_plans where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'Plan introuvable';
  end if;
  if v_plan.status <> 'draft' then
    raise exception 'Seul un brouillon peut etre active (ce plan est « % »)', v_plan.status;
  end if;

  select count(*) into v_regles
    from agenda.rotation_plan_rules where plan_id = p_plan_id;
  if v_regles = 0 then
    raise exception 'Ce plan ne contient aucune affectation';
  end if;

  -- --- 2. La date d'entree en vigueur -----------------------------------
  -- Un lundi : sans quoi la semaine du basculement serait coupee en deux,
  -- avec un mardi en « S3 du V1 » et un mercredi en « S1 du V2 ». C'est
  -- calculable, mais illisible pour un cabinet qui lit son roulement a la
  -- semaine.
  if extract(dow from p_effective_from) <> 1 then
    raise exception
      'La date d''entree en vigueur (%) doit etre un lundi, sinon la semaine du '
      'basculement releverait de deux plans a la fois', p_effective_from;
  end if;

  -- Le passe ne se reecrit pas : les gardes en sont deja generees, et un
  -- plan retroactif ferait mentir la frise sans changer une seule garde.
  -- C'est le defaut n.1 de MOD-1 (aucune historisation) pris a l'envers.
  if p_effective_from <= current_date then
    raise exception
      'La date d''entree en vigueur (%) doit etre dans le futur : les gardes '
      'des semaines deja ouvertes sont generees et ne changeraient pas',
      p_effective_from;
  end if;

  -- L'ancrage S1 ne peut pas etre posterieur a l'entree en vigueur, sinon
  -- les premieres semaines tomberaient sur une semaine de rotation negative.
  if v_plan.start_date > p_effective_from then
    raise exception
      'L''ancrage du cycle (%) est posterieur a l''entree en vigueur (%)',
      v_plan.start_date, p_effective_from;
  end if;

  -- --- 3. Le plan sortant ------------------------------------------------
  -- Celui qui couvre encore la date de bascule. On le FERME, on ne
  -- l'archive pas (cf. l'encadre en tete de fichier).
  select * into v_sortant
    from agenda.rotation_plans
   where status = 'active'
     and effective_from <= p_effective_from
     and (effective_to is null or effective_to >= p_effective_from)
   order by effective_from desc
   limit 1;

  -- Un plan actif qui commencerait APRES la bascule ne se resout pas en
  -- fermant quoi que ce soit : il faudrait le deplacer ou le retirer.
  select name into v_conflit
    from agenda.rotation_plans
   where status = 'active'
     and id is distinct from coalesce(v_sortant.id, '00000000-0000-0000-0000-000000000000'::uuid)
     and effective_from > p_effective_from
   limit 1;

  if v_conflit is not null then
    raise exception
      'Le plan « % » est deja programme apres cette date : le retirer d''abord',
      v_conflit;
  end if;

  -- --- 4. Rapport sans ecriture ------------------------------------------
  if p_verifier_seulement then
    return jsonb_build_object(
      'ok', true,
      'plan', jsonb_build_object('id', v_plan.id, 'nom', v_plan.name,
                                 'regles', v_regles,
                                 'cycle_semaines', v_plan.cycle_length_weeks,
                                 'start_date', v_plan.start_date),
      'effective_from', p_effective_from,
      'sortant', case when v_sortant.id is null then null else
        jsonb_build_object('id', v_sortant.id, 'nom', v_sortant.name,
                           'effective_to', p_effective_from - 1) end);
  end if;

  -- --- 5. Ecriture --------------------------------------------------------
  -- Fermer le sortant D'ABORD : le trigger de non-chevauchement de 6B
  -- refuserait le nouveau plan tant que l'ancien reste ouvert.
  if v_sortant.id is not null then
    update agenda.rotation_plans
       set effective_to = p_effective_from - 1
     where id = v_sortant.id;
  end if;

  update agenda.rotation_plans
     set status         = 'active',
         effective_from = p_effective_from,
         effective_to   = null
   where id = p_plan_id;

  return jsonb_build_object(
    'ok', true,
    'plan_id', p_plan_id,
    'nom', v_plan.name,
    'effective_from', p_effective_from,
    'regles', v_regles,
    'sortant', case when v_sortant.id is null then null else
      jsonb_build_object('nom', v_sortant.name,
                         'effective_to', p_effective_from - 1) end);
end;
$$;

revoke all on function agenda.activer_plan_roulement(uuid, date, boolean) from public, anon;
grant execute on function agenda.activer_plan_roulement(uuid, date, boolean) to authenticated;

comment on function agenda.activer_plan_roulement(uuid, date, boolean) is
  'Active un plan en brouillon a une date choisie et ferme le plan sortant. '
  'Le sortant reste `active` : l''archiver le retirerait de la resolution des '
  'dates passees. p_verifier_seulement produit le rapport sans ecrire.';

-- ---------------------------------------------------------------------
-- Verifications
-- ---------------------------------------------------------------------
select 'ecriture directe toujours fermee' as controle, cmd, count(*) as policies
  from pg_policies
 where schemaname = 'agenda'
   and tablename in ('rotation_plans', 'rotation_plan_rules', 'rotation_import_mappings')
 group by cmd
 order by cmd;
