import { useEffect, useState } from 'react'

/**
 * Détecte si le navigateur est en ligne ou hors ligne.
 *
 * - Initialise sur `navigator.onLine` (true par défaut au tout premier rendu côté SSR).
 * - Écoute les événements 'online' et 'offline' du window.
 * - Nettoie les listeners au démontage.
 *
 * ⚠️ `navigator.onLine` n'est pas 100% fiable : il indique seulement que l'OS
 * détecte une interface réseau active, pas que les serveurs distants sont
 * joignables. Pour une détection plus fine, on pourrait poller un endpoint
 * Supabase, mais c'est largement suffisant pour notre cas (afficher un signal
 * visuel quand l'utilisateur perd manifestement le réseau).
 */
export default function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOnline
}
