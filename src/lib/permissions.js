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

// ----------------------------------------------------------------------------
// Module Discussion
// ----------------------------------------------------------------------------

const DISCUSSION_BOARD_CREATOR_ROLES = [ROLES.SUPER_ADMIN, ROLES.ASSOCIE_GERANT, ROLES.ASSOCIE]
const DISCUSSION_CARD_CREATOR_ROLES = [ROLES.SUPER_ADMIN, ROLES.ASSOCIE_GERANT, ROLES.ASSOCIE]

/**
 * Peut creer un tableau de discussion.
 * Reservé aux associes, associes-gerants et super_admins.
 */
export function canCreateBoard(role) {
  return DISCUSSION_BOARD_CREATOR_ROLES.includes(role)
}

/**
 * Peut inviter ou desinviter des participants dans un tableau donné.
 * - super_admin et associe_gerant : tout tableau dont ils sont membres.
 * - associe : uniquement s'il est createur du tableau.
 * - remplacant : jamais.
 *
 * @param {string} role - role de l'utilisateur courant
 * @param {boolean} isCreator - l'utilisateur courant est-il le createur du tableau
 */
export function canInviteToBoard(role, isCreator) {
  if (role === ROLES.SUPER_ADMIN || role === ROLES.ASSOCIE_GERANT) return true
  if (role === ROLES.ASSOCIE) return Boolean(isCreator)
  return false
}

/**
 * Peut creer une carte dans un tableau (à condition d'être membre,
 * ce que la RLS verifie cote serveur).
 * Le remplacant participe au chat mais ne cree pas de cartes.
 */
export function canCreateCard(role) {
  return DISCUSSION_CARD_CREATOR_ROLES.includes(role)
}

/**
 * Peut modifier ou archiver une carte (changer le titre, la description,
 * basculer le statut ouvert/clos, archiver).
 * Auteur de la carte, createur du tableau, ou super_admin.
 *
 * @param {{ userId: string, role: string, card: { created_by: string }, board: { created_by: string } }} ctx
 */
export function canEditCard({ userId, role, card, board }) {
  if (role === ROLES.SUPER_ADMIN) return true
  if (!userId) return false
  if (card?.created_by === userId) return true
  if (board?.created_by === userId) return true
  return false
}

/**
 * Peut archiver un tableau de discussion.
 * Createur du tableau ou super_admin.
 *
 * @param {{ userId: string, role: string, board: { created_by: string } }} ctx
 */
export function canArchiveBoard({ userId, role, board }) {
  if (role === ROLES.SUPER_ADMIN) return true
  if (!userId) return false
  return board?.created_by === userId
}

/**
 * Peut supprimer dur un tableau de discussion.
 * Reserve au super_admin (suppression definitive, hors archivage).
 */
export function canDeleteBoard(role) {
  return role === ROLES.SUPER_ADMIN
}

/**
 * Peut editer ou supprimer son propre message dans le chat.
 * Tout le monde peut editer/supprimer ses propres messages, quel que soit le role.
 *
 * @param {{ userId: string, message: { author_id: string } }} ctx
 */
export function canEditMessage({ userId, message }) {
  if (!userId) return false
  return message?.author_id === userId
}