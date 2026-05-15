import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';

/**
 * Hook principal du module Discussion.
 * Gere la liste des tableaux ou l'utilisateur courant est membre,
 * avec metadonnees calculees (cartes ouvertes, dernier message,
 * indicateur non-lu), realtime, et mutations (creation, archivage, delete).
 *
 * La RLS de Supabase filtre cote serveur : on ne recupere que les tableaux
 * ou auth.uid() est present dans discussion_board_members.
 */
export function useDiscussion() {
  const [boards, setBoards] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userId, setUserId] = useState(null);

  // -------------------------------------------------------------------------
  // 1. Recuperation de l'utilisateur courant
  // -------------------------------------------------------------------------
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setUserId(data?.user?.id ?? null);
    });
    return () => { mounted = false; };
  }, []);

  // -------------------------------------------------------------------------
  // 2. Fetch des tableaux + enrichissement cote client
  // -------------------------------------------------------------------------
  const fetchBoards = useCallback(async () => {
    if (!userId) return;

    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('discussion_boards')
        .select(`
          id, title, description, color, created_by, archived, created_at,
          members:discussion_board_members(user_id, role, last_read_at),
          cards:discussion_cards(id, status, last_activity_at, archived)
        `);

      if (fetchError) throw fetchError;

      const enriched = (data || []).map((board) => {
        const activeCards = (board.cards || []).filter((c) => !c.archived);
        const openCards = activeCards.filter((c) => c.status === 'open');
        const lastActivityMs = activeCards.length > 0
          ? Math.max(...activeCards.map((c) => new Date(c.last_activity_at).getTime()))
          : new Date(board.created_at).getTime();

        const myMember = (board.members || []).find((m) => m.user_id === userId);
        const lastReadMs = myMember?.last_read_at
          ? new Date(myMember.last_read_at).getTime()
          : 0;

        return {
          id: board.id,
          title: board.title,
          description: board.description,
          color: board.color,
          createdBy: board.created_by,
          archived: board.archived,
          createdAt: board.created_at,
          openCardsCount: openCards.length,
          membersCount: (board.members || []).length,
          lastActivityAt: new Date(lastActivityMs).toISOString(),
          hasUnread: lastActivityMs > lastReadMs,
        };
      });

      // Tri : dernier message en haut (style messagerie)
      enriched.sort((a, b) =>
        new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
      );

      setBoards(enriched);
    } catch (err) {
      console.error('[useDiscussion] fetchBoards error:', err);
      setError(err);
      setBoards([]);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // -------------------------------------------------------------------------
  // 3. Fetch initial des qu'on a userId
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (userId) fetchBoards();
  }, [userId, fetchBoards]);

  // -------------------------------------------------------------------------
  // 4. Realtime : refetch sur changement de boards ou de mes appartenances
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!userId) return undefined;

    const channel = supabase
      .channel('discussion_boards_list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'discussion_boards' },
        () => fetchBoards()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'discussion_board_members',
          filter: `user_id=eq.${userId}`,
        },
        () => fetchBoards()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'discussion_cards' },
        () => fetchBoards()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchBoards]);

  // -------------------------------------------------------------------------
  // 5. Creation d'un tableau
  // -------------------------------------------------------------------------
  /**
   * Cree un tableau et ajoute l'auteur comme owner + les membres invites.
   * En cas d'echec sur l'insert des membres, supprime le tableau (rollback manuel).
   *
   * @param {{ title: string, description?: string, color?: string, memberIds?: string[] }} payload
   * @returns {Promise<object>} le board cree
   */
  const createBoard = useCallback(async ({ title, description, color, memberIds = [] }) => {
    if (!userId) throw new Error('Utilisateur non connecte');
    const trimmedTitle = (title || '').trim();
    if (!trimmedTitle) throw new Error('Le titre est obligatoire');

    const { data: board, error: boardError } = await supabase
      .from('discussion_boards')
      .insert({
        title: trimmedTitle,
        description: description?.trim() || null,
        color: color || 'brique',
        created_by: userId,
      })
      .select()
      .single();

    if (boardError) throw boardError;

    // Liste des membres : auteur (owner) + invites dedupliques (members)
    const uniqueMemberIds = [...new Set((memberIds || []).filter((id) => id && id !== userId))];
    const memberRows = [
      { board_id: board.id, user_id: userId, role: 'owner' },
      ...uniqueMemberIds.map((id) => ({
        board_id: board.id,
        user_id: id,
        role: 'member',
      })),
    ];

    const { error: membersError } = await supabase
      .from('discussion_board_members')
      .insert(memberRows);

    if (membersError) {
      // Rollback : supprimer le board orphelin
      await supabase.from('discussion_boards').delete().eq('id', board.id);
      throw membersError;
    }

    await fetchBoards();
    return board;
  }, [userId, fetchBoards]);

  // -------------------------------------------------------------------------
  // 6. Archivage / desarchivage
  // -------------------------------------------------------------------------
  const archiveBoard = useCallback(async (boardId) => {
    const { error: err } = await supabase
      .from('discussion_boards')
      .update({ archived: true })
      .eq('id', boardId);
    if (err) throw err;
    await fetchBoards();
  }, [fetchBoards]);

  const unarchiveBoard = useCallback(async (boardId) => {
    const { error: err } = await supabase
      .from('discussion_boards')
      .update({ archived: false })
      .eq('id', boardId);
    if (err) throw err;
    await fetchBoards();
  }, [fetchBoards]);

  // -------------------------------------------------------------------------
  // 7. Suppression dure (super_admin uniquement, applique par la RLS)
  // -------------------------------------------------------------------------
  const deleteBoard = useCallback(async (boardId) => {
    const { error: err } = await supabase
      .from('discussion_boards')
      .delete()
      .eq('id', boardId);
    if (err) throw err;
    await fetchBoards();
  }, [fetchBoards]);

  return {
    boards,
    isLoading,
    error,
    userId,
    refetch: fetchBoards,
    createBoard,
    archiveBoard,
    unarchiveBoard,
    deleteBoard,
  };
}
