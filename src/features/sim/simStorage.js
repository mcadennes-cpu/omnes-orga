import { supabase } from '../../lib/supabaseClient'

const BUCKET = 'sim'
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
 * Ouvre un fichier SIM : preview dans un nouvel onglet si le type est
 * previewable (PDF, image, video, audio, texte), telechargement avec nom propre
 * sinon (Word, Pages, Excel, archives, etc.).
 *
 * @param {string} id        UUID du fichier
 * @param {string} nom       Nom de fichier original
 * @param {string} mimeType  MIME type stocke en DB (champ sim_fichiers.mime_type)
 */
export async function openSimFile(id, nom, mimeType) {
  if (!id) throw new Error('openSimFile: id requis')

  // Type non previewable : on tombe sur le telechargement (avec nom propre)
  if (!isPreviewable(mimeType)) {
    return downloadSimFile(id, nom)
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
