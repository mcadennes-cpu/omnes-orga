// src/components/common/MembersSheet.jsx
// Feuille bottom-sheet en LECTURE SEULE listant tous les participants d'un
// tableau. Ouverte en tapant la pile d'avatars du header (Discussion,
// Immobilier), ou le "+N" qui masque les participants au-dela du 4e.
//
// Pourquoi une bottom-sheet plutot qu'un menu deroulant : le <header> des
// pages tableau est en `overflow-hidden` (filigrane Omnes), ce qui rogne
// integralement tout dropdown CSS ouvert depuis lui -- c'est le bug deja
// rencontre sur /evenements/:id (cf. limitations connues). Le Portal sort du
// stacking context du header, comme le fait deja BoardActionsMenu.
//
// Lecture seule assumee : aucune action, aucune ecriture. La gestion des
// participants d'Immobilier reste dans ManageMembersModal, via le menu
// trois-points.

import { useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import Avatar from './Avatar'
import Pill from './Pill'
import { formatName } from '../../lib/profileFormat'

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {Array<{ id: string, prenom?: string, nom?: string, photo_url?: string, specialite?: string, updated_at?: string }>} [props.profiles]
 * @param {string[]} [props.ownerIds]      ids des proprietaires (badge)
 * @param {string} [props.currentUserId]   pour marquer "(vous)"
 * @param {'marine'|'canard'|'ocre'|'olive'|'brique'|'fuchsia'} [props.accentColor]
 * @param {string} [props.title]
 * @param {string} [props.ownerLabel]  libelle du badge porte par le createur
 */
export default function MembersSheet({
  open,
  onClose,
  profiles = [],
  ownerIds = [],
  currentUserId,
  accentColor = 'marine',
  title = 'Participants',
  ownerLabel = 'Créateur',
}) {
  // Escape + scroll lock pendant l'ouverture : pattern commun a toutes les
  // bottom-sheets du projet (BoardActionsMenu, ManageMembersModal...).
  useEffect(() => {
    if (!open) return undefined
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKeyDown)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  // Createur d'abord, puis ordre alphabetique : sur un tableau a 15
  // participants, on veut retrouver qui le pilote sans faire defiler.
  // (En pratique un seul createur : seul le trigger auto-owner ecrit ce role,
  // et les RPC sont anti-promotion -- cf. 10B-1 et 10A-2.)
  const sorted = useMemo(() => {
    const owners = new Set(ownerIds)
    return [...profiles].sort((a, b) => {
      const ao = owners.has(a.id) ? 0 : 1
      const bo = owners.has(b.id) ? 0 : 1
      if (ao !== bo) return ao - bo
      return formatName(a).localeCompare(formatName(b), 'fr')
    })
  }, [profiles, ownerIds])

  if (!open) return null

  const ownerSet = new Set(ownerIds)

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose?.()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-overlay backdrop-blur-sm"
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="members-sheet-title"
    >
      <div
        className="w-full max-w-lg bg-carte rounded-t-card shadow-card
                   animate-slide-up max-h-[85vh] flex flex-col"
      >
        {/* Poignee */}
        <div className="pt-3 pb-1 flex justify-center shrink-0">
          <div className="w-9 h-1 rounded-full bg-marine/18" />
        </div>

        {/* Titre */}
        <div className="px-4 pb-3 flex items-center justify-between gap-3 border-b border-border shrink-0">
          <h2 id="members-sheet-title" className="text-h2 text-ink truncate">
            {title} <span className="text-muted">({profiles.length})</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center
                       text-muted hover:text-ink hover:bg-fond active:bg-fond transition-colors"
          >
            <X size={22} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        {/* Liste */}
        <ul
          className="overflow-y-auto divide-y divide-border"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {sorted.map((p) => {
            const isSelf = Boolean(currentUserId) && p.id === currentUserId
            const isOwner = ownerSet.has(p.id)
            return (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar profile={p} size={40} className="shrink-0" alt="" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-body-m text-ink truncate">
                      {formatName(p)}
                    </span>
                    {isSelf && <span className="text-caption shrink-0">(vous)</span>}
                  </div>
                  {p.specialite && (
                    <p className="text-caption truncate">{p.specialite}</p>
                  )}
                </div>
                {isOwner && (
                  <span className="shrink-0">
                    <Pill color={accentColor} size="sm">
                      {ownerLabel}
                    </Pill>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>,
    document.body,
  )
}
