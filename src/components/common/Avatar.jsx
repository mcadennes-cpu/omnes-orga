import { useState, useRef, useLayoutEffect } from 'react'
import { getAvatarPalette } from '../../lib/avatarColor'
import { getAvatarPublicUrl } from '../../lib/avatarStorage'

function getInitials(prenom, nom) {
  const p = (prenom || '').trim()
  const n = (nom || '').trim()
  if (!p && !n) return '?'
  return `${p.charAt(0)}${n.charAt(0)}`.toUpperCase()
}

/**
 * Avatar rond pour un profil medecin. Affiche la photo de profil si
 * `profile.photo_url` est defini (URL PUBLIQUE Supabase, construite de facon
 * synchrone : aucun aller-retour reseau, aucun token), sinon des initiales sur
 * fond colore (palette deterministe sur le nom).
 *
 * Cache : l'URL publique est stable, donc le navigateur la garde en cache.
 * Au retour sur l'onglet, l'image est deja la, sans pastille ni rechargement.
 * Cache-busting : on ajoute `?v=updated_at` pour que le navigateur recharge
 * uniquement quand la photo (ou le profil) change. Necessite que les requetes
 * qui alimentent <Avatar> selectionnent `updated_at` (sinon la nouvelle photo
 * peut tarder a apparaitre, dans la limite du max-age).
 *
 * Premier chargement (image pas encore en cache) : la pastille reste affichee
 * tant que l'image n'est pas ENTIEREMENT chargee (gate `onLoad`) -> plus de
 * demi-rendu "haut photo, bas pastille". Image deja en cache : `useLayoutEffect`
 * detecte `img.complete` avant le paint et l'affiche d'un coup, sans flash ni
 * fondu. `onError` -> retour aux initiales (fail-safe silencieux).
 *
 * @param {object} props
 * @param {{ prenom?: string, nom?: string, photo_url?: string, updated_at?: string }} [props.profile]
 * @param {number} props.size
 * @param {string} [props.className]
 * @param {string} [props.alt]
 */
export default function Avatar({ profile, size, className = '', alt = '' }) {
  const photoPath = profile?.photo_url || ''
  const base = photoPath ? getAvatarPublicUrl(photoPath) : null
  const photoUrl =
    base && profile?.updated_at
      ? `${base}?v=${encodeURIComponent(profile.updated_at)}`
      : base

  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const imgRef = useRef(null)

  // Image deja en cache navigateur : on la revele immediatement (avant paint),
  // sans flash de pastille. Sinon, on attend onLoad.
  useLayoutEffect(() => {
    setFailed(false)
    const img = imgRef.current
    setLoaded(!!(img && img.complete && img.naturalWidth > 0))
  }, [photoUrl])

  const prenom = profile?.prenom || ''
  const nom = profile?.nom || ''
  const initials = getInitials(prenom, nom)
  const palette = getAvatarPalette(`${prenom} ${nom}`.trim())
  const fontSize = Math.round(size * 0.37)
  const showImage = !!photoUrl && !failed

  return (
    <div
      className={`relative rounded-full overflow-hidden ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Pastille initiales : derriere la photo, visible tant que celle-ci
          n'est pas entierement chargee. */}
      <div
        className={`absolute inset-0 flex items-center justify-center font-display font-extrabold ${palette.bg} ${palette.text}`}
        style={{ fontSize: `${fontSize}px` }}
      >
        {initials}
      </div>
      {showImage && (
        <img
          ref={imgRef}
          src={photoUrl}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: loaded ? 1 : 0 }}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
}
