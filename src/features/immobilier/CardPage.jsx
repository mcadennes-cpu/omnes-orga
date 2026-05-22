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
import StatusBadge from './StatusBadge';
import CardMessage from './CardMessage';
import CardComposer from './CardComposer';
import CardActionsMenu from './CardActionsMenu';
import EditCardModal from './EditCardModal';
import CardAttachments from './CardAttachments';

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
  } = useCard(cardId);

  const [descriptionOpen, setDescriptionOpen] = useState(true);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
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
      const currentDay = new Date(m.created_at).toDateString();
      const prevDay = prev ? new Date(prev.created_at).toDateString() : null;
      const dayChanged = currentDay !== prevDay;
      const authorChanged = prev ? prev.auteur_id !== m.auteur_id : true;
      return {
        ...m,
        dayChanged,
        showAuthor: dayChanged || authorChanged,
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
  async function handleEditMessage(message) {
    // eslint-disable-next-line no-alert
    const nouveau = prompt('Modifier le message :', message.contenu);
    if (nouveau === null || nouveau.trim() === message.contenu) return;
    const { error: err } = await editMessage(message.id, nouveau);
    if (err) {
      // eslint-disable-next-line no-alert
      alert(`Erreur : ${err.message}`);
    }
  }

  async function handleDeleteMessage(message) {
    // eslint-disable-next-line no-alert
    if (!confirm('Supprimer ce message ?')) return;
    const { error: err } = await deleteMessage(message.id);
    if (err) {
      // eslint-disable-next-line no-alert
      alert(`Erreur : ${err.message}`);
    }
  }

  async function handleToggleStatus() {
    const { error: err } = await supabase
      .from('immobilier_cards')
      .update({ statut: isClosed ? 'ouvert' : 'clos' })
      .eq('id', card.id);
    if (err) {
      // eslint-disable-next-line no-alert
      alert(`Erreur : ${err.message}`);
    }
  }

  async function handleDeleteCard() {
    // eslint-disable-next-line no-alert
    if (!confirm('Supprimer cette carte definitivement ?')) return;
    const { error: err } = await supabase
      .from('immobilier_cards')
      .delete()
      .eq('id', card.id);
    if (err) {
      // eslint-disable-next-line no-alert
      alert(`Erreur : ${err.message}`);
      return;
    }
    navigate(`/immobilier/${boardId}`, { replace: true });
  }

  return (
    <div className="min-h-screen flex flex-col bg-fond">
      {/* Header sticky */}
      <header className="sticky top-0 z-10 bg-carte border-b border-border
                         px-3 py-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(`/immobilier/${boardId}`)}
          className="p-2 text-muted hover:text-ink rounded-pill
                     hover:bg-fond transition-colors flex-shrink-0"
          aria-label="Retour au tableau"
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-body-l text-ink font-medium truncate">
            {card.titre}
          </h1>
          <p className="text-caption text-faint truncate">
            {board.titre}
          </p>
        </div>
        <StatusBadge statut={card.statut} />
        {hasAnyCardAction && (
          <button
            type="button"
            onClick={() => setActionsOpen(true)}
            className="p-2 text-muted hover:text-ink rounded-pill
                       hover:bg-fond transition-colors flex-shrink-0"
            aria-label="Actions de la carte"
          >
            <MoreVertical size={20} aria-hidden="true" />
          </button>
        )}
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
      <main className="flex-1 overflow-y-auto px-3 py-3">
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
                currentUserId={user?.id}
                boardColor={board.couleur}
                showAuthor={m.showAuthor}
                canInteract={!isClosed}
                onEditClick={handleEditMessage}
                onDeleteClick={handleDeleteMessage}
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
        onDelete={handleDeleteCard}
      />
      <EditCardModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        card={card}
        ownerIds={ownerIds}
      />
    </div>
  );
}
