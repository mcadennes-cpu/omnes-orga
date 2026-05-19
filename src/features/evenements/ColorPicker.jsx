import { Check } from 'lucide-react'
import { EVENT_COLORS, getEventColorClasses } from './eventColors'

/**
 * Choix de la couleur d'identite d'un evenement parmi les 6 du design system.
 * Pastille selectionnee : anneau marine + leger agrandissement + coche.
 */
export default function ColorPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {EVENT_COLORS.map((couleur) => {
        const selected = couleur === value
        const { solid } = getEventColorClasses(couleur)
        return (
          <button
            key={couleur}
            type="button"
            onClick={() => onChange(couleur)}
            aria-label={`Couleur : ${couleur}`}
            aria-pressed={selected}
            className={`relative w-9 h-9 rounded-full ${solid} flex items-center justify-center transition-transform ${
              selected
                ? 'ring-2 ring-marine ring-offset-2 ring-offset-carte scale-110'
                : 'active:scale-95'
            }`}
          >
            {selected && (
              <Check className="w-4 h-4 text-white" strokeWidth={2.6} />
            )}
          </button>
        )
      })}
    </div>
  )
}
