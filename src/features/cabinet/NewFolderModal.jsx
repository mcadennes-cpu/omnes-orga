import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import { COULEURS } from './useCabinet'

export default function NewFolderModal({ parentId, onClose, onCreated }) {
  const { user } = useAuth()
  const [nom, setNom] = useState('')
  const [couleur, setCouleur] = useState('gris')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const canSubmit = nom.trim().length > 0 && !submitting

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setError(null)

    const { error: insertError } = await supabase
      .from('cabinet_dossiers')
      .insert({
        nom: nom.trim(),
        couleur,
        parent_id: parentId, // null en racine
        auteur_id: user?.id ?? null,
      })

    setSubmitting(false)

    if (insertError) {
      setError(insertError.message || 'Erreur lors de la création.')
      return
    }

    onCreated()
  }

  function handleBackdropClick() {
    if (!submitting) onClose()
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-folder-title"
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
          <h2 id="new-folder-title" className="font-display font-extrabold text-lg text-marine">
            Nouveau dossier
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
          htmlFor="new-folder-nom"
          className="block mb-1.5 text-faint text-[11px] font-semibold uppercase tracking-[0.14em]"
        >
          Nom du dossier
        </label>
        <input
          id="new-folder-nom"
          type="text"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          required
          maxLength={100}
          autoFocus
          autoComplete="off"
          className="w-full h-11 px-3 rounded-input border border-border bg-carte font-sans text-[15px] text-marine focus:outline-none focus:ring-2 focus:ring-canard"
        />

        <label className="block mt-4 mb-2 text-faint text-[11px] font-semibold uppercase tracking-[0.14em]">
          Couleur
        </label>
        <div className="flex gap-2 flex-wrap">
          {COULEURS.map((c) => {
            const selected = couleur === c.key
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setCouleur(c.key)}
                aria-label={c.label}
                aria-pressed={selected}
                className={`h-10 w-10 rounded-full transition-all ${
                  selected
                    ? 'ring-2 ring-marine ring-offset-2 ring-offset-carte'
                    : 'opacity-80 hover:opacity-100'
                }`}
                style={{ backgroundColor: c.hex }}
              />
            )
          })}
        </div>

        {error && (
          <p className="mt-3 text-brique text-sm">{error}</p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full mt-5 h-11 rounded-xl bg-marine text-white font-sans font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Création…' : 'Créer le dossier'}
        </button>
      </form>
    </div>,
    document.body
  )
}
