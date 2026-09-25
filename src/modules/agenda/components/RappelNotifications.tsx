import { useState } from 'react';
import { Bell, BellOff, Loader2, Smartphone, X } from 'lucide-react';
import { useNotifications } from '../../../hooks/useNotifications';

// ---------------------------------------------------------------------------
// Bandeau d'activation des notifications, en tete du Planning (8R-5).
//
// POURQUOI
// Le 25/09/2026, 2 remplacants actifs sur 23 avaient active les notifications :
// les push du Planning (8R-2, 8R-3) n'atteignaient presque personne. Le bouton
// existe dans le Profil, mais personne n'y va sans raison ; le Planning est la
// page ou l'on comprend a quoi servent ces notifications.
//
// QUAND IL S'AFFICHE
// Seulement si le profil n'a AUCUN jeton enregistre (profiles.fcm_token) : on
// sait alors avec certitude que la personne ne recoit rien, quel que soit
// l'appareil. Trois textes selon ce que le telephone permet :
//   - notifications possibles  -> bouton « Activer » (meme mecanique que le
//     Profil : useNotifications, geste utilisateur exige par iOS) ;
//   - non supportees (iPhone, appli pas installee) -> comment installer ;
//   - bloquees par la personne -> ou les reactiver, sans bouton inutile.
// « Plus tard » le masque 7 jours, comme la proposition d'installation
// (InstallPromptModal) : un rappel qu'on ne peut pas fermer deviendrait du
// bruit, un rappel ferme pour toujours ne servirait qu'une fois.
// ---------------------------------------------------------------------------

const CLE_REPORT = 'agenda-rappel-notifications';
const JOURS_REPORT = 7;

function estReporte(): boolean {
  try {
    const valeur = Number(localStorage.getItem(CLE_REPORT));
    return valeur > 0 && Date.now() - valeur < JOURS_REPORT * 24 * 3600 * 1000;
  } catch {
    return false; // stockage indisponible : on affiche, simplement
  }
}

type Props = {
  aUnJeton: boolean;
};

export default function RappelNotifications({ aUnJeton }: Props) {
  const { supported, permission, enabling, error, enableNotifications } = useNotifications();
  const [masque, setMasque] = useState(() => estReporte());
  const [active, setActive] = useState(false);

  // supported === null : detection en cours, rien plutot qu'un clignotement.
  if (aUnJeton || masque || supported === null) return null;

  if (active) {
    return (
      <div className="mb-6 flex items-center gap-3 rounded-card border border-canard/30 bg-canard/10 p-4">
        <Bell className="h-5 w-5 flex-shrink-0 text-canard" />
        <p className="text-body-m text-ink">
          Notifications activées : vous serez prévenu de vos gardes sur cet appareil.
        </p>
      </div>
    );
  }

  const reporter = () => {
    try {
      localStorage.setItem(CLE_REPORT, String(Date.now()));
    } catch {
      // stockage indisponible : masque pour cette visite seulement
    }
    setMasque(true);
  };

  const activer = async () => {
    if (await enableNotifications()) setActive(true);
  };

  let Icone = Bell;
  let texte = 'Activez les notifications pour être prévenu de vos gardes : validation, attribution, retrait, nouvelles semaines ouvertes.';
  if (!supported) {
    Icone = Smartphone;
    texte = "Pour être prévenu de vos gardes, installez d'abord l'application sur votre écran d'accueil (sur iPhone : bouton Partager, puis « Sur l'écran d'accueil »), puis rouvrez le Planning depuis l'icône.";
  } else if (permission === 'denied') {
    Icone = BellOff;
    texte = 'Les notifications sont bloquées sur cet appareil. Réactivez-les dans les réglages du téléphone pour être prévenu de vos gardes.';
  }
  const peutActiver = supported && permission !== 'denied';

  return (
    <div className="mb-6 rounded-card border border-canard/30 bg-canard/10 p-4">
      <div className="flex items-start gap-3">
        <Icone className="mt-0.5 h-5 w-5 flex-shrink-0 text-canard" />
        <p className="flex-1 text-body-m text-ink">{texte}</p>
        <button
          onClick={reporter}
          aria-label="Masquer ce rappel pendant 7 jours"
          className="-m-1 flex-shrink-0 rounded-pill p-1 text-muted transition-colors hover:bg-canard/10"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {peutActiver && (
        <button
          onClick={activer}
          disabled={enabling}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-input bg-canard px-5 py-2.5 text-button text-white shadow-button transition-colors hover:bg-canard/90 disabled:opacity-50 md:w-auto"
        >
          {enabling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
          {enabling ? 'Activation…' : 'Activer les notifications'}
        </button>
      )}

      {error && <p className="mt-3 text-caption text-brique">{error}</p>}
    </div>
  );
}
