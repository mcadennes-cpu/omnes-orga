import { useEffect } from 'react'

export default function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  confirmVariant = 'primary',
  submitting = false,
}) {
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(e) {
      if (e.key === 'Escape' && !submitting) {
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onCancel, submitting])

  if (!open) return null

  function handleOverlayClick() {
    if (submitting) return
    onCancel()
  }

  function handleDialogClick(e) {
    e.stopPropagation()
  }

  const confirmClass =
    confirmVariant === 'danger'
      ? 'bg-brique text-white hover:bg-brique/90'
      : 'bg-marine text-white hover:bg-marine/90'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 bg-marine/40 backdrop-blur-sm flex items-start justify-center px-4"
    >
      <div
        onClick={handleDialogClick}
        className="bg-carte border border-border rounded-card p-6 max-w-sm w-full mt-32 shadow-xl flex flex-col gap-4"
      >
        <div>
          <h2
            id="confirm-dialog-title"
            className="font-display font-bold text-lg text-marine"
          >
            {title}
          </h2>
          {message && (
            <p className="text-sm text-ink leading-relaxed mt-2">{message}</p>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="h-12 sm:flex-1 rounded-input border border-border text-marine font-semibold hover:bg-marine/5 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className={`h-12 sm:flex-1 rounded-input font-semibold disabled:cursor-not-allowed disabled:opacity-60 transition-colors ${confirmClass}`}
          >
            {submitting ? 'Traitement…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
