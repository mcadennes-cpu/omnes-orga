import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

// ---------------------------------------------------------------------------
// Grille d'un plan de roulement (MOD-1, etape 6D).
//
// Reprend la disposition du fichier de roulement du cabinet, a laquelle les
// associes sont habitues : les CRENEAUX en lignes (groupes par jour), les
// SEMAINES x SITES en colonnes (S1 Beaune, S1 Dijon, S2 Beaune...).
//
// Ce composant resservira tel quel pour l'ecran de differentiel de 6F : c'est
// la meme grille, avec les cases modifiees mises en couleur. D'ou le fichier
// separe et la prop `highlight` prevue des maintenant.
// ---------------------------------------------------------------------------

type Regle = {
  rotation_week: number;
  weekday: number;
  doctor: { id: string; full_name: string } | null;
  site: { id: string; name: string } | null;
  shift_type: { id: string; name: string } | null;
};

type RotationPlanGridProps = {
  planId: string;
  cycleLength: number;
  // Cles de cases a mettre en evidence, au format `${semaine}|${weekday}|${site}|${code}`.
  // Inutilise en 6D, prevu pour le differentiel de 6F.
  highlight?: Set<string>;
};

// Les jours dans l'ordre de lecture du fichier, avec la convention weekday de
// Date.getDay() (0 = dimanche) utilisee partout dans le module.
const JOURS: { weekday: number; label: string }[] = [
  { weekday: 1, label: 'Lundi' },
  { weekday: 2, label: 'Mardi' },
  { weekday: 3, label: 'Mercredi' },
  { weekday: 4, label: 'Jeudi' },
  { weekday: 5, label: 'Vendredi' },
  { weekday: 6, label: 'Samedi' },
  { weekday: 0, label: 'Dimanche' },
];

// Les creneaux portent le site dans leur nom (« J1 Beaune », « WE1 beaune
// 08h-20h ») : on le retire pour retrouver le code du fichier. Voir la section
// `correspondance_agenda` de desiderata.yaml.
function codeCreneau(nomCreneau: string, nomSite: string): string {
  const code = nomCreneau
    .replace(new RegExp(nomSite, 'i'), '')
    .replace(/\d{1,2}\s*h\s*-\s*\d{1,2}\s*h/i, '')
    .trim();
  return code || nomCreneau;
}

// Tri naturel : J1 < J2 < … < J8 < WE1 < WE 2, plutot qu'alphabetique.
function comparerCodes(a: string, b: string): number {
  const decoupe = (s: string) => {
    const m = s.match(/^([^\d]*)(\d*)/);
    return { prefixe: (m?.[1] ?? s).trim(), numero: m?.[2] ? parseInt(m[2], 10) : 0 };
  };
  const da = decoupe(a);
  const db = decoupe(b);
  if (da.prefixe !== db.prefixe) return da.prefixe.localeCompare(db.prefixe);
  return da.numero - db.numero;
}

// « Imane EL GARI » -> « IEG », « Mireille YUAN » -> « MY ». Verifie sur les 9
// associes du roulement : initiale du prenom + initiale de chaque mot du nom.
function initiales(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .map((mot) => mot[0]?.toUpperCase() ?? '')
    .join('');
}

