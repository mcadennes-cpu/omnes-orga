import { getAvatarPalette } from '../../lib/avatarColor'
import { initials } from '../../lib/profileFormat'

/**
 * Pile d'avatars chevauches pour representer les membres d'un tableau,
 * d'une carte, etc. Affiche au maximum `max` avatars + une pastille "+N"
 * si la liste est plus longue. Cliquable optionnellement.
 *
 * Pas de tooltip / titre par survol : usage mobile-first, le tap eventuel
 * ouvre une vue dediee aux membres (releve par le parent).
 *
 * @param {Object} props
 * @param {Array<{ id: string, prenom?: string, nom?: string }>} props.profiles
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

  const sizeClasses =
    size === 'sm'
      ? 'w-6 h-6 text-[10px]'
      : 'w-7 h-7 text-[11px]'

  const Wrapper = onClick ? 'button' : 'div'
  const wrapperProps = onClick
    ? { type: 'button', onClick, 'aria-label': ariaLabel || 'Voir les membres' }
    : {}

  return (
    <Wrapper
      {...wrapperProps}
      className={`inline-flex items-center ${onClick ? 'active:opacity-80 transition-opacity' : ''}`}
    >
      {visible.map((p, idx) => {
        const palette = getAvatarPalette(p.id)
        return (
          <span
            key={p.id}
            className={`${sizeClasses} rounded-full ${palette.bg} ${palette.text} border-2 border-white flex items-center justify-center font-semibold ${idx > 0 ? '-ml-2' : ''}`}
            aria-hidden={onClick ? 'true' : undefined}
          >
            {initials(p)}
          </span>
        )
      })}
      {overflow > 0 && (
        <span
          className={`${sizeClasses} rounded-full bg-fond text-muted border-2 border-white flex items-center justify-center font-semibold -ml-2`}
          aria-hidden={onClick ? 'true' : undefined}
        >
          +{overflow}
        </span>
      )}
    </Wrapper>
  )
}
