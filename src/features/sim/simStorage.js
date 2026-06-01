import { supabase } from '../../lib/supabaseClient'
import { openOrDownload } from '../../lib/storageOpen'

const BUCKET = 'sim'

/**
 * Ouvre un fichier SIM. Delegue au helper transverse openOrDownload qui
 * choisit la strategie selon le type de fichier et le contexte :
 *   - non previewable           -> telechargement Blob (nom propre preserve)
 *   - previewable + PWA installee -> telechargement Blob (contourne iOS standalone)
 *   - previewable + navigateur classique -> preview dans un nouvel onglet
 *
 * @param {string} id        UUID du fichier (= nom physique dans Storage)
 * @param {string} nom       Nom de fichier original
 * @param {string} mimeType  MIME type stocke en DB (sim_fichiers.mime_type)
 */
export async function openSimFile(id, nom, mimeType) {
  if (!id) throw new Error('openSimFile: id requis')

  return openOrDownload({
    supabase,
    bucket: BUCKET,
    storagePath: id,
    filename: nom,
    mimeType,
  })
}

/**
 * Telecharge un fichier SIM et declenche le download cote navigateur, avec le
 * nom de fichier original preservant les accents et caracteres Unicode
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
export async function downloadSimFile(id, nom) {
  if (!id) throw new Error('downloadSimFile: id requis')

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

/**
 * Supprime le blob d'un fichier SIM dans le bucket Storage.
 * Cleanup best-effort : a appeler APRES le DELETE de la ligne sim_fichiers en
 * base. Si ce nettoyage echoue, on a un blob orphelin (inaccessible, sans fuite
 * de donnees) — meme strategie qu'en Cabinet pratique et Evenements.
 *
 * @param {string} id  UUID du fichier (= nom physique du blob)
 */
export async function removeSimBlob(id) {
  if (!id) throw new Error('removeSimBlob: id requis')
  const { error } = await supabase.storage.from(BUCKET).remove([id])
  if (error) throw error
}