export default function RotationPlanGrid({ planId, cycleLength, highlight }: RotationPlanGridProps) {
  const [regles, setRegles] = useState<Regle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const charger = async () => {
      setLoading(true);
      const { data, error: queryError } = await supabase
        .from('rotation_plan_rules')
        .select(`
          rotation_week,
          weekday,
          doctor:profiles!doctor_id(id, full_name),
          site:sites(id, name),
          shift_type:shift_types(id, name)
        `)
        .eq('plan_id', planId);

      if (cancelled) return;
      if (queryError) setError(queryError.message);
      else setRegles((data ?? []) as unknown as Regle[]);
      setLoading(false);
    };

    charger();
    return () => {
      cancelled = true;
    };
  }, [planId]);

  if (loading) return <p className="text-caption">Chargement de la grille…</p>;
  if (error) {
    return (
      <div className="rounded-input border border-brique/20 bg-brique/10 px-4 py-3 text-body-m text-brique">
        {error}
      </div>
    );
  }
  if (regles.length === 0) {
    return <p className="text-caption">Ce plan ne contient aucune affectation.</p>;
  }

  // Sites en colonnes, dans l'ordre alphabetique — Beaune puis Dijon, comme le
  // fichier. Deduits des donnees plutot que codes en dur : un troisieme site
  // apparaitrait tout seul.
  const sites = [...new Set(regles.map((r) => r.site?.name).filter(Boolean) as string[])].sort();

  const semaines = Array.from({ length: cycleLength }, (_, i) => i + 1);

  // Index des affectations : jour -> code creneau -> `semaine|site` -> medecins.
  const parJour = new Map<number, Map<string, Map<string, string[]>>>();
  const medecins = new Map<string, string>(); // initiales -> nom complet

  for (const r of regles) {
    if (!r.site || !r.shift_type) continue;
    const code = codeCreneau(r.shift_type.name, r.site.name);
    const cle = `${r.rotation_week}|${r.site.name}`;
    const ini = r.doctor ? initiales(r.doctor.full_name) : '?';
    if (r.doctor) medecins.set(ini, r.doctor.full_name);

    if (!parJour.has(r.weekday)) parJour.set(r.weekday, new Map());
    const parCreneau = parJour.get(r.weekday)!;
    if (!parCreneau.has(code)) parCreneau.set(code, new Map());
    const parCase = parCreneau.get(code)!;
    parCase.set(cle, [...(parCase.get(cle) ?? []), ini]);
  }

  const cellule = 'border border-border px-2 py-1.5 text-center text-body-m whitespace-nowrap';
  // Separations structurantes : le quadrillage fin (token `border`, marine 8 %)
  // ne suffit pas a faire ressortir les blocs de jour ni les semaines. Un trait
  // plus soutenu les delimite sans alourdir le reste du tableau.
  const sepVertical = 'border-l-2 border-l-marine/25';
  const sepHorizontal = 'border-t-2 border-t-marine/25';

  // Jours reellement presents, pour savoir lequel ouvre le tableau : le
  // separateur horizontal se pose entre les blocs, pas au-dessus du premier.
  const joursAffiches = JOURS.filter(({ weekday }) => (parJour.get(weekday)?.size ?? 0) > 0);

  return (
    <div>
      {/* Barre de defilement laissee visible : c'est un tableau de donnees large,
          pas une liste de chips — la masquer nuirait a sa decouvrabilite. */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={`${cellule} sticky left-0 z-10 bg-fond text-left text-field-label text-ink`}>Jour</th>
              <th className={`${cellule} bg-fond text-left text-field-label text-ink`}>Créneau</th>
              {semaines.map((s) =>
                sites.map((site, indexSite) => (
                  <th
                    key={`${s}-${site}`}
                    className={`${cellule} bg-fond text-field-label text-ink ${
                      indexSite === 0 ? sepVertical : ''
                    }`}
                  >
                    S{s} {site}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {joursAffiches.map(({ weekday, label }, indexJour) => {
              const parCreneau = parJour.get(weekday)!;
              const codes = [...parCreneau.keys()].sort(comparerCodes);

              return codes.map((code, index) => {
                // Le trait epais ouvre chaque bloc de jour, sauf le premier.
                const ouvreBloc = index === 0 && indexJour > 0 ? sepHorizontal : '';

                return (
                  <tr key={`${weekday}-${code}`}>
                    {index === 0 && (
                      <th
                        rowSpan={codes.length}
                        scope="rowgroup"
                        className={`${cellule} ${ouvreBloc} sticky left-0 z-10 bg-carte text-left align-top font-semibold text-ink`}
                      >
                        {label}
                      </th>
                    )}
                    <td className={`${cellule} ${ouvreBloc} text-left text-muted`}>{code}</td>
                    {semaines.map((s) =>
                      sites.map((site, indexSite) => {
                        const cle = `${s}|${site}`;
                        const occupants = parCreneau.get(code)?.get(cle) ?? [];
                        const enEvidence = highlight?.has(`${s}|${weekday}|${site}|${code}`);
                        return (
                          <td
                            key={`${code}-${cle}`}
                            className={`${cellule} ${ouvreBloc} ${
                              indexSite === 0 ? sepVertical : ''
                            } ${
                              enEvidence
                                ? 'bg-ocre/20 font-semibold text-ocre-fonce'
                                : occupants.length > 0
                                  ? 'bg-canard/10 font-semibold text-ink'
                                  : 'text-faint'
                            }`}
                            title={occupants.map((i) => medecins.get(i) ?? i).join(' · ')}
                          >
                            {occupants.join(' · ') || '—'}
                          </td>
                        );
                      })
                    )}
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
        {[...medecins.entries()].sort().map(([ini, nom]) => (
          <span key={ini} className="text-caption">
            <strong className="text-ink">{ini}</strong> {nom}
          </span>
        ))}
      </div>
    </div>
  );
}
