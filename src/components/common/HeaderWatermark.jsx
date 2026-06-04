// src/components/common/HeaderWatermark.jsx
//
// Affiche le LogoOmnes en filigrane dans un header sticky.
//
// Deux modes :
//  - normal (defaut) : taille fixe (sm/md/lg), centre vertical ou top.
//  - fill : le filigrane epouse TOUTE la hauteur du header (top+bottom
//    a 0), largeur derivee du ratio du masque via aspect-ratio. Sert
//    aux headers de hauteur variable (avec barre de recherche, etc.).
//
// Le HEADER PARENT doit avoir 'relative' (ou absolute/fixed) pour que
// ce composant se positionne par rapport a lui.

import LogoOmnes from './LogoOmnes'

const SIZES = {
  sm: { width: 110, height: 44 },
  md: { width: 150, height: 60 },
  lg: { width: 200, height: 80 },
}

// Ratio du PNG masque (430x172 ~ 2.5). Sert au mode fill pour deriver
// la largeur a partir de la hauteur du header.
const MASK_RATIO = '430 / 172'

/**
 * @param {string}  color         Cle DS ou couleur CSS libre. Defaut 'marine'.
 * @param {string}  size          'sm' | 'md' | 'lg' (mode normal). Defaut 'md'.
 * @param {number}  opacity       0 a 1. Defaut 0.18.
 * @param {number}  offsetRight   Decalage en px depuis le bord droit. Defaut -10.
 * @param {string}  verticalAlign 'center' | 'top' (mode normal). Defaut 'center'.
 * @param {boolean} fill          Si true, le logo remplit la hauteur du header.
 * @param {string}  className     Classes additionnelles.
 */
export default function HeaderWatermark({
  color = 'marine',
  size = 'md',
  opacity = 0.18,
  offsetRight = -10,
  verticalAlign = 'center',
  fill = false,
  className = '',
}) {
  const dimensions = SIZES[size] || SIZES.md

  // Mode fill : epouse toute la hauteur du header, largeur via le ratio
  // du masque. offsetRight decale vers le centre pour degager le "+".
  if (fill) {
    return (
      <LogoOmnes
        color={color}
        opacity={opacity}
        className={`pointer-events-none select-none ${className}`}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: offsetRight,
          width: 'auto',
          height: 'auto',
          aspectRatio: MASK_RATIO,
        }}
      />
    )
  }

  return (
    <LogoOmnes
      color={color}
      width={dimensions.width}
      height={dimensions.height}
      opacity={opacity}
      className={`pointer-events-none select-none ${className}`}
      style={
        verticalAlign === 'top'
          ? { position: 'absolute', right: offsetRight, top: 8 }
          : {
              position: 'absolute',
              right: offsetRight,
              top: '50%',
              transform: 'translateY(-50%)',
            }
      }
    />
  )
}
