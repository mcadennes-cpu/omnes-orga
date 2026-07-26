// Helpers partages pour les categories multiples de l'annuaire.
//
// Depuis le script SQL 5A-3, une entree porte un tableau "categories" (text[]).
// L'ancienne colonne "categorie" (singulier) existe encore le temps de la
// transition : les fonctions ci-dessous font le repli dessus pour que tout
// continue de marcher tant qu'elle n'est pas supprimee (script 5A-4).

// Nettoie une liste de categories : trim, retire les vides, dedoublonne
// (insensible a la casse, en gardant la premiere orthographe rencontree).
export function cleanCategories(list) {
  const out = []
  const seen = new Set()
  for (const raw of list ?? []) {
    const c = (raw ?? '').trim()
    if (!c) continue
    const key = c.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out
}

// Categories d'une entree, sous forme de tableau, avec repli sur l'ancienne
// colonne "categorie" tant qu'elle existe.
export function entreeCategories(entree) {
  if (Array.isArray(entree?.categories) && entree.categories.length > 0) {
    return entree.categories
  }
  if (entree?.categorie) return [entree.categorie]
  return []
}

// Liste triee et dedoublonnee de toutes les categories presentes dans
// l'annuaire (pour les pastilles de filtre et l'auto-complete).
export function collectCategories(entrees) {
  const all = []
  for (const e of entrees ?? []) {
    for (const c of entreeCategories(e)) all.push(c)
  }
  return cleanCategories(all).sort((a, b) => a.localeCompare(b, 'fr'))
}
