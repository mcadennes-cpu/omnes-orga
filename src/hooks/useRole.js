import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'

export function useRole() {
  const { user, loading: authLoading } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const latestFetchId = useRef(0)

  // Fetch pur : interroge Supabase et retourne { data } ou { error }, sans
  // toucher au state. L'appelant (useEffect ou refetch) decide quoi en faire.
  const fetchProfile = useCallback(async (userId) => {
    const { data, error: queryError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (queryError) return { error: queryError }
    return { data }
  }, [])

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

    fetchProfile(user.id).then((result) => {
      if (!active) return
      if (result.error) {
        setProfile(null)
        setError(result.error)
        setLoading(false)
        return
      }
      if (!result.data) {
        // Cas transitoire : auth.user existe mais le trigger qui cree la
        // ligne profiles n'a pas encore tourne. On reste en loading.
        setProfile(null)
        setLoading(true)
        return
      }
      setProfile(result.data)
      setLoading(false)
    })

    return () => {
      active = false
    }
  }, [user, authLoading, fetchProfile])

  // Re-fetch imperatif (apres upload de photo de profil, par exemple).
  // Son propre mecanisme d'annulation via latestFetchId : si deux refetch
  // sont declenches rapidement (double-clic), seul le dernier applique son
  // resultat au state.
  const refetch = useCallback(async () => {
    if (!user) return
    const fetchId = ++latestFetchId.current
    setLoading(true)
    setError(null)
    const result = await fetchProfile(user.id)
    if (fetchId !== latestFetchId.current) return
    if (result.error) {
      setProfile(null)
      setError(result.error)
      setLoading(false)
      return
    }
    if (!result.data) {
      setProfile(null)
      setLoading(true)
      return
    }
    setProfile(result.data)
    setLoading(false)
  }, [user, fetchProfile])

  return {
    profile,
    role: profile?.role ?? null,
    prenom: profile?.prenom ?? null,
    nom: profile?.nom ?? null,
    email: profile?.email ?? user?.email ?? null,
    photo_url: profile?.photo_url ?? null,
    loading,
    error,
    refetch,
  }
}
