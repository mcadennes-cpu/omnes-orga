// src/features/signatures/useClassement.js
//
// Etape 25 : ou une demande sera (ou a ete) rangee dans le module Contrats.
//   - chemin  : « SAS SIM › Contrats types », si le dossier de destination
//               est visible pour moi (un non-membre SIM ne voit pas
//               l'arborescence : chemin reste nul, c'est voulu) ;
//   - fichier : le PDF scelle classe (id = celui de la demande), visible
//               des membres SIM et des signataires (« concernes »).

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { construireChemins } from '../sim/useSim'

export function useClassement(demande) {
  const [chemin, setChemin] = useState(null)
  const [fichier, setFichier] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const refetch = useCallback(() => setReloadKey((k) => k + 1), [])

  const demandeId = demande?.id
  const dossierId = demande?.sim_dossier_id
  const terminee = demande?.statut === 'terminee'

  useEffect(() => {
    if (!demandeId) return undefined
    let vivant = true
    ;(async () => {
      let ch = null
      if (dossierId) {
        const { data } = await supabase.from('sim_dossiers').select('id, nom, parent_id')
        ch = construireChemins(data ?? []).find((d) => d.id === dossierId)?.chemin ?? null
      }
      let fi = null
      if (terminee) {
        const { data } = await supabase
          .from('sim_fichiers')
          .select('id, nom')
          .eq('signature_demande_id', demandeId)
          .maybeSingle()
        fi = data ?? null
      }
      if (!vivant) return
      setChemin(ch)
      setFichier(fi)
    })()
    return () => { vivant = false }
  }, [demandeId, dossierId, terminee, reloadKey])

  return { chemin, fichier, refetch }
}
