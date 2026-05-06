import { useEntreesAnnuaire } from '../hooks/useEntreesAnnuaire'
import AppLayout from '../components/layout/AppLayout'

export default function Annuaire() {
  const { entrees, loading, error } = useEntreesAnnuaire()

  return (
    <AppLayout>
      <div className="px-5 pt-6">
        <h1 className="text-2xl font-bold text-marine">Annuaire</h1>
        <p className="mt-1 text-sm text-muted">
          Carnet d'adresses partagé du cabinet
        </p>
      </div>

      <div className="mt-6 px-5">
        {loading && <p className="text-muted">Chargement…</p>}

        {error && (
          <p className="text-brique">Erreur : {error.message}</p>
        )}

        {!loading && !error && entrees.length === 0 && (
          <p className="text-muted">Aucune entrée pour le moment.</p>
        )}

        {!loading && !error && entrees.length > 0 && (
          <ul className="space-y-2">
            {entrees.map((e) => (
              <li
                key={e.id}
                className="rounded-lg border border-gray-200 bg-white p-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-marine">{e.nom}</span>
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
      </div>
    </AppLayout>
  )
}
