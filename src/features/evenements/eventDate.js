// ----------------------------------------------------------------------------
// Helpers de date du module Evenements.
// Les colonnes date_debut / date_fin sont de type `date` Postgres : elles
// arrivent cote JS en chaine 'YYYY-MM-DD'.
// ----------------------------------------------------------------------------

/**
 * Parse une chaine 'YYYY-MM-DD' en Date locale (minuit, fuseau local).
 * On evite new Date('YYYY-MM-DD'), qui interprete la chaine en UTC et peut
 * decaler le jour selon le fuseau.
 */
export function parseDateOnly(str) {
  if (!str || typeof str !== 'string') return null
  const [y, m, d] = str.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

/** Mois abrege en francais, en majuscules : 'JUIN', 'JANV.', 'DEC.'... */
function moisCourt(date) {
  return new Intl.DateTimeFormat('fr-FR', { month: 'short' })
    .format(date)
    .toUpperCase()
}

/**
 * Donnees d'affichage du bloc-date d'une carte evenement.
 * - Mono-jour : { primary: '12', secondary: 'JUIN', multiDay: false }
 * - Multi-jours meme mois : { primary: '12-14', secondary: 'JUIN', multiDay: true }
 * - Multi-jours a cheval sur deux mois : on retombe sur le jour de debut.
 */
export function formatDateBlock(dateDebut, dateFin) {
  const debut = parseDateOnly(dateDebut)
  if (!debut) return { primary: '?', secondary: '', multiDay: false }

  const fin = parseDateOnly(dateFin)
  const multiDay =
    Boolean(fin) &&
    fin.getTime() !== debut.getTime() &&
    fin.getMonth() === debut.getMonth() &&
    fin.getFullYear() === debut.getFullYear()

  if (multiDay) {
    return {
      primary: `${debut.getDate()}–${fin.getDate()}`,
      secondary: moisCourt(debut),
      multiDay: true,
    }
  }

  return {
    primary: String(debut.getDate()),
    secondary: moisCourt(debut),
    multiDay: false,
  }
}

/**
 * Un evenement est "passe" quand son dernier jour (date_fin si presente,
 * sinon date_debut) est strictement anterieur a aujourd'hui.
 */
export function isPastEvent(dateDebut, dateFin) {
  const last = parseDateOnly(dateFin) || parseDateOnly(dateDebut)
  if (!last) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return last.getTime() < today.getTime()
}
