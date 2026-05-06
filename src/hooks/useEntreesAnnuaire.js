import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'

export function useEntreesAnnuaire() {
  const { user, loading: authLoading } = useAuth()
  const [entrees, setEntrees] = useState([])
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
      setEntrees([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    // Jointure sur profiles via la FK auteur_id : permet d'afficher
    // "cree par X" dans la liste. Si l'auteur a ete supprime
    // (ON DELETE SET NULL), le champ auteur sera simplement null.
    supabase
      .from('annuaire')
      .select('*, auteur:profiles!auteur_id(prenom, nom)')
      .order('nom', { ascending: true })
      .order('created_at', { ascending: false })
      .then(({ data, error: queryError }) => {
        if (!active) return
        if (queryError) {
          setEntrees([])
          setError(queryError)
          setLoading(false)
          return
        }
        // Pas de filtre "nom non vide" comme dans useMedecins :
        // ici la colonne nom est NOT NULL en base, donc pas d'entree
        // fantome possible.
        setEntrees(data ?? [])
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [user, authLoading, reloadKey])

  return { entrees, loading, error, refetch }
}
