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
