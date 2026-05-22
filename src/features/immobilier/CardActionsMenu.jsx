// src/features/immobilier/CardActionsMenu.jsx
// Bottom-sheet des actions sur la carte courante.
// Calque sur BoardActionsMenu mais pour les actions de carte :
// modifier / clore-rouvrir / supprimer.

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Lock, Unlock, Trash2 } from 'lucide-react';

export default function CardActionsMenu({
  open,
  onClose,
  isClosed,    // booleen : la carte est-elle close
  canEdit,
  canDelete,
  onEdit,
  onToggleStatus,
  onDelete,
}) {
  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const items = [];
  if (canEdit) {
    items.push({
      key: 'edit',
      label: 'Modifier la carte',
      icon: Pencil,
      onClick: onEdit,
    });
    items.push({
      key: 'toggle',
      label: isClosed ? 'Rouvrir la carte' : 'Clore la carte',
      icon: isClosed ? Unlock : Lock,
      onClick: onToggleStatus,
    });
  }
  if (canDelete) {
    items.push({
      key: 'delete',
      label: 'Supprimer la carte',
      icon: Trash2,
      onClick: onDelete,
      danger: true,
    });
  }

  if (items.length === 0) return null;

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-marine/40 backdrop-blur-sm"
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Actions de la carte"
    >
      <div className="bg-carte rounded-t-2xl shadow-2xl animate-slide-up">
        <div className="pt-3 pb-1 flex justify-center">
          <div className="w-9 h-1 rounded-full bg-marine/18" />
        </div>
        <div className="px-2 py-2">
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <button
                key={it.key}
                type="button"
                onClick={() => {
                  onClose();
                  it.onClick?.();
                }}
                className={`w-full flex items-center gap-3 px-4 py-3
                            rounded-input text-left text-body-m
                            ${it.danger
                              ? 'text-brique hover:bg-brique/10'
                              : 'text-ink hover:bg-fond'}`}
              >
                <Icon size={20} aria-hidden="true" />
                <span>{it.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
