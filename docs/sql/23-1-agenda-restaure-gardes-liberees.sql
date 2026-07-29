-- 23-1 : incident du 29/07/2026 - liberation en masse de gardes J5 Dijon
--        Diagnostic, perimetre et restaurations effectuees.
--
-- Projet concerne : Planning (kldgvjxuojeeqhdrmaia), base de PROD partagee
-- avec l'appli Bolt.
--
-- ===========================================================================
-- CAUSE
-- ===========================================================================
-- handleCancelAssignment('rotation') (src/modules/agenda/hooks/useShiftDetail.ts)
-- fait deux operations avec deux perimetres DIFFERENTS :
--
--   1. suppression de la regle de roulement -> filtre correctement sur
--      doctor_id + site_id + room_id + shift_type_id + weekday + rotation_week
--   2. liberation des gardes -> filtre seulement sur
--      site_id + room_id + shift_type_id + date >= aujourd'hui
--
-- Il manque weekday, rotation_week et doctor_id sur la seconde. Supprimer une
-- regle qui ne couvre qu'un jour dans une semaine de cycle libere donc TOUTES
-- les gardes futures du creneau, tous jours et toutes semaines confondus.
--
-- Le meme defaut existe dans le code d'origine Bolt encore en production
-- (reference-agenda/src/components/ShiftDetailModal.tsx, ligne 450).
--
-- ===========================================================================
-- CONSTAT (29/07/2026 08:06:22 UTC)
-- ===========================================================================
-- 100 gardes "J5 Dijon" (Cabinet B2) passees a 'free' en une seule seconde,
-- du 05/08/2026 au 31/12/2026, sur les 5 jours ouvres.
-- Repartition des traces exploitables :
--   -  12 portaient une demande 'approved'      -> medecin identifiable
--   -  42 portaient une demande 'pending'       -> statut de garde incoherent
--   -   7 relevaient d'une regle de roulement   -> Dr Mireille YUAN
--   - le reste : aucune trace en base (deja libres, ou assignation directe
--     par le coordinateur, qui ne laisse ni demande ni regle).
--
-- ===========================================================================
-- RESTAURATIONS EFFECTUEES LE 29/07/2026
-- ===========================================================================
-- Toutes les ecritures ci-dessous ont ete passees avec un garde-fou
-- NOT EXISTS / status='free', pour qu'aucune ne puisse creer de double
-- reservation ni ecraser une reassignation manuelle faite entre-temps.
-- L'index unique partiel unique_doctor_per_day (assigned_doctor_id, date)
-- WHERE status='assigned' fait echouer tout l'UPDATE en bloc si un medecin se
-- retrouve avec deux gardes le meme jour : d'ou la clause NOT EXISTS.

-- --- 1) 8 gardes rendues aux remplacants (trace = demande 'approved') -------
-- Perimetre : garde encore libre, une seule demande approuvee, medecin libre
-- ce jour-la. 17 autres orphelines volontairement NON restaurees (medecin
-- deja occupe ailleurs, ou debris anterieurs a l'incident) : arbitrage humain.
UPDATE shifts s
SET status='assigned', assigned_doctor_id=a.doctor_id, updated_at=now()
FROM (VALUES
 ('e4f7e359-bd88-4aea-a2d5-90ba9af30c7a'::uuid,'18c919a1-a7db-4564-8a20-cd4280900755'::uuid), -- 21/08 LE MOUELLE
 ('aef03ba2-8bda-4e60-8775-57403b3d46f0','d9f18eaf-5030-4bd1-b2b7-576553163090'),             -- 24/08 BILOTTA
 ('2b24cf56-99ad-41e4-9117-4b48d99d8a48','67318a7a-6310-45ad-bba0-3de862754d3a'),             -- 26/08 JARRAUD
 ('e908daf6-1dc4-4785-9a6a-943c1bc10c49','b9a660fb-d6bb-499a-98b6-ea138d87c7bd'),             -- 27/08 DEMONGEOT
 ('4000dfb5-f4a0-49cd-9a9a-2462794fe36a','8a0b686a-f217-4a22-8251-228264d45f51'),             -- 31/08 BERTRAND
 ('c3667f03-34c0-45a4-99b2-3716593ef2f9','b9a660fb-d6bb-499a-98b6-ea138d87c7bd'),             -- 01/09 DEMONGEOT
 ('a5937494-6014-49e2-b11b-8353d0f24da0','b9a660fb-d6bb-499a-98b6-ea138d87c7bd'),             -- 02/09 DEMONGEOT
 ('0555c084-3c5c-4b87-bb62-c1e8256fce4d','8a0b686a-f217-4a22-8251-228264d45f51')              -- 03/09 BERTRAND
) AS a(shift_id, doctor_id)
WHERE s.id=a.shift_id AND s.status='free' AND s.assigned_doctor_id IS NULL;

-- --- 2) Regle de roulement supprimee par l'incident, recreee ---------------
-- Dr Mireille YUAN, J5 Dijon / Cabinet B2, lundi (weekday=1), semaine 8.
-- Son existence est prouvee par les gardes PASSEES, non touchees par
-- l'incident : le 08/06/2026 (lundi, semaine 8) lui etait bien assigne.
-- Sans cette recreation, ses lundis de S8 auraient cesse d'etre generes.
INSERT INTO rotation_assignment_rules
  (doctor_id, site_id, room_id, shift_type_id, weekday, rotation_week, created_by)
