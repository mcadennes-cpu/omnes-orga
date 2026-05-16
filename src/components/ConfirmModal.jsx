import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2 } from 'lucide-react'

/**
 * Bottom-sheet de confirmation generique pour les actions sensibles.
 * Le parent garde la main : il ferme la modale lui-meme apres succes
 * (utile quand onConfirm declenche une navigation).
 *
 * @param {Object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} props.title
 * @param {string} props.message
 * @param {string} [props.confirmLabel='Confirmer']
 * @param {string} [props.cancelLabel='Annuler']
 * @param {boolean} [props.danger=false]  teinte le bouton de confirmation en brique
 * @param {() => Promise} props.onConfirm
 */
export default function ConfirmModal({
  open,
  onClose,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  danger = false,
  onConfirm,
}) {
  const [working, setWorking] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (open) {
      setWorking(false)
      setError(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const handler = (e) => {
      if (e.key === 'Escape' && !working) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, working, onClose])

  if (!open) return null

  const handleConfirm = async () => {
    setWorking(true)
    setError(null)
    try {
      await onConfirm()
      // Pas de fermeture ici : le parent ferme apres succes.
    } catch (err) {
      console.error('[ConfirmModal] confirm error:', err)
      setError(err?.message || 'Une erreur est survenue.')
      setWorking(false)
    }
  }

  const confirmClasses = danger ? 'bg-brique text-white' : 'bg-marine text-white'

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Fermer"
        onClick={() => !working && onClose()}
        className="absolute inset-0 bg-marine/40 backdrop-blur-sm"
      />
      <div className="relative bg-carte rounded-t-2xl shadow-2xl flex flex-col animate-slide-up">
        <div className="pt-3 pb-1 flex justify-center">
          <div className="w-9 h-1 rounded-full bg-marine/18" />
        </div>
        <div className="px-4 pt-3 pb-4">
          <h2 className="font-display font-extrabold text-marine text-lg">{title}</h2>
          <p className="mt-2 text-muted text-sm leading-relaxed">{message}</p>
          {error && (
            <div className="mt-3 px-3 py-2 rounded-input bg-brique/10 text-brique text-sm">
              {error}
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t border-border bg-carte flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => !working && onClose()}
            disabled={working}
            className="px-4 py-2.5 rounded-full text-muted font-semibold text-sm hover:text-marine disabled:opacity-50 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={working}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full ${confirmClasses} font-semibold text-sm disabled:opacity-40 active:opacity-80 transition-opacity`}
          >
            {working && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.2} />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
