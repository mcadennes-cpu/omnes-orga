// src/features/signatures/useSignature.js
//
// Detail d'une demande : la demande, ses signataires (avec leur profil pour
// l'avatar), son journal, et les gestes possibles.

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import { refreshAppBadge } from '../../lib/appBadge'
import {
  COLONNES_JOURNAL,
  COLONNES_SIGNATAIRE,
  appelerSignature,
  deposerSource,
} from './signaturesApi'

const PROFIL = 'id, prenom, nom, photo_url, updated_at'

export function useSignature(demandeId) {
  const { user } = useAuth()
  const [demande, setDemande] = useState(null)
  const [signataires, setSignataires] = useState([])
  const [journal, setJournal] = useState([])
  const [createur, setCreateur] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const refetch = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    if (!user?.id || !demandeId) return undefined
    let actif = true
    ;(async () => {
      setError(null)
      const { data: d, error: err } = await supabase
        .from('signature_demandes')
        .select('*')
        .eq('id', demandeId)
        .maybeSingle()
      if (!actif) return
      if (err || !d) {
        setDemande(null)
        setError(err ?? new Error('introuvable'))
        setLoading(false)
        return
      }
      const [sigs, jour, crea] = await Promise.all([
        supabase
          .from('signature_signataires')
          .select(`${COLONNES_SIGNATAIRE}, profil:profiles!signature_signataires_profil_id_fkey(${PROFIL})`)
          .eq('demande_id', demandeId)
          .order('ordre'),
        supabase
          .from('signature_journal')
          .select(COLONNES_JOURNAL)
          .eq('demande_id', demandeId)
          .order('id', { ascending: false }),
        supabase.from('profiles').select(PROFIL).eq('id', d.createur_id).maybeSingle(),
      ])
      if (!actif) return
      setDemande(d)
      setSignataires(sigs.data ?? [])
      setJournal(jour.data ?? [])
      setCreateur(crea.data ?? null)
      setLoading(false)
    })()
    return () => {
      actif = false
    }
  }, [user?.id, demandeId, reloadKey])

  // --- Brouillon (ecritures directes, sous RLS) --------------------------

  const modifier = useCallback(
    async (champs) => {
      const { error: err } = await supabase.from('signature_demandes').update(champs).eq('id', demandeId)
      if (err) throw new Error("La modification n'a pas pu être enregistrée.")
      refetch()
    },
    [demandeId, refetch],
  )

  const deposer = useCallback(
    async (fichier) => {
      await deposerSource(demandeId, fichier)
      refetch()
    },
    [demandeId, refetch],
  )

  const ajouterSignataires = useCallback(
    async (profilIds) => {
      if (!profilIds.length) return
      const depart = signataires.reduce((m, s) => Math.max(m, s.ordre), 0)
      const lignes = profilIds.map((profil_id, i) => ({
        demande_id: demandeId,
        profil_id,
        ordre: depart + i + 1,
      }))
      const { error: err } = await supabase.from('signature_signataires').insert(lignes)
      if (err) throw new Error("L'ajout du signataire a échoué.")
      refetch()
    },
    [demandeId, signataires, refetch],
  )

  const modifierQualite = useCallback(
    async (signataireId, qualite) => {
      const { error: err } = await supabase
        .from('signature_signataires')
        .update({ qualite: qualite.trim() || null })
        .eq('id', signataireId)
      if (err) throw new Error("La qualité n'a pas pu être enregistrée.")
      refetch()
    },
    [refetch],
  )

  const retirerSignataire = useCallback(
    async (signataireId) => {
      const { error: err } = await supabase.from('signature_signataires').delete().eq('id', signataireId)
      if (err) throw new Error('Le retrait a échoué.')
      refetch()
    },
    [refetch],
  )

  // Echange l'ordre de deux signataires. L'ordre est unique par demande :
  // on passe par une valeur d'attente (50, le maximum autorise).
  const deplacer = useCallback(
    async (signataireId, sens) => {
      const i = signataires.findIndex((s) => s.id === signataireId)
      const j = i + sens
      if (i < 0 || j < 0 || j >= signataires.length) return
      const a = signataires[i]
      const b = signataires[j]
      const maj = (id, ordre) => supabase.from('signature_signataires').update({ ordre }).eq('id', id)
      const etapes = [[a.id, 50], [b.id, a.ordre], [a.id, b.ordre]]
      for (const [id, ordre] of etapes) {
        const { error: err } = await maj(id, ordre)
        if (err) {
          refetch()
          throw new Error("Le changement d'ordre a échoué.")
        }
      }
      refetch()
    },
    [signataires, refetch],
  )

  const supprimerBrouillon = useCallback(async () => {
    if (demande?.source_chemin) {
      // Best-effort : un fichier orphelin reste invisible (cf. limitations).
      await supabase.storage.from('signatures').remove([demande.source_chemin])
    }
    const { error: err } = await supabase.from('signature_demandes').delete().eq('id', demandeId)
    if (err) throw new Error("Le brouillon n'a pas pu être supprimé.")
  }, [demande, demandeId])

  // --- Gestes serveur (Edge Function) -------------------------------------

  const agir = useCallback(
    async (action, params) => {
      try {
        return await appelerSignature(action, demandeId, params)
      } finally {
        refetch()
        refreshAppBadge()
      }
    },
    [demandeId, refetch],
  )

  return {
    demande,
    signataires,
    journal,
    createur,
    loading,
    error,
    refetch,
    modifier,
    deposer,
    ajouterSignataires,
    modifierQualite,
    retirerSignataire,
    deplacer,
    supprimerBrouillon,
    agir,
  }
}
