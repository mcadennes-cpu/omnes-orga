import { lazy, Suspense } from 'react'
import { Navigate } from 'react-router-dom'
import { useRole } from '../hooks/useRole'

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
// Phase beta : reservee aux profils agenda_beta_access = true ; les autres
// sont renvoyes a l'accueil. Garde de confort d'interface uniquement : les
// donnees vivent dans le projet Supabase Planning, protege par sa propre
// auth et sa propre RLS (le module affiche d'ailleurs encore sa page de
// login Planning jusqu'a l'etape 3).
export default function Agenda() {
  const { profile, loading } = useRole()

  // Tant que le profil charge, ne pas rediriger : un F5 sur /planning
  // passerait par ici avec profile=null et ejecterait un utilisateur legitime.
  if (loading) return <Chargement />

  if (!profile?.agenda_beta_access) {
    return <Navigate to="/" replace />
  }

  return (
    <Suspense fallback={<Chargement />}>
      {/* Le profil Orga descend dans le module : l'adaptateur (userAdapter.ts)
          s'en sert pour verifier la coherence des roles et pre-remplir
          l'ecran de liaison. */}
      <AgendaApp orgaProfile={profile} />
    </Suspense>
  )
}
