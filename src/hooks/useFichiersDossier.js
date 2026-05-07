import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'

export function useFichiersDossier(dossierId) {
  const { user, loading: authLoading } = useAuth()
  const [fichiers, setFichiers] = useState([])
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
      setFichiers([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    // Meme logique que useDossiersEnfants : si dossierId est null,
    // on cible les fichiers a la racine (dossier_id IS NULL en SQL).
    // Sinon on filtre sur le dossier specifie.
    let query = supabase
      .from('cabinet_fichiers')
      .select('*, auteur:profiles!auteur_id(prenom, nom)')

    if (dossierId === null || dossierId === undefined) {
      query = query.is('dossier_id', null)
    } else {
      query = query.eq('dossier_id', dossierId)
    }

    query
      .order('nom', { ascending: true })
      .order('created_at', { ascending: false })
      .then(({ data, error: queryError }) => {
        if (!active) return
        if (queryError) {
          setFichiers([])
          setError(queryError)
          setLoading(false)
          return
        }
        setFichiers(data ?? [])
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [user, authLoading, reloadKey, dossierId])

  return { fichiers, loading, error, refetch }
}
