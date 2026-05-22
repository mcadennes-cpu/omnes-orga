// src/features/immobilier/CardMessage.jsx
// Affichage d'un message dans le fil de la carte.
// - Bulles asymetriques : mes messages a droite (couleur tableau),
//   autres a gauche (carte blanche)
// - Affichage du nom de l'auteur uniquement pour les messages des autres
// - Heure compacte, mention "(modifie)" si edited
// - Menu contextuel sur mes propres messages : modifier / supprimer

import { useEffect, useRef, useState } from 'react';
import { Pencil, Trash2, MoreVertical } from 'lucide-react';
import { formatTime } from '../../lib/dateFormat';
import { formatShortName, initials } from '../../lib/profileFormat';
import { getBoardColorClasses } from './immobilierColors';

export default function CardMessage({
  message,
  currentUserId,
  boardColor,
  showAuthor,    // afficher le nom au-dessus (premier message de l'auteur dans le bloc)
  canInteract,   // false si carte close = pas de menu modifier/supprimer
  onEditClick,
  onDeleteClick,
}) {
  const isMine = message.auteur_id === currentUserId;
  const colors = getBoardColorClasses(boardColor);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Fermer le menu au clic en dehors
  useEffect(() => {
    if (!menuOpen) return undefined;
    function onClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('touchstart', onClickOutside);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('touchstart', onClickOutside);
    };
  }, [menuOpen]);

  const auteur = message.auteur;
  const auteurNom = auteur
    ? formatShortName(auteur)
    : 'Utilisateur supprime';

  // Layout : mes messages a droite, autres a gauche
  const containerClasses = isMine
    ? 'flex justify-end'
    : 'flex justify-start';

  const bubbleClasses = isMine
    ? `${colors.bg} text-white rounded-card rounded-br-sm`
    : 'bg-carte border border-border text-ink rounded-card rounded-bl-sm';

  return (
    <div className={`${containerClasses} mb-1.5 group`}>
      <div className="max-w-[80%] flex items-end gap-2">
        {/* Avatar des autres a gauche (uniquement pour le 1er message du bloc) */}
        {!isMine && showAuthor && auteur && (
          <div
            className="w-7 h-7 rounded-full bg-canard text-white
                       text-caption flex items-center justify-center
                       flex-shrink-0 mb-1"
            aria-hidden="true"
          >
            {initials(auteur)}
          </div>
        )}
        {/* Espaceur si pas d'avatar (continuite de bloc) */}
        {!isMine && !showAuthor && (
          <div className="w-7 flex-shrink-0" aria-hidden="true" />
        )}

        <div className="min-w-0">
          {/* Nom auteur affiche uniquement pour le 1er msg du bloc, et pas pour moi */}
          {!isMine && showAuthor && (
            <p className="text-caption text-muted mb-0.5 ml-2">
              {auteurNom}
            </p>
          )}

          {/* Bulle */}
          <div className={`relative px-3 py-2 ${bubbleClasses}`}>
            <p className="text-body-m whitespace-pre-wrap break-words">
              {message.contenu}
            </p>
            <p className={`text-caption mt-0.5 ${isMine ? 'text-white/70' : 'text-faint'}`}>
              {formatTime(message.created_at)}
              {message.edited && (
                <span className="ml-1 italic">(modifie)</span>
              )}
            </p>

            {/* Menu pour mes messages : modifier / supprimer */}
            {isMine && canInteract && (
              <div className="absolute -left-8 top-1/2 -translate-y-1/2" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="opacity-0 group-hover:opacity-100
                             p-1 text-muted hover:text-ink rounded-pill
                             transition-opacity"
                  aria-label="Actions"
                >
                  <MoreVertical size={16} aria-hidden="true" />
                </button>
                {menuOpen && (
                  <div
                    className="absolute right-0 bottom-full mb-1
                               bg-carte border border-border rounded-input
                               shadow-card overflow-hidden z-10 min-w-[140px]"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onEditClick?.(message);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2
                                 text-body-m text-ink hover:bg-fond text-left"
                    >
                      <Pencil size={14} aria-hidden="true" />
                      <span>Modifier</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onDeleteClick?.(message);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2
                                 text-body-m text-brique hover:bg-brique/10 text-left"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      <span>Supprimer</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
