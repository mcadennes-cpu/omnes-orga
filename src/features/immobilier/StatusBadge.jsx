// src/features/immobilier/StatusBadge.jsx
// Petit badge "Ouvert" (canard) ou "Clos" (gris faint) pour une carte.

export default function StatusBadge({ statut }) {
  const isOpen = statut === 'ouvert';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-pill text-caption
                  ${isOpen
                    ? 'bg-canard/10 text-canard'
                    : 'bg-fond text-faint'
                  }`}
    >
      {isOpen ? 'Ouvert' : 'Clos'}
    </span>
  );
}
