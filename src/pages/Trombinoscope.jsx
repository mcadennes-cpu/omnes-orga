import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import AppLayout from '../components/layout/AppLayout'
import MedecinCard from '../components/trombinoscope/MedecinCard'
import { useMedecins } from '../hooks/useMedecins'
import { useRole } from '../hooks/useRole'

export default function Trombinoscope() {
  const navigate = useNavigate()
  const { medecins, loading, error } = useMedecins()
  const { role } = useRole()

  const canViewNotes = role && role !== 'remplacant'
  const canViewSchedule = role && role !== 'remplacant'

  return (
    <AppLayout activeTab={null}>
      <header className="flex items-center gap-3 px-5 pt-6 pb-4">
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="Retour à l'accueil"
          className="h-10 w-10 flex items-center justify-center rounded-full text-marine hover:bg-marine/5"
        >
          <ArrowLeft size={22} strokeWidth={2} />
        </button>
        <h1 className="font-display font-extrabold text-2xl text-marine">
          Trombinoscope
        </h1>
      </header>

      <div className="px-5 pt-2">
        {loading && (
          <p className="text-center text-muted py-12">Chargement…</p>
        )}

        {!loading && error && (
          <p className="text-center text-brique py-12">
            Impossible de charger la liste des médecins.
          </p>
        )}

        {!loading && !error && medecins.length === 0 && (
          <p className="text-center text-muted py-12">
            Aucun médecin dans le cabinet pour l'instant.
          </p>
        )}

        {!loading && !error && medecins.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {medecins.map((m) => (
              <MedecinCard
                key={m.id}
                medecin={m}
                canViewNotes={canViewNotes}
                canViewSchedule={canViewSchedule}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
