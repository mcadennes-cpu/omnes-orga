/**
 * Helpers de formatage des profils (prenom + nom).
 * Centralises ici pour eviter la duplication entre modules
 * (Annuaire, Discussion, etc.).
 */

/**
 * Retourne le nom affichable d'un profil ("Prenom Nom").
 * Tolere les profils incomplets (prenom ou nom manquant).
 */
export function formatName(profile) {
  if (!profile) return 'Sans nom'
  const prenom = (profile.prenom || '').trim()
  const nom = (profile.nom || '').trim()
  if (!prenom && !nom) return 'Sans nom'
  return [prenom, nom].filter(Boolean).join(' ')
}

/**
 * Retourne les initiales d'un profil (premiere lettre du prenom +
 * premiere lettre du nom, en majuscules). Retourne '?' si vide.
 */
export function initials(profile) {
  if (!profile) return '?'
  const prenom = (profile.prenom || '').trim()
  const nom = (profile.nom || '').trim()
  const result = ((prenom[0] || '') + (nom[0] || '')).toUpperCase()
  return result || '?'
}

/**
 * Normalise une chaine pour une recherche insensible aux accents et a la casse.
 * Pratique pour filtrer une liste de noms avec un input utilisateur.
 */
export function normalizeForSearch(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}
