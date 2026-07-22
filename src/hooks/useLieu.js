import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'

// Fiche d'un lieu du module Codes d'acces, avec ses codes imbriques.
// Meme pattern que useEntreeAnnuaire, plus la jointure codes_acces :
//   - titulaire : profil du medecin proprietaire du code (null = code commun).
//     photo_url + updated_at sont necessaires au composant <Avatar>.
//   - auteur du lieu : pour le meta "Cree par X".
export function useLieu(id) {
  const { user, loading: authLoading } = useAuth()
  const [lieu, setLieu] = useState(null)
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
      setLieu(null)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    supabase
      .from('lieux')
      .select(
        '*, auteur:profiles!auteur_id(prenom, nom), codes:codes_acces(*, titulaire:profiles!titulaire_id(id, prenom, nom, photo_url, updated_at))'
      )
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error: queryError }) => {
        if (!active) return
        if (queryError) {
          setLieu(null)
          setError(queryError)
          setLoading(false)
          return
        }
        setLieu(data ?? null)
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [id, user, authLoading, reloadKey])

  return { lieu, loading, error, refetch }
}
