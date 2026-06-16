// src/components/common/ImageViewerModal.jsx
// Visionneuse d'image plein ecran, affichee DANS l'application (pas
// d'ouverture externe). Resout l'ouverture des photos en piece jointe :
//   - iOS PWA installee : plus de sortie vers la feuille de partage / Apercu
//   - Android : plus de "ne s'ouvre pas du tout"
// Une image affichee inline = un simple <img>, ce qui contourne les blocages
// de window.open et de telechargement sur ces plateformes.
//
// Zoom : double-tap (ou double-clic) bascule x1 / x2.5 ; pincer pour zoomer
// finement (mobile) ; glisser pour deplacer quand c'est zoome. Aucune
// dependance externe.

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Download, Loader2 } from 'lucide-react'

const MAX_SCALE = 4
const MIN_SCALE = 1
const DOUBLE_TAP_SCALE = 2.5

export default function ImageViewerModal({ open, src, alt = '', onClose, onDownload }) {
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const [loadError, setLoadError] = useState(false)

  // Refs pour les gestes (pincer / glisser / double-tap)
  const lastTapRef = useRef(0)
  const pinchRef = useRef(null) // { startDist, startScale }
  const panRef = useRef(null)   // { startX, startY, startTx, startTy }

  // Reinitialise le zoom a chaque ouverture ou changement d'image
  useEffect(() => {
    if (open) {
      setScale(1); setTx(0); setTy(0); setLoadError(false)
    }
  }, [open, src])

  // Fermeture par Echap + verrouillage du scroll du body pendant l'ouverture
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  const toggleZoom = useCallback(() => {
    setScale((s) => {
      if (s > 1) { setTx(0); setTy(0); return 1 }
      return DOUBLE_TAP_SCALE
    })
  }, [])

  const dist = (t1, t2) => Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY)

  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      pinchRef.current = { startDist: dist(e.touches[0], e.touches[1]), startScale: scale }
    } else if (e.touches.length === 1) {
      if (scale > 1) {
        panRef.current = {
          startX: e.touches[0].clientX, startY: e.touches[0].clientY,
          startTx: tx, startTy: ty,
        }
      }
      const now = Date.now()
      if (now - lastTapRef.current < 300) { toggleZoom(); lastTapRef.current = 0 }
      else lastTapRef.current = now
    }
  }

  const onTouchMove = (e) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault()
      const d = dist(e.touches[0], e.touches[1])
      const next = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, pinchRef.current.startScale * (d / pinchRef.current.startDist))
      )
      setScale(next)
    } else if (e.touches.length === 1 && panRef.current && scale > 1) {
      e.preventDefault()
      setTx(panRef.current.startTx + (e.touches[0].clientX - panRef.current.startX))
      setTy(panRef.current.startTy + (e.touches[0].clientY - panRef.current.startY))
    }
  }

  const onTouchEnd = (e) => {
    if (e.touches.length === 0) { pinchRef.current = null; panRef.current = null }
    if (scale <= 1) { setTx(0); setTy(0) }
  }

  if (!open) return null

  const gesturing = Boolean(pinchRef.current || panRef.current)

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt || 'Image'}
    >
      {/* Barre d'actions */}
      <div
        className="absolute top-0 right-0 left-0 flex items-center justify-end gap-1 p-3"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {onDownload && (
          <button
            type="button"
            onClick={onDownload}
            aria-label="Télécharger"
            className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 text-white active:bg-white/20 transition-colors"
          >
            <Download className="w-5 h-5" strokeWidth={2} />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 text-white active:bg-white/20 transition-colors"
        >
          <X className="w-5 h-5" strokeWidth={2} />
        </button>
      </div>

      {/* Contenu */}
      <div
        className="w-full h-full flex items-center justify-center overflow-hidden touch-none select-none"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onDoubleClick={toggleZoom}
      >
        {!src && !loadError && (
          <Loader2 className="w-8 h-8 text-white/80 animate-spin" strokeWidth={2} />
        )}

        {loadError && (
          <div className="text-center px-6">
            <p className="text-white/90 text-sm">Impossible d'afficher cette image.</p>
            {onDownload && (
              <button
                type="button"
                onClick={onDownload}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-white text-sm font-semibold active:bg-white/20"
              >
                <Download className="w-4 h-4" /> Télécharger
              </button>
            )}
          </div>
        )}

        {src && !loadError && (
          <img
            src={src}
            alt={alt}
            draggable={false}
            onError={() => setLoadError(true)}
            className="max-w-full max-h-full object-contain"
            style={{
              transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
              transition: gesturing ? 'none' : 'transform 0.15s ease-out',
              cursor: scale > 1 ? 'grab' : 'auto',
            }}
          />
        )}
      </div>
    </div>,
    document.body
  )
}
