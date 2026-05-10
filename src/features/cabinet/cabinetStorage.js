import { supabase } from '../../lib/supabaseClient'

const BUCKET = 'cabinet-pratique'

/**
 * Telecharge un fichier du cabinet et declenche le download cote navigateur,
 * avec le nom de fichier original preservant les accents et caracteres Unicode
 * (y compris les formes NFD que macOS utilise pour ses screenshots natifs).
 *
 * Strategie : on recupere le fichier comme Blob via supabase.storage.download(),
 * puis on cree une URL Blob locale et on declenche le download via <a download>.
 * L'attribut 'download' du <a> respecte le nom UTF-8 quel que soit son contenu,
 * alors que le Content-Disposition d'une URL signee cross-origin peut faire leak
 * le percent-encoding dans le nom du fichier sauvegarde sur disque.
 *
 * Limite : charge le fichier entier en memoire (max 25 Mo dans notre cas, OK).
 *
 * @param {string} id   UUID du fichier (= chemin physique dans le bucket)
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
    // Liberer l'URL Blob apres un court delai pour laisser le navigateur initier le download
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
  }
}
