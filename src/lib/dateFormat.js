/**
 * Helpers de formatage de dates pour l'affichage.
 * Centralises ici pour un rendu coherent entre modules (liste de
 * tableaux, liste de cartes, etc.).
 */

/**
 * Formate une date en libelle relatif court, facon messagerie :
 *   - aujourd'hui        -> heure ("14:22")
 *   - hier               -> "hier"
 *   - moins de 7 jours   -> jour de la semaine court ("lun.", "mar.")
 *   - au-dela            -> date courte ("24 avr."), avec l'annee si differente
 *
 * @param {string|Date} input - date ISO ou objet Date
 * @returns {string} libelle, ou '' si l'entree est invalide
 */
export function formatRelativeDate(input) {
  if (!input) return ''
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) return ''

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayDiff = Math.round((startOfToday - startOfDate) / 86400000)

  if (dayDiff <= 0) {
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }
  if (dayDiff === 1) return 'hier'
  if (dayDiff < 7) {
    return date.toLocaleDateString('fr-FR', { weekday: 'short' })
  }

  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}
