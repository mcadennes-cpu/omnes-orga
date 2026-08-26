-- =====================================================================
-- Etape 22 / MOD2-F-4 : le journal couvre les tables de parametrage
--
-- POURQUOI CE SCRIPT EXISTE
-- MOD2-A avait ecarte sites, rooms et shift_types, en le motivant :
-- « Elles bougent une fois par an et leurs modifications ne se
-- confondent jamais avec une action de planning. A ajouter si le besoin
-- apparait -- c'est une ligne par declencheur. » (22-MOD2A-1, section 3)
--
-- Le besoin est apparu le 24/08/2026 : Matthieu a supprime le creneau
-- « J6 Beaune » en validant l'ecran refait par MOD2-F-2. La suppression
-- n'a laisse AUCUNE trace -- ni dans le journal, ni ailleurs. Il a fallu
-- reconstruire la ligne depuis le script qui l'avait creee onze mois
-- plus tot (23-2-agenda-restaure-j6-beaune.sql), et deviner l'un de ses
-- champs.
--
-- Le raisonnement de MOD2-A n'etait pas faux, il etait incomplet : ces
-- tables bougent rarement, mais c'est precisement ce qui rend leurs
-- modifications difficiles a reconstituer. Une garde supprimee se
-- retrouve dans le journal ; un creneau supprime ne se retrouvait nulle
-- part.
--
-- CE QUE CE SCRIPT NE FAIT PAS
-- Il n'ouvre pas la restauration en un clic. agenda.restaurer_action
-- refuse tout ce qui n'est ni garde ni demande, et
-- agenda.actions_restaurables renvoie deja « false » avec un motif pour
-- ces entrees -- le bouton « Restaurer » du Journal ne s'affichera donc
-- pas, sans qu'on ait a toucher a l'ecran. C'est volontaire : restaurer
-- un site ou un creneau demande de decider du sort de ce qui en
-- dependait, et cela ne se tranche pas depuis un bouton.
--
-- Ce script apporte la TRACE : qui, quand, quoi, et l'etat d'avant --
-- de quoi reconstruire sans deviner.
--
-- A executer une seule fois sur le projet ydihrgnixthrraprclox.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. La projection compacte apprend trois tables de plus
--
-- journal_extrait() reduit les lignes completes aux quelques champs que
-- l'ecran sait lire. Sans ces branches, les nouvelles entrees
-- remonteraient avec un objet vide et le Journal afficherait « a
-- modifie 1 ligne » -- une trace, mais muette.
--
-- create or replace suffit ici : la signature et le type de retour ne
-- changent pas. C'est la difference avec le piege rencontre en MOD2-D,
-- ou l'ajout de deux colonnes au type de retour avait impose un drop --
-- et emporte les droits au passage.
--
-- Les cles de sortie sont en francais : elles sont lues par l'ecran,
-- pas par la base.
-- ---------------------------------------------------------------------

create or replace function agenda.journal_extrait(p_table text, p_lignes jsonb)
returns jsonb
language sql
immutable
as $function$
  select case
    when p_lignes is null then null
    else coalesce((
      select jsonb_object_agg(x ->> 'id', case p_table
        when 'shifts' then jsonb_build_object(
          'jour',      x ->> 'date',
          'statut',    x ->> 'status',
          'medecin',   x ->> 'assigned_doctor_id',
          'site',      x ->> 'location',
          'creneau',   x ->> 'shift_type',
          'supprimee', (x ->> 'deleted_at') is not null)
        when 'requests' then jsonb_build_object(
          'garde',   x ->> 'shift_id',
          'medecin', x ->> 'doctor_id',
          'statut',  x ->> 'status')
        when 'fixed_duty_series' then jsonb_build_object(
          'nom',       x ->> 'name',
          'supprimee', (x ->> 'deleted_at') is not null)
        when 'rotation_plans' then jsonb_build_object(
          'nom',    x ->> 'name',
          'statut', x ->> 'status')
        -- Nouveau (MOD2-F-4). Les trois tables de parametrage partagent
        -- « nom » et « actif », ce qui permet a l'ecran de les lire avec
        -- une seule fonction ; le reste est propre a chacune.
        when 'sites' then jsonb_build_object(
          'nom',     x ->> 'name',
          'couleur', x ->> 'color',
          'actif',   (x ->> 'is_active')::boolean)
        when 'rooms' then jsonb_build_object(
          'nom',   x ->> 'name',
          'site',  x ->> 'site_id',
          'actif', (x ->> 'is_active')::boolean)
        when 'shift_types' then jsonb_build_object(
          'nom',     x ->> 'name',
          'horaire', x ->> 'time_range',
          'ordre',   (x ->> 'sort_order')::integer,
          'actif',   (x ->> 'is_active')::boolean)
        else '{}'::jsonb
      end)
      from jsonb_array_elements(p_lignes) x
    ), '{}'::jsonb)
  end;
