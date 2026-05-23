// src/features/immobilier/CardTile.jsx
// Tile d'une carte dans la liste du tableau.
// Pattern aligne sur CardListItem (Discussion) :
// - Ligne 1 : statut + titre + compteur non-lu + chevron
// - Ligne 2 : apercu du dernier message (ou placeholder)
// - Ligne 3 : meta (compteur messages + date relative)

import { Link } from 'react-router-dom';
import { ChevronRight, MessageSquare } from 'lucide-react';
import { formatRelativeDate } from '../../lib/dateFormat';
import { formatShortName } from '../../lib/profileFormat';
import StatusBadge from './StatusBadge';

export default function CardTile({ card }) {
  const lastMessage = card.lastMessage;
  const unread = card.unreadCount || 0;
  const count = card.messagesCount || 0;

  // Apercu "Prenom N. : texte" si on a un dernier message,
  // sinon placeholder italique pour ne pas avoir de ligne 2 vide.
  const lastMessagePreview = lastMessage
    ? `${lastMessage.auteur ? formatShortName(lastMessage.auteur) : 'Anonyme'} : ${lastMessage.contenu || ''}`
    : null;

  return (
    <Link
      to={`/immobilier/${card.board_id}/${card.id}`}
      className="block px-4 py-3.5 hover:bg-fond active:bg-fond transition-colors"
    >
      {/* Ligne 1 : statut + titre + compteur non-lu + chevron */}
      <div className="flex items-center gap-2">
        <span className="shrink-0">
          <StatusBadge statut={card.statut} />
        </span>
        <h3 className="flex-1 min-w-0 truncate font-semibold text-marine text-sm">
          {card.titre}
        </h3>
        {unread > 0 && (
          <span
            className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full
                       bg-brique text-white text-[11px] font-bold
                       flex items-center justify-center"
            aria-label={`${unread} messages non lus`}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
        <ChevronRight className="w-4 h-4 text-faint shrink-0" strokeWidth={2} />
      </div>

      {/* Ligne 2 : apercu du dernier message */}
      <p
        className={`mt-1.5 text-xs truncate ${
          lastMessagePreview ? 'text-muted' : 'text-faint italic'
        }`}
      >
        {lastMessagePreview || "Aucun message pour l'instant"}
      </p>

      {/* Ligne 3 : meta */}
      <div className="mt-1.5 flex items-center gap-1.5 text-faint text-[11px]">
        {count > 0 && (
          <>
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" strokeWidth={1.8} />
              {count}
            </span>
            <span aria-hidden="true">·</span>
          </>
        )}
        <span>{formatRelativeDate(card.last_activity_at)}</span>
      </div>
    </Link>
  );
}
