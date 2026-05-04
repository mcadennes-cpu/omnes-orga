import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'

export function useMedecin(id) {
  const { user, loading: authLoading } = useAuth()
  const [medecin, setMedecin] = useState(null)
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
      setMedecin(null)
      setLoading(false)
      setError(null)
      return
    }

    if (!id) {
      setMedecin(null)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error: queryError }) => {
        if (!active) return
        if (queryError) {
          setMedecin(null)
          setError(queryError)
          setLoading(false)
          return
        }
        setMedecin(data ?? null)
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [id, user, authLoading, reloadKey])

  return { medecin, loading, error, refetch }
}
