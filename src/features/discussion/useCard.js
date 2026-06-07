import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import {
  uploadAttachmentFile,
  removeAttachmentFile,
  validateAttachmentFile,
} from './discussionStorage'
import { notifyUsers } from '../../lib/notify'

/**
 * Hook de la vue d'une carte de discussion (etapes 7C + 7D).
 *
 * Charge une carte precise, son tableau parent (pour la couleur et les
 * permissions), son fil de messages et ses pieces jointes. Expose les
 * mutations sur les messages, sur la carte et sur les pieces jointes,
 * s'abonne au Realtime, et marque la carte comme lue (discussion_card_reads)
 * tant que l'utilisateur la consulte.
 *
 * La RLS Supabase filtre cote serveur : si l'utilisateur n'est pas membre
 * du tableau de la carte, la requete renvoie 0 ligne -> notFound = true.
 *
 * Le hook ne charge PAS les profils (auteurs de messages, uploadeurs de
 * pieces jointes) : le composant conteneur croise les identifiants avec
 * useMedecins().
 *
 * @param {string} cardId - identifiant de la carte a charger
 */
export function useCard(cardId) {
  const [card, setCard] = useState(null)
  const [board, setBoard] = useState(null)
  const [messages, setMessages] = useState([])
  const [attachments, setAttachments] = useState([])
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

  // -------------------------------------------------------------------------
  // 4. Fetch des pieces jointes de la carte
  // -------------------------------------------------------------------------
  const fetchAttachments = useCallback(async () => {
    if (!cardId) return

    try {
      const { data, error: fetchError } = await supabase
        .from('discussion_attachments')
        .select(
          'id, card_id, storage_path, filename, size_bytes, mime_type, uploaded_by, uploaded_at'
        )
        .eq('card_id', cardId)
        .order('uploaded_at', { ascending: true })

      if (fetchError) throw fetchError

      setAttachments(
        (data || []).map((a) => ({
          id: a.id,
          cardId: a.card_id,
          storagePath: a.storage_path,
          filename: a.filename,
          sizeBytes: a.size_bytes,
          mimeType: a.mime_type,
          uploadedBy: a.uploaded_by,
          uploadedAt: a.uploaded_at,
        }))
      )
    } catch (err) {
      console.error('[useCard] fetchAttachments error:', err)
      setError(err)
    }
  }, [cardId])

  const refetch = useCallback(
    () => Promise.all([fetchCard(), fetchMessages(), fetchAttachments()]),
    [fetchCard, fetchMessages, fetchAttachments]
  )

  // -------------------------------------------------------------------------
  // 5. Reset + fetch initial quand cardId change
  // -------------------------------------------------------------------------
  useEffect(() => {
    setIsLoading(true)
    setNotFound(false)
    setError(null)
    setCard(null)
    setBoard(null)
    setMessages([])
    setAttachments([])
  }, [cardId])

  useEffect(() => {
    if (!cardId) return undefined
    let cancelled = false
    ;(async () => {
      await Promise.all([fetchCard(), fetchMessages(), fetchAttachments()])
      if (!cancelled) setIsLoading(false)
    })()
    return () => { cancelled = true }
  }, [cardId, fetchCard, fetchMessages, fetchAttachments])

  // -------------------------------------------------------------------------
  // 6. Realtime : messages, carte, pieces jointes
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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'discussion_attachments',
          filter: `card_id=eq.${cardId}`,
        },
        () => fetchAttachments()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [cardId, fetchMessages, fetchCard, fetchAttachments])

  // Refetch quand l'app revient au premier plan (tap sur une notification,
  // retour depuis l'arriere-plan). Sur iOS, l'app est gelee en arriere-plan
  // et le Realtime peut manquer des messages : on recharge a la revisibilite.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') refetch()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [refetch])

  // -------------------------------------------------------------------------
  // 7. Marquage lu : last_read_at suit le dernier message visible
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
  // 8. Mutations sur les messages
  // -------------------------------------------------------------------------

  // Notifie les autres membres du tableau qu'un message a ete poste.
  // Fire-and-forget : ne bloque pas l'envoi, n'echoue jamais bruyamment.
  const notifyOtherMembers = useCallback(async (messageText) => {
    if (!board?.id || !userId) return
    try {
      const { data: members } = await supabase
        .from('discussion_board_members')
        .select('user_id')
        .eq('board_id', board.id)
      const recipients = (members || [])
        .map((m) => m.user_id)
        .filter((uid) => uid && uid !== userId)
      notifyUsers({
        userIds: recipients,
        title: board.title || 'Discussion',
        body: messageText.slice(0, 140),
        url: `/discussion/${board.id}/${cardId}`,
      })
    } catch (err) {
      console.error('[useCard] notifyOtherMembers error:', err)
    }
  }, [board?.id, board?.title, userId, cardId])

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

    // Notifier les autres membres (apres l'envoi reussi).
    notifyOtherMembers(trimmed)
  }, [userId, cardId, fetchMessages, notifyOtherMembers])

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
  // 9. Mutations sur la carte
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
   * Supprime durablement la carte (et, en cascade SQL, ses messages et
   * les lignes de ses pieces jointes). Ne refetch PAS : la carte n'existe
   * plus, c'est au conteneur de rediriger vers la vue du tableau.
   *
   * Note : les fichiers Storage des pieces jointes ne sont pas supprimes
   * par la cascade SQL (Supabase ne cascade pas le Storage). Ils deviennent
   * orphelins, mais inaccessibles (la policy de lecture exige une ligne en
   * base). Limitation connue, acceptable pour le volume d'un cabinet.
   */
  const deleteCard = useCallback(async () => {
    if (!cardId) throw new Error('Carte introuvable')

    const { error: deleteError } = await supabase
      .from('discussion_cards')
      .delete()
      .eq('id', cardId)

    if (deleteError) throw deleteError
  }, [cardId])

  // -------------------------------------------------------------------------
  // 10. Mutations sur les pieces jointes
  // -------------------------------------------------------------------------

  /**
   * Ajoute une piece jointe a la carte.
   *
   * Sequence : validation (extension + taille) -> upload du fichier dans
   * le bucket Storage -> insertion de la ligne en base. Si l'insertion
   * echoue, le fichier qui vient d'etre uploade est retire pour ne pas
   * laisser d'orphelin.
   *
   * @param {File} file
   */
  const addAttachment = useCallback(async (file) => {
    if (!userId) throw new Error('Utilisateur non connecte')
    if (!cardId) throw new Error('Carte introuvable')

    // Validation cote application (leve une Error lisible si refuse).
    validateAttachmentFile(file)

    // 1. Upload du fichier dans le bucket.
    const { storagePath } = await uploadAttachmentFile(cardId, file)

    // 2. Insertion de la ligne ; rollback du fichier si elle echoue.
    try {
      const { error: insertError } = await supabase
        .from('discussion_attachments')
        .insert({
          card_id: cardId,
          storage_path: storagePath,
          filename: file.name,
          size_bytes: file.size,
          mime_type: file.type || null,
          uploaded_by: userId,
        })
      if (insertError) throw insertError
    } catch (err) {
      try {
        await removeAttachmentFile(storagePath)
      } catch (cleanupErr) {
        console.error('[useCard] addAttachment cleanup error:', cleanupErr)
      }
      throw err
    }

    await fetchAttachments()
  }, [userId, cardId, fetchAttachments])

  /**
   * Supprime une piece jointe. La RLS n'autorise que celui qui l'a uploadee.
   *
   * Sequence : suppression du fichier Storage PUIS de la ligne en base.
   * La policy Storage de suppression exige que la ligne existe encore,
   * d'ou cet ordre.
   *
   * @param {{ id: string, storagePath: string }} attachment
   */
  const deleteAttachment = useCallback(async (attachment) => {
    if (!attachment?.id || !attachment?.storagePath) {
      throw new Error('Piece jointe invalide')
    }

    // 1. Fichier Storage (la ligne en base doit encore exister).
    await removeAttachmentFile(attachment.storagePath)

    // 2. Ligne en base.
    const { error: deleteError } = await supabase
      .from('discussion_attachments')
      .delete()
      .eq('id', attachment.id)

    if (deleteError) throw deleteError
    await fetchAttachments()
  }, [fetchAttachments])

  return {
    // Etat
    card,
    board,
    messages,
    attachments,
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
    // Mutations pieces jointes
    addAttachment,
    deleteAttachment,
  }
}
