import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

/**
 * Hook de la vue d'une carte de discussion (etape 7C).
 *
 * Charge une carte precise, son tableau parent (pour la couleur et les
 * permissions) et son fil de messages. Expose les mutations sur les
 * messages et sur la carte, s'abonne au Realtime, et marque la carte
 * comme lue (discussion_card_reads) tant que l'utilisateur la consulte.
 *
 * La RLS Supabase filtre cote serveur : si l'utilisateur n'est pas membre
 * du tableau de la carte, la requete renvoie 0 ligne -> notFound = true.
 *
 * Le hook ne charge PAS les profils des auteurs de messages : le composant
 * conteneur croisera les author_id avec useMedecins().
 *
 * @param {string} cardId - identifiant de la carte a charger
 */
export function useCard(cardId) {
  const [card, setCard] = useState(null)
  const [board, setBoard] = useState(null)
  const [messages, setMessages] = useState([])
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
  // 2. Fetch de la carte + son tableau parent
  // -------------------------------------------------------------------------
  const fetchCard = useCallback(async () => {
    if (!cardId) return

    setError(null)

    try {
      const { data, error: fetchError } = await supabase
        .from('discussion_cards')
        .select(`
          id, board_id, title, description, status, archived,
          created_by, closed_by, closed_at, created_at, last_activity_at,
          board:discussion_boards(
            id, title, description, color, created_by, archived, created_at
          )
        `)
        .eq('id', cardId)
        .maybeSingle()

      if (fetchError) throw fetchError

      // maybeSingle renvoie null si 0 ligne : carte inexistante ou
      // acces refuse par la RLS (utilisateur non membre du tableau).
      if (!data) {
        setCard(null)
        setBoard(null)
        setNotFound(true)
        return
      }

      setNotFound(false)

      setCard({
        id: data.id,
        boardId: data.board_id,
        title: data.title,
        description: data.description,
        status: data.status,
        archived: data.archived,
        createdBy: data.created_by,
        closedBy: data.closed_by,
        closedAt: data.closed_at,
        createdAt: data.created_at,
        lastActivityAt: data.last_activity_at,
      })

      if (data.board) {
        setBoard({
          id: data.board.id,
          title: data.board.title,
          description: data.board.description,
          color: data.board.color,
          createdBy: data.board.created_by,
          archived: data.board.archived,
          createdAt: data.board.created_at,
        })
      }
    } catch (err) {
      console.error('[useCard] fetchCard error:', err)
      setError(err)
    }
  }, [cardId])

  // -------------------------------------------------------------------------
  // 3. Fetch du fil de messages
  // -------------------------------------------------------------------------
  const fetchMessages = useCallback(async () => {
    if (!cardId) return

    try {
      const { data, error: fetchError } = await supabase
        .from('discussion_messages')
        .select('id, card_id, author_id, body, edited_at, created_at')
        .eq('card_id', cardId)
        .order('created_at', { ascending: true })

      if (fetchError) throw fetchError

      setMessages(
        (data || []).map((m) => ({
          id: m.id,
          cardId: m.card_id,
          authorId: m.author_id,
          body: m.body,
          editedAt: m.edited_at,
          createdAt: m.created_at,
        }))
      )
    } catch (err) {
      console.error('[useCard] fetchMessages error:', err)
      setError(err)
    }
  }, [cardId])

  const refetch = useCallback(
    () => Promise.all([fetchCard(), fetchMessages()]),
    [fetchCard, fetchMessages]
  )

  // -------------------------------------------------------------------------
  // 4. Reset + fetch initial quand cardId change
  // -------------------------------------------------------------------------
  useEffect(() => {
    setIsLoading(true)
    setNotFound(false)
    setError(null)
    setCard(null)
    setBoard(null)
    setMessages([])
  }, [cardId])

  useEffect(() => {
    if (!cardId) return undefined
    let cancelled = false
    ;(async () => {
      await Promise.all([fetchCard(), fetchMessages()])
      if (!cancelled) setIsLoading(false)
    })()
    return () => { cancelled = true }
  }, [cardId, fetchCard, fetchMessages])

  // -------------------------------------------------------------------------
  // 5. Realtime : messages (chat) et carte (statut, titre...)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!cardId) return undefined

    const channel = supabase
      .channel(`discussion_card_${cardId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'discussion_messages',
          filter: `card_id=eq.${cardId}`,
        },
        () => fetchMessages()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'discussion_cards',
          filter: `id=eq.${cardId}`,
        },
        () => fetchCard()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [cardId, fetchMessages, fetchCard])

  // -------------------------------------------------------------------------
  // 6. Marquage lu : last_read_at suit le dernier message visible
  // -------------------------------------------------------------------------
  const markCardRead = useCallback(async () => {
    if (!cardId || !userId) return
    try {
      await supabase
        .from('discussion_card_reads')
        .upsert(
          {
            card_id: cardId,
            user_id: userId,
            last_read_at: new Date().toISOString(),
          },
          { onConflict: 'card_id,user_id' }
        )
    } catch (err) {
      // Non bloquant : un echec de marquage n'empeche pas de lire la carte.
      console.error('[useCard] markCardRead error:', err)
    }
  }, [cardId, userId])

  useEffect(() => {
    // A l'ouverture puis a chaque changement du fil : on marque la carte
    // lue, pour que le compteur "non-lu" (vue tableau) reste a jour.
    if (cardId && userId) markCardRead()
  }, [cardId, userId, messages, markCardRead])

  // -------------------------------------------------------------------------
  // 7. Mutations sur les messages
  // -------------------------------------------------------------------------

  /**
   * Poste un message dans le fil de la carte.
   * @param {string} body - texte du message
   */
  const sendMessage = useCallback(async (body) => {
    if (!userId) throw new Error('Utilisateur non connecte')
    if (!cardId) throw new Error('Carte introuvable')
    const trimmed = (body || '').trim()
    if (!trimmed) throw new Error('Le message est vide')

    const { error: insertError } = await supabase
      .from('discussion_messages')
      .insert({ card_id: cardId, author_id: userId, body: trimmed })

    if (insertError) throw insertError
    await fetchMessages()
  }, [userId, cardId, fetchMessages])

  /**
   * Modifie le texte d'un message. La RLS n'autorise que son auteur.
   */
  const editMessage = useCallback(async (messageId, body) => {
    const trimmed = (body || '').trim()
    if (!trimmed) throw new Error('Le message est vide')

    const { error: updateError } = await supabase
      .from('discussion_messages')
      .update({ body: trimmed, edited_at: new Date().toISOString() })
      .eq('id', messageId)

    if (updateError) throw updateError
    await fetchMessages()
  }, [fetchMessages])

  /**
   * Supprime un message. La RLS n'autorise que son auteur.
   */
  const deleteMessage = useCallback(async (messageId) => {
    const { error: deleteError } = await supabase
      .from('discussion_messages')
      .delete()
      .eq('id', messageId)

    if (deleteError) throw deleteError
    await fetchMessages()
  }, [fetchMessages])

  // -------------------------------------------------------------------------
  // 8. Mutations sur la carte
  // -------------------------------------------------------------------------

  /**
   * Met a jour le titre et/ou la description de la carte.
   * @param {{ title?: string, description?: string }} patch
   */
  const updateCard = useCallback(async ({ title, description } = {}) => {
    if (!cardId) throw new Error('Carte introuvable')
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
    await fetchCard()
  }, [cardId, fetchCard])

  /**
   * Cloture la carte (statut closed + tracabilite). Le chat passe alors
   * en lecture seule, cote UI comme cote RLS.
   */
  const closeCard = useCallback(async () => {
    if (!userId) throw new Error('Utilisateur non connecte')
    if (!cardId) throw new Error('Carte introuvable')

    const { error: closeError } = await supabase
      .from('discussion_cards')
      .update({
        status: 'closed',
        closed_by: userId,
        closed_at: new Date().toISOString(),
      })
      .eq('id', cardId)

    if (closeError) throw closeError
    await fetchCard()
  }, [userId, cardId, fetchCard])

  /**
   * Reouvre une carte close.
   */
  const reopenCard = useCallback(async () => {
    if (!cardId) throw new Error('Carte introuvable')

    const { error: reopenError } = await supabase
      .from('discussion_cards')
      .update({ status: 'open', closed_by: null, closed_at: null })
      .eq('id', cardId)

    if (reopenError) throw reopenError
    await fetchCard()
  }, [cardId, fetchCard])

  /**
   * Supprime durablement la carte (et, en cascade SQL, ses messages).
   * Ne refetch PAS : la carte n'existe plus, c'est au conteneur de
   * rediriger vers la vue du tableau.
   */
  const deleteCard = useCallback(async () => {
    if (!cardId) throw new Error('Carte introuvable')

    const { error: deleteError } = await supabase
      .from('discussion_cards')
      .delete()
      .eq('id', cardId)

    if (deleteError) throw deleteError
  }, [cardId])

  return {
    // Etat
    card,
    board,
    messages,
    isLoading,
    notFound,
    error,
    userId,
    // Rechargement manuel
    refetch,
    // Mutations messages
    sendMessage,
    editMessage,
    deleteMessage,
    // Mutations carte
    updateCard,
    closeCard,
    reopenCard,
    deleteCard,
  }
}
