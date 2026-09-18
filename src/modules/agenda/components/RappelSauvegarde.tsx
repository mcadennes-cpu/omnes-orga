import { useState } from 'react';
import { CircleAlert, HardDriveDownload, Loader2 } from 'lucide-react';
import { Profile } from '../lib/supabase';
import {
  JOURS_AVANT_RAPPEL,
  decrireSauvegarde,
  lireDerniereSauvegarde,
  sauvegarderPlanning,
  sauvegardeEnRetard,
} from '../lib/sauvegardePlanning';
import { useToast } from './ui/ActionToast';

// ---------------------------------------------------------------------------
// Bandeau de rappel, en tete de « Validation » (8J-3).
//
// POURQUOI ICI ET PAS SEULEMENT DANS LES PARAMETRES
// Le coordinateur ne passe pas dans Paramètres toutes les semaines : un rappel
// qui n'y vit que ne serait jamais vu. « Validation » est son onglet d'accueil.
// Le bandeau ne s'affiche qu'en retard (plus de 7 jours, ou aucune sauvegarde
// connue sur cet appareil) et disparait des que la sauvegarde est faite.
// ---------------------------------------------------------------------------

type Props = {
  currentUser: Profile;
};

export default function RappelSauvegarde({ currentUser }: Props) {
  const [derniere, setDerniere] = useState<Date | null>(() => lireDerniereSauvegarde());
  const [enCours, setEnCours] = useState(false);
  const { signaler } = useToast();

  if (!sauvegardeEnRetard(derniere)) return null;

  const lancer = async () => {
    setEnCours(true);
    const resultat = await sauvegarderPlanning(currentUser);
    setEnCours(false);
    if (resultat.ok) {
      setDerniere(resultat.date);
      const mo = (resultat.octets / 1000000).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
      signaler(
        `Sauvegarde téléchargée : ${resultat.lignes.toLocaleString('fr-FR')} lignes, ${mo} Mo.`,
        'succes'
      );
    } else {
      signaler(resultat.erreur, 'erreur');
    }
  };

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-card border border-ocre/30 bg-ocre/10 p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-start gap-3">
        <CircleAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-ocre-fonce" />
        <p className="text-body-m text-ocre-fonce">
          {derniere
            ? `Dernière sauvegarde du planning sur cet appareil : ${decrireSauvegarde(derniere)}.`
            : `Aucune sauvegarde du planning sur cet appareil. Pensez à en faire une toutes les semaines.`}
          {derniere ? ` Il est conseillé d'en faire une tous les ${JOURS_AVANT_RAPPEL} jours.` : ''}
        </p>
      </div>
      <button
        onClick={lancer}
        disabled={enCours}
        className="flex flex-shrink-0 items-center justify-center gap-2 rounded-input bg-canard px-5 py-2.5 text-button text-white shadow-button transition-colors hover:bg-canard/90 disabled:opacity-50"
      >
        {enCours ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <HardDriveDownload className="h-4 w-4" />
        )}
        {enCours ? 'Sauvegarde en cours…' : 'Sauvegarder maintenant'}
      </button>
    </div>
  );
}
