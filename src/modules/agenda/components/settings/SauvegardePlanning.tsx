import { useState } from 'react';
import { CircleAlert, CircleCheck, HardDriveDownload, Loader2 } from 'lucide-react';
import { Profile } from '../../lib/supabase';
import {
  decrireSauvegarde,
  lireDerniereSauvegarde,
  sauvegarderPlanning,
  sauvegardeEnRetard,
} from '../../lib/sauvegardePlanning';
import { useToast } from '../ui/ActionToast';

type Props = {
  currentUser: Profile;
};

export default function SauvegardePlanning({ currentUser }: Props) {
  const [derniere, setDerniere] = useState<Date | null>(() => lireDerniereSauvegarde());
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState('');
  const { signaler } = useToast();

  const enRetard = sauvegardeEnRetard(derniere);

  const lancer = async () => {
    setEnCours(true);
    setErreur('');
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
      setErreur(resultat.erreur);
    }
  };

  return (
    <div className="rounded-card border border-border bg-carte p-6 shadow-card">
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-pill bg-canard/10 p-2">
          <HardDriveDownload className="h-6 w-6 text-canard" />
        </div>
        <div>
          <h2 className="text-h2 text-ink">Sauvegarde du planning</h2>
          <p className="text-caption">Une copie du planning, téléchargée sur cet appareil</p>
        </div>
      </div>

      <p className="mb-4 max-w-2xl text-body-m text-muted">
        Le fichier contient les gardes, les demandes, le journal d'activité, les sites, les
        horaires, les plans de roulement et les modèles. Gardez-le sur l'ordinateur du
        cabinet : il permettra de reconstituer le planning en cas de problème.
      </p>

      {enRetard ? (
        <div className="mb-6 flex items-start gap-3 rounded-card border border-ocre/30 bg-ocre/10 p-4">
          <CircleAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-ocre-fonce" />
          <p className="text-body-m text-ocre-fonce">
            {derniere
              ? `Dernière sauvegarde sur cet appareil : ${decrireSauvegarde(derniere)}. Pensez à en faire une nouvelle.`
              : 'Aucune sauvegarde enregistrée sur cet appareil.'}
          </p>
        </div>
      ) : (
        <div className="mb-6 flex items-start gap-3 rounded-card border border-canard/30 bg-canard/5 p-4">
          <CircleCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-canard" />
          <p className="text-body-m text-ink">
            Dernière sauvegarde sur cet appareil : {derniere ? decrireSauvegarde(derniere) : ''}.
          </p>
        </div>
      )}

      <button
        onClick={lancer}
        disabled={enCours}
        className="flex items-center gap-2 rounded-input bg-canard px-6 py-3 text-button text-white shadow-button transition-colors hover:bg-canard/90 disabled:opacity-50"
      >
        {enCours ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <HardDriveDownload className="h-4 w-4" />
        )}
        {enCours ? 'Sauvegarde en cours…' : 'Sauvegarder le planning'}
      </button>

      {erreur && <p className="mt-3 text-body-m text-brique">{erreur}</p>}
    </div>
  );
}
