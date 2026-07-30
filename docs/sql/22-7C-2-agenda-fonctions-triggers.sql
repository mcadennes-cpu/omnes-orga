-- =====================================================================
-- Etape 22 / 7C-2 : fonctions et triggers du schema "agenda"
--
-- Suite de 22-7C-1 (tables). Ne cree PAS les policies RLS (7C-3).
--
-- Principe : ISO-COMPORTEMENT. update_shift_status est recopiee a
-- l'identique, y compris ses particularites connues, pour que toute
-- difference constatee apres la bascule soit un vrai probleme et non un
-- changement voulu. Les corrections identifiees vont dans MOD-2.
--
-- Deux ecarts assumes, sans effet observable :
--   * les 3 fonctions updated_at d'origine (update_updated_at_column,
--     update_fixed_duty_patterns_updated_at, update_fixed_duty_series_
--     updated_at) sont STRICTEMENT identiques : une seule est reprise.
--   * 3 triggers updated_at ajoutes la ou la colonne existait sans etre
--     maintenue (rotation_assignment_rules, rotation_settings,
--     week_templates). C'est ce type d'horodatage qui avait permis de
--     reconstituer l'incident du 29/07.
--
-- Non reprise : create_profile_for_user (gestion des comptes, du ressort
-- de l'appli principale depuis l'etape 3A).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Horodatage
-- ---------------------------------------------------------------------

create or replace function agenda.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path to 'agenda'
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

-- ---------------------------------------------------------------------
-- 2. Circuit demande -> validation
--
-- Coeur metier du module. Recopie a l'identique depuis Planning, seul le
-- search_path change ('public' -> 'agenda') : la fonction reference
-- shifts et requests sans qualifier leur schema.
--
-- SECURITY DEFINER est indispensable : un medecin qui cree une demande
-- n'a pas le droit d'ecrire dans shifts. C'est la fonction, executee
-- avec les droits de son proprietaire, qui fait basculer la garde.
--
-- Particularite connue et VOLONTAIREMENT conservee : la fonction ne
-- reagit qu'aux ecritures sur "requests". Un UPDATE de masse fait
-- directement sur "shifts" ne declenche rien -- c'est ce qui avait rendu
-- 42 gardes invisibles au coordinateur lors de l'incident du 29/07.
-- ---------------------------------------------------------------------

