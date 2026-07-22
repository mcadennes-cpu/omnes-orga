import { useState } from 'react'
import { Copy, Check, Eye, EyeOff, Pencil } from 'lucide-react'

// Une ligne de code d'acces dans la fiche lieu.
// Securite d'affichage : le code est masque par defaut (••••••) et ne se
// revele qu'au tap sur l'oeil — mais le bouton copier fonctionne SANS
// reveler (pratique pour coller un mot de passe sans l'exposer a l'ecran).
// Pattern copie/coche repris de RibRow (MedecinCompta.jsx).
export default function CodeRow({ code, canWrite = false, onEdit }) {
  const [revealed, setRevealed] = useState(false)

  return (
    <div className="px-4 py-3.5 flex flex-col gap-2">
      {/* Ligne titre : label + crayon */}
      <div className="flex items-center gap-2">
        <p className="flex-1 min-w-0 text-body-m font-semibold text-marine truncate">
          {code.label}
        </p>
        {canWrite && onEdit && (
          <button
            type="button"
            onClick={() => onEdit(code)}
            aria-label={`Modifier ${code.label}`}
            className="h-8 w-8 rounded-pill flex items-center justify-center shrink-0 bg-marine/5 text-muted"
          >
            <Pencil size={14} strokeWidth={1.8} />
          </button>
        )}
      </div>

      {/* Identifiant (login), si present */}
      {code.identifiant && (
        <ValueLine label="Identifiant" display={code.identifiant} copyText={code.identifiant} />
      )}

      {/* Code : masque par defaut + toggle oeil */}
      <ValueLine
        label="Code"
        display={revealed ? code.code : '••••••••'}
        copyText={code.code}
        extraButton={
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            aria-label={revealed ? 'Masquer le code' : 'Révéler le code'}
            className="h-8 w-8 rounded-pill flex items-center justify-center shrink-0 bg-marine/5 text-muted"
          >
            {revealed ? (
              <EyeOff size={15} strokeWidth={1.8} />
            ) : (
              <Eye size={15} strokeWidth={1.8} />
            )}
          </button>
        }
      />

      {/* Note libre */}
      {code.note && code.note.trim() !== '' && (
        <p className="text-caption text-muted italic leading-relaxed whitespace-pre-wrap break-words">
          {code.note}
        </p>
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Sous-composant : une ligne label + valeur mono + boutons (copie, extra)
// ----------------------------------------------------------------------------

function ValueLine({ label, display, copyText, extraButton = null }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    if (!copyText) return
    try {
      await navigator.clipboard.writeText(copyText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Presse-papiers indisponible (contexte non securise) : on ignore.
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-field-label">{label}</p>
        <p className="text-body-l font-medium text-marine mt-0.5 break-all font-mono tracking-tight select-all">
          {display}
        </p>
      </div>
      {extraButton}
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? `${label} copié` : `Copier ${label}`}
        className={`h-8 w-8 rounded-pill flex items-center justify-center shrink-0 transition-colors ${
          copied ? 'bg-olive/10 text-olive' : 'bg-canard/10 text-canard'
        }`}
      >
        {copied ? (
          <Check size={15} strokeWidth={2.2} />
        ) : (
          <Copy size={15} strokeWidth={1.8} />
        )}
      </button>
    </div>
  )
}
