// src/features/immobilier/EmptyBoard.jsx
// Etat vide de la liste de cartes d'un tableau.
// Icone dans tile coloree + titre + sous-titre + CTA (si autorise).

import { Plus, MessageSquarePlus } from 'lucide-react';
import { getBoardColorClasses } from './immobilierColors';

export default function EmptyBoard({ boardColor, canCreateCard, onCreateCard }) {
  const accent = getBoardColorClasses(boardColor);

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div
        className={`w-14 h-14 rounded-tile ${accent.tileBg}
                    flex items-center justify-center mb-4`}
      >
        <MessageSquarePlus
          className={`w-7 h-7 ${accent.tileText}`}
          strokeWidth={1.8}
        />
      </div>
      <h2 className="font-display font-extrabold text-marine text-lg mb-2">
        Aucune carte ici
      </h2>
      <p className="text-muted text-sm max-w-xs mb-5">
        Creez une carte par sujet ou par question a trancher. Chaque carte ouvre un fil de discussion.
      </p>
      {canCreateCard && (
        <button
          type="button"
          onClick={onCreateCard}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full
                      ${accent.cta} font-semibold text-sm
                      active:opacity-80 transition-opacity`}
        >
          <Plus className="w-4 h-4" strokeWidth={2.2} />
          Creer la premiere carte
        </button>
      )}
    </div>
  );
}
