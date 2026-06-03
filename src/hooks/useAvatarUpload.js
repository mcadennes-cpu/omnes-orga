import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { compressToSquareJpeg } from '../lib/imageCompress'
import { uploadAvatar, deleteAvatar } from '../lib/avatarStorage'
import { invalidateAvatarUrl } from '../lib/avatarCache'

/**
 * Hook orchestrant l'upload et la suppression de la photo de profil.
 *
 * Le hook ne contient aucune logique UI : compression, upload Storage,
 * mise a jour de profiles.photo_url et invalidation du cache d'URL signees.
 * L'appelant fournit `currentPhotoPath` (lu typiquement depuis
 * useRole().photo_url) pour eviter une requete supplementaire.
 *
 * @returns {{
 *   uploadPhoto: (params: { userId: string, source: File|Blob, cropArea: ?object, currentPhotoPath?: ?string, onSuccess?: (info: {photoPath: string}) => void }) => Promise<void>,
 *   deletePhoto: (params: { userId: string, currentPhotoPath: string, onSuccess?: (info: {photoPath: null}) => void }) => Promise<void>,
 *   uploading: boolean,
 *   error: Error | null,
 * }}
 */
export function useAvatarUpload() {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  /**
   * Pipeline complet : compress -> upload Storage -> UPDATE profiles ->
   * invalidation du cache. Si une etape echoue, l'erreur est stockee dans
   * `error` puis re-throw pour que l'appelant puisse aussi reagir.
   */
  const uploadPhoto = useCallback(async ({
    userId,
    source,
    cropArea,
    currentPhotoPath,
    onSuccess,
  }) => {
    if (!userId) throw new Error('uploadPhoto: userId requis')
    if (!source) throw new Error('uploadPhoto: source requise')

    setUploading(true)
    setError(null)

    try {
      const blob = await compressToSquareJpeg(source, cropArea)
      const { storagePath } = await uploadAvatar(userId, blob, 'jpg')

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ photo_url: storagePath })
        .eq('id', userId)

      if (updateError) {
        // Etat incoherent : le blob est dans Storage mais photo_url ne pointe
        // pas dessus. Pas de fuite (bucket prive, RLS), juste un orphelin.
        // L'utilisateur verra l'erreur et pourra retenter.
        console.warn('useAvatarUpload: UPDATE profiles a echoue apres upload Storage', updateError)
        throw updateError
      }

      if (currentPhotoPath) invalidateAvatarUrl(currentPhotoPath)
      invalidateAvatarUrl(storagePath)

      onSuccess?.({ photoPath: storagePath })
    } catch (err) {
      setError(err)
      throw err
    } finally {
      setUploading(false)
    }
  }, [])

  /**
   * Suppression : delete Storage (best-effort) -> UPDATE profiles ->
   * invalidation. Le delete Storage est tolerant : un fichier orphelin
   * n'est pas critique (bucket prive). Seul l'UPDATE BD est bloquant.
   */
  const deletePhoto = useCallback(async ({
    userId,
    currentPhotoPath,
    onSuccess,
  }) => {
    if (!userId) throw new Error('deletePhoto: userId requis')
    if (!currentPhotoPath) throw new Error('deletePhoto: currentPhotoPath requis')

    setUploading(true)
    setError(null)

    try {
      try {
        await deleteAvatar(currentPhotoPath)
      } catch (storageErr) {
        console.warn('useAvatarUpload: deleteAvatar a echoue, on continue', storageErr)
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ photo_url: null })
        .eq('id', userId)

      if (updateError) throw updateError

      invalidateAvatarUrl(currentPhotoPath)

      onSuccess?.({ photoPath: null })
    } catch (err) {
      setError(err)
      throw err
    } finally {
      setUploading(false)
    }
  }, [])

  return { uploadPhoto, deletePhoto, uploading, error }
}
