import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import Filigrane from '../components/layout/Filigrane'

export default function Login() {
  const navigate = useNavigate()
  const { user, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (user) {
      navigate('/', { replace: true })
    }
  }, [user, navigate])

  function validate() {
    if (!email.trim()) return 'Veuillez saisir votre adresse e-mail.'
    if (password.length < 6) return 'Le mot de passe doit contenir au moins 6 caracteres.'
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
      const { error: authError } = await signIn(email.trim(), password)
      if (authError) {
        setError(authError.message)
      }
    } catch (err) {
      setError(err?.message ?? String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-fond relative overflow-hidden">
      <Filigrane />

      <div className="relative z-10 min-h-screen flex flex-col px-6 py-9">
        <header className="flex flex-col items-center">
          <img
            src="/logo-omnes.webp"
            alt="Omnes Medecins"
            className="w-[130px] h-auto"
          />
          <h1
            className="mt-1 font-display text-[28px] font-black tracking-[-0.02em] leading-none text-marine text-center"
            style={{ transform: 'scaleY(1.1)', transformOrigin: 'center top' }}
          >
            OMNÈS MÉDECINS
          </h1>
          <p className="mt-1 text-body-m text-muted text-center">
            Organisation du cabinet
          </p>
        </header>

        <main className="mt-12 flex-1">
          <h2 className="text-h1 text-marine">Bienvenue</h2>
          <p className="mt-1.5 text-body-m text-muted">
            Connectez-vous avec votre adresse e-mail.
          </p>

          <form onSubmit={handleSubmit} noValidate className="mt-9">
            <label htmlFor="email" className="block text-field-label mb-2">
              Adresse e-mail
            </label>
            <div className="relative mb-[18px]">
              <Mail
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-faint pointer-events-none"
              />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="prenom.nom@omnesmedecins.fr"
                autoComplete="email"
                disabled={submitting}
                className="w-full h-12 pl-12 pr-4 rounded-input bg-carte shadow-card text-ink text-body-l placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-canard disabled:opacity-60"
              />
            </div>

            <label htmlFor="password" className="block text-field-label mb-2">
              Mot de passe
            </label>
            <div className="relative">
              <Lock
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-faint pointer-events-none"
              />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={submitting}
                className="w-full h-12 pl-12 pr-12 rounded-input bg-carte shadow-card text-ink text-body-l focus:outline-none focus:ring-2 focus:ring-canard disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                disabled={submitting}
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-faint hover:text-muted disabled:opacity-60"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {error && (
              <p className="mt-4 text-brique text-body-m font-medium break-words">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="mt-8 w-full h-[50px] rounded-input bg-marine text-white text-button shadow-button flex items-center justify-center gap-2.5 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? 'Connexion…' : 'Se connecter'}
              {!submitting && <ArrowRight size={18} />}
            </button>
          </form>
        </main>

        <footer className="mt-12 text-center text-tagline">
          UNE ÉQUIPE · 7J / 7 · SUR RENDEZ-VOUS
        </footer>
      </div>
    </div>
  )
}
