import { Phone, Calendar } from 'lucide-react'
import { getAvatarPalette } from '../../lib/avatarColor'

function getInitials(prenom, nom) {
  const p = (prenom ?? '').trim().charAt(0).toUpperCase()
  const n = (nom ?? '').trim().charAt(0).toUpperCase()
  return `${p}${n}` || '?'
}

export default function MedecinCard({ medecin, canViewNotes = false, canViewSchedule = false }) {
  const {
    id,
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
  const showNotes = canViewNotes && notes_internes && notes_internes.trim() !== ''
  const avatar = getAvatarPalette(`${prenom} ${nom}`)

  return (
    <article className="bg-carte border border-border rounded-card p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        {photo_url ? (
          <img
            src={photo_url}
            alt={fullName}
            className="h-[60px] w-[60px] rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div
            aria-hidden="true"
            className={`h-[60px] w-[60px] rounded-full ${avatar.bg} ${avatar.text} font-bold text-lg flex items-center justify-center flex-shrink-0`}
          >
            {initials}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="font-display font-bold text-base text-marine break-words">
            {fullName}
          </h3>
          {specialite && (
            <p className="text-sm text-muted break-words">{specialite}</p>
          )}
          {canViewSchedule && jours_disponibles && (
            <p className="mt-1 text-xs text-faint flex items-center gap-1.5">
              <Calendar size={13} strokeWidth={1.8} />
              <span className="break-words">{jours_disponibles}</span>
            </p>
          )}
        </div>
      </div>

      {telephone && (
        <a
          href={`tel:${telephone.replace(/\s/g, '')}`}
          className="text-sm text-ink flex items-center gap-2 hover:text-canard transition-colors"
        >
          <Phone size={14} strokeWidth={1.8} className="text-canard" />
          <span>{telephone}</span>
        </a>
      )}

      {showNotes && (
        <p className="text-sm italic text-muted bg-marine/5 rounded-lg p-2 break-words">
          {notes_internes}
        </p>
      )}
    </article>
  )
}
