import { lazy, Suspense } from 'react'
import { Navigate } from 'react-router-dom'
import { useRole } from '../hooks/useRole'
import { canAccessAgenda } from '../lib/permissions'

// Le module agenda (~11 700 lignes TS) est charge en lazy : son code n'est
// telecharge que lorsqu'on ouvre /planning, pas au demarrage de l'appli.
// Vite en fait un chunk separe automatiquement grace a cet import() dynamique.
const AgendaApp = lazy(() => import('../modules/agenda/App'))

function Chargement() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-fond">
      <p className="text-muted">Chargement…</p>
    </div>
  )
}

// Page du module Planning (identifiant interne : agenda — cf. modules.js).
// Garde de page : un compte sans role medecin (le poste de bureau) qui
// forcerait l'URL /planning est renvoye a l'accueil. La tuile lui est de
// toute facon deja masquee par getVisibleModules cote Home.
// Ce n'est qu'un confort d'interface : la vraie barriere est en base, ou les
// 51 policies du schema `agenda` passent par agenda.peut_acceder(), qui exige
// la meme liste de roles et un compte actif. Les deux listes doivent rester
// alignees — voir canAccessAgenda() dans permissions.js.
export default function Agenda() {
  const { profile, role, loading } = useRole()

  // Tant que le profil charge, ne pas rediriger : un F5 sur /planning
  // passerait par ici avec role=null et ejecterait un utilisateur legitime.
  if (loading) return <Chargement />

  if (!canAccessAgenda(role)) {
    return <Navigate to="/" replace />
  }

  return (
    <Suspense fallback={<Chargement />}>
      {/* Le profil Orga descend dans le module : l'adaptateur (userAdapter.ts)
          en fait l'utilisateur de l'agenda, avec le role deduit de
          is_agenda_coordinator. */}
      <AgendaApp orgaProfile={profile} />
    </Suspense>
  )
}
