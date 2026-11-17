// src/features/signatures/signaturesLabels.js
// Libelles affiches et couleur du module Signatures.

// Couleur d'accent : depuis l'etape 25, Signatures est un onglet du module
// Contrats (ex-SIM), donc olive comme lui.
export const COULEUR_MODULE = 'olive'

export const TYPES = [
  { key: 'avenant', label: 'Avenant' },
  { key: 'pv', label: 'Procès-verbal' },
  { key: 'feuille_presence', label: 'Feuille de présence' },
  { key: 'contrat_remplacement', label: 'Contrat de remplacement' },
  { key: 'autre', label: 'Autre document' },
]

export function libelleType(type) {
  return TYPES.find((t) => t.key === type)?.label ?? 'Document'
}

// Statut d'une demande -> pastille (composant Pill).
export const STATUTS_DEMANDE = {
  brouillon: { label: 'Brouillon', color: 'marine' },
  en_cours: { label: 'En cours', color: 'ocre' },
  terminee: { label: 'Signé', color: 'olive' },
  annulee: { label: 'Annulée', color: 'brique' },
}

export const STATUTS_SIGNATAIRE = {
  en_attente: { label: 'En attente', color: 'ocre' },
  signe: { label: 'Signé', color: 'olive' },
  refuse: { label: 'Refusé', color: 'brique' },
}

export const EVENEMENTS_JOURNAL = {
  envoi: 'Envoi en signature',
  consultation: 'Ouverture du document',
  code_envoye: 'Code envoyé par e-mail',
  code_faux: 'Code erroné',
  code_bloque: 'Code bloqué (5 erreurs)',
  signature: 'Signature',
  refus: 'Refus',
  relance: 'Relance',
  annulation: 'Annulation',
  scellement: 'Document scellé',
}

const FORMAT_DATE_HEURE = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
})
const FORMAT_DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

export function dateHeure(iso) {
  return iso ? FORMAT_DATE_HEURE.format(new Date(iso)) : ''
}
export function dateCourte(iso) {
  return iso ? FORMAT_DATE.format(new Date(iso)) : ''
}

/** Signataires dont c'est le tour (miroir de signature_est_son_tour, 24C-1). */
export function signatairesAttendus(demande, signataires) {
  if (!demande || demande.statut !== 'en_cours') return []
  if (signataires.some((s) => s.statut === 'refuse')) return []
  const attente = signataires.filter((s) => s.statut === 'en_attente')
  if (!demande.ordre_impose) return attente
  const premier = [...attente].sort((a, b) => a.ordre - b.ordre)[0]
  return premier ? [premier] : []
}
