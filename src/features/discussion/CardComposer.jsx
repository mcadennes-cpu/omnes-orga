import { useRef, useState } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { getBoardColorClasses } from './boardColors'

const BODY_MAX = 2000

/**
 * Zone de saisie d'un message, en bas de la vue carte.
 * Textarea auto-redimensionne, envoi par le bouton uniquement (la touche
 * Entree insere un retour a la ligne). Si la carte est close, le composer
 * est remplace par un bandeau de lecture seule.
 *
 * @param {Object} props
 * @param {string} [props.accentColor='brique']
 * @param {boolean} [props.disabled=false]  vrai si la carte est close
 * @param {(body: string) => Promise} props.onSend
 */
export default function CardComposer({ accentColor = 'brique', disabled = false, onSend }) {
  const [value, setValue] = useState('')
  const [sending, setSending] = useState(false)
  const textareaRef = useRef(null)
  const accent = getBoardColorClasses(accentColor)

  if (disabled) {
    return (
      <div className="px-4 py-3 bg-fond border-t border-border">
        <p className="text-muted text-xs text-center">
          Cette carte est close — les messages sont en lecture seule.
        </p>
      </div>
    )
  }

  const handleChange = (e) => {
    setValue(e.target.value.slice(0, BODY_MAX))
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  const trimmed = value.trim()
  const canSend = trimmed.length > 0 && !sending

  const handleSend = async () => {
    if (!canSend) return
    setSending(true)
    try {
      await onSend(trimmed)
      setValue('')
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
    } catch (err) {
      // On garde le texte saisi pour que l'utilisateur puisse reessayer.
      console.error('[CardComposer] send error:', err)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="px-3 py-2.5 bg-carte border-t border-border flex items-end gap-2">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        rows={1}
        placeholder="Écrire un message…"
        className="flex-1 px-3 py-2 rounded-2xl bg-fond border border-border text-marine text-sm placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-canard/30 resize-none max-h-[120px]"
      />
      <button
        type="button"
        onClick={handleSend}
        disabled={!canSend}
        aria-label="Envoyer le message"
        className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${accent.cta} disabled:opacity-40 active:opacity-80 transition-opacity`}
      >
        {sending ? (
          <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.2} />
        ) : (
          <Send className="w-4 h-4" strokeWidth={2.2} />
        )}
      </button>
    </div>
  )
}
