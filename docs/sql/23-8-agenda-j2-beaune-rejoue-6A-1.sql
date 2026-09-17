-- =====================================================================
-- Reparation 23-8 : rendre a J2 Beaune son horaire 14:00-22:00, tel que
-- 6A-1 l'avait pose -- et que la resynchronisation du 26/08 a defait
--
-- CE QUI S'EST PASSE
--   01/08/2026  22-6A-1, bloc 2b, arbitrage de Matthieu : J2 Beaune passe
--               a 14:00-22:00. Les gardes A VENIR (date >= 01/08/2026)
--               sont corrigees ; les gardes deja effectuees gardent
--               10:00-22:00, parce qu'elles ont reellement eu lieu ainsi.
--   26/08/2026  Repetition generale de 22-8A-1 (resynchronisation depuis
--               Bolt), 14:32:40 a 14:32:42 UTC, trois lots hors appli.
--               Bolt n'a jamais change son creneau (toujours 10:00-22:00)
--               et le script recopiait le texte shifts.shift_type : 107
--               gardes J2 Beaune repassent a 10:00-22:00. Personne ne le
--               voit.
--   03/09/2026  Releve en 8D en regardant « Planning du jour ».
--   17/09/2026  Cause retrouvee dans agenda.activity_log. Matthieu
--               confirme 14:00-22:00 et maintient la portee du 01/08.
--
-- CE QUE FAIT CE SCRIPT
-- Il rejoue le bloc 2b de 6A-1, a l'identique : meme filtre, meme date
-- figee. Mesure faite avant ecriture : il vise 107 gardes, TOUTES nommees
-- par le journal comme remises a 10:00-22:00 le 26/08, aucune en dehors,
-- et aucune garde du journal ne lui echappe.
--
-- POURQUOI CA NE SE REPRODUIRA PAS
-- 22-8A-1 est corrige dans le meme commit : sur une garde deja presente
-- dans Orga, le texte de l'horaire ne vient plus de Bolt. Sans cette
-- correction, le soir de la bascule defaisait ce script une seconde fois.
--
-- Idempotent : relance, il ne trouve plus rien a corriger.
-- A executer sur le projet ydihrgnixthrraprclox.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Les gardes J2 Beaune a partir du 01/08/2026
--
-- Pas de filtre sur deleted_at, comme en 6A-1 : une garde close reste
-- interrogeable pour le bilan de couverture, son horaire doit y etre
-- juste aussi. (Mesure du 17/09 : aucune n'est close.)
-- ---------------------------------------------------------------------
update agenda.shifts s
   set shift_type = '14:00-22:00'
  from agenda.shift_types st
 where st.id = s.shift_type_id
   and st.name = 'J2 Beaune'
   and s.date >= date '2026-08-01'
   and s.shift_type = '10:00-22:00';

-- ---------------------------------------------------------------------
-- 2. Verification
--
-- Attendu : a_partir_du_01_08_a_10h = 0 ; avant_le_01_08_a_14h = 0
-- (l'historique n'est pas touche) ; creneau_declare = 14:00-22:00.
-- ---------------------------------------------------------------------
select st.time_range                                                         as creneau_declare,
       count(*) filter (where s.date <  date '2026-08-01'
                          and s.shift_type = '10:00-22:00')                  as avant_le_01_08_a_10h,
       count(*) filter (where s.date <  date '2026-08-01'
                          and s.shift_type = '14:00-22:00')                  as avant_le_01_08_a_14h,
       count(*) filter (where s.date >= date '2026-08-01'
                          and s.shift_type = '14:00-22:00')                  as a_partir_du_01_08_a_14h,
       count(*) filter (where s.date >= date '2026-08-01'
                          and s.shift_type = '10:00-22:00')                  as a_partir_du_01_08_a_10h
  from agenda.shifts s
  join agenda.shift_types st on st.id = s.shift_type_id
 where st.name = 'J2 Beaune'
 group by st.time_range;
