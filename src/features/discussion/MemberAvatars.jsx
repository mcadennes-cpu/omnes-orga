import Avatar from '../../components/common/Avatar'

/**
 * Pile d'avatars chevauches pour representer les membres d'un tableau,
 * d'une carte, etc. Affiche au maximum `max` avatars + une pastille "+N"
 * si la liste est plus longue. Cliquable optionnellement.
 *
 * Pas de tooltip / titre par survol : usage mobile-first, le tap eventuel
 * ouvre une vue dediee aux membres (releve par le parent).
 *
 * @param {Object} props
 * @param {Array<{ id: string, prenom?: string, nom?: string, photo_url?: string }>} props.profiles
 * @param {number} [props.max=4]   nombre max d'avatars avant la pastille "+N"
 * @param {'sm'|'md'} [props.size='md']
 * @param {() => void} [props.onClick] si fourni, rend la pile tappable
 * @param {string} [props.ariaLabel]
 */
export default function MemberAvatars({
  profiles = [],
  max = 4,
  size = 'md',
  onClick,
  ariaLabel,
}) {
  if (!profiles?.length) return null

  const visible = profiles.slice(0, max)
  const overflow = profiles.length - visible.length
  const avatarSize = size === 'sm' ? 24 : 28
  // Si le wrapper est un bouton avec aria-label, les avatars internes sont
  // decoratifs : on n'expose pas un texte alternatif redondant.
  const showAlt = !onClick

  const Wrapper = onClick ? 'button' : 'div'
  const wrapperProps = onClick
    ? { type: 'button', onClick, 'aria-label': ariaLabel || 'Voir les membres' }
    : {}

  return (
    <Wrapper
      {...wrapperProps}
      className={`inline-flex items-center ${onClick ? 'active:opacity-80 transition-opacity' : ''}`}
    >
      {visible.map((p, idx) => (
        <Avatar
          key={p.id}
          profile={p}
          size={avatarSize}
          alt={showAlt ? `${p.prenom || ''} ${p.nom || ''}`.trim() : ''}
          className={`border-2 border-white ${idx > 0 ? '-ml-2' : ''}`}
        />
      ))}
      {overflow > 0 && (
        <span
          className={`rounded-full bg-fond text-muted border-2 border-white flex items-center justify-center font-semibold -ml-2 ${
            size === 'sm' ? 'w-6 h-6 text-[10px]' : 'w-7 h-7 text-[11px]'
          }`}
          aria-hidden={onClick ? 'true' : undefined}
        >
          +{overflow}
        </span>
      )}
    </Wrapper>
  )
}
