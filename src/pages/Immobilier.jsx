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
import { Navigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
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

export default function Immobilier() {
  const { role, loading: roleLoading } = useRole();
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
      <div className="sticky top-0 z-10 bg-fond border-b border-border">
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <h1 className="text-h1 text-canard">Immobilier</h1>
            {canCreate && (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-2
                           bg-canard text-white text-button rounded-input
                           shadow-button"
                onClick={() => setCreateOpen(true)}
                aria-label="Nouveau tableau"
              >
                <Plus size={18} aria-hidden="true" />
                <span>Nouveau</span>
              </button>
            )}
          </div>

          {/* Barre de recherche */}
          <div className="relative mt-3">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher un tableau..."
              className="w-full pl-10 pr-3 py-2 bg-carte border border-border
                         rounded-input text-body-m text-ink
                         placeholder:text-faint
                         focus:outline-none focus:ring-2 focus:ring-canard"
            />
          </div>

          {/* Filtre segmente Actifs / Archives */}
          <div className="mt-3 inline-flex bg-carte rounded-pill p-1 border border-border">
            <button
              type="button"
              onClick={() => setShowArchived(false)}
              className={`px-3 py-1 text-button rounded-pill transition-colors ${
                !showArchived
                  ? 'bg-marine text-white'
                  : 'text-muted'
              }`}
            >
              Actifs
            </button>
            <button
              type="button"
              onClick={() => setShowArchived(true)}
              className={`px-3 py-1 text-button rounded-pill transition-colors ${
                showArchived
                  ? 'bg-marine text-white'
                  : 'text-muted'
              }`}
            >
              Archives
            </button>
          </div>
        </div>
      </div>

      {/* Contenu */}
      <div className="px-4 py-4 space-y-3">
        {error && (
          <div className="bg-carte border border-brique rounded-card p-4">
            <p className="text-body-m text-brique">
              Erreur de chargement : {error.message}
            </p>
          </div>
        )}

        {loading && !error && (
          <ListSkeleton />
        )}

        {!loading && !error && filteredBoards.length === 0 && (
          <EmptyState
            showArchived={showArchived}
            hasSearch={searchTerm.trim().length > 0}
            canCreate={canCreate}
          />
        )}

        {!loading && !error && filteredBoards.length > 0 && (
          <div className="space-y-3">
            {filteredBoards.map((board) => (
              <ImmobilierBoardTile key={board.id} board={board} />
            ))}
          </div>
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

function ListSkeleton() {
  return (
    <div className="space-y-3" aria-label="Chargement">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="bg-carte rounded-card border border-border h-20
                     animate-pulse"
        />
      ))}
    </div>
  );
}

function EmptyState({ showArchived, hasSearch, canCreate }) {
  let title;
  let body;

  if (hasSearch) {
    title = 'Aucun resultat';
    body = 'Aucun tableau ne correspond a votre recherche.';
  } else if (showArchived) {
    title = 'Aucun tableau archive';
    body = 'Les tableaux que vous archivez apparaitront ici.';
  } else {
    title = 'Aucun tableau';
    body = canCreate
      ? 'Creez un premier tableau pour suivre un projet immobilier.'
      : 'Vous n\'avez ete invite a aucun tableau pour le moment.';
  }

  return (
    <div className="bg-carte rounded-card border border-border p-8 text-center">
      <h2 className="text-h2 text-ink">{title}</h2>
      <p className="text-body-m text-muted mt-2">{body}</p>
    </div>
  );
}
