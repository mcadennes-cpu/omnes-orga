import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const isSignup = mode === 'signup'

  function validate() {
    if (!email.trim()) return 'Veuillez saisir votre adresse e-mail.'
    if (password.length < 6) return 'Le mot de passe doit contenir au moins 6 caractères.'
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
      const { error: authError } = isSignup
        ? await signUp(email.trim(), password)
        : await signIn(email.trim(), password)

      if (authError) {
        setError(authError.message)
      }
    } catch (err) {
      setError(err?.message ?? String(err))
    } finally {
      setSubmitting(false)
    }
  }

  function toggleMode() {
    setMode(isSignup ? 'signin' : 'signup')
    setError(null)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-fond">
      <div className="w-full max-w-sm bg-carte border border-border rounded-card p-6">
        <h1 className="font-display font-extrabold text-2xl text-ink mb-1">
          {isSignup ? 'Créer un compte' : 'Connexion'}
        </h1>
        <p className="text-muted text-sm mb-6">
          {isSignup
            ? 'Renseignez votre adresse e-mail et un mot de passe.'
            : 'Connectez-vous avec votre adresse e-mail.'}
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <label className="block text-faint text-[11px] font-semibold uppercase tracking-[0.14em] mb-1">
            Adresse e-mail
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            disabled={submitting}
            className="w-full h-11 px-3 mb-4 rounded-input border border-border bg-carte text-ink focus:outline-none focus:border-canard disabled:opacity-60"
          />

          <label className="block text-faint text-[11px] font-semibold uppercase tracking-[0.14em] mb-1">
            Mot de passe
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            disabled={submitting}
            className="w-full h-11 px-3 mb-4 rounded-input border border-border bg-carte text-ink focus:outline-none focus:border-canard disabled:opacity-60"
          />

          {error && (
            <p className="text-brique text-sm font-medium mb-4 break-words">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-11 rounded-input bg-marine text-white font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting
              ? (isSignup ? 'Création…' : 'Connexion…')
              : (isSignup ? 'Créer le compte' : 'Se connecter')}
          </button>
        </form>

        <button
          type="button"
          onClick={toggleMode}
          disabled={submitting}
          className="block w-full mt-4 text-canard text-sm hover:underline disabled:opacity-60"
        >
          {isSignup
            ? 'Déjà un compte ? Se connecter'
            : 'Pas encore de compte ? Créer un compte'}
        </button>
      </div>
    </div>
  )
}
