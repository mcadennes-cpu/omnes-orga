import { supabase } from '../../lib/supabaseClient'
import { openOrDownload, createSignedImageUrl } from '../../lib/storageOpen'

const BUCKET = 'cabinet-pratique'

/**
 * Ouvre un fichier du cabinet. Delegue au helper transverse openOrDownload
 * qui choisit la strategie selon le type de fichier et le contexte :
 *   - non previewable           -> telechargement Blob (nom propre preserve)
 *   - previewable + PWA installee -> telechargement Blob (contourne iOS standalone)
 *   - previewable + navigateur classique -> preview dans un nouvel onglet
 *
 * @param {string} id        UUID du fichier (= nom physique dans Storage)
 * @param {string} nom       Nom de fichier original
 * @param {string} mimeType  MIME type stocke en DB (cabinet_fichiers.mime_type)
 */
export async function openCabinetFile(id, nom, mimeType) {
  if (!id) throw new Error('openCabinetFile: id requis')

  return openOrDownload({
    supabase,
    bucket: BUCKET,
    storagePath: id,
    filename: nom,
    mimeType,
  })
}

/**
 * Genere une URL signee pour afficher une image (fichier du cabinet)
 * directement dans l'app via la visionneuse integree. Bucket prive -> URL
 * signee requise. La cle Storage = l'id du fichier (= nom du blob).
 */
export async function getCabinetImageUrl(id) {
  if (!id) throw new Error('getCabinetImageUrl: id requis')
  return createSignedImageUrl({ supabase, bucket: BUCKET, storagePath: id })
}

/**
 * Telecharge un fichier du cabinet et declenche le download cote navigateur,
 * avec le nom de fichier original preservant les accents et caracteres Unicode
 * (y compris les formes NFD que macOS utilise pour ses screenshots natifs).
 *
 * Strategie Blob : le 'download' attribute respecte le nom UTF-8 quel que soit
 * son contenu, alors que le Content-Disposition d'une URL signee cross-origin
 * peut faire leak le percent-encoding dans le nom du fichier sauvegarde.
 *
 * Limite : charge le fichier entier en memoire (max 25 Mo dans notre cas, OK).
 *
 * @param {string} id   UUID du fichier
 * @param {string} nom  Nom de fichier original a utiliser pour le download
 */
export async function downloadCabinetFile(id, nom) {
  if (!id) throw new Error('downloadCabinetFile: id requis')

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
