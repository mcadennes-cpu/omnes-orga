// Affiche un texte libre en rendant cliquables les adresses web qu'il contient
// (https://…, http://…, www.…). Le reste du texte est rendu tel quel : le
// composant ne produit que des fragments, à placer dans le <p> existant
// (qui garde sa typo et son whitespace-pre-wrap).
//
// Sécurité : les liens sont des éléments React, jamais du HTML injecté, et
// seuls http(s) sont reconnus (pas de javascript:, mailto:, etc.).
//
// `inverse` : pour un texte posé sur un fond coloré (bulle « mes messages ») —
// le lien garde alors la couleur du texte, seul le soulignement le signale.

const URL_REGEX = /(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+)/gi

// Ponctuation collée à la fin d'une URL dans une phrase (« voir https://x.fr. »)
const PONCTUATION_FINALE = /[.,;:!?)\]}'»]+$/

export default function TexteAvecLiens({ texte, inverse = false }) {
  if (!texte) return null

  const morceaux = []
  let dernier = 0

  for (const match of texte.matchAll(URL_REGEX)) {
    let url = match[0]
    const finale = url.match(PONCTUATION_FINALE)
    // On ne retire une parenthèse fermante que si l'URL n'en ouvre pas
    // (ex. liens Wikipédia « .../Truc_(medecine) »).
    if (finale) {
      let aRetirer = finale[0]
      if (aRetirer.startsWith(')') && url.includes('(')) aRetirer = ''
      if (aRetirer) url = url.slice(0, -aRetirer.length)
    }

    const debut = match.index
    if (debut > dernier) morceaux.push(texte.slice(dernier, debut))

    const href = url.toLowerCase().startsWith('www.') ? `https://${url}` : url
    morceaux.push(
      <a
        key={debut}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={`underline underline-offset-2 break-all ${
          inverse ? '' : 'text-canard'
        }`}
      >
        {url}
      </a>
    )
    dernier = debut + url.length
  }

  if (dernier < texte.length) morceaux.push(texte.slice(dernier))
  return <>{morceaux}</>
}
