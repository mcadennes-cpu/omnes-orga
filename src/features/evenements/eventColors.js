// Couleur d'identite d'un evenement -> classes Tailwind.
// Map statique obligatoire : Tailwind ne genere pas les classes construites
// dynamiquement. Meme principe que features/discussion/boardColors.js.

export const EVENT_COLORS = ['brique', 'ocre', 'olive', 'canard', 'fuchsia', 'marine']

const CLASSES = {
  brique: {
    soft: 'bg-brique/12', softText: 'text-brique',
    solid: 'bg-brique', solidText: 'text-white', ring: 'ring-brique',
  },
  ocre: {
    soft: 'bg-ocre/12', softText: 'text-ocre',
    solid: 'bg-ocre', solidText: 'text-white', ring: 'ring-ocre',
  },
  olive: {
    soft: 'bg-olive/12', softText: 'text-olive',
    solid: 'bg-olive', solidText: 'text-white', ring: 'ring-olive',
  },
  canard: {
    soft: 'bg-canard/12', softText: 'text-canard',
    solid: 'bg-canard', solidText: 'text-white', ring: 'ring-canard',
  },
  fuchsia: {
    soft: 'bg-fuchsia/12', softText: 'text-fuchsia',
    solid: 'bg-fuchsia', solidText: 'text-white', ring: 'ring-fuchsia',
  },
  marine: {
    soft: 'bg-marine/12', softText: 'text-marine',
    solid: 'bg-marine', solidText: 'text-white', ring: 'ring-marine',
  },
}

/**
 * Renvoie les classes d'une couleur d'evenement :
 * - soft / softText : fond a 12% + texte plein (bloc-date, pill Sondage)
 * - solid / solidText : fond plein + texte blanc (bouton actif sondage)
 * - ring : anneau de selection (ColorPicker, lot 8D)
 * Retombe sur 'marine' si la couleur est inconnue.
 */
export function getEventColorClasses(couleur) {
  return CLASSES[couleur] ?? CLASSES.marine
}
