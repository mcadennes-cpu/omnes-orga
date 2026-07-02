// src/lib/storageOpen.js
// Helper transverse pour ouvrir un fichier Storage Supabase.
//
// Probleme resolu : en mode PWA standalone iOS (app installee sur ecran
// d'accueil), Safari bloque window.open() et <a target="_blank"> apres une
// operation asynchrone (au-dela d'un cycle d'evenement apres le clic). En
// consequence, cliquer sur une PJ ne faisait rien sur iPhone alors que ca
// marchait en Mac et en Safari iOS non-installe.
//
// Solution : en mode standalone, on bascule systematiquement sur un
// telechargement Blob, qui passe par la feuille de partage native iOS
// ("Ouvrir dans Apercu", "Photos", "Fichiers", etc.). En desktop ou Safari
// iOS classique, on garde le comportement actuel (preview dans un nouvel
// onglet si le type est affichable, sinon telechargement).

// Types que les navigateurs savent afficher inline dans un onglet
const PREVIEWABLE_MIME_PREFIXES = ['image/', 'video/', 'audio/', 'text/']
const PREVIEWABLE_MIME_EXACT = ['application/pdf']

/**
 * Indique si le navigateur peut afficher ce type de fichier directement
 * dans un onglet (PDF, image, video, audio, texte).
 */
export function isPreviewable(mimeType) {
  if (!mimeType) return false
  if (PREVIEWABLE_MIME_EXACT.includes(mimeType)) return true
  return PREVIEWABLE_MIME_PREFIXES.some((p) => mimeType.startsWith(p))
}

/**
 * Indique si ce type de fichier est une image (affichable inline dans un
 * <img>). Sert a router les images vers la visionneuse integree plutot que
 * vers l'ouverture externe, qui se comporte mal en PWA iOS et sur Android.
 */
export function isImage(mimeType) {
  return Boolean(mimeType) && mimeType.startsWith('image/')
}

/**
 * Genere une URL signee temporaire pour un fichier d'un bucket prive.
 * Utilisee par la visionneuse d'image : on pose l'URL comme src d'un <img>,
 * ce qui affiche la photo DANS l'app, sans ouverture externe.
 *
 * @returns {Promise<string>} l'URL signee
 */
export async function createSignedImageUrl({ supabase, bucket, storagePath, expiresIn = 300 }) {
  if (!supabase) throw new Error('createSignedImageUrl: supabase requis')
  if (!bucket) throw new Error('createSignedImageUrl: bucket requis')
  if (!storagePath) throw new Error('createSignedImageUrl: storagePath requis')
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, expiresIn)
  if (error) throw error
  if (!data?.signedUrl) throw new Error('URL signee invalide')
  return data.signedUrl
}

/**
 * Detecte iOS / iPadOS via l'user-agent. Inclut le cas de l'iPad recent qui
 * se declare comme un Mac (UA "Macintosh" + ecran tactile) — meme logique
 * que detectPlatform() dans useInstallPrompt.js, pour rester coherent.
 */
export function isIos() {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent.toLowerCase()
  const isIOS = /iphone|ipad|ipod/.test(ua)
  const isIPadDesktop =
    ua.includes('macintosh') && navigator.maxTouchPoints > 1
  return isIOS || isIPadDesktop
}

/**
 * Indique si l'application tourne en mode PWA installee (ajoutee a l'ecran
 * d'accueil, lancee comme une app native).
 *
 * - iOS Safari expose navigator.standalone (booleen, deprecated mais
 *   toujours supporte sur iPhone/iPad).
 * - Les autres plateformes (Android Chrome, desktop installe) exposent
 *   matchMedia('(display-mode: standalone)').
 */
export function isStandaloneMode() {
  if (typeof window === 'undefined') return false
  const matchMediaStandalone =
    window.matchMedia &&
    window.matchMedia('(display-mode: standalone)').matches
  const iosStandalone = window.navigator && window.navigator.standalone === true
  return Boolean(matchMediaStandalone || iosStandalone)
}

