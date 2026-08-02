-- =====================================================================
-- Etape 22 / MOD-1 / sous-etape 6H-3
-- « WE 2 Dijon » -> « WE2 Dijon »
--
-- SIGNALE PAR MATTHIEU (02/08/2026) : « sur le roulement il y a 2 lignes
-- WE2, il ne devrait y en avoir qu'une. »
--
-- Cause : l'espace parasite du nom. La grille derive le code du creneau
-- en retirant le site et la plage horaire de son nom --
-- « WE2 beaune 08h-20h » donne « WE2 », mais « WE 2 Dijon » donne
-- « WE 2 ». Deux codes distincts, donc deux lignes, la ou le doublon de
-- week-end n'en est qu'un.
--
-- Les autres creneaux ne posent pas ce probleme : « WE1 Dijon » et
-- « WE1 beaune 08h-20h » donnent tous deux « WE1 » et se rejoignent bien
-- sur une seule ligne -- ce qui confirme le diagnostic.
--
-- Le renommage est sans risque : tout ce qui pointe vers un creneau le
-- fait par son identifiant. Verifie avant execution --
-- `agenda.shifts.shift_type` (colonne texte denormalisee) ne contient
-- aucune valeur commencant par « WE » ; elle porte la plage horaire.
--
-- Idempotent : reexecutable sans dommage.
-- =====================================================================

update agenda.shift_types
   set name = 'WE2 Dijon'
 where name = 'WE 2 Dijon';

-- ---------------------------------------------------------------------
-- Verifications
-- ---------------------------------------------------------------------
select 'creneaux de week-end' as controle, name, time_range
  from agenda.shift_types
 where name like 'WE%'
 order by name;

-- Le code derive comme le fait la grille : plus qu'un WE2 et qu'un WE1.
select 'codes derives' as controle,
       count(distinct code) as codes,
       string_agg(distinct code, ', ' order by code) as liste
  from (
    select trim(regexp_replace(
             regexp_replace(st.name, si.name, '', 'i'),
             '\d{1,2}\s*h\s*-\s*\d{1,2}\s*h', '', 'i')) as code
      from agenda.shift_types st
      join agenda.sites si
        on st.name ilike '%' || si.name || '%'
     where st.name like 'WE%'
  ) c;
