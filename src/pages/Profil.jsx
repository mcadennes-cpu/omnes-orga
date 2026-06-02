import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Smartphone, ChevronRight, User, Mail, BadgeCheck, LogOut } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useRole } from '../hooks/useRole'
import { ROLE_LABELS } from '../lib/modules'
import AppLayout from '../components/layout/AppLayout'
import Pill from '../components/common/Pill'
import { getAvatarPalette } from '../lib/avatarColor'
import HeaderWatermark from '../components/common/HeaderWatermark'

function getInitials(prenom, nom) {
  const p = (prenom ?? '').trim().charAt(0).toUpperCase()
  const n = (nom ?? '').trim().charAt(0).toUpperCase()
  return `${p}${n}` || '?'
}

export default function Profil() {
  const { signOut } = useAuth()
  const { role, prenom, nom, email, loading } = useRole()
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

  const roleLabel = role ? ROLE_LABELS[role] ?? role : null
  const fullName = [prenom, nom].filter(Boolean).join(' ').trim()
  const initials = getInitials(prenom, nom)
  const avatar = getAvatarPalette(fullName || null)

  return (
    <AppLayout>
      {/* Header sticky — aligné sur MedecinDetail */}
      <header className="sticky top-0 z-10 bg-fond/95 backdrop-blur-sm border-b border-border relative overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 relative z-10">
          <h1 className="flex-1 text-h1 text-marine">Profil</h1>
        </div>
        <HeaderWatermark color="marine" />
      </header>

      <div className="px-4 pt-6 pb-8">
        {loading ? (
          <p className="text-center text-muted py-12">Chargement…</p>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Identité centrée : avatar initiales + nom + rôle */}
            <div className="flex flex-col items-center gap-3 pt-2">
              <div
                aria-hidden="true"
                className={`h-[108px] w-[108px] rounded-full ${avatar.bg} ${avatar.text} font-display font-extrabold text-[38px] flex items-center justify-center`}
              >
                {initials}
              </div>
              <div className="text-center">
                <h2 className="font-display font-extrabold text-marine text-[22px] tracking-[-0.01em] break-words">
                  {fullName || 'Mon compte'}
                </h2>
              </div>
              {roleLabel && (
                <Pill color="canard" variant="soft" size="sm">
                  {roleLabel}
                </Pill>
              )}
            </div>

            {/* Section Compte */}
            <section>
              <p className="text-field-label mb-2 px-1">Compte</p>
              <div className="bg-carte border border-border rounded-card shadow-card overflow-hidden divide-y divide-border">
                {fullName && (
                  <InfoRow icon={User} label="Nom" value={fullName} />
                )}
                {roleLabel && (
                  <InfoRow icon={BadgeCheck} label="Rôle" value={roleLabel} />
                )}
                {email && (
                  <InfoRow icon={Mail} label="E-mail" value={email} multiline />
                )}
              </div>
            </section>

            {/* Section Application */}
            <section>
              <p className="text-field-label mb-2 px-1">Application</p>
              <Link
                to="/installer"
                className="bg-carte border border-border rounded-card shadow-card flex items-center justify-between px-4 py-3.5"
              >
                <span className="flex items-center gap-3.5">
                  <span
                    className="h-9 w-9 rounded-pill flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'rgba(42,143,168,0.10)' }}
                  >
                    <Smartphone size={18} strokeWidth={1.8} className="text-canard" />
                  </span>
                  <span className="text-body-l font-medium text-marine">
                    Installer l'application
                  </span>
                </span>
                <ChevronRight size={18} strokeWidth={2} className="text-marine/35 shrink-0" />
              </Link>
            </section>

            {/* Déconnexion */}
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="h-12 w-full rounded-input bg-carte border border-border text-brique text-button flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <LogOut size={16} strokeWidth={2} />
              {signingOut ? 'Déconnexion…' : 'Se déconnecter'}
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  )
}

// ----------------------------------------------------------------------------
// Sous-composant local : InfoRow (calqué sur ContactRow de MedecinDetail,
// mais sans lien — affichage simple)
// ----------------------------------------------------------------------------

function InfoRow({ icon: Icon, label, value, multiline = false }) {
  return (
    <div className="flex items-center gap-3.5 px-4 py-3.5">
      <span
        className="h-9 w-9 rounded-pill flex items-center justify-center shrink-0"
        style={{ backgroundColor: 'rgba(42,143,168,0.10)' }}
      >
        <Icon size={18} strokeWidth={1.8} className="text-canard" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-field-label">{label}</p>
        <p
          className={`text-body-l font-medium text-marine mt-0.5 ${
            multiline ? 'break-words' : 'truncate'
          }`}
        >
          {value}
        </p>
      </div>
    </div>
  )
}
