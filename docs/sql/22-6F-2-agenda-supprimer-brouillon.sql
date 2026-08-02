-- =====================================================================
-- Etape 22 / MOD-1 / sous-etape 6F-2
-- Supprimer un plan de roulement en brouillon
--
-- DEMANDE DE MATTHIEU (02/08/2026), apres qu'un import repete a laisse
-- deux brouillons identiques dans la liste des plans.
--
-- ⚠ AUX BROUILLONS SEULEMENT. Supprimer un plan `active` effacerait la
-- reponse a « quel roulement s'appliquait en mars ? » -- exactement
-- l'historique que 6F a pris soin de preserver en NE l'archivant pas.
-- Un plan qui a servi ne se supprime pas : il se ferme.
--
-- Troisieme et derniere porte d'ecriture des plans, apres l'import
-- (6E-2) et l'activation (6F-1). Les policies RLS n'en accordent
-- toujours aucune en direct.
--
-- Idempotent : reexecutable sans dommage.
-- =====================================================================

create or replace function agenda.supprimer_plan_roulement(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = agenda, public
as $$
declare
  v_plan   agenda.rotation_plans;
  v_regles integer;
begin
  if not agenda.est_coordinateur() then
    raise exception 'Suppression d''un plan de roulement reservee aux coordinateurs';
  end if;

  select * into v_plan from agenda.rotation_plans where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'Plan introuvable';
  end if;

  if v_plan.status <> 'draft' then
    raise exception
      'Seul un brouillon peut etre supprime. « % » est « % » : un plan qui a servi '
      'reste consultable, sans quoi les plannings passes deviendraient inexplicables',
      v_plan.name, v_plan.status;
  end if;

  select count(*) into v_regles
    from agenda.rotation_plan_rules where plan_id = p_plan_id;

  -- Les regles partent en cascade (contrainte posee en 6B).
  delete from agenda.rotation_plans where id = p_plan_id;

  return jsonb_build_object('ok', true, 'nom', v_plan.name, 'regles', v_regles);
end;
$$;

revoke all on function agenda.supprimer_plan_roulement(uuid) from public, anon;
grant execute on function agenda.supprimer_plan_roulement(uuid) to authenticated;

comment on function agenda.supprimer_plan_roulement(uuid) is
  'Supprime un plan de roulement en BROUILLON et ses regles. Refuse tout plan '
  'actif ou archive : un plan qui a servi doit rester consultable.';

-- ---------------------------------------------------------------------
-- Verifications
-- ---------------------------------------------------------------------
select 'ecriture directe toujours fermee' as controle, cmd, count(*) as policies
  from pg_policies
 where schemaname = 'agenda'
   and tablename in ('rotation_plans', 'rotation_plan_rules')
 group by cmd
 order by cmd;
