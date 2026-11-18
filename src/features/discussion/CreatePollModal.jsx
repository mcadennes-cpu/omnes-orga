import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Plus, Trash2, Loader2 } from 'lucide-react'
import { getBoardColorClasses } from './boardColors'
import { POLL_OPTIONS_MAX } from './usePoll'

const QUESTION_MAX = 200
const OPTION_MAX = 100

// ----------------------------------------------------------------------------
// Sous-composant : interrupteur « plusieurs reponses » (meme dessin que
// l'interrupteur du sondage de presence dans EvenementFormModal)
// ----------------------------------------------------------------------------

function MultipleToggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-3 text-left"
    >
      <span>
        <span className="block text-marine text-sm font-semibold">
          Plusieurs réponses possibles
        </span>
        <span className="block text-faint text-[12px] mt-0.5">
          Chacun peut cocher autant d'options qu'il veut (ex. des dates).
        </span>
      </span>
      <span
        className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${
          checked ? 'bg-marine' : 'bg-marine/15'
        }`}
      >
        <span
          className={`block w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  )
}

// ----------------------------------------------------------------------------
// Composant principal
// ----------------------------------------------------------------------------

const initialOptions = (count) =>
  Array.from({ length: count }, (_, i) => ({ id: i + 1, value: '' }))

/**
 * Bottom-sheet des options d'un sondage de carte (etape 16 ter, etendu a
 * l'etape 16 quater). Deux usages :
 * - mode « create » : question + options (2 minimum) + interrupteur
 *   « Plusieurs réponses possibles » ;
 * - mode « add » : ajouter des options a un sondage deja lance (1 minimum),
 *   sans toucher a la question ni aux options existantes.
 * Dans les deux cas, POLL_OPTIONS_MAX options au total.
 * Calque sur EditCardModal pour le pattern (Portal, slide-up, scroll-lock,
 * Escape, footer Annuler / valider).
 *
 * @param {Object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {'create'|'add'} [props.mode='create']
 * @param {(args: { question: string, options: string[], multiple: boolean }) => Promise} [props.onCreate]
 * @param {(labels: string[]) => Promise} [props.onAdd]
 * @param {number} [props.existingCount=0] options deja presentes (mode add)
 * @param {string} [props.accentColor='brique']
 */
