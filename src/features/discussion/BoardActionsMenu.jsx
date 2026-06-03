import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical, Pencil, Archive, ArchiveRestore, Trash2 } from 'lucide-react'

/**
 * Menu trois-points du header d'un tableau de discussion. Rendu en
 * bottom-sheet via Portal (sort du stacking context du header sticky qui
 * piegeait l'ancien dropdown CSS).
 *
 * @param {Object} props
 * @param {boolean} [props.canRename=false]
 * @param {boolean} [props.canArchive=false]
 * @param {boolean} [props.canDelete=false]
 * @param {boolean} [props.isArchived=false]  bascule le libelle Archiver/Desarchiver
 * @param {() => void} props.onRename
 * @param {() => void} props.onToggleArchive
 * @param {() => void} props.onDelete
 */
export default function BoardActionsMenu({
  canRename = false,
  canArchive = false,
  canDelete = false,
  isArchived = false,
  onRename,
  onToggleArchive,
  onDelete,
}) {
  const [open, setOpen] = useState(false)

  // Escape + scroll lock pendant l'ouverture
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

  const hasAnyAction = canRename || canArchive || canDelete
  if (!hasAnyAction) return null

  const items = []
  if (canRename) {
    items.push({
      key: 'rename',
      label: 'Renommer le tableau',
      icon: Pencil,
      onClick: onRename,
    })
  }
  if (canArchive) {
    items.push({
      key: 'archive',
      label: isArchived ? 'Désarchiver le tableau' : 'Archiver le tableau',
      icon: isArchived ? ArchiveRestore : Archive,
      onClick: onToggleArchive,
    })
  }
  if (canDelete) {
    items.push({
      key: 'delete',
      label: 'Supprimer le tableau',
      icon: Trash2,
      onClick: onDelete,
      danger: true,
    })
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Actions du tableau"
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
          aria-label="Actions du tableau"
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
