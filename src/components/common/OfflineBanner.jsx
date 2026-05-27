import { WifiOff } from 'lucide-react'
import useOnlineStatus from '../../hooks/useOnlineStatus'

/**
 * Bandeau affiché en haut de l'app quand le navigateur est hors ligne.
 *
 * - Animation slide-down à l'apparition (Tailwind transition).
 * - Couleur brique (cohérent avec les états d'alerte du DS).
 * - Ne consomme pas la touche escape ni le focus : c'est purement informatif.
 * - safe-area-top pour ne pas passer sous l'encoche iOS.
 */
export default function OfflineBanner() {
  const isOnline = useOnlineStatus()

  if (isOnline) return null

  return (
    <div
      className="
        fixed top-0 left-0 right-0 z-50
        bg-brique text-white
        px-4 py-2.5
        flex items-center justify-center gap-2
        text-caption font-semibold
        shadow-card
      "
      style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}
      role="status"
      aria-live="polite"
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>Hors ligne — certaines données ne sont pas disponibles</span>
    </div>
  )
}
