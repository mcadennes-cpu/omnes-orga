// src/features/immobilier/BoardActionsMenu.jsx
// Bottom-sheet listant les actions disponibles sur un tableau,
// declenche par le bouton "..." du header. Filtre les actions
// selon les droits passes en props.

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Archive, ArchiveRestore, Users, Trash2 } from 'lucide-react';

export default function BoardActionsMenu({
  open,
  onClose,
  archive,           // booleen : le tableau est-il archive
  canEdit,           // peut renommer / changer couleur
  canArchive,        // peut archiver/desarchiver
  canManageMembers,  // peut gerer les participants
  canDelete,         // peut supprimer dur (super_admin)
  onRename,
  onToggleArchive,
  onManageMembers,
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
      key: 'rename',
      label: 'Modifier le tableau',
      icon: Pencil,
      onClick: onRename,
    });
  }
  if (canManageMembers) {
    items.push({
      key: 'members',
      label: 'Gerer les participants',
      icon: Users,
      onClick: onManageMembers,
    });
  }
  if (canArchive) {
    items.push({
      key: 'archive',
      label: archive ? 'Desarchiver' : 'Archiver',
      icon: archive ? ArchiveRestore : Archive,
      onClick: onToggleArchive,
    });
  }
  if (canDelete) {
    items.push({
      key: 'delete',
      label: 'Supprimer le tableau',
      icon: Trash2,
      onClick: onDelete,
      danger: true,
    });
  }

  // Si aucune action n'est dispo, on ne devrait meme pas etre la
  // (le parent masque le bouton "...") — garde de securite.
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
      aria-label="Actions du tableau"
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
