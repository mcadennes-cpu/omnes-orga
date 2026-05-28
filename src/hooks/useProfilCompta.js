import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'

/**
 * Lit la ligne profiles_compta d'un médecin donné (RIB : iban, bic,
 * nom_titulaire_compte).
 *
 * Pattern calqué sur useEntreeAnnuaire : état data/loading/error, refetch via
 * reloadKey, cleanup `let active`.
 *
 * La visibilité réelle est portée par la RLS (compta_select_reader) : un
 * remplaçant ne recevra jamais de ligne, quel que soit le profileId demandé.
 * Le hook ne refait pas ce filtrage côté client — il se contente de remonter
 * ce que la base accepte de renvoyer. Le masquage de la *section* RIB côté UI
 * est piloté séparément par canViewCompta (cf. permissions.js).
 *
 * @param {string} profileId - id du médecin (= profiles_compta.id, FK profiles)
 * @returns {{ compta: object|null, loading: boolean, error: object|null, refetch: () => void }}
 */
export function useProfilCompta(profileId) {
  const { user, loading: authLoading } = useAuth()
  const [compta, setCompta] = useState(null)
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
      setCompta(null)
      setLoading(false)
      setError(null)
      return
    }

    if (!profileId) {
      setCompta(null)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    supabase
      .from('profiles_compta')
      .select('id, iban, bic, nom_titulaire_compte, updated_at')
      .eq('id', profileId)
      .maybeSingle()
      .then(({ data, error: queryError }) => {
        if (!active) return
        if (queryError) {
          setCompta(null)
          setError(queryError)
          setLoading(false)
          return
        }
        // maybeSingle() renvoie null si aucune ligne (RIB pas encore saisi,
        // ou RLS qui masque la ligne) — pas une erreur, juste "pas de RIB".
        setCompta(data ?? null)
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [profileId, user, authLoading, reloadKey])

  return { compta, loading, error, refetch }
}
