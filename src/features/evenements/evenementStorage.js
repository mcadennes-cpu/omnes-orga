import { supabase } from '../../lib/supabaseClient'

const BUCKET = 'evenements'
const PREVIEW_EXPIRES_IN = 300 // 5 minutes

// Types que les navigateurs savent afficher inline dans un onglet
const PREVIEWABLE_MIME_PREFIXES = ['image/', 'video/', 'audio/', 'text/']
const PREVIEWABLE_MIME_EXACT = ['application/pdf']

function isPreviewable(mimeType) {
  if (!mimeType) return false
  if (PREVIEWABLE_MIME_EXACT.includes(mimeType)) return true
  return PREVIEWABLE_MIME_PREFIXES.some((p) => mimeType.startsWith(p))
}

/**
 * Ouvre un document d'evenement : preview dans un nouvel onglet si le type
 * est previewable (PDF, image, video, audio, texte), telechargement avec
 * nom propre sinon. Calque sur cabinetStorage.openCabinetFile.
 *
 * @param {string} id        UUID du fichier (= nom physique dans Storage)
 * @param {string} nom       Nom de fichier original
 * @param {string} mimeType  MIME type stocke en DB (evenement_fichiers.mime_type)
 */
export async function openEvenementFile(id, nom, mimeType) {
  if (!id) throw new Error('openEvenementFile: id requis')

  // Type non previewable : on tombe sur le telechargement (avec nom propre)
  if (!isPreviewable(mimeType)) {
    return downloadEvenementFile(id, nom)
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(id, PREVIEW_EXPIRES_IN)

  if (error) throw error
  if (!data?.signedUrl) throw new Error('URL signee invalide')

  const a = document.createElement('a')
  a.href = data.signedUrl
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
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
