import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useEntreesAnnuaire } from '../hooks/useEntreesAnnuaire'
import AppLayout from '../components/layout/AppLayout'

export default function Annuaire() {
  const navigate = useNavigate()
  const { entrees, loading, error } = useEntreesAnnuaire()
  const [search, setSearch] = useState('')
  const [categorie, setCategorie] = useState('')

  const categories = useMemo(() => {
    const set = new Set(
      entrees
        .map((e) => e.categorie)
        .filter((c) => c && c.trim() !== '')
    )
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'))
  }, [entrees])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return entrees.filter((e) => {
      if (categorie && e.categorie !== categorie) return false
      if (q) {
        const haystack = [e.nom ?? '', e.categorie ?? '', e.note ?? '']
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [entrees, search, categorie])

  const hasActiveFilter = search.trim() !== '' || categorie !== ''

  return (
    <AppLayout>
      <div className="flex items-start justify-between gap-3 px-5 pt-6">
        <div>
          <h1 className="text-2xl font-bold text-marine">Annuaire</h1>
          <p className="mt-1 text-sm text-muted">
            Carnet d'adresses partagé du cabinet
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/annuaire/nouveau')}
          className="shrink-0 rounded-lg bg-canard px-3 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80"
        >
          + Ajouter
        </button>
      </div>

      <div className="mt-4 space-y-2 px-5">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher (nom, catégorie, note)…"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-canard focus:outline-none focus:ring-1 focus:ring-canard"
        />
        <select
          value={categorie}
          onChange={(e) => setCategorie(e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-canard focus:outline-none focus:ring-1 focus:ring-canard"
        >
          <option value="">Toutes les catégories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 px-5">
        {loading && <p className="text-muted">Chargement…</p>}

        {error && (
          <p className="text-brique">Erreur : {error.message}</p>
        )}

        {!loading && !error && entrees.length === 0 && (
          <p className="text-muted">Aucune entrée pour le moment.</p>
        )}

        {!loading && !error && entrees.length > 0 && (
          <>
            <p className="mb-2 text-xs text-muted">
              {filtered.length} entrée{filtered.length > 1 ? 's' : ''}
              {hasActiveFilter && ` sur ${entrees.length}`}
            </p>

            {filtered.length === 0 ? (
              <p className="text-muted">Aucun résultat.</p>
            ) : (
              <ul className="space-y-2">
                {filtered.map((e) => (
                  <li key={e.id}>
                    <Link
                      to={`/annuaire/${e.id}`}
                      className="block rounded-lg border border-gray-200 bg-white p-3 transition hover:bg-gray-50 active:bg-gray-100"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold text-marine">
                          {e.nom}
                        </span>
                        {e.categorie && (
                          <span className="shrink-0 text-xs text-muted">
                            {e.categorie}
                          </span>
                        )}
                      </div>
                      {e.telephone && (
                        <span className="mt-1 inline-block text-sm text-canard">
                          {e.telephone}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </AppLayout>
  )
}
