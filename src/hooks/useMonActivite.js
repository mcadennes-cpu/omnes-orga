import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'

// Modules renvoyes par la RPC get_mon_activite (cf. champ `module`).
const MODULES_SUIVIS = ['discussion', 'immobilier', 'evenements']

// Agrege la liste plate renvoyee par la RPC en compteurs par module.
// On initialise les 3 modules a zero pour que l'UI puisse lire
// parModule.discussion.total sans verifier l'existence de la cle.
function agregerParModule(items) {
  const base = {}
  for (const m of MODULES_SUIVIS) {
    base[m] = { nonLus: 0, sondages: 0, cartes: 0, total: 0 }
  }

  for (const it of items) {
    const slot = base[it.module]
    if (!slot) continue

    if (it.item_type === 'sondage') {
      slot.sondages += 1
    } else {
      // item_type === 'message' : une ligne = une carte avec du non-lu.
      slot.cartes += 1
      slot.nonLus += it.non_lus ?? 0
    }
  }

  // total = nb de "choses distinctes a traiter" dans le module
  // (cartes avec du nouveau + sondages en attente). C'est la valeur
  // recommandee pour la pastille de la tuile. Le detail (nb de messages
  // via nonLus) reste dispo si on prefere afficher ca a la place.
  for (const m of MODULES_SUIVIS) {
    base[m].total = base[m].cartes + base[m].sondages
  }

  return base
}

export function useMonActivite() {
  const { user, loading: authLoading } = useAuth()
  const [items, setItems] = useState([])
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

    // Pas de session -> rien a charger. On teste user?.id (et non user)
    // pour ne pas re-declencher a chaque changement de reference de l'objet
    // user lors d'un refresh de JWT (cf. etape 16D-bis).
    if (!user?.id) {
      setItems([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    supabase.rpc('get_mon_activite').then(({ data, error: rpcError }) => {
      if (!active) return
      if (rpcError) {
        setItems([])
        setError(rpcError)
        setLoading(false)
        return
      }

      // Tri du feed : activite la plus recente en premier.
      // NB evenements : ref_at = date_debut (futur), donc un evenement peut
      // remonter en haut du feed. Affinage prevu en phase UI (sous-section
      // dediee, ou tri ascendant par date pour les evenements).
      const sorted = [...(data ?? [])].sort((a, b) => {
        const ta = a.ref_at ? new Date(a.ref_at).getTime() : 0
        const tb = b.ref_at ? new Date(b.ref_at).getTime() : 0
        return tb - ta
      })

      setItems(sorted)
      setLoading(false)
    })

    return () => {
      active = false
    }
  }, [user?.id, authLoading, reloadKey])

  // Recharge au retour au premier plan (meme pattern qu'en etape 17 sur
  // useCard) : sur iOS la PWA est "gelee" en arriere-plan, on rafraichit
  // donc les non-lus des qu'on revient sur l'application.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') refetch()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refetch])

  // Pastille (badge) sur l'icone de l'app installee. Sur iOS 16.4+, l'API
  // Badging marche pour une PWA ajoutee a l'ecran d'accueil des lors que la
  // permission notifications est accordee (etape 17). On reflete le nombre de
  // lignes "En attente" ; 0 efface la pastille. Feature-detection pour les
  // navigateurs qui ne supportent pas l'API (no-op silencieux).
  // NB : ne se met a jour que quand ce hook est monte (Home) ou au retour au
  // premier plan. La maj quand l'app est FERMEE (sur push) sera geree cote
  // service worker -> phase suivante.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('setAppBadge' in navigator)) return
    const count = items.length
    if (count > 0) {
      navigator.setAppBadge(count).catch(() => {})
    } else {
      navigator.clearAppBadge?.().catch(() => {})
    }
  }, [items])

  // parModule : { discussion: {nonLus, sondages, cartes, total}, immobilier: {...}, evenements: {...} }
  const parModule = useMemo(() => agregerParModule(items), [items])

  return { items, parModule, loading, error, refetch }
}
