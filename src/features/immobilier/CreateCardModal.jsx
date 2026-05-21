// src/features/immobilier/CreateCardModal.jsx
// Modale de creation d'une carte dans un tableau Immobilier.
// - Titre obligatoire (max 120 caracteres)
// - Description optionnelle (max 1000 caracteres)
// - Pas de RETURNING : UUID cote client (cf. lecons 10B-2)

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';

const MAX_TITRE = 120;
const MAX_DESCRIPTION = 1000;

export default function CreateCardModal({ open, onClose, boardId, onCreated }) {
  const { user } = useAuth();
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setTitre('');
      setDescription('');
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

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

  if (!open) return null;

  const canSubmit = titre.trim().length > 0 && !submitting && !!user;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const cardId = crypto.randomUUID();
      const { error: errInsert } = await supabase
        .from('immobilier_cards')
        .insert({
          id: cardId,
          board_id: boardId,
          titre: titre.trim(),
          description: description.trim() || null,
          auteur_id: user.id,
        });

      if (errInsert) throw errInsert;

      onCreated?.({ id: cardId });
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
      aria-labelledby="create-card-title"
    >
      <div
        className="w-full max-w-lg bg-carte rounded-t-card shadow-card
                   animate-slide-up max-h-[92vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-carte border-b border-border px-4 py-3
                        flex items-center justify-between">
          <h2 id="create-card-title" className="text-h2 text-ink">Nouvelle carte</h2>
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
            <label htmlFor="card-titre" className="text-field-label text-ink block mb-1">
              Titre <span className="text-brique">*</span>
            </label>
            <input
              id="card-titre"
              type="text"
              value={titre}
              onChange={(e) => setTitre(e.target.value.slice(0, MAX_TITRE))}
              placeholder="ex. Devis maconnerie"
              className="w-full px-3 py-2 bg-carte border border-border
                         rounded-input text-body-m text-ink
                         placeholder:text-faint
                         focus:outline-none focus:ring-2 focus:ring-canard"
              autoFocus
            />
            <p className="text-caption text-faint mt-1">{titre.length} / {MAX_TITRE}</p>
          </div>

          <div>
            <label htmlFor="card-description" className="text-field-label text-ink block mb-1">
              Description
            </label>
            <textarea
              id="card-description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION))}
              placeholder="Contexte, question, decision attendue..."
              className="w-full px-3 py-2 bg-carte border border-border
                         rounded-input text-body-m text-ink
                         placeholder:text-faint resize-none
                         focus:outline-none focus:ring-2 focus:ring-canard"
            />
            <p className="text-caption text-faint mt-1">{description.length} / {MAX_DESCRIPTION}</p>
          </div>

          {error && (
            <div className="bg-carte border border-brique rounded-input p-3">
              <p className="text-body-m text-brique">
                Erreur a la creation : {error.message}
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
            {submitting ? 'Creation...' : 'Creer'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
