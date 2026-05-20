-- =============================================================
-- 10A-2 : Module Immobilier — fonctions SECURITY DEFINER
-- =============================================================
-- 5 fonctions :
--   - is_immobilier_member()              : acces au module
--   - is_immobilier_board_member(board)   : membre d'un tableau donne
--   - is_immobilier_board_owner(board)    : owner d'un tableau donne
--   - can_create_immobilier_board()       : droit de creer un tableau
--   - mark_immobilier_board_read(board)   : RPC ouverture tableau
-- =============================================================

-- ---------- is_immobilier_member ------------------------------
-- True si l'utilisateur courant est super_admin, associe_gerant
-- ou associe. Exclut explicitement les remplacants.
CREATE OR REPLACE FUNCTION public.is_immobilier_member()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin', 'associe_gerant', 'associe')
  );
$$;

-- ---------- is_immobilier_board_member ------------------------
-- True si l'utilisateur courant est membre du tableau donne.
-- Utilise dans toutes les policies SELECT du module (cards,
-- messages, attachments, card_reads, board_members) et dans
-- la policy SELECT de immobilier_boards.
CREATE OR REPLACE FUNCTION public.is_immobilier_board_member(p_board_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.immobilier_board_members
    WHERE board_id = p_board_id
      AND user_id = auth.uid()
  );
$$;

-- ---------- is_immobilier_board_owner -------------------------
-- True si l'utilisateur courant est owner du tableau donne.
-- Utilise dans les policies UPDATE/DELETE de immobilier_boards
-- (archiver, renommer, supprimer dur si super_admin), et dans
-- la policy INSERT de immobilier_board_members (inviter).
CREATE OR REPLACE FUNCTION public.is_immobilier_board_owner(p_board_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.immobilier_board_members
    WHERE board_id = p_board_id
      AND user_id = auth.uid()
      AND role_in_board = 'owner'
  );
$$;

-- ---------- can_create_immobilier_board -----------------------
-- True si l'utilisateur courant est super_admin ou associe_gerant.
-- Difference vs Discussion : l'associe ne peut PAS creer de tableau.
CREATE OR REPLACE FUNCTION public.can_create_immobilier_board()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('super_admin', 'associe_gerant')
  );
$$;

-- ---------- mark_immobilier_board_read ------------------------
-- RPC appelee a l'ouverture d'un tableau. Met a jour le seul
-- champ last_read_at de la ligne immobilier_board_members de
-- l'appelant. Pas touche a role_in_board (anti-promotion).
-- Pattern identique a mark_board_read (Discussion 7C).
CREATE OR REPLACE FUNCTION public.mark_immobilier_board_read(p_board_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.immobilier_board_members
    SET last_read_at = now()
    WHERE board_id = p_board_id
      AND user_id = auth.uid();
END;
$$;

-- =============================================================
-- Droits d'execution
-- =============================================================
-- Les fonctions SECURITY DEFINER tournent avec les droits du
-- createur (postgres), mais doivent quand meme etre EXECUTE-ables
-- par le role authenticated.
GRANT EXECUTE ON FUNCTION public.is_immobilier_member()                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_immobilier_board_member(uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_immobilier_board_owner(uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_create_immobilier_board()                TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_immobilier_board_read(uuid)             TO authenticated;

-- Correctif retroactif sur 10A-1 : figer le search_path
-- de bump_immobilier_card_activity (oubli en 10A-1)
ALTER FUNCTION public.bump_immobilier_card_activity()
  SET search_path = public, pg_temp;

-- =============================================================
-- Fin 10A-2
-- =============================================================
