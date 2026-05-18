import { formatDateBlock } from './eventDate'
import { getEventColorClasses } from './eventColors'

/**
 * Bloc-date carre affiche a gauche d'une carte evenement.
 * - Mono-jour : grand chiffre + mois abrege.
 * - Multi-jours (meme mois) : plage de jours compacte + mois.
 * - past=true : neutralise (fond et texte gris) ; la couleur disparait.
 */
export default function EventDateBlock({
  dateDebut,
  dateFin,
  couleur = 'marine',
  past = false,
}) {
  const { primary, secondary, multiDay } = formatDateBlock(dateDebut, dateFin)
  const palette = getEventColorClasses(couleur)

  const bgClass = past ? 'bg-marine/5' : palette.soft
  const textClass = past ? 'text-muted' : palette.softText

  return (
    <div
      className={`shrink-0 w-[60px] h-[60px] rounded-input flex flex-col items-center justify-center ${bgClass}`}
    >
      <span
        className={`font-display font-extrabold leading-none ${textClass} ${
          multiDay ? 'text-[15px]' : 'text-[22px]'
        }`}
      >
        {primary}
      </span>
      <span
        className={`mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${textClass}`}
      >
        {secondary}
      </span>
    </div>
  )
}
