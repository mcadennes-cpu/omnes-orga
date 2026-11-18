import { useState } from 'react'
import {
  Plus,
  CheckCircle2,
  Circle,
  SquareCheck,
  Square,
  ListPlus,
  ListChecks,
  Lock,
  Unlock,
  Trash2,
  Loader2,
} from 'lucide-react'
import CreatePollModal from './CreatePollModal'
import ConfirmModal from '../../components/ConfirmModal'
import { usePoll, POLL_OPTIONS_MAX } from './usePoll'
import { getBoardColorClasses } from './boardColors'
import { formatShortName } from '../../lib/profileFormat'

/**
 * Section "Sondage" de la vue carte (etape 16 ter), entre la description et
 * les pieces jointes. Composant autonome : il appelle usePoll lui-meme.
 *
 * - Sans sondage : bouton "Creer un sondage" si on peut gerer (sinon rien).
 * - Avec sondage : question, options avec barre de resultat + decompte + noms
 *   des votants (vote nominatif), mon vote surligne. Clic sur une option pour
 *   voter / changer ; lien pour retirer son vote.
 * - Gestion (cloturer / rouvrir / supprimer) si canManage.
 * - Etape 16 quater : choix multiple (cases a cocher, clic = cocher / decocher,
 *   pourcentage = part des participants) ; gestion « Ajouter des options »
 *   et « Autoriser plusieurs réponses » tant que le sondage est ouvert.
 *
 * Le vote n'est possible que si le sondage est ouvert ET la carte ouverte.
 *
 * @param {Object} props
 * @param {string} props.cardId
 * @param {string} props.userId
 * @param {boolean} props.canManage   = userCanEditCard (auteur carte / owner / super_admin)
 * @param {boolean} props.cardClosed  la carte est-elle close
 * @param {string} props.accentColor  couleur du tableau
 * @param {Object} props.profilesById map id -> profil (noms des votants)
 */
