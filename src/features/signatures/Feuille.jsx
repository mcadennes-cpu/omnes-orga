// src/features/signatures/Feuille.jsx
//
// Feuille bottom-sheet du module Signatures, sur le pattern des modales du
// projet (EvenementFormModal) : Portal, overlay marine/40, poignee,
// animate-slide-up, verrou du defilement, Echap pour fermer (sauf pendant
// un envoi). Factorisee ici car le module en ouvre quatre.

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export default function Feuille({ open, onClose, titre, occupe = false, children, pied }) {
  useEffect(() => {
    if (!open) return undefined
    const avant = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = avant
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const surTouche = (e) => {
      if (e.key === 'Escape' && !occupe) onClose()
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [open, occupe, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={titre}>
      <button
        type="button"
        aria-label="Fermer"
        onClick={() => !occupe && onClose()}
        className="absolute inset-0 bg-marine/40 backdrop-blur-sm"
      />
      <div className="relative bg-carte rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col animate-slide-up">
        <div className="pt-3 pb-1 flex justify-center">
          <div className="w-9 h-1 rounded-full bg-marine/18" />
        </div>
        <div className="px-4 pt-2 pb-3 flex items-center justify-between border-b border-border">
          <h2 className="font-display font-extrabold text-marine text-lg">{titre}</h2>
          <button
            type="button"
            onClick={() => !occupe && onClose()}
            aria-label="Fermer"
            disabled={occupe}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:bg-fond active:bg-fond transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" strokeWidth={1.8} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">{children}</div>
        {pied && (
          <div className="px-4 py-3 border-t border-border bg-carte flex gap-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {pied}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

// Classes partagees par les formulaires du module (memes valeurs que
// EvenementFormModal). text-base sur les champs : evite le zoom d'iOS
// a la saisie (champ < 16 px), cf. limitation du 05/10/2026.
export const CLASSE_CHAMP =
  'w-full px-3 py-2.5 rounded-input bg-fond border border-border text-marine text-base placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-canard/30'
export const CLASSE_LABEL = 'block text-muted text-xs uppercase tracking-wider font-semibold mb-2'
export const CLASSE_BOUTON_SECONDAIRE =
  'flex-1 h-11 rounded-input border border-border bg-carte text-marine font-semibold text-sm active:bg-fond disabled:opacity-50 transition-colors'
export const CLASSE_BOUTON_PRIMAIRE =
  'flex-1 h-11 rounded-input bg-marine text-white font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-40 active:opacity-80 transition-opacity'
export const CLASSE_BOUTON_DANGER =
  'flex-1 h-11 rounded-input bg-brique text-white font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-40 active:opacity-80 transition-opacity'
