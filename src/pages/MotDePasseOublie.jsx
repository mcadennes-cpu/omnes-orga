import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, ArrowRight, CheckCircle, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import Filigrane from '../components/layout/Filigrane'

const EMAIL_REGEX = /^\S+@\S+\.\S+$/

export default function MotDePasseOublie() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState(null)

  function validate() {
    const trimmed = email.trim()
    if (!trimmed) return 'Veuillez saisir votre adresse e-mail.'
    if (!EMAIL_REGEX.test(trimmed)) return "L'adresse e-mail ne semble pas valide."
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
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: `${window.location.origin}/nouveau-mot-de-passe` }
      )
      if (resetError) {
        setError(resetError.message)
      } else {
        setSubmitted(true)
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

        <main className="mt-12 flex-1 flex flex-col">
          <div className="bg-carte rounded-card shadow-card p-6 sm:p-8">
            {submitted ? (
              <div className="flex flex-col items-center text-center">
                <CheckCircle size={48} className="text-olive" />
                <h2 className="mt-4 text-h1 text-marine">Email envoyé</h2>
                <p className="mt-3 text-body-m text-muted">
                  Si un compte existe avec cet email, vous recevrez un lien dans
                  quelques minutes.
                </p>
                <Link
                  to="/login"
                  className="mt-8 w-full h-[50px] rounded-input bg-marine text-white text-button shadow-button flex items-center justify-center gap-2.5"
                >
                  Retour à la connexion
                  <ArrowRight size={18} />
                </Link>
              </div>
            ) : (
              <>
                <h2 className="text-h1 text-marine">Mot de passe oublié ?</h2>
                <p className="mt-1.5 text-body-m text-muted">
                  Saisissez votre email pour recevoir un lien de réinitialisation.
                </p>

                <form onSubmit={handleSubmit} noValidate className="mt-8">
                  <label htmlFor="email" className="block text-field-label mb-2">
                    Email
                  </label>
                  <div className="relative">
                    <Mail
                      size={18}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-faint pointer-events-none"
                    />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="votre.email@exemple.fr"
                      autoComplete="email"
                      autoFocus
                      disabled={submitting}
                      className="w-full h-12 pl-12 pr-4 rounded-input bg-fond text-ink text-body-l placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-canard disabled:opacity-60"
                    />
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
                    {submitting ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Envoi…
                      </>
                    ) : (
                      <>
                        Envoyer le lien
                        <ArrowRight size={18} />
                      </>
                    )}
                  </button>
                </form>

                <div className="mt-6 text-center">
                  <Link
                    to="/login"
                    className="text-body-m text-canard hover:underline"
                  >
                    Retour à la connexion
                  </Link>
                </div>
              </>
            )}
          </div>
        </main>

        <footer className="mt-12 text-center text-tagline">
          UNE ÉQUIPE · 7J / 7 · SUR RENDEZ-VOUS
        </footer>
      </div>
    </div>
  )
}
