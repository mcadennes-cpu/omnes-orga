import { supabase } from '../../lib/supabaseClient'
import { openOrDownload, createSignedImageUrl } from '../../lib/storageOpen'

const BUCKET = 'evenements'

/**
 * Ouvre un document d'evenement. Delegue au helper transverse openOrDownload
 * qui choisit la strategie selon le type de fichier et le contexte :
 *   - non previewable           -> telechargement Blob (nom propre preserve)
 *   - previewable + PWA installee -> telechargement Blob (contourne iOS standalone)
 *   - previewable + navigateur classique -> preview dans un nouvel onglet
 *
 * @param {string} id        UUID du fichier (= nom physique dans Storage)
 * @param {string} nom       Nom de fichier original
 * @param {string} mimeType  MIME type stocke en DB (evenement_fichiers.mime_type)
 */
export async function openEvenementFile(id, nom, mimeType) {
  if (!id) throw new Error('openEvenementFile: id requis')

  return openOrDownload({
    supabase,
    bucket: BUCKET,
    storagePath: id,
    filename: nom,
    mimeType,
  })
}

/**
 * Genere une URL signee pour afficher une image (document d'evenement)
 * directement dans l'app via la visionneuse integree. Bucket prive -> URL
 * signee requise.
 */
export async function getEvenementImageUrl(id) {
  if (!id) throw new Error('getEvenementImageUrl: id requis')
  return createSignedImageUrl({ supabase, bucket: BUCKET, storagePath: id })
}

/**
 * Telecharge un document d'evenement et declenche le download cote
 * navigateur, avec le nom de fichier original preservant accents et
 * caracteres Unicode. Strategie Blob, comme cabinetStorage.downloadCabinetFile.
 *
 * Limite : charge le fichier entier en memoire (max 25 Mo, OK).
 *
 * @param {string} id   UUID du fichier
 * @param {string} nom  Nom de fichier original a utiliser pour le download
 */
export async function downloadEvenementFile(id, nom) {
  if (!id) throw new Error('downloadEvenementFile: id requis')

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(id)

  if (error) throw error
  if (!data) throw new Error('Fichier vide')

  const blobUrl = URL.createObjectURL(data)
  try {
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = nom || id
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } finally {
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
  }
}