export default function CreatePollModal({
  open,
  onClose,
  mode = 'create',
  onCreate,
  onAdd,
  existingCount = 0,
  accentColor = 'brique',
}) {
  const isAdd = mode === 'add'
  const minOptions = isAdd ? 1 : 2
  const maxOptions = isAdd ? Math.max(0, POLL_OPTIONS_MAX - existingCount) : POLL_OPTIONS_MAX

  const [question, setQuestion] = useState('')
  const [multiple, setMultiple] = useState(false)
  const [options, setOptions] = useState(() => initialOptions(minOptions))
  const nextId = useRef(minOptions + 1)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  // Reinitialisation a l'ouverture.
  useEffect(() => {
    if (open) {
      setQuestion('')
      setMultiple(false)
      setOptions(initialOptions(minOptions))
      nextId.current = minOptions + 1
      setSubmitting(false)
      setSubmitError(null)
    }
  }, [open, minOptions])

  // Scroll-lock du body pendant l'ouverture.
  useEffect(() => {
    if (!open) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [open])

  // Fermeture par Escape (sauf pendant la soumission).
  useEffect(() => {
    if (!open) return undefined
    const handler = (e) => {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, submitting, onClose])

  if (!open) return null

  const accent = getBoardColorClasses(accentColor)
  const trimmedQuestion = question.trim()
  const cleanOptions = options.map((o) => o.value.trim()).filter(Boolean)
  const canSubmit =
    (isAdd || trimmedQuestion.length > 0) &&
    cleanOptions.length >= minOptions &&
    cleanOptions.length <= maxOptions &&
    !submitting

  const updateOption = (id, value) =>
    setOptions((cur) =>
      cur.map((o) => (o.id === id ? { ...o, value: value.slice(0, OPTION_MAX) } : o))
    )
  const addOption = () =>
    setOptions((cur) => (cur.length >= maxOptions ? cur : [...cur, { id: nextId.current++, value: '' }]))
  const removeOption = (id) =>
    setOptions((cur) => (cur.length <= minOptions ? cur : cur.filter((o) => o.id !== id)))

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      if (isAdd) await onAdd(options.map((o) => o.value))
      else await onCreate({ question: trimmedQuestion, options: options.map((o) => o.value), multiple })
      onClose()
    } catch (err) {
      console.error('[CreatePollModal] submit error:', err)
      setSubmitError(err?.message || 'Une erreur est survenue.')
      setSubmitting(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={isAdd ? 'Ajouter des options' : 'Nouveau sondage'}
    >
      <button
        type="button"
        aria-label="Fermer"
        onClick={() => !submitting && onClose()}
        className="absolute inset-0 bg-marine/40 backdrop-blur-sm"
      />
      <div className="relative bg-carte rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col animate-slide-up">
        <div className="pt-3 pb-1 flex justify-center">
          <div className="w-9 h-1 rounded-full bg-marine/18" />
        </div>
        <div className="px-4 pt-2 pb-3 flex items-center justify-between border-b border-border">
          <h2 className="font-display font-extrabold text-marine text-lg">
            {isAdd ? 'Ajouter des options' : 'Nouveau sondage'}
          </h2>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            aria-label="Fermer"
            disabled={submitting}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:bg-fond active:bg-fond transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {/* Question (creation uniquement) */}
          {!isAdd && (
          <div>
            <label className="block text-muted text-xs uppercase tracking-wider font-semibold mb-2">
              Question
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value.slice(0, QUESTION_MAX))}
              placeholder="Ex. Quelle date pour la prochaine réunion ?"
              className="w-full px-3 py-2.5 rounded-input bg-fond border border-border text-marine text-sm placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-canard/30"
            />
            <div className="text-faint text-[11px] mt-1 text-right">
              {question.length}/{QUESTION_MAX}
            </div>
          </div>
          )}

          {/* Choix multiple (creation uniquement) */}
          {!isAdd && <MultipleToggle checked={multiple} onChange={setMultiple} />}

          {/* Options */}
          <div>
            <label className="block text-muted text-xs uppercase tracking-wider font-semibold mb-2">
              {isAdd ? 'Nouvelles options' : 'Options'}{' '}
              <span className="text-faint normal-case font-normal">
                {isAdd
                  ? `(${maxOptions} de plus au maximum)`
                  : `(2 minimum, ${POLL_OPTIONS_MAX} maximum)`}
              </span>
            </label>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={opt.id} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={opt.value}
                    onChange={(e) => updateOption(opt.id, e.target.value)}
                    placeholder={`Option ${(isAdd ? existingCount : 0) + i + 1}`}
                    className="flex-1 px-3 py-2.5 rounded-input bg-fond border border-border text-marine text-sm placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-canard/30"
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(opt.id)}
                    disabled={options.length <= minOptions}
                    aria-label={`Retirer l'option ${(isAdd ? existingCount : 0) + i + 1}`}
                    className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-muted hover:bg-fond active:bg-fond disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
            {options.length < maxOptions && (
              <button
                type="button"
                onClick={addOption}
                className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-input border border-dashed border-border text-muted text-sm font-medium hover:bg-fond active:bg-fond transition-colors"
              >
                <Plus className="w-4 h-4" strokeWidth={2.2} />
                Ajouter une option
              </button>
            )}
          </div>

          {submitError && (
            <div className="px-3 py-2 rounded-input bg-brique/10 text-brique text-sm">
              {submitError}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border bg-carte flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            className="px-4 py-2.5 rounded-full text-muted font-semibold text-sm hover:text-marine disabled:opacity-50 transition-colors"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full ${accent.cta} font-semibold text-sm disabled:opacity-40 active:opacity-80 transition-opacity`}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.2} />}
            {isAdd ? 'Ajouter' : 'Créer le sondage'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
