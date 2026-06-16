// src/features/immobilier/AttachmentChip.jsx
// Chip horizontale d'une piece jointe.
// - Icone (selon type) + nom (tronque) + taille
// - Clic sur la chip : image -> visionneuse integree (reste dans l'app) ;
//   autre type -> preview/telechargement via openAttachment (comportement
//   existant)
// - Bouton croix dedie si l'utilisateur en est l'auteur (et carte ouverte)
//
// Note : la chip n'est pas un <button> mais un <div role="button"> pour
// pouvoir contenir un vrai <button> (la croix) sans imbrication HTML invalide.

import { useState } from 'react';
import {
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  Presentation,
  Paperclip,
  X,
} from 'lucide-react';
import {
  openAttachment,
  getAttachmentImageUrl,
  downloadAttachment,
  formatBytes,
  fileTypeCategory,
} from './immobilierStorage';
import { isImage } from '../../lib/storageOpen';
import ConfirmModal from '../../components/ConfirmModal';
import ImageViewerModal from '../../components/common/ImageViewerModal';

const ICON_BY_CATEGORY = {
  image: ImageIcon,
  pdf: FileText,
  doc: FileText,
  sheet: FileSpreadsheet,
  slide: Presentation,
  file: Paperclip,
};

export default function AttachmentChip({
  attachment,
  canDelete,
  onDelete,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [viewer, setViewer] = useState({ open: false, src: null });

  const Icon = ICON_BY_CATEGORY[fileTypeCategory(attachment.mime_type)] || Paperclip;

  async function handleOpen() {
    if (busy) return;
    setError(null);

    // Image : affichage dans la visionneuse integree (reste dans l'app,
    // fonctionne sur iOS PWA installee et sur Android). Le chargement de
    // l'URL signee est asynchrone, sans impact (on ne fait pas window.open).
    if (isImage(attachment.mime_type)) {
      setViewer({ open: true, src: null });
      try {
        const url = await getAttachmentImageUrl(attachment);
        setViewer((v) => (v.open ? { ...v, src: url } : v));
      } catch (err) {
        setViewer({ open: false, src: null });
        setError(err);
      }
      return;
    }

    // Autre type : comportement existant.
    setBusy(true);
    try {
      await openAttachment(attachment);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  function handleDeleteClick(e) {
    e.stopPropagation();
    if (busy) return;
    setConfirmOpen(true);
  }

  async function handleConfirmDelete() {
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await onDelete(attachment.id);
      if (err) throw err;
      setConfirmOpen(false);
    } catch (err) {
      setError(err);
      setConfirmOpen(false);
      throw err; // propager pour que ConfirmModal puisse afficher son erreur interne
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(e) {
    // Accessibilite : Espace ou Entree activent la chip
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleOpen();
    }
  }

  return (
    <div className="flex flex-col gap-1 flex-shrink-0">
      <div
        role="button"
        tabIndex={busy ? -1 : 0}
        onClick={handleOpen}
        onKeyDown={handleKeyDown}
        aria-disabled={busy}
        className={`flex items-center gap-2 px-3 py-2
                    bg-fond border border-border rounded-input
                    hover:bg-border transition-colors
                    max-w-[240px] cursor-pointer
                    ${busy ? 'opacity-50 cursor-wait' : ''}
                    focus:outline-none focus:ring-2 focus:ring-canard`}
        title={attachment.nom}
      >
        <Icon size={18} className="text-canard flex-shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1 text-left">
          <p className="text-body-m text-ink truncate">{attachment.nom}</p>
          <p className="text-caption text-faint">{formatBytes(attachment.taille_octets)}</p>
        </div>
        {canDelete && (
          <button
            type="button"
            onClick={handleDeleteClick}
            disabled={busy}
            className="p-1 text-muted hover:text-brique
                       rounded-pill hover:bg-brique/10
                       disabled:opacity-50 flex-shrink-0"
            aria-label="Supprimer la piece jointe"
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      {error && (
        <p className="text-caption text-brique max-w-[240px] truncate">
          {error.message}
        </p>
      )}
      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Supprimer la piece jointe ?"
        message={`Vous etes sur le point de supprimer "${attachment.nom}". Cette action est definitive.`}
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        danger
        onConfirm={handleConfirmDelete}
      />
      <ImageViewerModal
        open={viewer.open}
        src={viewer.src}
        alt={attachment.nom}
        onClose={() => setViewer({ open: false, src: null })}
        onDownload={() => downloadAttachment(attachment)}
      />
    </div>
  );
}
