import { useState, useEffect, useCallback } from 'react';
import { CalendarPlus, Loader2 } from 'lucide-react';
import BottomSheet from './ui/BottomSheet';
import { supabase } from '../lib/supabase';

// ---------------------------------------------------------------------------
// Ouvrir les N prochaines semaines depuis le plan (MOD-1, etape 6H).
//
// Remplace le trio « semaine de reference -> modele -> duplication ». Le plan
// de roulement decrit deja toutes les cases des associes ; il ne manquait que
// les creneaux HORS ROULEMENT (J5, J6, J7/J8 de Dijon), ceux qui vont aux
// remplacants. La base les deduit de ce qui est ouvert d'habitude, et cet
// ecran les propose coches -- une deduction sur l'historique reproduirait
// fidelement une anomalie passee, donc le coordinateur garde la main.
//
// Tout passe par agenda.ouvrir_semaines(), qui insere en une seule fois. La
// duplication de modele faisait une requete d'existence par case et par jour :
// environ 380 allers-retours enchaines pour 8 semaines.
// ---------------------------------------------------------------------------

type CreneauHorsPlan = {
  weekday: number;
  site_id: string;
  site_nom: string;
  shift_type_id: string;
  creneau_nom: string;
  salle_nom: string | null;
  occurrences: number;
  habituel: boolean;
};

type Rapport = {
  total: number;
  affectees: number;
  libres: number;
  depuis_le_plan: number;
  hors_plan: number;
  debut: string;
  fin: string;
};

const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

const fieldClass =
  'w-full rounded-input border border-border bg-carte px-3 py-2 text-body-m text-ink ' +
  'focus:border-canard focus:outline-none focus:ring-2 focus:ring-canard/30';

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

function versIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type OpenWeeksModalProps = {
  onClose: () => void;
  onOpened: () => void;
};

