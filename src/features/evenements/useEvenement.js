import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'

/**
 * Charge un evenement unique par son id, avec son auteur (prenom, nom).
 * Les documents et les reponses au sondage seront charges par des hooks
 * dedies dans les lots ulterieurs (8E documents, 8F sondage).
 *
 * Si l'evenement n'existe pas (ou n'est pas visible), evenement vaut null
 * et error reste null : la page detail affichera un etat "introuvable".
 */
export function useEvenement(id) {
  const { user, loading: authLoading } = useAuth()
  const [evenement, setEvenement] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const refetch = useCallback(() => {
    setReloadKey((k) => k + 1)
  }, [])

  useEffect(() => {
    let active = true

    if (authLoading) {
      setLoading(true)
      return
    }
    if (!user || !id) {
      setEvenement(null)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    supabase
      .from('evenements')
      .select('*, auteur:profiles!auteur_id(prenom, nom)')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error: queryError }) => {
        if (!active) return
        if (queryError) {
          setEvenement(null)
          setError(queryError)
          setLoading(false)
          return
        }
        setEvenement(data ?? null)
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [id, user, authLoading, reloadKey])

  return { evenement, loading, error, refetch }
}
