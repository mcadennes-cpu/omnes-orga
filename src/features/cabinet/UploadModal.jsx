import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, UploadCloud, FileText, Check, AlertCircle, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'

const MAX_OCTETS = 25 * 1024 * 1024 // 25 Mo

function formatTaille(octets) {
  if (octets < 1024) return `${octets} o`
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`
  return `${(octets / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`
}

export default function UploadModal({ dossierId, dossierName, onClose, onUploaded }) {
  const { user } = useAuth()
  const fileInputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [step, setStep] = useState('idle') // idle | uploading | success
  const [error, setError] = useState(null)

  const destinationLabel = dossierName || 'Racine du cabinet'

  function pickFile(picked) {
    setError(null)
    if (!picked) return
    if (picked.size <= 0) {
      setError('Fichier vide.')
      setFile(null)
      return
    }
    if (picked.size > MAX_OCTETS) {
      setError(`Fichier trop volumineux (${formatTaille(picked.size)}). Maximum : 25 Mo.`)
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

    // 1) Upload vers le bucket cabinet-pratique (path = UUID flat, cf. 6B-1)
    const { error: uploadError } = await supabase.storage
      .from('cabinet-pratique')
      .upload(fileId, file, { contentType, upsert: false })

    if (uploadError) {
      setStep('idle')
      setError(uploadError.message || "Erreur lors de l'envoi du fichier.")
      return
    }

    // 2) Insert metadata avec le meme id
    const { error: insertError } = await supabase
      .from('cabinet_fichiers')
      .insert({
        id: fileId,
        dossier_id: dossierId,
        nom: file.name,
        taille_octets: file.size,
        mime_type: contentType,
        auteur_id: user?.id ?? null,
      })

    if (insertError) {
      // Rollback : supprime l'orphelin du bucket si l'INSERT a echoue
      await supabase.storage.from('cabinet-pratique').remove([fileId])
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
      aria-labelledby="upload-title"
      className="fixed inset-0 z-[100] flex items-end justify-center"
      style={{
        background: 'rgba(28,61,82,0.40)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-carte rounded-t-2xl p-5 pt-4"
        style={{ boxShadow: '0 20px 40px -12px rgba(28,61,82,0.25)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 id="upload-title" className="font-display font-extrabold text-lg text-marine">
            {step === 'success' ? 'Fichier importé' : 'Importer un fichier'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={step === 'uploading'}
            aria-label="Fermer"
            className="h-9 w-9 flex items-center justify-center rounded-full shrink-0 disabled:opacity-50"
          >
            <X size={20} className="text-muted" />
          </button>
        </div>

        {/* Etape idle : selection du fichier */}
        {step === 'idle' && (
          <>
            <p className="text-faint text-[11px] font-semibold uppercase tracking-[0.14em] mb-1.5">
              Destination
            </p>
            <p className="text-marine font-sans text-[15px] mb-4">
              {destinationLabel}
            </p>

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
                className={`w-full rounded-xl border-2 border-dashed p-6 flex flex-col items-center gap-2 transition-colors ${
                  isDragging
                    ? 'border-canard bg-canard/5'
                    : 'border-border bg-carte hover:border-canard/60'
                }`}
              >
                <UploadCloud size={32} className="text-muted" />
                <span className="text-marine font-sans font-semibold text-[15px]">
                  Glisser un fichier ou cliquer
                </span>
                <span className="text-muted text-[13px]">
                  Tout format, 25 Mo maximum
                </span>
              </button>
            ) : (
              <div className="rounded-xl border border-border bg-carte p-3 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-canard/10 flex items-center justify-center shrink-0">
                  <FileText size={20} className="text-canard" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-marine font-sans text-[14px] truncate">
                    {file.name}
                  </p>
                  <p className="text-muted text-[12px]">
                    {formatTaille(file.size)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setFile(null); setError(null) }}
                  className="text-muted text-[13px] underline"
                >
                  Changer
                </button>
              </div>
            )}

            {error && (
              <div className="mt-3 flex items-start gap-2 text-brique text-sm">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleUpload}
              disabled={!file}
              className="w-full mt-5 h-11 rounded-xl bg-marine text-white font-sans font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Importer
            </button>
          </>
        )}

        {/* Etape uploading */}
        {step === 'uploading' && (
          <div className="py-6 text-center">
            <Loader2 size={32} className="animate-spin mx-auto text-canard mb-3" />
            <p className="text-marine font-sans text-[15px] truncate">
              {file?.name}
            </p>
            <p className="text-muted text-[13px] mt-1">
              Envoi en cours…
            </p>
          </div>
        )}

        {/* Etape success */}
        {step === 'success' && (
          <div className="py-4 text-center">
            <div className="h-14 w-14 rounded-full bg-canard/15 mx-auto flex items-center justify-center mb-3">
              <Check size={28} className="text-canard" />
            </div>
            <p className="text-marine font-sans font-semibold text-[16px] truncate">
              {file?.name}
            </p>
            <p className="text-muted text-[13px] mt-1">
              importé dans <span className="text-marine">{destinationLabel}</span>
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="w-full mt-5 h-11 rounded-xl bg-marine text-white font-sans font-semibold"
            >
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
