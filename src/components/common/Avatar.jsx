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
 * La pastille d'initiales reste affichee tant que la photo n'est pas
 * ENTIEREMENT chargee (gate sur `onLoad`) : plus de demi-rendu "haut photo,
 * bas pastille" quand le telechargement stagne. L'image charge en fond
 * (opacity 0) puis vient se poser d'un coup une fois prete. Si l'URL signee
 * echoue ou si l'image elle-meme ne charge pas (`onError`), on reste sur les
 * initiales (fail-safe silencieux).
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
  const [imgLoaded, setImgLoaded] = useState(false)

  useEffect(() => {
    setSignedUrl(null)
    setImgFailed(false)
    setImgLoaded(false)
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
      {/* Pastille initiales : toujours rendue, reste visible tant que la
          photo n'est pas entierement chargee (imgLoaded). */}
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
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-200"
          style={{ opacity: imgLoaded ? 1 : 0 }}
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgFailed(true)}
        />
      )}
    </div>
  )
}
