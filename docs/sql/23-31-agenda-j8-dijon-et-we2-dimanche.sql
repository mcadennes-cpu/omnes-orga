-- =====================================================================
-- Etape 22 / module Agenda
-- 23-31 : sur la periode ouverte (04/01 -> 04/04/2027)
--   A. ouvrir les J8 Dijon (Cabinet B3) manquants, le mardi et le jeudi
--   B. retirer les WE2 du dimanche (Beaune et Dijon) restes libres
--
-- Demande de Matthieu (21/10/2026), apres l'ouverture de ce matin.
--
-- A. Le J8 Dijon n'etait pas dans la semaine type : seules 3 gardes
--    existaient le mardi/jeudi, posees par le roulement (26/01, 23/02,
--    23/03, affectees). On cree les 23 manquantes en garde libre, sur le
--    modele exact de ces gardes (Cabinet B3, horaire 08:00-18:30).
--    ⚠ shifts.shift_type porte l'HORAIRE, pas le nom du creneau : l'index
--    unique_shift (date, site, salle, horaire) refuse donc un J8 dans une
--    salle deja prise par un J3/J4/J7. Verifie : B3 est libre ces jours-la.
--    Pas de push : le script tourne hors de l'appli (notifications.ts).
--
-- B. Suppression DOUCE (deleted_at), comme le bouton « Supprimer » :
--    seulement les WE2 du dimanche au statut free ET sans aucune demande.
--    Les affectes et celui qui a une demande en attente restent.
--
-- Prealable : sauvegarde 23-16. Idempotent : A ne cree que les jours sans
-- J8 vivant ; B ne touche que deleted_at is null.
-- =====================================================================

-- 0. Etat avant
select count(*) as j8_dijon_mardi_jeudi
  from agenda.shifts
 where shift_type_id = '8ea9bad8-5cad-4f1a-9ec3-8621f835374b'
   and date between '2027-01-04' and '2027-04-04'
   and extract(dow from date) in (2, 4)
   and deleted_at is null;                                  -- 3 attendues

select st.name, s.status, count(*)
  from agenda.shifts s
  join agenda.shift_types st on st.id = s.shift_type_id
 where s.date between '2027-01-04' and '2027-04-04'
   and extract(dow from s.date) = 0
   and st.name ilike 'WE2%'
   and s.deleted_at is null
 group by 1, 2 order by 1, 2;

-- A. Creation des J8 Dijon manquants (23 attendus)
insert into agenda.shifts
  (date, location, room, shift_type, status,
   site_id, room_id, shift_type_id, created_by)
select d::date, 'Dijon', 'Cabinet B3', '08:00-18:30', 'free',
       'a6e2400a-999d-4c62-a1ec-48d1a4a7efcd',   -- Dijon
       '513b6144-85d9-4ba6-bea8-1618f14c498f',   -- Cabinet B3
       '8ea9bad8-5cad-4f1a-9ec3-8621f835374b',   -- J8 Dijon
       'b43659df-fcd8-4d32-a915-efa2e580fbbd'    -- Matthieu
  from generate_series('2027-01-04'::date, '2027-04-04'::date, '1 day') d
 where extract(dow from d) in (2, 4)
   and not exists (
     select 1 from agenda.shifts s
      where s.date = d::date
        and s.shift_type_id = '8ea9bad8-5cad-4f1a-9ec3-8621f835374b'
        and s.deleted_at is null);

-- B. Retrait des WE2 du dimanche libres et sans demande (19 attendus)
update agenda.shifts s
   set deleted_at = now(), updated_at = now()
  from agenda.shift_types st
 where st.id = s.shift_type_id
   and st.name ilike 'WE2%'
   and s.date between '2027-01-04' and '2027-04-04'
   and extract(dow from s.date) = 0
   and s.status = 'free'
   and s.deleted_at is null
   and not exists (select 1 from agenda.requests r where r.shift_id = s.id);

-- 3. Etat apres : 26 J8 Dijon mardi/jeudi ; WE2 dimanche = affectes + 1 en attente
select count(*) as j8_dijon_mardi_jeudi
  from agenda.shifts
 where shift_type_id = '8ea9bad8-5cad-4f1a-9ec3-8621f835374b'
   and date between '2027-01-04' and '2027-04-04'
   and extract(dow from date) in (2, 4)
   and deleted_at is null;

select st.name, s.status, count(*)
  from agenda.shifts s
  join agenda.shift_types st on st.id = s.shift_type_id
 where s.date between '2027-01-04' and '2027-04-04'
   and extract(dow from s.date) = 0
   and st.name ilike 'WE2%'
   and s.deleted_at is null
 group by 1, 2 order by 1, 2;
