import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, Search, Loader2 } from 'lucide-react';
import { useMedecins } from '../../hooks/useMedecins';
import { formatName, initials, normalizeForSearch } from '../../lib/profileFormat';

// ----------------------------------------------------------------------------
// Constantes
// ----------------------------------------------------------------------------

const COLORS = [
  { id: 'brique',  label: 'Brique',  swatch: 'bg-brique' },
  { id: 'canard',  label: 'Canard',  swatch: 'bg-canard' },
  { id: 'ocre',    label: 'Ocre',    swatch: 'bg-ocre' },
  { id: 'olive',   label: 'Olive',   swatch: 'bg-olive' },
  { id: 'fuchsia', label: 'Fuchsia', swatch: 'bg-fuchsia' },
  { id: 'marine',  label: 'Marine',  swatch: 'bg-marine' },
];

const TITLE_MAX = 80;
const DESCRIPTION_MAX = 280;

// ----------------------------------------------------------------------------
// Composant principal
// ----------------------------------------------------------------------------

export default function CreateBoardModal({ open, onClose, onCreate, currentUserId }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('brique');
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Reset complet a la fermeture
  useEffect(() => {
    if (!open) {
      setTitle('');
      setDescription('');
      setColor('brique');
      setSelectedMemberIds([]);
      setSubmitting(false);
      setSubmitError(null);
    }
  }, [open]);

  // Bloquer scroll du body quand modale ouverte
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Fermeture sur Escape
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, submitting, onClose]);

  const trimmedTitle = title.trim();
  const canSubmit = trimmedTitle.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onCreate({
        title: trimmedTitle,
        description: description.trim() || null,
        color,
        memberIds: selectedMemberIds,
      });
      onClose();
    } catch (err) {
      console.error('[CreateBoardModal] submit error:', err);
      setSubmitError(err?.message || 'Une erreur est survenue.');
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Créer un nouveau tableau"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Fermer"
        onClick={() => !submitting && onClose()}
        className="absolute inset-0 bg-marine/40 backdrop-blur-sm"
      />

      {/* Sheet */}
      <div className="relative bg-carte rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col animate-slide-up">
        {/* Poignée de drag (visuelle pour V1) */}
        <div className="pt-3 pb-1 flex justify-center">
          <div className="w-9 h-1 rounded-full bg-marine/18" />
        </div>

        {/* Header */}
        <div className="px-4 pt-2 pb-3 flex items-center justify-between border-b border-border">
          <h2 className="font-display font-extrabold text-marine text-lg">
            Nouveau tableau
          </h2>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            aria-label="Fermer"
            disabled={submitting}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:bg-fond active:bg-fond transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" strokeWidth={1.8} />
          </button>
        </div>

        {/* Body scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {/* Titre */}
          <div>
            <label className="block text-muted text-xs uppercase tracking-wider font-semibold mb-2">
              Titre
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
              placeholder="Ex. Achat échographe"
              autoFocus={false}
              className="w-full px-3 py-2.5 rounded-input bg-fond border border-border text-marine text-sm placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-canard/30"
            />
            <div className="text-faint text-[11px] mt-1 text-right">
              {title.length}/{TITLE_MAX}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-muted text-xs uppercase tracking-wider font-semibold mb-2">
              Description <span className="text-faint normal-case font-normal">(optionnel)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
              rows={2}
              placeholder="À quoi va servir ce tableau ?"
              className="w-full px-3 py-2.5 rounded-input bg-fond border border-border text-marine text-sm placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-canard/30 resize-none"
            />
          </div>

          {/* Couleur */}
          <div>
            <label className="block text-muted text-xs uppercase tracking-wider font-semibold mb-2">
              Couleur
            </label>
            <ColorPicker value={color} onChange={setColor} />
          </div>

          {/* Membres */}
          <div>
            <label className="block text-muted text-xs uppercase tracking-wider font-semibold mb-2">
              Participants{' '}
              {selectedMemberIds.length > 0 && (
                <span className="text-faint normal-case font-normal">
                  · {selectedMemberIds.length} sélectionné{selectedMemberIds.length > 1 ? 's' : ''}
                </span>
              )}
            </label>
            <MemberPicker
              currentUserId={currentUserId}
              selectedIds={selectedMemberIds}
              onChange={setSelectedMemberIds}
            />
          </div>

          {/* Erreur */}
          {submitError && (
            <div className="px-3 py-2 rounded-input bg-brique/10 text-brique text-sm">
              {submitError}
            </div>
          )}
        </div>

        {/* Footer sticky */}
        <div className="px-4 py-3 border-t border-border bg-carte flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            className="px-4 py-2.5 rounded-full text-muted font-semibold text-sm hover:text-marine disabled:opacity-50 transition-colors"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-brique text-white font-semibold text-sm disabled:opacity-40 active:opacity-80 transition-opacity"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.2} />}
            Créer le tableau
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ----------------------------------------------------------------------------
// Sous-composant : ColorPicker
// ----------------------------------------------------------------------------

function ColorPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLORS.map((c) => {
        const selected = c.id === value;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            aria-label={`Couleur ${c.label}`}
            aria-pressed={selected}
            className={`relative w-10 h-10 rounded-full ${c.swatch} flex items-center justify-center transition-transform ${
              selected ? 'ring-2 ring-marine ring-offset-2 ring-offset-carte scale-105' : 'active:scale-95'
            }`}
          >
            {selected && <Check className="w-5 h-5 text-white" strokeWidth={2.4} />}
          </button>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Sous-composant : MemberPicker
// ----------------------------------------------------------------------------

function MemberPicker({ currentUserId, selectedIds, onChange }) {
  const { medecins, loading: isLoading, error } = useMedecins();
  const [searchTerm, setSearchTerm] = useState('');

  // useMedecins filtre deja actif=true et nom non vide ; on retire juste
  // l'utilisateur courant (il sera ajoute automatiquement comme owner).
  const profiles = useMemo(
    () => medecins.filter((p) => p.id !== currentUserId),
    [medecins, currentUserId]
  );

  const filtered = useMemo(() => {
    const term = normalizeForSearch(searchTerm).trim();
    if (!term) return profiles;
    return profiles.filter((p) =>
      normalizeForSearch(formatName(p)).includes(term)
    );
  }, [profiles, searchTerm]);

  const toggle = (id) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  if (isLoading) {
    return (
      <div className="py-4 flex items-center gap-2 text-muted text-sm">
        <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.8} />
        Chargement des membres…
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-3 text-muted text-sm">
        Impossible de charger la liste des membres.
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <div className="py-3 text-muted text-sm">
        Aucun autre utilisateur dans le cabinet.
      </div>
    );
  }

  return (
    <div className="border border-border rounded-input bg-fond overflow-hidden">
      {/* Recherche */}
      <div className="relative border-b border-border">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none"
          strokeWidth={1.8}
        />
        <input
          type="search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Rechercher un participant…"
          className="w-full pl-9 pr-3 py-2 bg-transparent text-marine text-sm placeholder:text-faint focus:outline-none"
        />
      </div>

      {/* Liste */}
      <div className="max-h-56 overflow-y-auto divide-y divide-border">
        {filtered.length === 0 ? (
          <div className="px-3 py-3 text-faint text-xs">Aucun résultat.</div>
        ) : (
          filtered.map((p) => {
            const checked = selectedIds.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className="w-full px-3 py-2 flex items-center gap-3 hover:bg-carte active:bg-carte transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-full bg-canard/15 text-canard flex items-center justify-center font-semibold text-xs">
                  {initials(p)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-marine text-sm truncate">{formatName(p)}</div>
                </div>
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    checked ? 'border-brique bg-brique' : 'border-border bg-carte'
                  }`}
                  aria-hidden
                >
                  {checked && <Check className="w-3 h-3 text-white" strokeWidth={2.6} />}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
