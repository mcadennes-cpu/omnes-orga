import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import {
  ChevronLeft, ArrowRightLeft, CalendarClock, TriangleAlert, CheckCircle2, Loader2,
} from 'lucide-react';
import ConfirmDialog from '../../../../components/common/ConfirmDialog';
import RotationPlanGrid, { codeCreneau, initiales } from './RotationPlanGrid';

// ---------------------------------------------------------------------------
// Differentiel et activation d'un plan de roulement (MOD-1, etape 6F).
//
// « Tout ecart du reel doit etre visible plutot que silencieux » : c'est le
// principe directeur de MOD-1, et cet ecran en est l'application au moment le
// plus sensible -- la bascule d'un roulement a l'autre. La derive de 2026 a
// justement pu s'installer parce que personne ne la voyait.
//
// L'activation passe par agenda.activer_plan_roulement() : les policies RLS
// n'accordent aucune ecriture directe sur les plans.
// ---------------------------------------------------------------------------

type Regle = {
  rotation_week: number;
  weekday: number;
  doctor: { id: string; full_name: string } | null;
  site: { id: string; name: string } | null;
  shift_type: { id: string; name: string } | null;
};

type Changement = {
  cle: string;
  semaine: number;
  weekday: number;
  site: string;
  code: string;
  avant: string[];
  apres: string[];
  nature: 'ajout' | 'retrait' | 'modification';
};

const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

const NATURE_LABEL: Record<Changement['nature'], string> = {
  ajout: 'Ajoutée',
  retrait: 'Supprimée',
  modification: 'Modifiée',
};

