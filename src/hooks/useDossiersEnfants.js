import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'

export function useDossiersEnfants(parentId) {
  const { user, loading: authLoading } = useAuth()
  const [dossiers, setDossiers] = useState([])
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
      setDossiers([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    // Construction de la requete : selon que parentId est null ou non,
    // on filtre differemment. Avec PostgREST/Supabase, comparer a NULL
    // necessite .is('parent_id', null) et non .eq('parent_id', null) qui
    // ne fonctionne pas.
    let query = supabase
      .from('cabinet_dossiers')
      .select('*, auteur:profiles!auteur_id(prenom, nom)')

    if (parentId === null || parentId === undefined) {
      query = query.is('parent_id', null)
    } else {
      query = query.eq('parent_id', parentId)
    }

    query
      .order('nom', { ascending: true })
      .order('created_at', { ascending: false })
      .then(({ data, error: queryError }) => {
        if (!active) return
        if (queryError) {
          setDossiers([])
          setError(queryError)
          setLoading(false)
          return
        }
        setDossiers(data ?? [])
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [user, authLoading, reloadKey, parentId])

  return { dossiers, loading, error, refetch }
}
