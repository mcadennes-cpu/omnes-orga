import { useState } from 'react'
import { ROLES, ROLE_LABELS } from '../../lib/modules'

function toStringValue(v) {
  return v === null || v === undefined ? '' : String(v)
}

export default function MedecinForm({
  initialValues = {},
  onSubmit,
  onCancel,
  canEditPrivilegedFields = false,
  submitting = false,
  error = null,
}) {
  const [nom, setNom] = useState(toStringValue(initialValues.nom))
  const [prenom, setPrenom] = useState(toStringValue(initialValues.prenom))
  const [telephone, setTelephone] = useState(toStringValue(initialValues.telephone))
  const [specialite, setSpecialite] = useState(toStringValue(initialValues.specialite))
  const [joursDisponibles, setJoursDisponibles] = useState(
    toStringValue(initialValues.jours_disponibles)
  )
  const [role, setRole] = useState(
    toStringValue(initialValues.role) || ROLES.ASSOCIE
  )
  const [actif, setActif] = useState(
    initialValues.actif === undefined ? true : Boolean(initialValues.actif)
  )
  const [notesInternes, setNotesInternes] = useState(
    toStringValue(initialValues.notes_internes)
  )
  const [validationError, setValidationError] = useState(null)

  const trimmedNom = nom.trim()
  const trimmedPrenom = prenom.trim()
  const isValid = trimmedNom !== '' && trimmedPrenom !== ''

  function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return

    if (!isValid) {
      setValidationError('Le nom et le prénom sont obligatoires.')
      return
    }
    setValidationError(null)

    const values = {
      nom: trimmedNom,
      prenom: trimmedPrenom,
      telephone: telephone.trim() || null,
      specialite: specialite.trim() || null,
      jours_disponibles: joursDisponibles.trim() || null,
    }

    if (canEditPrivilegedFields) {
      values.role = role
      values.actif = actif
      values.notes_internes = notesInternes.trim() || null
    }

    onSubmit(values)
  }

  const inputClass =
    'h-11 w-full rounded-input border border-border bg-white px-3 text-sm text-ink focus:border-canard focus:outline-none disabled:bg-fond disabled:text-muted'
  const labelClass = 'text-xs font-semibold text-muted uppercase tracking-wide'
  const fieldClass = 'flex flex-col gap-1.5'

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-carte border border-border rounded-card p-5 flex flex-col gap-4"
      noValidate
    >
      {initialValues.email && (
        <div className={fieldClass}>
          <label className={labelClass}>Adresse e-mail</label>
          <p className="text-sm text-muted break-all bg-fond rounded-input px-3 py-2.5 border border-border">
            {initialValues.email}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className={fieldClass}>
          <label htmlFor="medecin-prenom" className={labelClass}>
            Prénom <span className="text-brique">*</span>
          </label>
          <input
            id="medecin-prenom"
            type="text"
            value={prenom}
            onChange={(e) => setPrenom(e.target.value)}
            className={inputClass}
            disabled={submitting}
            required
          />
        </div>

        <div className={fieldClass}>
          <label htmlFor="medecin-nom" className={labelClass}>
            Nom <span className="text-brique">*</span>
          </label>
          <input
            id="medecin-nom"
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            className={inputClass}
            disabled={submitting}
            required
          />
        </div>
      </div>

      <div className={fieldClass}>
        <label htmlFor="medecin-specialite" className={labelClass}>
          Spécialité
        </label>
        <input
          id="medecin-specialite"
          type="text"
          value={specialite}
          onChange={(e) => setSpecialite(e.target.value)}
          className={inputClass}
          disabled={submitting}
        />
      </div>

      <div className={fieldClass}>
        <label htmlFor="medecin-telephone" className={labelClass}>
          Téléphone
        </label>
        <input
          id="medecin-telephone"
          type="tel"
          value={telephone}
          onChange={(e) => setTelephone(e.target.value)}
          className={inputClass}
          disabled={submitting}
        />
      </div>

      <div className={fieldClass}>
        <label htmlFor="medecin-jours" className={labelClass}>
          Jours disponibles
        </label>
        <input
          id="medecin-jours"
          type="text"
          value={joursDisponibles}
          onChange={(e) => setJoursDisponibles(e.target.value)}
          className={inputClass}
          disabled={submitting}
          placeholder="Ex : Lundi, mardi matin, jeudi"
        />
      </div>

      {canEditPrivilegedFields && (
        <>
          <div className="border-t border-border pt-4 flex flex-col gap-4">
            <p className="text-xs font-semibold text-canard uppercase tracking-wide">
              Champs réservés à l'administration
            </p>

            <div className={fieldClass}>
              <label htmlFor="medecin-role" className={labelClass}>
                Rôle
              </label>
              <select
                id="medecin-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className={inputClass}
                disabled={submitting}
              >
                {Object.values(ROLES).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r] ?? r}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className={labelClass}>Compte actif</span>
                <span className="text-xs text-muted mt-0.5">
                  {actif
                    ? 'Le médecin apparaît dans le trombinoscope'
                    : 'Le médecin est masqué du trombinoscope'}
                </span>
              </div>
              <input
                id="medecin-actif"
                type="checkbox"
                checked={actif}
                onChange={(e) => setActif(e.target.checked)}
                disabled={submitting}
                className="h-5 w-5 rounded border-border text-canard focus:ring-canard"
              />
            </div>

            <div className={fieldClass}>
              <label htmlFor="medecin-notes" className={labelClass}>
                Notes internes
              </label>
              <textarea
                id="medecin-notes"
                value={notesInternes}
                onChange={(e) => setNotesInternes(e.target.value)}
                className="min-h-[96px] w-full rounded-input border border-border bg-white px-3 py-2.5 text-sm text-ink focus:border-canard focus:outline-none disabled:bg-fond disabled:text-muted resize-y"
                disabled={submitting}
                rows={4}
              />
            </div>
          </div>
        </>
      )}

      {(validationError || error) && (
        <p className="text-sm text-brique bg-brique/10 rounded-input px-3 py-2">
          {validationError || error}
        </p>
      )}

      <div className="border-t border-border pt-4 flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="h-12 sm:flex-1 rounded-input border border-border text-marine font-semibold hover:bg-marine/5 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={submitting || !isValid}
          className="h-12 sm:flex-1 rounded-input bg-marine text-white font-semibold hover:bg-marine/90 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
        >
          {submitting ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  )
}
