-- =====================================================================
-- Etape 22 / 6A-2 (MOD-1) : creneaux manquants a Beaune
--
-- POURQUOI. Le roulement V2 place 6 affectations sur un creneau "J4
-- Beaune" qui n'existe pas en base (IEG en S1 jeudi, S2 vendredi, S3
-- mercredi, S3 vendredi ; MY en S4 mardi et S6 mardi). Son import
-- echouerait donc. Plus largement, Beaune n'a que 3 creneaux en semaine
-- (J1, J2, J3) alors que le site dispose de 6 salles depuis le
-- demenagement de juillet 2026 -- les salles 3 a 6 existent en base
-- depuis le 17/11/2025 mais n'ont jamais porte une seule garde, faute de
-- creneau pour les occuper.
--
-- Choix de Matthieu (01/08/2026) : creer les 3 journees manquantes et un
-- creneau de renfort, meme si tous ne serviront pas tout de suite. Beaune
-- atteint 7 creneaux en semaine et peut occuper ses 6 salles.
--
-- SANS EFFET IMMEDIAT. Creer un shift_type n'ouvre aucune garde : il
-- devient simplement proposable a la creation. Rien ne change pour les
-- medecins tant que personne n'ouvre de garde sur ces creneaux.
--
-- NOMMAGE. shift_types.name est unique GLOBALEMENT, pas par site : le
-- site fait donc partie du nom, comme pour les 15 creneaux existants.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Etat avant, pour la trace
-- ---------------------------------------------------------------------
select 'AVANT' as moment, '[' || st.name || ']' as nom, st.time_range, st.is_active, st.sort_order
  from agenda.shift_types st
 order by st.sort_order;

-- ---------------------------------------------------------------------
-- 1. Les 4 creneaux Beaune
--
-- Horaires alignes sur leurs equivalents Dijon et sur desiderata.yaml :
-- J4/J7/J8 = journee 08:00-18:30, J6 = renfort 08:00-14:00.
--
-- J6 va EN PRATIQUE aux remplacants, mais ce n'est PAS une regle dure
-- (precise par Matthieu le 01/08/2026) : rien ne doit empecher d'y
-- assigner un associe. A ne donc jamais transformer en controle bloquant
-- dans shiftValidation.ts -- tout au plus un avertissement.
-- desiderata.yaml disait "ne doit JAMAIS contenir un associe" : corrige.
--
-- sort_order : ajout a la suite (16-19). L'ordre d'affichage des
-- creneaux est deja melange (Dijon et Beaune alternent sans logique) --
-- dette cosmetique connue, a ranger un jour, hors perimetre ici.
-- ---------------------------------------------------------------------
insert into agenda.shift_types (name, time_range, is_active, sort_order)
values ('J4 Beaune', '08:00-18:30', true, 16),
       ('J7 Beaune', '08:00-18:30', true, 17),
       ('J8 Beaune', '08:00-18:30', true, 18),
       ('J6 Beaune', '08:00-14:00', true, 19);

-- ---------------------------------------------------------------------
-- 2. Hygiene des noms  << BLOC RETIRABLE >>
--
-- A retirer si tu preferes conserver les libelles historiques.
-- Aucun effet sur les donnees : les gardes stockent l'horaire dans
-- shifts.shift_type, jamais le nom du creneau. Seul l'affichage change.
--
-- 2a. "Pre J2 Dijon " -> "J6 Dijon" : meme horaire (08:00-14:00), meme
--     usage (176 de ses 257 gardes tenues par des remplacants, aucune
--     regle de roulement). desiderata.yaml declare le concept "preJ2"
--     abandonne et retient le code J6. Aligner le nom evite d'avoir
--     "J6 Beaune" d'un cote et "Pre J2 Dijon" de l'autre pour le meme
--     creneau, et simplifie l'ecran de correspondance de l'import.
--
-- 2b. Espaces parasites en fin de nom, releves en 7A.
-- ---------------------------------------------------------------------
update agenda.shift_types
   set name = 'J6 Dijon'
 where trim(name) = 'Pré J2 Dijon';

update agenda.shift_types
   set name = trim(name)
 where name <> trim(name);

-- ---------------------------------------------------------------------
-- Verifications
-- ---------------------------------------------------------------------
select 'APRES' as moment, '[' || st.name || ']' as nom, st.time_range, st.is_active, st.sort_order
  from agenda.shift_types st
 order by st.sort_order;

-- Repartition par site. Attendu : Beaune 9 creneaux (7 en semaine + 2 WE),
-- Dijon 10 dont 1 inactif (J5 bis).
select case when st.name ilike '%beaune%' then 'Beaune'
            when st.name ilike '%dijon%'  then 'Dijon'
            else '???' end                                as site,
       count(*)                                           as creneaux,
       count(*) filter (where st.is_active)               as actifs,
       count(*) filter (where st.name ilike 'WE%')        as dont_week_end
  from agenda.shift_types st
 group by 1
 order by 1;

-- Aucun nom ne doit plus porter d'espace parasite. Attendu : 0 ligne.
select '[' || name || ']' as nom_avec_espace
  from agenda.shift_types
 where name <> trim(name);
