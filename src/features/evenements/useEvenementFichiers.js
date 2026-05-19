import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

const BUCKET = 'evenements'

/**
 * Documents attaches a un evenement. Charge la liste et expose
 * deleteFichier(id) (suppression DB + nettoyage best-effort du bucket).
 * L'ajout est gere par EvenementUploadModal, qui declenche refetch() via
 * son callback onUploaded.
 *
 * Pas de Realtime sur evenement_fichiers : la liste se rafraichit apres
 * chaque mutation locale et au prochain chargement de la page.
 */
export function useEvenementFichiers(evenementId) {
  const [fichiers, setFichiers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const refetch = useCallback(() => {
    setReloadKey((k) => k + 1)
  }, [])

  useEffect(() => {
    let active = true

    if (!evenementId) {
      setFichiers([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    supabase
      .from('evenement_fichiers')
      .select('*')
      .eq('evenement_id', evenementId)
      .order('created_at', { ascending: true })
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
  }, [evenementId, reloadKey])

  // Suppression : DELETE en base puis nettoyage best-effort du blob Storage.
  const deleteFichier = useCallback(
    async (fichierId) => {
      const { error: deleteError } = await supabase
        .from('evenement_fichiers')
        .delete()
        .eq('id', fichierId)
      if (deleteError) throw deleteError

      // Cleanup best-effort : si le retrait du blob echoue, la ligne DB est
      // deja partie, on n'echoue pas l'operation pour autant.
      try {
        await supabase.storage.from(BUCKET).remove([fichierId])
      } catch {
        // blob orphelin sans gravite
      }

      refetch()
    },
    [refetch],
  )

  return { fichiers, loading, error, refetch, deleteFichier }
}
