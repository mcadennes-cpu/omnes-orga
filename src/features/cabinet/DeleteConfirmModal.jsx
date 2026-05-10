import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'

const BUCKET = 'cabinet-pratique'

/**
 * Modale de confirmation de suppression d'un dossier ou fichier.
 * Gere son propre DELETE Supabase. Pour un fichier, supprime aussi du bucket
 * Storage (best-effort). Pour un dossier non vide, le contrainte SQL
 * ON DELETE RESTRICT renvoie un code 23503 (foreign_key_violation) qu'on
 * traduit en message clair.
 *
 * Props :
 * - kind       : 'folder' | 'file'
 * - id         : UUID de l'item
 * - name       : nom affiche dans la phrase de confirmation
 * - onClose    : fermeture sans action
 * - onDeleted  : callback de succes (close + refetch cote parent)
 */
export default function DeleteConfirmModal({ kind, id, name, onClose, onDeleted }) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function handleDelete() {
    if (submitting) return

    setSubmitting(true)
    setError(null)

    const table = kind === 'folder' ? 'cabinet_dossiers' : 'cabinet_fichiers'
    const { error: deleteError } = await supabase
      .from(table)
      .delete()
      .eq('id', id)

    if (deleteError) {
      // 23503 = foreign_key_violation (dossier non vide vu l'ON DELETE RESTRICT)
      if (kind === 'folder' && deleteError.code === '23503') {
        setError("Ce dossier n'est pas vide. Supprimez d'abord les éléments qu'il contient.")
      } else {
        setError(deleteError.message || 'Erreur lors de la suppression.')
      }
      setSubmitting(false)
      return
    }

    // Pour un fichier : nettoyage du bucket (best-effort, non bloquant).
    // Si ca echoue, le fichier reste orphelin dans le bucket mais la DB est
    // a jour. Un script de maintenance pourra nettoyer plus tard.
    if (kind === 'file') {
      try {
        await supabase.storage.from(BUCKET).remove([id])
      } catch (e) {
        console.warn('Cleanup storage echoue (orphelin)', e)
      }
    }

    setSubmitting(false)
    onDeleted()
  }

  function handleBackdropClick() {
    if (!submitting) onClose()
  }

  const title = kind === 'folder' ? 'Supprimer le dossier' : 'Supprimer le fichier'

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-confirm-title"
      className="fixed inset-0 z-[100] flex items-end justify-center"
      style={{
        background: 'rgba(28,61,82,0.40)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
      onClick={handleBackdropClick}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-carte rounded-t-2xl p-5 pt-4"
        style={{ boxShadow: '0 20px 40px -12px rgba(28,61,82,0.25)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="delete-confirm-title" className="font-display font-extrabold text-lg text-marine">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            aria-label="Fermer"
            className="h-9 w-9 flex items-center justify-center rounded-full shrink-0"
          >
            <X size={20} className="text-muted" />
          </button>
        </div>

        <p className="font-sans text-[15px] text-muted leading-snug">
          Êtes-vous sûr de vouloir supprimer{' '}
          <span className="font-semibold text-marine">{name}</span> ? Cette action est irréversible.
        </p>

        {error && (
          <div className="mt-4 flex items-start gap-2 text-brique text-sm">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            className="flex-1 h-11 rounded-xl bg-carte border border-border text-marine font-sans font-semibold disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={submitting}
            className="flex-1 h-11 rounded-xl bg-brique text-white font-sans font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Suppression…' : 'Supprimer'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
