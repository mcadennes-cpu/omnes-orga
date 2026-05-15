-- ============================================================================
-- Module Discussion - correctifs 7A-1
-- ----------------------------------------------------------------------------
-- 1. can_create_discussion_board lit profiles directement plutot que de passer
--    par current_user_role() (compatible quel que soit le type de retour).
-- 2. discussion_boards_select etend la visibilite au createur du board, pour
--    permettre INSERT...RETURNING avant l'ajout du createur comme membre.
-- ============================================================================

create or replace function public.can_create_discussion_board()
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1
      from public.profiles
     where id = auth.uid()
       and role::text in ('associe', 'associe_gerant', 'super_admin')
  );
$$;

drop policy if exists discussion_boards_select on public.discussion_boards;

create policy discussion_boards_select on public.discussion_boards
  for select using (
    public.is_board_member(id)
    or created_by = auth.uid()
  );
