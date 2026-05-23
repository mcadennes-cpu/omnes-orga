// src/features/immobilier/CardAttachments.jsx
// Section "Pieces jointes" sous la description d'une carte.
// - Liste de chips scrollable horizontalement
// - Bouton "+ Ajouter une piece jointe" qui declenche l'input file
// - Validation taille + type cote client avant upload
// - Si carte close : section visible (chips ouvrables) mais ajout/suppression bloques

import { useRef, useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { uploadAttachment, validateAttachment, IMMOBILIER_ATTACHMENT_LIMITS } from './immobilierStorage';
import AttachmentChip from './AttachmentChip';

export default function CardAttachments({
  cardId,
  attachments,
  cardClosed,
  onDeleteAttachment,
}) {
  const { user } = useAuth();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  function handleClickAdd() {
    if (uploading || cardClosed) return;
    fileInputRef.current?.click();
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset pour pouvoir reuploader le meme fichier
    if (!file) return;

    setUploadError(null);

    // Validation cote client
    const validation = validateAttachment(file);
    if (!validation.ok) {
      setUploadError(validation.reason);
      return;
    }

    setUploading(true);
    const { error: err } = await uploadAttachment({
      cardId,
      file,
      currentUserId: user.id,
    });
    if (err) {
      setUploadError(err.message);
    }
    setUploading(false);
  }

  // Si pas de pieces jointes et carte close : on n'affiche rien.
  if (cardClosed && (!attachments || attachments.length === 0)) {
    return null;
  }

  return (
    <section className="bg-carte border-b border-border px-4 py-3">
      <h3 className="text-eyebrow text-muted mb-2">
        Pieces jointes ({attachments?.length || 0})
      </h3>

      {(!attachments || attachments.length === 0) && !cardClosed && (
        <p className="text-faint text-sm italic mb-2">Aucune piece jointe.</p>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {attachments?.map((att) => (
          <AttachmentChip
            key={att.id}
            attachment={att}
            canDelete={!cardClosed && att.auteur_id === user?.id}
            onDelete={onDeleteAttachment}
          />
        ))}

        {!cardClosed && (
          <button
            type="button"
            onClick={handleClickAdd}
            disabled={uploading}
            className="flex items-center gap-2 px-3 py-2
                       bg-fond border border-dashed border-border
                       rounded-input text-body-m text-canard
                       hover:bg-canard/10 transition-colors
                       disabled:opacity-50 flex-shrink-0"
          >
            {uploading ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                <span>Envoi...</span>
              </>
            ) : (
              <>
                <Plus size={16} aria-hidden="true" />
                <span>Ajouter</span>
              </>
            )}
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={IMMOBILIER_ATTACHMENT_LIMITS.acceptedMimeTypes.join(',')}
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {uploadError && (
        <p className="text-caption text-brique mt-2">
          {uploadError}
        </p>
      )}
    </section>
  );
}
