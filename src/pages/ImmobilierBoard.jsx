// src/pages/ImmobilierBoard.jsx
// Page vue tableau /immobilier/:boardId.
// - Garde de page : redirige vers /immobilier si non-membre ou board introuvable.
// - Header : retour, titre, avatars membres.
// - Filtre Ouvertes / Closes / Toutes.
// - Liste de cartes (CardTile).
// - CTA "+ Nouvelle carte" teinte couleur tableau.
// - Modales create + edit cartes.

import { useMemo, useState } from 'react';
import { useParams, Navigate, Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, MoreVertical } from 'lucide-react';
import AppLayout from '../components/layout/AppLayout';
import { useAuth } from '../hooks/useAuth';
import { useRole } from '../hooks/useRole';
import {
  canAccessImmobilier,
  canCreateImmobilierCard,
  canEditImmobilierBoard,
  canArchiveImmobilierBoard,
  canDeleteImmobilierBoard,
  canInviteToImmobilierBoard,
} from '../lib/permissions';
import { supabase } from '../lib/supabaseClient';
import ConfirmModal from '../components/ConfirmModal';
import { useBoard } from '../features/immobilier/useBoard';
import { getBoardColorClasses } from '../features/immobilier/immobilierColors';
import MemberAvatars from '../features/immobilier/MemberAvatars';
import CardTile from '../features/immobilier/CardTile';
import CreateCardModal from '../features/immobilier/CreateCardModal';
import EditCardModal from '../features/immobilier/EditCardModal';
import BoardActionsMenu from '../features/immobilier/BoardActionsMenu';
import EditBoardModal from '../features/immobilier/EditBoardModal';
import ManageMembersModal from '../features/immobilier/ManageMembersModal';

