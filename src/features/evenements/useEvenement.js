import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'

/**
 * Charge un evenement unique par son id, avec son auteur (prenom, nom).
 * Les documents et les reponses au sondage sont charges par des hooks
 * dedies (lots 8F documents, 8G sondage).
 *
 * Si l'evenement n'existe pas (ou n'est pas visible), evenement vaut null
 * et error reste null : la page detail affiche un etat "introuvable".
 *
 * Expose updateEvenement(values) et deleteEvenement() pour la page detail.
 */
export function useEvenement(id) {
  const { user, loading: authLoading } = useAuth()
  const [evenement, setEvenement] = useState(null)
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
      setEvenement(null)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    supabase
      .from('evenements')
      .select('*, auteur:profiles!auteur_id(prenom, nom)')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error: queryError }) => {
        if (!active) return
        if (queryError) {
          setEvenement(null)
          setError(queryError)
          setLoading(false)
          return
        }
        setEvenement(data ?? null)
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [id, user, authLoading, reloadKey])

  // --- Modification de l'evenement ---
  const updateEvenement = useCallback(
    async (values) => {
      if (!id) throw new Error('Evenement introuvable')
      const { error: updateError } = await supabase
        .from('evenements')
        .update({
          titre: values.titre,
          description: values.description,
          date_debut: values.date_debut,
          date_fin: values.date_fin,
          lieu: values.lieu,
          couleur: values.couleur,
          sondage_actif: values.sondage_actif,
        })
        .eq('id', id)
      if (updateError) throw updateError
      refetch()
    },
    [id, refetch],
  )

  // --- Suppression de l'evenement ---
  // Hard delete : la cascade SQL efface les lignes evenement_fichiers et
  // evenement_reponses. Le nettoyage des blobs Storage des documents sera
  // ajoute au lot 8F (quand les documents existeront).
  const deleteEvenement = useCallback(async () => {
    if (!id) throw new Error('Evenement introuvable')
    const { error: deleteError } = await supabase
      .from('evenements')
      .delete()
      .eq('id', id)
    if (deleteError) throw deleteError
  }, [id])

  return { evenement, loading, error, refetch, updateEvenement, deleteEvenement }
}
