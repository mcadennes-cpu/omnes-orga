-- =====================================================================
-- 23-10 (etape 8F-1) : 6C-4 -- supprimer l'ancien roulement
--         agenda.rotation_settings et agenda.rotation_assignment_rules
--
-- A EXECUTER LE SOIR DE LA BASCULE, et seulement apres :
--   1. 22-8A-1-resynchronisation-differentielle.py --go
--   2. 23-6-comparer-roulement-bolt-plan-v1.py -> « IDENTIQUES »
-- Voir « Ordre des operations » (8A-1) et le plan arrete en 8E, dans
-- docs/integration-agenda.md.
--
-- POURQUOI CES DEUX TABLES PEUVENT DISPARAITRE
-- Depuis 6C (01/08/2026), le module calcule le roulement a partir des
-- plans versionnes (rotation_plans / rotation_plan_rules). Les deux
-- anciennes tables ne sont plus lues par aucun ecran : le dernier code
-- qui les interrogeait, getRotationSettings(), a ete retire en 8E-1.
-- 6C-4 avait ete reportee apres la bascule tant que la resynchronisation
-- 7F les recopiait ; 22-8A-1, qui la remplace, n'y touche pas.
--
-- POURQUOI AUCUNE SAUVEGARDE DES 282 REGLES
-- 23-6 compare le roulement vivant de Bolt au plan V1 et conclut
-- « IDENTIQUES » (mesure du 17/09/2026 : 280 regles dans Bolt, 266 dans
-- le plan, les 14 d'ecart etant les « J3 Dijon » du week-end ecartees
-- volontairement par 6B-2). L'information est donc deja dans le plan V1,
-- qui reste en base, et encore dans la base de Bolt. C'est pour cela que
-- 23-6 doit etre relance juste avant : sans son « IDENTIQUES » du soir,
-- ce script ne doit pas tourner.
--
-- CE QUE MESURE LE SCRIPT AVANT DE SUPPRIMER (mesure du 17/09/2026)
--   . rotation_settings : 1 ligne ; rotation_assignment_rules : 282.
--     La copie Orga est figee depuis l'import de 7D : un autre nombre
--     voudrait dire que quelque chose y a ecrit depuis, et il faudrait
--     comprendre quoi avant de detruire.
--   . aucune cle etrangere venue d'une AUTRE table, aucune vue, aucune
--     fonction des schemas agenda et public qui cite ces tables.
--   . plan V1 : 266 regles ; plan V2 : 264. Ce sont les tables qui
--     remplacent l'ancien roulement : on verifie qu'elles sont la avant,
--     et intactes apres.
--
-- POURQUOI PAS DE CASCADE
-- « drop table ... cascade » supprimerait EN SILENCE tout objet qui
-- dependrait encore de ces tables. Sans cascade, une dependance oubliee
-- fait echouer le drop, et la transaction entiere est annulee. Les
-- policies RLS (8) et les triggers updated_at (2) appartiennent aux
-- tables elles-memes : ils disparaissent avec elles, sans cascade.
--
-- Une seule transaction : si un controle ou un drop echoue, rien n'est
-- supprime. Rejouable : relance, il constate que les tables n'existent
-- plus et ne fait rien.
-- A executer sur le projet ydihrgnixthrraprclox.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Controles prealables -- le script s'arrete si l'un d'eux echoue
-- ---------------------------------------------------------------------
do $$
declare
  n integer;