export default function ImmobilierBoard() {
  const { boardId } = useParams();
  const { role, loading: roleLoading } = useRole();
  const { user } = useAuth();
  const navigate = useNavigate();

  const {
    board,
    members,
    ownerIds,
    cards,
    loading,
    error,
    notMember,
    refetch,
  } = useBoard(boardId);

  const [filter, setFilter] = useState('ouvertes'); // 'ouvertes' | 'closes' | 'toutes'
  const [createOpen, setCreateOpen] = useState(false);
  const [editingCard, setEditingCard] = useState(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [editBoardOpen, setEditBoardOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [manageMembersOpen, setManageMembersOpen] = useState(false);

  const filteredCards = useMemo(() => {
    if (filter === 'ouvertes') return cards.filter((c) => c.statut === 'ouvert');
    if (filter === 'closes') return cards.filter((c) => c.statut === 'clos');
    return cards;
  }, [cards, filter]);

  // Gardes APRES tous les hooks
  if (roleLoading) {
    return (
      <AppLayout>
        <div className="px-4 py-6 text-body-m text-muted">Chargement...</div>
      </AppLayout>
    );
  }
  if (!canAccessImmobilier(role)) {
    return <Navigate to="/" replace />;
  }
  if (notMember) {
    return <Navigate to="/immobilier" replace />;
  }

  const colors = board ? getBoardColorClasses(board.couleur) : null;
  const canCreate = canCreateImmobilierCard(role);

  const canEditBoard = canEditImmobilierBoard({
    role,
    currentUserId: user?.id,
    ownerIds,
  });
  const canArchiveBoard = canArchiveImmobilierBoard({
    role,
    currentUserId: user?.id,
    ownerIds,
  });
  const canManageMembers = canInviteToImmobilierBoard({
    role,
    currentUserId: user?.id,
    ownerIds,
  });
  const canDeleteBoard = canDeleteImmobilierBoard(role);
  // Un membre peut quitter s'il est membre, mais pas s'il est le seul owner.
  const isCurrentUserMember = members.some((m) => m.user_id === user?.id);
  const isCurrentUserSoleOwner =
    ownerIds.length === 1 && ownerIds[0] === user?.id;
  const canLeaveBoard = isCurrentUserMember && !isCurrentUserSoleOwner;
  const hasAnyBoardAction =
    canEditBoard || canArchiveBoard || canManageMembers || canDeleteBoard || canLeaveBoard;

  async function handleToggleArchive() {
    if (!board || !canArchiveBoard) return;
    const { error: err } = await supabase
      .from('immobilier_boards')
      .update({ archive: !board.archive })
      .eq('id', board.id);
    if (err) {
      // eslint-disable-next-line no-alert
      alert(`Erreur : ${err.message}`);
      return;
    }
    refetch();
  }

  async function handleDeleteBoard() {
    if (!board) return;
    const { error: err } = await supabase
      .from('immobilier_boards')
      .delete()
      .eq('id', board.id);
    if (err) throw err; // ConfirmModal affichera l'erreur
    navigate('/immobilier', { replace: true });
  }

  async function handleLeaveBoard() {
    if (!user?.id || !board) return;
    const { error: err } = await supabase
      .from('immobilier_board_members')
      .delete()
      .eq('board_id', board.id)
      .eq('user_id', user.id);
    if (err) {
      // eslint-disable-next-line no-alert
      alert(`Erreur : ${err.message}`);
      return;
    }
    navigate('/immobilier', { replace: true });
  }

  return (
    <AppLayout>
      {/* Header sticky */}
      <div className="sticky top-0 z-10 bg-fond border-b border-border">
        <div className="px-4 pt-3 pb-3">
          <Link
            to="/immobilier"
            className="inline-flex items-center gap-1 text-body-m text-canard mb-2"
          >
            <ChevronLeft size={18} aria-hidden="true" />
            <span>Tableaux</span>
          </Link>

          {loading && !board && (
            <div className="text-body-m text-muted">Chargement...</div>
          )}

          {error && (
            <div className="text-body-m text-brique">
              Erreur : {error.message}
            </div>
          )}

          {board && (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h1 className="text-h1 text-ink break-words">{board.titre}</h1>
                  {board.description && (
                    <p className="text-body-m text-muted mt-1 line-clamp-2">
                      {board.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <MemberAvatars members={members} max={4} />
                  {hasAnyBoardAction && (
                    <button
                      type="button"
                      onClick={() => setActionsOpen(true)}
                      className="p-2 text-muted hover:text-ink rounded-pill
                                 hover:bg-fond transition-colors"
                      aria-label="Actions du tableau"
                    >
                      <MoreVertical size={20} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>

              {board.archive && (
                <div className="mt-3 px-3 py-2 bg-fond border border-border
                                rounded-input text-caption text-muted">
                  Ce tableau est archive.
                </div>
              )}

              <div className="mt-3 flex items-center justify-between gap-2">
                {/* Filtre segmente */}
                <div className="inline-flex bg-carte rounded-pill p-1 border border-border">
                  {[
                    { key: 'ouvertes', label: 'Ouvertes' },
                    { key: 'closes',   label: 'Closes'   },
                    { key: 'toutes',   label: 'Toutes'   },
                  ].map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setFilter(f.key)}
                      className={`px-3 py-1 text-button rounded-pill transition-colors ${
                        filter === f.key
                          ? 'bg-marine text-white'
                          : 'text-muted'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {canCreate && colors && (
                  <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2
                                text-white text-button rounded-input
                                shadow-button ${colors.bg}`}
                    aria-label="Nouvelle carte"
                  >
                    <Plus size={18} aria-hidden="true" />
                    <span>Carte</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Liste de cartes */}
      <div className="px-4 py-4 space-y-3">
        {!loading && filteredCards.length === 0 && (
          <div className="bg-carte rounded-card border border-border p-8 text-center">
            <h2 className="text-h2 text-ink">
              {filter === 'closes' ? 'Aucune carte close' : 'Aucune carte'}
            </h2>
            <p className="text-body-m text-muted mt-2">
              {filter === 'closes'
                ? 'Les cartes que vous clorez apparaitront ici.'
                : canCreate
                  ? 'Creez une premiere carte pour suivre un sujet.'
                  : 'Aucune carte pour le moment.'}
            </p>
          </div>
        )}

        {filteredCards.map((card) => (
          <CardTile
            key={card.id}
            card={card}
            onClick={() => setEditingCard(card)}
          />
        ))}
      </div>

      {/* Modales */}
      {board && (
        <CreateCardModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          boardId={board.id}
        />
      )}
      <EditCardModal
        open={!!editingCard}
        onClose={() => setEditingCard(null)}
        card={editingCard}
        ownerIds={ownerIds}
      />

      <BoardActionsMenu
        open={actionsOpen}
        onClose={() => setActionsOpen(false)}
        archive={board?.archive ?? false}
        canEdit={canEditBoard}
        canArchive={canArchiveBoard}
        canManageMembers={canManageMembers}
        canDelete={canDeleteBoard}
        canLeave={canLeaveBoard}
        onRename={() => setEditBoardOpen(true)}
        onToggleArchive={handleToggleArchive}
        onManageMembers={() => setManageMembersOpen(true)}
        onDelete={() => setConfirmDeleteOpen(true)}
        onLeave={handleLeaveBoard}
      />

      <EditBoardModal
        open={editBoardOpen}
        onClose={() => {
          setEditBoardOpen(false);
          refetch();
        }}
        board={board}
      />

      <ConfirmModal
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title="Supprimer le tableau"
        message="Cette action est definitive. Toutes les cartes, messages et pieces jointes du tableau seront supprimes."
        confirmLabel="Supprimer"
        danger
        onConfirm={handleDeleteBoard}
      />

      <ManageMembersModal
        open={manageMembersOpen}
        onClose={() => setManageMembersOpen(false)}
        board={board}
        members={members}
        ownerIds={ownerIds}
        canManage={canManageMembers}
        onChanged={refetch}
      />
    </AppLayout>
  );
}
