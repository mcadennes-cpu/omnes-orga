import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'

// Liste des lieux du module Codes d'acces (maisons de retraite, cabinet,
// domiciles...). Meme pattern que useEntreesAnnuaire.
export function useLieux() {
  const { user, loading: authLoading } = useAuth()
  const [lieux, setLieux] = useState([])
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
      setLieux([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    // codes_acces(count) : agregat PostgREST qui renvoie le nombre de codes
    // par lieu sous la forme codes_acces: [{ count: n }]. On l'aplatit en
    // nb_codes pour l'affichage "N codes" dans la liste — sans jamais
    // charger le contenu des codes eux-memes sur cet ecran.
    supabase
      .from('lieux')
      .select('*, codes_acces(count)')
      .order('nom', { ascending: true })
      .then(({ data, error: queryError }) => {
        if (!active) return
        if (queryError) {
          setLieux([])
          setError(queryError)
          setLoading(false)
          return
        }
        const rows = (data ?? []).map((l) => ({
          ...l,
          nb_codes: l.codes_acces?.[0]?.count ?? 0,
        }))
        setLieux(rows)
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [user, authLoading, reloadKey])

  return { lieux, loading, error, refetch }
}
