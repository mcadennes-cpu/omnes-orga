import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useRole } from '../../hooks/useRole'
import { canRespondToSondage } from '../../lib/permissions'
import { getEventColorClasses } from './eventColors'
import { useSondage } from './useSondage'

const ANSWERS = [
  { key: 'oui', label: 'Oui' },
  { key: 'non', label: 'Non' },
  { key: 'peut_etre', label: 'Peut-être' },
]

const GROUP_LABELS = { oui: 'Oui', non: 'Non', peut_etre: 'Peut-être' }
const MAX_VISIBLE = 5

function initialesDe(prenom, nom) {
  const a = (prenom ?? '').trim()[0] ?? ''
  const b = (nom ?? '').trim()[0] ?? ''
  return (a + b).toUpperCase() || '?'
}

function nomComplet(prenom, nom) {
  const parts = [prenom, nom].map((s) => (s ?? '').trim()).filter(Boolean)
  return parts.length ? parts.join(' ') : 'Utilisateur'
}

// ----------------------------------------------------------------------------
// Sous-composant : liste des votants groupee par reponse
// ----------------------------------------------------------------------------

function PollResults({ voters }) {
  return (
    <div className="mt-3 pt-3 border-t border-border space-y-4">
      {ANSWERS.map(({ key }) => {
        const list = voters[key] ?? []
        if (list.length === 0) return null
        const visibles = list.slice(0, MAX_VISIBLE)
        const reste = list.length - visibles.length
        return (
          <div key={key}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint mb-2">
              {GROUP_LABELS[key]} · {list.length}
            </p>
            <ul className="space-y-1.5">
              {visibles.map((v) => (
                <li key={v.userId} className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-full bg-canard/15 text-canard flex items-center justify-center font-semibold text-[11px] shrink-0">
                    {initialesDe(v.prenom, v.nom)}
                  </span>
                  <span className="text-marine text-sm truncate">
                    {nomComplet(v.prenom, v.nom)}
                  </span>
                </li>
              ))}
            </ul>
            {reste > 0 && (
              <p className="text-muted text-[12px] mt-1.5 pl-[38px]">
                + {reste} autre{reste > 1 ? 's' : ''}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Section Sondage
// ----------------------------------------------------------------------------

/**
 * Section "Sondage de presence" de la page detail.
 * Affichee uniquement si l'evenement a sondage_actif = true (gere par le
 * parent EvenementDetail).
 * Props : evenementId, couleur (couleur d'identite de l'evenement).
 */
export default function PollSection({ evenementId, couleur }) {
  const { role } = useRole()
  const { loading, error, myVote, counts, voters, vote } =
    useSondage(evenementId)
  const [showResults, setShowResults] = useState(false)

  const colors = getEventColorClasses(couleur)
  const canVote = canRespondToSondage(role)
  const total = counts.oui + counts.non + counts.peut_etre

  return (
    <div className="bg-carte rounded-card shadow-card p-4">
      <h2 className="font-display font-extrabold text-marine text-lg">
        Sondage de présence
      </h2>
      <p className="text-muted text-sm mt-0.5">Peux-tu venir ?</p>

      {error ? (
        <p className="text-brique text-sm mt-3">
          Impossible de charger le sondage.
        </p>
      ) : (
        <>
          {/* Boutons de reponse */}
          <div className="grid grid-cols-3 gap-2 mt-3">
            {ANSWERS.map((a) => {
              const selected = myVote === a.key
              return (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => vote(a.key)}
                  disabled={!canVote || loading}
                  aria-pressed={selected}
                  className={`h-11 rounded-input text-sm font-semibold transition-colors disabled:opacity-50 ${
                    selected
                      ? `${colors.solid} ${colors.solidText}`
                      : 'bg-carte border border-border text-marine active:bg-fond'
                  }`}
                >
                  {a.label}
                </button>
              )
            })}
          </div>

          {/* Decompte */}
          {total === 0 ? (
            <p className="text-muted text-[13px] mt-3">
              Aucune réponse pour l'instant.
            </p>
          ) : (
            <p className="text-muted text-[13px] mt-3">
              {counts.oui} oui · {counts.non} non · {counts.peut_etre} peut-être
            </p>
          )}

          {/* Voir les reponses */}
          {total > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowResults((v) => !v)}
                className={`mt-2 inline-flex items-center gap-1 text-sm font-semibold ${colors.softText}`}
              >
                {showResults ? 'Masquer les réponses' : 'Voir les réponses'}
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${
                    showResults ? 'rotate-180' : ''
                  }`}
                  strokeWidth={2}
                />
              </button>
              {showResults && <PollResults voters={voters} />}
            </>
          )}
        </>
      )}
    </div>
  )
}
