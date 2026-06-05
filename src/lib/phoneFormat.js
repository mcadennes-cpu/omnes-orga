/**
 * Formatage des numeros de telephone (format francais).
 *
 * Regroupe les chiffres par paires : "0668180840" -> "06 68 18 08 40".
 * Permet a l'utilisateur mobile de saisir au pave numerique (sans touche
 * espace) tout en obtenant un numero espace et lisible. Conserve un
 * eventuel "+" en tete pour les numeros internationaux ; le regroupement
 * par paires est optimise pour le format local 0X XX XX XX XX.
 *
 * @param {string} raw - valeur brute du champ
 * @returns {string} numero formate
 */
export function formatPhoneFr(raw) {
  if (!raw) return ''
  const hasPlus = raw.trimStart().startsWith('+')
  const digits = raw.replace(/\D/g, '')
  const grouped = digits.replace(/(\d{2})(?=\d)/g, '$1 ')
  return (hasPlus ? '+' : '') + grouped
}
