// src/features/immobilier/immobilierStorage.js
// Helpers Storage pour le bucket immobilier-attachments.
// Pattern flat UUID : le nom du blob = l'id de la ligne immobilier_attachments.
// Calque sur discussionStorage.js et cabinetStorage.js.

import { supabase } from '../../lib/supabaseClient';
import { openOrDownload } from '../../lib/storageOpen';

const BUCKET = 'immobilier-attachments';
const MAX_BYTES = 25 * 1024 * 1024; // 25 Mo

// Types MIME acceptes (calque sur Discussion 7D)
const ACCEPTED_MIME_TYPES = [
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  // PDF
  'application/pdf',
  // Microsoft Office
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Apple iWork
  'application/vnd.apple.pages',
  'application/vnd.apple.numbers',
  'application/vnd.apple.keynote',
  'application/x-iwork-pages-sffpages',
  'application/x-iwork-numbers-sffnumbers',
  'application/x-iwork-keynote-sffkey',
];

export const IMMOBILIER_ATTACHMENT_LIMITS = {
  maxBytes: MAX_BYTES,
  acceptedMimeTypes: ACCEPTED_MIME_TYPES,
};

// Validation cote client : taille + type
export function validateAttachment(file) {
  if (!file) return { ok: false, reason: 'Aucun fichier selectionne.' };
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      reason: `Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(1)} Mo, max ${MAX_BYTES / 1024 / 1024} Mo).`,
    };
  }
  if (!ACCEPTED_MIME_TYPES.includes(file.type)) {
    return {
      ok: false,
      reason: `Type de fichier non supporte (${file.type || 'inconnu'}).`,
    };
  }
  return { ok: true };
}

// Upload : ecrit le blob dans Storage avec l'id genere comme nom de fichier,
// puis insere la ligne immobilier_attachments. Si l'INSERT echoue, on retire
// le blob orphelin.
export async function uploadAttachment({ cardId, file, currentUserId }) {
  const validation = validateAttachment(file);
  if (!validation.ok) {
    return { error: new Error(validation.reason) };
  }

  const id = crypto.randomUUID();

  // 1) Upload blob
  const { error: errUpload } = await supabase.storage
    .from(BUCKET)
    .upload(id, file, {
      contentType: file.type,
      upsert: false,
    });
  if (errUpload) return { error: errUpload };

  // 2) Insert DB
  const { error: errInsert } = await supabase
    .from('immobilier_attachments')
    .insert({
      id,
      card_id: cardId,
      nom: file.name,
      taille_octets: file.size,
      mime_type: file.type,
      auteur_id: currentUserId,
    });

  if (errInsert) {
    // Rollback : retirer le blob orphelin
    await supabase.storage.from(BUCKET).remove([id]);
    return { error: errInsert };
  }

  return { id };
}

// Suppression : on supprime la ligne en DB d'abord (la RLS auteur s'applique),
// puis on best-effort le blob. Si la suppression DB echoue, le blob reste.
// Si elle reussit mais que le blob ne peut pas etre supprime, ligne fantome
// inaccessible (perte de stockage uniquement, pas de fuite).
export async function deleteAttachment(attachmentId) {
  const { error: errDel } = await supabase
    .from('immobilier_attachments')
    .delete()
    .eq('id', attachmentId);
  if (errDel) return { error: errDel };

  await supabase.storage.from(BUCKET).remove([attachmentId]);
  return {};
}

// Ouverture : delegue au helper transverse openOrDownload qui choisit la
// strategie selon le type de fichier et le contexte :
//   - non previewable           -> telechargement Blob (nom propre preserve)
//   - previewable + PWA installee -> telechargement Blob (contourne iOS standalone)
//   - previewable + navigateur classique -> preview dans un nouvel onglet
//
// Note d'evolution : avant le refactor, cette fonction utilisait fetch() puis
// blob() pour le download, avec un round-trip reseau supplementaire. Le helper
// transverse utilise supabase.storage.download() qui est plus direct.
export async function openAttachment(attachment) {
  if (!attachment?.id) throw new Error('openAttachment: attachment.id requis');

  return openOrDownload({
    supabase,
    bucket: BUCKET,
    storagePath: attachment.id,
    filename: attachment.nom,
    mimeType: attachment.mime_type,
  });
}

// Helper pour formater une taille en Ko/Mo lisible
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

// Helper pour choisir l'icone selon le mime type (utilise par AttachmentChip).
// Renvoie une chaine de categorie : 'image' | 'pdf' | 'doc' | 'sheet' | 'slide' | 'file'.
export function fileTypeCategory(mimeType) {
  if (!mimeType) return 'file';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.includes('word') || mimeType.includes('pages')) return 'doc';
  if (mimeType.includes('excel') || mimeType.includes('sheet') || mimeType.includes('numbers')) return 'sheet';
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation') || mimeType.includes('keynote')) return 'slide';
  return 'file';
}
