import { useRef, useState } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import AttachmentChip from './AttachmentChip'
import { ACCEPTED_EXTENSIONS, getAttachmentImageUrl, downloadAttachment } from './discussionStorage'
import { isImage } from '../../lib/storageOpen'
import ImageViewerModal from '../../components/common/ImageViewerModal'

/**
 * Section "Pieces jointes" de la vue carte, sous la description.
 * Affiche la liste des pieces jointes ; si la carte est ouverte (canManage),
 * propose l'ajout de fichiers et la suppression de ses propres pieces jointes.
 *
 * Clic sur une piece jointe : si c'est une image, on l'affiche dans la
 * visionneuse integree (reste dans l'app, fonctionne sur iOS PWA et Android) ;
 * sinon, on garde le comportement existant via onOpen (preview onglet ou
 * telechargement).
 *
 * @param {Object} props
 * @param {Array} props.attachments  pieces jointes (cf. useCard)
 * @param {string} props.userId      utilisateur courant
 * @param {boolean} props.canManage  faux si la carte est close (lecture seule)
 * @param {(attachment: Object) => void} props.onOpen
 * @param {(file: File) => Promise} props.onAdd
 * @param {(attachment: Object) => Promise} props.onDelete
 */
export default function CardAttachments({
  attachments = [],
  userId,
  canManage,
  onOpen,
  onAdd,
  onDelete,
}) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)

  // Visionneuse d'image integree
  const [viewer, setViewer] = useState({ open: false, src: null, attachment: null })

  // Carte close et aucune piece jointe : rien a montrer.
  if (attachments.length === 0 && !canManage) return null

  const handleOpen = async (attachment) => {
    // Image -> visionneuse integree. Le chargement de l'URL signee est
    // asynchrone, sans impact (on ne fait pas window.open).
    if (isImage(attachment.mimeType)) {
      setViewer({ open: true, src: null, attachment })
      try {
        const url = await getAttachmentImageUrl(attachment.storagePath)
        setViewer((v) => (v.attachment === attachment ? { ...v, src: url } : v))
      } catch (err) {
        console.error('[CardAttachments] image url error:', err)
        // Repli sur le comportement classique si l'URL ne peut etre generee.
        setViewer({ open: false, src: null, attachment: null })
        onOpen(attachment)
      }
      return
    }
    // Autre type : comportement existant.
    onOpen(attachment)
  }

  const closeViewer = () => setViewer({ open: false, src: null, attachment: null })

  const handleDownloadFromViewer = () => {
    const a = viewer.attachment
    if (a) downloadAttachment(a.storagePath, a.filename)
  }

  const handleFilesSelected = async (e) => {
    const files = Array.from(e.target.files || [])
    // Reinitialise l'input pour pouvoir reselectionner le meme fichier ensuite.
    e.target.value = ''
    if (files.length === 0) return

    setUploadError(null)
    setUploading(true)
    const errors = []
    for (const file of files) {
      try {
        await onAdd(file)
      } catch (err) {
        console.error('[CardAttachments] add error:', err)
        errors.push(`${file.name} : ${err?.message || 'echec'}`)
      }
    }
    setUploading(false)
    if (errors.length > 0) setUploadError(errors.join('\n'))
  }

  return (
    <section className="px-4 py-3 border-b border-border bg-carte">
      <span className="text-muted text-xs uppercase tracking-wider font-semibold">
        Pièces jointes{attachments.length > 0 ? ` (${attachments.length})` : ''}
      </span>

      {attachments.length > 0 ? (
        <div className="mt-2 space-y-1.5">
          {attachments.map((a) => (
            <AttachmentChip
              key={a.id}
              attachment={a}
              canDelete={canManage && a.uploadedBy === userId}
              onOpen={handleOpen}
              onDelete={onDelete}
            />
          ))}
        </div>
      ) : (
        <p className="mt-1 text-faint text-sm italic">Aucune pièce jointe.</p>
      )}

      {canManage && (
        <>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED_EXTENSIONS.join(',')}
            onChange={handleFilesSelected}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-input border border-dashed border-border text-muted text-sm font-medium hover:bg-fond active:bg-fond disabled:opacity-50 transition-colors"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.2} />
            ) : (
              <Plus className="w-4 h-4" strokeWidth={2.2} />
            )}
            {uploading ? 'Ajout en cours…' : 'Ajouter un fichier'}
          </button>
        </>
      )}

      {uploadError && (
        <p className="mt-2 text-brique text-xs whitespace-pre-line">{uploadError}</p>
      )}

      <ImageViewerModal
        open={viewer.open}
        src={viewer.src}
        alt={viewer.attachment?.filename || ''}
        onClose={closeViewer}
        onDownload={handleDownloadFromViewer}
      />
    </section>
  )
}