$function$;

-- ---------------------------------------------------------------------
-- 2. Les neuf declencheurs
--
-- Trois tables x trois operations, sur le modele exact de MOD2-A : par
-- INSTRUCTION, avec les tables de transition nommees new_rows/old_rows,
-- ce qui permet a l'unique fonction agenda.journaliser() de les servir
-- toutes sans y toucher.
--
-- Les trois tables ont bien une colonne « id » de type uuid, seule
-- exigence de journaliser() (verifie avant d'ecrire ce script, pas
-- suppose).
--
-- Pas de suppression douce ici, contrairement aux gardes et aux series :
-- une suppression sur ces tables est un vrai DELETE, et l'entree de
-- journal en conserve l'etat d'avant. C'est ce qui manquait pour
-- J6 Beaune.
-- ---------------------------------------------------------------------

create trigger journaliser_sites_insert
  after insert on agenda.sites
  referencing new table as new_rows
  for each statement execute function agenda.journaliser();

create trigger journaliser_sites_update
  after update on agenda.sites
  referencing old table as old_rows new table as new_rows
  for each statement execute function agenda.journaliser();

create trigger journaliser_sites_delete
  after delete on agenda.sites
  referencing old table as old_rows
  for each statement execute function agenda.journaliser();

create trigger journaliser_rooms_insert
  after insert on agenda.rooms
  referencing new table as new_rows
  for each statement execute function agenda.journaliser();

create trigger journaliser_rooms_update
  after update on agenda.rooms
  referencing old table as old_rows new table as new_rows
  for each statement execute function agenda.journaliser();

create trigger journaliser_rooms_delete
  after delete on agenda.rooms
  referencing old table as old_rows
  for each statement execute function agenda.journaliser();

create trigger journaliser_shift_types_insert
  after insert on agenda.shift_types
  referencing new table as new_rows
  for each statement execute function agenda.journaliser();

create trigger journaliser_shift_types_update
  after update on agenda.shift_types
  referencing old table as old_rows new table as new_rows
  for each statement execute function agenda.journaliser();

create trigger journaliser_shift_types_delete
  after delete on agenda.shift_types
  referencing old table as old_rows
  for each statement execute function agenda.journaliser();

-- =====================================================================
-- Controles
--
-- 1. Les 21 declencheurs de journalisation (12 de MOD2-A + 9 ici) :
--
--   select c.relname as tab, count(*) as nb
--     from pg_trigger t
--     join pg_class c on c.oid = t.tgrelid
--     join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'agenda' and t.tgname like 'journaliser_%'
--    group by c.relname order by c.relname;
--   -- attendu : fixed_duty_series 3, requests 3, rooms 3, rotation_plans 3,
--   --           shift_types 3, shifts 3, sites 3  (7 tables x 3 = 21)
--
-- 2. La projection rend bien les nouveaux champs :
--
--   select agenda.journal_extrait('shift_types',
--            jsonb_build_array(jsonb_build_object(
--              'id', gen_random_uuid()::text, 'name', 'Test',
--              'time_range', '08:00-14:00', 'sort_order', 99,
--              'is_active', true)));
--   -- attendu : {"<id>": {"nom":"Test","actif":true,"ordre":99,
--   --                     "horaire":"08:00-14:00"}}
--
-- 3. La restauration continue de refuser (aucun changement attendu) :
--
--   select * from agenda.actions_restaurables(array[<txid d'un site>]);
--   -- attendu : restaurable = false, motif renseigne
-- =====================================================================
