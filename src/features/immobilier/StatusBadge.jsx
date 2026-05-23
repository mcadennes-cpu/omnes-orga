// src/features/immobilier/StatusBadge.jsx
// Pastille de statut d'une carte Immobilier : "Ouvert" (canard) ou "Clos" (gris).
// Couleurs fixes, independantes de la couleur du tableau.
// Pattern aligne sur Discussion (dot + label, sans fond).

export default function StatusBadge({ statut, size = 'sm' }) {
  const isOpen = statut === 'ouvert';
  const textSize = size === 'md' ? 'text-xs' : 'text-[10px]';
  return (
    <span
      className={`inline-flex items-center gap-1 ${textSize} font-bold uppercase tracking-wide ${
        isOpen ? 'text-canard' : 'text-muted'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${isOpen ? 'bg-canard' : 'bg-muted'}`}
        aria-hidden="true"
      />
      {isOpen ? 'Ouvert' : 'Clos'}
    </span>
  );
}
