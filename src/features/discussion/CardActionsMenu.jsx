import { useEffect, useRef, useState } from 'react'
import { MoreVertical, Pencil, Lock, Unlock, Trash2 } from 'lucide-react'

/**
 * Menu trois-points du header d'une carte de discussion.
 * N'apparait que si l'utilisateur peut editer la carte (canEdit) :
 * auteur de la carte, createur du tableau, ou super_admin.
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
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const handler = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  if (!canEdit) return null

  const isOpen = cardStatus === 'open'

  const runAction = (fn) => {
    setOpen(false)
    if (fn) fn()
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Actions de la carte"
        aria-haspopup="true"
        aria-expanded={open}
        className="w-9 h-9 rounded-full flex items-center justify-center text-marine hover:bg-marine/5 active:bg-marine/5 transition-colors"
      >
        <MoreVertical className="w-5 h-5" strokeWidth={2} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-52 bg-carte rounded-card shadow-2xl border border-border py-1 z-30"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(onEdit)}
            className="w-full px-3 py-2.5 flex items-center gap-2.5 text-marine text-sm hover:bg-fond active:bg-fond transition-colors"
          >
            <Pencil className="w-4 h-4 text-muted" strokeWidth={1.9} />
            Modifier la carte
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(onToggleStatus)}
            className="w-full px-3 py-2.5 flex items-center gap-2.5 text-marine text-sm hover:bg-fond active:bg-fond transition-colors"
          >
            {isOpen ? (
              <Lock className="w-4 h-4 text-muted" strokeWidth={1.9} />
            ) : (
              <Unlock className="w-4 h-4 text-muted" strokeWidth={1.9} />
            )}
            {isOpen ? 'Clore la carte' : 'Rouvrir la carte'}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(onDelete)}
            className="w-full px-3 py-2.5 flex items-center gap-2.5 text-brique text-sm hover:bg-brique/5 active:bg-brique/5 transition-colors"
          >
            <Trash2 className="w-4 h-4" strokeWidth={1.9} />
            Supprimer la carte
          </button>
        </div>
      )}
    </div>
  )
}
