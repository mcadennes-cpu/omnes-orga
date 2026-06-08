import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { compressToSquareJpeg } from '../lib/imageCompress'
import { uploadAvatar, deleteAvatar } from '../lib/avatarStorage'

/**
 * Hook orchestrant l'upload et la suppression de la photo de profil.
 *
 * Le hook ne contient aucune logique UI : compression, upload Storage,
 * mise a jour de profiles.photo_url. Le rafraichissement cote affichage
 * est porte par le bump de profiles.updated_at (utilise par <Avatar>
 * comme cache-buster `?v=updated_at` sur l'URL publique).
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
   * Pipeline complet : compress -> upload Storage -> UPDATE profiles.
   * Si une etape echoue, l'erreur est stockee dans `error` puis re-throw
   * pour que l'appelant puisse aussi reagir.
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

      // Bump explicite de updated_at : sert de cache-buster `?v=updated_at`
      // sur l'URL publique cote <Avatar>. Robuste qu'il y ait ou non un
      // trigger SQL `new.updated_at = now()` : si trigger, il ecrase notre
      // valeur ; sinon, notre valeur s'applique. La RLS
      // profiles_update_own_safe_fields autorise photo_url et updated_at.
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ photo_url: storagePath, updated_at: new Date().toISOString() })
        .eq('id', userId)

      if (updateError) {
        // Etat incoherent : le blob est dans Storage mais photo_url ne pointe
        // pas dessus. Juste un orphelin dans le bucket avatars.
        // L'utilisateur verra l'erreur et pourra retenter.
        console.warn('useAvatarUpload: UPDATE profiles a echoue apres upload Storage', updateError)
        throw updateError
      }

      onSuccess?.({ photoPath: storagePath })
    } catch (err) {
      setError(err)
      throw err
    } finally {
      setUploading(false)
    }
  }, [])

  /**
   * Suppression : delete Storage (best-effort) -> UPDATE profiles.
   * Le delete Storage est tolerant : un fichier orphelin n'est pas critique.
   * Seul l'UPDATE BD est bloquant.
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
