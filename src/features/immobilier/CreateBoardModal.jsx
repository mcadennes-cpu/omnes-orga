// src/features/immobilier/CreateBoardModal.jsx
// Modale bottom-sheet pour creer un tableau Immobilier.
// - Titre (obligatoire, max 80 caracteres)
// - Description (optionnelle, max 500 caracteres)
// - ColorPicker (default canard)
// - MemberPicker (invites multi-select, sans remplacants ni soi-meme)
// - Submit : INSERT immobilier_boards puis INSERT immobilier_board_members
//   (soi-meme en owner, invites en member).
//
// Pas de transaction Postgres cote client : si l'INSERT board_members
// echoue apres un INSERT board reussi, le tableau existe mais sans
// invites. C'est acceptable (l'utilisateur peut inviter plus tard) et
// coherent avec le pattern Discussion.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { notifyUsers } from '../../lib/notify';
import ColorPicker from './ColorPicker';
import MemberPicker from './MemberPicker';
import { IMMOBILIER_ACCENT } from './immobilierColors';

const MAX_TITRE = 80;
const MAX_DESCRIPTION = 500;

export default function CreateBoardModal({ open, onClose, onCreated }) {
  const { user, loading: authLoading } = useAuth();
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [couleur, setCouleur] = useState(IMMOBILIER_ACCENT);
  const [memberIds, setMemberIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Reset a chaque ouverture
  useEffect(() => {
    if (open) {
      setTitre('');
      setDescription('');
      setCouleur(IMMOBILIER_ACCENT);
      setMemberIds([]);
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  // Echap pour fermer + verrouillage du scroll du body
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, submitting]);

  if (!open) return null;

  const canSubmit = titre.trim().length > 0 && !submitting && !!user;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      // 1) INSERT du tableau.
      // Note : on genere l'UUID cote client (au lieu de RETURNING)
      // pour eviter un probleme de RLS SELECT sur la ligne tout juste creee.
      // Le trigger add_immobilier_board_creator_as_owner inscrit
      // automatiquement l'auteur en owner.
      const boardId = crypto.randomUUID();
      const { error: errBoard } = await supabase
        .from('immobilier_boards')
        .insert({
          id: boardId,
          titre: titre.trim(),
          description: description.trim() || null,
          couleur,
          auteur_id: user.id,
        });

      if (errBoard) throw errBoard;

      // 2) INSERT des invites en member.
      // L'auteur est ajoute automatiquement en owner par le trigger
      // add_immobilier_board_creator_as_owner.
      if (memberIds.length > 0) {
        const members = memberIds.map((id) => ({
          board_id: boardId,
          user_id: id,
          role_in_board: 'member',
        }));

        const { error: errMembers } = await supabase
          .from('immobilier_board_members')
          .insert(members);

        if (errMembers) throw errMembers;
      }

      // Notifier les invites (fire-and-forget).
      if (memberIds.length > 0) {
        notifyUsers({
          userIds: memberIds,
          title: titre.trim(),
          body: 'Vous avez été invité à ce tableau.',
          url: `/immobilier/${boardId}`,
        });
      }

      // Succes : on referme et on previent le parent
      onCreated?.({ id: boardId });
      onClose();
    } catch (err) {
      setError(err);
      setSubmitting(false);
    }
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget && !submitting) onClose();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-overlay"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-board-title"
    >
      <div
        className="w-full max-w-lg bg-carte rounded-t-card shadow-card
                   animate-slide-up max-h-[92vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-carte border-b border-border px-4 py-3
                        flex items-center justify-between">
          <h2 id="create-board-title" className="text-h2 text-ink">
            Nouveau tableau
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-1 text-muted hover:text-ink disabled:opacity-50"
            aria-label="Fermer"
          >
            <X size={22} />
          </button>
        </div>

        {/* Corps */}
        <div className="px-4 py-4 space-y-4">
          {/* Titre */}
          <div>
            <label htmlFor="board-titre" className="text-field-label text-ink block mb-1">
              Titre <span className="text-brique">*</span>
            </label>
            <input
              id="board-titre"
              type="text"
              value={titre}
              onChange={(e) => setTitre(e.target.value.slice(0, MAX_TITRE))}
              placeholder="ex. Acquisition local 12 rue X"
              className="w-full px-3 py-2 bg-carte border border-border
                         rounded-input text-body-m text-ink
                         placeholder:text-faint
                         focus:outline-none focus:ring-2 focus:ring-canard"
              autoFocus
            />
            <p className="text-caption text-faint mt-1">
              {titre.length} / {MAX_TITRE}
            </p>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="board-description" className="text-field-label text-ink block mb-1">
              Description
            </label>
            <textarea
              id="board-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION))}
              placeholder="Objectif du tableau (optionnel)"
              className="w-full px-3 py-2 bg-carte border border-border
                         rounded-input text-body-m text-ink
                         placeholder:text-faint resize-none
                         focus:outline-none focus:ring-2 focus:ring-canard"
            />
            <p className="text-caption text-faint mt-1">
              {description.length} / {MAX_DESCRIPTION}
            </p>
          </div>

          {/* Couleur */}
          <div>
            <label className="text-field-label text-ink block mb-2">
              Couleur
            </label>
            <ColorPicker value={couleur} onChange={setCouleur} />
          </div>

          {/* Participants */}
          <div>
            <label className="text-field-label text-ink block mb-2">
              Participants
            </label>
            {authLoading || !user ? (
              <p className="text-body-m text-muted">Chargement...</p>
            ) : (
              <MemberPicker
                currentUserId={user.id}
                selectedIds={memberIds}
                onChange={setMemberIds}
              />
            )}
          </div>

          {/* Erreur */}
          {error && (
            <div className="bg-carte border border-brique rounded-input p-3">
              <p className="text-body-m text-brique">
                Erreur a la creation : {error.message}
              </p>
            </div>
          )}
        </div>

        {/* Footer sticky */}
        <div className="sticky bottom-0 bg-carte border-t border-border
                        px-4 py-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-button text-muted rounded-input
                       hover:bg-fond disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-2 text-button text-white bg-marine
                       rounded-input shadow-button
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Creation...' : 'Creer'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
