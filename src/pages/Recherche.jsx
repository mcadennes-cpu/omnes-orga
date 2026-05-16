import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search } from 'lucide-react'
import AppLayout from '../components/layout/AppLayout'
import MedecinCard from '../components/trombinoscope/MedecinCard'
import { useMedecins } from '../hooks/useMedecins'
import { useRole } from '../hooks/useRole'
import { normalizeForSearch } from '../lib/profileFormat'

export default function Recherche() {
  const navigate = useNavigate()
  const { medecins, loading, error } = useMedecins()
  const { role } = useRole()
  const [query, setQuery] = useState('')

  const canViewNotes = role && role !== 'remplacant'
  const canViewSchedule = role && role !== 'remplacant'

  // Recherche insensible aux accents et a la casse : on normalise
  // le terme saisi ET les champs compares. normalizeForSearch applique
  // deja toLowerCase + suppression des accents (cf. src/lib/profileFormat.js).
  const trimmed = normalizeForSearch(query).trim()
  const filtered =
    trimmed === ''
      ? []
      : medecins.filter((m) => {
          const text = normalizeForSearch(
            `${m.prenom ?? ''} ${m.nom ?? ''} ${m.specialite ?? ''}`
          )
          return text.includes(trimmed)
        })

  return (
    <AppLayout>
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
          Rechercher
        </h1>
      </header>

      <div className="px-5 pt-2">
        <div className="relative">
          <Search
            size={20}
            strokeWidth={2}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un médecin du cabinet…"
            aria-label="Rechercher un médecin du cabinet"
            className="w-full h-12 pl-11 pr-4 rounded-input bg-white border border-border text-marine placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-canard"
          />
        </div>
        <p className="mt-2 text-xs text-faint">
          Pour l'instant, la recherche couvre le Trombinoscope. Elle s'étendra aux autres modules au fil du projet.
        </p>

        <div className="mt-6">
          {loading && (
            <p className="text-center text-muted py-8">Chargement…</p>
          )}
          {!loading && error && (
            <p className="text-center text-brique py-8">
              Impossible de charger la liste des médecins.
            </p>
          )}
          {!loading && !error && trimmed === '' && (
            <p className="text-center text-muted py-8">
              Tapez quelques lettres pour lancer la recherche.
            </p>
          )}
          {!loading && !error && trimmed !== '' && filtered.length === 0 && (
            <p className="text-center text-muted py-8">
              Aucun médecin trouvé pour « {query} ».
            </p>
          )}
          {!loading && !error && filtered.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {filtered.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => navigate(`/trombinoscope/${m.id}`)}
                  aria-label={`Ouvrir la fiche de ${m.prenom ?? ''} ${m.nom ?? ''}`.trim()}
                  className="text-left rounded-card focus:outline-none focus:ring-2 focus:ring-canard focus:ring-offset-2 focus:ring-offset-fond hover:shadow-md transition-shadow"
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
