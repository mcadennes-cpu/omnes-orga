import { File, FileText, Image, FileSpreadsheet } from 'lucide-react'

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif']
const SHEET_EXT = ['xls', 'xlsx', 'csv', 'numbers']

/**
 * Icone + classes de couleur d'un fichier selon son type MIME (et son
 * extension en secours). Memes familles que le module Cabinet pratique :
 * image -> fuchsia, PDF -> brique, tableur -> olive, reste -> marine.
 */
export function getFileTypeMeta(mimeType, nom) {
  const mime = (mimeType ?? '').toLowerCase()
  const ext = (nom ?? '').split('.').pop()?.toLowerCase() ?? ''

  if (mime.startsWith('image/') || IMAGE_EXT.includes(ext)) {
    return { Icon: Image, bg: 'bg-fuchsia/12', text: 'text-fuchsia' }
  }
  if (mime === 'application/pdf' || ext === 'pdf') {
    return { Icon: FileText, bg: 'bg-brique/12', text: 'text-brique' }
  }
  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    SHEET_EXT.includes(ext)
  ) {
    return { Icon: FileSpreadsheet, bg: 'bg-olive/12', text: 'text-olive' }
  }
  return { Icon: File, bg: 'bg-marine/12', text: 'text-marine' }
}

/** Taille lisible : '412 Ko', '1,2 Mo'... */
export function formatTaille(octets) {
  if (octets == null) return ''
  if (octets < 1024) return `${octets} o`
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`
  return `${(octets / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`
}
