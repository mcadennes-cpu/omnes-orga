import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

/**
 * Hook du sondage d'une carte de discussion (etape 16 ter).
 *
 * Charge le sondage rattache a une carte (0 ou 1), ses options et ses votes,
 * puis expose les mutations de gestion (creer / editer / cloturer / supprimer)
 * et de vote (voter / changer / retirer).
 *
 * Pas de Realtime en V1 (comme le sondage Evenements) : on refetch apres
 * chaque mutation, avec optimistic UI sur le vote. Comme useCard, ce hook
 * ne charge PAS les profils des votants : le conteneur croise les user_id
 * avec useMedecins() pour afficher les noms (vote nominatif).
 *
 * @param {string} cardId - carte parente
 * @param {string} userId - utilisateur courant (fourni par useCard)
 */
export function usePoll(cardId, userId) {
  const [poll, setPoll] = useState(null)
  const [options, setOptions] = useState([])
  const [votes, setVotes] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  // -------------------------------------------------------------------------
  // Chargement : sondage, puis (s'il existe) ses options et ses votes.
  // Le fetch est sequentiel car options/votes dependent de l'id du sondage.
  // -------------------------------------------------------------------------
  const load = useCallback(async () => {
    if (!cardId) return
    setError(null)
    try {
      const { data: pollRow, error: pErr } = await supabase
        .from('discussion_polls')
        .select('id, card_id, question, closed, created_by, created_at')
        .eq('card_id', cardId)
        .maybeSingle()
      if (pErr) throw pErr

      if (!pollRow) {
        setPoll(null)
        setOptions([])
        setVotes([])
        return
      }

      setPoll({
        id: pollRow.id,
        cardId: pollRow.card_id,
        question: pollRow.question,
        closed: pollRow.closed,
        createdBy: pollRow.created_by,
        createdAt: pollRow.created_at,
      })

      const [{ data: opts, error: oErr }, { data: vts, error: vErr }] =
        await Promise.all([
          supabase
            .from('discussion_poll_options')
            .select('id, poll_id, label, position')
            .eq('poll_id', pollRow.id)
            .order('position', { ascending: true }),
          supabase
            .from('discussion_poll_votes')
            .select('id, poll_id, option_id, user_id, created_at')
            .eq('poll_id', pollRow.id),
        ])
      if (oErr) throw oErr
      if (vErr) throw vErr

      setOptions(
        (opts || []).map((o) => ({
          id: o.id,
          pollId: o.poll_id,
          label: o.label,
          position: o.position,
        }))
      )
      setVotes(
        (vts || []).map((v) => ({
          id: v.id,
          pollId: v.poll_id,
          optionId: v.option_id,
          userId: v.user_id,
          createdAt: v.created_at,
        }))
      )
    } catch (err) {
      console.error('[usePoll] load error:', err)
      setError(err)
    }
  }, [cardId])

  const refetch = useCallback(() => load(), [load])

  // Reset quand on change de carte.
  useEffect(() => {
    setIsLoading(true)
    setPoll(null)
    setOptions([])
    setVotes([])
    setError(null)
  }, [cardId])

  // Chargement initial.
  useEffect(() => {
    if (!cardId) {
      setIsLoading(false)
      return undefined
    }
    let cancelled = false
    ;(async () => {
      await load()
      if (!cancelled) setIsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [cardId, load])

  // -------------------------------------------------------------------------
  // Mutations de gestion (reservees a canManagePoll cote UI ; la RLS verifie).
  // -------------------------------------------------------------------------

  /**
   * Cree le sondage de la carte avec sa question et ses options.
   * Sequence : INSERT sondage -> INSERT options. Si les options echouent,
   * on supprime le sondage pour ne pas laisser un sondage vide (inutilisable).
   *
   * @param {{ question: string, options: string[] }} args
   */
  const createPoll = useCallback(
    async ({ question, options: labels }) => {
      if (!userId) throw new Error('Utilisateur non connecte')
      if (!cardId) throw new Error('Carte introuvable')
      const q = (question || '').trim()
      if (!q) throw new Error('La question est obligatoire')
      const cleanLabels = (labels || []).map((l) => (l || '').trim()).filter(Boolean)
      if (cleanLabels.length < 2) throw new Error('Ajoutez au moins deux options')

      const { data: pollRow, error: pErr } = await supabase
        .from('discussion_polls')
        .insert({ card_id: cardId, question: q, created_by: userId })
        .select('id')
        .single()
      if (pErr) throw pErr

      const rows = cleanLabels.map((label, i) => ({
        poll_id: pollRow.id,
        label,
        position: i,
      }))
      const { error: oErr } = await supabase.from('discussion_poll_options').insert(rows)
      if (oErr) {
        // Rollback du sondage orphelin.
        await supabase.from('discussion_polls').delete().eq('id', pollRow.id)
        throw oErr
      }

      await load()
    },
    [userId, cardId, load]
  )

  /** Modifie la question. */
  const updatePoll = useCallback(
    async ({ question }) => {
      if (!poll) throw new Error('Aucun sondage')
      const q = (question || '').trim()
      if (!q) throw new Error('La question est obligatoire')
      const { error: e } = await supabase
        .from('discussion_polls')
        .update({ question: q })
        .eq('id', poll.id)
      if (e) throw e
      await load()
    },
    [poll, load]
  )

  const setPollClosed = useCallback(
    async (closed) => {
      if (!poll) throw new Error('Aucun sondage')
      const { error: e } = await supabase
        .from('discussion_polls')
        .update({ closed })
        .eq('id', poll.id)
      if (e) throw e
      await load()
    },
    [poll, load]
  )
  const closePoll = useCallback(() => setPollClosed(true), [setPollClosed])
  const reopenPoll = useCallback(() => setPollClosed(false), [setPollClosed])

  /** Supprime le sondage (cascade SQL sur options + votes). */
  const deletePoll = useCallback(async () => {
    if (!poll) throw new Error('Aucun sondage')
    const { error: e } = await supabase.from('discussion_polls').delete().eq('id', poll.id)
    if (e) throw e
    await load()
  }, [poll, load])

  // -------------------------------------------------------------------------
  // Mutations de vote (optimistic UI : on met a jour l'etat local avant la
  // confirmation serveur, et on restaure en cas d'echec).
  // -------------------------------------------------------------------------

  /** Vote (ou change de vote) pour une option. Upsert sur (poll_id, user_id). */
  const castVote = useCallback(
    async (optionId) => {
      if (!userId) throw new Error('Utilisateur non connecte')
      if (!poll) throw new Error('Aucun sondage')
      if (!optionId) throw new Error('Option invalide')

      const previous = votes
      setVotes((cur) => [
        ...cur.filter((v) => v.userId !== userId),
        {
          id: `optimistic-${userId}`,
          pollId: poll.id,
          optionId,
          userId,
          createdAt: new Date().toISOString(),
        },
      ])

      try {
        const { error: e } = await supabase
          .from('discussion_poll_votes')
          .upsert(
            { poll_id: poll.id, option_id: optionId, user_id: userId },
            { onConflict: 'poll_id,user_id' }
          )
        if (e) throw e
        await load()
      } catch (err) {
        setVotes(previous)
        throw err
      }
    },
    [userId, poll, votes, load]
  )

  /** Retire son propre vote. */
  const clearVote = useCallback(async () => {
    if (!userId) throw new Error('Utilisateur non connecte')
    if (!poll) throw new Error('Aucun sondage')

    const previous = votes
    setVotes((cur) => cur.filter((v) => v.userId !== userId))

    try {
      const { error: e } = await supabase
        .from('discussion_poll_votes')
        .delete()
        .eq('poll_id', poll.id)
        .eq('user_id', userId)
      if (e) throw e
      await load()
    } catch (err) {
      setVotes(previous)
      throw err
    }
  }, [userId, poll, votes, load])

  // -------------------------------------------------------------------------
  // Valeurs derivees (recalculees a chaque rendu, volume minuscule).
  // -------------------------------------------------------------------------
  const myOptionId = userId
    ? votes.find((v) => v.userId === userId)?.optionId ?? null
    : null
  const totalVotes = votes.length
  const voteCounts = options.reduce((acc, o) => {
    acc[o.id] = votes.filter((v) => v.optionId === o.id).length
    return acc
  }, {})

  return {
    // Etat
    poll,
    hasPoll: Boolean(poll),
    options,
    votes,
    myOptionId,
    voteCounts,
    totalVotes,
    isLoading,
    error,
    // Rechargement
    refetch,
    // Gestion
    createPoll,
    updatePoll,
    closePoll,
    reopenPoll,
    deletePoll,
    // Vote
    castVote,
    clearVote,
  }
}
