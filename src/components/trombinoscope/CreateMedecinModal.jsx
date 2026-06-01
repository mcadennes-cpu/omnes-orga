import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, UserPlus, Loader2, Mail } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'

const ROLES = [
  { value: 'remplacant', label: 'Remplaçant' },
  { value: 'associe', label: 'Associé' },
  { value: 'associe_gerant', label: 'Associé gérant' },
  { value: 'super_admin', label: 'Super administrateur' },
]

export default function CreateMedecinModal({ open, onClose, onCreated }) {
  const [email, setEmail] = useState('')
  const [nom, setNom] = useState('')
  const [prenom, setPrenom] = useState('')
  const [role, setRole] = useState('remplacant')
  const [sendEmail, setSendEmail] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const emailInputRef = useRef(null)

  // Reset à chaque ouverture + focus sur le premier champ
  useEffect(() => {
    if (!open) return
    setEmail('')
    setNom('')
    setPrenom('')
    setRole('remplacant')
    setSendEmail(false)
    setSubmitting(false)
    setError(null)
    // Léger délai pour laisser le slide-up se faire avant le focus
    const t = setTimeout(() => emailInputRef.current?.focus(), 250)
    return () => clearTimeout(t)
  }, [open])

  // Bloquer le scroll du body + touche Escape
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKey(e) {
      if (e.key === 'Escape' && !submitting) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKey)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, submitting, onClose])

  if (!open) return null

  function validate() {
    if (!email.trim()) return "L'adresse e-mail est requise."
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return 'Adresse e-mail invalide.'
    }
    if (!nom.trim()) return 'Le nom est requis.'
    if (!prenom.trim()) return 'Le prénom est requis.'
    if (!role) return 'Le rôle est requis.'
    return null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setSubmitting(true)

    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        'create-medecin',
        {
          body: {
            email: email.trim().toLowerCase(),
            nom: nom.trim(),
            prenom: prenom.trim(),
            role,
            sendEmail,
          },
        }
      )

      if (invokeError) {
        let businessError = invokeError.message ?? 'Erreur inconnue.'
        try {
          // invokeError.context EST directement l'objet Response.
          // On essaie de lire le body JSON pour extraire notre message metier.
          if (invokeError.context && typeof invokeError.context.json === 'function') {
            const responseBody = await invokeError.context.json()
            if (responseBody?.error) {
              businessError = responseBody.error
            }
          }
        } catch {
          // Si le body n'est pas du JSON ou deja consomme : on garde le generique
        }
        setError(businessError)
        setSubmitting(false)
        return
      }

      // Cas 2 : 200 mais success: false (peu probable, defensive)
      if (!data?.success) {
        setError(data?.error ?? "La création n'a pas abouti.")
        setSubmitting(false)
        return
      }

      // Cas 3 : succes. On propage les valeurs a la page parent.
      onCreated({
        email: data.email,
        tempPassword: data.tempPassword,
        emailSent: data.emailSent ?? false,
        emailError: data.emailError,
      })
      // Le parent va fermer cette modale. Pas besoin de reset submitting :
      // le useEffect sur `open` le fera au prochain ouvrir.
    } catch (err) {
      console.error('Erreur invoke create-medecin :', err)
      setError('Erreur réseau. Vérifiez votre connexion et réessayez.')
      setSubmitting(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="create-medecin-title">
      {/* Overlay */}
      <button
        type="button"
        aria-label="Fermer"
        onClick={() => !submitting && onClose()}
        className="absolute inset-0 bg-marine/40"
        disabled={submitting}
      />

      {/* Sheet */}
      <div className="relative w-full max-w-lg bg-carte rounded-t-card shadow-card animate-slide-up max-h-[92vh] flex flex-col">
        {/* Poignée + header */}
        <div className="flex flex-col items-center pt-3 pb-2 shrink-0">
          <div className="w-10 h-1 rounded-full bg-border" aria-hidden />
        </div>

        <div className="flex items-center justify-between px-5 pb-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-pill bg-canard/15 flex items-center justify-center">
              <UserPlus size={18} className="text-canard" strokeWidth={2} />
            </div>
            <h2 id="create-medecin-title" className="text-h2 text-marine">
              Nouveau médecin
            </h2>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            aria-label="Fermer"
            className="h-9 w-9 flex items-center justify-center rounded-full text-muted hover:text-ink disabled:opacity-50"
          >
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        {/* Formulaire */}
        <form onSubmit={handleSubmit} noValidate className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-body-m text-muted mb-5">
            Le compte sera créé immédiatement avec un mot de passe temporaire que vous pourrez transmettre.
          </p>

          {/* Email */}
          <label htmlFor="cm-email" className="block text-field-label mb-1.5">
            Adresse e-mail
          </label>
          <input
            id="cm-email"
            ref={emailInputRef}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="prenom.nom@example.com"
            autoComplete="off"
            disabled={submitting}
            className="w-full h-11 px-3 mb-4 rounded-input bg-fond text-ink text-body-l placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-canard disabled:opacity-60"
          />

          {/* Nom + Prénom (côte à côte sur sm+) */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label htmlFor="cm-prenom" className="block text-field-label mb-1.5">
                Prénom
              </label>
              <input
                id="cm-prenom"
                type="text"
                value={prenom}
                onChange={(e) => setPrenom(e.target.value)}
                autoComplete="off"
                disabled={submitting}
                className="w-full h-11 px-3 rounded-input bg-fond text-ink text-body-l placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-canard disabled:opacity-60"
              />
            </div>
            <div>
              <label htmlFor="cm-nom" className="block text-field-label mb-1.5">
                Nom
              </label>
              <input
                id="cm-nom"
                type="text"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                autoComplete="off"
                disabled={submitting}
                className="w-full h-11 px-3 rounded-input bg-fond text-ink text-body-l placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-canard disabled:opacity-60"
              />
            </div>
          </div>

          {/* Rôle */}
          <label htmlFor="cm-role" className="block text-field-label mb-1.5">
            Rôle
          </label>
          <select
            id="cm-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={submitting}
            className="w-full h-11 px-3 mb-2 rounded-input bg-fond text-ink text-body-l focus:outline-none focus:ring-2 focus:ring-canard disabled:opacity-60"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <p className="text-caption text-muted mb-5">
            Modifiable plus tard depuis la fiche du médecin.
          </p>

          {/* Case à cocher : envoi par email */}
          <label
            htmlFor="cm-send-email"
            className={`flex items-start gap-3 px-3 py-3 mb-4 rounded-input border cursor-pointer transition-colors ${
              sendEmail
                ? 'bg-canard/10 border-canard/40'
                : 'bg-fond border-border'
            } ${submitting ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <input
              id="cm-send-email"
              type="checkbox"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
              disabled={submitting}
              className="mt-0.5 h-4 w-4 accent-canard cursor-pointer disabled:cursor-not-allowed"
            />
            <div className="flex-1">
              <div className="flex items-center gap-1.5">
                <Mail size={15} className="text-canard" strokeWidth={2} />
                <span className="text-body-m text-ink font-medium">
                  Envoyer aussi par email
                </span>
              </div>
              <p className="text-caption text-muted mt-0.5 leading-snug">
                Le mot de passe sera envoyé à l'adresse du médecin. Vous pourrez aussi le transmettre manuellement après création.
              </p>
            </div>
          </label>

          {/* Erreur */}
          {error && (
            <div className="mb-4 px-3 py-2.5 bg-brique/10 rounded-input">
              <p className="text-body-m text-brique font-medium">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 h-11 rounded-input bg-fond text-ink text-button border border-border disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 h-11 rounded-input bg-canard text-white text-button shadow-button flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting && <Loader2 size={16} className="animate-spin" />}
              {submitting ? 'Création…' : 'Créer le compte'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}
