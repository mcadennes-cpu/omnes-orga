import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, MapPin, Paperclip, Calendar } from 'lucide-react'
import AppLayout from '../components/layout/AppLayout'
import { useEvenements } from '../features/evenements/useEvenements'
import { useRole } from '../hooks/useRole'
import { canCreateEvenement } from '../lib/permissions'
import { normalizeForSearch } from '../lib/profileFormat'
import { getEventColorClasses } from '../features/evenements/eventColors'
import { isPastEvent } from '../features/evenements/eventDate'
import EventDateBlock from '../features/evenements/EventDateBlock'

// ----------------------------------------------------------------------------
// Sous-composants
// ----------------------------------------------------------------------------

function EventCard({ evenement, past, onClick }) {
  const colors = getEventColorClasses(evenement.couleur)
  // Sur une carte passee, on neutralise : pas de pill Sondage ni d'indicateur.
  const showSondage = evenement.sondage_actif && !past
  const showARepondre = showSondage && !evenement.ma_reponse

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left bg-carte rounded-card shadow-card p-4 flex gap-4 items-center active:opacity-90 transition-opacity ${
        past ? 'opacity-85' : ''
      }`}
    >
      <EventDateBlock
        dateDebut={evenement.date_debut}
        dateFin={evenement.date_fin}
        couleur={evenement.couleur}
        past={past}
      />
      <div className="flex-1 min-w-0">
        <h3 className="text-marine font-semibold text-[15px] leading-snug truncate">
          {evenement.titre}
        </h3>
        {evenement.lieu && (
          <p className="mt-1 flex items-center gap-1 text-muted text-[13px]">
            <MapPin className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
            <span className="truncate">{evenement.lieu}</span>
          </p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-muted text-[12px]">
            <Paperclip className="w-3.5 h-3.5" strokeWidth={1.8} />
            {evenement.nb_fichiers}
          </span>
          {showSondage && (
            <span
              className={`inline-flex items-center px-2 h-5 rounded-pill text-[11px] font-semibold ${colors.soft} ${colors.softText}`}
            >
              Sondage
            </span>
          )}
          {showARepondre && (
            <span
              className={`ml-auto inline-flex items-center gap-1 text-[11px] font-semibold ${colors.softText}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${colors.solid}`} />
              À répondre
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

function EmptyState({ filtre, hasSearch }) {
  if (hasSearch) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <p className="text-muted text-sm">
          Aucun événement ne correspond à votre recherche.
        </p>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-marine/5 flex items-center justify-center mb-4">
        <Calendar className="w-7 h-7 text-faint" strokeWidth={1.8} />
      </div>
      <p className="text-muted text-sm">
        {filtre === 'passes'
          ? 'Aucun événement passé.'
          : 'Aucun événement à venir.'}
      </p>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="bg-carte rounded-card shadow-card p-4 flex gap-4 items-center animate-pulse"
        >
          <div className="w-[60px] h-[60px] rounded-input bg-border shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 bg-border rounded-full w-2/3" />
            <div className="h-2.5 bg-border/60 rounded-full w-1/3" />
            <div className="h-2.5 bg-border/60 rounded-full w-1/4" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Page principale
// ----------------------------------------------------------------------------

export default function Evenements() {
  const navigate = useNavigate()
  const { role } = useRole()
  const { evenements, loading, error } = useEvenements()

  const [search, setSearch] = useState('')
  const [filtre, setFiltre] = useState('avenir') // 'avenir' | 'passes'

  const canCreate = canCreateEvenement(role)
  const hasSearch = search.trim() !== ''

  const liste = useMemo(() => {
    // 1) partition a venir / passes
    let result = evenements.filter((e) => {
      const passe = isPastEvent(e.date_debut, e.date_fin)
      return filtre === 'passes' ? passe : !passe
    })

    // 2) recherche texte (titre + lieu), insensible aux accents
    const q = normalizeForSearch(search).trim()
    if (q) {
      result = result.filter((e) =>
        normalizeForSearch(`${e.titre ?? ''} ${e.lieu ?? ''}`).includes(q),
      )
    }

    // 3) tri : a venir = date_debut ASC ; passes = date_debut DESC.
    //    (date_debut est une chaine 'YYYY-MM-DD' : tri lexical = chronologique)
    result = [...result].sort((a, b) => {
      const cmp =
        a.date_debut < b.date_debut ? -1 : a.date_debut > b.date_debut ? 1 : 0
      return filtre === 'passes' ? -cmp : cmp
    })

    return result
  }, [evenements, filtre, search])

  function handleCreateClick() {
    // La modale de creation est branchee au lot 8D. Inerte pour l'instant.
  }

  return (
    <AppLayout>
      <div className="flex flex-col">
        {/* Header sticky : titre + recherche */}
        <header className="sticky top-0 z-10 bg-fond/95 backdrop-blur-sm border-b border-border">
          <div className="px-4 py-3">
            <h1 className="font-display font-extrabold text-marine text-2xl">
              Événements
            </h1>
          </div>
          <div className="px-4 pb-3">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none"
                strokeWidth={1.8}
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un événement…"
                className="w-full pl-9 pr-3 py-2.5 rounded-input bg-carte border border-border text-marine text-sm placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-canard/30"
              />
            </div>
          </div>
        </header>

        {/* Filtre segmente + CTA */}
        <div className="px-4 pt-3 space-y-3">
          <div className="flex gap-1 p-1 rounded-input bg-carte border border-border">
            {[
              { key: 'avenir', label: 'À venir' },
              { key: 'passes', label: 'Passés' },
            ].map((seg) => {
              const actif = filtre === seg.key
              return (
                <button
                  key={seg.key}
                  type="button"
                  onClick={() => setFiltre(seg.key)}
                  className={`flex-1 h-10 rounded-pill text-sm font-semibold transition-colors ${
                    actif ? 'bg-marine text-white shadow-sm' : 'text-muted'
                  }`}
                >
                  {seg.label}
                </button>
              )
            })}
          </div>

          {canCreate && (
            <button
              type="button"
              onClick={handleCreateClick}
              className="w-full h-12 rounded-input bg-marine text-white font-semibold shadow-button flex items-center justify-center gap-2 active:opacity-90 transition-opacity"
            >
              <Plus className="w-5 h-5" strokeWidth={2.2} />
              Nouvel événement
            </button>
          )}
        </div>

        {/* Liste */}
        <div className="flex-1 px-4 py-4">
          {error ? (
            <div className="py-8 text-center">
              <p className="text-muted text-sm mb-2">
                Impossible de charger les événements.
              </p>
              <p className="text-faint text-xs">{error.message}</p>
            </div>
          ) : loading ? (
            <LoadingSkeleton />
          ) : liste.length === 0 ? (
            <EmptyState filtre={filtre} hasSearch={hasSearch} />
          ) : (
            <div className="space-y-3">
              {liste.map((evenement) => (
                <EventCard
                  key={evenement.id}
                  evenement={evenement}
                  past={filtre === 'passes'}
                  onClick={() => navigate(`/evenements/${evenement.id}`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
