// src/features/immobilier/ColorPicker.jsx
// Selecteur de couleur pour un tableau Immobilier.
// Affiche les 6 swatches DS en ligne, met en avant le swatch selectionne
// avec un anneau (ring) marine.

import {
  IMMOBILIER_BOARD_COLORS,
  BOARD_COLOR_CLASSES,
} from './immobilierColors';

export default function ColorPicker({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Couleur du tableau">
      <div className="flex gap-2 flex-wrap">
        {IMMOBILIER_BOARD_COLORS.map((couleur) => {
          const isSelected = value === couleur;
          const bgClass = BOARD_COLOR_CLASSES[couleur].bg;
          return (
            <button
              key={couleur}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`Couleur ${couleur}`}
              onClick={() => onChange(couleur)}
              className={`w-9 h-9 rounded-full ${bgClass}
                          ${isSelected ? 'ring-2 ring-offset-2 ring-marine' : ''}
                          transition-all`}
            />
          );
        })}
      </div>
    </div>
  );
}
