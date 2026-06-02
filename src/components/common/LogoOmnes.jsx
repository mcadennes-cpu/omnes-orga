// src/components/common/LogoOmnes.jsx
//
// Affiche le logo Omnes Medecins teinte dans n'importe quelle couleur
// du DS. Utilise un PNG noir opaque (public/watermark-mask.png) en
// mask CSS, colore via background-color. Une seule image, n couleurs.
//
// Cas d'usage principal : filigrane en arriere-plan dans les headers
// sticky des pages modules, avec une opacite faible (0.08 a 0.15)
// pour rester discret et ne pas perturber la lecture du titre.
//
// Le composant n'a pas de role accessible : aria-hidden="true" et pas
// de texte alternatif (c'est purement decoratif, le contenu textuel
// est assure par le titre du header).

const MASK_URL = '/watermark-mask.png'

// Mapping des couleurs DS vers leurs valeurs hex. Aligne sur
// tailwind.config.js (palette de marque Omnes).
const DS_COLORS = {
  marine: '#1C3D52',
  canard: '#2A8FA8',
  ocre: '#E8A135',
  olive: '#6B7A3A',
  brique: '#D4503A',
  fuchsia: '#D94F7E',
}

/**
 * @param {object} props
 * @param {string} props.color    Cle du DS ('marine', 'canard', ...)
 *                                OU n'importe quelle valeur CSS valide
 *                                ('#FFFFFF', 'currentColor', 'var(...)').
 *                                Defaut : 'marine'.
 * @param {number} props.width    Largeur en pixels. Defaut : 80.
 * @param {number} props.height   Hauteur en pixels. Defaut : 32.
 * @param {number} props.opacity  Opacite globale (0 a 1). Defaut : 1
 *                                (le composant est opaque par defaut ;
 *                                c'est le wrapper HeaderWatermark qui
 *                                applique l'opacite filigrane).
 * @param {string} props.className  Classes Tailwind additionnelles.
 * @param {object} props.style      Styles inline additionnels.
 */
export default function LogoOmnes({
  color = 'marine',
  width = 80,
  height = 32,
  opacity = 1,
  className = '',
  style = {},
}) {
  // Si color est une cle DS connue, on remplace par la valeur hex.
  // Sinon on passe la valeur telle quelle (permet currentColor,
  // var(--c-xxx), ou n'importe quelle couleur CSS valide).
  const resolvedColor = DS_COLORS[color] || color

  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        display: 'inline-block',
        width,
        height,
        opacity,
        backgroundColor: resolvedColor,
        WebkitMaskImage: `url(${MASK_URL})`,
        maskImage: `url(${MASK_URL})`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        ...style,
      }}
    />
  )
}
