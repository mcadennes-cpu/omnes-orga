import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

type BottomSheetProps = {
  /**
   * Controle l'affichage. Optionnel : les modales du module sont souvent
   * montees conditionnellement (rendues seulement quand ouvertes), auquel cas
   * on laisse `open` indefini -> la feuille est visible tant qu'elle est montee.
   */
  open?: boolean;
  onClose: () => void;
  /** Titre centre dans le header. Si absent, aucun header n'est rendu. */
  title?: ReactNode;
  children: ReactNode;
  /** Contenu du pied de page (boutons d'action). Optionnel. */
  footer?: ReactNode;
  /** Largeur max de la feuille. Defaut `max-w-lg` (mobile-first) ; les ecrans
   *  coordinateur denses peuvent passer `max-w-2xl` / `max-w-3xl`. */
  maxWidthClass?: string;
  /** Pendant un envoi : neutralise la fermeture par Escape / clic exterieur. */
  busy?: boolean;
  ariaLabel?: string;
};

// Primitive de modale du module, reutilisee par toutes les modales.
// RESPONSIVE : feuille qui remonte du bas sur mobile (pattern tactile), et
// rectangle centre a coins arrondis sur ordinateur (>= md, ecrans coordinateur
// de Charlotte). Meme composant, deux presentations selon la taille d'ecran.
// Pattern mobile calque sur src/components/common/AvatarUploadModal.jsx.
export default function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidthClass = 'max-w-lg',
  busy = false,
  ariaLabel,
}: BottomSheetProps) {
  const isOpen = open !== false;

  // Scroll-lock du body + fermeture sur Escape (sauf pendant un envoi).
  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [isOpen, onClose, busy]);

  if (!isOpen) return null;

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !busy) onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-overlay md:items-center md:p-4"
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : ariaLabel}
    >
      <div
        className={`w-full ${maxWidthClass} max-h-[92vh] overflow-y-auto rounded-t-card bg-carte shadow-card animate-slide-up md:max-h-[85vh] md:rounded-card md:animate-none`}
      >
        {title && (
          <header className="sticky top-0 z-10 flex h-14 items-center justify-center border-b border-border bg-carte px-4">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="Fermer"
              className="absolute left-2 p-2 text-muted hover:text-ink disabled:opacity-50"
            >
              <X size={22} />
            </button>
            <h2 className="text-h2 text-ink">{title}</h2>
          </header>
        )}

        <div className="px-4 py-4 md:px-6">{children}</div>

        {footer && (
          <footer className="sticky bottom-0 flex gap-3 border-t border-border bg-carte px-4 py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
