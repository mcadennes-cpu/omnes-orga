import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Plus, Users } from 'lucide-react'
import AppLayout from '../components/layout/AppLayout'
import MedecinCard from '../components/trombinoscope/MedecinCard'
import { useMedecins } from '../hooks/useMedecins'
import { useRole } from '../hooks/useRole'
import { canCreateMedecin } from '../lib/permissions'

export default function Trombinoscope() {
  const navigate = useNavigate()
  const { medecins, loading, error } = useMedecins()
  const { role } = useRole()

  const canViewNotes = role && role !== 'remplacant'
  const canViewSchedule = role && role !== 'remplacant'
  const canCreate = canCreateMedecin(role)

  function handleCreateClick() {
    // TODO 4C : ouvrir la modale CreateMedecinModal
    console.log('[4B] Bouton "+ Nouveau médecin" cliqué — modale à venir en 4C')
  }

  return (
    <AppLayout>
      <div className="flex flex-col">
        {/* Header sticky */}
        <header className="sticky top-0 z-10 bg-fond/95 backdrop-blur-sm border-b border-border">
          <div className="flex items-center gap-2 px-4 py-3">
            <button
              type="button"
              onClick={() => navigate('/')}
              aria-label="Retour à l'accueil"
              className="h-9 w-9 flex items-center justify-center rounded-full shrink-0"
            >
              <ChevronLeft size={20} strokeWidth={2} className="text-marine" />
            </button>
            <h1 className="flex-1 text-h1 text-marine">
              Trombinoscope
            </h1>
            {canCreate && (
              <button
                type="button"
                onClick={handleCreateClick}
                aria-label="Créer un nouveau médecin"
                className="h-10 w-10 flex items-center justify-center rounded-full bg-canard text-white shadow-button shrink-0 active:scale-95 transition-transform"
              >
                <Plus size={20} strokeWidth={2.2} />
              </button>
            )}
          </div>
        </header>

        {/* Sous-header : compteur */}
        {!loading && !error && medecins.length > 0 && (
          <div className="flex items-center px-4 py-2.5 text-muted text-xs uppercase tracking-wider">
            <span className="font-semibold">
              Médecins du cabinet
              <span className="text-faint"> · {medecins.length}</span>
            </span>
          </div>
        )}

        {/* Contenu */}
        <div className="flex-1 px-4 py-3">
          {loading && <TrombiSkeleton />}

          {!loading && error && (
            <ErrorState />
          )}

          {!loading && !error && medecins.length === 0 && (
            <EmptyState />
          )}

          {!loading && !error && medecins.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {medecins.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => navigate(`/trombinoscope/${m.id}`)}
                  aria-label={`Ouvrir la fiche de ${m.prenom ?? ''} ${m.nom ?? ''}`.trim()}
                  className="text-left rounded-card focus:outline-none focus:ring-2 focus:ring-canard focus:ring-offset-2 focus:ring-offset-fond"
                >
                  <MedecinCard
                    medecin={m}
                    canViewNotes={canViewNotes}
                    canViewSchedule={canViewSchedule}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}

// ----------------------------------------------------------------------------
// Sous-composants : Skeleton, Empty, Error
// ----------------------------------------------------------------------------

function TrombiSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="bg-carte border border-border rounded-card p-4 flex flex-col gap-3 animate-pulse"
        >
          <div className="flex items-start gap-3">
            <div className="h-[60px] w-[60px] rounded-full bg-border shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 bg-border rounded-full w-2/3" />
              <div className="h-2.5 bg-border/60 rounded-full w-1/2" />
              <div className="h-2.5 bg-border/60 rounded-full w-1/3" />
            </div>
          </div>
          <div className="h-3 bg-border/60 rounded-full w-1/3" />
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-14 h-14 rounded-tile bg-canard/15 flex items-center justify-center mb-4">
        <Users className="w-7 h-7 text-canard" strokeWidth={1.8} />
      </div>
      <h2 className="font-display font-extrabold text-marine text-lg mb-2">
        Aucun médecin pour l'instant
      </h2>
      <p className="text-muted text-sm max-w-xs">
        Le trombinoscope se remplira à mesure que les comptes seront créés.
      </p>
    </div>
  )
}

function ErrorState() {
  return (
    <div className="px-4 py-8 text-center">
      <p className="text-muted text-sm">
        Impossible de charger la liste des médecins.
      </p>
    </div>
  )
}
