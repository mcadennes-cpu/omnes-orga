// Helpers partages pour les categories multiples de l'annuaire.
//
// Depuis le script SQL 5A-3, une entree porte un tableau "categories" (text[]),
// NOT NULL DEFAULT '{}'. L'ancienne colonne "categorie" (singulier) a ete
// supprimee (script 5A-4).

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

// Categories d'une entree, toujours sous forme de tableau (jamais null).
export function entreeCategories(entree) {
  return Array.isArray(entree?.categories) ? entree.categories : []
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
