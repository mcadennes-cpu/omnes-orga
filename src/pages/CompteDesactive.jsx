import { useState } from 'react'
import { LockKeyhole, LogOut } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import Filigrane from '../components/layout/Filigrane'

// Ecran affiche quand la fiche du compte connecte porte `actif = false`.
//
// Pourquoi il existe : depuis le chantier D, les 27 tables du schema public
// portent une policy restrictive qui exige un compte actif. Une fiche
// desactivee ne lit donc plus rien -- sauf sa propre ligne de `profiles`,
// volontairement laissee passante. Sans cette exception, useRole() ne
// recevrait aucune donnee et resterait bloque en `loading` : la personne
// tomberait sur un ecran de chargement infini, sans la moindre explication.
// C'est cette ligne-la qui permet d'afficher le message ci-dessous.
export default function CompteDesactive({ prenom }) {
  const { signOut } = useAuth()
  const [enCours, setEnCours] = useState(false)

  async function handleSignOut() {
    if (enCours) return
    setEnCours(true)
    try {
      await signOut()
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="min-h-screen bg-fond relative overflow-hidden">
      <Filigrane />

      <div className="relative z-10 min-h-screen flex flex-col px-6 py-9">
        <header className="flex flex-col items-center">
          <img
            src="/logo-omnes.webp"
            alt="Omnès Médecins"
            className="w-[130px] h-auto"
          />
        </header>

        <main className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-card bg-marine/[0.08] flex items-center justify-center">
            <LockKeyhole size={28} strokeWidth={2} className="text-marine" />
          </div>

          <h1 className="mt-6 text-h1 text-marine">
            {prenom ? `Bonjour ${prenom},` : 'Accès suspendu'}
          </h1>

          <p className="mt-3 text-body-l text-muted max-w-sm">
            Votre compte a été désactivé. Vous n'avez plus accès aux
            informations du cabinet.
          </p>

          <p className="mt-4 text-body-m text-muted max-w-sm">
            S'il s'agit d'une erreur, contactez un associé gérant du cabinet
            pour qu'il réactive votre fiche.
          </p>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={enCours}
            className="mt-10 h-12 px-6 inline-flex items-center gap-2 rounded-input bg-marine text-carte text-button shadow-button disabled:opacity-60"
          >
            <LogOut size={18} strokeWidth={2} />
            {enCours ? 'Déconnexion…' : 'Se déconnecter'}
          </button>
        </main>
      </div>
    </div>
  )
}
