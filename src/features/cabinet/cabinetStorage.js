import { supabase } from '../../lib/supabaseClient'

const BUCKET = 'cabinet-pratique'
const PREVIEW_EXPIRES_IN = 300 // 5 minutes - laisse a l'utilisateur le temps de lire

// Types que les navigateurs savent afficher inline dans un onglet
const PREVIEWABLE_MIME_PREFIXES = ['image/', 'video/', 'audio/', 'text/']
const PREVIEWABLE_MIME_EXACT = ['application/pdf']

function isPreviewable(mimeType) {
  if (!mimeType) return false
  if (PREVIEWABLE_MIME_EXACT.includes(mimeType)) return true
  return PREVIEWABLE_MIME_PREFIXES.some((p) => mimeType.startsWith(p))
}

/**
 * Ouvre un fichier du cabinet : preview dans un nouvel onglet si le type est
 * previewable (PDF, image, video, audio, texte), telechargement avec nom propre
 * sinon (Word, Pages, Excel, archives, etc. que le navigateur ne sait pas
 * afficher).
 *
 * @param {string} id        UUID du fichier
 * @param {string} nom       Nom de fichier original
 * @param {string} mimeType  MIME type stocke en DB (champ cabinet_fichiers.mime_type)
 */
export async function openCabinetFile(id, nom, mimeType) {
  if (!id) throw new Error('openCabinetFile: id requis')

  // Type non previewable : on tombe sur le telechargement (avec nom propre)
  if (!isPreviewable(mimeType)) {
    return downloadCabinetFile(id, nom)
  }

  // Type previewable : ouverture dans un nouvel onglet via URL signee
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(id, PREVIEW_EXPIRES_IN)

  if (error) throw error
  if (!data?.signedUrl) throw new Error('URL signee invalide')

  // <a target="_blank"> est plus tolere par les popup blockers que window.open()
  const a = document.createElement('a')
  a.href = data.signedUrl
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
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
