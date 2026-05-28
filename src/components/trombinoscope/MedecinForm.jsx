import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { ROLES, ROLE_LABELS } from '../../lib/modules'

function toStringValue(v) {
  return v === null || v === undefined ? '' : String(v)
}

export default function MedecinForm({
  initialValues = {},
  onSubmit,
  onCancel,
  canEditPrivilegedFields = false,
  canEditRole = false,
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
      values.notes_internes = notesInternes.trim() || null
    }
    if (canEditRole) {
      values.role = role
      values.actif = actif
    }

    onSubmit(values)
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {/* Carte champs utilisateur */}
      <div className="bg-carte border border-border rounded-card shadow-card p-4 flex flex-col gap-3.5">
        {/* Email lecture seule */}
        {initialValues.email && (
          <Field label="Adresse e-mail" readOnly hint="Lié au compte de connexion — non modifiable">
            <ReadOnlyInput value={initialValues.email} />
          </Field>
        )}

        {/* Prenom / Nom sur 2 colonnes */}
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Prénom *">
            <Input
              id="medecin-prenom"
              value={prenom}
              onChange={(e) => setPrenom(e.target.value)}
              disabled={submitting}
              required
            />
          </Field>
          <Field label="Nom *">
            <Input
              id="medecin-nom"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              disabled={submitting}
              required
            />
          </Field>
        </div>

        <Field label="Spécialité">
          <Input
            id="medecin-specialite"
            value={specialite}
            onChange={(e) => setSpecialite(e.target.value)}
            disabled={submitting}
            placeholder="Ex. Médecine générale"
          />
        </Field>

        <Field label="Téléphone">
          <Input
            id="medecin-telephone"
            type="tel"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            disabled={submitting}
            placeholder="06 XX XX XX XX"
          />
        </Field>

        <Field label="Jours disponibles">
          <Input
            id="medecin-jours"
            value={joursDisponibles}
            onChange={(e) => setJoursDisponibles(e.target.value)}
            disabled={submitting}
            placeholder="Ex. Lun · Mar · Jeu"
          />
        </Field>
      </div>

      {/* Section administration */}
      {canEditPrivilegedFields && (
        <>
          <div className="flex items-center gap-2 px-1">
            <span
              className="h-6 w-6 rounded-md flex items-center justify-center shrink-0"
              style={{ backgroundColor: 'rgba(42,143,168,0.12)' }}
            >
              <ShieldCheck size={14} strokeWidth={2} className="text-canard" />
            </span>
            <span className="text-field-label">
              Champs réservés à l'administration
            </span>
          </div>

          <div className="bg-carte border border-border rounded-card shadow-card p-4 flex flex-col gap-3.5">
            {canEditRole && (
              <>
                <Field label="Rôle">
                  <Select
                    id="medecin-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    disabled={submitting}
                  >
                    {Object.values(ROLES).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r] ?? r}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Compte actif" inline>
                  <Toggle
                    on={actif}
                    onChange={setActif}
                    disabled={submitting}
                  />
                </Field>
                <p className="text-caption text-faint -mt-2 px-1">
                  {actif
                    ? 'Le médecin apparaît dans le trombinoscope'
                    : 'Le médecin est masqué du trombinoscope'}
                </p>
              </>
            )}

            <Field label="Notes internes">
              <Textarea
                id="medecin-notes"
                value={notesInternes}
                onChange={(e) => setNotesInternes(e.target.value)}
                disabled={submitting}
                rows={4}
                placeholder="Remarques, contexte, infos d'organisation..."
              />
            </Field>
          </div>
        </>
      )}

      {/* Erreur */}
      {(validationError || error) && (
        <p
          className="text-brique text-body-m font-medium rounded-input px-3 py-2"
          style={{ backgroundColor: 'rgba(212,80,58,0.10)' }}
        >
          {validationError || error}
        </p>
      )}

      {/* Boutons */}
      <div className="flex gap-2.5 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="flex-1 h-12 rounded-input bg-carte border border-border text-marine text-button disabled:opacity-60 disabled:cursor-not-allowed"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={submitting || !isValid}
          className="flex-[1.6] h-12 rounded-input bg-marine text-white text-button shadow-button disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  )
}

// ----------------------------------------------------------------------------
// Sous-composants locaux : Field, Input, ReadOnlyInput, Select, Textarea, Toggle
// ----------------------------------------------------------------------------

function Field({ label, children, hint, inline = false, readOnly = false }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={`flex justify-between gap-3 ${inline ? 'items-center' : 'items-start'}`}
      >
        <label className="text-field-label">
          {label}
          {readOnly && <span className="ml-1.5 text-faint normal-case tracking-normal"> · lecture</span>}
        </label>
        {inline && children}
      </div>
      {!inline && children}
      {hint && (
        <p className="text-caption text-faint px-0.5">{hint}</p>
      )}
    </div>
  )
}

function Input(props) {
  return (
    <input
      type={props.type || 'text'}
      {...props}
      className="h-11 w-full px-3.5 rounded-input bg-fond text-marine text-body-l font-medium border border-border focus:outline-none focus:border-canard focus:ring-1 focus:ring-canard disabled:opacity-60 disabled:cursor-not-allowed"
    />
  )
}

function ReadOnlyInput({ value }) {
  return (
    <div className="h-11 w-full px-3.5 rounded-input border border-border bg-transparent text-muted text-body-l font-medium flex items-center break-all cursor-not-allowed">
      {value}
    </div>
  )
}

function Select({ children, ...props }) {
  return (
    <select
      {...props}
      className="h-11 w-full px-3.5 rounded-input bg-fond text-marine text-body-l font-medium border border-border focus:outline-none focus:border-canard focus:ring-1 focus:ring-canard disabled:opacity-60 disabled:cursor-not-allowed appearance-none"
      style={{
        backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%231C3D52\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'%3E%3C/polyline%3E%3C/svg%3E")',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 14px center',
        paddingRight: '36px',
      }}
    >
      {children}
    </select>
  )
}

function Textarea(props) {
  return (
    <textarea
      {...props}
      className="w-full min-h-[96px] px-3.5 py-3 rounded-input bg-fond text-marine text-body-m border border-border focus:outline-none focus:border-canard focus:ring-1 focus:ring-canard resize-y disabled:opacity-60 disabled:cursor-not-allowed"
    />
  )
}

/**
 * Toggle iOS-style : slider canard quand on, gris-marine quand off.
 * - Tap large (46x28)
 * - aria-pressed pour l'accessibilite
 */
function Toggle({ on, onChange, disabled = false }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!on)}
      aria-pressed={on}
      disabled={disabled}
      className={`relative w-[46px] h-7 rounded-full transition-colors shrink-0 ${
        on ? 'bg-canard' : ''
      } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      style={!on ? { backgroundColor: 'rgba(28,61,82,0.18)' } : undefined}
    >
      <span
        className="absolute top-[3px] w-[22px] h-[22px] rounded-full bg-white transition-[left]"
        style={{
          left: on ? '21px' : '3px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        }}
      />
    </button>
  )
}