/**
 * Indique si on est en PWA installee sur iOS/iPadOS specifiquement (pas
 * n'importe quelle PWA standalone). Sert a cibler le contournement du
 * blocage window.open() de Safari/WebKit iOS, qui ne concerne pas les PWA
 * desktop (Mac/PC), ou window.open() fonctionne normalement.
 */
export function isIosStandalone() {
  return isIos() && isStandaloneMode()
}

/**
 * Telecharge un blob depuis Supabase Storage et declenche le download cote
 * navigateur, avec le nom de fichier original preservant accents et caracteres
 * Unicode (y compris les formes NFD que macOS utilise pour ses screenshots).
 *
 * Strategie Blob : l'attribut 'download' respecte le nom UTF-8 quel que soit
 * son contenu, alors que le Content-Disposition d'une URL signee cross-origin
 * peut faire fuiter le percent-encoding dans le nom du fichier sauvegarde.
 *
 * Limite : charge le fichier entier en memoire (max 25 Mo dans notre cas, OK).
 *
 * @param {object} params
 * @param {object} params.supabase      Client Supabase
 * @param {string} params.bucket        Nom du bucket Storage
 * @param {string} params.storagePath   Cle Storage du fichier
 * @param {string} params.filename      Nom de fichier original pour le download
 */
async function downloadBlob({ supabase, bucket, storagePath, filename }) {
  const { data, error } = await supabase.storage.from(bucket).download(storagePath)
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

/**
 * Ouvre un fichier Supabase Storage en choisissant la meilleure strategie
 * selon le type de fichier et le contexte d'execution.
 *
 * Logique de decision :
 *   - Type non previewable        -> telechargement Blob (nom propre)
 *   - Previewable + standalone    -> telechargement Blob (contourne le
 *                                    bloqueur iOS PWA)
 *   - Previewable + desktop/web   -> ouverture dans un nouvel onglet via URL
 *                                    signee (preview natif du navigateur)
 *
 * @param {object} params
 * @param {object} params.supabase     Client Supabase (passe en parametre
 *                                     pour eviter une dependance directe et
 *                                     faciliter les tests futurs)
 * @param {string} params.bucket       Nom du bucket Storage
 * @param {string} params.storagePath  Cle Storage du fichier
 * @param {string} params.filename     Nom de fichier original
 * @param {string} params.mimeType     MIME type stocke en DB
 * @param {number} [params.expiresIn=300] Duree de validite de l'URL signee
 *                                        en secondes (par defaut 5 min)
 */
export async function openOrDownload({
  supabase,
  bucket,
  storagePath,
  filename,
  mimeType,
  expiresIn = 300,
}) {
  if (!supabase) throw new Error('openOrDownload: supabase requis')
  if (!bucket) throw new Error('openOrDownload: bucket requis')
  if (!storagePath) throw new Error('openOrDownload: storagePath requis')

  // Cas 1 : type non previewable -> toujours telecharger
  if (!isPreviewable(mimeType)) {
    return downloadBlob({ supabase, bucket, storagePath, filename })
  }

  // Cas 2 : previewable mais on est en PWA installee -> telecharger pour
  // contourner le bloqueur de window.open / <a target="_blank"> apres un
  // await, specifique a Safari/WebKit en PWA iOS. Ne s'applique pas aux PWA
  // desktop (Mac/PC), ou window.open() fonctionne normalement apres un await.
  // Le fichier s'ouvrira via la feuille de partage native iOS.
  if (isIosStandalone()) {
    return downloadBlob({ supabase, bucket, storagePath, filename })
  }

  // Cas 3 : previewable + navigateur classique -> preview dans un nouvel onglet
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, expiresIn)

  if (error) throw error
  if (!data?.signedUrl) throw new Error('URL signee invalide')

  // <a target="_blank"> passe mieux les bloqueurs de popups que window.open()
  const a = document.createElement('a')
  a.href = data.signedUrl
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
