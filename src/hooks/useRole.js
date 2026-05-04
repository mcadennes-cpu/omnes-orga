import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'

export function useRole() {
  const { user, loading: authLoading } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true

    if (authLoading) {
      setLoading(true)
      return
    }

    if (!user) {
      setProfile(null)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
      .then(({ data, error: queryError }) => {
        if (!active) return
        if (queryError) {
          setProfile(null)
          setError(queryError)
          setLoading(false)
          return
        }
        if (!data) {
          setProfile(null)
          setLoading(true)
          return
        }
        setProfile(data)
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [user, authLoading])

  return {
    profile,
    role: profile?.role ?? null,
    prenom: profile?.prenom ?? null,
    nom: profile?.nom ?? null,
    email: profile?.email ?? user?.email ?? null,
    loading,
    error,
  }
}
