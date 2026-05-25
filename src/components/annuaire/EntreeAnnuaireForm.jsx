import { useMemo, useState } from 'react'
import { Sparkles, Trash2, BookOpen } from 'lucide-react'

function toStringValue(v) {
  return v === null || v === undefined ? '' : String(v)
}

// Validation email simple : un @ et un . apres. Suffisant pour un cas pratique.
function isValidEmail(email) {
  if (!email) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export default function EntreeAnnuaireForm({
  initialValues = {},
  existingCategories = [],
  onSubmit,
  onCancel,
  submitting = false,
  error = null,
  // Mode edition : si canDelete + onDelete sont fournis, la zone danger apparait.
  canDelete = false,
  onDelete,
  // Mode creation : bandeau d'info pedagogique.
  isNew = false,
}) {
  const [nom, setNom] = useState(toStringValue(initialValues.nom))
  const [categorie, setCategorie] = useState(toStringValue(initialValues.categorie))
  const [telephone, setTelephone] = useState(toStringValue(initialValues.telephone))
  const [email, setEmail] = useState(toStringValue(initialValues.email))
  const [note, setNote] = useState(toStringValue(initialValues.note))
  const [showCatSuggest, setShowCatSuggest] = useState(false)
  const [validationError, setValidationError] = useState(null)

  const trimmedNom = nom.trim()
  const trimmedEmail = email.trim()
  const isValid = trimmedNom !== '' && isValidEmail(trimmedEmail)

  // Suggestions categorie : filtrees par ce qui est tape, max 8.
  const catSuggestions = useMemo(() => {
    const q = categorie.trim().toLowerCase()
    const list = q
      ? existingCategories.filter(
          (c) => c.toLowerCase().includes(q) && c.toLowerCase() !== q
        )
      : existingCategories
    return list.slice(0, 8)
  }, [categorie, existingCategories])

  function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return

    if (trimmedNom === '') {
      setValidationError('Le nom est obligatoire.')
      return
    }
    if (!isValidEmail(trimmedEmail)) {
      setValidationError("L'adresse e-mail n'est pas valide.")
      return
    }
    setValidationError(null)

    const values = {
      nom: trimmedNom,
      categorie: categorie.trim() || null,
      telephone: telephone.trim() || null,
      email: trimmedEmail || null,
      note: note.trim() || null,
    }

    onSubmit(values)
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {/* Bandeau d'info : creation uniquement */}
      {isNew && (
        <div
          className="flex items-center gap-3 rounded-card px-3.5 py-3 border"
          style={{
            backgroundColor: 'rgba(232,161,53,0.10)',
            borderColor: 'rgba(232,161,53,0.22)',
          }}
        >
          <span
            className="h-8 w-8 rounded-pill flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'rgba(232,161,53,0.20)' }}
          >
            <BookOpen size={18} strokeWidth={1.8} className="text-ocre-fonce" />
          </span>
          <p className="text-caption text-marine leading-relaxed">
            Cette entrée sera <span className="font-semibold">visible par toute l'équipe</span> du cabinet.
          </p>
        </div>
      )}

      {/* Carte formulaire */}
      <div className="bg-carte border border-border rounded-card shadow-card p-4 flex flex-col gap-3.5">
        <Field label="Nom *">
          <Input
            id="entree-nom"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            disabled={submitting}
            required
            placeholder="Ex. Dr Lefèvre, Pharmacie de la Place…"
            autoFocus={isNew}
          />
        </Field>

        <Field
          label="Catégorie"
          hint="Tapez librement ou choisissez parmi les suggestions"
        >
          <Input
            id="entree-categorie"
            value={categorie}
            onChange={(e) => setCategorie(e.target.value)}
            onFocus={() => setShowCatSuggest(true)}
            onBlur={() => setTimeout(() => setShowCatSuggest(false), 150)}
            disabled={submitting}
            placeholder="Ex. Cardiologue, Pharmacie, Hôpital…"
          />
          {showCatSuggest && catSuggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {catSuggestions.map((c) => (
                <button
                  key={c}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    setCategorie(c)
                    setShowCatSuggest(false)
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold text-ocre-fonce border"
                  style={{
                    backgroundColor: 'rgba(232,161,53,0.10)',
                    borderColor: 'rgba(232,161,53,0.22)',
                  }}
                >
                  <Sparkles size={11} strokeWidth={1.8} className="opacity-60" />
                  {c}
                </button>
              ))}
            </div>
          )}
        </Field>

        <Field label="Téléphone">
          <Input
            id="entree-telephone"
            type="tel"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            disabled={submitting}
            placeholder="05 XX XX XX XX"
          />
        </Field>

        <Field label="E-mail">
          <Input
            id="entree-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            placeholder="contact@exemple.fr"
          />
        </Field>

        <Field label="Note">
          <Textarea
            id="entree-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={submitting}
            rows={4}
            placeholder="Horaires de garde, contact privilégié, contexte utile…"
          />
        </Field>
      </div>

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
      <div className="flex gap-2.5">
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

      {/* Zone danger : suppression (uniquement en edition + droits) */}
      {canDelete && onDelete && (
        <div className="mt-3">
          <p
            className="text-field-label mb-2 px-1"
            style={{ color: 'rgba(212,80,58,0.7)' }}
          >
            Zone danger
          </p>
          <button
            type="button"
            onClick={onDelete}
            disabled={submitting}
            className="w-full h-12 rounded-input bg-carte text-brique text-button flex items-center justify-center gap-2 border disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              borderColor: 'rgba(212,80,58,0.25)',
              backgroundColor: 'rgba(212,80,58,0.04)',
            }}
          >
            <Trash2 size={16} strokeWidth={1.8} />
            Supprimer cette entrée
          </button>
        </div>
      )}
    </form>
  )
}

// ----------------------------------------------------------------------------
// Sous-composants locaux
// ----------------------------------------------------------------------------

function Field({ label, children, hint }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-field-label">{label}</label>
      {children}
      {hint && (
        <p className="text-caption text-faint px-0.5 leading-relaxed">
          {hint}
        </p>
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

function Textarea(props) {
  return (
    <textarea
      {...props}
      className="w-full min-h-[96px] px-3.5 py-3 rounded-input bg-fond text-marine text-body-m border border-border focus:outline-none focus:border-canard focus:ring-1 focus:ring-canard resize-y disabled:opacity-60 disabled:cursor-not-allowed"
    />
  )
}
