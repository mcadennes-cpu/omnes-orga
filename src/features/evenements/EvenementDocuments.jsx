import { useState } from 'react'
import { Plus, Download, Trash2 } from 'lucide-react'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import { useEvenementFichiers } from './useEvenementFichiers'
import EvenementUploadModal from './EvenementUploadModal'
import { getFileTypeMeta, formatTaille } from './fileType'
import { openEvenementFile } from './evenementStorage'

// ----------------------------------------------------------------------------
// Sous-composant : une ligne de fichier
// ----------------------------------------------------------------------------

function FileRow({ fichier, canEdit, onOpen, onDelete }) {
  const { Icon, bg, text } = getFileTypeMeta(fichier.mime_type, fichier.nom)

  return (
    <div className="flex items-stretch">
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-w-0 flex items-center gap-3 p-3 text-left active:bg-fond transition-colors"
      >
        <div
          className={`w-10 h-10 rounded-pill flex items-center justify-center shrink-0 ${bg}`}
        >
          <Icon className={`w-5 h-5 ${text}`} strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-marine text-[14px] truncate">{fichier.nom}</p>
          <p className="text-muted text-[12px]">
            {formatTaille(fichier.taille_octets)}
          </p>
        </div>
        <Download className="w-4 h-4 text-faint shrink-0" strokeWidth={1.8} />
      </button>
      {canEdit && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Supprimer ${fichier.nom}`}
          className="px-3 flex items-center text-faint hover:text-brique active:text-brique transition-colors"
        >
          <Trash2 className="w-4 h-4" strokeWidth={1.8} />
        </button>
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Section Documents
// ----------------------------------------------------------------------------

/**
 * Section "Documents" de la page detail d'un evenement.
 * - Liste les documents attaches ; ouverture au clic (preview ou download).
 * - Si canEdit : import + suppression par document.
 * - Masquee entierement s'il n'y a aucun document ET que l'utilisateur ne
 *   peut pas en ajouter.
 */
export default function EvenementDocuments({ evenementId, canEdit }) {
  const { fichiers, loading, error, refetch, deleteFichier } =
    useEvenementFichiers(evenementId)

  const [uploadOpen, setUploadOpen] = useState(false)
  const [fichierASupprimer, setFichierASupprimer] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // Rien a afficher : aucun document et pas de droit d'ajout.
  if (!loading && !error && fichiers.length === 0 && !canEdit) {
    return null
  }

  async function handleOpen(fichier) {
    try {
      await openEvenementFile(fichier.id, fichier.nom, fichier.mime_type)
    } catch (err) {
      console.error('[EvenementDocuments] open error:', err)
    }
  }

  async function handleDelete() {
    if (!fichierASupprimer) return
    setDeleting(true)
    try {
      await deleteFichier(fichierASupprimer.id)
      setFichierASupprimer(null)
    } catch (err) {
      console.error('[EvenementDocuments] delete error:', err)
    } finally {
      setDeleting(false)
    }
  }

  function handleUploaded() {
    setUploadOpen(false)
    refetch()
  }

  return (
    <div>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint mb-2">
        Documents
        {fichiers.length > 0 && (
          <span className="text-muted"> · {fichiers.length}</span>
        )}
      </h2>

      {loading && <p className="text-muted text-sm py-2">Chargement…</p>}

      {!loading && error && (
        <p className="text-brique text-sm py-2">
          Impossible de charger les documents.
        </p>
      )}

      {!loading && !error && fichiers.length > 0 && (
        <div className="bg-carte rounded-card shadow-card overflow-hidden divide-y divide-border">
          {fichiers.map((f) => (
            <FileRow
              key={f.id}
              fichier={f}
              canEdit={canEdit}
              onOpen={() => handleOpen(f)}
              onDelete={() => setFichierASupprimer(f)}
            />
          ))}
        </div>
      )}

      {!loading && !error && fichiers.length === 0 && canEdit && (
        <p className="text-muted text-sm py-1">Aucun document pour l'instant.</p>
      )}

      {canEdit && (
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="mt-3 w-full h-11 rounded-input border border-border bg-carte text-marine font-semibold text-sm flex items-center justify-center gap-2 active:bg-fond transition-colors"
        >
          <Plus className="w-4 h-4" strokeWidth={2.2} />
          Ajouter un document
        </button>
      )}

      {uploadOpen && (
        <EvenementUploadModal
          evenementId={evenementId}
          onClose={() => setUploadOpen(false)}
          onUploaded={handleUploaded}
        />
      )}

      <ConfirmDialog
        open={Boolean(fichierASupprimer)}
        title="Supprimer ce document ?"
        message={
          fichierASupprimer
            ? `« ${fichierASupprimer.nom} » sera définitivement supprimé.`
            : ''
        }
        confirmLabel="Supprimer"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setFichierASupprimer(null)}
        submitting={deleting}
      />
    </div>
  )
}
