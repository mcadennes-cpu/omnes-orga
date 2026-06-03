import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical, Pencil, Lock, Unlock, Trash2 } from 'lucide-react'

/**
 * Menu trois-points du header d'une carte de discussion. Rendu en
 * bottom-sheet via Portal (sort du stacking context du header sticky qui
 * piegeait l'ancien dropdown CSS).
 *
 * @param {Object} props
 * @param {'open'|'closed'} props.cardStatus
 * @param {boolean} [props.canEdit=false]
 * @param {() => void} props.onEdit
 * @param {() => void} props.onToggleStatus
 * @param {() => void} props.onDelete
 */
export default function CardActionsMenu({
  cardStatus,
  canEdit = false,
  onEdit,
  onToggleStatus,
  onDelete,
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prev
    }
  }, [open])

  if (!canEdit) return null

  const isOpen = cardStatus === 'open'

  const items = [
    {
      key: 'edit',
      label: 'Modifier la carte',
      icon: Pencil,
      onClick: onEdit,
    },
    {
      key: 'toggle',
      label: isOpen ? 'Clore la carte' : 'Rouvrir la carte',
      icon: isOpen ? Lock : Unlock,
      onClick: onToggleStatus,
    },
    {
      key: 'delete',
      label: 'Supprimer la carte',
      icon: Trash2,
      onClick: onDelete,
      danger: true,
    },
  ]

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Actions de la carte"
        aria-haspopup="true"
        aria-expanded={open}
        className="w-9 h-9 rounded-full flex items-center justify-center text-marine hover:bg-marine/5 active:bg-marine/5 transition-colors"
      >
        <MoreVertical className="w-5 h-5" strokeWidth={2} />
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-marine/40 backdrop-blur-sm"
          onClick={handleBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label="Actions de la carte"
        >
          <div className="bg-carte rounded-t-2xl shadow-2xl animate-slide-up">
            <div className="pt-3 pb-1 flex justify-center">
              <div className="w-9 h-1 rounded-full bg-marine/18" />
            </div>
            <div className="px-2 py-2">
              {items.map((it) => {
                const Icon = it.icon
                return (
                  <button
                    key={it.key}
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      it.onClick?.()
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-input text-left text-body-m ${
                      it.danger
                        ? 'text-brique hover:bg-brique/10'
                        : 'text-ink hover:bg-fond'
                    }`}
                  >
                    <Icon size={20} aria-hidden="true" />
                    <span>{it.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