const NATURE_CLASS: Record<Changement['nature'], string> = {
  ajout: 'bg-canard/15 text-canard',
  retrait: 'bg-brique/15 text-brique',
  modification: 'bg-ocre/15 text-ocre-fonce',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

// Le lundi qui suit une date donnee. Sert de valeur par defaut : la fonction
// d'activation n'accepte que des lundis (une bascule en milieu de semaine
// ferait relever cette semaine de deux plans a la fois).
function prochainLundi(depuis: Date): string {
  const d = new Date(depuis);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Index d'un plan : `semaine|weekday|site|code` -> initiales triees.
function indexer(regles: Regle[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const r of regles) {
    if (!r.site || !r.shift_type) continue;
    const cle = `${r.rotation_week}|${r.weekday}|${r.site.name}|${codeCreneau(r.shift_type.name, r.site.name)}`;
    const ini = r.doctor ? initiales(r.doctor.full_name) : '?';
    index.set(cle, [...(index.get(cle) ?? []), ini].sort());
  }
  return index;
}

type RotationPlanDiffProps = {
  brouillon: { id: string; name: string; cycle_length_weeks: number; start_date: string };
  actif: { id: string; name: string; cycle_length_weeks: number } | null;
  onRetour: () => void;
  onActive: () => void;
};

export default function RotationPlanDiff({
  brouillon, actif, onRetour, onActive,
}: RotationPlanDiffProps) {
  const [reglesBrouillon, setReglesBrouillon] = useState<Regle[]>([]);
  const [reglesActif, setReglesActif] = useState<Regle[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState('');
  const [dateBascule, setDateBascule] = useState(() => prochainLundi(new Date()));
  const [confirmation, setConfirmation] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [fait, setFait] = useState<{ sortant: string | null; date: string } | null>(null);

  useEffect(() => {
    const charger = async () => {
      setLoading(true);
      const select = `
        rotation_week, weekday,
        doctor:profiles!doctor_id(id, full_name),
        site:sites(id, name),
        shift_type:shift_types(id, name)
      `;
      try {
        const [b, a] = await Promise.all([
          supabase.from('rotation_plan_rules').select(select).eq('plan_id', brouillon.id),
          actif
            ? supabase.from('rotation_plan_rules').select(select).eq('plan_id', actif.id)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (b.error) throw b.error;
        if (a.error) throw a.error;
        setReglesBrouillon((b.data ?? []) as unknown as Regle[]);
        setReglesActif((a.data ?? []) as unknown as Regle[]);
      } catch (err: any) {
        setErreur(err.message);
      } finally {
        setLoading(false);
      }
    };
    charger();
  }, [brouillon.id, actif?.id]);

  const changements = useMemo<Changement[]>(() => {
    const avant = indexer(reglesActif);
    const apres = indexer(reglesBrouillon);
    const liste: Changement[] = [];

    for (const cle of new Set([...avant.keys(), ...apres.keys()])) {
      const a = avant.get(cle) ?? [];
      const b = apres.get(cle) ?? [];
      if (a.join('·') === b.join('·')) continue;

      const [semaine, weekday, site, code] = cle.split('|');
      liste.push({
        cle, semaine: Number(semaine), weekday: Number(weekday), site, code,
        avant: a, apres: b,
        nature: a.length === 0 ? 'ajout' : b.length === 0 ? 'retrait' : 'modification',
      });
    }

    // Ordre de lecture du roulement : semaine, puis jour (lundi en tete), puis
    // site et creneau.
    const ordreJour = (w: number) => (w === 0 ? 7 : w);
    return liste.sort((x, y) =>
      x.semaine - y.semaine ||
      ordreJour(x.weekday) - ordreJour(y.weekday) ||
      x.site.localeCompare(y.site) ||
      x.code.localeCompare(y.code));
  }, [reglesActif, reglesBrouillon]);

  const highlight = useMemo(() => new Set(changements.map((c) => c.cle)), [changements]);
  const compte = (n: Changement['nature']) => changements.filter((c) => c.nature === n).length;

  const cyclesDifferents = actif && actif.cycle_length_weeks !== brouillon.cycle_length_weeks;

  const activer = async () => {
    setEnCours(true);
    setErreur('');
    try {
      const controle = await supabase.rpc('activer_plan_roulement', {
        p_plan_id: brouillon.id,
        p_effective_from: dateBascule,
        p_verifier_seulement: true,
      });
      if (controle.error) throw controle.error;

      const ecriture = await supabase.rpc('activer_plan_roulement', {
        p_plan_id: brouillon.id,
        p_effective_from: dateBascule,
        p_verifier_seulement: false,
      });
      if (ecriture.error) throw ecriture.error;

      setConfirmation(false);
      setFait({ sortant: ecriture.data?.sortant?.nom ?? null, date: dateBascule });
      onActive();
    } catch (err: any) {
      setErreur(err.message);
      setConfirmation(false);
    } finally {
      setEnCours(false);
    }
  };

  if (fait) {
    return (
      <div className="rounded-card border border-border bg-carte p-6 shadow-card">
        <div className="rounded-card border border-canard/30 bg-canard/5 p-6 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-canard" />
          <p className="text-body-l font-semibold text-ink">{brouillon.name}</p>
          <p className="mt-1 text-body-m text-ink">
            En vigueur à partir du {formatDate(fait.date)}.
          </p>
          {fait.sortant && (
            <p className="mx-auto mt-2 max-w-md text-caption">
              « {fait.sortant} » reste consultable et continue de s'appliquer aux dates
              antérieures — les plannings déjà publiés ne bougent pas.
            </p>
          )}
          <button
            onClick={onRetour}
            className="mt-5 rounded-input bg-marine px-5 py-2.5 text-button text-white shadow-button transition-opacity hover:opacity-90"
          >
            Revenir aux plans
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-border bg-carte p-6 shadow-card">
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={onRetour}
          className="rounded-pill p-1.5 transition-colors hover:bg-fond"
          aria-label="Retour aux plans de roulement"
        >
          <ChevronLeft size={22} strokeWidth={2} className="text-marine" />
        </button>
        <div>
          <h2 className="text-h2 text-ink">Comparer et activer</h2>
          <p className="text-caption">{brouillon.name}</p>
        </div>
      </div>

      {erreur && (
        <div className="mb-4 flex items-start gap-2 rounded-input border border-brique/20 bg-brique/10 px-4 py-3 text-body-m text-brique">
          <TriangleAlert className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <span>{erreur}</span>
        </div>
      )}

      {loading ? (
        <p className="text-caption">Chargement du différentiel…</p>
      ) : (
        <>
          <div className="mb-5 flex items-start gap-3 rounded-card border border-border bg-fond p-4">
            <ArrowRightLeft className="mt-0.5 h-5 w-5 flex-shrink-0 text-canard" />
            <div>
              <p className="text-body-m text-ink">
                {actif ? (
                  <>
                    <strong>{changements.length}</strong>{' '}
                    {changements.length > 1 ? 'changements' : 'changement'} par rapport à
                    « {actif.name} » — {compte('ajout')} ajoutées, {compte('modification')}{' '}
                    modifiées, {compte('retrait')} supprimées.
                  </>
                ) : (
                  <>
                    Aucun plan en vigueur : les {reglesBrouillon.length} affectations de ce
                    plan sont toutes nouvelles.
                  </>
                )}
              </p>
              {cyclesDifferents && (
                <p className="mt-2 text-caption">
                  Les deux plans n'ont pas la même durée de cycle ({actif!.cycle_length_weeks}{' '}
                  contre {brouillon.cycle_length_weeks} semaines) : la comparaison se fait
                  numéro de semaine à numéro de semaine, ce qui reste indicatif.
                </p>
              )}
            </div>
          </div>

          {changements.length > 0 && (
            <div className="mb-5 overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {['', 'Semaine', 'Jour', 'Site', 'Créneau', 'Avant', 'Après'].map((t) => (
                      <th
                        key={t}
                        className="border border-border bg-fond px-2 py-1.5 text-left text-field-label text-ink whitespace-nowrap"
                      >
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {changements.map((c) => (
                    <tr key={c.cle}>
                      <td className="border border-border px-2 py-1.5">
                        <span className={`rounded-pill px-2 py-0.5 text-caption ${NATURE_CLASS[c.nature]}`}>
                          {NATURE_LABEL[c.nature]}
                        </span>
                      </td>
                      <td className="border border-border px-2 py-1.5 text-body-m text-ink">S{c.semaine}</td>
                      <td className="border border-border px-2 py-1.5 text-body-m text-ink">{JOURS[c.weekday]}</td>
                      <td className="border border-border px-2 py-1.5 text-body-m text-ink">{c.site}</td>
                      <td className="border border-border px-2 py-1.5 text-body-m text-ink">{c.code}</td>
                      <td className="border border-border px-2 py-1.5 text-body-m text-muted">
                        {c.avant.join(' · ') || '—'}
                      </td>
                      <td className="border border-border px-2 py-1.5 text-body-m font-semibold text-ink">
                        {c.apres.join(' · ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-field-label mb-2">Grille du plan à activer</p>
          <p className="mb-3 text-caption">
            Les cases qui changent sont en évidence.
          </p>
          <div className="mb-6">
            <RotationPlanGrid
              planId={brouillon.id}
              cycleLength={brouillon.cycle_length_weeks}
              highlight={highlight}
            />
          </div>

          <div className="rounded-card border border-marine/20 bg-marine/5 p-4">
            <div className="mb-3 flex items-start gap-3">
              <CalendarClock className="mt-0.5 h-5 w-5 flex-shrink-0 text-marine" />
              <p className="text-body-m text-ink">
                Date d'entrée en vigueur
                <span className="mt-1 block text-caption">
                  Un lundi, dans le futur. Les semaines déjà ouvertes gardent leurs gardes :
                  seules celles ouvertes après cette date suivront le nouveau plan.
                </span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="date"
                value={dateBascule}
                onChange={(e) => setDateBascule(e.target.value)}
                className="rounded-input border border-border bg-carte px-3 py-2 text-body-m text-ink"
              />
              <button
                onClick={() => setConfirmation(true)}
                disabled={!dateBascule || enCours}
                className="flex items-center gap-2 rounded-input bg-marine px-5 py-2.5 text-button text-white shadow-button transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {enCours && <Loader2 className="h-4 w-4 animate-spin" />}
                Activer ce plan
              </button>
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmation}
        title="Activer ce plan de roulement ?"
        message={
          `« ${brouillon.name} » s'appliquera à partir du ${formatDate(dateBascule)}` +
          (actif ? `, en remplacement de « ${actif.name} ».` : '.') +
          ` ${changements.length} ${changements.length > 1 ? 'cases changent' : 'case change'}.` +
          ' Les gardes déjà générées ne sont pas modifiées.'
        }
        confirmLabel="Activer"
        onConfirm={activer}
        onCancel={() => setConfirmation(false)}
        submitting={enCours}
      />
    </div>
  );
}
