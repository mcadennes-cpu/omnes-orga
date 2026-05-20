// src/features/immobilier/immobilierColors.js
// Couleurs du module Immobilier :
// - Accent module = canard (utilise dans la tuile Home, l'etat actif des
//   filtres, le titre de la page liste, etc.)
// - 6 swatches DS pour le choix de couleur d'un tableau (memes valeurs
//   que Discussion : brique, canard, ocre, olive, fuchsia, marine)
// - Fallback canard si la couleur d'un tableau est manquante

export const IMMOBILIER_ACCENT = 'canard';

export const IMMOBILIER_BOARD_COLORS = [
  'brique',
  'canard',
  'ocre',
  'olive',
  'fuchsia',
  'marine',
];

// Map couleur logique -> classes Tailwind correspondantes au DS.
// Sert aux tiles de tableau, au CTA "+ Nouvelle carte", aux bulles
// de mes messages dans le chat. Calque sur Discussion.
export const BOARD_COLOR_CLASSES = {
  brique:  { bg: 'bg-brique',  text: 'text-brique',  ring: 'ring-brique'  },
  canard:  { bg: 'bg-canard',  text: 'text-canard',  ring: 'ring-canard'  },
  ocre:    { bg: 'bg-ocre',    text: 'text-ocre',    ring: 'ring-ocre'    },
  olive:   { bg: 'bg-olive',   text: 'text-olive',   ring: 'ring-olive'   },
  fuchsia: { bg: 'bg-fuchsia', text: 'text-fuchsia', ring: 'ring-fuchsia' },
  marine:  { bg: 'bg-marine',  text: 'text-marine',  ring: 'ring-marine'  },
};

// Helper : retourne les classes pour une couleur donnee, avec fallback.
export function getBoardColorClasses(couleur) {
  return BOARD_COLOR_CLASSES[couleur] || BOARD_COLOR_CLASSES[IMMOBILIER_ACCENT];
}
