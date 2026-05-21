// src/features/immobilier/EditCardModal.jsx
// Modale d'edition legere d'une carte Immobilier.
// - Modifier titre + description
// - Bouton clore / rouvrir
// - Bouton supprimer (avec confirmation inline)
// Visible aux droits : createur de la carte, owner du tableau, super_admin.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Lock, Unlock, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { useRole } from '../../hooks/useRole';
import {
  canEditImmobilierCard,
  canDeleteImmobilierCard,
} from '../../lib/permissions';

const MAX_TITRE = 120;
const MAX_DESCRIPTION = 1000;

export default function EditCardModal({ open, onClose, card, ownerIds }) {
  const { user } = useAuth();
  const { role } = useRole();

  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open && card) {
      setTitre(card.titre || '');
      setDescription(card.description || '');
      setSubmitting(false);
      setError(null);
      setConfirmDelete(false);
    }
  }, [open, card]);

  useEffect(() => {
    if (!open) return;
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

  if (!open || !card) return null;

  const canEdit = canEditImmobilierCard({
    role,
    currentUserId: user?.id,
    auteurId: card.auteur_id,
    ownerIds,
  });
  const canDelete = canDeleteImmobilierCard({
    role,
    currentUserId: user?.id,
    auteurId: card.auteur_id,
    ownerIds,
  });

  const isClosed = card.statut === 'clos';
  const canSubmit =
    canEdit &&
    titre.trim().length > 0 &&
    !submitting &&
    (titre !== card.titre || (description || '') !== (card.description || ''));

  async function handleSave() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('immobilier_cards')
        .update({
          titre: titre.trim(),
          description: description.trim() || null,
        })
        .eq('id', card.id);
      if (err) throw err;
      onClose();
    } catch (err) {
      setError(err);
      setSubmitting(false);
    }
  }

  async function handleToggleStatut() {
    if (!canEdit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('immobilier_cards')
        .update({ statut: isClosed ? 'ouvert' : 'clos' })
        .eq('id', card.id);
      if (err) throw err;
      onClose();
    } catch (err) {
      setError(err);
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!canDelete || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('immobilier_cards')
        .delete()
        .eq('id', card.id);
      if (err) throw err;
      onClose();
    } catch (err) {
      setError(err);
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
      aria-labelledby="edit-card-title"
    >
      <div
        className="w-full max-w-lg bg-carte rounded-t-card shadow-card
                   animate-slide-up max-h-[92vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-carte border-b border-border px-4 py-3
                        flex items-center justify-between">
          <h2 id="edit-card-title" className="text-h2 text-ink">
            {canEdit ? 'Modifier la carte' : 'Carte'}
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

        <div className="px-4 py-4 space-y-4">
          <div>
            <label htmlFor="edit-card-titre" className="text-field-label text-ink block mb-1">
              Titre <span className="text-brique">*</span>
            </label>
            <input
              id="edit-card-titre"
              type="text"
              value={titre}
              onChange={(e) => setTitre(e.target.value.slice(0, MAX_TITRE))}
              disabled={!canEdit || submitting}
              className="w-full px-3 py-2 bg-carte border border-border
                         rounded-input text-body-m text-ink
                         placeholder:text-faint
                         focus:outline-none focus:ring-2 focus:ring-canard
                         disabled:bg-fond disabled:cursor-not-allowed"
            />
            <p className="text-caption text-faint mt-1">{titre.length} / {MAX_TITRE}</p>
          </div>

          <div>
            <label htmlFor="edit-card-description" className="text-field-label text-ink block mb-1">
              Description
            </label>
            <textarea
              id="edit-card-description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION))}
              disabled={!canEdit || submitting}
              className="w-full px-3 py-2 bg-carte border border-border
                         rounded-input text-body-m text-ink
                         placeholder:text-faint resize-none
                         focus:outline-none focus:ring-2 focus:ring-canard
                         disabled:bg-fond disabled:cursor-not-allowed"
            />
            <p className="text-caption text-faint mt-1">{description.length} / {MAX_DESCRIPTION}</p>
          </div>

          {/* Actions clore / supprimer */}
          {(canEdit || canDelete) && (
            <div className="border-t border-border pt-3 space-y-2">
              {canEdit && (
                <button
                  type="button"
                  onClick={handleToggleStatut}
                  disabled={submitting}
                  className="w-full flex items-center gap-2 px-3 py-2
                             bg-fond rounded-input text-body-m text-ink
                             hover:bg-border disabled:opacity-50"
                >
                  {isClosed ? <Unlock size={18} /> : <Lock size={18} />}
                  <span>{isClosed ? 'Rouvrir la carte' : 'Clore la carte'}</span>
                </button>
              )}
              {canDelete && !confirmDelete && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  disabled={submitting}
                  className="w-full flex items-center gap-2 px-3 py-2
                             text-body-m text-brique rounded-input
                             hover:bg-brique/10 disabled:opacity-50"
                >
                  <Trash2 size={18} />
                  <span>Supprimer la carte</span>
                </button>
              )}
              {canDelete && confirmDelete && (
                <div className="bg-brique/10 border border-brique rounded-input p-3 space-y-2">
                  <p className="text-body-m text-brique">
                    Supprimer definitivement cette carte ?
                  </p>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      disabled={submitting}
                      className="px-3 py-1 text-button text-muted rounded-input"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={submitting}
                      className="px-3 py-1 text-button text-white bg-brique
                                 rounded-input disabled:opacity-50"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="bg-carte border border-brique rounded-input p-3">
              <p className="text-body-m text-brique">Erreur : {error.message}</p>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-carte border-t border-border
                        px-4 py-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-button text-muted rounded-input
                       hover:bg-fond disabled:opacity-50"
          >
            Fermer
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSubmit}
              className="px-4 py-2 text-button text-white bg-marine
                         rounded-input shadow-button
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
