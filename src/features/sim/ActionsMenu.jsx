import { createPortal } from 'react-dom'
import { X, Pencil, Download, Trash2 } from 'lucide-react'

/**
 * Bottom-sheet declenche par le bouton "..." sur une ligne dossier ou fichier
 * SIM. Liste les actions disponibles selon le type ET les droits de
 * l'utilisateur sur cet element precis.
 *
 * Droits (calcules par le parent via canEditSim / canDeleteSim) :
 * - canEdit   : affiche "Renommer".
 * - canDelete : affiche "Supprimer".
 * - "Telecharger" est toujours affiche pour un fichier (tout membre SIM peut
 *   telecharger), jamais pour un dossier.
 *
 * Note : le parent n'ouvre PAS ce menu si aucune action n'est possible (pour un
 * dossier dont on n'est pas l'auteur, canEdit et canDelete sont faux et il n'y
 * a pas de Telecharger -> pas de menu). Ce composant gere quand meme le cas par
 * securite en n'affichant que ce qui est autorise.
 *
 * Props :
 * - kind        : 'folder' | 'file'
 * - name        : nom affiche en titre du sheet
 * - canEdit     : booleen, affiche "Renommer"
 * - canDelete   : booleen, affiche "Supprimer"
 * - onClose     : fermeture sans action
 * - onRename    : declenche le RenameModal (parent)
 * - onDownload  : (fichier uniquement) declenche downloadSimFile
 * - onDelete    : declenche le DeleteConfirmModal (parent)
 */
export default function ActionsMenu({
  kind,
  name,
  canEdit = false,
  canDelete = false,
  onClose,
  onRename,
  onDownload,
  onDelete,
}) {
  const isFile = kind === 'file'

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="actions-menu-title"
      className="fixed inset-0 z-[100] flex items-end justify-center"
      style={{
        background: 'rgba(28,61,82,0.40)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-carte rounded-t-2xl p-5 pt-4"
        style={{ boxShadow: '0 20px 40px -12px rgba(28,61,82,0.25)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2
            id="actions-menu-title"
            className="font-display font-extrabold text-lg text-marine truncate pr-2"
          >
            {name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="h-9 w-9 flex items-center justify-center rounded-full shrink-0"
          >
            <X size={20} className="text-muted" />
          </button>
        </div>

        <div className="flex flex-col gap-1">
          {canEdit && (
            <button
              type="button"
              onClick={onRename}
              className="w-full h-12 px-3 rounded-xl flex items-center gap-3 text-left active:bg-fond"
            >
              <Pencil size={18} className="text-marine shrink-0" />
              <span className="font-sans font-semibold text-[15px] text-marine">
                Renommer
              </span>
            </button>
          )}

          {isFile && (
            <button
              type="button"
              onClick={onDownload}
              className="w-full h-12 px-3 rounded-xl flex items-center gap-3 text-left active:bg-fond"
            >
              <Download size={18} className="text-marine shrink-0" />
              <span className="font-sans font-semibold text-[15px] text-marine">
                Télécharger
              </span>
            </button>
          )}

          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="w-full h-12 px-3 rounded-xl flex items-center gap-3 text-left active:bg-brique/10"
            >
              <Trash2 size={18} className="text-brique shrink-0" />
              <span className="font-sans font-semibold text-[15px] text-brique">
                Supprimer
              </span>
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
