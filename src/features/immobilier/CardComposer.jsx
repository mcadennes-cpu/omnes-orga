// src/features/immobilier/CardComposer.jsx
// Composer sticky en bas de la vue carte.
// - Textarea autosizing (sans dependance externe : on calcule le scrollHeight)
// - Entree = retour a la ligne (l'envoi se fait par bouton, pattern Discussion 7C)
// - Bouton "Envoyer" desactive si vide ou en cours d'envoi
// - Si carte close : composer remplace par une bande "lecture seule"

import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { getBoardColorClasses } from './immobilierColors';

const MAX_HEIGHT = 120; // px

export default function CardComposer({
  onSend,
  disabled = false,
  cardClosed = false,
  boardColor = 'canard',
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef(null);
  const colors = getBoardColorClasses(boardColor);

  // Autosizing
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const newHeight = Math.min(ta.scrollHeight, MAX_HEIGHT);
    ta.style.height = `${newHeight}px`;
  }, [text]);

  if (cardClosed) {
    return (
      <div className="sticky bottom-0 bg-fond border-t border-border
                      px-4 py-3 text-center">
        <p className="text-body-m text-muted italic">
          Cette carte est close — les messages sont en lecture seule.
        </p>
      </div>
    );
  }

  const canSend = text.trim().length > 0 && !sending && !disabled;

  async function handleSend() {
    if (!canSend) return;
    setSending(true);
    const valeur = text;
    setText(''); // reset optimiste
    const result = await onSend(valeur);
    setSending(false);
    if (result?.error) {
      // Restituer le texte en cas d'echec
      setText(valeur);
      // eslint-disable-next-line no-alert
      alert(`Erreur a l'envoi : ${result.error.message}`);
    }
  }

  return (
    <div className="sticky bottom-0 bg-carte border-t border-border
                    px-3 py-2">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Votre message..."
          rows={1}
          disabled={disabled || sending}
          className="flex-1 px-3 py-2 bg-fond border border-border
                     rounded-input text-body-m text-ink
                     placeholder:text-faint resize-none
                     focus:outline-none focus:ring-2 focus:ring-canard
                     disabled:opacity-50"
          style={{ maxHeight: `${MAX_HEIGHT}px` }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          className={`flex-shrink-0 p-2.5 ${colors.cta}
                      rounded-input shadow-button
                      disabled:opacity-40 disabled:cursor-not-allowed
                      transition-opacity`}
          aria-label="Envoyer"
        >
          <Send size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
