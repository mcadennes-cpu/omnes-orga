import { useState } from 'react'
import { Image, FileText, FileSpreadsheet, File, X, Loader2 } from 'lucide-react'
import { formatFileSize } from './discussionStorage'

/** Choisit l'icone d'apres l'extension du fichier. */
function iconForFile(filename) {
  const ext = (filename || '').toLowerCase().split('.').pop()
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'].includes(ext)) return Image
  if (['xls', 'xlsx', 'numbers'].includes(ext)) return FileSpreadsheet
  if (['pdf', 'doc', 'docx', 'ppt', 'pptx', 'pages', 'key'].includes(ext)) return FileText
  return File
}

/**
 * Chip d'une piece jointe de carte.
 * - Tap sur le chip : ouvre le fichier (previsualisation ou telechargement).
 * - Bouton de suppression : seulement si canDelete (uploadeur + carte ouverte),
 *   avec une confirmation inline.
 *
 * @param {Object} props
 * @param {Object} props.attachment  piece jointe enrichie (cf. useCard)
 * @param {boolean} props.canDelete
 * @param {(attachment: Object) => void} props.onOpen
 * @param {(attachment: Object) => Promise} props.onDelete
 */
export default function AttachmentChip({ attachment, canDelete, onOpen, onDelete }) {
  const [mode, setMode] = useState('view') // 'view' | 'confirmDelete'
  const [working, setWorking] = useState(false)
  const [actionError, setActionError] = useState(null)

  const Icon = iconForFile(attachment.filename)

  const handleDelete = async () => {
    if (working) return
    setWorking(true)
    setActionError(null)
    try {
      await onDelete(attachment)
      // La piece jointe disparait de la liste ; pas de reset necessaire.
    } catch (err) {
      console.error('[AttachmentChip] delete error:', err)
      setActionError(err?.message || 'Suppression impossible.')
      setWorking(false)
    }
  }

  if (mode === 'confirmDelete') {
    return (
      <div className="px-3 py-2 rounded-input bg-brique/10">
        <div className="flex items-center justify-between gap-2">
          <span className="text-marine text-sm font-medium min-w-0 truncate">
            Supprimer cette pièce jointe ?
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => { setMode('view'); setActionError(null) }}
              disabled={working}
              className="px-2.5 py-1 rounded-full text-muted font-semibold text-xs hover:text-marine disabled:opacity-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={working}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brique text-white font-semibold text-xs disabled:opacity-40 active:opacity-80 transition-opacity"
            >
              {working && <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2.2} />}
              Supprimer
            </button>
          </div>
        </div>
        {actionError && <p className="mt-1 text-brique text-xs">{actionError}</p>}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 rounded-input bg-fond border border-border">
      <button
        type="button"
        onClick={() => onOpen(attachment)}
        className="flex-1 min-w-0 flex items-center gap-2.5 px-2.5 py-2 text-left active:opacity-70 transition-opacity"
      >
        <span className="shrink-0 w-8 h-8 rounded-tile bg-carte flex items-center justify-center">
          <Icon className="w-4 h-4 text-canard" strokeWidth={1.9} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-marine text-sm font-medium">
            {attachment.filename}
          </span>
          <span className="block text-faint text-[11px]">
            {formatFileSize(attachment.sizeBytes)}
          </span>
        </span>
      </button>
      {canDelete && (
        <button
          type="button"
          onClick={() => setMode('confirmDelete')}
          aria-label={`Supprimer ${attachment.filename}`}
          className="shrink-0 w-8 h-8 mr-1 rounded-full flex items-center justify-center text-faint hover:text-brique hover:bg-brique/5 transition-colors"
        >
          <X className="w-4 h-4" strokeWidth={2} />
        </button>
      )}
    </div>
  )
}
