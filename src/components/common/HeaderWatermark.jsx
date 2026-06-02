// src/components/common/HeaderWatermark.jsx
//
// Affiche le LogoOmnes en filigrane dans un header sticky : positionne
// en absolute a droite, centre verticalement, opacite faible, taille
// adaptee. C'est l'utilisation principale du logo dans l'app.
//
// Usage :
//   <header className="sticky top-0 relative ...">
//     <button>Retour</button>
//     <h1>Cabinet pratique</h1>
//     <HeaderWatermark color="marine" />
//   </header>
//
// Important : le HEADER PARENT doit avoir 'relative' (ou 'absolute' /
// 'fixed') pour que ce composant se positionne par rapport a lui. Sinon
// il se positionnera par rapport a l'element positionne le plus proche
// (potentiellement le viewport entier).

import LogoOmnes from './LogoOmnes'

// Tailles preconfigurees pour les filigranes de header.
// Le PNG masque ayant un ratio width:height de 2.5 environ (430x172),
// on conserve ce ratio pour eviter toute deformation.
const SIZES = {
  sm: { width: 110, height: 44 },
  md: { width: 150, height: 60 },
  lg: { width: 200, height: 80 },
}

/**
 * @param {object} props
 * @param {string} props.color    Cle DS ('marine', 'canard', ...) ou
 *                                couleur CSS libre. Defaut : 'marine'.
 * @param {string} props.size     'sm' | 'md' | 'lg'. Defaut : 'md'.
 * @param {number} props.opacity  0 a 1. Defaut : 0.10 (filigrane subtil).
 * @param {number} props.offsetRight  Decalage en pixels depuis le bord
 *                                    droit. Defaut : -10 (legerement
 *                                    coupe pour effet "deborde").
 * @param {string} props.className   Classes additionnelles si besoin.
 */
export default function HeaderWatermark({
  color = 'marine',
  size = 'md',
  opacity = 0.18,
  offsetRight = -10,
  verticalAlign = 'center',
  className = '',
}) {
  const dimensions = SIZES[size] || SIZES.md

  return (
    <LogoOmnes
      color={color}
      width={dimensions.width}
      height={dimensions.height}
      opacity={opacity}
      className={`pointer-events-none select-none ${className}`}
      style={
        verticalAlign === 'top'
          ? {
              position: 'absolute',
              right: offsetRight,
              top: 8,
            }
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
