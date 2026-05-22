-- =============================================================
-- 10D-2a : Module Immobilier — REPLICA IDENTITY FULL
-- =============================================================
-- Permet a Supabase Realtime de relayer les evenements DELETE
-- avec leur contenu complet (au lieu de juste la PK), ce qui rend
-- les filtres "card_id=eq.X" / "board_id=eq.X" evaluables sur
-- les DELETE.
--
-- Coute : doublement du WAL pour ces tables. Tolerable au vu du
-- volume attendu (cabinet medical ~30 users, peu de DELETE).
-- =============================================================

ALTER TABLE public.immobilier_messages    REPLICA IDENTITY FULL;
ALTER TABLE public.immobilier_attachments REPLICA IDENTITY FULL;
ALTER TABLE public.immobilier_cards       REPLICA IDENTITY FULL;
ALTER TABLE public.immobilier_boards      REPLICA IDENTITY FULL;

-- =============================================================
-- Fin 10D-2a SQL
-- =============================================================
