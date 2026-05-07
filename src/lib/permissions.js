import { ROLES } from './modules'
export function canEditMedecin({ role, currentUserId, medecinId }) {
  if (!role || !medecinId) return false
  if (role === ROLES.SUPER_ADMIN) return true
  if (role === ROLES.ASSOCIE_GERANT) return true
  return currentUserId === medecinId
}
export function canEditPrivilegedFields(role) {
  return role === ROLES.SUPER_ADMIN || role === ROLES.ASSOCIE_GERANT
}
export function canToggleActif(role) {
  return role === ROLES.SUPER_ADMIN
}
export function canViewSensitiveFields(role) {
  return Boolean(role) && role !== ROLES.REMPLACANT
}
export function canEditEntreeAnnuaire({ role, currentUserId, auteurId }) {
  if (!role) return false
  if (role === ROLES.SUPER_ADMIN) return true
  if (role === ROLES.ASSOCIE_GERANT) return true
  return Boolean(currentUserId) && currentUserId === auteurId
}
export function canDeleteEntreeAnnuaire({ role, currentUserId, auteurId }) {
  if (!role) return false
  if (role === ROLES.SUPER_ADMIN) return true
  if (role === ROLES.ASSOCIE_GERANT) return true
  return Boolean(currentUserId) && currentUserId === auteurId
}
export function canEditCabinet(role) {
  return role === ROLES.SUPER_ADMIN || role === ROLES.ASSOCIE_GERANT
}
export function canDeleteCabinet(role) {
  return role === ROLES.SUPER_ADMIN || role === ROLES.ASSOCIE_GERANT
}