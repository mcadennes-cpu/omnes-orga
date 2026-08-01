import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Repeat, FileSpreadsheet, Lock, ChevronDown, ChevronRight, Upload } from 'lucide-react';
import RotationPlanGrid from './RotationPlanGrid';
import RotationPlanImport from './RotationPlanImport';

// ---------------------------------------------------------------------------
// Consultation des plans de roulement (MOD-1, etape 6C-3).
//
// Cet ecran permettait auparavant de modifier la date de debut et la duree du
// cycle. C'etait le defaut n.2 de MOD-1 : la semaine de roulement etant un
// modulo depuis une date globale, passer le cycle de 8 a 9 semaines decalait
// RETROACTIVEMENT toutes les semaines, y compris les plannings deja publies.
//
// Depuis 6B, chaque plan porte son propre ancrage et sa propre periode. Et
// depuis la decision du 01/08/2026 (« une seule verite »), le roulement vient
// du fichier valide : l'application ne l'ecrit jamais. Les policies RLS
// n'accordent d'ailleurs aucune ecriture, pas meme aux coordinateurs.
//
// Cet ecran est donc en lecture seule. Sa version complete -- import, ecran de
// correspondance, differentiel, activation datee -- est l'objet de 6D a 6F.
// ---------------------------------------------------------------------------

type RotationPlanRow = {
  id: string;
  name: string;
  start_date: string;
  cycle_length_weeks: number;
  status: string;
  effective_from: string | null;
  effective_to: string | null;
  source_file_name: string | null;
  rotation_plan_rules: { count: number }[];
};

// Parse en date LOCALE : new Date('2026-01-04') serait interprete en UTC et
// pourrait afficher la veille selon le fuseau.
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

const STATUT_LABEL: Record<string, string> = {
  draft: 'Brouillon',
  active: 'En vigueur',
  archived: 'Archivé',
};

const STATUT_CLASS: Record<string, string> = {
  draft: 'bg-ocre/15 text-ocre-fonce',
  active: 'bg-canard/15 text-canard',
  archived: 'bg-fond text-muted',
};

