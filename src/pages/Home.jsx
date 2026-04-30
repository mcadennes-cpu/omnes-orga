import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

export default function Home() {
  const { user, signOut } = useAuth()
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    try {
      await signOut()
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-fond">
      <div className="w-full max-w-sm bg-carte border border-border rounded-card p-6 text-center">
        <h1 className="font-display font-extrabold text-2xl text-ink mb-2">
          Bienvenue
        </h1>
        <p className="text-muted text-sm mb-6 break-words">
          Connecté en tant que{' '}
          <span className="font-semibold text-ink">{user?.email}</span>
        </p>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="w-full h-11 rounded-input bg-marine text-white font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {signingOut ? 'Déconnexion…' : 'Se déconnecter'}
        </button>
      </div>
    </div>
  )
}
