import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, Pencil, Lock, Unlock, Trash2 } from 'lucide-react'
import StatusBadge from './StatusBadge'
import { getBoardColorClasses } from './boardColors'

const TITLE_MAX = 120
const DESCRIPTION_MAX = 600

/**
 * Modale detail d'une carte (etape 7B) — version legere, sans chat.
 *
 * Affiche le titre, le statut et la description d'une carte, et — si
 * l'utilisateur en a le droit (canEdit) — permet de la modifier, de
 * basculer son statut ouvert/clos, et de la supprimer.
 *
 * En 7C, cette modale sera remplacee par une vue plein ecran integrant
 * le fil de discussion temps reel et les pieces jointes.
 *
 * @param {Object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {Object|null} props.card        carte a afficher (objet enrichi useBoard)
 * @param {string} [props.accentColor='brique'] couleur du tableau
 * @param {boolean} [props.canEdit=false] droit de modifier / clore / supprimer
 * @param {(cardId: string, patch: object) => Promise} props.onSave
 * @param {(card: object) => Promise} props.onToggleStatus
 * @param {(cardId: string) => Promise} props.onDelete
 */
export default function CardDetailModal({
  open,
  onClose,
  card,
  accentColor = 'brique',
  canEdit = false,
  onSave,
  onToggleStatus,
  onDelete,
}) {
  const [mode, setMode] = useState('view') // 'view' | 'edit'
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [working, setWorking] = useState(false)
  const [actionError, setActionError] = useState(null)

  // Reset complet a chaque ouverture / changement de carte
  useEffect(() => {
    if (open && card) {
      setMode('view')
      setEditTitle(card.title || '')
      setEditDescription(card.description || '')
      setConfirmingDelete(false)
      setWorking(false)
      setActionError(null)
    }
  }, [open, card])

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

  if (!open || !card) return null

  const accent = getBoardColorClasses(accentColor)
  const isOpen = card.status === 'open'
  const trimmedEditTitle = editTitle.trim()
  const canSaveEdit = trimmedEditTitle.length > 0 && !working

  const closeIfIdle = () => {
    if (!working) onClose()
  }

  const handleSave = async () => {
    if (!canSaveEdit) return
    setWorking(true)
    setActionError(null)
    try {
      await onSave(card.id, {
        title: trimmedEditTitle,
        description: editDescription.trim() || null,
      })
      setMode('view')
      setWorking(false)
    } catch (err) {
      console.error('[CardDetailModal] save error:', err)
      setActionError(err?.message || 'Une erreur est survenue.')
      setWorking(false)
    }
  }

  const handleToggleStatus = async () => {
    setWorking(true)
    setActionError(null)
    try {
      await onToggleStatus(card)
      setWorking(false)
    } catch (err) {
      console.error('[CardDetailModal] toggle status error:', err)
      setActionError(err?.message || 'Une erreur est survenue.')
      setWorking(false)
    }
  }

  const handleDelete = async () => {
    setWorking(true)
    setActionError(null)
    try {
      await onDelete(card.id)
      onClose()
    } catch (err) {
      console.error('[CardDetailModal] delete error:', err)
      setActionError(err?.message || 'Une erreur est survenue.')
      setWorking(false)
      setConfirmingDelete(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Détail de la carte"
    >
      <button
        type="button"
        aria-label="Fermer"
        onClick={closeIfIdle}
        className="absolute inset-0 bg-marine/40 backdrop-blur-sm"
      />

      <div className="relative bg-carte rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col animate-slide-up">
        <div className="pt-3 pb-1 flex justify-center">
          <div className="w-9 h-1 rounded-full bg-marine/18" />
        </div>

        <div className="px-4 pt-2 pb-3 flex items-center justify-between border-b border-border">
          <StatusBadge status={card.status} size="md" />
          <button
            type="button"
            onClick={closeIfIdle}
            aria-label="Fermer"
            disabled={working}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:bg-fond active:bg-fond transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {mode === 'view' ? (
            <>
              <h2 className="font-display font-extrabold text-marine text-xl leading-snug">
                {card.title}
              </h2>
              <div className="mt-4">
                <div className="text-muted text-xs uppercase tracking-wider font-semibold mb-1.5">
                  Description
                </div>
                {card.description ? (
                  <p className="text-marine text-sm whitespace-pre-wrap leading-relaxed">
                    {card.description}
                  </p>
                ) : (
                  <p className="text-faint text-sm italic">Aucune description.</p>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-5">
              <div>
                <label className="block text-muted text-xs uppercase tracking-wider font-semibold mb-2">
                  Titre
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value.slice(0, TITLE_MAX))}
                  className="w-full px-3 py-2.5 rounded-input bg-fond border border-border text-marine text-sm placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-canard/30"
                />
                <div className="text-faint text-[11px] mt-1 text-right">
                  {editTitle.length}/{TITLE_MAX}
                </div>
              </div>
              <div>
                <label className="block text-muted text-xs uppercase tracking-wider font-semibold mb-2">
                  Description <span className="text-faint normal-case font-normal">(optionnel)</span>
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
                  rows={4}
                  placeholder="Le sujet ou la question à trancher…"
                  className="w-full px-3 py-2.5 rounded-input bg-fond border border-border text-marine text-sm placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-canard/30 resize-none"
                />
              </div>
            </div>
          )}

          {actionError && (
            <div className="mt-4 px-3 py-2 rounded-input bg-brique/10 text-brique text-sm">
              {actionError}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border bg-carte">
          {mode === 'edit' ? (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => { setMode('view'); setActionError(null) }}
                disabled={working}
                className="px-4 py-2.5 rounded-full text-muted font-semibold text-sm hover:text-marine disabled:opacity-50 transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSaveEdit}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full ${accent.cta} font-semibold text-sm disabled:opacity-40 active:opacity-80 transition-opacity`}
              >
                {working && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.2} />}
                Enregistrer
              </button>
            </div>
          ) : confirmingDelete ? (
            <div className="space-y-2.5">
              <p className="text-marine text-sm font-medium">
                Supprimer définitivement cette carte ?
              </p>
              <p className="text-muted text-xs">
                Cette action est irréversible. Le fil de discussion et les pièces jointes éventuels seront également supprimés.
              </p>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={working}
                  className="px-4 py-2.5 rounded-full text-muted font-semibold text-sm hover:text-marine disabled:opacity-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={working}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-brique text-white font-semibold text-sm disabled:opacity-40 active:opacity-80 transition-opacity"
                >
                  {working && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.2} />}
                  Supprimer
                </button>
              </div>
            </div>
          ) : canEdit ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setMode('edit'); setActionError(null) }}
                disabled={working}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-full bg-fond text-marine font-semibold text-sm hover:bg-border active:bg-border disabled:opacity-50 transition-colors"
              >
                <Pencil className="w-4 h-4" strokeWidth={1.9} />
                Modifier
              </button>
              <button
                type="button"
                onClick={handleToggleStatus}
                disabled={working}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-full bg-fond text-marine font-semibold text-sm hover:bg-border active:bg-border disabled:opacity-50 transition-colors"
              >
                {working ? (
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.2} />
                ) : isOpen ? (
                  <Lock className="w-4 h-4" strokeWidth={1.9} />
                ) : (
                  <Unlock className="w-4 h-4" strokeWidth={1.9} />
                )}
                {isOpen ? 'Clore' : 'Rouvrir'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={working}
                aria-label="Supprimer la carte"
                className="ml-auto inline-flex items-center justify-center w-10 h-10 rounded-full text-brique hover:bg-brique/10 active:bg-brique/10 disabled:opacity-50 transition-colors"
              >
                <Trash2 className="w-5 h-5" strokeWidth={1.9} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={closeIfIdle}
              className="w-full px-4 py-2.5 rounded-full bg-fond text-marine font-semibold text-sm hover:bg-border active:bg-border transition-colors"
            >
              Fermer
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
