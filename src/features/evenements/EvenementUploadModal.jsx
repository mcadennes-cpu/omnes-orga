import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, UploadCloud, FileText, Check, AlertCircle, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import { formatTaille } from './fileType'

const MAX_OCTETS = 25 * 1024 * 1024 // 25 Mo
const BUCKET = 'evenements'

/**
 * Modale bottom-sheet d'import d'un document attache a un evenement.
 * Props : evenementId, onClose, onUploaded.
 */
export default function EvenementUploadModal({ evenementId, onClose, onUploaded }) {
  const { user } = useAuth()
  const fileInputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [step, setStep] = useState('idle') // idle | uploading | success
  const [error, setError] = useState(null)

  function pickFile(picked) {
    setError(null)
    if (!picked) return
    if (picked.size <= 0) {
      setError('Fichier vide.')
      setFile(null)
      return
    }
    if (picked.size > MAX_OCTETS) {
      setError(
        `Fichier trop volumineux (${formatTaille(picked.size)}). Maximum : 25 Mo.`,
      )
      setFile(null)
      return
    }
    setFile(picked)
  }

  function onInputChange(e) {
    pickFile(e.target.files?.[0])
    e.target.value = '' // permet de re-piquer le meme fichier
  }

  function onDragOver(e) {
    e.preventDefault()
    setIsDragging(true)
  }
  function onDragLeave(e) {
    e.preventDefault()
    setIsDragging(false)
  }
  function onDrop(e) {
    e.preventDefault()
    setIsDragging(false)
    pickFile(e.dataTransfer.files?.[0])
  }

  async function handleUpload() {
    if (!file) return

    setStep('uploading')
    setError(null)

    const fileId = crypto.randomUUID()
    const contentType = file.type || 'application/octet-stream'

    // 1) Upload vers le bucket evenements (path = UUID flat)
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(fileId, file, { contentType, upsert: false })

    if (uploadError) {
      setStep('idle')
      setError(uploadError.message || "Erreur lors de l'envoi du fichier.")
      return
    }

    // 2) Insert metadata avec le meme id
    const { error: insertError } = await supabase
      .from('evenement_fichiers')
      .insert({
        id: fileId,
        evenement_id: evenementId,
        nom: file.name,
        taille_octets: file.size,
        mime_type: contentType,
        auteur_id: user?.id ?? null,
      })

    if (insertError) {
      // Rollback : supprime l'orphelin du bucket si l'INSERT echoue
      await supabase.storage.from(BUCKET).remove([fileId])
      setStep('idle')
      setError(insertError.message || "Erreur lors de l'enregistrement.")
      return
    }

    setStep('success')
  }

  function handleClose() {
    if (step === 'uploading') return
    if (step === 'success') onUploaded()
    else onClose()
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="evt-upload-title"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-marine/40 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-carte rounded-t-2xl shadow-2xl p-5 pt-4 animate-slide-up"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2
            id="evt-upload-title"
            className="font-display font-extrabold text-lg text-marine"
          >
            {step === 'success' ? 'Document importé' : 'Importer un document'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={step === 'uploading'}
            aria-label="Fermer"
            className="w-9 h-9 flex items-center justify-center rounded-full text-muted hover:bg-fond disabled:opacity-50 transition-colors"
          >
            <X className="w-5 h-5" strokeWidth={1.8} />
          </button>
        </div>

        {/* Etape idle */}
        {step === 'idle' && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              onChange={onInputChange}
              className="hidden"
            />

            {!file ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className={`w-full rounded-input border-2 border-dashed p-6 flex flex-col items-center gap-2 transition-colors ${
                  isDragging
                    ? 'border-canard bg-canard/5'
                    : 'border-border bg-carte hover:border-canard/60'
                }`}
              >
                <UploadCloud className="w-8 h-8 text-muted" strokeWidth={1.8} />
                <span className="text-marine font-semibold text-[15px]">
                  Glisser un fichier ou cliquer
                </span>
                <span className="text-muted text-[13px]">
                  Tout format, 25 Mo maximum
                </span>
              </button>
            ) : (
              <div className="rounded-input border border-border bg-carte p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-pill bg-canard/10 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-canard" strokeWidth={1.8} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-marine text-[14px] truncate">{file.name}</p>
                  <p className="text-muted text-[12px]">
                    {formatTaille(file.size)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null)
                    setError(null)
                  }}
                  className="text-muted text-[13px] underline shrink-0"
                >
                  Changer
                </button>
              </div>
            )}

            {error && (
              <div className="mt-3 flex items-start gap-2 text-brique text-sm">
                <AlertCircle
                  className="w-4 h-4 mt-0.5 shrink-0"
                  strokeWidth={1.8}
                />
                <span>{error}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleUpload}
              disabled={!file}
              className="w-full mt-5 h-11 rounded-input bg-marine text-white font-semibold text-sm disabled:opacity-50 active:opacity-80 transition-opacity"
            >
              Importer
            </button>
          </>
        )}

        {/* Etape uploading */}
        {step === 'uploading' && (
          <div className="py-6 text-center">
            <Loader2
              className="w-8 h-8 animate-spin mx-auto text-canard mb-3"
              strokeWidth={1.8}
            />
            <p className="text-marine text-[15px] truncate">{file?.name}</p>
            <p className="text-muted text-[13px] mt-1">Envoi en cours…</p>
          </div>
        )}

        {/* Etape success */}
        {step === 'success' && (
          <div className="py-4 text-center">
            <div className="w-14 h-14 rounded-full bg-canard/15 mx-auto flex items-center justify-center mb-3">
              <Check className="w-7 h-7 text-canard" strokeWidth={2} />
            </div>
            <p className="text-marine font-semibold text-[16px] truncate">
              {file?.name}
            </p>
            <p className="text-muted text-[13px] mt-1">
              a bien été ajouté à l'événement.
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="w-full mt-5 h-11 rounded-input bg-marine text-white font-semibold text-sm active:opacity-80 transition-opacity"
            >
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