VALUES
  ('0e11f4f4-3be5-41d0-b504-851b10b9ba10','a6e2400a-999d-4c62-a1ec-48d1a4a7efcd',
   '39473cdc-0317-4d43-80d7-9c23e621ac44','02bf5c39-7248-458f-af6f-98782ee1e77b',
   1, 8, '475666e0-a4d9-4973-b681-81a0530680e6')
ON CONFLICT (site_id, room_id, shift_type_id, weekday, rotation_week) DO NOTHING;

-- --- 3) 6 gardes de roulement rendues a Dr Mireille YUAN -------------------
-- Ses 3 cases J5 Dijon : mardi S1, mardi S5, lundi S8.
-- Le 06/10 est volontairement EXCLU : elle est deja inscrite en J8 Dijon ce
-- jour-la (changement ponctuel, decision de Matthieu du 29/07).
UPDATE shifts s
SET status='assigned', assigned_doctor_id='0e11f4f4-3be5-41d0-b504-851b10b9ba10', updated_at=now()
WHERE s.id IN ('3917c3c3-8070-4c22-a8a5-0f35cf7fb78e',  -- 08/09 mardi S5
               'c018b66c-be38-4783-bce4-983828a5fff3',  -- 28/09 lundi S8
               'cffd4a21-f03b-47bf-b84a-579d56e9e8d4',  -- 03/11 mardi S5
               '40810ad0-7cb2-4536-bc40-b368787fe26d',  -- 23/11 lundi S8
               '959b99c0-e7fd-4452-a17a-26403659b722',  -- 01/12 mardi S1
               'e860d155-059f-4d38-8e07-4f02df385c0a')  -- 29/12 mardi S5
  AND s.status='free' AND s.assigned_doctor_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM shifts s2 WHERE s2.date=s.date AND s2.status='assigned'
                    AND s2.assigned_doctor_id='0e11f4f4-3be5-41d0-b504-851b10b9ba10');

-- --- 4) 42 gardes remises en 'pending' -------------------------------------
-- Le declencheur update_shift_status ne reagit qu'aux ecritures sur 'requests'.
-- L'UPDATE en masse sur 'shifts' a donc laisse 42 gardes en 'free' alors
-- qu'une demande 'pending' subsistait : elles s'affichaient en blanc (libre)
-- au lieu d'ocre (demande en attente), masquant les demandes au coordinateur.
UPDATE shifts s
SET status='pending', updated_at=now()
WHERE s.status='free' AND s.assigned_doctor_id IS NULL AND s.date>=CURRENT_DATE
  AND s.updated_at >= '2026-07-29 08:06:22+00' AND s.updated_at < '2026-07-29 08:06:23+00'
  AND EXISTS (SELECT 1 FROM requests r WHERE r.shift_id=s.id AND r.status='pending');

-- ===========================================================================
-- CONTROLES DE COHERENCE (tous a 0 apres execution, hors orphelines connues)
-- ===========================================================================
SELECT 'libre avec demande en attente' AS controle, count(*) AS n FROM shifts s
WHERE s.status='free' AND s.date>=CURRENT_DATE
  AND EXISTS (SELECT 1 FROM requests r WHERE r.shift_id=s.id AND r.status='pending')
UNION ALL
SELECT 'pending sans demande', count(*) FROM shifts s
WHERE s.status='pending' AND s.date>=CURRENT_DATE
  AND NOT EXISTS (SELECT 1 FROM requests r WHERE r.shift_id=s.id AND r.status IN ('pending','on_hold'))
UNION ALL
SELECT 'double reservation', count(*) FROM (
  SELECT assigned_doctor_id, date FROM shifts
  WHERE assigned_doctor_id IS NOT NULL AND status='assigned'
  GROUP BY 1,2 HAVING count(*)>1) x
UNION ALL
SELECT 'orphelines approved restantes (arbitrage humain)', count(DISTINCT s.id) FROM shifts s
JOIN requests r ON r.shift_id=s.id AND r.status='approved'
WHERE s.status='free' AND s.assigned_doctor_id IS NULL AND s.date>=CURRENT_DATE;

-- ===========================================================================
-- RESTE A FAIRE
-- ===========================================================================
-- - Corriger le filtre de handleCancelAssignment('rotation') (weekday +
--   rotation_week + doctor_id) : sans cela, le prochain clic relance une vague.
-- - Reporter ce correctif dans l'appli Bolt, ou poser un garde-fou cote base
--   qui protege les deux applications.
-- - Arbitrer les 17 demandes 'approved' orphelines restantes.
