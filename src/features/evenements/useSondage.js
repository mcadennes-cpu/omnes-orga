import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'

const REPONSES_VALIDES = ['oui', 'non', 'peut_etre']

/**
 * Sondage de presence d'un evenement.
 * Charge les reponses (avec le profil du votant) et expose :
 * - myVote  : la reponse de l'utilisateur courant ou null
 * - counts  : { oui, non, peut_etre }, ajuste de maniere optimiste pendant
 *             qu'un vote est en cours d'enregistrement
 * - voters  : { oui: [...], non: [...], peut_etre: [...] } pour le detail
 * - vote(reponse) : enregistre / change sa reponse (upsert)
 *
 * Pas de Realtime : les reponses des autres se rafraichissent au prochain
 * chargement de la page detail.
 */
export function useSondage(evenementId) {
  const { user } = useAuth()
  const [reponses, setReponses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [pendingVote, setPendingVote] = useState(null)
  const [voting, setVoting] = useState(false)

  const refetch = useCallback(() => {
    setReloadKey((k) => k + 1)
  }, [])

  useEffect(() => {
    let active = true

    if (!evenementId) {
      setReponses([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    supabase
      .from('evenement_reponses')
      .select(
        'evenement_id, user_id, reponse, votant:profiles!user_id(prenom, nom)',
      )
      .eq('evenement_id', evenementId)
      .then(({ data, error: queryError }) => {
        if (!active) return
        if (queryError) {
          setReponses([])
          setError(queryError)
          setLoading(false)
          return
        }
        setReponses(data ?? [])
        setPendingVote(null) // les donnees fraiches font foi
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [evenementId, reloadKey])

  // Vote de l'utilisateur courant tel qu'enregistre en base
  const dataMyVote = useMemo(() => {
    if (!user) return null
    return reponses.find((r) => r.user_id === user.id)?.reponse ?? null
  }, [reponses, user])

  // Vote affiche : la valeur optimiste prime tant que l'upsert n'est pas fini
  const myVote = pendingVote ?? dataMyVote

  // Decompte par reponse, ajuste de maniere optimiste
  const counts = useMemo(() => {
    const c = { oui: 0, non: 0, peut_etre: 0 }
    for (const r of reponses) {
      if (c[r.reponse] !== undefined) c[r.reponse] += 1
    }
    if (pendingVote && pendingVote !== dataMyVote) {
      if (dataMyVote && c[dataMyVote] > 0) c[dataMyVote] -= 1
      c[pendingVote] += 1
    }
    return c
  }, [reponses, pendingVote, dataMyVote])

  // Votants groupes par reponse (depuis les donnees ; le detail repliable se
  // rafraichit apres refetch, il n'est pas ajuste de maniere optimiste)
  const voters = useMemo(() => {
    const v = { oui: [], non: [], peut_etre: [] }
    for (const r of reponses) {
      if (!v[r.reponse]) continue
      v[r.reponse].push({
        userId: r.user_id,
        prenom: r.votant?.prenom ?? '',
        nom: r.votant?.nom ?? '',
      })
    }
    return v
  }, [reponses])

  const vote = useCallback(
    async (reponse) => {
      if (!user || !evenementId) return
      if (!REPONSES_VALIDES.includes(reponse)) return

      setPendingVote(reponse) // optimiste : le bouton se met en surbrillance
      setVoting(true)
      try {
        const { error: upsertError } = await supabase
          .from('evenement_reponses')
          .upsert(
            { evenement_id: evenementId, user_id: user.id, reponse },
            { onConflict: 'evenement_id,user_id' },
          )
        if (upsertError) throw upsertError
        refetch()
      } catch (err) {
        console.error('[useSondage] vote error:', err)
        setPendingVote(null) // revert
      } finally {
        setVoting(false)
      }
    },
    [user, evenementId, refetch],
  )

  return { loading, error, myVote, counts, voters, voting, vote }
}
