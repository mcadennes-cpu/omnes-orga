// Composant pill reutilisable pour badges, statuts, categories.
// Variants : 'soft' (couleur 10-15% + texte couleur), 'solid' (couleur pleine + texte blanc/marine).
// Tailles : 'sm' (par defaut, 11px) et 'md' (13px).
//
// IMPORTANT : les classes Tailwind sont ecrites en clair pour que Tailwind
// les inclue dans le bundle. Ne pas les construire dynamiquement.

const SOFT_VARIANTS = {
  marine: 'bg-marine/10 text-marine',
  canard: 'bg-canard/15 text-canard',
  ocre: 'bg-ocre/15 text-ocre',
  olive: 'bg-olive/15 text-olive',
  brique: 'bg-brique/10 text-brique',
  fuchsia: 'bg-fuchsia/15 text-fuchsia',
}

const SOLID_VARIANTS = {
  marine: 'bg-marine text-white',
  canard: 'bg-canard text-white',
  ocre: 'bg-ocre text-marine',
  olive: 'bg-olive text-white',
  brique: 'bg-brique text-white',
  fuchsia: 'bg-fuchsia text-white',
}

const SIZES = {
  sm: 'text-[11px] px-2 py-0.5',
  md: 'text-[13px] px-2.5 py-1',
}

export default function Pill({
  color = 'marine',
  variant = 'soft',
  size = 'sm',
  uppercase = true,
  children,
}) {
  const variantClass =
    variant === 'solid' ? SOLID_VARIANTS[color] : SOFT_VARIANTS[color]
  const sizeClass = SIZES[size]
  const upperClass = uppercase ? 'uppercase tracking-[0.12em]' : ''

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold ${variantClass} ${sizeClass} ${upperClass}`}
    >
      {children}
    </span>
  )
}
