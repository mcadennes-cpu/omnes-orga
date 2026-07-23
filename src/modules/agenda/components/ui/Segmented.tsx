import { ReactNode } from 'react';

type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  icon?: ReactNode;
};

type SegmentedProps<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
};

// Petit selecteur segmente a la charte Omnes (actif = canard plein, comme les
// onglets du header du module). Reutilise pour semaine/mois, filtre de site, etc.
export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className = '',
}: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex gap-1 rounded-pill bg-fond p-1 ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-button transition-colors ${
              active ? 'bg-canard text-white shadow-card' : 'text-muted hover:text-ink'
            }`}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
