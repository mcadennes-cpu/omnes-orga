import { useEffect, useRef, useState } from 'react'
import { MoreVertical, Pencil, Archive, ArchiveRestore, Trash2 } from 'lucide-react'

/**
 * Menu trois-points du header d'un tableau de discussion.
 * Chaque entree n'apparait que si l'utilisateur en a le droit ;
 * si aucune action n'est disponible, le composant ne rend rien.
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
  const ref = useRef(null)

  // Fermeture au clic exterieur
  useEffect(() => {
    if (!open) return undefined
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Fermeture sur Escape
  useEffect(() => {
    if (!open) return undefined
    const handler = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  const hasAnyAction = canRename || canArchive || canDelete
  if (!hasAnyAction) return null

  const runAction = (fn) => {
    setOpen(false)
    if (fn) fn()
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Actions du tableau"
        aria-haspopup="true"
        aria-expanded={open}
        className="w-9 h-9 rounded-full flex items-center justify-center text-marine hover:bg-marine/5 active:bg-marine/5 transition-colors"
      >
        <MoreVertical className="w-5 h-5" strokeWidth={2} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 w-56 bg-carte rounded-card shadow-2xl border border-border py-1 z-30"
        >
          {canRename && (
            <button
              type="button"
              role="menuitem"
              onClick={() => runAction(onRename)}
              className="w-full px-3 py-2.5 flex items-center gap-2.5 text-marine text-sm hover:bg-fond active:bg-fond transition-colors"
            >
              <Pencil className="w-4 h-4 text-muted" strokeWidth={1.9} />
              Renommer le tableau
            </button>
          )}
          {canArchive && (
            <button
              type="button"
              role="menuitem"
              onClick={() => runAction(onToggleArchive)}
              className="w-full px-3 py-2.5 flex items-center gap-2.5 text-marine text-sm hover:bg-fond active:bg-fond transition-colors"
            >
              {isArchived ? (
                <ArchiveRestore className="w-4 h-4 text-muted" strokeWidth={1.9} />
              ) : (
                <Archive className="w-4 h-4 text-muted" strokeWidth={1.9} />
              )}
              {isArchived ? 'Désarchiver le tableau' : 'Archiver le tableau'}
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              role="menuitem"
              onClick={() => runAction(onDelete)}
              className="w-full px-3 py-2.5 flex items-center gap-2.5 text-brique text-sm hover:bg-brique/5 active:bg-brique/5 transition-colors"
            >
              <Trash2 className="w-4 h-4" strokeWidth={1.9} />
              Supprimer le tableau
            </button>
          )}
        </div>
      )}
    </div>
  )
}
