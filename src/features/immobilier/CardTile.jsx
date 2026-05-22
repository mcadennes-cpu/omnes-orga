// src/features/immobilier/CardTile.jsx
// Tile d'une carte dans la liste du tableau.
// - Titre + badge statut + aperçu du dernier message + compteur non-lus
//   + date de derniere activite
// - Clic : navigation vers la vue carte plein ecran

import { Link } from 'react-router-dom';
import { formatRelativeDate } from '../../lib/dateFormat';
import { formatShortName } from '../../lib/profileFormat';
import StatusBadge from './StatusBadge';

export default function CardTile({ card }) {
  const isClosed = card.statut === 'clos';
  const unread = card.unreadCount || 0;
  const lastMessage = card.lastMessage; // { auteur: {prenom, nom}, contenu } ou null

  return (
    <Link
      to={`/immobilier/${card.board_id}/${card.id}`}
      className={`block bg-carte rounded-card shadow-card border border-border
                  p-4 hover:shadow-button transition-shadow
                  ${isClosed ? 'opacity-70' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-body-l text-ink font-medium break-words">
            {card.titre}
          </h3>
          {card.description && !lastMessage && (
            <p className="text-body-m text-muted mt-1 line-clamp-2">
              {card.description}
            </p>
          )}
          {lastMessage && (
            <p className="text-body-m text-muted mt-1 line-clamp-1">
              <span className="text-ink font-medium">
                {lastMessage.auteur
                  ? formatShortName(lastMessage.auteur)
                  : 'Anonyme'}
                {' : '}
              </span>
              {lastMessage.contenu}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {unread > 0 && (
            <span
              className="inline-flex items-center justify-center
                         min-w-[20px] h-5 px-1.5
                         bg-brique text-white text-caption rounded-full"
              aria-label={`${unread} messages non lus`}
            >
              {unread}
            </span>
          )}
          <StatusBadge statut={card.statut} />
        </div>
      </div>
      <p className="text-caption text-faint mt-2">
        {formatRelativeDate(card.last_activity_at)}
      </p>
    </Link>
  );
}
