import { useCallback, useState } from 'react'
import { isImage } from '../lib/storageOpen'

/**
 * Gere l'etat de la visionneuse d'image integree pour les modules "Drive".
 *
 * Donne une fonction openFile(id, nom, mimeType) a appeler a la place de
 * l'ouverture directe : si le fichier est une image, on l'affiche dans la
 * visionneuse (reste dans l'app) ; sinon, on delegue a fallbackOpen
 * (comportement existant : preview onglet ou telechargement).
 *
 * @param {object}   params
 * @param {(id: string) => Promise<string>} params.getImageUrl  URL signee de l'image
 * @param {(id: string, nom: string, mimeType: string) => Promise} params.fallbackOpen
 * @param {(id: string, nom: string) => Promise} params.downloadFile  repli telechargement
 */
export function useImageViewer({ getImageUrl, fallbackOpen, downloadFile }) {
  const [state, setState] = useState({ open: false, src: null, id: null, nom: '' })

  const openFile = useCallback(async (id, nom, mimeType) => {
    if (isImage(mimeType)) {
      setState({ open: true, src: null, id, nom: nom || '' })
      try {
        const url = await getImageUrl(id)
        // Ne pose l'URL que si on regarde toujours la meme image.
        setState((s) => (s.id === id && s.open ? { ...s, src: url } : s))
      } catch (err) {
        console.error('[useImageViewer] image url error:', err)
        setState({ open: false, src: null, id: null, nom: '' })
        if (fallbackOpen) await fallbackOpen(id, nom, mimeType)
      }
      return
    }
    if (fallbackOpen) await fallbackOpen(id, nom, mimeType)
  }, [getImageUrl, fallbackOpen])

  const close = useCallback(
    () => setState({ open: false, src: null, id: null, nom: '' }),
    []
  )

  const download = useCallback(() => {
    if (state.id && downloadFile) downloadFile(state.id, state.nom)
  }, [state.id, state.nom, downloadFile])

  return {
    openFile,
    viewerProps: {
      open: state.open,
      src: state.src,
      alt: state.nom,
      onClose: close,
      onDownload: download,
    },
  }
}
