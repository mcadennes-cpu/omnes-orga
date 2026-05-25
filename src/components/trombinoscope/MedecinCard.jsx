import { Phone, Calendar } from 'lucide-react'
import { getAvatarPalette } from '../../lib/avatarColor'

function getInitials(prenom, nom) {
  const p = (prenom ?? '').trim().charAt(0).toUpperCase()
  const n = (nom ?? '').trim().charAt(0).toUpperCase()
  return `${p}${n}` || '?'
}

export default function MedecinCard({
  medecin,
  canViewNotes = false,
  canViewSchedule = false,
}) {
  const {
    prenom,
    nom,
    specialite,
    telephone,
    jours_disponibles,
    photo_url,
    notes_internes,
  } = medecin

  const fullName = [prenom, nom].filter(Boolean).join(' ').trim()
  const initials = getInitials(prenom, nom)
  const showNotes =
    canViewNotes && notes_internes && notes_internes.trim() !== ''
  const avatar = getAvatarPalette(`${prenom} ${nom}`)

  return (
    <article className="bg-carte border border-border rounded-card shadow-card p-[14px] flex flex-col gap-3">
      {/* Ligne identite : avatar + nom + spe + jours */}
      <div className="flex items-start gap-3.5">
        {photo_url ? (
          <img
            src={photo_url}
            alt={fullName}
            className="h-[60px] w-[60px] rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div
            aria-hidden="true"
            className={`h-[60px] w-[60px] rounded-full ${avatar.bg} ${avatar.text} font-display font-extrabold text-[22px] flex items-center justify-center flex-shrink-0`}
          >
            {initials}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="text-marine font-semibold text-[16px] leading-tight break-words">
            {fullName}
          </h3>
          {specialite && (
            <p className="mt-0.5 text-body-m text-muted break-words">
              {specialite}
            </p>
          )}
          {canViewSchedule && jours_disponibles && (
            <p className="mt-2 text-caption text-faint flex items-center gap-1.5">
              <Calendar size={12} strokeWidth={1.8} />
              <span className="break-words">{jours_disponibles}</span>
            </p>
          )}
        </div>
      </div>

      {/* Telephone cliquable */}
      {telephone && (
        <a
          href={`tel:${telephone.replace(/\s/g, '')}`}
          onClick={(e) => e.stopPropagation()}
          className="text-marine text-[13.5px] font-medium inline-flex items-center gap-2 hover:text-canard transition-colors"
        >
          <Phone size={14} strokeWidth={1.8} className="text-canard" />
          {telephone}
        </a>
      )}

      {/* Notes internes */}
      {showNotes && (
        <div className="bg-marine/[0.04] rounded-card px-3 py-2.5 text-body-m italic text-muted leading-relaxed break-words">
          {notes_internes}
        </div>
      )}
    </article>
  )
}