export default function OpenWeeksModal({ onClose, onOpened }: OpenWeeksModalProps) {
  const [debut, setDebut] = useState('');
  const [semaines, setSemaines] = useState(8);
  const [creneaux, setCreneaux] = useState<CreneauHorsPlan[]>([]);
  const [coches, setCoches] = useState<Set<string>>(new Set());
  const [rapport, setRapport] = useState<Rapport | null>(null);
  const [chargement, setChargement] = useState(true);
  const [calcul, setCalcul] = useState(false);
  const [ecriture, setEcriture] = useState(false);
  const [erreur, setErreur] = useState('');

  const cle = (c: CreneauHorsPlan) => `${c.weekday}|${c.site_id}|${c.shift_type_id}`;

  useEffect(() => {
    const preparer = async () => {
      try {
        // Le lundi qui suit la derniere garde generee : c'est la ou le
        // calendrier s'arrete, donc la ou Charlotte veut reprendre.
        const { data: derniere } = await supabase
          .from('shifts').select('date').order('date', { ascending: false }).limit(1);

        const apres = derniere?.[0]?.date
          ? new Date(derniere[0].date + 'T12:00:00')
          : new Date();
        apres.setDate(apres.getDate() + 1);
        while (apres.getDay() !== 1) apres.setDate(apres.getDate() + 1);
        setDebut(versIso(apres));

        const { data, error } = await supabase.rpc('creneaux_hors_plan', {
          p_semaines_reference: 9,
        });
        if (error) throw error;

        const liste = (data ?? []) as CreneauHorsPlan[];
        setCreneaux(liste);
        setCoches(new Set(liste.filter((c) => c.habituel).map(cle)));
      } catch (err: any) {
        setErreur(err.message);
      } finally {
        setChargement(false);
      }
    };
    preparer();
  }, []);

  const horsPlanChoisis = useCallback(
    () =>
      creneaux
        .filter((c) => coches.has(cle(c)))
        .map((c) => ({
          weekday: c.weekday,
          site_id: c.site_id,
          shift_type_id: c.shift_type_id,
        })),
    [creneaux, coches],
  );

  // Verification a blanc a chaque changement : le coordinateur voit ce qu'il
  // va creer avant de le creer. C'est la base qui compte, pas l'ecran.
  useEffect(() => {
    if (!debut || semaines < 1 || chargement) return;
    let annule = false;

    const calculer = async () => {
      setCalcul(true);
      setErreur('');
      try {
        const { data, error } = await supabase.rpc('ouvrir_semaines', {
          p_debut: debut,
          p_semaines: semaines,
          p_hors_plan: horsPlanChoisis(),
          p_verifier_seulement: true,
        });
        if (annule) return;
        if (error) throw error;
        setRapport(data as Rapport);
      } catch (err: any) {
        if (!annule) {
          setRapport(null);
          setErreur(err.message);
        }
      } finally {
        if (!annule) setCalcul(false);
      }
    };

    const minuteur = setTimeout(calculer, 250);
    return () => {
      annule = true;
      clearTimeout(minuteur);
    };
  }, [debut, semaines, coches, chargement, horsPlanChoisis]);

  const ouvrir = async () => {
    setEcriture(true);
    setErreur('');
    try {
      const { error } = await supabase.rpc('ouvrir_semaines', {
        p_debut: debut,
        p_semaines: semaines,
        p_hors_plan: horsPlanChoisis(),
        p_verifier_seulement: false,
      });
      if (error) throw error;
      onOpened();
      onClose();
    } catch (err: any) {
      setErreur(err.message);
      setEcriture(false);
    }
  };

  const parJour = JOURS.map((label, weekday) => ({
    label,
    weekday,
    items: creneaux.filter((c) => c.weekday === weekday),
  })).filter((g) => g.items.length > 0);

  return (
    <BottomSheet
      title="Ouvrir des semaines"
      onClose={onClose}
      busy={ecriture}
      footer={
        <>
          <button
            onClick={onClose}
            disabled={ecriture}
            className="h-12 flex-1 rounded-input border border-border text-button text-marine disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={ouvrir}
            disabled={ecriture || calcul || !rapport || rapport.total === 0}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-input bg-marine text-button text-white shadow-button transition-colors hover:bg-marine/90 disabled:opacity-50"
          >
            {ecriture ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
            {ecriture ? 'Ouverture…' : 'Ouvrir'}
          </button>
        </>
      }
    >
      {chargement ? (
        <p className="text-caption">Chargement…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1">
              <label className="mb-2 block text-field-label">Premier lundi</label>
              <input
                type="date"
                value={debut}
                onChange={(e) => setDebut(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div className="w-32">
              <label className="mb-2 block text-field-label">Semaines</label>
              <input
                type="number"
                min={1}
                max={52}
                value={semaines}
                onChange={(e) => setSemaines(Number(e.target.value))}
                className={fieldClass}
              />
            </div>
          </div>

          {rapport && !erreur && (
            <div className="rounded-input border border-canard/30 bg-canard/5 p-3">
              <p className="text-body-m text-ink">
                Du {formatDate(rapport.debut)} au {formatDate(rapport.fin)} :{' '}
                <strong>{rapport.total} gardes</strong> seront créées.
              </p>
              <p className="mt-1 text-caption">
                {rapport.affectees} pré-affectées par le plan de roulement,{' '}
                {rapport.libres} laissées libres pour les remplaçants.
              </p>
            </div>
          )}

          {erreur && (
            <div className="rounded-input border border-brique/20 bg-brique/10 p-3 text-body-m text-brique">
              {erreur}
            </div>
          )}

          <div>
            <p className="text-field-label mb-1">Créneaux hors roulement</p>
            <p className="mb-3 text-caption">
              Le plan ne les connaît pas — ce sont les créneaux des remplaçants. Ceux
              ouverts d'habitude sont cochés.
            </p>
            <div className="space-y-3">
              {parJour.map((groupe) => (
                <div key={groupe.weekday}>
                  <p className="mb-1 text-caption font-semibold text-ink">{groupe.label}</p>
                  <div className="space-y-1">
                    {groupe.items.map((c) => (
                      <label
                        key={cle(c)}
                        className="flex cursor-pointer items-center gap-2 text-body-m text-ink"
                      >
                        <input
                          type="checkbox"
                          checked={coches.has(cle(c))}
                          onChange={(e) => {
                            const suivant = new Set(coches);
                            if (e.target.checked) suivant.add(cle(c));
                            else suivant.delete(cle(c));
                            setCoches(suivant);
                          }}
                          className="h-4 w-4 rounded border-border text-canard focus:ring-canard/30"
                        />
                        <span>
                          {c.creneau_nom}
                          {c.salle_nom ? ` · ${c.salle_nom}` : ''}
                        </span>
                        {!c.habituel && (
                          <span className="rounded-pill bg-ocre/15 px-2 py-0.5 text-caption text-ocre-fonce">
                            {c.occurrences} fois sur 9 semaines
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-input border border-marine/20 bg-marine/5 p-3 text-body-m text-ink">
            L'ouverture ne se fait que sur un calendrier vide. Les gardes déjà créées ne
            sont jamais modifiées.
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
