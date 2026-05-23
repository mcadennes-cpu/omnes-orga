// src/features/immobilier/CardComposer.jsx
// Zone de saisie d'un message, en bas de la vue carte.
// Pattern aligne sur Discussion :
// - Textarea auto-redimensionne (max 120px)
// - Bouton Send circulaire teinte couleur tableau, avec Loader2 pendant envoi
// - Si carte close : bandeau "lecture seule" remplace le composer
// - Pas d'alert() en cas d'erreur : on garde le texte saisi, console.error suffit

import { useRef, useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { getBoardColorClasses } from './immobilierColors';

const MAX_LENGTH = 2000;

export default function CardComposer({
  onSend,
  cardClosed = false,
  boardColor = 'canard',
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef(null);
  const accent = getBoardColorClasses(boardColor);

  if (cardClosed) {
    return (
      <div className="px-4 py-3 bg-fond border-t border-border">
        <p className="text-muted text-xs text-center">
          Cette carte est close — les messages sont en lecture seule.
        </p>
      </div>
    );
  }

  function handleChange(e) {
    setText(e.target.value.slice(0, MAX_LENGTH));
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && !sending;

  async function handleSend() {
    if (!canSend) return;
    setSending(true);
    try {
      const result = await onSend(trimmed);
      if (result?.error) {
        // On garde le texte saisi pour reessayer ; pas d'alert intrusif.
        // eslint-disable-next-line no-console
        console.error('[CardComposer] send error:', result.error);
      } else {
        setText('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[CardComposer] send error:', err);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="px-3 py-2.5 bg-carte border-t border-border flex items-end gap-2">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleChange}
        rows={1}
        placeholder="Ecrire un message..."
        className="flex-1 px-3 py-2 rounded-2xl bg-fond border border-border
                   text-marine text-sm placeholder:text-faint
                   focus:outline-none focus:ring-2 focus:ring-canard/30
                   resize-none max-h-[120px]"
      />
      <button
        type="button"
        onClick={handleSend}
        disabled={!canSend}
        aria-label="Envoyer le message"
        className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center
                    ${accent.cta} disabled:opacity-40 active:opacity-80
                    transition-opacity`}
      >
        {sending ? (
          <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.2} />
        ) : (
          <Send className="w-4 h-4" strokeWidth={2.2} />
        )}
      </button>
    </div>
  );
}
