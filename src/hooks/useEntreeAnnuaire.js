import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'

export function useEntreeAnnuaire(id) {
  const { user, loading: authLoading } = useAuth()
  const [entree, setEntree] = useState(null)
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

    if (!user) {
      setEntree(null)
      setLoading(false)
      setError(null)
      return
    }

    if (!id) {
      setEntree(null)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    // Meme jointure que useEntreesAnnuaire : permet d'afficher
    // "cree par X" dans la fiche detail.
    supabase
      .from('annuaire')
      .select('*, auteur:profiles!auteur_id(prenom, nom)')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error: queryError }) => {
        if (!active) return
        if (queryError) {
          setEntree(null)
          setError(queryError)
          setLoading(false)
          return
        }
        setEntree(data ?? null)
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [id, user, authLoading, reloadKey])

  return { entree, loading, error, refetch }
}
