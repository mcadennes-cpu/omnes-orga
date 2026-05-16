import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2 } from 'lucide-react'
import { getBoardColorClasses } from './boardColors'

const TITLE_MAX = 80

/**
 * Bottom-sheet de renommage d'un tableau. Un seul champ, pre-rempli
 * avec le titre courant. Le bouton Enregistrer reste desactive tant
 * que le titre est vide ou inchange.
 *
 * @param {Object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} [props.currentTitle='']
 * @param {(newTitle: string) => Promise} props.onRename
 * @param {string} [props.accentColor='brique']
 */
export default function RenameBoardModal({
  open,
  onClose,
  currentTitle = '',
  onRename,
  accentColor = 'brique',
}) {
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  // Pre-remplissage a l'ouverture
  useEffect(() => {
    if (open) {
      setTitle(currentTitle || '')
      setSubmitting(false)
      setSubmitError(null)
    }
  }, [open, currentTitle])

  useEffect(() => {
    if (!open) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const handler = (e) => {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, submitting, onClose])

  const trimmed = title.trim()
  const unchanged = trimmed === (currentTitle || '').trim()
  const canSubmit = trimmed.length > 0 && !unchanged && !submitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await onRename(trimmed)
      onClose()
    } catch (err) {
      console.error('[RenameBoardModal] submit error:', err)
      setSubmitError(err?.message || 'Une erreur est survenue.')
      setSubmitting(false)
    }
  }

  if (!open) return null
  const accent = getBoardColorClasses(accentColor)

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Renommer le tableau"
    >
      <button
        type="button"
        aria-label="Fermer"
        onClick={() => !submitting && onClose()}
        className="absolute inset-0 bg-marine/40 backdrop-blur-sm"
      />
      <div className="relative bg-carte rounded-t-2xl shadow-2xl flex flex-col animate-slide-up">
        <div className="pt-3 pb-1 flex justify-center">
          <div className="w-9 h-1 rounded-full bg-marine/18" />
        </div>
        <div className="px-4 pt-2 pb-3 flex items-center justify-between border-b border-border">
          <h2 className="font-display font-extrabold text-marine text-lg">
            Renommer le tableau
          </h2>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            aria-label="Fermer"
            disabled={submitting}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:bg-fond active:bg-fond transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" strokeWidth={1.8} />
          </button>
        </div>
        <div className="px-4 py-4">
          <label className="block text-muted text-xs uppercase tracking-wider font-semibold mb-2">
            Titre
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
            className="w-full px-3 py-2.5 rounded-input bg-fond border border-border text-marine text-sm placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-canard/30"
          />
          <div className="text-faint text-[11px] mt-1 text-right">
            {title.length}/{TITLE_MAX}
          </div>
          {submitError && (
            <div className="mt-3 px-3 py-2 rounded-input bg-brique/10 text-brique text-sm">
              {submitError}
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t border-border bg-carte flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            className="px-4 py-2.5 rounded-full text-muted font-semibold text-sm hover:text-marine disabled:opacity-50 transition-colors"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full ${accent.cta} font-semibold text-sm disabled:opacity-40 active:opacity-80 transition-opacity`}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.2} />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
