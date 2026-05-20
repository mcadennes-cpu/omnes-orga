-- =============================================================
-- 10A-5 : Module Immobilier — activation Realtime
-- =============================================================
-- Ajoute 4 tables a la publication supabase_realtime.
-- Pas board_members (rechargement page suffit).
-- Pas card_reads (purement local).
-- =============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.immobilier_boards;
ALTER PUBLICATION supabase_realtime ADD TABLE public.immobilier_cards;
ALTER PUBLICATION supabase_realtime ADD TABLE public.immobilier_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.immobilier_attachments;

-- =============================================================
-- Fin 10A-5
-- =============================================================
