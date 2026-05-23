// src/features/immobilier/ImmobilierBoardTile.jsx
// Tile d'un tableau dans la liste /immobilier.
// Pattern aligne sur BoardTile (Discussion) :
// - Icone de bulle dans tile coloree a gauche
// - Pastille non-lu en haut a droite de l'icone
// - Titre + ligne "N ouverte(s) · X membres" + date relative

import { Link } from 'react-router-dom';
import { MessageSquare, Users } from 'lucide-react';
import { getBoardColorClasses } from './immobilierColors';
import { formatRelativeDate } from '../../lib/dateFormat';

export default function ImmobilierBoardTile({ board }) {
  const colors = getBoardColorClasses(board.couleur);

  return (
    <Link
      to={`/immobilier/${board.id}`}
      className="block w-full text-left px-4 py-3 flex items-center gap-3
                 hover:bg-fond active:bg-fond transition-colors"
    >
      {/* Tile coloree a gauche */}
      <div className="relative shrink-0">
        <div
          className={`w-11 h-11 rounded-tile flex items-center justify-center ${colors.tileBg}`}
        >
          <MessageSquare className={`w-5 h-5 ${colors.tileText}`} strokeWidth={1.8} />
        </div>
        {board.hasUnread && (
          <span
            className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-carte ${colors.dot}`}
            aria-label="Nouveau message"
          />
        )}
      </div>

      {/* Texte */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <h3
            className={`flex-1 truncate text-marine ${
              board.hasUnread ? 'font-bold' : 'font-semibold'
            }`}
          >
            {board.titre}
          </h3>
          <span className="shrink-0 text-faint text-[11px]">
            {formatRelativeDate(board.last_activity_at)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-muted text-xs mt-0.5">
          <span>
            {board.openCardsCount}{' '}
            {board.openCardsCount > 1 ? 'ouvertes' : 'ouverte'}
          </span>
          <span className="text-faint">·</span>
          <span className="inline-flex items-center gap-1">
            <Users className="w-3 h-3" strokeWidth={1.8} />
            {board.membersCount}
          </span>
        </div>
      </div>
    </Link>
  );
}
