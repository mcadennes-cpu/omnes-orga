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
 * Peut renommer ou modifier les metadonnees d'un tableau de discussion
 * (titre, description, couleur). Createur du tableau ou super_admin.
 * Meme regle que canArchiveBoard, exposee separement pour la clarte
 * des intentions cote UI.
 *
 * @param {{ userId: string, role: string, board: { created_by: string } }} ctx
 */
export function canEditBoard({ userId, role, board }) {
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

// ----------------------------------------------------------------------------
// Module Evenements
// ----------------------------------------------------------------------------

const EVENEMENT_CREATOR_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.ASSOCIE_GERANT,
  ROLES.ASSOCIE,
]

/**
 * Peut creer un evenement.
 * Reserve aux associes, associes-gerants et super_admins. Le remplacant est
 * en lecture seule (il peut neanmoins voter au sondage, cf.
 * canRespondToSondage).
 */
export function canCreateEvenement(role) {
  return EVENEMENT_CREATOR_ROLES.includes(role)
}

/**
 * Peut modifier un evenement (titre, dates, lieu, description, couleur,
 * activation du sondage) et gerer ses documents.
 * - super_admin et associe_gerant : n'importe quel evenement.
 * - associe : uniquement ses propres evenements (auteur).
 * - remplacant : jamais.
 * Meme regle que canEditEntreeAnnuaire.
 *
 * @param {{ role: string, currentUserId: string, auteurId: string }} ctx
 */
export function canEditEvenement({ role, currentUserId, auteurId }) {
  if (!role) return false
  if (role === ROLES.SUPER_ADMIN) return true
  if (role === ROLES.ASSOCIE_GERANT) return true
  return Boolean(currentUserId) && currentUserId === auteurId
}

/**
 * Peut supprimer un evenement (hard delete, cascade sur documents et
 * reponses). Meme regle que canEditEvenement.
 */
export function canDeleteEvenement({ role, currentUserId, auteurId }) {
  return canEditEvenement({ role, currentUserId, auteurId })
}

/**
 * Peut repondre au sondage de presence d'un evenement.
 * Tout utilisateur authentifie ayant un role, remplacant compris : chacun
 * indique s'il peut venir. (Le sondage doit aussi etre actif ; la RLS le
 * verifie cote serveur et l'UI le masque cote frontend.)
 */
export function canRespondToSondage(role) {
  return Boolean(role)
}

// ─── SIM (Societe d'Intendance Medicale) — Drive restreint ─────────────────
//
// Modele a deux niveaux, calque sur l'Annuaire (role + auteur) :
//   - Voir / uploader : etre membre SIM (super_admin ou associe_gerant).
//     Cette partie "membre" est surtout portee par la RLS (is_sim_member) ;
//     cote React, le module est simplement masque de la Home aux non-membres.
//   - Modifier / supprimer un dossier ou un fichier : super_admin (tout),
//     ou associe_gerant uniquement sur les elements qu'il a crees.

const SIM_ROLES = ['super_admin', 'associe_gerant']

/**
 * true si le role a acces au module SIM (voir, telecharger, uploader,
 * creer un dossier). Sert au masquage de la tuile Home et aux gardes de page.
 */
export function canAccessSim(role) {
  return SIM_ROLES.includes(role)
}

/**
 * true si l'utilisateur peut modifier (renommer) un dossier ou un fichier SIM.
 * super_admin : tout. associe_gerant : uniquement ses propres elements.
 *
 * @param {object} p
 * @param {string} p.role           role de l'utilisateur courant
 * @param {string} p.currentUserId  id de l'utilisateur courant
 * @param {string} p.auteurId       auteur_id de l'element (dossier ou fichier)
 */
export function canEditSim({ role, currentUserId, auteurId }) {
  if (role === 'super_admin') return true
  if (role === 'associe_gerant') return currentUserId === auteurId
  return false
}

/**
 * true si l'utilisateur peut supprimer un dossier ou un fichier SIM.
 * Meme regle que canEditSim.
 */
export function canDeleteSim(params) {
  return canEditSim(params)
}

// =============================================================
// Permissions du module Immobilier (etape 10)
// =============================================================
// Le module Immobilier reutilise le pattern de Discussion mais avec
// des droits plus restrictifs :
// - Les remplacants n'ont aucun acces, meme sur invitation.
// - Seuls super_admin et associe_gerant creent un tableau.
// - Les associes invites peuvent creer/modifier des cartes et chatter.
// - Pour modifier/archiver une carte, il faut etre createur de la
//   carte, owner du tableau ou super_admin.
// - Pour archiver/supprimer un tableau, il faut etre createur du
//   tableau ou super_admin. Hard delete = super_admin uniquement.

export function canAccessImmobilier(role) {
  return role === 'super_admin'
      || role === 'associe_gerant'
      || role === 'associe';
}

export function canCreateImmobilierBoard(role) {
  return role === 'super_admin' || role === 'associe_gerant';
}

// Owner d'un tableau : utilise pour inviter, archiver, renommer,
// modifier la couleur. La verite de fond reste la RLS Postgres ;
// ce helper sert a piloter l'affichage des CTA cote UI.
export function isImmobilierBoardOwner({ role, currentUserId, ownerIds = [] }) {
  if (role === 'super_admin') return true;
  return ownerIds.includes(currentUserId);
}

export function canInviteToImmobilierBoard({ role, currentUserId, ownerIds = [] }) {
  return isImmobilierBoardOwner({ role, currentUserId, ownerIds });
}

export function canEditImmobilierBoard({ role, currentUserId, ownerIds = [] }) {
  return isImmobilierBoardOwner({ role, currentUserId, ownerIds });
}

export function canArchiveImmobilierBoard({ role, currentUserId, ownerIds = [] }) {
  return isImmobilierBoardOwner({ role, currentUserId, ownerIds });
}

// Hard delete reserve a super_admin uniquement (cf. matrice Immobilier).
export function canDeleteImmobilierBoard(role) {
  return role === 'super_admin';
}

// Un associe invite peut creer une carte (matrice 10).
// On verifie l'acces au module (exclut les remplacants) ; la condition
// "membre du tableau concerne" est portee par la RLS et par l'UI
// qui n'affiche le CTA "+ Nouvelle carte" que sur les tableaux ou
// je suis membre.
export function canCreateImmobilierCard(role) {
  return canAccessImmobilier(role);
}

// Modifier / clore / supprimer une carte :
// createur de la carte, owner du tableau, ou super_admin.
export function canEditImmobilierCard({ role, currentUserId, auteurId, ownerIds = [] }) {
  if (role === 'super_admin') return true;
  if (auteurId === currentUserId) return true;
  return ownerIds.includes(currentUserId);
}

export function canDeleteImmobilierCard(args) {
  return canEditImmobilierCard(args);
}

// Commenter dans le chat d'une carte : tout membre du tableau
// (incluant les associes invites). Le blocage carte close est
// porte cote UI et cote RLS (cf. policy immobilier_messages_insert).
export function canCommentImmobilier(role) {
  return canAccessImmobilier(role);
}

// Editer / supprimer son propre message : tout membre du tableau,
// limite a ses propres messages (la RLS l'impose strictement).
export function canEditOwnImmobilierMessage({ role, currentUserId, auteurId }) {
  return canAccessImmobilier(role) && auteurId === currentUserId;
}