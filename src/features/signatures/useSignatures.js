// src/features/signatures/useSignatures.js
//
// Liste des demandes visibles par l'utilisateur (la RLS fait le tri :
// createur, signataire d'une demande envoyee, ou super_admin), rangees en
// trois onglets : a signer / en cours / terminees.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import { COLONNES_SIGNATAIRE } from './signaturesApi'
import { signatairesAttendus } from './signaturesLabels'

const COLONNES_DEMANDE =
  'id, type, titre, statut, ordre_impose, createur_id, envoyee_at, terminee_at, annulee_at, created_at, updated_at'

export function useSignatures() {
  const { user } = useAuth()
  const [demandes, setDemandes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const refetch = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    if (!user?.id) return undefined
    let actif = true
    ;(async () => {
      setError(null)
      const { data: lignes, error: err } = await supabase
        .from('signature_demandes')
        .select(COLONNES_DEMANDE)
        .order('updated_at', { ascending: false })
      if (!actif) return
      if (err) {
        setError(err)
        setLoading(false)
        return
      }
      const ids = (lignes ?? []).map((d) => d.id)
      let sigs = []
      if (ids.length) {
        const { data, error: errSig } = await supabase
          .from('signature_signataires')
          .select(COLONNES_SIGNATAIRE)
          .in('demande_id', ids)
          .order('ordre')
        if (!actif) return
        if (errSig) {
          setError(errSig)
          setLoading(false)
          return
        }
        sigs = data ?? []
      }
      setDemandes(
        (lignes ?? []).map((d) => {
          const signataires = sigs.filter((s) => s.demande_id === d.id)
          const attendus = signatairesAttendus(d, signataires)
          return {
            ...d,
            signataires,
            nbSignes: signataires.filter((s) => s.statut === 'signe').length,
            aSigner: attendus.some((s) => s.profil_id === user.id),
          }
        }),
      )
      setLoading(false)
    })()
    return () => {
      actif = false
    }
  }, [user?.id, reloadKey])

  // Retour au premier plan (PWA iOS gelee en arriere-plan) : on recharge.
  useEffect(() => {
    const surVisible = () => document.visibilityState === 'visible' && refetch()
    document.addEventListener('visibilitychange', surVisible)
    return () => document.removeEventListener('visibilitychange', surVisible)
  }, [refetch])

  const parOnglet = useMemo(() => {
    const aSigner = demandes.filter((d) => d.aSigner)
    const enCours = demandes.filter(
      (d) => !d.aSigner && (d.statut === 'brouillon' || d.statut === 'en_cours'),
    )
    const terminees = demandes.filter((d) => d.statut === 'terminee' || d.statut === 'annulee')
    return { a_signer: aSigner, en_cours: enCours, terminees }
  }, [demandes])

  return { demandes, parOnglet, loading, error, refetch }
}
