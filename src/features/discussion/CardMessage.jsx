import { useState } from 'react'
import { MoreHorizontal, Loader2 } from 'lucide-react'
import { getBoardColorClasses } from './boardColors'
import { formatTime } from '../../lib/dateFormat'
import { formatName } from '../../lib/profileFormat'

const BODY_MAX = 2000

/**
 * Bulle d'un message dans le fil d'une carte.
 * - Messages des autres : alignes a gauche, bulle neutre, nom de l'auteur au-dessus.
 * - Mes messages : alignes a droite, bulle teintee de la couleur du tableau.
 * Si isOwn, un petit menu permet de modifier (edition inline) ou supprimer
 * le message — la RLS n'autorise ces actions que pour son propre auteur.
 *
 * @param {Object} props
 * @param {Object} props.message  message enrichi (cf. useCard)
 * @param {Object} [props.author] profil de l'auteur (croise par le conteneur)
 * @param {boolean} props.isOwn   le message appartient a l'utilisateur courant
 * @param {string} [props.accentColor='brique']
 * @param {(messageId: string, body: string) => Promise} props.onEdit
 * @param {(messageId: string) => Promise} props.onDelete
 */
export default function CardMessage({
  message,
  author,
  isOwn,
  accentColor = 'brique',
  onEdit,
  onDelete,
}) {
  const [mode, setMode] = useState('view') // 'view' | 'menu' | 'edit' | 'confirmDelete'
  const [draft, setDraft] = useState(message.body || '')
  const [working, setWorking] = useState(false)
  const [actionError, setActionError] = useState(null)

  const accent = getBoardColorClasses(accentColor)
  const time = formatTime(message.createdAt)
  const edited = Boolean(message.editedAt)

  const startEdit = () => {
    setDraft(message.body || '')
    setActionError(null)
    setMode('edit')
  }

  const handleSaveEdit = async () => {
    const trimmed = draft.trim()
    if (!trimmed || working) return
    setWorking(true)
    setActionError(null)
    try {
      await onEdit(message.id, trimmed)
      setWorking(false)
      setMode('view')
    } catch (err) {
      console.error('[CardMessage] edit error:', err)
      setActionError(err?.message || 'Une erreur est survenue.')
      setWorking(false)
    }
  }

  const handleDelete = async () => {
    if (working) return
    setWorking(true)
    setActionError(null)
    try {
      await onDelete(message.id)
      // Le message disparait du fil ; pas de reset de mode necessaire.
    } catch (err) {
      console.error('[CardMessage] delete error:', err)
      setActionError(err?.message || 'Une erreur est survenue.')
      setWorking(false)
    }
  }

  // --- Mode edition --------------------------------------------------------
  if (mode === 'edit') {
    return (
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
        <div className="w-[85%]">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, BODY_MAX))}
            rows={3}
            autoFocus
            className="w-full px-3 py-2 rounded-input bg-fond border border-border text-marine text-sm focus:outline-none focus:ring-2 focus:ring-canard/30 resize-none"
          />
          {actionError && <p className="mt-1 text-brique text-xs">{actionError}</p>}
          <div className="mt-1.5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => { setMode('view'); setActionError(null) }}
              disabled={working}
              className="px-3 py-1.5 rounded-full text-muted font-semibold text-xs hover:text-marine disabled:opacity-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={!draft.trim() || working}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ${accent.cta} font-semibold text-xs disabled:opacity-40 active:opacity-80 transition-opacity`}
            >
              {working && <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2.2} />}
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    )
  }

  // --- Mode confirmation suppression ---------------------------------------
  if (mode === 'confirmDelete') {
    return (
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
        <div className="w-[85%] px-3 py-2.5 rounded-2xl bg-brique/10">
          <p className="text-marine text-sm font-medium">Supprimer ce message ?</p>
          {actionError && <p className="mt-1 text-brique text-xs">{actionError}</p>}
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => { setMode('view'); setActionError(null) }}
              disabled={working}
              className="px-3 py-1.5 rounded-full text-muted font-semibold text-xs hover:text-marine disabled:opacity-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={working}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brique text-white font-semibold text-xs disabled:opacity-40 active:opacity-80 transition-opacity"
            >
              {working && <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2.2} />}
              Supprimer
            </button>
          </div>
        </div>
      </div>
    )
  }

  // --- Mode affichage (view / menu) ----------------------------------------
  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex flex-col max-w-[85%] ${isOwn ? 'items-end' : 'items-start'}`}>
        {!isOwn && (
          <span className="text-marine text-xs font-semibold mb-0.5 px-1">
            {formatName(author)}
          </span>
        )}

        <div
          className={`px-3 py-2 rounded-2xl ${
            isOwn
              ? `${accent.bubble} rounded-br-sm`
              : 'bg-fond text-marine rounded-bl-sm'
          }`}
        >
          <p className="text-sm whitespace-pre-wrap break-words">{message.body}</p>
          <div
            className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${
              isOwn ? 'opacity-70' : 'text-faint'
            }`}
          >
            {edited && <span>modifié</span>}
            {edited && <span aria-hidden="true">·</span>}
            <span>{time}</span>
          </div>
        </div>

        {isOwn && (
          <div className="mt-0.5 flex items-center gap-2 px-1">
            {mode === 'menu' ? (
              <>
                <button
                  type="button"
                  onClick={startEdit}
                  className="text-muted text-xs font-semibold hover:text-marine transition-colors"
                >
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('confirmDelete'); setActionError(null) }}
                  className="text-brique text-xs font-semibold hover:opacity-80 transition-opacity"
                >
                  Supprimer
                </button>
                <button
                  type="button"
                  onClick={() => setMode('view')}
                  className="text-faint text-xs hover:text-muted transition-colors"
                >
                  Fermer
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setMode('menu')}
                aria-label="Actions du message"
                className="text-faint hover:text-muted transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" strokeWidth={2} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
