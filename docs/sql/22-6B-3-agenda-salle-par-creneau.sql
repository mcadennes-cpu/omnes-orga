-- =====================================================================
-- Etape 22 / 6B-3 (MOD-1) : la salle devient une propriete du creneau
--
-- POURQUOI. Le fichier de roulement ne mentionne AUCUNE salle : il dit
-- qui, quel jour, quel site, quel creneau. La salle etait ajoutee dans
-- l'application, et l'ancienne contrainte permettait qu'une meme case du
-- roulement en porte deux. Resultat, deux cases se sont retrouvees avec
-- Mireille YUAN en double :
--
--   . S6 jeudi J7 Dijon : Cabinet B3 (regle du 15/12/2025) ET Cabinet B6
--     (regle du 11/05/2026) -- un changement de salle, l'ancienne regle
--     n'ayant jamais ete supprimee.
--   . S1 mardi J8 Dijon : Cabinet B2 ET Cabinet B3, toutes deux du
--     29/07/2026.
--
-- A la generation, deux salles ouvertes le meme jour auraient produit
-- DEUX gardes assignees au meme medecin a la meme date -- ce que l'index
-- unique_doctor_per_day refuse. La creation aurait echoue sans
-- explication lisible.
--
-- Decision de Matthieu (01/08/2026) : sortir la salle du roulement. Un
-- creneau se tient toujours dans la meme salle, donc la salle est une
-- propriete du CRENEAU. Le plan colle alors exactement au fichier, et le
-- probleme de doublon disparait par construction.
--
-- ATTENTION -- la reciproque est fausse : une meme salle peut porter DEUX
-- creneaux si leurs horaires ne se recouvrent pas reellement. AUCUNE
-- contrainte d'unicite sur default_room_id.
--   . Dijon  : J6 (08:00-14:00) puis J2 (14:00-22:00) -- d'ou « pre J2 ».
--   . Beaune : J1 puis J2. Les horaires se chevauchent en apparence
--     (08:00-16:00 et 14:00-22:00) mais le medecin en J1 consulte au
--     cabinet de 08:00 a 13:00 puis part en VISITES A DOMICILE. Il n'y a
--     pas de visites a Dijon : c'est ce qui distingue les deux sites.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. La colonne
--
-- Nullable : un creneau nouvellement cree n'a pas encore de salle, et on
-- prefere une valeur absente a une valeur fausse. La generation de
-- gardes (6H) refusera un creneau sans salle plutot que d'en deviner une.
--
-- ON DELETE SET NULL : supprimer une salle ne doit pas supprimer le
-- creneau, seulement le laisser sans salle.
-- ---------------------------------------------------------------------
alter table agenda.shift_types
  add column default_room_id uuid references agenda.rooms(id) on delete set null;

comment on column agenda.shift_types.default_room_id is
  'Salle dans laquelle ce creneau se tient. Deux creneaux peuvent partager '
  'une salle si leurs horaires ne se recouvrent pas (J6 puis J2 a Dijon ; '
  'J1 puis J2 a Beaune, le J1 partant en visites a 13h). Aucune unicite.';

-- ---------------------------------------------------------------------
-- 2a. Les 15 creneaux historiques : la salle reellement utilisee
--
-- Deduite des gardes existantes (salle majoritaire), et non saisie a la
-- main : ce sont les donnees qui font foi sur ce qui se pratique.
-- ---------------------------------------------------------------------
with majoritaire as (
  select shift_type_id, room_id,
         row_number() over (partition by shift_type_id order by count(*) desc, room_id) rang
    from agenda.shifts
   group by shift_type_id, room_id
)
update agenda.shift_types st
   set default_room_id = m.room_id
  from majoritaire m
 where m.shift_type_id = st.id
   and m.rang = 1;

