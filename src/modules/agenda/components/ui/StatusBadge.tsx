import { AgendaStatusKey, STATUS_STYLES } from '../../lib/statusStyles';

type StatusBadgeProps = {
  status: AgendaStatusKey;
  /** Remplace le libelle par defaut (ex. "3 demandes"). */
  label?: string;
  className?: string;
};

// Badge de statut a la charte Omnes. Unique consommateur du markup de badge :
// les vues n'ont plus a le reecrire, elles passent juste la cle de statut.
export default function StatusBadge({ status, label, className = '' }: StatusBadgeProps) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center rounded-pill border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] ${style.badgeClass} ${className}`}
    >
      {label ?? style.label}
    </span>
  );
}
