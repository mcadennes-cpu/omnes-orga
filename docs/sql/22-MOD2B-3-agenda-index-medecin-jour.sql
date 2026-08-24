-- =====================================================================
-- Etape 22 / MOD2-B (complement) : unique_doctor_per_day doit ignorer
-- les gardes supprimees
--
-- OUBLI DE MOD2-B, trouve par Matthieu le 24/08/2026 en butant sur
-- « duplicate key value violates unique constraint unique_doctor_per_day ».
--
-- MOD2-B a converti unique_shift en index PARTIEL sur les lignes vivantes,
-- mais la table porte un SECOND index unique qui, lui, n'a pas ete touche :
--
--   unique (assigned_doctor_id, date)
--     where assigned_doctor_id is not null and status = 'assigned'
--
-- Consequence : une garde SUPPRIMEE mais restee « assigned » continue
-- d'occuper la journee de son medecin. Il devient impossible de lui en
-- attribuer une autre ce jour-la, alors que la garde n'existe plus pour
-- personne. Exactement le defaut que la conversion d'unique_shift avait
-- corrige -- la lecon n'avait ete appliquee qu'a un seul des deux index.
--
-- Mesure au moment du correctif : 31 gardes supprimees bloquaient encore
-- 9 medecins, du 04 au 10/01/2027 (l'annulation d'une duplication de
-- modele, le 06/08).
--
-- A executer une seule fois sur le projet ydihrgnixthrraprclox.
-- =====================================================================

drop index agenda.unique_doctor_per_day;

create unique index unique_doctor_per_day
  on agenda.shifts (assigned_doctor_id, date)
  where assigned_doctor_id is not null
    and status = 'assigned'
    and deleted_at is null;

-- =====================================================================
-- Controle
--
--   select indexdef from pg_indexes
--    where schemaname='agenda' and indexname='unique_doctor_per_day';
--   -- attendu : ... WHERE ((assigned_doctor_id IS NOT NULL)
--   --                 AND (status = 'assigned') AND (deleted_at IS NULL))
--
--   -- plus aucune garde supprimee ne bloque une journee
--   select count(*) from agenda.shifts
--    where deleted_at is not null and assigned_doctor_id is not null
--      and status = 'assigned';
--   -- ces lignes existent toujours, mais ne contraignent plus rien
--
-- LECON A RETENIR : quand on rend une suppression douce, il faut passer en
-- revue TOUS les index uniques de la table, pas seulement celui auquel on
-- pense. Un index unique oublie transforme une ligne invisible en ligne
-- bloquante -- un fantome qui interdit sans se montrer.
-- =====================================================================
