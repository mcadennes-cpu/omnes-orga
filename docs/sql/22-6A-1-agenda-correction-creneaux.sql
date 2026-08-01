-- =====================================================================
-- Etape 22 / 6A-1 (MOD-1) : correction des creneaux avant l'import du
-- roulement V2
--
-- Trois ecarts entre les shift_types declares en base et desiderata.yaml
-- avaient ete releves en 7A. Arbitres par Matthieu le 01/08/2026 :
--
--   1. J5 Dijon (12:00-20:00 en base, 08:00-18:30 dans la doc)
--      -> LA BASE FAIT FOI. Aucune ecriture ici : c'est desiderata.yaml
--         qui a ete corrige. Sur 239 gardes J5, 133 sont tenues par un
--         remplacant et 16 seulement par un associe, et la ligne J5 est
--         vide dans le roulement V2 : J5 est un creneau de renfort,
--         hors roulement, comme J6.
--
--   2. J2 Beaune (10:00-22:00 en base, 14:00-22:00 dans la doc)
--      -> DESIDERATA.YAML FAIT FOI. J2 Dijon est bien a 14:00-22:00 ;
--         l'ecart est propre a Beaune, sur un creneau tenu a 80 % par des
--         associes. Corrige ici.
--
--   3. J5 bis Dijon (absent de la doc)
--      -> DESACTIVE. 3 gardes en tout, aucune a venir, la derniere le
--         02/03/2026, aucune regle de roulement, aucun associe.
--
-- Rappel de conception (ecart n.2 de 7A) : shifts porte une copie TEXTE
-- de l'horaire dans shifts.shift_type. Corriger le shift_type ne corrige
-- donc PAS les gardes deja creees -- c'est l'objet du bloc 2b.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Etat avant, pour la trace
-- ---------------------------------------------------------------------
select 'AVANT' as moment, name, time_range, is_active
  from agenda.shift_types
 where name in ('J2 Beaune', 'J5 bis Dijon', 'J5 Dijon', 'J2 Dijon')
 order by name;

-- ---------------------------------------------------------------------
-- 2a. J2 Beaune : 10:00-22:00 -> 14:00-22:00
-- ---------------------------------------------------------------------
update agenda.shift_types
   set time_range = '14:00-22:00'
 where name = 'J2 Beaune'
   and time_range = '10:00-22:00';

-- ---------------------------------------------------------------------
-- 2b. Les gardes J2 Beaune A VENIR portent le meme libelle recopie
--
-- Portee choisie par Matthieu : les gardes DEJA EFFECTUEES gardent leur
-- horaire d'origine (elles ont reellement eu lieu ainsi) ; seules les
-- gardes a venir sont corrigees. Sans ce bloc, la correction serait
-- invisible pour les medecins : ils continueraient a lire 10:00-22:00
-- dans "Mes gardes" jusqu'en 2027.
--
-- La date est FIGEE plutot que current_date : le script fait exactement
-- la meme chose s'il est rejoue ou relu plus tard.
-- ---------------------------------------------------------------------
update agenda.shifts s
   set shift_type = '14:00-22:00'
  from agenda.shift_types st
 where st.id = s.shift_type_id
   and st.name = 'J2 Beaune'
   and s.date >= date '2026-08-01'
   and s.shift_type = '10:00-22:00';

-- ---------------------------------------------------------------------
-- 3. J5 bis Dijon : desactive
--
-- is_active = false plutot qu'un delete : le creneau disparait des menus
-- de creation de gardes, mais les 3 gardes passees conservent leur
-- libelle et restent lisibles dans l'historique. Reversible.
-- ---------------------------------------------------------------------
update agenda.shift_types
   set is_active = false
 where name = 'J5 bis Dijon';

-- ---------------------------------------------------------------------
-- Verifications
-- ---------------------------------------------------------------------
select 'APRES' as moment, name, time_range, is_active
  from agenda.shift_types
 where name in ('J2 Beaune', 'J5 bis Dijon', 'J5 Dijon', 'J2 Dijon')
 order by name;

-- Reste-t-il des gardes J2 Beaune a venir avec l'ancien libelle ?
-- Attendu : 0 ligne avec libelle_ancien > 0.
select st.name,
       count(*) filter (where s.date >= date '2026-08-01')                              as a_venir,
       count(*) filter (where s.date >= date '2026-08-01'
                          and s.shift_type = '10:00-22:00')                             as libelle_ancien,
       count(*) filter (where s.date >= date '2026-08-01'
                          and s.shift_type = '14:00-22:00')                             as libelle_corrige,
       count(*) filter (where s.date <  date '2026-08-01')                              as passees,
       count(*) filter (where s.date <  date '2026-08-01'
                          and s.shift_type = '10:00-22:00')                             as passees_intactes
  from agenda.shifts s
  join agenda.shift_types st on st.id = s.shift_type_id
 where st.name = 'J2 Beaune'
 group by st.name;
