import { Phone } from 'lucide-react'
import Avatar from '../common/Avatar'

export default function MedecinCard({ medecin }) {
  const { prenom, nom, specialite, telephone } = medecin
  const fullName = [prenom, nom].filter(Boolean).join(' ').trim()

  return (
    <article className="bg-carte border border-border rounded-card shadow-card p-[14px] flex items-center gap-3.5">
      <Avatar profile={medecin} size={72} className="flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <h3 className="text-marine font-semibold text-[16px] leading-tight break-words">
          {fullName}
        </h3>
        {specialite && (
          <p className="mt-0.5 text-body-m text-muted break-words">
            {specialite}
          </p>
        )}
        {telephone && (
          <a
            href={`tel:${telephone.replace(/\s/g, '')}`}
            onClick={(e) => e.stopPropagation()}
            className="mt-1.5 text-marine text-[13.5px] font-medium inline-flex items-center gap-2 hover:text-canard transition-colors"
          >
            <Phone size={14} strokeWidth={1.8} className="text-canard" />
            {telephone}
          </a>
        )}
      </div>
    </article>
  )
}