-- ---------------------------------------------------------------------
-- 2b. Les 4 creneaux de Beaune crees en 6A-2 : aucune garde, donc rien a
--     deduire. Repartition decidee avec Matthieu.
--
--   Salle 1 : J1 puis J2 (+ WE1)   <- existant, inchange
--   Salle 2 : J3 (+ WE2)           <- existant, inchange
--   Salle 3 : J4    (journee)
--   Salle 4 : J7    (journee)
--   Salle 5 : J8    (journee)
--   Salle 6 : J6    (creneau du matin : ne peut partager avec personne,
--                    le J1 occupe deja la Salle 1 le matin)
-- ---------------------------------------------------------------------
update agenda.shift_types st
   set default_room_id = ro.id
  from agenda.rooms ro
  join agenda.sites si on si.id = ro.site_id
 where si.name = 'Beaune'
   and st.default_room_id is null
   and ((st.name = 'J4 Beaune' and ro.name = 'Salle 3')
     or (st.name = 'J7 Beaune' and ro.name = 'Salle 4')
     or (st.name = 'J8 Beaune' and ro.name = 'Salle 5')
     or (st.name = 'J6 Beaune' and ro.name = 'Salle 6'));

-- ---------------------------------------------------------------------
-- 3. Dedoublonner avant de retirer la colonne
--
-- On conserve la regle dont la salle est celle du creneau, et on ecarte
-- l'autre -- le vestige. Verifie : cela garde bien Cabinet B6 pour J7 et
-- Cabinet B3 pour J8, les salles qui portent la quasi-totalite des
-- gardes (225 contre 1, et 108 contre 3).
-- ---------------------------------------------------------------------
delete from agenda.rotation_plan_rules r
 using agenda.shift_types st
 where st.id = r.shift_type_id
   and st.default_room_id is not null
   and r.room_id <> st.default_room_id
   and exists (
     select 1 from agenda.rotation_plan_rules autre
      where autre.plan_id       = r.plan_id
        and autre.doctor_id     = r.doctor_id
        and autre.site_id       = r.site_id
        and autre.shift_type_id = r.shift_type_id
        and autre.weekday       = r.weekday
        and autre.rotation_week = r.rotation_week
        and autre.room_id       = st.default_room_id);

-- ---------------------------------------------------------------------
-- 4. La salle sort du plan
--
-- DROP COLUMN emporte la contrainte d'unicite qui la referencait : on la
-- recree sans la salle. La cle devient exactement ce que dit le fichier
-- de roulement -- plan, site, creneau, jour, semaine, medecin.
-- ---------------------------------------------------------------------
alter table agenda.rotation_plan_rules drop column room_id;

alter table agenda.rotation_plan_rules
  add constraint rotation_plan_rules_unique
  unique (plan_id, site_id, shift_type_id, weekday, rotation_week, doctor_id);

-- ---------------------------------------------------------------------
-- Verifications
-- ---------------------------------------------------------------------
-- Chaque creneau doit avoir une salle. Attendu : 0 ligne.
select name as creneau_sans_salle
  from agenda.shift_types
 where default_room_id is null
 order by name;

-- Plus aucune case ne doit porter deux fois le meme medecin.
-- Attendu : 0 ligne.
select r.rotation_week, r.weekday, si.name as site, st.name as creneau,
       p.prenom || ' ' || p.nom as medecin, count(*) as occurrences
  from agenda.rotation_plan_rules r
  join agenda.sites si       on si.id = r.site_id
  join agenda.shift_types st on st.id = r.shift_type_id
  join public.profiles p     on p.id  = r.doctor_id
 group by 1, 2, 3, 4, 5
having count(*) > 1;

-- Etat final : salles par creneau et volume du plan.
select st.name as creneau, st.time_range, si.name as site, ro.name as salle,
       (select count(*) from agenda.rotation_plan_rules r where r.shift_type_id = st.id) as affectations
  from agenda.shift_types st
  left join agenda.rooms ro on ro.id = st.default_room_id
  left join agenda.sites si on si.id = ro.site_id
 order by si.name nulls last, ro.name, st.name;
