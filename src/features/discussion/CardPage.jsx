import { Fragment, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronDown } from 'lucide-react'
import StatusBadge from './StatusBadge'
import CardActionsMenu from './CardActionsMenu'
import CardMessage from './CardMessage'
import CardComposer from './CardComposer'
import CardAttachments from './CardAttachments'
import { formatDayLabel } from '../../lib/dateFormat'

/** Deux dates tombent-elles le meme jour calendaire ? */
function sameDay(a, b) {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

/** Separateur de jour insere dans le fil entre deux dates differentes. */
function DaySeparator({ label }) {
  return (
    <div className="flex items-center justify-center py-1">
      <span className="px-3 py-1 rounded-full bg-fond text-faint text-[11px] font-semibold uppercase tracking-wide">
        {label}
      </span>
    </div>
  )
}

/**
 * Vue presentationnelle d'une carte de discussion (etapes 7C + 7D).
 * Structure en colonne : header fige, zone scrollable (description repliable,
 * pieces jointes, fil de messages), composer fige en bas. Toute la donnee
 * arrive en props de DiscussionCard.
 */
export default function CardPage({
  card,
  board,
  messages,
  attachments,
  userId,
  profilesById = {},
  canEditCard,
  onBack,
  onEditCard,
  onToggleCardStatus,
  onDeleteCard,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onOpenAttachment,
  onAddAttachment,
  onDeleteAttachment,
}) {
  const [descExpanded, setDescExpanded] = useState(true)
  const messagesEndRef = useRef(null)

  // Auto-scroll vers le dernier message a l'ouverture et a chaque ajout.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const isClosed = card.status === 'closed'

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <header className="shrink-0 bg-fond border-b border-border">
        <div className="flex items-start gap-1 px-2 py-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Retour au tableau"
            className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-marine hover:bg-marine/5 active:bg-marine/5 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" strokeWidth={2} />
          </button>
          <div className="flex-1 min-w-0 pt-1">
            <StatusBadge status={card.status} />
            <h1 className="mt-0.5 font-display font-extrabold text-marine text-lg leading-snug line-clamp-2 break-words">
              {card.title}
            </h1>
          </div>
          <div className="shrink-0">
            <CardActionsMenu
              cardStatus={card.status}
              canEdit={canEditCard}
              onEdit={onEditCard}
              onToggleStatus={onToggleCardStatus}
              onDelete={onDeleteCard}
            />
          </div>
        </div>
      </header>

      {/* Zone scrollable : description repliable + pieces jointes + fil */}
      <div className="flex-1 overflow-y-auto min-h-0 bg-carte">
        <div className="px-4 pt-3 pb-3 border-b border-border">
          {card.description ? (
            <>
              <button
                type="button"
                onClick={() => setDescExpanded((v) => !v)}
                aria-expanded={descExpanded}
                className="w-full flex items-center justify-between"
              >
                <span className="text-muted text-xs uppercase tracking-wider font-semibold">
                  Description
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-muted transition-transform ${
                    descExpanded ? 'rotate-180' : ''
                  }`}
                  strokeWidth={2}
                />
              </button>
              {descExpanded && (
                <p className="mt-2 text-marine text-sm whitespace-pre-wrap leading-relaxed">
                  {card.description}
                </p>
              )}
            </>
          ) : (
            <p className="text-faint text-sm italic">Aucune description.</p>
          )}
        </div>

        <CardAttachments
          attachments={attachments}
          userId={userId}
          canManage={!isClosed}
          onOpen={onOpenAttachment}
          onAdd={onAddAttachment}
          onDelete={onDeleteAttachment}
        />

        <div className="px-4 py-3 space-y-2">
          {messages.length === 0 ? (
            <p className="text-center text-muted text-sm py-8">
              Aucun message pour l'instant.
            </p>
          ) : (
            messages.map((msg, idx) => {
              const prev = messages[idx - 1]
              const showSeparator =
                !prev || !sameDay(prev.createdAt, msg.createdAt)
              return (
                <Fragment key={msg.id}>
                  {showSeparator && (
                    <DaySeparator label={formatDayLabel(msg.createdAt)} />
                  )}
                  <CardMessage
                    message={msg}
                    author={profilesById[msg.authorId]}
                    isOwn={msg.authorId === userId}
                    accentColor={board.color}
                    onEdit={onEditMessage}
                    onDelete={onDeleteMessage}
                  />
                </Fragment>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Composer */}
      <div className="shrink-0">
        <CardComposer
          accentColor={board.color}
          disabled={isClosed}
          onSend={onSendMessage}
        />
      </div>
    </div>
  )
}
