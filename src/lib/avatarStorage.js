import { supabase } from './supabaseClient'

const BUCKET = 'avatars'

const MIME_BY_EXTENSION = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

function contentTypeFor(extension) {
  const ext = String(extension || '').toLowerCase()
  const mime = MIME_BY_EXTENSION[ext]
  if (!mime) throw new Error(`Extension non supportee : ${extension}`)
  return mime
}

/**
 * Televerse la photo de profil d'un utilisateur dans le bucket `avatars`.
 *
 * Le path Storage est plat : `{userId}.{ext}` (un seul fichier par user).
 * Upload en upsert : le precedent avatar est ecrase, donc pas de fichier
 * orphelin a nettoyer.
 *
 * @param {string} userId
 * @param {Blob}   blob       - blob produit par la compression (JPEG en pratique)
 * @param {('jpg'|'jpeg'|'png'|'webp')} extension
 * @returns {Promise<{ storagePath: string }>}
 */
export async function uploadAvatar(userId, blob, extension) {
  if (!userId) throw new Error('uploadAvatar: userId requis')
  if (!blob) throw new Error('uploadAvatar: blob requis')
  if (!extension) throw new Error('uploadAvatar: extension requise')

  const contentType = contentTypeFor(extension)
  const storagePath = `${userId}.${extension}`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, blob, {
      contentType,
      upsert: true,
    })

  if (error) throw error
  return { storagePath }
}

/**
 * Supprime un avatar du bucket.
 *
 * @param {string} photoPath - valeur de profiles.photo_url (ex: '5e3a-uuid.jpg')
 */
export async function deleteAvatar(photoPath) {
  if (!photoPath) throw new Error('deleteAvatar: photoPath requis')

  const { error } = await supabase.storage.from(BUCKET).remove([photoPath])
  if (error) throw error
}

/**
 * Genere une URL signee pour afficher un avatar. Duree par defaut : 2 heures,
 * alignee sur la duree de cache cote client (cf. avatarCache).
 *
 * @param {string} photoPath
 * @param {number} [expiresInSec=7200]
 * @returns {Promise<{ signedUrl: string, expiresAt: number }>} - expiresAt en ms epoch
 */
export async function getAvatarSignedUrl(photoPath, expiresInSec = 7200) {
  if (!photoPath) throw new Error('getAvatarSignedUrl: photoPath requis')

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(photoPath, expiresInSec)

  if (error) throw error
  if (!data?.signedUrl) throw new Error('URL signee vide')

  return {
    signedUrl: data.signedUrl,
    expiresAt: Date.now() + expiresInSec * 1000,
  }
}
