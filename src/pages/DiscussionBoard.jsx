import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'
import ConfirmModal from '../components/ConfirmModal'
import BoardPage from '../features/discussion/BoardPage'
import BoardActionsMenu from '../features/discussion/BoardActionsMenu'
import CreateCardModal from '../features/discussion/CreateCardModal'
import CardDetailModal from '../features/discussion/CardDetailModal'
import RenameBoardModal from '../features/discussion/RenameBoardModal'
import { useBoard } from '../features/discussion/useBoard'
import { useMedecins } from '../hooks/useMedecins'
import { useRole } from '../hooks/useRole'
import {
  canCreateCard,
  canEditCard,
  canEditBoard,
  canArchiveBoard,
  canDeleteBoard,
} from '../lib/permissions'

/**
 * Page conteneur de la vue d'un tableau de discussion (etape 7B).
 * Orchestre le hook useBoard, l'annuaire (useMedecins) pour les profils
 * des membres, les permissions et les modales.
 */
export default function DiscussionBoard() {
  const { boardId } = useParams()
  const navigate = useNavigate()
  const { role } = useRole()
  const { medecins } = useMedecins()

  const {
    board,
    cards,
    members,
    isLoading,
    notFound,
    error,
    userId,
    createCard,
    updateCard,
    closeCard,
    reopenCard,
    deleteCard,
    updateBoard,
    archiveBoard,
    unarchiveBoard,
    deleteBoard,
  } = useBoard(boardId)

  const [statusFilter, setStatusFilter] = useState('open')
  const [createCardOpen, setCreateCardOpen] = useState(false)
  const [detailCardId, setDetailCardId] = useState(null)
  const [renameOpen, setRenameOpen] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  // Carte affichee dans la modale detail : derivee de `cards` (et non
  // stockee en state) pour rester synchro apres une modification.
  const detailCard = detailCardId
    ? cards.find((c) => c.id === detailCardId) || null
    : null

  // Profils des membres : on croise les identifiants renvoyes par useBoard
  // avec l'annuaire charge par useMedecins.
  const memberProfiles = members
    .map((m) => medecins.find((med) => med.id === m.userId))
    .filter(Boolean)

  // --- Etats introuvable / erreur -----------------------------------------
  if (notFound) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <h1 className="font-display font-extrabold text-marine text-lg mb-2">
            Tableau introuvable
          </h1>
          <p className="text-muted text-sm max-w-xs mb-5">
            Ce tableau n'existe pas ou vous n'y avez pas accès.
          </p>
          <button
            type="button"
            onClick={() => navigate('/discussion')}
            className="inline-flex items-center px-4 py-2.5 rounded-full bg-brique text-white font-semibold text-sm active:opacity-80 transition-opacity"
          >
            Retour à la liste
          </button>
        </div>
      </AppLayout>
    )
  }

  if (error) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <h1 className="font-display font-extrabold text-marine text-lg mb-2">
            Une erreur est survenue
          </h1>
          <p className="text-muted text-sm max-w-xs mb-1">
            Impossible de charger ce tableau.
          </p>
          <p className="text-faint text-xs mb-5">{error.message}</p>
          <button
            type="button"
            onClick={() => navigate('/discussion')}
            className="inline-flex items-center px-4 py-2.5 rounded-full bg-brique text-white font-semibold text-sm active:opacity-80 transition-opacity"
          >
            Retour à la liste
          </button>
        </div>
      </AppLayout>
    )
  }

  // --- Permissions ---------------------------------------------------------
  // permissions.js attend les champs en snake_case (created_by) ; useBoard
  // expose en camelCase. On adapte localement le board pour les helpers.
  const boardForPerms = board ? { created_by: board.createdBy } : null

  const userCanEditBoard = boardForPerms
    ? canEditBoard({ userId, role, board: boardForPerms })
    : false
  const userCanArchiveBoard = boardForPerms
    ? canArchiveBoard({ userId, role, board: boardForPerms })
    : false
  const userCanDeleteBoard = canDeleteBoard(role)

  // Creer une carte : droit lie au role ET tableau non archive.
  const userCanCreateCard =
    canCreateCard(role) && Boolean(board) && !board.archived

  const userCanEditDetailCard =
    detailCard && boardForPerms
      ? canEditCard({
          userId,
          role,
          card: { created_by: detailCard.createdBy },
          board: boardForPerms,
        })
      : false

  // --- Handlers ------------------------------------------------------------
  const handleToggleArchive = async () => {
    try {
      if (board.archived) {
        await unarchiveBoard()
      } else {
        await archiveBoard()
      }
    } catch (err) {
      console.error('[DiscussionBoard] toggle archive error:', err)
    }
  }

  const handleConfirmDelete = async () => {
    await deleteBoard()
    navigate('/discussion')
  }

  const handleToggleCardStatus = (card) =>
    card.status === 'open' ? closeCard(card.id) : reopenCard(card.id)

  // --- Menu d'actions du header -------------------------------------------
  const headerActions = board ? (
    <BoardActionsMenu
      canRename={userCanEditBoard}
      canArchive={userCanArchiveBoard}
      canDelete={userCanDeleteBoard}
      isArchived={board.archived}
      onRename={() => setRenameOpen(true)}
      onToggleArchive={handleToggleArchive}
      onDelete={() => setConfirmDeleteOpen(true)}
    />
  ) : null

  return (
    <AppLayout>
      <BoardPage
        board={board}
        cards={cards}
        memberProfiles={memberProfiles}
        isLoading={isLoading}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        canCreateCard={userCanCreateCard}
        onCreateCard={() => setCreateCardOpen(true)}
        onCardClick={(card) => setDetailCardId(card.id)}
        onBack={() => navigate('/discussion')}
        onUnarchive={userCanArchiveBoard ? handleToggleArchive : undefined}
        headerActions={headerActions}
      />

      <CreateCardModal
        open={createCardOpen}
        onClose={() => setCreateCardOpen(false)}
        onCreate={createCard}
        accentColor={board?.color}
      />

      <CardDetailModal
        open={Boolean(detailCard)}
        onClose={() => setDetailCardId(null)}
        card={detailCard}
        accentColor={board?.color}
        canEdit={userCanEditDetailCard}
        onSave={updateCard}
        onToggleStatus={handleToggleCardStatus}
        onDelete={deleteCard}
      />

      <RenameBoardModal
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        currentTitle={board?.title || ''}
        onRename={(newTitle) => updateBoard({ title: newTitle })}
        accentColor={board?.color}
      />

      <ConfirmModal
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title="Supprimer le tableau"
        message="Cette action est irréversible. Le tableau, toutes ses cartes et tous les messages seront définitivement supprimés."
        confirmLabel="Supprimer"
        danger
        onConfirm={handleConfirmDelete}
      />
    </AppLayout>
  )
}
