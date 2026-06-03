import { getAvatarSignedUrl } from './avatarStorage'

const TTL_MS = 60 * 60 * 1000

// Entrees du cache (clef = photoPath) :
//   - in-flight : { promise }
//   - resolue   : { url, cachedAt }
const cache = new Map()

function isFresh(entry) {
  return entry?.cachedAt != null && entry.cachedAt + TTL_MS > Date.now()
}

/**
 * Recupere une URL signee pour afficher un avatar, avec cache en memoire.
 *
 * - Entree fraiche en cache (< 1h) : retourne l'URL sans appel reseau.
 * - Sinon, genere une URL signee via getAvatarSignedUrl (TTL Supabase 2h,
 *   soit 1h de marge apres expiration du cache).
 * - Coalescence : 50 appels concurrents pour le meme photoPath au premier
 *   rendu donnent un seul round-trip Supabase.
 *
 * @param {string|null|undefined} photoPath
 * @returns {Promise<string|null>} URL signee, ou null si photoPath vide
 */
export async function getAvatarUrl(photoPath) {
  if (!photoPath) return null

  const entry = cache.get(photoPath)
  if (entry?.promise) return entry.promise
  if (isFresh(entry)) return entry.url

  const promise = (async () => {
    const { signedUrl } = await getAvatarSignedUrl(photoPath)
    cache.set(photoPath, { url: signedUrl, cachedAt: Date.now() })
    return signedUrl
  })().catch((err) => {
    // Sur erreur, retire l'entree in-flight (si c'est toujours la notre)
    // pour qu'un appel ulterieur retente au lieu de reutiliser une Promise
    // rejetee.
    const current = cache.get(photoPath)
    if (current?.promise === promise) cache.delete(photoPath)
    throw err
  })

  cache.set(photoPath, { promise })
  return promise
}

/**
 * Invalide l'entree de cache pour un photoPath donne. A appeler apres un
 * upload ou un delete pour forcer la regeneration de l'URL au prochain appel.
 * No-op si photoPath est vide.
 *
 * @param {string|null|undefined} photoPath
 */
export function invalidateAvatarUrl(photoPath) {
  if (!photoPath) return
  cache.delete(photoPath)
}

/**
 * Vide entierement le cache. A appeler lors d'une deconnexion ou dans les
 * tests. N'est pas appele automatiquement.
 */
export function clearAvatarCache() {
  cache.clear()
}
