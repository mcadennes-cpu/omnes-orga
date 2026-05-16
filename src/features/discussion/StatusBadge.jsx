/**
 * Pastille de statut d'une carte de discussion : "Ouvert" (canard) ou
 * "Clos" (gris). Couleurs fixes, independantes de la couleur du tableau.
 *
 * @param {Object} props
 * @param {'open'|'closed'} props.status
 * @param {'sm'|'md'} [props.size='sm']
 */
export default function StatusBadge({ status, size = 'sm' }) {
  const isOpen = status === 'open'
  const textSize = size === 'md' ? 'text-xs' : 'text-[10px]'
  return (
    <span
      className={`inline-flex items-center gap-1 ${textSize} font-bold uppercase tracking-wide ${
        isOpen ? 'text-canard' : 'text-muted'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${isOpen ? 'bg-canard' : 'bg-muted'}`}
        aria-hidden="true"
      />
      {isOpen ? 'Ouvert' : 'Clos'}
    </span>
  )
}
