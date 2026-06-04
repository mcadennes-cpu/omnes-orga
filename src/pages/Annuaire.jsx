import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Plus, Search, X, BookOpen, ChevronRight } from 'lucide-react'
import AppLayout from '../components/layout/AppLayout'
import Pill from '../components/common/Pill'
import { useEntreesAnnuaire } from '../hooks/useEntreesAnnuaire'
import HeaderWatermark from '../components/common/HeaderWatermark'

export default function Annuaire() {
  const navigate = useNavigate()
  const { entrees, loading, error } = useEntreesAnnuaire()
  const [search, setSearch] = useState('')
  const [activeCat, setActiveCat] = useState(null)

  // Categories presentes dans l'annuaire, triees alphabetiquement (sensible aux accents francais).
  const presentCats = useMemo(() => {
    const set = new Set(
      entrees
        .map((e) => e.categorie)
        .filter((c) => c && c.trim() !== '')
    )
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'))
  }, [entrees])

  // Filtrage : par recherche texte (nom, categorie, note) et par categorie active.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return entrees.filter((e) => {
      if (activeCat && e.categorie !== activeCat) return false
      if (q) {
        const haystack = [e.nom ?? '', e.categorie ?? '', e.note ?? '']
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [entrees, search, activeCat])

  const total = entrees.length
  const visibleCount = filtered.length
  const isFiltered = search.trim() !== '' || activeCat !== null

  function clearFilters() {
    setSearch('')
    setActiveCat(null)
  }

  return (
    <AppLayout>
      <div className="flex flex-col">
        {/* Header sticky : chevron + titre + bouton + ocre */}
        <header className="sticky top-0 z-10 bg-fond/95 backdrop-blur-sm border-b border-border relative overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 relative z-10">
            <button
              type="button"
              onClick={() => navigate('/')}
              aria-label="Retour à l'accueil"
              className="h-9 w-9 flex items-center justify-center rounded-full shrink-0"
            >
              <ChevronLeft size={20} strokeWidth={2} className="text-marine" />
            </button>
            <h1 className="flex-1 text-h1 text-marine">Annuaire</h1>
            <button
              type="button"
              onClick={() => navigate('/annuaire/nouveau')}
              aria-label="Ajouter une entrée"
              className="h-9 w-9 rounded-full bg-ocre text-white flex items-center justify-center shadow-button shrink-0"
            >
              <Plus size={20} strokeWidth={2.4} />
            </button>
          </div>

          {/* Search bar */}
          <div className="px-4 pb-3 relative z-10">
            <div className="flex items-center gap-2.5 h-11 px-3 rounded-input bg-carte border border-border shadow-card">
              <Search size={18} strokeWidth={1.8} className="text-faint shrink-0" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nom, catégorie, note…"
                className="flex-1 bg-transparent text-body-m font-medium text-marine placeholder:text-faint focus:outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Effacer la recherche"
                  className="h-[22px] w-[22px] rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: 'rgba(28,61,82,0.10)' }}
                >
                  <X size={12} strokeWidth={2} className="text-muted" />
                </button>
              )}
            </div>
          </div>
          <HeaderWatermark color="ocre" fill offsetRight={64} />
        </header>

        {/* Pills catégories horizontales scrollables */}
        {!loading && !error && entrees.length > 0 && presentCats.length > 0 && (
          <div className="flex gap-1.5 px-4 py-2 overflow-x-auto hide-scrollbar">
            <CategoryPill
              active={!activeCat}
              onClick={() => setActiveCat(null)}
              label="Tout"
            />
            {presentCats.map((cat) => (
              <CategoryPill
                key={cat}
                active={activeCat === cat}
                onClick={() => setActiveCat(activeCat === cat ? null : cat)}
                label={cat}
              />
            ))}
          </div>
        )}

        {/* Count adaptatif */}
        {!loading && !error && entrees.length > 0 && (
          <div className="flex items-center px-4 py-2 text-muted text-xs uppercase tracking-wider">
            <span className="font-semibold">
              {isFiltered
                ? `${visibleCount} sur ${total} entrée${total > 1 ? 's' : ''}`
                : `${total} entrée${total > 1 ? 's' : ''}`}
            </span>
          </div>
        )}

        {/* Contenu */}
        <div className="flex-1 px-4 pb-6">
          {loading && <AnnuaireSkeleton />}

          {!loading && error && (
            <p className="text-center text-brique py-12">
              Erreur : {error.message}
            </p>
          )}

          {!loading && !error && entrees.length === 0 && (
            <EmptyState onCreate={() => navigate('/annuaire/nouveau')} />
          )}

          {!loading && !error && entrees.length > 0 && filtered.length === 0 && (
            <NoResults onClear={clearFilters} />
          )}

          {!loading && !error && filtered.length > 0 && (
            <div className="bg-carte border border-border rounded-card shadow-card overflow-hidden">
              {filtered.map((entree, idx) => (
                <div key={entree.id}>
                  {idx > 0 && <div className="h-px bg-border ml-4" />}
                  <EntryRow
                    entree={entree}
                    onClick={() => navigate(`/annuaire/${entree.id}`)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}

// ----------------------------------------------------------------------------
// Sous-composants
// ----------------------------------------------------------------------------

function CategoryPill({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors ${
        active
          ? 'bg-marine text-white'
          : 'bg-carte border border-border text-marine'
      }`}
    >
      {label}
    </button>
  )
}

function EntryRow({ entree, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-fond transition-colors"
    >
      <div className="flex-1 min-w-0">
        <p className="text-body-l font-semibold text-marine truncate">
          {entree.nom}
        </p>
        <div className="flex items-center gap-2 mt-1 min-w-0">
          {entree.categorie && (
            <Pill color="ocre" variant="soft" size="sm">
              {entree.categorie}
            </Pill>
          )}
          {entree.telephone && (
            <span className="text-caption text-faint truncate">
              · {entree.telephone}
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={18} strokeWidth={1.8} className="text-faint shrink-0" />
    </button>
  )
}

function AnnuaireSkeleton() {
  return (
    <div className="bg-carte border border-border rounded-card shadow-card overflow-hidden" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i}>
          {i > 0 && <div className="h-px bg-border ml-4" />}
          <div className="flex items-center gap-3 px-4 py-3.5 animate-pulse">
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-border rounded-full w-2/3" />
              <div className="h-2.5 bg-border/60 rounded-full w-1/3" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ onCreate }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div
        className="h-24 w-24 rounded-tile flex items-center justify-center mb-5"
        style={{ backgroundColor: 'rgba(232,161,53,0.16)' }}
      >
        <BookOpen size={38} strokeWidth={1.6} className="text-ocre-fonce" />
      </div>
      <h2 className="font-display font-extrabold text-marine text-lg mb-2 tracking-[-0.01em]">
        Aucune entrée pour l'instant
      </h2>
      <p className="text-body-m text-muted max-w-xs mb-6 leading-relaxed">
        L'annuaire est le carnet d'adresses partagé du cabinet : spécialistes, laboratoires, urgences, pharmacies…
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="inline-flex items-center gap-2 h-11 px-5 rounded-input bg-ocre text-white text-button shadow-button"
      >
        <Plus size={18} strokeWidth={2.2} />
        Ajouter une entrée
      </button>
      <p className="mt-6 text-caption text-faint max-w-xs leading-relaxed">
        Toute l'équipe (associés, gérants, remplaçants) peut ajouter et consulter les entrées.
      </p>
    </div>
  )
}

function NoResults({ onClear }) {
  return (
    <div className="bg-carte border border-border rounded-card shadow-card text-center py-8 px-5">
      <div className="inline-flex h-12 w-12 rounded-full items-center justify-center mb-3" style={{ backgroundColor: 'rgba(28,61,82,0.08)' }}>
        <Search size={22} strokeWidth={1.8} className="text-faint" />
      </div>
      <p className="font-display font-extrabold text-marine text-base mb-1">
        Aucun résultat
      </p>
      <p className="text-body-m text-muted mb-4">
        Aucune entrée ne correspond à votre recherche.
      </p>
      <button
        type="button"
        onClick={onClear}
        className="px-4 h-9 rounded-input bg-carte border border-border text-marine text-button"
      >
        Effacer les filtres
      </button>
    </div>
  )
}
