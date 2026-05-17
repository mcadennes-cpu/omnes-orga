-- ============================================================================
-- Module Discussion - etape 7C
-- ----------------------------------------------------------------------------
-- Fonction mark_board_read : permet a un utilisateur de marquer un tableau
-- comme lu (mise a jour de son last_read_at dans discussion_board_members),
-- ce qui pilote le point colore "non-lu" sur la tile de la liste Discussion.
--
-- Pourquoi une fonction plutot qu'une policy UPDATE :
-- une policy UPDATE generale sur discussion_board_members laisserait un
-- membre modifier n'importe quel champ de sa ligne, y compris `role`
-- (il pourrait se promouvoir 'owner'). Cette fonction SECURITY DEFINER
-- ne touche QUE last_read_at, et uniquement pour la ligne de l'appelant.
-- ============================================================================

create or replace function public.mark_board_read(p_board_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.discussion_board_members
     set last_read_at = now()
   where board_id = p_board_id
     and user_id = auth.uid();
$$;

grant execute on function public.mark_board_read(uuid) to authenticated;
