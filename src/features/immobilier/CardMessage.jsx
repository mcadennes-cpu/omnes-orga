// src/features/immobilier/CardMessage.jsx
// Bulle d'un message dans le fil d'une carte Immobilier.
// Pattern aligne sur Discussion :
// - Messages des autres : alignes a gauche, bulle neutre, nom au-dessus (pas d'avatar lateral)
// - Mes messages : alignes a droite, bulle teintee couleur tableau
// - Edition inline : la bulle devient un textarea avec boutons
// - Confirmation suppression inline : zone rouge dans la bulle
// - Erreurs en text-brique sous la bulle, pas d'alert()

import { useState } from 'react';
import { MoreHorizontal, Loader2 } from 'lucide-react';
import { getBoardColorClasses } from './immobilierColors';
import { formatTime } from '../../lib/dateFormat';
import { formatName } from '../../lib/profileFormat';
import Avatar from '../../components/common/Avatar';

const BODY_MAX = 2000;

export default function CardMessage({
  message,
  isMine,
  boardColor = 'canard',
  onEdit,
  onDelete,
  showAvatar = true,
}) {
  // 'view' | 'menu' | 'edit' | 'confirmDelete'
  const [mode, setMode] = useState('view');
  const [draft, setDraft] = useState(message.contenu || '');
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState(null);

  const accent = getBoardColorClasses(boardColor);
  const time = formatTime(message.created_at);
  const edited = Boolean(message.edited);
  const auteur = message.auteur;

  function startEdit() {
    setDraft(message.contenu || '');
    setActionError(null);
    setMode('edit');
  }

  async function handleSaveEdit() {
    const trimmed = draft.trim();
    if (!trimmed || working) return;
    setWorking(true);
    setActionError(null);
    try {
      const result = await onEdit(message.id, trimmed);
      if (result?.error) {
        setActionError(result.error.message || 'Une erreur est survenue.');
        setWorking(false);
        return;
      }
      setWorking(false);
      setMode('view');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[CardMessage] edit error:', err);
      setActionError(err?.message || 'Une erreur est survenue.');
      setWorking(false);
    }
  }

  async function handleDelete() {
    if (working) return;
    setWorking(true);
    setActionError(null);
    try {
      const result = await onDelete(message.id);
      if (result?.error) {
        setActionError(result.error.message || 'Une erreur est survenue.');
        setWorking(false);
        return;
      }
      // Le message disparait du fil ; pas de reset de mode necessaire.
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[CardMessage] delete error:', err);
      setActionError(err?.message || 'Une erreur est survenue.');
      setWorking(false);
    }
  }

  // --- Mode edition --------------------------------------------------------
  if (mode === 'edit') {
    return (
      <div className={`flex items-end gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
        {!isMine && <div className="w-8 shrink-0" />}
        <div className="w-[80%]">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, BODY_MAX))}
            rows={3}
            autoFocus
            className="w-full px-3 py-2 rounded-2xl bg-fond border border-border
                       text-marine text-sm focus:outline-none
                       focus:ring-2 focus:ring-canard/30 resize-none"
          />
          {actionError && (
            <p className="mt-1 text-brique text-xs">{actionError}</p>
          )}
          <div className="mt-1.5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => { setMode('view'); setActionError(null); }}
              disabled={working}
              className="px-3 py-1.5 rounded-full text-muted font-semibold text-xs
                         hover:text-marine disabled:opacity-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={!draft.trim() || working}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
                          ${accent.cta} font-semibold text-xs
                          disabled:opacity-40 active:opacity-80 transition-opacity`}
            >
              {working && <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2.2} />}
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Mode confirmation suppression ---------------------------------------
  if (mode === 'confirmDelete') {
    return (
      <div className={`flex items-end gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
        {!isMine && <div className="w-8 shrink-0" />}
        <div className="w-[80%] px-3 py-2.5 rounded-2xl bg-brique/10">
          <p className="text-marine text-sm font-medium">Supprimer ce message ?</p>
          {actionError && (
            <p className="mt-1 text-brique text-xs">{actionError}</p>
          )}
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => { setMode('view'); setActionError(null); }}
              disabled={working}
              className="px-3 py-1.5 rounded-full text-muted font-semibold text-xs
                         hover:text-marine disabled:opacity-50 transition-colors"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={working}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
                         bg-brique text-white font-semibold text-xs
                         disabled:opacity-40 active:opacity-80 transition-opacity"
            >
              {working && <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2.2} />}
              Supprimer
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Mode affichage (view / menu) ----------------------------------------
  return (
    <div className={`flex items-end gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
      {!isMine && (
        showAvatar ? (
          <Avatar
            profile={auteur}
            size={32}
            alt={`${auteur?.prenom || ''} ${auteur?.nom || ''}`.trim()}
            className="shrink-0 mb-1"
          />
        ) : (
          <div className="w-8 shrink-0" />
        )
      )}
      <div className={`flex flex-col max-w-[80%] ${isMine ? 'items-end' : 'items-start'}`}>
        {!isMine && (
          <span className="text-marine text-xs font-semibold mb-0.5 px-1">
            {formatName(auteur)}
          </span>
        )}

        <div
          className={`px-3 py-2 rounded-2xl ${
            isMine
              ? `${accent.bubble} rounded-br-sm`
              : 'bg-fond text-marine rounded-bl-sm'
          }`}
        >
          <p className="text-sm whitespace-pre-wrap break-words">
            {message.contenu}
          </p>
          <div
            className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${
              isMine ? 'opacity-70' : 'text-faint'
            }`}
          >
            {edited && <span>modifié</span>}
            {edited && <span aria-hidden="true">·</span>}
            <span>{time}</span>
          </div>
        </div>

        {isMine && (
          <div className="mt-0.5 flex items-center gap-2 px-1">
            {mode === 'menu' ? (
              <>
                <button
                  type="button"
                  onClick={startEdit}
                  className="text-muted text-xs font-semibold hover:text-marine
                             transition-colors"
                >
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('confirmDelete'); setActionError(null); }}
                  className="text-brique text-xs font-semibold hover:opacity-80
                             transition-opacity"
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
  );
}
