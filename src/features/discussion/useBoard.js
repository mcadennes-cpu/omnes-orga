import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

/**
 * Hook de la vue d'un tableau de discussion (etape 7B).
 *
 * Charge un tableau precis, ses cartes (non archivees) et la liste de ses
 * membres, puis expose les mutations sur les cartes et sur le tableau.
 * S'abonne au Realtime des cartes pour refleter en direct les ajouts /
 * modifications faits par d'autres utilisateurs.
 *
 * La RLS Supabase filtre cote serveur : si l'utilisateur n'est pas membre
 * du tableau, la requete renvoie 0 ligne -> on expose notFound = true.
 *
 * Note : le hook ne charge PAS les profils des membres (prenom / nom).
 * Il renvoie seulement les identifiants ; le composant conteneur croise
 * ces identifiants avec useMedecins() pour obtenir les profils complets.
 *
 * Note : le marquage lu / non-lu (discussion_board_members.last_read_at et
 * discussion_card_reads) n'est PAS gere ici. Il fera l'objet de l'etape 7C.
 *
 * @param {string} boardId - identifiant du tableau a charger
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
  // 1. Utilisateur courant (necessaire pour les mutations)
  // -------------------------------------------------------------------------
  useEffect(() => {
    let mounted = true
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setUserId(data?.user?.id ?? null)
    })
    return () => { mounted = false }
  }, [])

  // -------------------------------------------------------------------------
  // 2. Fetch du tableau + cartes + membres en une requete
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
            created_by, closed_by, closed_at, created_at, last_activity_at
          )
        `)
        .eq('id', boardId)
        .maybeSingle()

      if (fetchError) throw fetchError

      // maybeSingle renvoie null si 0 ligne : tableau inexistant ou
      // acces refuse par la RLS (utilisateur non membre).
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
        .map((c) => ({
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
        }))
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
  }, [boardId])

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
  // 5. Mutations sur les cartes
  // -------------------------------------------------------------------------

  /**
   * Cree une carte dans le tableau courant.
   * @param {{ title: string, description?: string }} payload
   */
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

  /**
   * Met a jour le titre et/ou la description d'une carte.
   * Passer une cle a undefined pour ne pas la modifier.
   * @param {string} cardId
   * @param {{ title?: string, description?: string }} patch
   */
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

  /**
   * Cloture une carte : statut closed + tracabilite (closed_by / closed_at).
   * Le chat d'une carte close passe en lecture seule (gere en 7C).
   */
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

  /**
   * Reouvre une carte close : statut open, on efface closed_by / closed_at.
   */
  const reopenCard = useCallback(async (cardId) => {
    const { error: reopenError } = await supabase
      .from('discussion_cards')
      .update({
        status: 'open',
        closed_by: null,
        closed_at: null,
      })
      .eq('id', cardId)

    if (reopenError) throw reopenError
    await fetchBoard()
  }, [fetchBoard])

  /**
   * Archive une carte : elle disparait de la liste du tableau.
   * Non destructif, contrairement a deleteCard.
   */
  const archiveCard = useCallback(async (cardId) => {
    const { error: archiveError } = await supabase
      .from('discussion_cards')
      .update({ archived: true })
      .eq('id', cardId)

    if (archiveError) throw archiveError
    await fetchBoard()
  }, [fetchBoard])

  /**
   * Supprime durablement une carte (et, en cascade SQL, ses messages
   * et pieces jointes). Action definitive.
   */
  const deleteCard = useCallback(async (cardId) => {
    const { error: deleteError } = await supabase
      .from('discussion_cards')
      .delete()
      .eq('id', cardId)

    if (deleteError) throw deleteError
    await fetchBoard()
  }, [fetchBoard])

  // -------------------------------------------------------------------------
  // 6. Mutations sur le tableau
  // -------------------------------------------------------------------------

  /**
   * Met a jour les metadonnees du tableau (titre, description, couleur).
   * Passer une cle a undefined pour ne pas la modifier.
   * @param {{ title?: string, description?: string, color?: string }} patch
   */
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

  /**
   * Archive le tableau (le masque de la liste principale).
   * On refetch pour que board.archived passe a true : le conteneur
   * peut alors afficher un bandeau "tableau archive".
   */
  const archiveBoard = useCallback(async () => {
    if (!boardId) throw new Error('Tableau introuvable')
    const { error: archiveError } = await supabase
      .from('discussion_boards')
      .update({ archived: true })
      .eq('id', boardId)

    if (archiveError) throw archiveError
    await fetchBoard()
  }, [boardId, fetchBoard])

  /**
   * Desarchive le tableau (le restaure dans la liste principale).
   */
  const unarchiveBoard = useCallback(async () => {
    if (!boardId) throw new Error('Tableau introuvable')
    const { error: unarchiveError } = await supabase
      .from('discussion_boards')
      .update({ archived: false })
      .eq('id', boardId)

    if (unarchiveError) throw unarchiveError
    await fetchBoard()
  }, [boardId, fetchBoard])

  /**
   * Supprime durablement le tableau (super_admin uniquement, applique
   * par la RLS). Ne refetch PAS : le tableau n'existe plus, c'est au
   * conteneur de rediriger vers /discussion apres succes.
   */
  const deleteBoard = useCallback(async () => {
    if (!boardId) throw new Error('Tableau introuvable')
    const { error: deleteError } = await supabase
      .from('discussion_boards')
      .delete()
      .eq('id', boardId)

    if (deleteError) throw deleteError
  }, [boardId])

  return {
    // Etat
    board,
    cards,
    members,
    isLoading,
    notFound,
    error,
    userId,
    // Rechargement manuel
    refetch: fetchBoard,
    // Mutations cartes
    createCard,
    updateCard,
    closeCard,
    reopenCard,
    archiveCard,
    deleteCard,
    // Mutations tableau
    updateBoard,
    archiveBoard,
    unarchiveBoard,
    deleteBoard,
  }
}
