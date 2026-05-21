// src/features/immobilier/EditBoardModal.jsx
// Modale d'edition d'un tableau : titre + description + couleur.
// Reservee aux owners (le parent affiche cette modale uniquement
// si canEdit est vrai, mais on vide les champs si non-owner par
// securite).

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import ColorPicker from './ColorPicker';

const MAX_TITRE = 80;
const MAX_DESCRIPTION = 500;

export default function EditBoardModal({ open, onClose, board }) {
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [couleur, setCouleur] = useState('canard');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && board) {
      setTitre(board.titre || '');
      setDescription(board.description || '');
      setCouleur(board.couleur || 'canard');
      setSubmitting(false);
      setError(null);
    }
  }, [open, board]);

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

  if (!open || !board) return null;

  const hasChanges =
    titre !== board.titre ||
    (description || '') !== (board.description || '') ||
    couleur !== board.couleur;
  const canSubmit = titre.trim().length > 0 && !submitting && hasChanges;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('immobilier_boards')
        .update({
          titre: titre.trim(),
          description: description.trim() || null,
          couleur,
        })
        .eq('id', board.id);
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
      aria-labelledby="edit-board-title"
    >
      <div
        className="w-full max-w-lg bg-carte rounded-t-card shadow-card
                   animate-slide-up max-h-[92vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-carte border-b border-border px-4 py-3
                        flex items-center justify-between">
          <h2 id="edit-board-title" className="text-h2 text-ink">
            Modifier le tableau
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
            <label htmlFor="edit-board-titre" className="text-field-label text-ink block mb-1">
              Titre <span className="text-brique">*</span>
            </label>
            <input
              id="edit-board-titre"
              type="text"
              value={titre}
              onChange={(e) => setTitre(e.target.value.slice(0, MAX_TITRE))}
              className="w-full px-3 py-2 bg-carte border border-border
                         rounded-input text-body-m text-ink
                         placeholder:text-faint
                         focus:outline-none focus:ring-2 focus:ring-canard"
              autoFocus
            />
            <p className="text-caption text-faint mt-1">{titre.length} / {MAX_TITRE}</p>
          </div>

          <div>
            <label htmlFor="edit-board-description" className="text-field-label text-ink block mb-1">
              Description
            </label>
            <textarea
              id="edit-board-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION))}
              className="w-full px-3 py-2 bg-carte border border-border
                         rounded-input text-body-m text-ink
                         placeholder:text-faint resize-none
                         focus:outline-none focus:ring-2 focus:ring-canard"
            />
            <p className="text-caption text-faint mt-1">{description.length} / {MAX_DESCRIPTION}</p>
          </div>

          <div>
            <label className="text-field-label text-ink block mb-2">
              Couleur
            </label>
            <ColorPicker value={couleur} onChange={setCouleur} />
          </div>

          {error && (
            <div className="bg-carte border border-brique rounded-input p-3">
              <p className="text-body-m text-brique">
                Erreur : {error.message}
              </p>
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
            {submitting ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
