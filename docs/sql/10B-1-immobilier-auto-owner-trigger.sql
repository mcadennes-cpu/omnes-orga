-- =============================================================
-- 10B-1 : Module Immobilier — trigger auto-owner
-- =============================================================
-- Apres INSERT sur immobilier_boards, inscrit automatiquement
-- l'auteur du tableau comme owner dans immobilier_board_members.
-- Permet a l'INSERT...RETURNING de cote client de retrouver la
-- ligne via la policy SELECT (qui exige is_immobilier_board_member).
--
-- Note : le trigger est SECURITY DEFINER pour pouvoir inserer dans
-- board_members independamment de la policy INSERT de cette table
-- (qui exige is_immobilier_board_owner, condition qu'on est en
-- train d'etablir avec cette ligne meme — poule et oeuf).
-- =============================================================

CREATE OR REPLACE FUNCTION public.add_immobilier_board_creator_as_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.auteur_id IS NOT NULL THEN
    INSERT INTO public.immobilier_board_members (board_id, user_id, role_in_board)
    VALUES (NEW.id, NEW.auteur_id, 'owner');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_immobilier_boards_auto_owner
  AFTER INSERT ON public.immobilier_boards
  FOR EACH ROW EXECUTE FUNCTION public.add_immobilier_board_creator_as_owner();

-- =============================================================
-- Fin 10B-1
-- =============================================================
