import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'

/**
 * Modale de renommage d'un dossier ou d'un fichier.
 * Gere son propre UPDATE Supabase. Le parent fournit onRenamed (qui ferme +
 * refetch).
 *
 * Props :
 * - kind         : 'folder' | 'file' (determine la table cible)
 * - id           : UUID de l'item a renommer
 * - currentName  : nom actuel (pre-rempli dans l'input)
 * - onClose      : fermeture sans action
 * - onRenamed    : callback de succes (close + refetch cote parent)
 */
export default function RenameModal({ kind, id, currentName, onClose, onRenamed }) {
  const [nom, setNom] = useState(currentName || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const trimmed = nom.trim()
  const canSubmit =
    trimmed.length > 0 && trimmed !== (currentName || '').trim() && !submitting

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setError(null)

    const table = kind === 'folder' ? 'cabinet_dossiers' : 'cabinet_fichiers'
    const { error: updateError } = await supabase
      .from(table)
      .update({ nom: trimmed })
      .eq('id', id)

    setSubmitting(false)

    if (updateError) {
      setError(updateError.message || 'Erreur lors du renommage.')
      return
    }

    onRenamed()
  }

  function handleBackdropClick() {
    if (!submitting) onClose()
  }

  const title = kind === 'folder' ? 'Renommer le dossier' : 'Renommer le fichier'
  const inputLabel = kind === 'folder' ? 'Nom du dossier' : 'Nom du fichier'

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rename-title"
      className="fixed inset-0 z-[100] flex items-end justify-center"
      style={{
        background: 'rgba(28,61,82,0.40)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
      onClick={handleBackdropClick}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-carte rounded-t-2xl p-5 pt-4"
        style={{ boxShadow: '0 20px 40px -12px rgba(28,61,82,0.25)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="rename-title" className="font-display font-extrabold text-lg text-marine">
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

        <label
          htmlFor="rename-nom"
          className="block mb-1.5 text-faint text-[11px] font-semibold uppercase tracking-[0.14em]"
        >
          {inputLabel}
        </label>
        <input
          id="rename-nom"
          type="text"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          required
          maxLength={200}
          autoFocus
          autoComplete="off"
          className="w-full h-11 px-3 rounded-input border border-border bg-carte font-sans text-[15px] text-marine focus:outline-none focus:ring-2 focus:ring-canard"
        />

        {error && (
          <p className="mt-3 text-brique text-sm">{error}</p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full mt-5 h-11 rounded-xl bg-marine text-white font-sans font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Enregistrement…' : 'Renommer'}
        </button>
      </form>
    </div>,
    document.body
  )
}
