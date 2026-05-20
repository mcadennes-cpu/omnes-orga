// src/features/immobilier/ImmobilierBoardTile.jsx
// Tile cliquable d'un tableau Immobilier dans la page liste.
// - Couleur d'identite a gauche (barre verticale)
// - Titre + description tronquee + date de derniere activite
// - Cliquable vers /immobilier/:id
// Sobriete volontaire en 10B : pas d'avatars ni de compteur de cartes
// (arriveront en 10C/10D quand les donnees seront disponibles).

import { Link } from 'react-router-dom';
import { formatRelativeDate } from '../../lib/dateFormat';
import { getBoardColorClasses } from './immobilierColors';

export default function ImmobilierBoardTile({ board }) {
  const colors = getBoardColorClasses(board.couleur);

  return (
    <Link
      to={`/immobilier/${board.id}`}
      className="block bg-carte rounded-card shadow-card border border-border
                 overflow-hidden hover:shadow-button transition-shadow"
    >
      <div className="flex">
        {/* Barre verticale couleur du tableau */}
        <div className={`w-1.5 ${colors.bg} flex-shrink-0`} aria-hidden="true" />

        {/* Contenu */}
        <div className="flex-1 p-4 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-body-l text-ink font-medium truncate">
              {board.titre}
            </h3>
            <span className="text-caption text-faint flex-shrink-0">
              {formatRelativeDate(board.last_activity_at)}
            </span>
          </div>

          {board.description && (
            <p className="text-body-m text-muted mt-1 line-clamp-2">
              {board.description}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
