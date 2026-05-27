import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Share, Plus, Download } from 'lucide-react'
import useInstallPrompt from '../../hooks/useInstallPrompt'

/**
 * Bottom-sheet qui propose à l'utilisateur d'installer la PWA.
 *
 * - S'affiche automatiquement au montage si `canShowPrompt === true`.
 * - Sur Android : bouton "Installer" qui déclenche le prompt natif Chrome.
 * - Sur iOS : instructions visuelles "Appuyez sur Partager → Sur l'écran d'accueil".
 * - "Plus tard" : enregistre un timestamp en localStorage, ne réapparaît pas pendant 7 jours.
 *
 * Le composant gère lui-même son cycle de vie (pas de prop `open`/`onClose` à passer).
 * Idée : on le monte dans AppLayout et il décide tout seul s'il s'affiche.
 */
export default function InstallPromptModal() {
  const { platform, canShowPrompt, deferredPrompt, triggerInstall, dismiss } =
    useInstallPrompt()
  const [installing, setInstalling] = useState(false)

  if (!canShowPrompt) return null

  const handleInstall = async () => {
    setInstalling(true)
    try {
      await triggerInstall()
    } finally {
      setInstalling(false)
    }
  }

  // Le bouton "Installer" n'est réellement cliquable que sur Android
  // ET si Chrome a bien émis beforeinstallprompt (deferredPrompt non null).
  // Sur iOS, le bouton n'existe pas — on montre seulement les instructions.
  const canTriggerNativeInstall = platform === 'android' && deferredPrompt !== null

  // Rendu via Portal pour s'assurer que la modale est au-dessus de tout
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-prompt-title"
    >
      {/* Overlay : clic pour dismisser (équivalent "Plus tard") */}
      <div
        className="absolute inset-0 bg-marine/40"
        onClick={dismiss}
        aria-hidden="true"
      />

      {/* Bottom-sheet */}
      <div
        className="
          relative w-full max-w-md
          bg-carte rounded-t-card
          shadow-card
          animate-slide-up
          pb-[max(24px,env(safe-area-inset-bottom))]
          pt-6 px-6
        "
      >
        {/* Bouton fermer en haut à droite */}
        <button
          type="button"
          onClick={dismiss}
          className="absolute top-4 right-4 p-2 text-marine/55 hover:text-marine"
          aria-label="Fermer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icône PWA */}
        <div className="flex justify-center mb-4">
          <img
            src="/apple-touch-icon.png"
            alt=""
            className="w-16 h-16 rounded-pill shadow-card"
          />
        </div>

        {/* Titre */}
        <h2
          id="install-prompt-title"
          className="text-h2 text-center mb-2"
        >
          Installer Omnès Orga
        </h2>

        {/* Sous-titre */}
        <p className="text-body-m text-marine/55 text-center mb-6">
          {platform === 'ios'
            ? "Ajoutez l'application à votre écran d'accueil pour un accès rapide et des notifications."
            : "Ajoutez l'application à votre écran d'accueil pour un accès rapide."}
        </p>

        {/* Instructions iOS (visuelles) */}
        {platform === 'ios' && (
          <div className="space-y-3 mb-6">
            <InstructionStep
              number="1"
              icon={<Share className="w-5 h-5 text-canard" />}
              text={
                <>
                  Touchez l'icône <strong>Partager</strong> en bas de Safari
                </>
              }
            />
            <InstructionStep
              number="2"
              icon={<Plus className="w-5 h-5 text-canard" />}
              text={
                <>
                  Sélectionnez <strong>« Sur l'écran d'accueil »</strong>
                </>
              }
            />
            <InstructionStep
              number="3"
              icon={null}
              text={
                <>
                  Touchez <strong>« Ajouter »</strong> en haut à droite
                </>
              }
            />
          </div>
        )}

        {/* Boutons */}
        <div className="flex flex-col gap-3">
          {canTriggerNativeInstall && (
            <button
              type="button"
              onClick={handleInstall}
              disabled={installing}
              className="
                w-full py-3.5 rounded-input
                bg-marine text-white text-button
                shadow-button
                disabled:opacity-60
                flex items-center justify-center gap-2
              "
            >
              <Download className="w-4 h-4" />
              {installing ? 'Installation…' : 'Installer'}
            </button>
          )}

          <button
            type="button"
            onClick={dismiss}
            className="
              w-full py-3.5 rounded-input
              bg-fond text-marine text-button
            "
          >
            Plus tard
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

/**
 * Une étape numérotée dans les instructions iOS.
 */
function InstructionStep({ number, icon, text }) {
  return (
    <div className="flex items-start gap-3">
      <div className="
        shrink-0
        w-7 h-7 rounded-full
        bg-canard/15 text-canard
        flex items-center justify-center
        text-caption font-bold
      ">
        {number}
      </div>
      <div className="flex-1 text-body-m text-marine flex items-center gap-2 pt-0.5">
        <span>{text}</span>
        {icon && <span className="shrink-0">{icon}</span>}
      </div>
    </div>
  )
}
