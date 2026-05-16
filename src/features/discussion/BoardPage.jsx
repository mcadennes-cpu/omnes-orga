import { useMemo } from 'react'
import { ArrowLeft, Plus, MessageSquarePlus } from 'lucide-react'
import CardListItem from './CardListItem'
import MemberAvatars from './MemberAvatars'
import { getBoardColorClasses } from './boardColors'

const STATUS_TABS = [
  { id: 'open', label: 'Ouvertes' },
  { id: 'closed', label: 'Closes' },
  { id: 'all', label: 'Toutes' },
]

/**
 * Composant presentationnel de la vue d'un tableau de discussion (7B).
 * Toute la donnee et les actions arrivent en props depuis DiscussionBoard.
 */
export default function BoardPage({
  board,
  cards,
  memberProfiles = [],
  isLoading,
  statusFilter,
  onStatusFilterChange,
  canCreateCard,
  onCreateCard,
  onCardClick,
  onBack,
  onUnarchive,
  headerActions,
}) {
  const accent = getBoardColorClasses(board?.color)

  const counts = useMemo(
    () => ({
      open: cards.filter((c) => c.status === 'open').length,
      closed: cards.filter((c) => c.status === 'closed').length,
      all: cards.length,
    }),
    [cards]
  )

  const visibleCards = useMemo(() => {
    if (statusFilter === 'all') return cards
    return cards.filter((c) => c.status === statusFilter)
  }, [cards, statusFilter])

  return (
    <div className="flex flex-col">
      {/* Header sticky */}
      <header className="sticky top-0 z-10 bg-fond/95 backdrop-blur-sm border-b border-border">
        {/* Ligne 1 : retour + titre + actions */}
        <div className="flex items-center gap-1 px-2 py-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Retour à la liste des tableaux"
            className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-marine hover:bg-marine/5 active:bg-marine/5 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" strokeWidth={2} />
          </button>
          <h1 className="flex-1 min-w-0 truncate font-display font-extrabold text-marine text-xl">
            {board?.title}
          </h1>
          {headerActions}
        </div>

        {/* Ligne 2 : membres + CTA nouvelle carte */}
        <div className="flex items-center justify-between gap-3 px-4 pb-3 min-h-[36px]">
          <MemberAvatars profiles={memberProfiles} max={4} />
          {canCreateCard && (
            <button
              type="button"
              onClick={onCreateCard}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full ${accent.cta} font-semibold text-sm active:opacity-80 transition-opacity`}
            >
              <Plus className="w-4 h-4" strokeWidth={2.4} />
              Nouvelle carte
            </button>
          )}
        </div>

        {/* Ligne 3 : onglets de statut */}
        <div className="px-4 pb-3">
          <div className="flex gap-1 p-1 bg-fond rounded-full">
            {STATUS_TABS.map((tab) => {
              const active = tab.id === statusFilter
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onStatusFilterChange(tab.id)}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                    active ? 'bg-carte text-marine shadow-sm' : 'text-muted'
                  }`}
                >
                  {tab.label}
                  <span
                    className={`min-w-[18px] px-1 rounded-full text-[11px] ${
                      active ? 'bg-marine/10 text-marine' : 'bg-marine/5 text-muted'
                    }`}
                  >
                    {counts[tab.id]}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </header>

      {/* Bandeau tableau archive */}
      {board?.archived && (
        <div className="px-4 py-2.5 bg-ocre/15 flex items-center justify-between gap-3">
          <span className="text-marine text-xs font-medium">
            Ce tableau est archivé.
          </span>
          {onUnarchive && (
            <button
              type="button"
              onClick={onUnarchive}
              className="shrink-0 text-marine text-xs font-semibold underline underline-offset-2"
            >
              Désarchiver
            </button>
          )}
        </div>
      )}

      {/* Contenu */}
      <div className="flex-1 bg-carte">
        {isLoading ? (
          <BoardSkeleton />
        ) : cards.length === 0 ? (
          <EmptyBoard
            accent={accent}
            canCreateCard={canCreateCard}
            onCreateCard={onCreateCard}
          />
        ) : visibleCards.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <p className="text-muted text-sm">
              {statusFilter === 'open'
                ? 'Aucune carte ouverte.'
                : 'Aucune carte close.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visibleCards.map((card) => (
              <li key={card.id}>
                <CardListItem card={card} onClick={() => onCardClick(card)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Sous-composants
// ----------------------------------------------------------------------------

function BoardSkeleton() {
  return (
    <div className="px-4 py-4 space-y-5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2 animate-pulse">
          <div className="h-3 bg-border rounded-full w-2/3" />
          <div className="h-2.5 bg-border/60 rounded-full w-1/2" />
          <div className="h-2.5 bg-border/60 rounded-full w-1/4" />
        </div>
      ))}
    </div>
  )
}

function EmptyBoard({ accent, canCreateCard, onCreateCard }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className={`w-14 h-14 rounded-tile ${accent.tileBg} flex items-center justify-center mb-4`}>
        <MessageSquarePlus className={`w-7 h-7 ${accent.tileText}`} strokeWidth={1.8} />
      </div>
      <h2 className="font-display font-extrabold text-marine text-lg mb-2">
        Aucune carte ici
      </h2>
      <p className="text-muted text-sm max-w-xs mb-5">
        Créez une carte par sujet ou par question à trancher. Chaque carte ouvre un fil de discussion.
      </p>
      {canCreateCard && (
        <button
          type="button"
          onClick={onCreateCard}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full ${accent.cta} font-semibold text-sm active:opacity-80 transition-opacity`}
        >
          <Plus className="w-4 h-4" strokeWidth={2.2} />
          Créer la première carte
        </button>
      )}
    </div>
  )
}
