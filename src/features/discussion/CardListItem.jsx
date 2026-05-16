import { ChevronRight, MessageSquare } from 'lucide-react'
import StatusBadge from './StatusBadge'
import { formatRelativeDate } from '../../lib/dateFormat'

/**
 * Tile d'une carte dans la liste d'un tableau de discussion.
 *
 * Concue pour la degradation gracieuse de l'etape 7B : tant que le chat
 * n'existe pas, les props lastMessagePreview / messagesCount / unreadCount
 * ne sont pas fournies et la tile affiche un placeholder discret. En 7C,
 * le conteneur renseignera ces props sans changement de ce composant.
 *
 * @param {Object} props
 * @param {Object} props.card                 carte enrichie (cf. useBoard)
 * @param {() => void} props.onClick           ouvre le detail de la carte
 * @param {number} [props.messagesCount=0]     nombre total de messages (7C)
 * @param {string|null} [props.lastMessagePreview=null]  apercu "Auteur : texte" (7C)
 * @param {number} [props.unreadCount=0]       messages non lus (7C)
 */
export default function CardListItem({
  card,
  onClick,
  messagesCount = 0,
  lastMessagePreview = null,
  unreadCount = 0,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-4 py-3.5 hover:bg-fond active:bg-fond transition-colors"
    >
      {/* Ligne 1 : statut + titre + compteur non-lu + chevron */}
      <div className="flex items-center gap-2">
        <span className="shrink-0">
          <StatusBadge status={card.status} />
        </span>
        <h3 className="flex-1 min-w-0 truncate font-semibold text-marine text-sm">
          {card.title}
        </h3>
        {unreadCount > 0 && (
          <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-brique text-white text-[11px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
        <ChevronRight className="w-4 h-4 text-faint shrink-0" strokeWidth={2} />
      </div>

      {/* Ligne 2 : apercu du dernier message */}
      <p
        className={`mt-1.5 text-xs truncate ${
          lastMessagePreview ? 'text-muted' : 'text-faint italic'
        }`}
      >
        {lastMessagePreview || "Aucun message pour l'instant"}
      </p>

      {/* Ligne 3 : meta (compteur de messages si > 0, date de derniere activite) */}
      <div className="mt-1.5 flex items-center gap-1.5 text-faint text-[11px]">
        {messagesCount > 0 && (
          <>
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" strokeWidth={1.8} />
              {messagesCount}
            </span>
            <span aria-hidden="true">·</span>
          </>
        )}
        <span>{formatRelativeDate(card.lastActivityAt)}</span>
      </div>
    </button>
  )
}
