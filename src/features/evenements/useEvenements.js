import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'

/**
 * Liste des evenements du cabinet, enrichie pour l'affichage des cartes :
 * - auteur (prenom, nom) via la FK auteur_id
 * - nb_fichiers : nombre de documents attaches
 * - ma_reponse : reponse de l'utilisateur courant au sondage
 *   ('oui' | 'non' | 'peut_etre') ou null s'il n'a pas vote
 *
 * Tri par date_debut ascendant. Le decoupage "A venir" / "Passes" se fait
 * cote page (Evenements.jsx) a partir de ce jeu complet.
 *
 * Realtime : abonnement aux changements de la table evenements -> refetch.
 *
 * Expose createEvenement(values) pour la modale de creation.
 */
export function useEvenements() {
  const { user, loading: authLoading } = useAuth()
  const [evenements, setEvenements] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const refetch = useCallback(() => {
    setReloadKey((k) => k + 1)
  }, [])

  // --- Chargement des donnees ---
  useEffect(() => {
    let active = true

    if (authLoading) {
      setLoading(true)
      return
    }
    if (!user) {
      setEvenements([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    async function load() {
      // 1) Evenements + auteur + nombre de documents (count embarque PostgREST)
      const { data: events, error: eventsError } = await supabase
        .from('evenements')
        .select('*, auteur:profiles!auteur_id(prenom, nom), evenement_fichiers(count)')
        .order('date_debut', { ascending: true })

      if (!active) return
      if (eventsError) {
        setEvenements([])
        setError(eventsError)
        setLoading(false)
        return
      }

      // 2) Mes reponses au sondage, pour calculer ma_reponse par evenement
      const { data: votes, error: votesError } = await supabase
        .from('evenement_reponses')
        .select('evenement_id, reponse')
        .eq('user_id', user.id)

      if (!active) return
      if (votesError) {
        setEvenements([])
        setError(votesError)
        setLoading(false)
        return
      }

      const voteByEvent = new Map(
        (votes ?? []).map((v) => [v.evenement_id, v.reponse]),
      )

      // evenement_fichiers(count) revient sous la forme [{ count: N }]
      const enriched = (events ?? []).map((e) => ({
        ...e,
        nb_fichiers: e.evenement_fichiers?.[0]?.count ?? 0,
        ma_reponse: voteByEvent.get(e.id) ?? null,
      }))

      setEvenements(enriched)
      setLoading(false)
    }

    load()

    return () => {
      active = false
    }
  }, [user, authLoading, reloadKey])

  // --- Realtime : rafraichir la liste sur tout changement de la table ---
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel('evenements-liste')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'evenements' },
        () => refetch(),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, refetch])

  // --- Creation d'un evenement ---
  // auteur_id = utilisateur courant : impose par la RLS evenements_insert_creators.
  const createEvenement = useCallback(
    async (values) => {
      if (!user) throw new Error('Utilisateur non connecte')

      const { data, error: insertError } = await supabase
        .from('evenements')
        .insert({
          titre: values.titre,
          description: values.description,
          date_debut: values.date_debut,
          date_fin: values.date_fin,
          lieu: values.lieu,
          couleur: values.couleur,
          sondage_actif: values.sondage_actif,
          auteur_id: user.id,
        })
        .select('id')
        .single()

      if (insertError) throw insertError
      refetch()
      return data
    },
    [user, refetch],
  )

  return { evenements, loading, error, refetch, createEvenement }
}