create or replace function agenda.update_shift_status()
returns trigger
language plpgsql
security definer
set search_path to 'agenda'
as $function$
begin
  -- Nouvelle demande : la garde passe en attente.
  if (TG_OP = 'INSERT' and new.status = 'pending') then
    update shifts
       set status = 'pending', updated_at = now()
     where id = new.shift_id;

  -- Pre-validation (brouillon du coordinateur) : le medecin est place sur
  -- la garde mais celle-ci reste "en attente" -- il n'est pas prevenu.
  elsif (TG_OP = 'UPDATE' and new.status = 'on_hold' and old.status = 'pending') then
    update shifts
       set status = 'pending',
           assigned_doctor_id = new.doctor_id,
           updated_at = now()
     where id = new.shift_id;

  -- Validation definitive : la garde est attribuee et les demandes
  -- concurrentes sont refusees automatiquement.
  elsif (TG_OP = 'UPDATE' and new.status = 'approved'
         and old.status in ('pending', 'on_hold')) then
    update shifts
       set status = 'assigned',
           assigned_doctor_id = new.doctor_id,
           updated_at = now()
     where id = new.shift_id;

    update requests
       set status = 'rejected',
           reviewed_at = now(),
           reviewed_by = new.reviewed_by,
           rejection_note = 'Another doctor was assigned to this shift'
     where shift_id = new.shift_id
       and id != new.id
       and status in ('pending', 'on_hold');

  -- Retrait d'une pre-validation.
  -- NOTE : contrairement aux deux branches suivantes, la liberation n'est
  -- PAS conditionnee a "status = 'pending'". Sans effet dans le flux reel
  -- (pendant la phase de brouillon la garde est toujours en attente),
  -- mais atteignable si une attribution directe croise une
  -- pre-validation. Conserve tel quel, a traiter dans MOD-2.
  elsif (TG_OP = 'UPDATE' and new.status = 'pending' and old.status = 'on_hold') then
    if not exists (
      select 1 from requests
       where shift_id = new.shift_id
         and status in ('pending', 'on_hold')
         and id != new.id
    ) then
      update shifts
         set status = 'free',
             assigned_doctor_id = null,
             updated_at = now()
       where id = new.shift_id;
    else
      update shifts
         set assigned_doctor_id = null,
             updated_at = now()
       where id = new.shift_id;
    end if;

  -- Refus ou annulation : la garde n'est liberee que si elle etait encore
  -- en attente, et seulement s'il ne reste aucune autre demande active.
  elsif (TG_OP = 'UPDATE' and new.status in ('rejected', 'cancelled')
         and old.status in ('pending', 'on_hold')) then
    if not exists (
      select 1 from requests
       where shift_id = new.shift_id
         and status in ('pending', 'on_hold')
         and id != new.id
    ) then
      update shifts
         set status = 'free',
             assigned_doctor_id = null,
             updated_at = now()
       where id = new.shift_id
         and status = 'pending';
    end if;

  -- Suppression d'une demande active : meme regle que le refus.
  elsif (TG_OP = 'DELETE' and old.status in ('pending', 'on_hold')) then
    if not exists (
      select 1 from requests
       where shift_id = old.shift_id
         and status in ('pending', 'on_hold')
    ) then
      update shifts
         set status = 'free',
             assigned_doctor_id = null,
             updated_at = now()
       where id = old.shift_id
         and status = 'pending';
    end if;
  end if;

  if TG_OP = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$function$;

-- ---------------------------------------------------------------------
-- 3. Triggers (10 : les 7 d'origine hors profiles/events, + 3 ajouts)
-- ---------------------------------------------------------------------

create trigger update_sites_updated_at
  before update on agenda.sites
  for each row execute function agenda.set_updated_at();

create trigger update_shift_types_updated_at
  before update on agenda.shift_types
  for each row execute function agenda.set_updated_at();

create trigger update_rooms_updated_at
  before update on agenda.rooms
  for each row execute function agenda.set_updated_at();

create trigger update_shifts_updated_at
  before update on agenda.shifts
  for each row execute function agenda.set_updated_at();

create trigger set_fixed_duty_series_updated_at
  before update on agenda.fixed_duty_series
  for each row execute function agenda.set_updated_at();

create trigger set_fixed_duty_patterns_updated_at
  before update on agenda.fixed_duty_patterns
  for each row execute function agenda.set_updated_at();

-- Les 3 ajouts : colonne updated_at presente mais jamais maintenue.
create trigger update_rotation_settings_updated_at
  before update on agenda.rotation_settings
  for each row execute function agenda.set_updated_at();

create trigger update_rotation_assignment_rules_updated_at
  before update on agenda.rotation_assignment_rules
  for each row execute function agenda.set_updated_at();

create trigger update_week_templates_updated_at
  before update on agenda.week_templates
  for each row execute function agenda.set_updated_at();

-- Le circuit metier.
create trigger trigger_update_shift_status
  after insert or delete or update on agenda.requests
  for each row execute function agenda.update_shift_status();

-- ---------------------------------------------------------------------
-- 4. Controles
-- ---------------------------------------------------------------------

select
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'agenda')                                    as fonctions,
  (select count(*) from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'agenda' and not t.tgisinternal)             as triggers,
  (select count(*) from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'agenda' and not t.tgisinternal
      and t.tgname = 'trigger_update_shift_status')                as trigger_metier,
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'agenda' and p.prosecdef)                    as fonctions_security_definer;
