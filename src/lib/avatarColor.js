// Palette d avatars pour le Trombinoscope et autres listes de personnes.
// Chaque entree contient la classe Tailwind de fond et la classe Tailwind de texte
// (texte blanc partout sauf sur ocre, trop clair pour offrir un bon contraste).
//
// IMPORTANT : les classes sont ecrites en clair pour que Tailwind les inclue
// dans le bundle au moment de la compilation. Ne pas les construire dynamiquement
// avec des template strings, sinon Tailwind ne les detectera pas.
const AVATAR_PALETTE = [
  { bg: 'bg-canard', text: 'text-white' },
  { bg: 'bg-marine', text: 'text-white' },
  { bg: 'bg-olive', text: 'text-white' },
  { bg: 'bg-brique', text: 'text-white' },
  { bg: 'bg-fuchsia', text: 'text-white' },
  { bg: 'bg-ocre', text: 'text-marine' },
]

// Retourne une paire de classes Tailwind { bg, text } a partir d un identifiant.
// La couleur est deterministe : un meme id retourne toujours la meme paire,
// ce qui garantit qu un medecin garde la meme couleur partout dans l app.
export function getAvatarPalette(id) {
  if (!id) return AVATAR_PALETTE[0]
  const str = String(id)
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}
