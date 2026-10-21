-- =====================================================================
-- Etape 22 / module Agenda
-- 23-29 : retirer du plan "Roulement V2 - 9 associes (corrige janvier
-- 2027)" la regle qui placait Laurene Daudin deux fois le lundi de S6
--
-- Constat (21/10/2026) : l'ouverture des semaines a partir du 04/01/2027
-- echouait sur l'index unique agenda.unique_doctor_per_day (un medecin ne
-- peut pas avoir deux gardes affectees le meme jour). Le lundi de S6 --
-- et le 04/01/2027 en est un -- le plan placait LD en J4 Beaune ET en J7
-- Dijon. Seule case du plan dans ce cas sur 265.
--
-- Arbitrage de Matthieu : LD reste en J7 Dijon, le J4 Beaune est retire
-- (il reste ouvert aux remplacants). Le fichier de reference
-- docs/planning-V2_2026-10 2.xlsx a ete corrige dans le meme sens : apres
-- ce script, fichier et plan ne different plus d'aucune case.
--
-- Pourquoi un script plutot qu'un nouvel import : reimporter imposerait
-- de rearchiver un plan deja actif a la meme date d'entree en vigueur
-- (meme obstacle que 23-28), pour une seule case.
--
-- Prealable : sauvegarde 23-16 executee avant ce script.
-- Idempotent : une deuxieme execution ne trouve plus la ligne.
-- =====================================================================

-- 0. Etat avant : la regle visee, et le total du plan (265 attendu)
select r.id, r.rotation_week, r.weekday, st.name as creneau, p.prenom || ' ' || p.nom as medecin
  from agenda.rotation_plan_rules r
  join agenda.shift_types st on st.id = r.shift_type_id
  join public.profiles p     on p.id  = r.doctor_id
 where r.id = '9fe2e984-6d0e-4dc0-a334-48b1c6abc16e';

select count(*) as regles
  from agenda.rotation_plan_rules
 where plan_id = '4777af6e-adac-4708-9656-c0b3f13af849';

-- 1. Suppression, verrouillee sur le plan et sur la case attendue
delete from agenda.rotation_plan_rules
 where id            = '9fe2e984-6d0e-4dc0-a334-48b1c6abc16e'
   and plan_id       = '4777af6e-adac-4708-9656-c0b3f13af849'
   and rotation_week = 6
   and weekday       = 1;

-- 2. Etat apres : 264 regles, et plus aucun medecin deux fois le meme jour
select count(*) as regles
  from agenda.rotation_plan_rules
 where plan_id = '4777af6e-adac-4708-9656-c0b3f13af849';

select rotation_week, weekday, doctor_id, count(*)
  from agenda.rotation_plan_rules
 where plan_id = '4777af6e-adac-4708-9656-c0b3f13af849'
 group by 1, 2, 3
having count(*) > 1;
