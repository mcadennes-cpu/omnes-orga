// src/features/immobilier/immobilierColors.js
// Mappage couleur de tableau -> classes Tailwind, pour teinter
// les elements d'identite d'un tableau Immobilier :
//   - cta     : bouton "+ Nouvelle carte" dans la vue tableau
//   - bubble  : bulles "mes messages" dans le chat
//   - tileBg  : fond pastille de l'icone dans la liste des tableaux
//   - tileText: couleur de l'icone dans la liste des tableaux
//   - dot     : pastille pleine de l'indicateur "non-lu" sur la tile
//
// Pattern aligne sur Discussion (boardColors.js). API identique pour faciliter
// les portages futurs et la maintenance.
//
// IMPORTANT : les classes sont ecrites en clair pour que Tailwind les
// inclue dans le bundle. Ne pas les construire dynamiquement.

const BOARD_COLOR_CLASSES = {
  brique: {
    cta: 'bg-brique text-white',
    bubble: 'bg-brique text-white',
    tileBg: 'bg-brique/15',
    tileText: 'text-brique',
    dot: 'bg-brique',
  },
  canard: {
    cta: 'bg-canard text-white',
    bubble: 'bg-canard text-white',
    tileBg: 'bg-canard/15',
    tileText: 'text-canard',
    dot: 'bg-canard',
  },
  marine: {
    cta: 'bg-marine text-white',
    bubble: 'bg-marine text-white',
    tileBg: 'bg-marine/15',
    tileText: 'text-marine',
    dot: 'bg-marine',
  },
  olive: {
    cta: 'bg-olive text-white',
    bubble: 'bg-olive text-white',
    tileBg: 'bg-olive/15',
    tileText: 'text-olive',
    dot: 'bg-olive',
  },
  fuchsia: {
    cta: 'bg-fuchsia text-white',
    bubble: 'bg-fuchsia text-white',
    tileBg: 'bg-fuchsia/15',
    tileText: 'text-fuchsia',
    dot: 'bg-fuchsia',
  },
  ocre: {
    cta: 'bg-ocre text-marine',
    bubble: 'bg-ocre text-marine',
    tileBg: 'bg-ocre/20',
    tileText: 'text-ocre',
    dot: 'bg-ocre',
  },
};

const FALLBACK_COLOR = 'canard';

export function getBoardColorClasses(color) {
  return BOARD_COLOR_CLASSES[color] || BOARD_COLOR_CLASSES[FALLBACK_COLOR];
}

// Accent du module Immobilier (utilise dans la tuile Home, la liste des
// tableaux, etc.). Difference vs Discussion : Immobilier = canard, pas brique.
export const IMMOBILIER_ACCENT = 'canard';

// Liste des identifiants de couleur valides pour un tableau.
// Synchro avec le CHECK constraint SQL sur immobilier_boards.couleur.
export const IMMOBILIER_BOARD_COLORS = Object.keys(BOARD_COLOR_CLASSES);
