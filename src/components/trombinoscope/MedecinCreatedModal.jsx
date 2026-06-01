import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, CheckCircle2, AlertTriangle } from 'lucide-react'

export default function MedecinCreatedModal({ open, onClose, email, tempPassword }) {
  const [copiedField, setCopiedField] = useState(null) // 'password' | 'both' | null

  // Reset le feedback "copié" à l'ouverture
  useEffect(() => {
    if (open) setCopiedField(null)
  }, [open])

  // Bloquer le scroll du body
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  // PAS de fermeture par Escape ni par tap sur overlay : le super_admin DOIT
  // copier le mot de passe avant de fermer (il ne sera plus jamais affiche).
  // Seul le bouton "Terminer" ferme la modale.

  if (!open) return null

  async function copyToClipboard(text, fieldName) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(fieldName)
      // Reset le feedback apres 2.5s
      setTimeout(() => setCopiedField(null), 2500)
    } catch (err) {
      console.error('Erreur copie presse-papier :', err)
      // Fallback : selection manuelle. On laisse l'utilisateur faire Cmd+C.
      alert("Impossible de copier automatiquement. Selectionnez le texte manuellement.")
    }
  }

  const bothText = `Email : ${email}\nMot de passe : ${tempPassword}`

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="medecin-created-title"
    >
      {/* Overlay non-cliquable : on veut forcer le super_admin a copier avant fermeture */}
      <div className="absolute inset-0 bg-marine/40" aria-hidden />

      {/* Sheet */}
      <div className="relative w-full max-w-lg bg-carte rounded-t-card shadow-card animate-slide-up max-h-[92vh] flex flex-col">
        {/* Poignée + header */}
        <div className="flex flex-col items-center pt-3 pb-2 shrink-0">
          <div className="w-10 h-1 rounded-full bg-border" aria-hidden />
        </div>

        <div className="px-5 pb-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-pill bg-olive/15 flex items-center justify-center">
              <CheckCircle2 size={20} className="text-olive" strokeWidth={2} />
            </div>
            <h2 id="medecin-created-title" className="text-h2 text-marine">
              Compte créé
            </h2>
          </div>
        </div>

        {/* Contenu */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Bandeau d'avertissement */}
          <div className="mb-5 px-3 py-2.5 bg-ocre/15 rounded-input flex items-start gap-2.5">
            <AlertTriangle size={18} className="text-ocre-fonce shrink-0 mt-0.5" strokeWidth={2} />
            <p className="text-body-m text-ocre-fonce font-medium leading-snug">
              Ce mot de passe ne sera plus affiché. Copiez-le maintenant et transmettez-le au médecin.
            </p>
          </div>

          {/* Bloc Email */}
          <div className="mb-3">
            <p className="text-field-label mb-1.5">Adresse e-mail</p>
            <div className="px-3 py-3 bg-fond rounded-input">
              <p className="text-body-l text-ink font-mono break-all">{email}</p>
            </div>
          </div>

          {/* Bloc Mot de passe */}
          <div className="mb-5">
            <p className="text-field-label mb-1.5">Mot de passe temporaire</p>
            <div className="px-3 py-3 bg-canard/10 rounded-input border border-canard/30">
              <p className="text-body-l text-ink font-mono break-all select-all">
                {tempPassword}
              </p>
            </div>
          </div>

          {/* Boutons de copie */}
          <div className="flex flex-col gap-2 mb-5">
            <button
              type="button"
              onClick={() => copyToClipboard(tempPassword, 'password')}
              className={`h-11 rounded-input text-button flex items-center justify-center gap-2 transition-colors ${
                copiedField === 'password'
                  ? 'bg-olive text-white'
                  : 'bg-fond text-ink border border-border'
              }`}
            >
              {copiedField === 'password' ? (
                <>
                  <Check size={16} strokeWidth={2.4} />
                  Mot de passe copié
                </>
              ) : (
                <>
                  <Copy size={16} strokeWidth={2} />
                  Copier le mot de passe
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => copyToClipboard(bothText, 'both')}
              className={`h-11 rounded-input text-button flex items-center justify-center gap-2 transition-colors ${
                copiedField === 'both'
                  ? 'bg-olive text-white'
                  : 'bg-fond text-ink border border-border'
              }`}
            >
              {copiedField === 'both' ? (
                <>
                  <Check size={16} strokeWidth={2.4} />
                  Email et mot de passe copiés
                </>
              ) : (
                <>
                  <Copy size={16} strokeWidth={2} />
                  Copier email + mot de passe
                </>
              )}
            </button>
          </div>

          {/* Bouton Terminer */}
          <button
            type="button"
            onClick={onClose}
            className="w-full h-11 rounded-input bg-canard text-white text-button shadow-button"
          >
            Terminer
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
