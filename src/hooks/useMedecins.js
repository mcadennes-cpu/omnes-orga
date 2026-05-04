import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'

export function useMedecins() {
  const { user, loading: authLoading } = useAuth()
  const [medecins, setMedecins] = useState([])
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
      setMedecins([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    supabase
      .from('profiles')
      .select('*')
      .eq('actif', true)
      .order('nom', { ascending: true })
      .order('prenom', { ascending: true })
      .then(({ data, error: queryError }) => {
        if (!active) return
        if (queryError) {
          setMedecins([])
          setError(queryError)
          setLoading(false)
          return
        }
        const filtered = (data ?? []).filter(
          (p) => p.nom && p.nom.trim() !== ''
        )
        setMedecins(filtered)
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [user, authLoading, reloadKey])

  return { medecins, loading, error, refetch }
}
