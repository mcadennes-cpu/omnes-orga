import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Share, Plus, Download, Smartphone, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import AppLayout from '../components/layout/AppLayout'
import useInstallPrompt from '../hooks/useInstallPrompt'

/**
 * Page permanente d'aide à l'installation de la PWA.
 * Accessible depuis le menu Profil → "Installer l'application".
 *
 * Affiche :
 * - Si déjà installée : confirmation visuelle
 * - Sinon, instructions adaptées à la plateforme détectée (iOS / Android / desktop)
 * - Bouton "Installer maintenant" si Android avec deferredPrompt disponible
 */
export default function Installer() {
  const navigate = useNavigate()
  const { platform, isInstalled, deferredPrompt, triggerInstall } = useInstallPrompt()
  const [installing, setInstalling] = useState(false)

  const handleInstall = async () => {
    setInstalling(true)
    try {
      await triggerInstall()
    } finally {
      setInstalling(false)
    }
  }

  const canTriggerNativeInstall = platform === 'android' && deferredPrompt !== null

  return (
    <AppLayout>
      {/* Header sticky avec chevron retour */}
      <header className="sticky top-0 z-20 bg-fond px-4 pt-4 pb-3 border-b border-marine/8">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 text-marine"
            aria-label="Retour"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-h2">Installer l'application</h1>
        </div>
      </header>

      <div className="px-4 pt-6 pb-8 max-w-md mx-auto">
        {/* Cas 1 : déjà installée */}
        {isInstalled && (
          <div className="bg-carte rounded-card p-6 shadow-card text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle2 className="w-12 h-12 text-olive" />
            </div>
            <h2 className="text-h2 mb-2">Application installée</h2>
            <p className="text-body-m text-marine/55">
              Omnès Orga est déjà ajoutée à votre écran d'accueil. Vous l'utilisez actuellement en mode autonome.
            </p>
          </div>
        )}

        {/* Cas 2 : iOS Safari */}
        {!isInstalled && platform === 'ios' && (
          <>
            <div className="bg-carte rounded-card p-6 shadow-card mb-4">
              <div className="flex justify-center mb-4">
                <img
                  src="/apple-touch-icon.png"
                  alt=""
                  className="w-16 h-16 rounded-pill shadow-card"
                />
              </div>
              <h2 className="text-h2 text-center mb-2">Ajouter à l'écran d'accueil</h2>
              <p className="text-body-m text-marine/55 text-center mb-6">
                Sur iPhone, l'installation se fait depuis Safari en quelques étapes :
              </p>

              <div className="space-y-4">
                <StepBlock
                  number="1"
                  text={
                    <>
                      Touchez l'icône <strong>Partager</strong> en bas de Safari
                    </>
                  }
                  icon={<Share className="w-5 h-5 text-canard" />}
                />
                <StepBlock
                  number="2"
                  text={
                    <>
                      Faites défiler et sélectionnez <strong>« Sur l'écran d'accueil »</strong>
                    </>
                  }
                  icon={<Plus className="w-5 h-5 text-canard" />}
                />
                <StepBlock
                  number="3"
                  text={
                    <>
                      Touchez <strong>« Ajouter »</strong> en haut à droite
                    </>
                  }
                />
              </div>
            </div>

            <div className="bg-canard/10 rounded-card p-4">
              <p className="text-caption text-canard-fonce">
                <strong>Important :</strong> l'installation doit se faire depuis Safari. Si vous utilisez Chrome ou un autre navigateur sur iPhone, ouvrez d'abord cette page dans Safari.
              </p>
            </div>
          </>
        )}

        {/* Cas 3 : Android Chrome */}
        {!isInstalled && platform === 'android' && (
          <>
            <div className="bg-carte rounded-card p-6 shadow-card mb-4">
              <div className="flex justify-center mb-4">
                <img
                  src="/apple-touch-icon.png"
                  alt=""
                  className="w-16 h-16 rounded-pill shadow-card"
                />
              </div>
              <h2 className="text-h2 text-center mb-2">Installer l'application</h2>
              <p className="text-body-m text-marine/55 text-center mb-6">
                {canTriggerNativeInstall
                  ? "Appuyez sur le bouton ci-dessous pour ajouter l'application à votre écran d'accueil."
                  : "Suivez les instructions ci-dessous pour ajouter l'application à votre écran d'accueil."}
              </p>

              {canTriggerNativeInstall ? (
                <button
                  type="button"
                  onClick={handleInstall}
                  disabled={installing}
                  className="
                    w-full py-3.5 rounded-input
                    bg-marine text-white text-button shadow-button
                    disabled:opacity-60
                    flex items-center justify-center gap-2
                  "
                >
                  <Download className="w-4 h-4" />
                  {installing ? 'Installation…' : 'Installer maintenant'}
                </button>
              ) : (
                <div className="space-y-4">
                  <StepBlock
                    number="1"
                    text={
                      <>
                        Touchez le <strong>menu Chrome</strong> (les trois points en haut à droite)
                      </>
                    }
                  />
                  <StepBlock
                    number="2"
                    text={
                      <>
                        Sélectionnez <strong>« Installer l'application »</strong> ou <strong>« Ajouter à l'écran d'accueil »</strong>
                      </>
                    }
                  />
                  <StepBlock
                    number="3"
                    text={<>Confirmez en touchant <strong>« Installer »</strong></>}
                  />
                </div>
              )}
            </div>
          </>
        )}

        {/* Cas 4 : desktop ou autre */}
        {!isInstalled && (platform === 'desktop' || platform === 'other') && (
          <div className="bg-carte rounded-card p-6 shadow-card text-center">
            <div className="flex justify-center mb-4">
              <Smartphone className="w-12 h-12 text-marine/35" />
            </div>
            <h2 className="text-h2 mb-2">Installation depuis un mobile</h2>
            <p className="text-body-m text-marine/55">
              Pour installer Omnès Orga, ouvrez cette page sur votre iPhone (avec Safari) ou votre téléphone Android (avec Chrome).
            </p>
          </div>
        )}

        {/* Avantages de l'installation */}
        {!isInstalled && (
          <div className="mt-6 px-2">
            <h3 className="text-eyebrow text-marine/55 mb-3">
              Pourquoi installer l'application ?
            </h3>
            <ul className="space-y-2 text-body-m text-marine">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-olive shrink-0 mt-1" />
                <span>Accès direct depuis l'écran d'accueil</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-olive shrink-0 mt-1" />
                <span>Affichage plein écran, sans barre de navigateur</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-olive shrink-0 mt-1" />
                <span>Notifications push (à venir)</span>
              </li>
            </ul>
          </div>
        )}
      </div>
    </AppLayout>
  )
}

/**
 * Une étape numérotée dans les instructions.
 */
function StepBlock({ number, text, icon }) {
  return (
    <div className="flex items-start gap-3">
      <div className="
        shrink-0
        w-8 h-8 rounded-full
        bg-canard/15 text-canard
        flex items-center justify-center
        text-caption font-bold
      ">
        {number}
      </div>
      <div className="flex-1 text-body-m text-marine flex items-center gap-2 pt-1">
        <span>{text}</span>
        {icon && <span className="shrink-0">{icon}</span>}
      </div>
    </div>
  )
}
