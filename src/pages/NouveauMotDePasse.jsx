import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle,
  Circle,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import Filigrane from '../components/layout/Filigrane'

function checkPolicy(pwd) {
  const length = pwd.length >= 10
  const lowercase = /[a-z]/.test(pwd)
  const uppercase = /[A-Z]/.test(pwd)
  const digit = /[0-9]/.test(pwd)
  const symbol = /[^a-zA-Z0-9]/.test(pwd)
  return {
    length,
    lowercase,
    uppercase,
    digit,
    symbol,
    allOk: length && lowercase && uppercase && digit && symbol,
  }
}

const POLICY_LABELS = [
  { key: 'length', label: 'Au moins 10 caractères' },
  { key: 'lowercase', label: 'Une lettre minuscule' },
  { key: 'uppercase', label: 'Une lettre majuscule' },
  { key: 'digit', label: 'Un chiffre' },
  { key: 'symbol', label: 'Un caractère spécial (!@#$...)' },
]

export default function NouveauMotDePasse() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [recoveryReady, setRecoveryReady] = useState(false)
  const [linkInvalid, setLinkInvalid] = useState(false)

  useEffect(() => {
    let cancelled = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (cancelled) return
        if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
          setRecoveryReady(true)
        }
      }
    )

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      if (data?.session) {
        setRecoveryReady(true)
      }
    })

    const timeoutId = setTimeout(() => {
      if (cancelled) return
      setRecoveryReady((ready) => {
        if (!ready) setLinkInvalid(true)
        return ready
      })
    }, 5000)

    return () => {
      cancelled = true
      subscription.unsubscribe()
      clearTimeout(timeoutId)
    }
  }, [])

  const policy = checkPolicy(password)
  const passwordsMatch = password === passwordConfirm
  const confirmError =
    passwordConfirm.length > 0 && !passwordsMatch
      ? 'Les deux mots de passe ne sont pas identiques.'
      : null
  const canSubmit =
    !submitting && policy.allOk && passwordsMatch && passwordConfirm.length > 0

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return

    if (!policy.allOk) {
      setError('Le mot de passe ne respecte pas les règles requises.')
      return
    }
    if (!passwordsMatch) {
      setError('Les deux mots de passe ne sont pas identiques.')
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(updateError.message)
      } else {
        setSuccess(true)
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
            {linkInvalid ? (
              <div className="flex flex-col items-center text-center">
                <AlertCircle size={48} className="text-brique" />
                <h2 className="mt-4 text-h1 text-marine">Lien invalide ou expiré</h2>
                <p className="mt-3 text-body-m text-muted">
                  Le lien que vous avez utilisé est invalide ou a expiré. Veuillez
                  refaire une demande de réinitialisation.
                </p>
                <Link
                  to="/mot-de-passe-oublie"
                  className="mt-8 w-full h-[50px] rounded-input bg-marine text-white text-button shadow-button flex items-center justify-center gap-2.5"
                >
                  Demander un nouveau lien
                  <ArrowRight size={18} />
                </Link>
              </div>
            ) : !recoveryReady ? (
              <div className="flex flex-col items-center text-center py-8">
                <Loader2 size={32} className="text-canard animate-spin" />
                <p className="mt-4 text-body-m text-muted">
                  Vérification du lien…
                </p>
              </div>
            ) : success ? (
              <div className="flex flex-col items-center text-center">
                <CheckCircle size={48} className="text-olive" />
                <h2 className="mt-4 text-h1 text-marine">Mot de passe modifié</h2>
                <p className="mt-3 text-body-m text-muted">
                  Votre mot de passe a bien été enregistré.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/', { replace: true })}
                  className="mt-8 w-full h-[50px] rounded-input bg-marine text-white text-button shadow-button flex items-center justify-center gap-2.5"
                >
                  Continuer vers l'application
                  <ArrowRight size={18} />
                </button>
              </div>
            ) : (
              <>
                <h2 className="text-h1 text-marine">Nouveau mot de passe</h2>
                <p className="mt-1.5 text-body-m text-muted">
                  Choisissez un mot de passe pour sécuriser votre compte.
                </p>

                <form onSubmit={handleSubmit} noValidate className="mt-8">
                  <label htmlFor="password" className="block text-field-label mb-2">
                    Nouveau mot de passe
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
                      autoComplete="new-password"
                      autoFocus
                      disabled={submitting}
                      className="w-full h-12 pl-12 pr-12 rounded-input bg-fond text-ink text-body-l focus:outline-none focus:ring-2 focus:ring-canard disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      disabled={submitting}
                      aria-label={
                        showPassword
                          ? 'Masquer le mot de passe'
                          : 'Afficher le mot de passe'
                      }
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-faint hover:text-muted disabled:opacity-60"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>

                  <ul className="mt-4 space-y-2">
                    {POLICY_LABELS.map(({ key, label }) => {
                      const ok = policy[key]
                      return (
                        <li
                          key={key}
                          className={`flex items-center gap-2 text-body-m transition-colors ${
                            ok ? 'text-ink' : 'text-muted'
                          }`}
                        >
                          {ok ? (
                            <CheckCircle
                              size={14}
                              className="text-olive transition-colors flex-shrink-0"
                            />
                          ) : (
                            <Circle
                              size={14}
                              className="text-faint transition-colors flex-shrink-0"
                            />
                          )}
                          <span>{label}</span>
                        </li>
                      )
                    })}
                  </ul>

                  <label
                    htmlFor="password-confirm"
                    className="block text-field-label mb-2 mt-6"
                  >
                    Confirmer le mot de passe
                  </label>
                  <div className="relative">
                    <Lock
                      size={18}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-faint pointer-events-none"
                    />
                    <input
                      id="password-confirm"
                      type={showPassword ? 'text' : 'password'}
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                      autoComplete="new-password"
                      disabled={submitting}
                      className="w-full h-12 pl-12 pr-4 rounded-input bg-fond text-ink text-body-l focus:outline-none focus:ring-2 focus:ring-canard disabled:opacity-60"
                    />
                  </div>
                  {confirmError && (
                    <p className="mt-2 text-brique text-body-m font-medium">
                      {confirmError}
                    </p>
                  )}

                  {error && (
                    <div className="mt-4 flex items-start gap-2 bg-brique/10 border border-brique/20 rounded-input p-3">
                      <AlertCircle
                        size={18}
                        className="text-brique flex-shrink-0 mt-0.5"
                      />
                      <p className="text-brique text-body-m break-words">
                        {error}
                      </p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="mt-8 w-full h-[50px] rounded-input bg-marine text-white text-button shadow-button flex items-center justify-center gap-2.5 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Enregistrement…
                      </>
                    ) : (
                      <>
                        Enregistrer le nouveau mot de passe
                        <ArrowRight size={18} />
                      </>
                    )}
                  </button>
                </form>
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
