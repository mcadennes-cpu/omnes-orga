import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Filter,
  MessageSquare,
  MessageSquarePlus,
  Users,
} from 'lucide-react';
import AppLayout from '../components/layout/AppLayout';
import { useDiscussion } from '../features/discussion/useDiscussion';
import CreateBoardModal from '../features/discussion/CreateBoardModal';
import { canCreateBoard } from '../lib/permissions';
import { useRole } from '../hooks/useRole';
import { getBoardColorClasses } from '../features/discussion/boardColors';
import { formatRelativeDate } from '../lib/dateFormat';
import { normalizeForSearch } from '../lib/profileFormat';

// ----------------------------------------------------------------------------
// Sous-composants
// ----------------------------------------------------------------------------

function BoardTile({ board, onClick }) {
  const colors = getBoardColorClasses(board.color);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-fond active:bg-fond transition-colors"
    >
      {/* Tile à gauche */}
      <div className="relative shrink-0">
        <div
          className={`w-11 h-11 rounded-tile flex items-center justify-center ${colors.tileBg}`}
        >
          <MessageSquare className={`w-5 h-5 ${colors.tileText}`} strokeWidth={1.8} />
        </div>
        {board.hasUnread && (
          <span
            className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-carte ${colors.dot}`}
            aria-label="Nouveau message"
          />
        )}
      </div>

      {/* Texte */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <h3
            className={`flex-1 truncate text-marine ${
              board.hasUnread ? 'font-bold' : 'font-semibold'
            }`}
          >
            {board.title}
          </h3>
          <span className="shrink-0 text-faint text-[11px]">
            {formatRelativeDate(board.lastActivityAt)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-muted text-xs mt-0.5">
          <span>
            {board.openCardsCount} {board.openCardsCount > 1 ? 'ouvertes' : 'ouverte'}
          </span>
          <span className="text-faint">·</span>
          <span className="inline-flex items-center gap-1">
            <Users className="w-3 h-3" strokeWidth={1.8} />
            {board.membersCount}
          </span>
        </div>
      </div>
    </button>
  );
}

function EmptyState({ canCreate, onCreate, archivedView, hasSearch }) {
  if (hasSearch) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <p className="text-muted text-sm">
          Aucun tableau ne correspond à votre recherche.
        </p>
      </div>
    );
  }

  if (archivedView) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <p className="text-muted text-sm">Aucun tableau archivé.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-14 h-14 rounded-tile bg-brique/12 flex items-center justify-center mb-4">
        <MessageSquarePlus className="w-7 h-7 text-brique" strokeWidth={1.8} />
      </div>
      <h2 className="font-display font-extrabold text-marine text-lg mb-2">
        Aucun tableau pour l'instant
      </h2>
      <p className="text-muted text-sm max-w-xs mb-5">
        {canCreate
          ? 'Créez un tableau pour rassembler les décisions d\'un sujet : achat de matériel, planning, organisation...'
          : 'Vous serez invité dans un tableau par un associé ou un gérant pour participer aux décisions.'}
      </p>
      {canCreate && (
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-brique text-white font-semibold text-sm active:opacity-80 transition-opacity"
        >
          <Plus className="w-4 h-4" strokeWidth={2.2} />
          Créer un tableau
        </button>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="px-4 py-3 space-y-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 animate-pulse">
          <div className="w-11 h-11 rounded-tile bg-border" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-border rounded-full w-2/3" />
            <div className="h-2.5 bg-border/60 rounded-full w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Page principale
// ----------------------------------------------------------------------------

export default function Discussion() {
  const navigate = useNavigate();
  const { role } = useRole();
  const { boards, isLoading, error, createBoard, userId } = useDiscussion();

  const [searchTerm, setSearchTerm] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const canCreate = canCreateBoard(role);

  const filteredBoards = useMemo(() => {
    let result = boards.filter((b) =>
      showArchived ? b.archived : !b.archived
    );

    const normalizedTerm = normalizeForSearch(searchTerm).trim();
    if (normalizedTerm) {
      result = result.filter((b) =>
        normalizeForSearch(b.title).includes(normalizedTerm)
      );
    }

    return result;
  }, [boards, showArchived, searchTerm]);

  const handleOpenBoard = (boardId) => {
    navigate(`/discussion/${boardId}`);
  };

  const handleCreateClick = () => {
    setCreateModalOpen(true);
    // Branchement effectif a la prochaine etape (modale).
  };

  return (
    <AppLayout>
      <div className="flex flex-col">
        {/* Header sticky */}
        <header className="sticky top-0 z-10 bg-fond/95 backdrop-blur-sm border-b border-border">
          <div className="flex items-center justify-between px-4 py-3">
            <h1 className="font-display font-extrabold text-marine text-2xl">
              Discussion
            </h1>
            {canCreate && (
              <button
                type="button"
                onClick={handleCreateClick}
                aria-label="Créer un tableau"
                className="w-9 h-9 rounded-full bg-brique text-white flex items-center justify-center active:opacity-80 transition-opacity"
              >
                <Plus className="w-5 h-5" strokeWidth={2.2} />
              </button>
            )}
          </div>

          {/* Barre de recherche */}
          <div className="px-4 pb-3">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none"
                strokeWidth={1.8}
              />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher un tableau…"
                className="w-full pl-9 pr-3 py-2.5 rounded-input bg-carte border border-border text-marine text-sm placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-canard/30"
              />
            </div>
          </div>
        </header>

        {/* Sous-header : compteur + filtre */}
        <div className="flex items-center justify-between px-4 py-2.5 text-muted text-xs uppercase tracking-wider">
          <span className="font-semibold">
            Mes tableaux
            {filteredBoards.length > 0 && (
              <span className="text-faint"> · {filteredBoards.length}</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="inline-flex items-center gap-1 text-muted hover:text-marine transition-colors"
          >
            <Filter className="w-3.5 h-3.5" strokeWidth={1.8} />
            {showArchived ? 'Archivés' : 'Actifs'}
          </button>
        </div>

        {/* Contenu */}
        <div className="flex-1 bg-carte">
          {error ? (
            <div className="px-4 py-8 text-center">
              <p className="text-muted text-sm mb-3">
                Impossible de charger les tableaux.
              </p>
              <p className="text-faint text-xs">{error.message}</p>
            </div>
          ) : isLoading ? (
            <LoadingSkeleton />
          ) : filteredBoards.length === 0 ? (
            <EmptyState
              canCreate={canCreate}
              onCreate={handleCreateClick}
              archivedView={showArchived}
              hasSearch={Boolean(searchTerm.trim())}
            />
          ) : (
            <ul className="divide-y divide-border">
              {filteredBoards.map((board) => (
                <li key={board.id}>
                  <BoardTile
                    board={board}
                    onClick={() => handleOpenBoard(board.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <CreateBoardModal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onCreate={createBoard}
          currentUserId={userId}
        />
      </div>
    </AppLayout>
  );
}
