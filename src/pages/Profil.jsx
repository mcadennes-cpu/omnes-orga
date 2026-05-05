import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useRole } from '../hooks/useRole'
import { ROLE_LABELS } from '../lib/modules'
import AppLayout from '../components/layout/AppLayout'

export default function Profil() {
  const { signOut } = useAuth()
  const { role, prenom, nom, email, loading } = useRole()
  const [signingOut, setSigningOut] = useState(false)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-fond">
        <p className="text-muted">Chargement…</p>
      </div>
    )
  }

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    try {
      await signOut()
    } finally {
      setSigningOut(false)
    }
  }

  const roleLabel = role ? ROLE_LABELS[role] ?? role : null
  const fullName = [prenom, nom].filter(Boolean).join(' ').trim()

  return (
    <AppLayout>
      <section className="px-5 pt-8">
        <h1 className="font-display text-xl font-extrabold text-marine">
          {fullName ? `Bienvenue ${fullName}` : 'Bienvenue'}
        </h1>
        {roleLabel && (
          <p className="mt-2 text-sm text-muted">Rôle : {roleLabel}</p>
        )}
        {email && (
          <p className="mt-1 text-sm text-muted break-words">{email}</p>
        )}
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="mt-6 h-12 w-full rounded-input bg-marine font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {signingOut ? 'Déconnexion…' : 'Se déconnecter'}
        </button>
      </section>
    </AppLayout>
  )
}