begin
  -- Deja execute : rien a faire, et surtout pas d'erreur.
  if to_regclass('agenda.rotation_settings') is null
     and to_regclass('agenda.rotation_assignment_rules') is null then
    raise notice '23-10 deja execute : les deux tables n''existent plus.';
    return;
  end if;

  -- Moitie executee : situation anormale, a examiner a la main.
  if to_regclass('agenda.rotation_settings') is null
     or to_regclass('agenda.rotation_assignment_rules') is null then
    raise exception 'ARRET : une seule des deux tables existe encore.';
  end if;

  -- La copie Orga doit etre celle de l'import, inchangee.
  select count(*) into n from agenda.rotation_settings;
  if n <> 1 then
    raise exception 'ARRET : rotation_settings contient % ligne(s), 1 attendue.', n;
  end if;

  select count(*) into n from agenda.rotation_assignment_rules;
  if n <> 282 then
    raise exception 'ARRET : rotation_assignment_rules contient % regle(s), 282 attendues.', n;
  end if;

  -- Aucune cle etrangere venue d'une autre table.
  select count(*) into n
    from pg_constraint
   where contype = 'f'
     and confrelid in ('agenda.rotation_settings'::regclass,
                       'agenda.rotation_assignment_rules'::regclass)
     and conrelid not in ('agenda.rotation_settings'::regclass,
                          'agenda.rotation_assignment_rules'::regclass);
  if n > 0 then
    raise exception 'ARRET : % cle(s) etrangere(s) pointent vers ces tables.', n;
  end if;

  -- Aucune vue qui les lit.
  select count(*) into n
    from pg_depend d
    join pg_rewrite r on r.oid = d.objid
   where d.refobjid in ('agenda.rotation_settings'::regclass,
                        'agenda.rotation_assignment_rules'::regclass)
     and r.ev_class not in ('agenda.rotation_settings'::regclass,
                            'agenda.rotation_assignment_rules'::regclass);
  if n > 0 then
    raise exception 'ARRET : % vue(s) dependent de ces tables.', n;
  end if;

  -- Aucune fonction qui les cite (le corps d'une fonction n'est pas
  -- une dependance que Postgres connait : un drop ne la ferait pas
  -- echouer, elle casserait plus tard, a l'appel).
  select count(*) into n
    from pg_proc p
    join pg_namespace s on s.oid = p.pronamespace
   where s.nspname in ('agenda', 'public')
     and (p.prosrc ilike '%rotation_settings%'
       or p.prosrc ilike '%rotation_assignment_rules%');
  if n > 0 then
    raise exception 'ARRET : % fonction(s) citent ces tables.', n;
  end if;

  -- Le remplacant est en place.
  select count(*) into n
    from agenda.rotation_plan_rules r
    join agenda.rotation_plans p on p.id = r.plan_id
   where p.status = 'active' and p.effective_from = date '2025-12-29';
  if n <> 266 then
    raise exception 'ARRET : le plan V1 porte % regle(s), 266 attendues.', n;
  end if;

  select count(*) into n
    from agenda.rotation_plan_rules r
    join agenda.rotation_plans p on p.id = r.plan_id
   where p.status = 'active' and p.effective_from = date '2027-01-04';
  if n <> 264 then
    raise exception 'ARRET : le plan V2 porte % regle(s), 264 attendues.', n;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Suppression -- sans cascade (voir en-tete)
-- ---------------------------------------------------------------------
drop table if exists agenda.rotation_assignment_rules;
drop table if exists agenda.rotation_settings;

-- PostgREST oublie les deux tables tout de suite plutot qu'au prochain
-- rechargement de son cache.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 3. Verification
--
-- Attendu : ancienne_table_settings = null ; ancienne_table_regles =
-- null ; policies_restantes = 0 ; regles_plan_v1 = 266 ;
-- regles_plan_v2 = 264.
-- ---------------------------------------------------------------------
select to_regclass('agenda.rotation_settings')::text          as ancienne_table_settings,
       to_regclass('agenda.rotation_assignment_rules')::text  as ancienne_table_regles,
       (select count(*) from pg_policies
         where schemaname = 'agenda'
           and tablename in ('rotation_settings',
                             'rotation_assignment_rules'))    as policies_restantes,
       (select count(*) from agenda.rotation_plan_rules r
          join agenda.rotation_plans p on p.id = r.plan_id
         where p.status = 'active' and p.effective_from = date '2025-12-29')           as regles_plan_v1,
       (select count(*) from agenda.rotation_plan_rules r
          join agenda.rotation_plans p on p.id = r.plan_id
         where p.status = 'active' and p.effective_from = date '2027-01-04')           as regles_plan_v2;

commit;
