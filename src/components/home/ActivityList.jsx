import { ChevronRight } from 'lucide-react'

// Pastille de couleur par module (memes cles DS que le reste de l'app).
const DOT_BG = {
  marine: 'bg-marine',
  canard: 'bg-canard',
  ocre: 'bg-ocre',
  olive: 'bg-olive',
  brique: 'bg-brique',
  fuchsia: 'bg-fuchsia',
}

// Ligne secondaire (meta) selon le type d'item.
function metaLabel(item) {
  if (item.item_type === 'sondage') {
    if (item.module === 'evenements') return 'Sondage de présence à répondre'
    // sondage Discussion (Immobilier n'a pas de sondage)
    return item.board_titre
      ? `Sondage à voter · ${item.board_titre}`
      : 'Sondage à voter'
  }
  // message
  const n = item.non_lus ?? 0
  const mots = n > 1 ? 'nouveaux messages' : 'nouveau message'
  return item.board_titre ? `${n} ${mots} · ${item.board_titre}` : `${n} ${mots}`
}

// Cle stable pour le rendu de liste.
function itemKey(item) {
  if (item.module === 'evenements') return `ev-${item.evenement_id}`
  return `${item.module}-${item.card_id}-${item.item_type}`
}

export default function ActivityList({ items = [], loading = false, onSelect }) {
  // On n'affiche l'etat "chargement" qu'au tout premier chargement (items
  // encore vide). Un refetch en arriere-plan (retour au premier plan sur iOS)
  // ne doit pas faire clignoter une liste deja affichee.
  const firstLoad = loading && items.length === 0

  return (
    <section className="px-5 pt-6">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-faint">
        En attente
      </h2>

      {firstLoad ? (
        <div className="rounded-card border border-border bg-carte p-[14px]">
          <p className="text-center text-sm text-muted">Chargement…</p>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-card border border-border bg-carte p-[14px]">
          <p className="text-center text-sm text-muted">
            Rien en attente pour le moment.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-carte">
          {items.map((item) => (
            <li key={itemKey(item)}>
              <button
                type="button"
                onClick={() => onSelect?.(item)}
                className="flex w-full items-center gap-3 p-[14px] text-left transition-opacity active:opacity-70"
              >
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT_BG[item.couleur] ?? DOT_BG.marine}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {item.titre}
                  </span>
                  <span className="block truncate text-[12px] text-muted">
                    {metaLabel(item)}
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-faint" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
