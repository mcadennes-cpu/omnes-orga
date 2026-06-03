import { useState, useEffect } from 'react'
import { getAvatarPalette } from '../../lib/avatarColor'
import { getAvatarUrl } from '../../lib/avatarCache'

function getInitials(prenom, nom) {
  const p = (prenom || '').trim()
  const n = (nom || '').trim()
  if (!p && !n) return '?'
  return `${p.charAt(0)}${n.charAt(0)}`.toUpperCase()
}

/**
 * Avatar rond pour un profil medecin. Affiche la photo de profil si
 * `profile.photo_url` est defini (URL signee recuperee via cache memoire),
 * sinon des initiales sur fond colore (palette deterministe sur le nom).
 *
 * Pendant le chargement de l'URL signee on affiche les initiales : pas de
 * spinner, pas de carre blanc. L'image vient se poser par-dessus quand
 * elle est prete. Si l'URL signee echoue ou si l'image elle-meme ne charge
 * pas, on reste sur les initiales (fail-safe silencieux).
 *
 * @param {object} props
 * @param {{ prenom?: string, nom?: string, photo_url?: string }} [props.profile]
 * @param {number} props.size
 * @param {string} [props.className]
 * @param {string} [props.alt] - texte alternatif pour l'image. Par defaut vide
 *   (avatar decoratif, accompagne d'un nom ailleurs dans le DOM). A fournir
 *   explicitement dans les listes d'avatars sans nom visible a cote (ex:
 *   MemberAvatars).
 */
export default function Avatar({ profile, size, className = '', alt = '' }) {
  const photoPath = profile?.photo_url || ''
  const [signedUrl, setSignedUrl] = useState(null)
  const [imgFailed, setImgFailed] = useState(false)

  useEffect(() => {
    setSignedUrl(null)
    setImgFailed(false)
    if (!photoPath) return

    let cancelled = false
    getAvatarUrl(photoPath)
      .then((url) => {
        if (!cancelled) setSignedUrl(url)
      })
      .catch((err) => {
        if (!cancelled) console.error('Avatar: getAvatarUrl a echoue', err)
      })

    return () => {
      cancelled = true
    }
  }, [photoPath])

  const prenom = profile?.prenom || ''
  const nom = profile?.nom || ''
  const initials = getInitials(prenom, nom)
  const palette = getAvatarPalette(`${prenom} ${nom}`.trim())
  const fontSize = Math.round(size * 0.37)
  const showImage = !!signedUrl && !imgFailed

  return (
    <div
      className={`relative rounded-full overflow-hidden ${className}`}
      style={{ width: size, height: size }}
    >
      <div
        className={`absolute inset-0 flex items-center justify-center font-display font-extrabold ${palette.bg} ${palette.text}`}
        style={{ fontSize: `${fontSize}px` }}
      >
        {initials}
      </div>
      {showImage && (
        <img
          src={signedUrl}
          alt={alt}
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setImgFailed(true)}
        />
      )}
    </div>
  )
}
