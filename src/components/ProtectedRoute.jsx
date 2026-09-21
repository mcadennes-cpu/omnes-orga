import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useRole } from '../hooks/useRole'
import CompteDesactive from '../pages/CompteDesactive'

export default function ProtectedRoute() {
  const { user, loading } = useAuth()
  const { profile, loading: profileLoading } = useRole()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-fond">
        <p className="text-muted">Chargement…</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // La fiche est encore en cours de chargement : on attend, sans quoi on
  // afficherait brievement l'appli a quelqu'un qui n'y a plus droit.
  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-fond">
        <p className="text-muted">Chargement…</p>
      </div>
    )
  }

  // Compte desactive : la RLS ne lui rend plus rien (chantier D), l'appli
  // n'afficherait que des listes vides sans explication. On l'arrete ici.
  // Comparaison stricte a false : `undefined` sur une fiche incomplete ne
  // doit pas fermer la porte a quelqu'un dont le compte est valide.
  if (profile && profile.actif === false) {
    return <CompteDesactive prenom={profile.prenom} />
  }

  return <Outlet />
}
