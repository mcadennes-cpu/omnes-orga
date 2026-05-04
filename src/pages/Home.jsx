import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useRole } from '../hooks/useRole'
import { getVisibleModules, ROLE_LABELS } from '../lib/modules'
import AppLayout from '../components/layout/AppLayout'
import HomeHeader from '../components/home/HomeHeader'
import ModuleTile from '../components/home/ModuleTile'
import ActivityList from '../components/home/ActivityList'

export default function Home() {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { role, prenom, nom, email, loading } = useRole()
  const [activeTab, setActiveTab] = useState('home')
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

  function handleModuleClick(moduleKey) {
    if (moduleKey === 'trombinoscope') {
      navigate('/trombinoscope')
      return
    }
    alert(`Module "${moduleKey}" à venir`)
  }

  const visibleModules = getVisibleModules(role)
  const roleLabel = role ? ROLE_LABELS[role] ?? role : null
  const fullName = [prenom, nom].filter(Boolean).join(' ').trim()

  return (
    <AppLayout activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'home' && (
        <>
          <HomeHeader prenom={prenom} />
          <div className="grid grid-cols-3 gap-3 px-5">
            {visibleModules.map((m) => (
              <ModuleTile
                key={m.key}
                label={m.label}
                icon={m.icon}
                color={m.color}
                onClick={() => handleModuleClick(m.key)}
              />
            ))}
          </div>
          <ActivityList />
        </>
      )}

      {activeTab === 'search' && (
        <div className="px-5 pt-8">
          <p className="text-center text-muted">Recherche à venir</p>
        </div>
      )}

      {activeTab === 'user' && (
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
      )}
    </AppLayout>
  )
}
