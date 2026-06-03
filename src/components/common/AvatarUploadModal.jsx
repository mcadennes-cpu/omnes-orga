import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Camera, Trash2 } from 'lucide-react'
import Cropper from 'react-easy-crop'
import Avatar from './Avatar'
import { useAvatarUpload } from '../../hooks/useAvatarUpload'
import { compressToSquareJpeg } from '../../lib/imageCompress'

export default function AvatarUploadModal({
  open,
  onClose,
  userId,
  currentProfile,
  onSuccess,
}) {
  const [step, setStep] = useState('select')
  const [sourceFile, setSourceFile] = useState(null)
  const [sourceObjectUrl, setSourceObjectUrl] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [previewBlob, setPreviewBlob] = useState(null)
  const [previewObjectUrl, setPreviewObjectUrl] = useState(null)
  const [selectError, setSelectError] = useState(null)

  const fileInputRef = useRef(null)
  const { uploadPhoto, deletePhoto, uploading, error } = useAvatarUpload()

  // Reset complet a la fermeture (les cleanup useEffect des object URLs
  // s'occupent de revoke).
  useEffect(() => {
    if (open) return
    setStep('select')
    setSourceFile(null)
    setSourceObjectUrl(null)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
    setPreviewBlob(null)
    setPreviewObjectUrl(null)
    setSelectError(null)
  }, [open])

  // Scroll lock + Escape (calque sur CreateCardModal/ConfirmDialog).
  useEffect(() => {
    if (!open) return
    function onKeyDown(e) {
      if (e.key === 'Escape' && !uploading) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prev
    }
  }, [open, onClose, uploading])

  // Revoke des object URLs : le retour du useEffect tourne quand la dependance
  // change OU au unmount.
  useEffect(() => {
    if (!sourceObjectUrl) return
    return () => URL.revokeObjectURL(sourceObjectUrl)
  }, [sourceObjectUrl])

  useEffect(() => {
    if (!previewObjectUrl) return
    return () => URL.revokeObjectURL(previewObjectUrl)
  }, [previewObjectUrl])

  if (!open) return null

  function handleFileSelected(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setSelectError(null)
    const objectUrl = URL.createObjectURL(file)
    setSourceFile(file)
    setSourceObjectUrl(objectUrl)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
    setStep('crop')
  }

  function handleBackToSelect() {
    setSourceObjectUrl(null)
    setSourceFile(null)
    setCroppedAreaPixels(null)
    setStep('select')
  }

  async function handleNext() {
    setSelectError(null)
    try {
      const blob = await compressToSquareJpeg(sourceFile, croppedAreaPixels)
      const previewUrl = URL.createObjectURL(blob)
      setPreviewBlob(blob)
      setPreviewObjectUrl(previewUrl)
      setStep('confirm')
    } catch (err) {
      setSelectError(err?.message || "Impossible de preparer l'image.")
    }
  }

  function handleBackToCrop() {
    setPreviewObjectUrl(null)
    setPreviewBlob(null)
    setStep('crop')
  }

  async function handleSave() {
    try {
      await uploadPhoto({
        userId,
        source: sourceFile,
        cropArea: croppedAreaPixels,
        currentPhotoPath: currentProfile?.photo_url ?? null,
        onSuccess: ({ photoPath }) => {
          onSuccess?.({ photoPath })
          onClose()
        },
      })
    } catch {
      // Erreur deja exposee via `error` du hook.
    }
  }

  async function handleDelete() {
    try {
      await deletePhoto({
        userId,
        currentPhotoPath: currentProfile.photo_url,
        onSuccess: ({ photoPath }) => {
          onSuccess?.({ photoPath })
          onClose()
        },
      })
    } catch {
      // Erreur deja exposee via `error` du hook.
    }
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget && !uploading) onClose()
  }

  const errorMessage = selectError ?? error?.message ?? null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-overlay"
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatar-upload-title"
    >
      <div className="w-full max-w-lg bg-carte rounded-t-card shadow-card animate-slide-up max-h-[92vh] overflow-y-auto">
        <header className="sticky top-0 bg-carte border-b border-border px-4 h-14 flex items-center justify-center relative">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            aria-label="Fermer"
            className="absolute left-2 p-2 text-muted hover:text-ink disabled:opacity-50"
          >
            <X size={22} />
          </button>
          <h2 id="avatar-upload-title" className="text-h2 text-ink">
            Photo de profil
          </h2>
        </header>

        <div className="px-6 py-6">
          {step === 'select' && (
            currentProfile?.photo_url ? (
              <div className="flex flex-col items-center gap-4">
                <Avatar profile={currentProfile} size={140} />
                <p className="text-caption text-muted">Votre photo actuelle</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="h-12 w-full rounded-input bg-marine text-white text-button disabled:opacity-60"
                >
                  Changer la photo
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={uploading}
                  className="h-12 w-full rounded-input border border-brique/30 text-brique text-button flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <Trash2 size={16} strokeWidth={2} />
                  Supprimer la photo
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full h-[240px] border-2 border-dashed border-border rounded-card flex flex-col items-center justify-center gap-3 disabled:opacity-60"
              >
                <Camera size={48} strokeWidth={1.5} className="text-canard" />
                <span className="text-button text-marine">Choisir une photo</span>
              </button>
            )
          )}

          {step === 'crop' && sourceObjectUrl && (
            <div className="flex flex-col gap-4">
              <div className="relative h-[320px] rounded-card overflow-hidden bg-fond">
                <Cropper
                  image={sourceObjectUrl}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_, areaPixels) => setCroppedAreaPixels(areaPixels)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-field-label">Zoom</label>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="accent-canard"
                />
              </div>
            </div>
          )}

          {step === 'confirm' && previewObjectUrl && (
            <div className="flex flex-col items-center gap-4">
              <img
                src={previewObjectUrl}
                alt="Nouvelle photo"
                className="rounded-full object-cover"
                style={{ width: 140, height: 140 }}
              />
              <p className="text-caption text-muted">Votre nouvelle photo</p>
            </div>
          )}
        </div>

        {errorMessage && (
          <div
            className="mx-4 mb-2 px-3 py-2 rounded-input text-brique text-body-m font-medium"
            style={{ backgroundColor: 'rgba(212,80,58,0.10)' }}
          >
            {errorMessage}
          </div>
        )}

        <footer className="flex gap-3 px-4 py-4 border-t border-border">
          {step === 'select' && (
            <button
              type="button"
              onClick={onClose}
              disabled={uploading}
              className="h-12 w-full rounded-input border border-border text-marine text-button disabled:opacity-60"
            >
              Annuler
            </button>
          )}
          {step === 'crop' && (
            <>
              <button
                type="button"
                onClick={handleBackToSelect}
                disabled={uploading}
                className="h-12 flex-1 rounded-input border border-border text-marine text-button disabled:opacity-60"
              >
                Retour
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={!croppedAreaPixels || uploading}
                className="h-12 flex-1 rounded-input bg-marine text-white text-button disabled:opacity-60"
              >
                Suivant
              </button>
            </>
          )}
          {step === 'confirm' && (
            <>
              <button
                type="button"
                onClick={handleBackToCrop}
                disabled={uploading}
                className="h-12 flex-1 rounded-input border border-border text-marine text-button disabled:opacity-60"
              >
                Retour
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={uploading}
                className="h-12 rounded-input bg-marine text-white text-button disabled:opacity-60"
                style={{ flex: 1.6 }}
              >
                {uploading ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </>
          )}
        </footer>

        <input
          type="file"
          accept="image/*"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileSelected}
        />
      </div>
    </div>,
    document.body,
  )
}
