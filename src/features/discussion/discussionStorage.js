import { supabase } from '../../lib/supabaseClient'

const BUCKET = 'discussion-attachments'
const PREVIEW_EXPIRES_IN = 300 // 5 minutes : laisse le temps de consulter

// Taille maximale d'une piece jointe : 25 Mo (alignee sur Cabinet pratique).
export const MAX_FILE_SIZE = 25 * 1024 * 1024

// Extensions acceptees. Sert a la fois a l'attribut accept de l'input file
// et a la validation cote application.
export const ACCEPTED_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif',
  '.pdf',
  '.doc', '.docx',
  '.xls', '.xlsx',
  '.ppt', '.pptx',
  '.pages', '.numbers', '.key',
]

// Types que les navigateurs savent afficher inline dans un onglet.
const PREVIEWABLE_MIME_PREFIXES = ['image/', 'video/', 'audio/', 'text/']
const PREVIEWABLE_MIME_EXACT = ['application/pdf']

/** Extension (avec le point, en minuscules) d'un nom de fichier. */
function fileExtension(filename) {
  const dot = (filename || '').lastIndexOf('.')
  return dot >= 0 ? filename.slice(dot).toLowerCase() : ''
}

/** Le navigateur sait-il afficher ce type directement dans un onglet ? */
export function isPreviewable(mimeType) {
  if (!mimeType) return false
  if (PREVIEWABLE_MIME_EXACT.includes(mimeType)) return true
  return PREVIEWABLE_MIME_PREFIXES.some((p) => mimeType.startsWith(p))
}

/**
 * Valide un fichier avant upload : extension autorisee et taille sous la
 * limite. Leve une Error au message lisible si le fichier est refuse.
 */
export function validateAttachmentFile(file) {
  if (!file) throw new Error('Aucun fichier selectionne.')
  const ext = fileExtension(file.name)
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    throw new Error(
      `Format non accepte (${ext || 'inconnu'}). Formats autorises : images, PDF, Word, Excel, PowerPoint, Pages, Numbers, Keynote.`
    )
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('Fichier trop volumineux (maximum 25 Mo).')
  }
}

/**
 * Met en forme une taille en octets pour l'affichage ("340 Ko", "1,2 Mo").
 */
export function formatFileSize(bytes) {
  if (!bytes || bytes < 0) return '0 Ko'
  if (bytes < 1024) return `${bytes} o`
  const ko = bytes / 1024
  if (ko < 1024) return `${Math.round(ko)} Ko`
  const mo = ko / 1024
  return `${mo.toFixed(mo < 10 ? 1 : 0).replace('.', ',')} Mo`
}

/**
 * Televerse un fichier dans le bucket des pieces jointes de discussion.
 *
 * La cle Storage est un UUID sous un prefixe par carte. Le nom du fichier
 * n'est PAS inclus dans la cle (accents et espaces compliquent les cles
 * Storage) ; le vrai nom est conserve en base (discussion_attachments.filename).
 *
 * @param {string} cardId - carte a laquelle rattacher le fichier
 * @param {File}   file
 * @returns {Promise<{ storagePath: string }>}
 */
export async function uploadAttachmentFile(cardId, file) {
  if (!cardId) throw new Error('uploadAttachmentFile: cardId requis')
  if (!file) throw new Error('uploadAttachmentFile: fichier requis')

  const storagePath = `${cardId}/${crypto.randomUUID()}${fileExtension(file.name)}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      contentType: file.type || undefined,
      upsert: false,
    })

  if (error) throw error
  return { storagePath }
}

/**
 * Supprime un fichier du bucket. A appeler AVANT de supprimer la ligne
 * discussion_attachments : la policy Storage de suppression exige que la
 * ligne existe encore (et que l'appelant en soit l'uploadeur).
 */
export async function removeAttachmentFile(storagePath) {
  if (!storagePath) throw new Error('removeAttachmentFile: storagePath requis')
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath])
  if (error) throw error
}

/**
 * Ouvre une piece jointe : previsualisation dans un nouvel onglet si le type
 * est affichable (image, PDF...), telechargement avec nom propre sinon (Word,
 * Excel... que le navigateur ne sait pas afficher).
 *
 * @param {string} storagePath - cle Storage (discussion_attachments.storage_path)
 * @param {string} filename    - nom original (discussion_attachments.filename)
 * @param {string} mimeType    - type MIME (discussion_attachments.mime_type)
 */
export async function openAttachment(storagePath, filename, mimeType) {
  if (!storagePath) throw new Error('openAttachment: storagePath requis')

  if (!isPreviewable(mimeType)) {
    return downloadAttachment(storagePath, filename)
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, PREVIEW_EXPIRES_IN)

  if (error) throw error
  if (!data?.signedUrl) throw new Error('URL signee invalide')

  // <a target="_blank"> passe mieux les bloqueurs de popups que window.open().
  const a = document.createElement('a')
  a.href = data.signedUrl
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

/**
 * Telecharge une piece jointe et declenche le download cote navigateur,
 * en preservant le nom de fichier original (accents et Unicode compris).
 *
 * Strategie Blob : l'attribut 'download' respecte le nom UTF-8, alors que
 * le Content-Disposition d'une URL signee peut faire fuiter le percent-encoding.
 * Limite : charge le fichier entier en memoire (max 25 Mo dans notre cas, OK).
 */
export async function downloadAttachment(storagePath, filename) {
  if (!storagePath) throw new Error('downloadAttachment: storagePath requis')

  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath)

  if (error) throw error
  if (!data) throw new Error('Fichier vide')

  const blobUrl = URL.createObjectURL(data)
  try {
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename || storagePath
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } finally {
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
  }
}
