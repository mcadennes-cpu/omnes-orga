-- =====================================================================
-- Etape 22 / MOD2-E : suppression de la table undo_buffer
--
-- Fin du mecanisme d'annulation d'origine. Ce que MOD-2 lui reprochait,
-- point par point :
--
--   1. UN SEUL NIVEAU  -- UNIQUE(user_id), chaque action ecrasait la
--      precedente. Le journal conserve TOUT.
--   2. AUCUNE PEREMPTION -- le bouton restait actif indefiniment ; on
--      pouvait defaire un geste vieux de trois jours pendant lesquels des
--      medecins avaient demande ou obtenu les gardes. Le bandeau
--      ephemere supprime ce risque par construction : passe le delai, il
--      n'y a plus rien a cliquer. Et l'ecran, lui, verifie la coherence.
--   3. AUCUNE VERIFICATION -- l'etat courant n'etait jamais compare a
--      l'etat attendu. C'est desormais le coeur de restaurer_action.
--   4. COUVERTURE PARTIELLE -- annoncee a 6 types, reelle a 2 : quatre
--      n'ont jamais ete cables. Le journal enregistre par declencheur,
--      donc sans rien oublier.
--   5. UX DATEE -- alert() bloquant et sondage toutes les 2 secondes. Le
--      bandeau vit cote client et n'interroge la base que si l'on clique.
--
-- ⚠ A N'EXECUTER QU'APRES DEPLOIEMENT du code de MOD2-E : tant qu'une
-- version anterieure du module tourne dans un navigateur ouvert, elle
-- interroge encore cette table toutes les 2 secondes. La perte est sans
-- gravite (le bouton se grise), mais autant l'eviter.
--
-- A executer une seule fois sur le projet ydihrgnixthrraprclox.
-- =====================================================================

-- Trace de ce qu'on jette : si le tampon contenait encore une action non
-- annulee, elle est perdue -- et elle ne l'etait de toute facon que pour
-- un seul utilisateur, la table etant ecrasee a chaque geste.
do $$
declare
  v_reste integer;
begin
  select count(*) into v_reste from agenda.undo_buffer;
  raise notice 'undo_buffer contenait % action(s) en attente au moment de sa suppression', v_reste;
end $$;

drop table if exists agenda.undo_buffer;

-- =====================================================================
-- Controle
--
--   select to_regclass('agenda.undo_buffer');   -- attendu : NULL
--
--   -- le journal, lui, a pris le relais
--   select count(*) from agenda.activity_log;
-- =====================================================================
