const DEFAULT_SIZE = 512
const DEFAULT_QUALITY = 0.85
const DEFAULT_MAX_BYTES = 500_000
const MIN_QUALITY = 0.55
const QUALITY_STEP = 0.10

/**
 * Convertit une image source en JPEG carre compresse, pret pour l'upload
 * dans le bucket `avatars`.
 *
 * Pipeline :
 *   1. Decodage de la source via Image.decode() (plus fiable et plus
 *      moderne que image.onload). Si le navigateur ne sait pas decoder
 *      le format (HEIC sur certains navigateurs), la promesse rejette
 *      et l'erreur est propagee a l'appelant.
 *   2. Crop carre : zone fournie par l'appelant (typiquement issue de
 *      react-easy-crop) ou plus grand carre centre si null/undefined.
 *   3. Redimensionnement vers `size × size` sur un canvas, avec
 *      imageSmoothingQuality = 'high' pour limiter l'aliasing.
 *   4. Encodage JPEG en baissant la qualite par paliers de 0.10 tant
 *      que le blob depasse maxBytes, jusqu'a un plancher de 0.55. Si
 *      a 0.55 le blob est encore trop gros (tres improbable a 512×512),
 *      on throw une Error claire.
 *
 * @param {File|Blob} source
 * @param {?{x:number,y:number,width:number,height:number}} cropArea
 *   Zone carree en pixels DANS L'IMAGE SOURCE. null/undefined = plus
 *   grand carre centre dans la source (utile pour tester sans UI de crop).
 * @param {{size?: number, quality?: number, maxBytes?: number}} [options]
 *   - size     : cote du JPEG final en pixels (defaut 512)
 *   - quality  : qualite JPEG initiale entre 0 et 1 (defaut 0.85)
 *   - maxBytes : taille max du blob retourne (defaut 500000, soit ~488 Ko,
 *                avec une marge sous la limite bucket de 500 Ko)
 * @returns {Promise<Blob>} JPEG carre, taille <= maxBytes
 */
export async function compressToSquareJpeg(source, cropArea, options = {}) {
  if (!source) throw new Error('compressToSquareJpeg: source requise')

  const size = options.size ?? DEFAULT_SIZE
  const initialQuality = options.quality ?? DEFAULT_QUALITY
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES

  const objectUrl = URL.createObjectURL(source)

  try {
    const img = new Image()
    img.src = objectUrl
    await img.decode()

    const crop = cropArea ?? largestCenteredSquare(img.naturalWidth, img.naturalHeight)

    if (crop.width <= 0 || crop.height <= 0) {
      throw new Error('Zone de crop invalide (dimensions nulles ou negatives).')
    }
    if (
      crop.x < 0 ||
      crop.y < 0 ||
      crop.x + crop.width > img.naturalWidth ||
      crop.y + crop.height > img.naturalHeight
    ) {
      throw new Error('Zone de crop hors de l\'image source.')
    }

    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size

    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(
      img,
      crop.x, crop.y, crop.width, crop.height,
      0, 0, size, size,
    )

    let quality = initialQuality
    while (true) {
      const blob = await canvasToBlob(canvas, 'image/jpeg', quality)
      if (blob.size <= maxBytes) return blob
      if (quality <= MIN_QUALITY + 1e-9) {
        throw new Error(
          `Impossible de compresser l'image sous ${maxBytes} octets (qualite minimale ${MIN_QUALITY} atteinte, blob = ${blob.size} octets).`,
        )
      }
      quality = Math.max(MIN_QUALITY, quality - QUALITY_STEP)
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function largestCenteredSquare(width, height) {
  const side = Math.min(width, height)
  return {
    x: Math.floor((width - side) / 2),
    y: Math.floor((height - side) / 2),
    width: side,
    height: side,
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('canvas.toBlob a retourne null'))
      },
      type,
      quality,
    )
  })
}
