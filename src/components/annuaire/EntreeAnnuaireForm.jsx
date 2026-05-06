import { useState } from 'react'

function toStringValue(v) {
  return v === null || v === undefined ? '' : String(v)
}

// Validation email simple : un @ et un . apres. Suffisant pour un cas pratique
// (la RFC 5322 complete est trop permissive et inutile ici).
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
}) {
  const [nom, setNom] = useState(toStringValue(initialValues.nom))
  const [categorie, setCategorie] = useState(toStringValue(initialValues.categorie))
  const [telephone, setTelephone] = useState(toStringValue(initialValues.telephone))
  const [email, setEmail] = useState(toStringValue(initialValues.email))
  const [note, setNote] = useState(toStringValue(initialValues.note))
  const [validationError, setValidationError] = useState(null)

  const trimmedNom = nom.trim()
  const trimmedEmail = email.trim()
  const isValid = trimmedNom !== '' && isValidEmail(trimmedEmail)

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
      <div className={fieldClass}>
        <label htmlFor="entree-nom" className={labelClass}>
          Nom <span className="text-brique">*</span>
        </label>
        <input
          id="entree-nom"
          type="text"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          className={inputClass}
          disabled={submitting}
          required
          placeholder="Ex : Dr Lefevre, Pharmacie de la Place…"
        />
      </div>

      <div className={fieldClass}>
        <label htmlFor="entree-categorie" className={labelClass}>
          Catégorie
        </label>
        <input
          id="entree-categorie"
          type="text"
          value={categorie}
          onChange={(e) => setCategorie(e.target.value)}
          className={inputClass}
          disabled={submitting}
          list="categories-existantes"
          placeholder="Ex : Cardiologue, Pharmacie, Laboratoire…"
        />
        <datalist id="categories-existantes">
          {existingCategories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <p className="text-xs text-muted">
          Tapez librement ou choisissez parmi les catégories déjà existantes.
        </p>
      </div>

      <div className={fieldClass}>
        <label htmlFor="entree-telephone" className={labelClass}>
          Téléphone
        </label>
        <input
          id="entree-telephone"
          type="tel"
          value={telephone}
          onChange={(e) => setTelephone(e.target.value)}
          className={inputClass}
          disabled={submitting}
        />
      </div>

      <div className={fieldClass}>
        <label htmlFor="entree-email" className={labelClass}>
          E-mail
        </label>
        <input
          id="entree-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
          disabled={submitting}
        />
      </div>

      <div className={fieldClass}>
        <label htmlFor="entree-note" className={labelClass}>
          Note
        </label>
        <textarea
          id="entree-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="min-h-[96px] w-full rounded-input border border-border bg-white px-3 py-2.5 text-sm text-ink focus:border-canard focus:outline-none disabled:bg-fond disabled:text-muted resize-y"
          disabled={submitting}
          rows={4}
          placeholder="Horaires, adresse, contact privilégié…"
        />
      </div>

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