export default function PollSection({
  cardId,
  userId,
  canManage,
  cardClosed,
  accentColor = 'brique',
  profilesById = {},
}) {
  const {
    poll,
    hasPoll,
    options,
    votes,
    voteCounts,
    myOptionIds,
    totalVoters,
    isLoading,
    createPoll,
    closePoll,
    reopenPoll,
    deletePoll,
    allowMultiple,
    addOptions,
    castVote,
    clearVote,
  } = usePoll(cardId, userId)

  const [createOpen, setCreateOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [confirmMultipleOpen, setConfirmMultipleOpen] = useState(false)
  // Options dont un vote est en cours d'envoi : on ignore un 2e clic dessus
  // tant que le 1er n'est pas confirme (evite cocher/decocher en desordre).
  const [pendingIds, setPendingIds] = useState([])
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)

  const accent = getBoardColorClasses(accentColor)
  const votable = hasPoll && !poll.closed && !cardClosed
  const multiple = Boolean(poll?.multiple)
  const canAddOptions = canManage && hasPoll && !poll.closed && options.length < POLL_OPTIONS_MAX

  // Rien a afficher : pas de sondage et pas le droit d'en creer.
  if (!isLoading && !hasPoll && !canManage) return null

  // --- Handlers ------------------------------------------------------------
  const handleVote = async (optionId) => {
    if (!votable || pendingIds.includes(optionId)) return
    if (!multiple && myOptionIds.includes(optionId)) return
    setActionError(null)
    setPendingIds((cur) => [...cur, optionId])
    try {
      await castVote(optionId)
    } catch (err) {
      console.error('[PollSection] vote error:', err)
      setActionError('Le vote a échoué. Réessayez.')
    } finally {
      setPendingIds((cur) => cur.filter((id) => id !== optionId))
    }
  }

  const handleClearVote = async () => {
    setActionError(null)
    try {
      await clearVote()
    } catch (err) {
      console.error('[PollSection] clear vote error:', err)
      setActionError('Le retrait du vote a échoué. Réessayez.')
    }
  }

  const handleToggleClosed = async () => {
    setBusy(true)
    setActionError(null)
    try {
      if (poll.closed) await reopenPoll()
      else await closePoll()
    } catch (err) {
      console.error('[PollSection] toggle closed error:', err)
      setActionError(err?.message || 'Action impossible.')
    } finally {
      setBusy(false)
    }
  }

  // throw en cas d'echec : ConfirmModal affiche l'erreur (pattern du projet).
  const handleConfirmMultiple = async () => {
    await allowMultiple()
    setConfirmMultipleOpen(false)
  }

  const handleConfirmDelete = async () => {
    await deletePoll()
    setConfirmDeleteOpen(false)
  }

  // --- Rendu ---------------------------------------------------------------
  return (
    <section className="px-4 py-3 border-b border-border bg-carte">
      <div className="flex items-center justify-between">
        <span className="text-muted text-xs uppercase tracking-wider font-semibold">
          Sondage
        </span>
        {hasPoll && poll.closed && (
          <span className="text-faint text-[11px] font-semibold uppercase tracking-wide">
            Clôturé
          </span>
        )}
      </div>

      {/* Etat vide : creation possible */}
      {!isLoading && !hasPoll && canManage && (
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-input border border-dashed border-border text-muted text-sm font-medium hover:bg-fond active:bg-fond transition-colors"
        >
          <Plus className="w-4 h-4" strokeWidth={2.2} />
          Créer un sondage
        </button>
      )}

      {/* Sondage existant */}
      {hasPoll && (
        <>
          <p className="mt-2 text-marine text-sm font-semibold leading-snug">
            {poll.question}
          </p>
          <p className="mt-0.5 text-faint text-[11px]">
            {multiple ? 'Plusieurs réponses possibles' : 'Une seule réponse'}
          </p>

          <div className="mt-3 space-y-2">
            {options.map((o) => {
              const count = voteCounts[o.id] || 0
              // Part des participants qui ont choisi cette option (en choix
              // multiple, le total des barres peut depasser 100 %).
              const pct = totalVoters > 0 ? Math.round((count / totalVoters) * 100) : 0
              const isMine = myOptionIds.includes(o.id)
              const CheckedIcon = multiple ? SquareCheck : CheckCircle2
              const UncheckedIcon = multiple ? Square : Circle
              const voterNames = votes
                .filter((v) => v.optionId === o.id)
                .map((v) => formatShortName(profilesById[v.userId]))
              const RowTag = votable ? 'button' : 'div'
              return (
                <RowTag
                  key={o.id}
                  {...(votable
                    ? {
                        type: 'button',
                        onClick: () => handleVote(o.id),
                        ...(multiple ? { role: 'checkbox', 'aria-checked': isMine } : {}),
                      }
                    : {})}
                  className={`block w-full text-left rounded-input border px-3 py-2 transition-colors ${
                    isMine ? 'border-marine/30 bg-fond' : 'border-border'
                  } ${votable ? 'hover:bg-fond active:bg-fond cursor-pointer' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    {isMine ? (
                      <CheckedIcon className={`w-4 h-4 shrink-0 ${accent.tileText}`} strokeWidth={2.2} />
                    ) : (
                      <UncheckedIcon className="w-4 h-4 shrink-0 text-faint" strokeWidth={2} />
                    )}
                    <span
                      className={`flex-1 min-w-0 text-sm break-words text-marine ${
                        isMine ? 'font-semibold' : ''
                      }`}
                    >
                      {o.label}
                    </span>
                    <span className="shrink-0 text-muted text-xs tabular-nums">
                      {count} · {pct}%
                    </span>
                  </div>

                  {/* Barre de resultat */}
                  <div className="mt-1.5 h-1.5 rounded-full bg-marine/5 overflow-hidden">
                    <div className={`h-full rounded-full ${accent.dot}`} style={{ width: `${pct}%` }} />
                  </div>

                  {/* Votants (vote nominatif) */}
                  {voterNames.length > 0 && (
                    <p className="mt-1 text-faint text-[11px] leading-snug break-words">
                      {voterNames.join(', ')}
                    </p>
                  )}
                </RowTag>
              )
            })}
          </div>

          {/* Pied : total + retrait du vote / statut */}
          <div className="mt-2 flex items-center justify-between">
            <span className="text-faint text-[11px]">
              {totalVoters} {totalVoters > 1 ? 'participants' : 'participant'}
            </span>
            {votable && myOptionIds.length > 0 ? (
              <button
                type="button"
                onClick={handleClearVote}
                className="text-muted text-xs font-medium hover:text-marine transition-colors"
              >
                {myOptionIds.length > 1 ? 'Retirer mes réponses' : 'Retirer mon vote'}
              </button>
            ) : !votable ? (
              <span className="text-faint text-[11px] italic">
                {poll.closed ? 'Sondage clôturé' : 'Carte close — lecture seule'}
              </span>
            ) : null}
          </div>

          {actionError && <p className="mt-2 text-brique text-xs">{actionError}</p>}

          {/* Gestion */}
          {canManage && !poll.closed && (canAddOptions || !multiple) && (
            <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-x-4 gap-y-2">
              {canAddOptions && (
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="inline-flex items-center gap-1.5 text-muted text-xs font-medium hover:text-marine transition-colors"
                >
                  <ListPlus className="w-3.5 h-3.5" strokeWidth={2} />
                  Ajouter des options
                </button>
              )}
              {!multiple && (
                <button
                  type="button"
                  onClick={() => setConfirmMultipleOpen(true)}
                  className="inline-flex items-center gap-1.5 text-muted text-xs font-medium hover:text-marine transition-colors"
                >
                  <ListChecks className="w-3.5 h-3.5" strokeWidth={2} />
                  Autoriser plusieurs réponses
                </button>
              )}
            </div>
          )}
          {canManage && (
            <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
              <button
                type="button"
                onClick={handleToggleClosed}
                disabled={busy}
                className="inline-flex items-center gap-1.5 text-muted text-xs font-medium hover:text-marine disabled:opacity-50 transition-colors"
              >
                {busy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2.2} />
                ) : poll.closed ? (
                  <Unlock className="w-3.5 h-3.5" strokeWidth={2} />
                ) : (
                  <Lock className="w-3.5 h-3.5" strokeWidth={2} />
                )}
                {poll.closed ? 'Rouvrir le sondage' : 'Clôturer le sondage'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(true)}
                className="inline-flex items-center gap-1.5 text-brique text-xs font-medium hover:opacity-80 transition-opacity"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
                Supprimer
              </button>
            </div>
          )}
        </>
      )}

      {/* Modales */}
      <CreatePollModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={createPoll}
        accentColor={accentColor}
      />
      <CreatePollModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        mode="add"
        onAdd={addOptions}
        existingCount={options.length}
        accentColor={accentColor}
      />
      <ConfirmModal
        open={confirmMultipleOpen}
        onClose={() => setConfirmMultipleOpen(false)}
        title="Autoriser plusieurs réponses"
        message="Chacun pourra cocher plusieurs options. Les votes déjà donnés sont conservés. Ce choix est définitif dès que quelqu'un aura coché plusieurs options."
        confirmLabel="Autoriser"
        onConfirm={handleConfirmMultiple}
      />
      <ConfirmModal
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title="Supprimer le sondage"
        message="Cette action est irréversible. Le sondage et tous les votes seront définitivement supprimés."
        confirmLabel="Supprimer"
        danger
        onConfirm={handleConfirmDelete}
      />
    </section>
  )
}
