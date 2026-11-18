import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { notifyUsers, nomExpediteur, titreNotif } from '../../lib/notify'

/** Nombre maximum d'options d'un sondage (creation + ajout apres coup). */
export const POLL_OPTIONS_MAX = 20

/**
 * Hook du sondage d'une carte de discussion (etape 16 ter).
 *
 * Charge le sondage rattache a une carte (0 ou 1), ses options et ses votes,
 * puis expose les mutations de gestion (creer / editer / cloturer / supprimer)
 * et de vote (voter / changer / retirer).
 *
 * Etape 16 quater : un sondage peut etre a choix multiple (poll.multiple). Une ligne
 * de vote = une option cochee par une personne ; en choix unique, la base
 * garantit qu'il n'y en a qu'une par personne (declencheur 16quater-1).
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
        .select('id, card_id, question, multiple, closed, created_by, created_at')
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
        multiple: pollRow.multiple,
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
   * @param {{ question: string, options: string[], multiple?: boolean }} args
   */
  const createPoll = useCallback(
    async ({ question, options: labels, multiple = false }) => {
      if (!userId) throw new Error('Utilisateur non connecte')
      if (!cardId) throw new Error('Carte introuvable')
      const q = (question || '').trim()
      if (!q) throw new Error('La question est obligatoire')
      const cleanLabels = (labels || []).map((l) => (l || '').trim()).filter(Boolean)
      if (cleanLabels.length < 2) throw new Error('Ajoutez au moins deux options')
      if (cleanLabels.length > POLL_OPTIONS_MAX) {
        throw new Error(`${POLL_OPTIONS_MAX} options au maximum`)
      }

      const { data: pollRow, error: pErr } = await supabase
        .from('discussion_polls')
        .insert({ card_id: cardId, question: q, multiple: Boolean(multiple), created_by: userId })
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

      // Notifie les autres membres du tableau qu'un sondage a ete cree.
      // Fire-and-forget : ne bloque pas, n'echoue jamais bruyamment.
      try {
        const { data: cardRow } = await supabase
          .from('discussion_cards')
          .select('board_id, title, board:discussion_boards(title)')
          .eq('id', cardId)
          .maybeSingle()
        const boardId = cardRow?.board_id
        if (boardId) {
          const { data: members } = await supabase
            .from('discussion_board_members')
            .select('user_id')
            .eq('board_id', boardId)
          const recipients = (members || [])
            .map((m) => m.user_id)
            .filter((uid) => uid && uid !== userId)
          const nom = await nomExpediteur(userId)
          notifyUsers({
            userIds: recipients,
            title: titreNotif(cardRow?.board?.title || 'Discussion', cardRow?.title),
            body: nom
              ? `${nom} a lancé un sondage : ${q}`.slice(0, 140)
              : `Nouveau sondage : ${q}`.slice(0, 140),
            url: `/discussion/${boardId}/${cardId}`,
          })
        }
      } catch (err) {
        console.error('[usePoll] notify sondage error:', err)
      }
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

  /**
   * Passe un sondage a choix unique en choix multiple. Les votes deja donnes
   * restent valables. Le retour en arriere n'est pas propose : la base le
   * refuse des que quelqu'un a coche plusieurs options.
   */
  const allowMultiple = useCallback(async () => {
    if (!poll) throw new Error('Aucun sondage')
    const { error: e } = await supabase
      .from('discussion_polls')
      .update({ multiple: true })
      .eq('id', poll.id)
    if (e) throw e
    await load()
  }, [poll, load])

  /**
   * Ajoute une ou plusieurs options a un sondage deja lance (ex. completer
   * les dates). Placees apres les options existantes. Sondage ouvert
   * uniquement (la RLS le verifie aussi).
   *
   * @param {string[]} labels
   */
  const addOptions = useCallback(
    async (labels) => {
      if (!poll) throw new Error('Aucun sondage')
      if (poll.closed) throw new Error('Le sondage est clôturé')
      const clean = (labels || []).map((l) => (l || '').trim()).filter(Boolean)
      if (clean.length === 0) throw new Error('Saisissez au moins une option')
      if (options.length + clean.length > POLL_OPTIONS_MAX) {
        throw new Error(`${POLL_OPTIONS_MAX} options au maximum`)
      }
      const start = options.reduce((max, o) => Math.max(max, o.position), -1) + 1
      const rows = clean.map((label, i) => ({
        poll_id: poll.id,
        label,
        position: start + i,
      }))
      const { error: e } = await supabase.from('discussion_poll_options').insert(rows)
      if (e) throw e
      await load()
    },
    [poll, options, load]
  )

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

  /**
   * Geste de vote sur une option.
   * - Choix unique : vote pour l'option (ou deplace son vote existant :
   *   UPDATE de la ligne plutot que DELETE + INSERT, pour ne jamais perdre
   *   le vote si la 2e requete echouait).
   * - Choix multiple : coche l'option, ou la decoche si elle l'etait deja.
   */
  const castVote = useCallback(
    async (optionId) => {
      if (!userId) throw new Error('Utilisateur non connecte')
      if (!poll) throw new Error('Aucun sondage')
      if (!optionId) throw new Error('Option invalide')

      const previous = votes
      const mine = votes.filter((v) => v.userId === userId)
      const alreadyChecked = mine.some((v) => v.optionId === optionId)
      const optimistic = {
        id: `optimistic-${userId}-${optionId}`,
        pollId: poll.id,
        optionId,
        userId,
        createdAt: new Date().toISOString(),
      }

      try {
        if (poll.multiple) {
          if (alreadyChecked) {
            setVotes((cur) =>
              cur.filter((v) => !(v.userId === userId && v.optionId === optionId))
            )
            const { error: e } = await supabase
              .from('discussion_poll_votes')
              .delete()
              .eq('poll_id', poll.id)
              .eq('user_id', userId)
              .eq('option_id', optionId)
            if (e) throw e
          } else {
            setVotes((cur) => [...cur, optimistic])
            const { error: e } = await supabase
              .from('discussion_poll_votes')
              .insert({ poll_id: poll.id, option_id: optionId, user_id: userId })
            if (e) throw e
          }
        } else {
          if (alreadyChecked) return
          setVotes((cur) => [...cur.filter((v) => v.userId !== userId), optimistic])
          if (mine.length > 0) {
            const { error: e } = await supabase
              .from('discussion_poll_votes')
              .update({ option_id: optionId })
              .eq('poll_id', poll.id)
              .eq('user_id', userId)
            if (e) throw e
          } else {
            const { error: e } = await supabase
              .from('discussion_poll_votes')
              .insert({ poll_id: poll.id, option_id: optionId, user_id: userId })
            if (e) throw e
          }
        }
        await load()
      } catch (err) {
        setVotes(previous)
        throw err
      }
    },
    [userId, poll, votes, load]
  )

  /** Retire toutes ses reponses au sondage. */
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
  const myOptionIds = userId
    ? votes.filter((v) => v.userId === userId).map((v) => v.optionId)
    : []
  // Nombre de PERSONNES qui ont repondu (en choix multiple, une personne
  // peut avoir plusieurs lignes de vote).
  const totalVoters = new Set(votes.map((v) => v.userId)).size
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
    myOptionIds,
    voteCounts,
    totalVoters,
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
    allowMultiple,
    addOptions,
    // Vote
    castVote,
    clearVote,
  }
}
