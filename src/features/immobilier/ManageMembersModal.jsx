// src/features/immobilier/ManageMembersModal.jsx
// Modale bottom-sheet pour gerer les participants d'un tableau.
// - Liste des membres actuels avec actions (desinviter, quitter)
// - Section pour inviter de nouveaux participants
// Garde-fou (option β) : empeche de retirer le dernier owner.

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, UserMinus, UserPlus, Crown } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { initials, formatName } from '../../lib/profileFormat';
import MemberPicker from './MemberPicker';

export default function ManageMembersModal({
  open,
  onClose,
  board,
  members,
  ownerIds,
  onChanged,    // appelle par le parent pour refetch apres mutation
  canManage,    // true si l'user peut inviter/desinviter (owner ou super_admin)
}) {
  const { user } = useAuth();
  const [selectedIds, setSelectedIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setSelectedIds([]);
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e) {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, submitting]);

  // IDs des membres existants : memoisation pour eviter le re-fetch
  // en boucle dans MemberPicker.
  const existingMemberIds = useMemo(
    () => members.map((m) => m.user_id),
    [members]
  );

  if (!open || !board) return null;

  const ownerCount = ownerIds.length;
  const isCurrentUserOwner = ownerIds.includes(user?.id);
  const isCurrentUserMember = existingMemberIds.includes(user?.id);

  // Garde-fou : un user est-il l'unique owner ?
  function isLastOwner(userId) {
    return ownerIds.includes(userId) && ownerCount === 1;
  }

  async function handleInvite() {
    if (selectedIds.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const rows = selectedIds.map((id) => ({
        board_id: board.id,
        user_id: id,
        role_in_board: 'member',
      }));
      const { error: err } = await supabase
        .from('immobilier_board_members')
        .insert(rows);
      if (err) throw err;
      setSelectedIds([]);
      onChanged?.();
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(memberUserId) {
    if (submitting) return;
    if (isLastOwner(memberUserId)) {
      // Garde-fou cote UI (en plus de la RLS qui ne le bloque pas).
      // eslint-disable-next-line no-alert
      alert(
        "Impossible : c'est le seul owner du tableau. Demandez au super_admin de designer un autre gestionnaire."
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('immobilier_board_members')
        .delete()
        .eq('board_id', board.id)
        .eq('user_id', memberUserId);
      if (err) throw err;
      onChanged?.();

      // Si l'user vient de quitter le tableau, fermer la modale —
      // la garde de page redirigera via notMember.
      if (memberUserId === user?.id) {
        onClose();
      }
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget && !submitting) onClose();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-overlay"
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="manage-members-title"
    >
      <div
        className="w-full max-w-lg bg-carte rounded-t-card shadow-card
                   animate-slide-up max-h-[92vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-carte border-b border-border px-4 py-3
                        flex items-center justify-between">
          <h2 id="manage-members-title" className="text-h2 text-ink">
            Participants
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

        <div className="px-4 py-4 space-y-5">

          {/* Liste des membres actuels */}
          <section>
            <h3 className="text-eyebrow text-muted mb-2">
              Membres ({members.length})
            </h3>
            <div className="space-y-1">
              {members.map((m) => {
                const profile = m.profile;
                if (!profile) return null;
                const isOwner = m.role_in_board === 'owner';
                const isSelf = m.user_id === user?.id;
                const canRemove = canManage || isSelf;
                const blocked = isLastOwner(m.user_id);

                return (
                  <div
                    key={m.user_id}
                    className="flex items-center gap-3 px-3 py-2 rounded-input
                               hover:bg-fond"
                  >
                    <div className="w-9 h-9 rounded-full bg-canard text-white
                                    flex items-center justify-center
                                    text-button flex-shrink-0">
                      {initials(profile)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-body-m text-ink truncate">
                          {formatName(profile)}
                          {isSelf && (
                            <span className="text-caption text-faint ml-1">
                              (vous)
                            </span>
                          )}
                        </p>
                        {isOwner && (
                          <span className="inline-flex items-center gap-1
                                           px-2 py-0.5 rounded-pill
                                           bg-ocre/10 text-ocre text-caption">
                            <Crown size={12} aria-hidden="true" />
                            Owner
                          </span>
                        )}
                      </div>
                      {profile.specialite && (
                        <p className="text-caption text-muted truncate">
                          {profile.specialite}
                        </p>
                      )}
                    </div>
                    {canRemove && !blocked && (
                      <button
                        type="button"
                        onClick={() => handleRemove(m.user_id)}
                        disabled={submitting}
                        className="p-2 text-muted hover:text-brique
                                   rounded-pill hover:bg-brique/10
                                   disabled:opacity-50"
                        aria-label={isSelf ? 'Quitter le tableau' : 'Desinviter'}
                        title={isSelf ? 'Quitter le tableau' : 'Desinviter'}
                      >
                        <UserMinus size={18} />
                      </button>
                    )}
                    {blocked && isSelf && (
                      <span className="text-caption text-faint italic">
                        seul owner
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {isCurrentUserMember && isCurrentUserOwner && ownerCount === 1 && (
              <p className="text-caption text-muted mt-2 italic">
                Vous etes l'unique owner — vous ne pouvez pas quitter le tableau.
                Demandez au super_admin de designer un autre gestionnaire.
              </p>
            )}
          </section>

          {/* Inviter de nouveaux participants */}
          {canManage && (
            <section className="border-t border-border pt-4">
              <h3 className="text-eyebrow text-muted mb-2">
                Inviter de nouveaux participants
              </h3>
              <MemberPicker
                currentUserId={user?.id}
                selectedIds={selectedIds}
                onChange={setSelectedIds}
                excludeIds={existingMemberIds}
              />
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={handleInvite}
                  disabled={submitting}
                  className="mt-3 w-full inline-flex items-center justify-center
                             gap-2 px-4 py-2 bg-marine text-white text-button
                             rounded-input shadow-button
                             disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <UserPlus size={18} aria-hidden="true" />
                  <span>
                    {submitting
                      ? 'Invitation...'
                      : `Inviter ${selectedIds.length} participant${selectedIds.length > 1 ? 's' : ''}`}
                  </span>
                </button>
              )}
            </section>
          )}

          {error && (
            <div className="bg-carte border border-brique rounded-input p-3">
              <p className="text-body-m text-brique">
                Erreur : {error.message}
              </p>
            </div>
          )}
        </div>

        {/* Footer simple */}
        <div className="sticky bottom-0 bg-carte border-t border-border
                        px-4 py-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-button text-muted rounded-input
                       hover:bg-fond disabled:opacity-50"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
