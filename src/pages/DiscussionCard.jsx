import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import ConfirmModal from '../components/ConfirmModal'
import CardPage from '../features/discussion/CardPage'
import EditCardModal from '../features/discussion/EditCardModal'
import { useCard } from '../features/discussion/useCard'
import { openAttachment } from '../features/discussion/discussionStorage'
import { useMedecins } from '../hooks/useMedecins'
import { useRole } from '../hooks/useRole'
import { canEditCard } from '../lib/permissions'

/**
 * Page conteneur de la vue d'une carte de discussion (etape 7C).
 *
 * Page autonome plein ecran (sans AppLayout, donc sans BottomNav) :
 * la vue carte se comporte comme un ecran de conversation de messagerie.
 */
export default function DiscussionCard() {
  const { boardId, cardId } = useParams()
  const navigate = useNavigate()
  const { role } = useRole()
  const { medecins } = useMedecins()

  const {
    card,
    board,
    messages,
    attachments,
    isLoading,
    notFound,
    error,
    userId,
    sendMessage,
    editMessage,
    deleteMessage,
    updateCard,
    closeCard,
    reopenCard,
    deleteCard,
    addAttachment,
    deleteAttachment,
  } = useCard(cardId)

  const [editOpen, setEditOpen] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  // Map identifiant -> profil, pour resoudre les auteurs des messages.
  const profilesById = {}
  medecins.forEach((m) => { profilesById[m.id] = m })

  const backToBoard = () => navigate(`/discussion/${boardId}`)

  // --- Etats introuvable / erreur / chargement -----------------------------
  if (notFound) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-fond px-6 text-center">
        <h1 className="font-display font-extrabold text-marine text-lg mb-2">
          Carte introuvable
        </h1>
        <p className="text-muted text-sm max-w-xs mb-5">
          Cette carte n'existe pas ou vous n'y avez pas accès.
        </p>
        <button
          type="button"
          onClick={backToBoard}
          className="inline-flex items-center px-4 py-2.5 rounded-full bg-brique text-white font-semibold text-sm active:opacity-80 transition-opacity"
        >
          Retour au tableau
        </button>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-fond px-6 text-center">
        <h1 className="font-display font-extrabold text-marine text-lg mb-2">
          Une erreur est survenue
        </h1>
        <p className="text-muted text-sm max-w-xs mb-1">
          Impossible de charger cette carte.
        </p>
        <p className="text-faint text-xs mb-5">{error.message}</p>
        <button
          type="button"
          onClick={backToBoard}
          className="inline-flex items-center px-4 py-2.5 rounded-full bg-brique text-white font-semibold text-sm active:opacity-80 transition-opacity"
        >
          Retour au tableau
        </button>
      </div>
    )
  }

  if (isLoading || !card || !board) {
    return (
      <div className="h-screen flex items-center justify-center bg-fond">
        <Loader2 className="w-6 h-6 text-muted animate-spin" strokeWidth={2} />
      </div>
    )
  }

  // --- Permissions ---------------------------------------------------------
  // permissions.js attend created_by en snake_case ; useCard expose camelCase.
  const userCanEditCard = canEditCard({
    userId,
    role,
    card: { created_by: card.createdBy },
    board: { created_by: board.createdBy },
  })

  // --- Handlers ------------------------------------------------------------
  const handleToggleStatus = async () => {
    try {
      if (card.status === 'open') {
        await closeCard()
      } else {
        await reopenCard()
      }
    } catch (err) {
      console.error('[DiscussionCard] toggle status error:', err)
    }
  }

  const handleConfirmDelete = async () => {
    await deleteCard()
    navigate(`/discussion/${boardId}`)
  }

  const handleOpenAttachment = async (attachment) => {
    try {
      await openAttachment(
        attachment.storagePath,
        attachment.filename,
        attachment.mimeType
      )
    } catch (err) {
      console.error('[DiscussionCard] open attachment error:', err)
    }
  }

  return (
    <div className="h-screen flex flex-col bg-fond">
      <CardPage
        card={card}
        board={board}
        messages={messages}
        attachments={attachments}
        userId={userId}
        profilesById={profilesById}
        canEditCard={userCanEditCard}
        onBack={backToBoard}
        onEditCard={() => setEditOpen(true)}
        onToggleCardStatus={handleToggleStatus}
        onDeleteCard={() => setConfirmDeleteOpen(true)}
        onSendMessage={sendMessage}
        onEditMessage={editMessage}
        onDeleteMessage={deleteMessage}
        onOpenAttachment={handleOpenAttachment}
        onAddAttachment={addAttachment}
        onDeleteAttachment={deleteAttachment}
      />

      <EditCardModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        card={card}
        onSave={updateCard}
        accentColor={board.color}
      />

      <ConfirmModal
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title="Supprimer la carte"
        message="Cette action est irréversible. La carte et tous ses messages seront définitivement supprimés."
        confirmLabel="Supprimer"
        danger
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}
