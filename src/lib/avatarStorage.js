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
      cacheControl: '31536000',
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
 * Helper synchrone : renvoie l'URL publique d'un avatar (bucket public).
 * Pas d'appel reseau, pas d'expiration. Utile quand on veut une URL stable
 * cote rendu sans passer par le cache d'URLs signees.
 *
 * @param {string} path
 * @returns {string|null}
 */
export function getAvatarPublicUrl(path) {
  if (!path) return null
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}