export default function RotationManagement() {
  const [plans, setPlans] = useState<RotationPlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Grille depliee. La grille du plan en vigueur s'ouvre d'office : c'est
  // l'information que la coordinatrice vient chercher ici.
  const [planDeplie, setPlanDeplie] = useState<string | null>(null);
  // L'import prend toute la carte plutot que d'ouvrir une modale : le contenu
  // (recapitulatif, correspondances, anomalies) est trop dense pour une
  // bottom-sheet, et c'est un parcours, pas une saisie ponctuelle.
  const [importEnCours, setImportEnCours] = useState(false);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      const { data, error: queryError } = await supabase
        .from('rotation_plans')
        .select('id, name, start_date, cycle_length_weeks, status, effective_from, effective_to, source_file_name, rotation_plan_rules(count)')
        .order('effective_from', { ascending: false, nullsFirst: false });

      if (queryError) throw queryError;
      const rows = data ?? [];
      setPlans(rows);
      setPlanDeplie((rows.find((p) => p.status === 'active') ?? rows[0])?.id ?? null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const aujourdhui = new Date().toISOString().split('T')[0];
  const estEnVigueur = (p: RotationPlanRow) =>
    p.status === 'active' &&
    !!p.effective_from &&
    p.effective_from <= aujourdhui &&
    (p.effective_to === null || aujourdhui <= p.effective_to);

  if (importEnCours) {
    return (
      <RotationPlanImport
        onRetour={() => setImportEnCours(false)}
        onImporte={loadPlans}
      />
    );
  }

  return (
    <div className="rounded-card border border-border bg-carte p-6 shadow-card">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-pill bg-canard/10 p-2">
            <Repeat className="h-6 w-6 text-canard" />
          </div>
          <div>
            <h2 className="text-h2 text-ink">Plans de roulement</h2>
            <p className="text-caption">Cycle de rotation des associés</p>
          </div>
        </div>
        <button
          onClick={() => setImportEnCours(true)}
          className="flex items-center gap-2 rounded-input bg-marine px-4 py-2.5 text-button text-white shadow-button transition-opacity hover:opacity-90"
        >
          <Upload size={17} strokeWidth={2} />
          Importer un plan
        </button>
      </div>

      <div className="mb-6 flex items-start gap-3 rounded-card border border-marine/20 bg-marine/5 p-4">
        <Lock className="mt-0.5 h-5 w-5 flex-shrink-0 text-marine" />
        <p className="text-body-m text-ink">
          Le roulement se modifie dans le <strong>fichier de roulement</strong>, jamais ici :
          c'est la seule façon de garantir que le planning corresponde toujours au fichier
          validé par les associés.
          <span className="mt-2 block text-caption">
            Pour faire évoluer le roulement, mettre le fichier à jour puis l'importer en
            choisissant sa date d'entrée en vigueur. Le plan en cours est alors archivé et
            reste consultable.
          </span>
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-input border border-brique/20 bg-brique/10 px-4 py-3 text-body-m text-brique">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-caption">Chargement…</p>
      ) : plans.length === 0 ? (
        <p className="text-caption">Aucun plan de roulement enregistré.</p>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-card border p-4 ${
                estEnVigueur(plan) ? 'border-canard/40 bg-canard/5' : 'border-border bg-carte'
              }`}
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-body-l font-semibold text-ink">{plan.name}</span>
                <span className={`rounded-pill px-2.5 py-1 text-caption ${STATUT_CLASS[plan.status] ?? ''}`}>
                  {STATUT_LABEL[plan.status] ?? plan.status}
                </span>
                {estEnVigueur(plan) && (
                  <span className="rounded-pill bg-canard px-2.5 py-1 text-caption text-white">
                    Appliqué aujourd'hui
                  </span>
                )}
              </div>

              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                <div>
                  <dt className="text-field-label">En vigueur</dt>
                  <dd className="text-body-m text-ink">
                    du {formatDate(plan.effective_from)}
                    {plan.effective_to ? ` au ${formatDate(plan.effective_to)}` : ' — sans fin prévue'}
                  </dd>
                </div>
                <div>
                  <dt className="text-field-label">Cycle</dt>
                  <dd className="text-body-m text-ink">
                    {plan.cycle_length_weeks} semaines, S1 = semaine du {formatDate(plan.start_date)}
                  </dd>
                </div>
                <div>
                  <dt className="text-field-label">Affectations</dt>
                  <dd className="text-body-m text-ink">
                    {plan.rotation_plan_rules?.[0]?.count ?? 0}
                  </dd>
                </div>
                <div>
                  <dt className="text-field-label">Origine</dt>
                  <dd className="flex items-center gap-1.5 text-body-m text-ink">
                    {plan.source_file_name ? (
                      <>
                        <FileSpreadsheet className="h-4 w-4 flex-shrink-0 text-muted" />
                        {plan.source_file_name}
                      </>
                    ) : (
                      <span className="text-muted">Saisi dans l'application</span>
                    )}
                  </dd>
                </div>
              </dl>

              <button
                onClick={() => setPlanDeplie(planDeplie === plan.id ? null : plan.id)}
                aria-expanded={planDeplie === plan.id}
                className="mt-4 flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-button text-canard transition-colors hover:bg-canard/10"
              >
                {planDeplie === plan.id ? (
                  <ChevronDown size={17} strokeWidth={2} />
                ) : (
                  <ChevronRight size={17} strokeWidth={2} />
                )}
                {planDeplie === plan.id ? 'Masquer la grille' : 'Voir la grille'}
              </button>

              {planDeplie === plan.id && (
                <div className="mt-4">
                  <RotationPlanGrid planId={plan.id} cycleLength={plan.cycle_length_weeks} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
