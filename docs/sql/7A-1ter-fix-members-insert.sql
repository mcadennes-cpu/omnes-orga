-- ============================================================================
-- Module Discussion - correctif 7A-1 (suite)
-- ----------------------------------------------------------------------------
-- discussion_board_members_insert : la policy d'origine exigeait que le
-- createur s'ajoute lui-meme avec role='owner' uniquement (et n'autorisait
-- pas l'ajout des autres membres dans la foulee). Reecrite pour permettre
-- au createur du tableau d'inserer toutes les lignes de membres (lui + invites)
-- en une seule transaction depuis le client.
-- ============================================================================

drop policy if exists discussion_board_members_insert on public.discussion_board_members;

create policy discussion_board_members_insert on public.discussion_board_members
  for insert with check (
    public.is_board_owner(board_id)
    or exists (
      select 1 from public.profiles
       where id = auth.uid() and role::text = 'super_admin'
    )
    or exists (
      -- createur du tableau : peut ajouter n'importe quel membre (lui-meme et les autres)
      select 1 from public.discussion_boards b
       where b.id = board_id and b.created_by = auth.uid()
    )
  );
