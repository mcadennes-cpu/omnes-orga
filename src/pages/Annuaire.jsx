import { useMemo, useState } from 'react'
import { useEntreesAnnuaire } from '../hooks/useEntreesAnnuaire'
import AppLayout from '../components/layout/AppLayout'

export default function Annuaire() {
  const { entrees, loading, error } = useEntreesAnnuaire()
  const [search, setSearch] = useState('')
  const [categorie, setCategorie] = useState('')

  // Liste des categories distinctes existantes, triees pour le dropdown.
  // Recalcul uniquement si la liste des entrees change (pas a chaque render).
  const categories = useMemo(() => {
    const set = new Set(
      entrees
        .map((e) => e.categorie)
        .filter((c) => c && c.trim() !== '')
    )
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'))
  }, [entrees])

  // Filtrage combine : recherche texte (nom + categorie + note) ET filtre categorie.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return entrees.filter((e) => {
      // Filtre categorie
      if (categorie && e.categorie !== categorie) return false
      // Filtre recherche texte
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
      <div className="px-5 pt-6">
        <h1 className="text-2xl font-bold text-marine">Annuaire</h1>
        <p className="mt-1 text-sm text-muted">
          Carnet d'adresses partagé du cabinet
        </p>
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
                  <li
                    key={e.id}
                    className="rounded-lg border border-gray-200 bg-white p-3"
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
                      <a
                        href={`tel:${e.telephone}`}
                        className="mt-1 inline-block text-sm text-canard"
                      >
                        {e.telephone}
                      </a>
                    )}
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
