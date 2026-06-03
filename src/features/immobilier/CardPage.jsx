// src/features/immobilier/CardPage.jsx
// Vue carte plein ecran : header + description + fil de messages + composer.
// Style messagerie : pas d'AppLayout, pas de BottomNav.
//
// - Garde : redirige vers /immobilier/:boardId si carte introuvable / non-membre
// - Marque la carte lue a l'ouverture
// - Description repliable (deroulee par defaut)
// - Separateurs de jour entre messages, regroupement par auteur
// - Menu trois-points : modifier / clore-rouvrir / supprimer (droits)

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronDown, ChevronUp, MoreVertical } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { useRole } from '../../hooks/useRole';
import {
  canEditImmobilierCard,
  canDeleteImmobilierCard,
} from '../../lib/permissions';
import { useCard } from './useCard';
import { useBoardOwnerIds } from './useBoard';
import { formatDayLabel } from '../../lib/dateFormat';
import ConfirmModal from '../../components/ConfirmModal';
import StatusBadge from './StatusBadge';
import CardMessage from './CardMessage';
import CardComposer from './CardComposer';
import CardActionsMenu from './CardActionsMenu';
import EditCardModal from './EditCardModal';
import CardAttachments from './CardAttachments';
import HeaderWatermark from '../../components/common/HeaderWatermark';

