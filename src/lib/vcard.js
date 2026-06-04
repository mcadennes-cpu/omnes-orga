// Genere et telecharge une vCard (.vcf) pour ajouter un medecin
// au repertoire du telephone. Aucun paquet externe : string + Blob natif.

function escapeVCard(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

export function buildVCard({ prenom, nom, telephone, email, specialite }) {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0']
  lines.push(`N:${escapeVCard(nom || '')};${escapeVCard(prenom || '')};;;`)
  const fullName = [prenom, nom].filter(Boolean).join(' ').trim()
  lines.push(`FN:${escapeVCard(fullName)}`)
  if (specialite) lines.push(`TITLE:${escapeVCard(specialite)}`)
  if (telephone) lines.push(`TEL;TYPE=CELL:${telephone.replace(/\s/g, '')}`)
  if (email) lines.push(`EMAIL;TYPE=INTERNET:${escapeVCard(email)}`)
  lines.push('END:VCARD')
  return lines.join('\r\n')
}

export function downloadVCard(medecin) {
  const vcard = buildVCard(medecin)
  const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const baseName =
    [medecin.prenom, medecin.nom].filter(Boolean).join('_').trim() || 'contact'
  const a = document.createElement('a')
  a.href = url
  a.download = `${baseName}.vcf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
