-- =====================================================================
-- Correction 23-3 : designer les medecins de l'agenda
--
-- LE DEFAUT
-- La vue agenda.profiles calcule son role ainsi :
--     case when is_agenda_coordinator then 'coordinator' else 'doctor' end
-- Un role UNIQUE, donc exclusif. Trois ecrans s'en servent pour lister
-- « les medecins » (AssignDoctorModal, et le filtre par medecin de
-- RequestsCalendarView / EnhancedCalendarView) via .eq('role','doctor').
--
-- Consequence : etre coordinateur EXCLUT mecaniquement d'etre medecin.
-- Or Matthieu est l'un des 9 associes du roulement (initiales MC) --
-- 156 gardes attribuees et 55 regles de roulement a son nom -- et le
-- coordinateur ne peut pas lui en attribuer une a la main. Releve par
-- lui-meme le 26/08/2026.
--
-- Symetriquement, la liste laisse passer « Poste Bureau », compte de
-- bureau partage qui n'a jamais tenu de garde.
--
-- POURQUOI UNE COLONNE ET NON UNE DEDUCTION
-- Le role Orga ne peut pas servir de rattrapage : Matthieu et Charlotte
-- sont tous deux super_admin, et un seul exerce. C'est exactement le
-- raisonnement qui avait fait creer is_agenda_coordinator en 7A pour
-- decoupler « coordinateur d'agenda » du role applicatif. Le decouplage
-- n'avait ete fait que dans un sens ; ce script fait l'autre.
--
-- CE QUI NE CHANGE PAS
-- La colonne « role » de la vue est laissee telle quelle : elle porte
-- les PERMISSIONS (quels ecrans, quels droits) et toutes les policies
-- RLS ainsi que est_coordinateur() s'appuient dessus. On AJOUTE une
-- colonne, on n'en modifie aucune.
--
-- A executer une seule fois sur le projet ydihrgnixthrraprclox.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. La colonne
--
-- Sur public.profiles, comme is_agenda_coordinator. Additif : aucune
-- colonne existante n'est touchee, l'appli principale n'en sait rien.
--
-- default false et non true : un compte cree plus tard (secretariat,
-- poste partage) ne doit pas devenir medecin par inadvertance. La
-- designation est un geste explicite -- c'est tout l'objet du script.
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_agenda_doctor boolean not null default false;

comment on column public.profiles.is_agenda_doctor is
  'Vrai si ce profil peut tenir une garde : il apparait alors dans les listes de medecins de l''agenda (attribution, filtres). Independant de is_agenda_coordinator -- Matthieu est les deux. Ne donne aucun droit : les permissions viennent de agenda.profiles.role.';

-- ---------------------------------------------------------------------
-- 2. La designation
--
-- Regle : tout le monde sauf le poste de bureau et Charlotte.
--
--   . les 3 associes gerants, 6 associes et 26 remplacants tiennent des
--     gardes -- ce sont les medecins du cabinet ;
--   . Matthieu (super_admin ET coordinateur) exerce : 156 gardes ;
--   . Charlotte (super_admin, coordinatrice) coordonne sans exercer :
--     0 garde, 0 regle de roulement -- mesure, pas suppose ;
--   . « Poste Bureau » (role poste_bureau) est un compte partage.
--
-- On designe par le ROLE et non par des identifiants en dur, sauf pour
-- les deux super_admin qu'il faut distinguer l'un de l'autre -- et la,
-- on tranche sur un FAIT verifiable (tenir des gardes ou des regles de
-- roulement) plutot que sur un nom ecrit en dur, qui vieillirait mal.
-- ---------------------------------------------------------------------
update public.profiles
   set is_agenda_doctor = true
 where role in ('associe', 'associe_gerant', 'remplacant');

update public.profiles p
   set is_agenda_doctor = true
 where p.role = 'super_admin'
   and (exists (select 1 from agenda.shifts s where s.assigned_doctor_id = p.id)
     or exists (select 1 from agenda.rotation_plan_rules r where r.doctor_id = p.id));

-- ---------------------------------------------------------------------
-- 3. La vue expose la colonne
--
-- create or replace : la signature ne perd ni ne reordonne aucune
-- colonne, on ajoute a la fin. CONSERVE LES DROITS -- contrairement au
-- drop + create qu'avait impose MOD2-D, et qui avait failli rendre la
-- fonction inappelable sans autre symptome qu'un 404.
--
-- security_invoker = true est repose explicitement : la vue doit
-- continuer de se soumettre a la RLS de public.profiles. L'oublier
-- transformerait la vue en fuite de donnees.
-- ---------------------------------------------------------------------
create or replace view agenda.profiles
with (security_invoker = true) as
  select id,
         email,
         trim(both from (coalesce(prenom, ''::text) || ' '::text) || coalesce(nom, ''::text)) as full_name,
         case
           when is_agenda_coordinator then 'coordinator'::text
           else 'doctor'::text
         end as role,
         actif as is_active,
         prenom,
         nom,
         photo_url,
         updated_at,
         -- Nouveau (23-3). « Qui peut tenir une garde », a ne pas
         -- confondre avec « role », qui porte les permissions.
         is_agenda_doctor
    from profiles;

-- =====================================================================
-- Controles
--
-- 1. Qui est medecin, qui ne l'est pas :
--
--   select trim(coalesce(prenom,'')||' '||coalesce(nom,'')) as nom,
--          role, is_agenda_coordinator, is_agenda_doctor
--     from public.profiles
--    where not is_agenda_doctor or role = 'super_admin'
--    order by role, nom;
--   -- attendu medecin : Matthieu CADENNES (super_admin, coordinateur)
--   -- attendu NON medecin : Charlotte FRANZINO, Poste Bureau
--
-- 2. Le compte total :
--
--   select count(*) filter (where is_agenda_doctor) as medecins,
--          count(*) filter (where not is_agenda_doctor) as autres
--     from public.profiles;
--   -- attendu : 36 medecins, 2 autres
--
-- 3. Aucun medecin oublie -- personne qui tient une garde ou une regle
--    de roulement ne doit etre hors liste :
--
--   select count(*) from public.profiles p
--    where not p.is_agenda_doctor
--      and (exists (select 1 from agenda.shifts s
--                    where s.assigned_doctor_id = p.id)
--        or exists (select 1 from agenda.rotation_plan_rules r
--                    where r.doctor_id = p.id));
--   -- attendu : 0
--
-- 4. La vue n'a rien perdu :
--
--   select count(*) from agenda.profiles;      -- attendu : 38
--   select reloptions from pg_class
--    where oid = 'agenda.profiles'::regclass;  -- security_invoker=true
-- =====================================================================