export default function CardPage({ boardId, cardId }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { role, loading: roleLoading } = useRole();

  // Pour avoir ownerIds (utile pour les droits sur la carte)
  const { ownerIds } = useBoardOwnerIds(boardId);

  const {
    card,
    board,
    messages,
    attachments,
    loading,
    error,
    notFound,
    markRead,
    sendMessage,
    editMessage,
    deleteMessage,
    deleteAttachment,
    setCardStatus,
  } = useCard(cardId);

  const [descriptionOpen, setDescriptionOpen] = useState(true);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const messagesEndRef = useRef(null);

  // Marquage lu au 1er chargement complet
  useEffect(() => {
    if (card && user) {
      markRead();
    }
  }, [card, user, markRead]);

  // Auto-scroll vers le bas a chaque nouveau message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Redirection si carte introuvable ou non accessible (RLS)
  useEffect(() => {
    if (notFound) {
      navigate(`/immobilier/${boardId}`, { replace: true });
    }
  }, [notFound, navigate, boardId]);

  // Calculs derives : droits, groupement des messages par jour + auteur
  const isClosed = card?.statut === 'clos';
  const canEdit = canEditImmobilierCard({
    role,
    currentUserId: user?.id,
    auteurId: card?.auteur_id,
    ownerIds,
  });
  const canDelete = canDeleteImmobilierCard({
    role,
    currentUserId: user?.id,
    auteurId: card?.auteur_id,
    ownerIds,
  });
  const hasAnyCardAction = canEdit || canDelete;

  // Decoration des messages : showAuthor = true si jour different
  // du precedent OU si auteur different du precedent.
  const decoratedMessages = useMemo(() => {
    return messages.map((m, idx) => {
      const prev = messages[idx - 1];
      const next = messages[idx + 1];
      const currentDay = new Date(m.created_at).toDateString();
      const prevDay = prev ? new Date(prev.created_at).toDateString() : null;
      const nextDay = next ? new Date(next.created_at).toDateString() : null;
      const dayChanged = currentDay !== prevDay;
      const authorChanged = prev ? prev.auteur_id !== m.auteur_id : true;
      // Avatar sur la DERNIERE bulle d'un groupe : pas de suivant,
      // OU auteur different, OU jour different du suivant.
      const isLastOfGroup =
        !next ||
        next.auteur_id !== m.auteur_id ||
        currentDay !== nextDay;
      return {
        ...m,
        dayChanged,
        showAuthor: dayChanged || authorChanged,
        showAvatar: isLastOfGroup,
      };
    });
  }, [messages]);

  // Gardes
  if (roleLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-fond">
        <p className="text-body-m text-muted">Chargement...</p>
      </div>
    );
  }
  if (notFound) {
    return null;
  }
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-fond p-4">
        <p className="text-body-m text-brique">Erreur : {error.message}</p>
      </div>
    );
  }
  if (!card || !board) return null;

  // Handlers
  async function handleToggleStatus() {
    const nouveauStatut = isClosed ? 'ouvert' : 'clos';
    const { error: err } = await setCardStatus(nouveauStatut);
    if (err) {
      // eslint-disable-next-line no-console
      console.error('[CardPage] toggle status error:', err);
    }
    setActionsOpen(false);
  }

  function handleDeleteCardClick() {
    setActionsOpen(false);
    setDeleteConfirmOpen(true);
  }

  async function handleConfirmDeleteCard() {
    const { error: err } = await supabase
      .from('immobilier_cards')
      .delete()
      .eq('id', card.id);
    if (err) {
      throw err; // ConfirmModal affichera l'erreur dans sa propre zone
    }
    navigate(`/immobilier/${boardId}`, { replace: true });
  }

  return (
    <div className="min-h-screen flex flex-col bg-fond">
      {/* Header */}
      <header className="shrink-0 bg-fond border-b border-border relative overflow-hidden">
        <div className="flex items-start gap-1 px-2 py-3 relative z-10">
          <button
            type="button"
            onClick={() => navigate(`/immobilier/${boardId}`)}
            aria-label="Retour au tableau"
            className="w-9 h-9 shrink-0 rounded-full flex items-center
                       justify-center text-marine hover:bg-marine/5
                       active:bg-marine/5 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" strokeWidth={2} />
          </button>
          <div className="flex-1 min-w-0 pt-1">
            <StatusBadge statut={card.statut} />
            <h1 className="mt-0.5 font-display font-extrabold text-marine
                           text-lg leading-snug line-clamp-2 break-words">
              {card.titre}
            </h1>
            <p className="mt-0.5 text-faint text-xs truncate">
              {board.titre}
            </p>
          </div>
          {hasAnyCardAction && (
            <button
              type="button"
              onClick={() => setActionsOpen(true)}
              className="w-9 h-9 shrink-0 rounded-full flex items-center
                         justify-center text-marine hover:bg-marine/5
                         transition-colors"
              aria-label="Actions de la carte"
            >
              <MoreVertical size={20} aria-hidden="true" />
            </button>
          )}
        </div>
        <HeaderWatermark color="canard" />
      </header>

      {/* Description repliable */}
      {card.description && (
        <section className="bg-carte border-b border-border">
          <button
            type="button"
            onClick={() => setDescriptionOpen((v) => !v)}
            className="w-full flex items-center justify-between
                       px-4 py-2 text-button text-muted
                       hover:bg-fond"
          >
            <span>Description</span>
            {descriptionOpen
              ? <ChevronUp size={16} aria-hidden="true" />
              : <ChevronDown size={16} aria-hidden="true" />
            }
          </button>
          {descriptionOpen && (
            <div className="px-4 pb-3">
              <p className="text-body-m text-ink whitespace-pre-wrap break-words">
                {card.description}
              </p>
            </div>
          )}
        </section>
      )}

      {/* Pieces jointes */}
      <CardAttachments
        cardId={card.id}
        attachments={attachments}
        cardClosed={isClosed}
        onDeleteAttachment={deleteAttachment}
      />

      {/* Fil de messages */}
      <main className="flex-1 overflow-y-auto px-3 py-3 bg-carte">
        {decoratedMessages.length === 0 ? (
          <div className="text-center mt-12">
            <p className="text-body-m text-muted">
              Aucun message pour le moment.
            </p>
            {!isClosed && (
              <p className="text-caption text-faint mt-1">
                Lancez la discussion en ecrivant un premier message.
              </p>
            )}
          </div>
        ) : (
          decoratedMessages.map((m) => (
            <div key={m.id}>
              {m.dayChanged && (
                <div className="flex items-center gap-2 my-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-caption text-faint uppercase tracking-wider">
                    {formatDayLabel(m.created_at)}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}
              <CardMessage
                message={m}
                isMine={m.auteur_id === user?.id}
                boardColor={board.couleur}
                onEdit={editMessage}
                onDelete={deleteMessage}
                showAvatar={m.showAvatar}
              />
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Composer */}
      <CardComposer
        onSend={sendMessage}
        cardClosed={isClosed}
        boardColor={board.couleur}
      />

      {/* Modales */}
      <CardActionsMenu
        open={actionsOpen}
        onClose={() => setActionsOpen(false)}
        isClosed={isClosed}
        canEdit={canEdit}
        canDelete={canDelete}
        onEdit={() => setEditOpen(true)}
        onToggleStatus={handleToggleStatus}
        onDelete={handleDeleteCardClick}
      />
      <EditCardModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        card={card}
        ownerIds={ownerIds}
      />
      <ConfirmModal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Supprimer cette carte ?"
        message="Vous etes sur le point de supprimer cette carte et tous ses messages. Cette action est definitive."
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        danger
        onConfirm={handleConfirmDeleteCard}
      />
    </div>
  );
}
