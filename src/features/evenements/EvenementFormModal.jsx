import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2 } from 'lucide-react'
import ColorPicker from './ColorPicker'

const TITRE_MAX = 100
const DESCRIPTION_MAX = 800

// ----------------------------------------------------------------------------
// Sous-composant : interrupteur du sondage
// ----------------------------------------------------------------------------

function SondageToggle({ checked, onChange }) {
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
          Activer le sondage de présence
        </span>
        <span className="block text-faint text-[12px] mt-0.5">
          Les membres répondent Oui / Non / Peut-être.
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

/**
 * Modale bottom-sheet de creation / edition d'un evenement.
 *
 * Props :
 * - open          : booleen d'ouverture
 * - onClose       : ferme la modale
 * - mode          : 'create' | 'edit'
 * - initialValues : evenement existant (mode edit), null en creation
 * - onSubmit      : async (values) => ... ; doit lever une erreur si echec.
 *                   values = { titre, description, date_debut, date_fin,
 *                              lieu, couleur, sondage_actif }
 */
export default function EvenementFormModal({
  open,
  onClose,
  mode = 'create',
  initialValues = null,
  onSubmit,
}) {
  const [titre, setTitre] = useState('')
  const [description, setDescription] = useState('')
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')
  const [lieu, setLieu] = useState('')
  const [couleur, setCouleur] = useState('marine')
  const [sondageActif, setSondageActif] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  // Initialisation a chaque ouverture. On ne depend QUE de `open` : dependre
  // aussi de initialValues ferait re-initialiser le formulaire (et ecraserait
  // la saisie) si le parent recreait l'objet pendant l'edition.
  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && initialValues) {
      setTitre(initialValues.titre ?? '')
      setDescription(initialValues.description ?? '')
      setDateDebut(initialValues.date_debut ?? '')
      setDateFin(initialValues.date_fin ?? '')
      setLieu(initialValues.lieu ?? '')
      setCouleur(initialValues.couleur ?? 'marine')
      setSondageActif(Boolean(initialValues.sondage_actif))
    } else {
      setTitre('')
      setDescription('')
      setDateDebut('')
      setDateFin('')
      setLieu('')
      setCouleur('marine')
      setSondageActif(false)
    }
    setSubmitting(false)
    setSubmitError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Bloquer le scroll du body quand la modale est ouverte
  useEffect(() => {
    if (!open) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  // Fermeture sur Escape
  useEffect(() => {
    if (!open) return undefined
    const handler = (e) => {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, submitting, onClose])

  if (!open) return null

  const trimmedTitre = titre.trim()
  const dateError =
    dateDebut && dateFin && dateFin < dateDebut
      ? 'La date de fin ne peut pas précéder la date de début.'
      : null
  const canSubmit =
    trimmedTitre.length > 0 && dateDebut !== '' && !dateError && !submitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await onSubmit({
        titre: trimmedTitre,
        description: description.trim() || null,
        date_debut: dateDebut,
        date_fin: dateFin || null,
        lieu: lieu.trim() || null,
        couleur,
        sondage_actif: sondageActif,
      })
      onClose()
    } catch (err) {
      console.error('[EvenementFormModal] submit error:', err)
      setSubmitError(err?.message || 'Une erreur est survenue.')
      setSubmitting(false)
    }
  }

  const inputClass =
    'w-full px-3 py-2.5 rounded-input bg-fond border border-border text-marine text-sm placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-canard/30'
  const labelClass =
    'block text-muted text-xs uppercase tracking-wider font-semibold mb-2'
  const optionnel = (
    <span className="text-faint normal-case font-normal">(optionnel)</span>
  )

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'edit' ? "Modifier l'événement" : 'Nouvel événement'}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Fermer"
        onClick={() => !submitting && onClose()}
        className="absolute inset-0 bg-marine/40 backdrop-blur-sm"
      />

      {/* Sheet */}
      <div className="relative bg-carte rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col animate-slide-up">
        {/* Poignee de drag (visuelle) */}
        <div className="pt-3 pb-1 flex justify-center">
          <div className="w-9 h-1 rounded-full bg-marine/18" />
        </div>

        {/* Header */}
        <div className="px-4 pt-2 pb-3 flex items-center justify-between border-b border-border">
          <h2 className="font-display font-extrabold text-marine text-lg">
            {mode === 'edit' ? "Modifier l'événement" : 'Nouvel événement'}
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

        {/* Body scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {/* Titre */}
          <div>
            <label className={labelClass}>
              Titre <span className="text-brique">*</span>
            </label>
            <input
              type="text"
              value={titre}
              onChange={(e) => setTitre(e.target.value.slice(0, TITRE_MAX))}
              placeholder="Ex. Formation gestes d'urgence"
              className={inputClass}
            />
            <div className="text-faint text-[11px] mt-1 text-right">
              {titre.length}/{TITRE_MAX}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={labelClass}>Description {optionnel}</label>
            <textarea
              value={description}
              onChange={(e) =>
                setDescription(e.target.value.slice(0, DESCRIPTION_MAX))
              }
              rows={3}
              placeholder="Détails, horaires, intervenant…"
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* Dates */}
          <div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>
                  Début <span className="text-brique">*</span>
                </label>
                <input
                  type="date"
                  value={dateDebut}
                  onChange={(e) => setDateDebut(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Fin {optionnel}</label>
                <input
                  type="date"
                  value={dateFin}
                  onChange={(e) => setDateFin(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            {dateError && (
              <p className="mt-2 text-brique text-[12px]">{dateError}</p>
            )}
          </div>

          {/* Lieu */}
          <div>
            <label className={labelClass}>Lieu {optionnel}</label>
            <input
              type="text"
              value={lieu}
              onChange={(e) => setLieu(e.target.value)}
              placeholder="Ex. Salle de réunion, 1er étage"
              className={inputClass}
            />
          </div>

          {/* Couleur */}
          <div>
            <label className={labelClass}>Couleur de l'événement</label>
            <ColorPicker value={couleur} onChange={setCouleur} />
            <p className="text-faint text-[12px] mt-2">
              Teinte le bloc-date, la pastille du détail et les éléments du
              sondage.
            </p>
          </div>

          {/* Sondage */}
          <SondageToggle checked={sondageActif} onChange={setSondageActif} />

          {/* Erreur de soumission */}
          {submitError && (
            <div className="px-3 py-2 rounded-input bg-brique/10 text-brique text-sm">
              {submitError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border bg-carte flex gap-3">
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            className="flex-1 h-11 rounded-input border border-border bg-carte text-marine font-semibold text-sm active:bg-fond disabled:opacity-50 transition-colors"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 h-11 rounded-input bg-marine text-white font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-40 active:opacity-80 transition-opacity"
          >
            {submitting && (
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.2} />
            )}
            Enregistrer
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
