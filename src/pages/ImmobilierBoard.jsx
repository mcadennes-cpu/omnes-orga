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
import BoardActionsMenu from '../features/immobilier/BoardActionsMenu';
import EditBoardModal from '../features/immobilier/EditBoardModal';
import ManageMembersModal from '../features/immobilier/ManageMembersModal';
import BoardSkeleton from '../features/immobilier/BoardSkeleton';
import EmptyBoard from '../features/immobilier/EmptyBoard';
import HeaderWatermark from '../components/common/HeaderWatermark';

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
  const [actionsOpen, setActionsOpen] = useState(false);
  const [editBoardOpen, setEditBoardOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false);
  const [manageMembersOpen, setManageMembersOpen] = useState(false);

  const counts = useMemo(
    () => ({
      ouvertes: cards.filter((c) => c.statut === 'ouvert').length,
      closes: cards.filter((c) => c.statut === 'clos').length,
      toutes: cards.length,
    }),
    [cards]
  );

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
    if (err) throw err; // ConfirmModal affichera l'erreur
    navigate('/immobilier', { replace: true });
  }

  return (
    <AppLayout>
      {/* Header sticky */}
      <header className="sticky top-0 z-10 bg-fond/95 backdrop-blur-sm border-b border-border relative overflow-hidden">
        {loading && !board && (
          <div className="px-4 py-3 text-body-m text-muted relative z-10">Chargement...</div>
        )}

        {error && (
          <div className="px-4 py-3 text-body-m text-brique relative z-10">
            Erreur : {error.message}
          </div>
        )}

        {board && (
          <>
            {/* Ligne 1 : retour + titre + actions */}
            <div className="flex items-center gap-1 px-2 py-3 relative z-10">
              <Link
                to="/immobilier"
                aria-label="Retour a la liste des tableaux"
                className="w-9 h-9 shrink-0 rounded-full flex items-center
                           justify-center text-marine hover:bg-marine/5
                           active:bg-marine/5 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" strokeWidth={2} />
              </Link>
              <h1 className="flex-1 min-w-0 truncate font-display font-extrabold
                             text-marine text-xl">
                {board.titre}
              </h1>
              {hasAnyBoardAction && (
                <button
                  type="button"
                  onClick={() => setActionsOpen(true)}
                  className="w-9 h-9 shrink-0 rounded-full flex items-center
                             justify-center text-marine hover:bg-marine/5
                             transition-colors"
                  aria-label="Actions du tableau"
                >
                  <MoreVertical size={20} aria-hidden="true" />
                </button>
              )}
            </div>

            {/* Ligne 2 : avatars + CTA nouvelle carte */}
            <div className="flex items-center justify-between gap-3
                            px-4 pb-3 min-h-[36px] relative z-10">
              <MemberAvatars members={members} max={4} />
              {canCreate && (
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2
                              rounded-full ${getBoardColorClasses(board.couleur).cta}
                              font-semibold text-sm
                              active:opacity-80 transition-opacity`}
                >
                  <Plus className="w-4 h-4" strokeWidth={2.4} />
                  Nouvelle carte
                </button>
              )}
            </div>

            {/* Ligne 3 : onglets de statut */}
            <div className="px-4 pb-3 relative z-10">
              <div className="flex gap-1 p-1 bg-fond rounded-full">
                {[
                  { key: 'ouvertes', label: 'Ouvertes' },
                  { key: 'closes',   label: 'Closes'   },
                  { key: 'toutes',   label: 'Toutes'   },
                ].map((tab) => {
                  const active = tab.key === filter;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setFilter(tab.key)}
                      className={`flex-1 inline-flex items-center justify-center
                                  gap-1.5 py-1.5 rounded-full text-sm
                                  font-semibold transition-colors ${
                        active
                          ? 'bg-carte text-marine shadow-sm'
                          : 'text-muted'
                      }`}
                    >
                      {tab.label}
                      <span
                        className={`min-w-[18px] px-1 rounded-full text-[11px] ${
                          active
                            ? 'bg-marine/10 text-marine'
                            : 'bg-marine/5 text-muted'
                        }`}
                      >
                        {counts[tab.key]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
        <HeaderWatermark color="canard" fill offsetRight={64} />
      </header>

      {/* Bandeau tableau archive */}
      {board?.archive && (
        <div className="px-4 py-2.5 bg-ocre/15 flex items-center justify-between gap-3">
          <span className="text-marine text-xs font-medium">
            Ce tableau est archive.
          </span>
          {canArchiveBoard && (
            <button
              type="button"
              onClick={handleToggleArchive}
              className="shrink-0 text-marine text-xs font-semibold underline underline-offset-2"
            >
              Desarchiver
            </button>
          )}
        </div>
      )}

      {/* Liste de cartes */}
      <div className="bg-carte">
        {loading && board && <BoardSkeleton />}

        {!loading && cards.length === 0 && (
          <EmptyBoard
            boardColor={board?.couleur}
            canCreateCard={canCreate}
            onCreateCard={() => setCreateOpen(true)}
          />
        )}

        {!loading && cards.length > 0 && filteredCards.length === 0 && (
          <div className="py-12 px-6 text-center">
            <p className="text-muted text-sm">
              {filter === 'ouvertes'
                ? 'Aucune carte ouverte.'
                : 'Aucune carte close.'}
            </p>
          </div>
        )}

        {!loading && filteredCards.length > 0 && (
          <ul className="divide-y divide-border">
            {filteredCards.map((card) => (
              <li key={card.id}>
                <CardTile card={card} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Modales */}
      {board && (
        <CreateCardModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          boardId={board.id}
        />
      )}
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
        onLeave={() => setConfirmLeaveOpen(true)}
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

      <ConfirmModal
        open={confirmLeaveOpen}
        onClose={() => setConfirmLeaveOpen(false)}
        title="Quitter ce tableau ?"
        message="Vous perdrez l'accès à ses cartes et à ses discussions. Vous ne pourrez y revenir que si un membre vous réinvite."
        confirmLabel="Quitter le tableau"
        danger
        onConfirm={handleLeaveBoard}
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
