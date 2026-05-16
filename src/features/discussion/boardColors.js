/**
 * Mappage couleur de tableau -> classes Tailwind, pour teinter
 * les elements d'identite d'un tableau de discussion :
 *   - cta     : bouton "+ Nouvelle carte" dans la vue tableau
 *   - bubble  : bulles "mes messages" dans le chat (etape 7C)
 *   - tileBg  : fond pastille de l'icone dans la liste des tableaux
 *   - tileText: couleur de l'icone dans la liste des tableaux
 *   - dot     : pastille pleine de l'indicateur "non-lu" sur la tile
 *
 * IMPORTANT : les classes sont ecrites en clair pour que Tailwind les
 * inclue dans le bundle au moment de la compilation. Ne pas les construire
 * dynamiquement avec des template strings.
 */

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
}

const FALLBACK_COLOR = 'brique'

/**
 * Retourne les classes Tailwind pour une couleur de tableau donnee.
 * Fallback sur 'brique' si la couleur fournie est invalide ou absente.
 *
 * @param {string} color
 * @returns {{ cta: string, bubble: string, tileBg: string, tileText: string, dot: string }}
 */
export function getBoardColorClasses(color) {
  return BOARD_COLOR_CLASSES[color] || BOARD_COLOR_CLASSES[FALLBACK_COLOR]
}

/**
 * Liste des identifiants de couleur valides pour un tableau.
 * Synchro avec le check constraint SQL sur discussion_boards.color.
 */
export const BOARD_COLOR_IDS = Object.keys(BOARD_COLOR_CLASSES)
