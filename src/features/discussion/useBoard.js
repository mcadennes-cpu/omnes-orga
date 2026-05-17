import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

/**
 * Hook de la vue d'un tableau de discussion.
 *
 * Charge un tableau, ses cartes (avec compteurs de messages et de
 * non-lus), ses membres, expose les mutations, s'abonne au Realtime,
 * et marque le tableau comme lu (mark_board_read) tant qu'il est ouvert.
 *
 * @param {string} boardId
 */
export function useBoard(boardId) {
  const [board, setBoard] = useState(null)
  const [cards, setCards] = useState([])
  const [members, setMembers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState(null)
  const [userId, setUserId] = useState(null)

  // -------------------------------------------------------------------------
  // 1. Utilisateur courant
  // -------------------------------------------------------------------------
  useEffect(() => {
    let mounted = true
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setUserId(data?.user?.id ?? null)
    })
    return () => { mounted = false }
  }, [])

  // -------------------------------------------------------------------------
  // 2. Fetch du tableau + cartes (avec compteurs) + membres
  // -------------------------------------------------------------------------
  const fetchBoard = useCallback(async () => {
    if (!boardId) return

    setError(null)

    try {
      const { data, error: fetchError } = await supabase
        .from('discussion_boards')
        .select(`
          id, title, description, color, created_by, archived, created_at,
          members:discussion_board_members(user_id, role, last_read_at),
          cards:discussion_cards(
            id, board_id, title, description, status, archived,
            created_by, closed_by, closed_at, created_at, last_activity_at,
            messages:discussion_messages(id, author_id, body, created_at),
            reads:discussion_card_reads(last_read_at)
          )
        `)
        .eq('id', boardId)
        .maybeSingle()

      if (fetchError) throw fetchError

      if (!data) {
        setBoard(null)
        setCards([])
        setMembers([])
        setNotFound(true)
        return
      }

      setNotFound(false)

      setBoard({
        id: data.id,
        title: data.title,
        description: data.description,
        color: data.color,
        createdBy: data.created_by,
        archived: data.archived,
        createdAt: data.created_at,
      })

      setMembers(
        (data.members || []).map((m) => ({
          userId: m.user_id,
          role: m.role,
          lastReadAt: m.last_read_at,
        }))
      )

      const enrichedCards = (data.cards || [])
        .filter((c) => !c.archived)
        .map((c) => {
          const msgs = c.messages || []

          // discussion_card_reads est filtre par la RLS sur auth.uid() :
          // l'embed ne renvoie donc que la ligne de lecture de l'utilisateur.
          const myReadAt = c.reads?.[0]?.last_read_at
          const myReadMs = myReadAt ? new Date(myReadAt).getTime() : 0

          // Non-lus : messages des autres, posterieurs a ma derniere lecture.
          const unreadCount = msgs.filter(
            (m) =>
              m.author_id !== userId &&
              new Date(m.created_at).getTime() > myReadMs
          ).length

          // Dernier message, pour l'apercu sur la tile.
          let lastMessage = null
          if (msgs.length > 0) {
            const last = msgs.reduce((a, b) =>
              new Date(a.created_at).getTime() >= new Date(b.created_at).getTime()
                ? a
                : b
            )
            lastMessage = {
              authorId: last.author_id,
              body: last.body,
              createdAt: last.created_at,
            }
          }

          return {
            id: c.id,
            boardId: c.board_id,
            title: c.title,
            description: c.description,
            status: c.status,
            archived: c.archived,
            createdBy: c.created_by,
            closedBy: c.closed_by,
            closedAt: c.closed_at,
            createdAt: c.created_at,
            lastActivityAt: c.last_activity_at,
            messagesCount: msgs.length,
            unreadCount,
            lastMessage,
          }
        })
        .sort(
          (a, b) =>
            new Date(b.lastActivityAt).getTime() -
            new Date(a.lastActivityAt).getTime()
        )

      setCards(enrichedCards)
    } catch (err) {
      console.error('[useBoard] fetchBoard error:', err)
      setError(err)
    } finally {
      setIsLoading(false)
    }
  }, [boardId, userId])

  // -------------------------------------------------------------------------
  // 3. Reset + fetch initial quand boardId change
  // -------------------------------------------------------------------------
  useEffect(() => {
    setIsLoading(true)
    setNotFound(false)
    setError(null)
    setBoard(null)
    setCards([])
    setMembers([])
  }, [boardId])

  useEffect(() => {
    if (boardId) fetchBoard()
  }, [boardId, fetchBoard])

  // -------------------------------------------------------------------------
  // 4. Realtime : refetch sur changement des cartes de ce tableau
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!boardId) return undefined

    const channel = supabase
      .channel(`discussion_board_${boardId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'discussion_cards',
          filter: `board_id=eq.${boardId}`,
        },
        () => fetchBoard()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [boardId, fetchBoard])

  // -------------------------------------------------------------------------
  // 5. Marquage lu du tableau : eteint le point colore de la tile
  // -------------------------------------------------------------------------
  const markBoardRead = useCallback(async () => {
    if (!boardId || !userId) return
    try {
      await supabase.rpc('mark_board_read', { p_board_id: boardId })
    } catch (err) {
      // Non bloquant : un echec de marquage n'empeche pas de consulter.
      console.error('[useBoard] markBoardRead error:', err)
    }
  }, [boardId, userId])

  useEffect(() => {
    // A l'ouverture du tableau et a chaque rafraichissement, on marque
    // le tableau lu (board_members.last_read_at).
    if (boardId && userId && board) markBoardRead()
  }, [boardId, userId, board, markBoardRead])

  // -------------------------------------------------------------------------
  // 6. Mutations sur les cartes
  // -------------------------------------------------------------------------

  const createCard = useCallback(async ({ title, description }) => {
    if (!userId) throw new Error('Utilisateur non connecte')
    if (!boardId) throw new Error('Tableau introuvable')
    const trimmedTitle = (title || '').trim()
    if (!trimmedTitle) throw new Error('Le titre est obligatoire')

    const { data, error: insertError } = await supabase
      .from('discussion_cards')
      .insert({
        board_id: boardId,
        title: trimmedTitle,
        description: description?.trim() || null,
        created_by: userId,
      })
      .select()
      .single()

    if (insertError) throw insertError
    await fetchBoard()
    return data
  }, [userId, boardId, fetchBoard])

  const updateCard = useCallback(async (cardId, { title, description } = {}) => {
    const patch = {}
    if (title !== undefined) {
      const trimmedTitle = (title || '').trim()
      if (!trimmedTitle) throw new Error('Le titre est obligatoire')
      patch.title = trimmedTitle
    }
    if (description !== undefined) {
      patch.description = description?.trim() || null
    }
    if (Object.keys(patch).length === 0) return

    const { error: updateError } = await supabase
      .from('discussion_cards')
      .update(patch)
      .eq('id', cardId)

    if (updateError) throw updateError
    await fetchBoard()
  }, [fetchBoard])

  const closeCard = useCallback(async (cardId) => {
    if (!userId) throw new Error('Utilisateur non connecte')
    const { error: closeError } = await supabase
      .from('discussion_cards')
      .update({
        status: 'closed',
        closed_by: userId,
        closed_at: new Date().toISOString(),
      })
      .eq('id', cardId)

    if (closeError) throw closeError
    await fetchBoard()
  }, [userId, fetchBoard])

  const reopenCard = useCallback(async (cardId) => {
    const { error: reopenError } = await supabase
      .from('discussion_cards')
      .update({ status: 'open', closed_by: null, closed_at: null })
      .eq('id', cardId)

    if (reopenError) throw reopenError
    await fetchBoard()
  }, [fetchBoard])

  const archiveCard = useCallback(async (cardId) => {
    const { error: archiveError } = await supabase
      .from('discussion_cards')
      .update({ archived: true })
      .eq('id', cardId)

    if (archiveError) throw archiveError
    await fetchBoard()
  }, [fetchBoard])

  const deleteCard = useCallback(async (cardId) => {
    const { error: deleteError } = await supabase
      .from('discussion_cards')
      .delete()
      .eq('id', cardId)

    if (deleteError) throw deleteError
    await fetchBoard()
  }, [fetchBoard])

  // -------------------------------------------------------------------------
  // 7. Mutations sur le tableau
  // -------------------------------------------------------------------------

  const updateBoard = useCallback(async ({ title, description, color } = {}) => {
    if (!boardId) throw new Error('Tableau introuvable')
    const patch = {}
    if (title !== undefined) {
      const trimmedTitle = (title || '').trim()
      if (!trimmedTitle) throw new Error('Le titre est obligatoire')
      patch.title = trimmedTitle
    }
    if (description !== undefined) {
      patch.description = description?.trim() || null
    }
    if (color !== undefined) {
      patch.color = color
    }
    if (Object.keys(patch).length === 0) return

    const { error: updateError } = await supabase
      .from('discussion_boards')
      .update(patch)
      .eq('id', boardId)

    if (updateError) throw updateError
    await fetchBoard()
  }, [boardId, fetchBoard])

  const archiveBoard = useCallback(async () => {
    if (!boardId) throw new Error('Tableau introuvable')
    const { error: archiveError } = await supabase
      .from('discussion_boards')
      .update({ archived: true })
      .eq('id', boardId)

    if (archiveError) throw archiveError
    await fetchBoard()
  }, [boardId, fetchBoard])

  const unarchiveBoard = useCallback(async () => {
    if (!boardId) throw new Error('Tableau introuvable')
    const { error: unarchiveError } = await supabase
      .from('discussion_boards')
      .update({ archived: false })
      .eq('id', boardId)

    if (unarchiveError) throw unarchiveError
    await fetchBoard()
  }, [boardId, fetchBoard])

  const deleteBoard = useCallback(async () => {
    if (!boardId) throw new Error('Tableau introuvable')
    const { error: deleteError } = await supabase
      .from('discussion_boards')
      .delete()
      .eq('id', boardId)

    if (deleteError) throw deleteError
  }, [boardId])

  return {
    board,
    cards,
    members,
    isLoading,
    notFound,
    error,
    userId,
    refetch: fetchBoard,
    createCard,
    updateCard,
    closeCard,
    reopenCard,
    archiveCard,
    deleteCard,
    updateBoard,
    archiveBoard,
    unarchiveBoard,
    deleteBoard,
  }
}
