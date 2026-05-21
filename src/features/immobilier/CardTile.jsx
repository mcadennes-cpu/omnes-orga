// src/features/immobilier/CardTile.jsx
// Tile d'une carte dans la liste du tableau.
// - Titre + badge statut + date de derniere activite
// - Onclick : ouvre la modale d'edition legere (10C-1)
//   En 10D : naviguera vers /immobilier/:boardId/:cardId pour le chat.

import { formatRelativeDate } from '../../lib/dateFormat';
import StatusBadge from './StatusBadge';

export default function CardTile({ card, onClick }) {
  const isClosed = card.statut === 'clos';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left bg-carte rounded-card shadow-card
                  border border-border p-4 hover:shadow-button
                  transition-shadow ${isClosed ? 'opacity-70' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-body-l text-ink font-medium break-words">
            {card.titre}
          </h3>
          {card.description && (
            <p className="text-body-m text-muted mt-1 line-clamp-2">
              {card.description}
            </p>
          )}
        </div>
        <StatusBadge statut={card.statut} />
      </div>
      <p className="text-caption text-faint mt-2">
        {formatRelativeDate(card.last_activity_at)}
      </p>
    </button>
  );
}
