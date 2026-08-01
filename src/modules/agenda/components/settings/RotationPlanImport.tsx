import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import {
  ChevronLeft, ChevronDown, ChevronRight, Upload, FileJson, Terminal,
  CheckCircle2, AlertTriangle, TriangleAlert, Loader2,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Import d'un plan de roulement (MOD-1, etape 6E-3).
//
// L'application ne lit JAMAIS le .xlsx : le fichier du cabinet a change deux
// fois de structure en sept mois, et toute la fragilite de lecture reste dans
// le pipeline Python, la ou vivent l'expertise et le verificateur. Cet ecran
// recoit le JSON canonique produit par 22-6E-1-export-roulement-json.py.
//
// C'est pourquoi l'etape de depot EXPLIQUE d'ou vient le fichier attendu au
// lieu de se contenter d'une zone de depot : sans cela, personne ne saurait
// quel fichier deposer. Le .json est un intermediaire, pas un document que la
// coordinatrice manipule d'habitude.
//
// L'ecriture passe par agenda.importer_plan_roulement() : c'est la seule porte
// d'entree des plans, les policies RLS n'accordant aucune ecriture directe,
// pas meme aux coordinateurs (6B, puis 6E-2).
// ---------------------------------------------------------------------------

type Affectation = {
  medecin: string;
  semaine: number;
  jour: string;
  site: string;
  creneau: string;
};

type Anomalie = { type: string; message: string; ou: string | null };

type Payload = {
  plan: {
    nom: string;
    cycle_semaines: number;
    date_debut: string;
    source: string;
    feuille?: string;
  };
  sites: string[];
  creneaux: string[];
  medecins: string[];
  jours: string[];
  affectations: Affectation[];
  anomalies: Anomalie[];
};

type Cible = { id: string; libelle: string };

// Une correspondance a trancher : le code du fichier, et vers quoi il pointe.
type Correspondance = {
  cle: string;          // 'CB' pour un medecin, 'Beaune|J1' pour un creneau
  affichage: string;    // ce qu'on montre : « CB », « J1 a Beaune »
  cibleId: string | null;
  memorisee: boolean;   // deja connue avant cet import
};

type Etape = 'depot' | 'controle' | 'termine';

const COMMANDE =
  'python3 docs/sql/22-6E-1-export-roulement-json.py <fichier.xlsx> \\\n' +
  '    --nom "Roulement V2 - 9 associes" --date-debut 2027-01-04';

// Les anomalies du parseur, traduites. Le type brut (« creneau_ambigu ») est
// utile dans un terminal, pas a l'ecran.
const ANOMALIE_LABEL: Record<string, string> = {
  feuille_ignoree: 'Feuille ignorée',
  jour_inconnu: 'Jour non reconnu',
  cellule_ambigue: 'Cellule ambiguë',
  creneau_ambigu: 'Créneau indéterminé',
  doublon_exact: 'Doublon',
  ligne_ignoree: 'Ligne ignorée',
  code_medecin_suspect: 'Code médecin inhabituel',
  semaine_vide: 'Semaine vide',
};

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

type RotationPlanImportProps = {
  onRetour: () => void;
  onImporte: () => void;
};

export default function RotationPlanImport({ onRetour, onImporte }: RotationPlanImportProps) {
  const [etape, setEtape] = useState<Etape>('depot');
  const [payload, setPayload] = useState<Payload | null>(null);
  const [erreur, setErreur] = useState('');
  const [survol, setSurvol] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState<{ regles: number; nom: string } | null>(null);
  const [connuesDepliees, setConnuesDepliees] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Les cibles possibles en base, et les correspondances deja memorisees.
  const [medecinsBase, setMedecinsBase] = useState<Cible[]>([]);
  const [sitesBase, setSitesBase] = useState<Cible[]>([]);
  const [creneauxBase, setCreneauxBase] = useState<Cible[]>([]);
  const [memoire, setMemoire] = useState<Record<string, string>>({});

  // Les correspondances de l'import en cours, par famille.
  const [medecins, setMedecins] = useState<Correspondance[]>([]);
  const [sites, setSites] = useState<Correspondance[]>([]);
  const [creneaux, setCreneaux] = useState<Correspondance[]>([]);

  useEffect(() => {
    chargerReferentiel();
  }, []);

  // La memoire arrive de facon asynchrone : un fichier depose avant la fin du
  // chargement afficherait toutes les correspondances comme inconnues. On les
  // recalcule des que la memoire est la.
  useEffect(() => {
    if (payload) preparerCorrespondances(payload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoire]);

  const chargerReferentiel = async () => {
    try {
      const [profils, lieux, horaires, mappings] = await Promise.all([
        supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
        supabase.from('sites').select('id, name').order('name'),
        supabase.from('shift_types').select('id, name').order('sort_order'),
        supabase.from('rotation_import_mappings').select('kind, file_code, file_site, target_id'),
      ]);

      if (profils.error) throw profils.error;
      if (lieux.error) throw lieux.error;
      if (horaires.error) throw horaires.error;
      if (mappings.error) throw mappings.error;

      setMedecinsBase((profils.data ?? []).map((p: any) => ({ id: p.id, libelle: p.full_name })));
      setSitesBase((lieux.data ?? []).map((s: any) => ({ id: s.id, libelle: s.name })));
      setCreneauxBase((horaires.data ?? []).map((c: any) => ({ id: c.id, libelle: c.name })));

      // Cle de memoire : 'doctor:cb', 'site:beaune', 'shift_type:beaune|j1'.
      // Insensible a la casse, comme l'index unique en base.
      const memo: Record<string, string> = {};
      for (const m of mappings.data ?? []) {
        const cle = m.file_site
          ? `${m.kind}:${m.file_site.toLowerCase()}|${m.file_code.toLowerCase()}`
          : `${m.kind}:${m.file_code.toLowerCase()}`;
        memo[cle] = m.target_id;
      }
      setMemoire(memo);
    } catch (err: any) {
      setErreur(err.message);
    }
  };

  // -------------------------------------------------------------------------
  // Lecture du fichier depose
  // -------------------------------------------------------------------------
  const lireFichier = async (fichier: File) => {
    setErreur('');
    try {
      const texte = await fichier.text();
      const donnees = JSON.parse(texte) as Payload;

      if (!donnees?.plan?.nom || !Array.isArray(donnees.affectations)) {
        throw new Error(
          "Ce fichier n'a pas la forme attendue. Il doit venir du script d'export du roulement.",
        );
      }
      if (donnees.affectations.length === 0) {
        throw new Error('Ce fichier ne contient aucune affectation.');
      }

      preparerCorrespondances(donnees);
      setPayload(donnees);
      setEtape('controle');
    } catch (err: any) {
      setErreur(
        err instanceof SyntaxError
          ? "Ce fichier n'est pas un JSON lisible. Vérifier qu'il s'agit bien du fichier produit par le script d'export."
          : err.message,
      );
    }
  };

  // Pre-remplit depuis la memoire : seules les correspondances inconnues
  // demanderont une action. C'est tout l'objet de la table memorisee en 6E-2.
  const preparerCorrespondances = (donnees: Payload) => {
    setMedecins(
      donnees.medecins.map((code) => ({
        cle: code,
        affichage: code,
        cibleId: memoire[`doctor:${code.toLowerCase()}`] ?? null,
        memorisee: !!memoire[`doctor:${code.toLowerCase()}`],
      })),
    );

    setSites(
      donnees.sites.map((nom) => ({
        cle: nom,
        affichage: nom,
        cibleId: memoire[`site:${nom.toLowerCase()}`] ?? null,
        memorisee: !!memoire[`site:${nom.toLowerCase()}`],
      })),
    );

    // Un creneau se resout par le COUPLE (site, code) : « J1 » n'existe qu'a
    // Beaune, « J5 » qu'a Dijon, et les creneaux portent le site dans leur nom.
    const couples = new Map<string, { site: string; code: string }>();
    for (const a of donnees.affectations) {
      couples.set(`${a.site}|${a.creneau}`, { site: a.site, code: a.creneau });
    }
    setCreneaux(
      [...couples.entries()].map(([cle, { site, code }]) => ({
        cle,
        affichage: `${code} à ${site}`,
        cibleId: memoire[`shift_type:${site.toLowerCase()}|${code.toLowerCase()}`] ?? null,
        memorisee: !!memoire[`shift_type:${site.toLowerCase()}|${code.toLowerCase()}`],
      })),
    );
  };

  const majCorrespondance = (
    famille: 'medecin' | 'site' | 'creneau',
    cle: string,
    cibleId: string,
  ) => {
    const applique = (liste: Correspondance[]) =>
      liste.map((c) => (c.cle === cle ? { ...c, cibleId: cibleId || null } : c));
    if (famille === 'medecin') setMedecins(applique);
    else if (famille === 'site') setSites(applique);
    else setCreneaux(applique);
  };

  const aTrancher = useMemo(
    () => [...medecins, ...sites, ...creneaux].filter((c) => !c.cibleId).length,
    [medecins, sites, creneaux],
  );

  // -------------------------------------------------------------------------
  // Ecriture
  // -------------------------------------------------------------------------
  const importer = async () => {
    if (!payload) return;
    setEnCours(true);
    setErreur('');

    const enObjet = (liste: Correspondance[]) =>
      Object.fromEntries(liste.filter((c) => c.cibleId).map((c) => [c.cle, c.cibleId]));

    const parametres = {
      p_payload: payload,
      p_medecins: enObjet(medecins),
      p_sites: enObjet(sites),
      p_creneaux: enObjet(creneaux),
      p_memoriser: true,
    };

    try {
      // Verification a blanc d'abord : la fonction revalide tout de son cote
      // et ne touche a rien. Un ecran ne protege rien -- lecon de 7C-3.
      const controle = await supabase.rpc('importer_plan_roulement', {
        ...parametres,
        p_verifier_seulement: true,
      });
      if (controle.error) throw controle.error;
      if (controle.data?.ok === false) {
        throw new Error(
          `Correspondances manquantes : ${JSON.stringify(controle.data.manquants)}`,
        );
      }

      const ecriture = await supabase.rpc('importer_plan_roulement', {
        ...parametres,
        p_verifier_seulement: false,
      });
      if (ecriture.error) throw ecriture.error;

      setResultat({ regles: ecriture.data.regles, nom: ecriture.data.nom });
      setEtape('termine');
      onImporte();
    } catch (err: any) {
      setErreur(err.message);
    } finally {
      setEnCours(false);
    }
  };

  // -------------------------------------------------------------------------
  // Rendu
  // -------------------------------------------------------------------------
  const listeCorrespondances = (
    titre: string,
    famille: 'medecin' | 'site' | 'creneau',
    liste: Correspondance[],
    cibles: Cible[],
  ) => {
    const inconnues = liste.filter((c) => !c.cibleId);
    const connues = liste.filter((c) => c.cibleId);
    const visibles = connuesDepliees ? liste : inconnues;
    if (visibles.length === 0) return null;

    return (
      <div className="mb-4">
        <p className="text-field-label mb-2">{titre}</p>
        <div className="space-y-2">
          {visibles.map((c) => (
            <div key={c.cle} className="flex flex-wrap items-center gap-3">
              <span
                className={`min-w-[7rem] rounded-pill px-2.5 py-1 text-caption ${
                  c.cibleId ? 'bg-fond text-muted' : 'bg-ocre/15 text-ocre-fonce'
                }`}
              >
                {c.affichage}
              </span>
              <select
                value={c.cibleId ?? ''}
                onChange={(e) => majCorrespondance(famille, c.cle, e.target.value)}
                className="min-w-[14rem] flex-1 rounded-input border border-border bg-carte px-3 py-2 text-body-m text-ink"
              >
                <option value="">— à choisir —</option>
                {cibles.map((cible) => (
                  <option key={cible.id} value={cible.id}>
                    {cible.libelle}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        {!connuesDepliees && connues.length > 0 && inconnues.length > 0 && (
          <p className="mt-2 text-caption">
            {connues.length} déjà {connues.length > 1 ? 'reconnues' : 'reconnue'}
          </p>
        )}
      </div>
    );
  };

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
          <h2 className="text-h2 text-ink">Importer un plan de roulement</h2>
          <p className="text-caption">Le fichier validé devient le plan, en brouillon</p>
        </div>
      </div>

      {erreur && (
        <div className="mb-4 flex items-start gap-2 rounded-input border border-brique/20 bg-brique/10 px-4 py-3 text-body-m text-brique">
          <TriangleAlert className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <span>{erreur}</span>
        </div>
      )}

      {/* --- Etape 1 : le depot -------------------------------------------- */}
      {etape === 'depot' && (
        <>
          <div className="mb-5 rounded-card border border-marine/20 bg-marine/5 p-4">
            <div className="mb-3 flex items-start gap-3">
              <Terminal className="mt-0.5 h-5 w-5 flex-shrink-0 text-marine" />
              <p className="text-body-m text-ink">
                Le fichier de roulement (<code>.xlsx</code>) se convertit d'abord en un
                fichier <code>.json</code>, à l'aide du script du projet. C'est ce{' '}
                <code>.json</code> qui se dépose ici.
                <span className="mt-2 block text-caption">
                  Cette conversion se fait hors de l'application : elle vérifie la
                  structure du fichier, signale les anomalies de saisie, et reste
                  ainsi au même endroit que les autres outils du planning.
                </span>
              </p>
            </div>
            <pre className="overflow-x-auto rounded-input bg-marine/10 px-3 py-2 text-caption text-ink">
              {COMMANDE}
            </pre>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setSurvol(true);
            }}
            onDragLeave={() => setSurvol(false)}
            onDrop={(e) => {
              e.preventDefault();
              setSurvol(false);
              const fichier = e.dataTransfer.files?.[0];
              if (fichier) lireFichier(fichier);
            }}
            className={`rounded-card border-2 border-dashed p-8 text-center transition-colors ${
              survol ? 'border-canard bg-canard/5' : 'border-border bg-fond'
            }`}
          >
            <Upload className="mx-auto mb-3 h-8 w-8 text-muted" />
            <p className="text-body-m text-ink">
              Glisser le fichier <code>.json</code> ici
            </p>
            <p className="mb-4 text-caption">ou</p>
            <button
              onClick={() => inputRef.current?.click()}
              className="rounded-input bg-marine px-5 py-2.5 text-button text-white shadow-button transition-opacity hover:opacity-90"
            >
              Choisir un fichier
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const fichier = e.target.files?.[0];
                if (fichier) lireFichier(fichier);
                e.target.value = '';
              }}
            />
          </div>
        </>
      )}

      {/* --- Etape 2 : le controle ----------------------------------------- */}
      {etape === 'controle' && payload && (
        <>
          <div className="mb-5 rounded-card border border-border bg-fond p-4">
            <div className="mb-3 flex items-center gap-2">
              <FileJson className="h-5 w-5 flex-shrink-0 text-canard" />
              <span className="text-body-l font-semibold text-ink">{payload.plan.nom}</span>
            </div>
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <div>
                <dt className="text-field-label">Fichier d'origine</dt>
                <dd className="text-body-m text-ink">{payload.plan.source}</dd>
              </div>
              <div>
                <dt className="text-field-label">Cycle</dt>
                <dd className="text-body-m text-ink">
                  {payload.plan.cycle_semaines} semaines, S1 = semaine du{' '}
                  {formatDate(payload.plan.date_debut)}
                </dd>
              </div>
              <div>
                <dt className="text-field-label">Affectations</dt>
                <dd className="text-body-m text-ink">{payload.affectations.length}</dd>
              </div>
              <div>
                <dt className="text-field-label">Médecins</dt>
                <dd className="text-body-m text-ink">{payload.medecins.length}</dd>
              </div>
            </dl>
          </div>

          {payload.anomalies.length > 0 && (
            <div className="mb-5 rounded-card border border-ocre/30 bg-ocre/10 p-4">
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 flex-shrink-0 text-ocre-fonce" />
                <span className="text-body-m font-semibold text-ocre-fonce">
                  {payload.anomalies.length}{' '}
                  {payload.anomalies.length > 1
                    ? 'anomalies relevées dans le fichier'
                    : 'anomalie relevée dans le fichier'}
                </span>
              </div>
              <ul className="space-y-1.5">
                {payload.anomalies.map((a, i) => (
                  <li key={i} className="text-body-m text-ink">
                    <span className="text-caption">
                      {ANOMALIE_LABEL[a.type] ?? a.type}
                      {a.ou ? ` — ${a.ou}` : ''}
                    </span>
                    <br />
                    {a.message}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-caption">
                Ces anomalies n'empêchent pas l'import : les cellules concernées ont été
                écartées ou conservées telles quelles, comme indiqué ci-dessus.
              </p>
            </div>
          )}

          <div className="mb-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-body-l font-semibold text-ink">Correspondances</p>
              <button
                onClick={() => setConnuesDepliees(!connuesDepliees)}
                aria-expanded={connuesDepliees}
                className="flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-button text-canard transition-colors hover:bg-canard/10"
              >
                {connuesDepliees ? (
                  <ChevronDown size={17} strokeWidth={2} />
                ) : (
                  <ChevronRight size={17} strokeWidth={2} />
                )}
                {connuesDepliees ? 'Masquer celles déjà connues' : 'Tout afficher et modifier'}
              </button>
            </div>

            {aTrancher === 0 && !connuesDepliees ? (
              <div className="flex items-start gap-2 rounded-card border border-canard/30 bg-canard/5 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-canard" />
                <p className="text-body-m text-ink">
                  Les {medecins.length + sites.length + creneaux.length} codes du fichier
                  sont tous reconnus — {medecins.length} médecins, {sites.length} sites,{' '}
                  {creneaux.length} créneaux.
                  <span className="mt-1 block text-caption">
                    Rien à trancher. Les correspondances ont été retenues lors des imports
                    précédents.
                  </span>
                </p>
              </div>
            ) : (
              <>
                {aTrancher > 0 && (
                  <p className="mb-3 text-body-m text-ink">
                    {aTrancher} {aTrancher > 1 ? 'codes inconnus' : 'code inconnu'} — indiquer
                    à quoi {aTrancher > 1 ? 'ils correspondent' : 'il correspond'} pour
                    poursuivre.
                  </p>
                )}
                {listeCorrespondances('Médecins', 'medecin', medecins, medecinsBase)}
                {listeCorrespondances('Sites', 'site', sites, sitesBase)}
                {listeCorrespondances('Créneaux', 'creneau', creneaux, creneauxBase)}
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={importer}
              disabled={aTrancher > 0 || enCours}
              className="flex items-center gap-2 rounded-input bg-marine px-5 py-2.5 text-button text-white shadow-button transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {enCours && <Loader2 className="h-4 w-4 animate-spin" />}
              {enCours ? 'Import en cours…' : 'Créer le plan en brouillon'}
            </button>
            <button
              onClick={() => {
                setPayload(null);
                setEtape('depot');
                setErreur('');
              }}
              className="rounded-input px-5 py-2.5 text-button text-muted transition-colors hover:bg-fond"
            >
              Choisir un autre fichier
            </button>
          </div>

          <p className="mt-3 text-caption">
            Le plan est créé en brouillon, sans date d'entrée en vigueur : le planning en
            cours n'est pas modifié.
          </p>
        </>
      )}

      {/* --- Etape 3 : le resultat ------------------------------------------ */}
      {etape === 'termine' && resultat && (
        <div className="rounded-card border border-canard/30 bg-canard/5 p-6 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-canard" />
          <p className="text-body-l font-semibold text-ink">{resultat.nom}</p>
          <p className="mt-1 text-body-m text-ink">
            Plan créé en brouillon avec {resultat.regles} affectations.
          </p>
          <p className="mx-auto mt-2 max-w-md text-caption">
            Il n'est pas encore appliqué : le planning suit toujours le plan en vigueur.
            Sa grille est consultable dans la liste des plans.
          </p>
          <button
            onClick={onRetour}
            className="mt-5 rounded-input bg-marine px-5 py-2.5 text-button text-white shadow-button transition-opacity hover:opacity-90"
          >
            Revenir aux plans
          </button>
        </div>
      )}
    </div>
  );
}
