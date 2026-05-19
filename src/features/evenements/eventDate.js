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

/** Met la premiere lettre en majuscule. */
function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s
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
 * Date complete d'un evenement, pour l'ecran detail.
 * - Mono-jour : 'Jeudi 12 juin 2026'
 * - Multi-jours meme mois : '12 - 14 juin 2026'
 * - Multi-jours meme annee : '30 mai - 2 juin 2026'
 * - Multi-jours annees differentes : '30 decembre 2025 - 2 janvier 2026'
 */
export function formatDateLong(dateDebut, dateFin) {
  const debut = parseDateOnly(dateDebut)
  if (!debut) return ''
  const fin = parseDateOnly(dateFin)

  // Mono-jour
  if (!fin || fin.getTime() === debut.getTime()) {
    return capitalize(
      new Intl.DateTimeFormat('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(debut),
    )
  }

  // Multi-jours
  const memeAnnee = debut.getFullYear() === fin.getFullYear()
  const memeMois = memeAnnee && debut.getMonth() === fin.getMonth()
  const finLong = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(fin)

  if (memeMois) {
    return `${debut.getDate()} – ${finLong}`
  }
  if (memeAnnee) {
    const debutJourMois = new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long',
    }).format(debut)
    return `${debutJourMois} – ${finLong}`
  }
  const debutComplet = new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(debut)
  return `${debutComplet} – ${finLong}`
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
