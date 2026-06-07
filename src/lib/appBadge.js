// src/lib/appBadge.js
// Recalcule la pastille (App Badge) de l'icone a partir du compte reel
// "en attente" (RPC get_mon_activite). Utile quand on n'a pas le compteur
// sous la main, typiquement apres avoir marque une carte lue (on est alors
// hors de la Home, ou vit le hook useMonActivite qui pose la pastille).
//
// Le compte = nombre de lignes de get_mon_activite = items.length du hook,
// donc coherent avec les pastilles de tuiles et la section "En attente".
//
// Fire-and-forget : la pastille n'est pas critique, on avale les erreurs.

import { supabase } from './supabaseClient'

export async function refreshAppBadge() {
  if (typeof navigator === 'undefined' || !('setAppBadge' in navigator)) return
  try {
    const { data, error } = await supabase.rpc('get_mon_activite')
    if (error) return
    const count = Array.isArray(data) ? data.length : 0
    if (count > 0) {
      await navigator.setAppBadge(count)
    } else if ('clearAppBadge' in navigator) {
      await navigator.clearAppBadge()
    }
  } catch {
    // silencieux
  }
}
