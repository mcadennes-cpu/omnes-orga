// src/pages/Immobilier.jsx
// Page liste du module Immobilier.
// - Garde de page : redirection vers / si remplacant.
// - Header sticky (titre, recherche locale).
// - Filtre segmente Actifs / Archives.
// - Liste plate de tiles, triees par last_activity_at desc (cote hook).
// - Etats : chargement (skeleton), vide, erreur.
// - Recherche locale sur titre + description, insensible casse + accents.
// - CTA "+ Nouveau tableau" : visible mais inerte en 10B-1 (cable en 10B-2).

import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Plus, Search, Filter, MessageSquare, MessageSquarePlus, Users, ChevronLeft } from 'lucide-react';
import AppLayout from '../components/layout/AppLayout';
import { useRole } from '../hooks/useRole';
import {
  canAccessImmobilier,
  canCreateImmobilierBoard,
} from '../lib/permissions';
import { normalizeForSearch } from '../lib/profileFormat';
import { useImmobilier } from '../features/immobilier/useImmobilier';
import ImmobilierBoardTile from '../features/immobilier/ImmobilierBoardTile';
import CreateBoardModal from '../features/immobilier/CreateBoardModal';
import { getBoardColorClasses } from '../features/immobilier/immobilierColors';
import HeaderWatermark from '../components/common/HeaderWatermark';

export default function Immobilier() {
  const { role, loading: roleLoading } = useRole();
  const navigate = useNavigate();
  const [showArchived, setShowArchived] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const { boards, loading, error } = useImmobilier({ showArchived });

  // Filtrage local sur titre + description, insensible casse et accents.
  const filteredBoards = useMemo(() => {
    if (!searchTerm.trim()) return boards;
    const needle = normalizeForSearch(searchTerm);
    return boards.filter((b) => {
      const hay = normalizeForSearch(
        `${b.titre || ''} ${b.description || ''}`
      );
      return hay.includes(needle);
    });
  }, [boards, searchTerm]);

  // Pendant que le role charge, on attend (evite un flash de redirect).
  if (roleLoading) {
    return (
      <AppLayout>
        <div className="px-4 py-6">
          <div className="text-body-m text-muted">Chargement...</div>
        </div>
      </AppLayout>
    );
  }

  // Garde de page : redirection vers /.
  if (!canAccessImmobilier(role)) {
    return <Navigate to="/" replace />;
  }

  const canCreate = canCreateImmobilierBoard(role);

  return (
    <AppLayout>
      {/* Header sticky */}
      <header className="sticky top-0 z-10 bg-fond/95 backdrop-blur-sm border-b border-border relative overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 relative z-10">
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label="Retour"
            className="h-9 w-9 flex items-center justify-center rounded-full shrink-0"
          >
            <ChevronLeft size={20} strokeWidth={2} className="text-marine" />
          </button>
          <h1 className="flex-1 font-display font-extrabold text-marine text-2xl">
            Immobilier
          </h1>
          {canCreate && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              aria-label="Creer un tableau"
              className="w-9 h-9 rounded-full bg-canard text-white
                         flex items-center justify-center
                         active:opacity-80 transition-opacity shrink-0"
            >
              <Plus className="w-5 h-5" strokeWidth={2.2} />
            </button>
          )}
        </div>

        {/* Barre de recherche */}
        <div className="px-4 pb-3 relative z-10">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4
                         text-faint pointer-events-none"
              strokeWidth={1.8}
            />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher un tableau..."
              className="w-full pl-9 pr-3 py-2.5 rounded-input bg-carte border
                         border-border text-marine text-sm placeholder:text-faint
                         focus:outline-none focus:ring-2 focus:ring-canard/30"
            />
          </div>
        </div>
        <HeaderWatermark color="canard" fill offsetRight={64} />
      </header>

      {/* Sous-header : compteur + filtre */}
      <div className="flex items-center justify-between px-4 py-2.5
                      text-muted text-xs uppercase tracking-wider">
        <span className="font-semibold">
          Mes tableaux
          {filteredBoards.length > 0 && (
            <span className="text-faint"> · {filteredBoards.length}</span>
          )}
        </span>
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className="inline-flex items-center gap-1 text-muted
                     hover:text-marine transition-colors"
        >
          <Filter className="w-3.5 h-3.5" strokeWidth={1.8} />
          {showArchived ? 'Archives' : 'Actifs'}
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
        ) : loading ? (
          <LoadingSkeleton />
        ) : filteredBoards.length === 0 ? (
          <EmptyState
            canCreate={canCreate}
            onCreate={() => setCreateOpen(true)}
            archivedView={showArchived}
            hasSearch={Boolean(searchTerm.trim())}
          />
        ) : (
          <ul className="divide-y divide-border">
            {filteredBoards.map((board) => (
              <li key={board.id}>
                <ImmobilierBoardTile board={board} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <CreateBoardModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </AppLayout>
  );
}

// ---------- Sous-composants locaux ----------

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

function EmptyState({ canCreate, onCreate, archivedView, hasSearch }) {
  if (hasSearch) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <p className="text-muted text-sm">
          Aucun tableau ne correspond a votre recherche.
        </p>
      </div>
    );
  }

  if (archivedView) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <p className="text-muted text-sm">Aucun tableau archive.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-14 h-14 rounded-tile bg-canard/15 flex items-center justify-center mb-4">
        <MessageSquarePlus className="w-7 h-7 text-canard" strokeWidth={1.8} />
      </div>
      <h2 className="font-display font-extrabold text-marine text-lg mb-2">
        Aucun tableau pour l'instant
      </h2>
      <p className="text-muted text-sm max-w-xs mb-5">
        {canCreate
          ? 'Creez un tableau pour rassembler les decisions d\'un projet immobilier : achat, travaux, bail...'
          : 'Vous serez invite dans un tableau par un associe ou un gerant pour participer aux decisions.'}
      </p>
      {canCreate && (
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full
                     bg-canard text-white font-semibold text-sm
                     active:opacity-80 transition-opacity"
        >
          <Plus className="w-4 h-4" strokeWidth={2.2} />
          Creer un tableau
        </button>
      )}
    </div>
  );
}
