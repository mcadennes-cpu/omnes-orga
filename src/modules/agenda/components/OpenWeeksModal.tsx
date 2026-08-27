import { useState, useEffect, useMemo, useCallback } from 'react';
import { CalendarPlus, Loader2, Save, Repeat, PartyPopper } from 'lucide-react';
import BottomSheet from './ui/BottomSheet';
import { supabase } from '../lib/supabase';

// ---------------------------------------------------------------------------
// Ouvrir les N prochaines semaines (MOD-1, etape 6H).
//
// La separation que cet ecran rend visible :
//     la SEMAINE TYPE dit quelles cases ouvrent (l'offre),
//     le PLAN DE ROULEMENT dit qui les occupe (l'affectation).
//
// La premiere version proposait une liste de cases a cocher des « creneaux
// hors roulement ». Remarque de Matthieu (02/08/2026) : une liste ne montre
// pas ce qui sera FERME, or c'est ce que Charlotte doit verifier -- le cabinet
// ouvre plus de creneaux l'hiver que l'ete, il y a donc plusieurs semaines
// types et il faut pouvoir reconnaitre laquelle on s'apprete a rejouer. D'ou
// la grille : creneaux en lignes, jours en colonnes, comme la vue Semaine.
//
// MODELE FINAL (03/08/2026, apres trois reglages) : une case COCHEE ouvre
// CHAQUE semaine -- affectee quand le roulement y place quelqu'un, libre pour
// les remplacants sinon. Les gardes du roulement s'ouvrent de toute facon, a
// leur semaine du cycle, meme si la case n'est pas cochee : c'est pourquoi
// plus AUCUNE case n'est verrouillee -- fermer une case ne peut plus priver un
// associe de sa garde. Le badge ↻ signale simplement que le roulement passe
// par la. Les deux reglages precedents fermaient les cases du roulement dans
// les semaines du cycle ou il ne s'en sert pas (J2 Dijon disparu le lundi de
// S3) : c'est Matthieu qui a retabli le fonctionnement historique.
//
// Les JOURS FERIES ont leur propre colonne, la 8e. Releve du 02/08/2026 : les
// 18 gardes de week-end posees en semaine tombent toutes sur un ferie, et le
// ferie REMPLACE la journee (le vendredi 18/12 porte 10 gardes, le 25/12 en
// porte 2). Une premiere version reprenait les creneaux du DIMANCHE ; le test
// l'a invalidee -- elle ouvrait aussi les doublons, absents des 12 feries
// releves. D'ou une colonne reglee a la main plutot qu'une regle devinee.
// Les gardes de ferie restent SANS AFFECTATION : le roulement ne les couvre
// pas, et les deux derniers feries en base sont effectivement libres.
// ---------------------------------------------------------------------------

type Case = {
  weekday: number;
  site_id: string;
  site_nom: string;
  shift_type_id: string;
  creneau_nom: string;
  salle_nom: string | null;
  ouvert: boolean;
  couvert_par_le_plan: boolean;
};

type Template = { id: string; name: string };

type Rapport = {
  total: number;
  affectees: number;
  libres: number;
  sur_feries: number;
  feries: { jour: string; nom: string }[];
  debut: string;
  fin: string;
};

// Colonnes dans l'ordre de lecture de la semaine ; la valeur est la convention
// weekday de la base (0 = dimanche, comme Date.getDay()).
//
// La 8e colonne n'est pas un jour : c'est ce qu'ouvre un JOUR FERIE, quel que
// soit le jour de la semaine sur lequel il tombe. Releve du 02/08/2026 : le
// cabinet traite un ferie comme un jour de week-end, et cela REMPLACE la
// journee (le vendredi 18/12 porte 10 gardes, le 25/12 en porte 2).
const JOURS = [
  { weekday: 1, court: 'Lun' }, { weekday: 2, court: 'Mar' },
  { weekday: 3, court: 'Mer' }, { weekday: 4, court: 'Jeu' },
  { weekday: 5, court: 'Ven' }, { weekday: 6, court: 'Sam' },
  { weekday: 0, court: 'Dim' }, { weekday: 7, court: 'Férié' },
];

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

// Le site est dans le nom du creneau (« J1 Beaune ») : on le retire pour la
// colonne de gauche, qui groupe deja par site.
function codeCourt(creneau: string, site: string): string {
  return creneau.replace(new RegExp(site, 'i'), '').replace(/\s+/g, ' ').trim() || creneau;
}

// `onOpened` recoit le nombre de gardes ecrites : l'appelant en fait un bandeau
// avec « Annuler » (8B-1b). Le compte vient du rapport de verification, calcule
// juste avant par la meme fonction avec les memes parametres.
type OpenWeeksModalProps = { onClose: () => void; onOpened: (gardesCreees: number) => void };

export default function OpenWeeksModal({ onClose, onOpened }: OpenWeeksModalProps) {
  const [debut, setDebut] = useState('');
  const [semaines, setSemaines] = useState(8);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [cases, setCases] = useState<Case[]>([]);
  const [ouvertes, setOuvertes] = useState<Set<string>>(new Set());
  const [rapport, setRapport] = useState<Rapport | null>(null);
  const [chargement, setChargement] = useState(true);
  const [calcul, setCalcul] = useState(false);
  const [ecriture, setEcriture] = useState(false);
  const [erreur, setErreur] = useState('');
  const [nomAEnregistrer, setNomAEnregistrer] = useState('');
  // Les cases que le coordinateur a lui-meme ouvertes ou fermees. Elles
  // survivent au rechargement de la grille -- sans quoi changer la date
  // effacerait ses ajustements sans prevenir.
  const [forcees, setForcees] = useState<Map<string, boolean>>(new Map());
  const [enregistrement, setEnregistrement] = useState(false);

  const cle = (weekday: number, siteId: string, shiftTypeId: string) =>
    `${weekday}|${siteId}|${shiftTypeId}`;

  useEffect(() => {
    const preparer = async () => {
      try {
        const { data: derniere } = await supabase
          .from('shifts').select('date').order('date', { ascending: false }).limit(1);
        const apres = derniere?.[0]?.date ? new Date(derniere[0].date + 'T12:00:00') : new Date();
        apres.setDate(apres.getDate() + 1);
        while (apres.getDay() !== 1) apres.setDate(apres.getDate() + 1);
        setDebut(versIso(apres));

        const { data, error } = await supabase
          .from('opening_week_templates')
          .select('id, name')
          .order('created_at', { ascending: false });
        if (error) throw error;

        const liste = (data ?? []) as Template[];
        setTemplates(liste);
        if (liste.length > 0) setTemplateId(liste[0].id);
        else setChargement(false);
      } catch (err: any) {
        setErreur(err.message);
        setChargement(false);
      }
    };
    preparer();
  }, []);

  // La grille depend AUSSI de la date : `couvert_par_le_plan` doit refleter
  // le plan applicable a la periode qu'on s'apprete a ouvrir. Le V1 et le V2
  // ne couvrent pas les memes creneaux -- lire « tous les plans actifs »
  // faisait passer J5 Dijon pour une case du roulement en janvier 2027.
  useEffect(() => {
    if (!templateId || !debut) return;
    const charger = async () => {
      setChargement(true);
      try {
        const { data, error } = await supabase.rpc('semaine_type', {
          p_template_id: templateId,
          p_date: debut,
        });
        if (error) throw error;
        const liste = (data ?? []) as Case[];
        setCases(liste);

        // L'offre par defaut = la semaine type seule. Les cases que le plan
        // couvre sans qu'elles soient dans la semaine type (J4 Beaune...)
        // apparaissent decochees avec le badge : leurs gardes du roulement
        // s'ouvriront de toute facon, les cocher les ouvrirait EN PLUS
        // chaque semaine aux remplacants.
        const defaut = new Set(
          liste.filter((c) => c.ouvert)
               .map((c) => cle(c.weekday, c.site_id, c.shift_type_id)),
        );
        for (const [k, ouverte] of forcees) {
          if (ouverte) defaut.add(k);
          else defaut.delete(k);
        }
        setOuvertes(defaut);
      } catch (err: any) {
        setErreur(err.message);
      } finally {
        setChargement(false);
      }
    };
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, debut]);

  // Les lignes : un creneau par site, dans l'ordre d'affichage du module.
  const lignes = useMemo(() => {
    const vues = new Map<string, { site_id: string; site_nom: string; shift_type_id: string; creneau_nom: string; salle_nom: string | null }>();
    for (const c of cases) {
      const k = `${c.site_id}|${c.shift_type_id}`;
      if (!vues.has(k)) {
        vues.set(k, {
          site_id: c.site_id, site_nom: c.site_nom,
          shift_type_id: c.shift_type_id, creneau_nom: c.creneau_nom, salle_nom: c.salle_nom,
        });
      }
    }
    return [...vues.values()];
  }, [cases]);

  // Les cases ou le roulement passe : badge d'information, pas un verrou.
  const duRoulement = useMemo(() => {
    const s = new Set<string>();
    for (const c of cases) {
      if (c.couvert_par_le_plan) s.add(cle(c.weekday, c.site_id, c.shift_type_id));
    }
    return s;
  }, [cases]);

  const ouverturesPayload = useCallback(
    () =>
      [...ouvertes].map((k) => {
        const [weekday, site_id, shift_type_id] = k.split('|');
        return { weekday: Number(weekday), site_id, shift_type_id };
      }),
    [ouvertes],
  );

  useEffect(() => {
    if (!debut || semaines < 1 || chargement || ouvertes.size === 0) return;
    let annule = false;
    const calculer = async () => {
      setCalcul(true);
      setErreur('');
      try {
        const { data, error } = await supabase.rpc('ouvrir_semaines', {
          p_debut: debut, p_semaines: semaines,
          p_ouvertures: ouverturesPayload(), p_verifier_seulement: true,
        });
        if (annule) return;
        if (error) throw error;
        setRapport(data as Rapport);
      } catch (err: any) {
        if (!annule) { setRapport(null); setErreur(err.message); }
      } finally {
        if (!annule) setCalcul(false);
      }
    };
    const minuteur = setTimeout(calculer, 250);
    return () => { annule = true; clearTimeout(minuteur); };
  }, [debut, semaines, ouvertes, chargement, ouverturesPayload]);

  const basculer = (k: string) => {
    const suivant = new Set(ouvertes);
    const ouvre = !suivant.has(k);
    if (ouvre) suivant.add(k);
    else suivant.delete(k);
    setOuvertes(suivant);
    setForcees(new Map(forcees).set(k, ouvre));
  };

  const enregistrer = async () => {
    if (!nomAEnregistrer.trim()) return;
    setEnregistrement(true);
    setErreur('');
    try {
      const { data, error } = await supabase.rpc('enregistrer_semaine_type', {
        p_nom: nomAEnregistrer.trim(), p_ouvertures: ouverturesPayload(),
      });
      if (error) throw error;
      setTemplates([{ id: data as string, name: nomAEnregistrer.trim() }, ...templates]);
      setTemplateId(data as string);
      setNomAEnregistrer('');
    } catch (err: any) {
      setErreur(err.message);
    } finally {
      setEnregistrement(false);
    }
  };

  const ouvrir = async () => {
    setEcriture(true);
    setErreur('');
    try {
      const { error } = await supabase.rpc('ouvrir_semaines', {
        p_debut: debut, p_semaines: semaines,
        p_ouvertures: ouverturesPayload(), p_verifier_seulement: false,
      });
      if (error) throw error;
      onOpened(rapport?.total ?? 0);
      onClose();
    } catch (err: any) {
      setErreur(err.message);
      setEcriture(false);
    }
  };

  const cellule = 'border border-border px-1 py-1 text-center';

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
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1">
            <label className="mb-2 block text-field-label">Premier lundi</label>
            <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} className={fieldClass} />
          </div>
          <div className="w-28">
            <label className="mb-2 block text-field-label">Semaines</label>
            <input
              type="number" min={1} max={52} value={semaines}
              onChange={(e) => setSemaines(Number(e.target.value))} className={fieldClass}
            />
          </div>
        </div>

        <div>
          <label className="mb-2 block text-field-label">Semaine type</label>
          <select
            value={templateId}
            onChange={(e) => {
              setForcees(new Map());
              setTemplateId(e.target.value);
            }}
            className={fieldClass}
          >
            {templates.length === 0 && <option value="">Aucune semaine type enregistrée</option>}
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {erreur && (
          <div className="rounded-input border border-brique/20 bg-brique/10 p-3 text-body-m text-brique">
            {erreur}
          </div>
        )}

        {chargement ? (
          <p className="text-caption">Chargement…</p>
        ) : lignes.length === 0 ? (
          <p className="text-caption">Cette semaine type ne contient aucun créneau.</p>
        ) : (
          <>
            <div>
              <p className="text-field-label mb-1">Semaine d'ouverture</p>
              <p className="mb-2 text-caption">
                Une case cochée ouvre chaque semaine — affectée quand le roulement y
                place quelqu'un, libre pour les remplaçants sinon. Les gardes du
                roulement (badge) s'ouvrent de toute façon, même case décochée. La
                colonne <strong>Férié</strong> n'est pas un jour — c'est ce qui s'ouvre
                les jours fériés, à la place de la journée ordinaire.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className={`${cellule} sticky left-0 z-10 bg-fond text-left text-field-label text-ink`}>
                        Créneau
                      </th>
                      {JOURS.map((j) => (
                        <th
                          key={j.weekday}
                          className={`${cellule} bg-fond text-field-label text-ink ${
                            j.weekday === 7 ? 'border-l-2 border-l-ocre/50 text-ocre-fonce' : ''
                          }`}
                        >
                          {j.court}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((l) => (
                      <tr key={`${l.site_id}|${l.shift_type_id}`}>
                        <th
                          scope="row"
                          className={`${cellule} sticky left-0 z-10 bg-carte text-left text-body-m font-normal text-ink whitespace-nowrap`}
                        >
                          <span className="font-semibold">{codeCourt(l.creneau_nom, l.site_nom)}</span>
                          <span className="text-caption"> {l.site_nom}</span>
                        </th>
                        {JOURS.map((j) => {
                          const k = cle(j.weekday, l.site_id, l.shift_type_id);
                          const estOuverte = ouvertes.has(k);
                          const roulement = duRoulement.has(k);
                          return (
                            <td
                              key={j.weekday}
                              className={`${cellule} ${
                                j.weekday === 7 ? 'border-l-2 border-l-ocre/50' : ''
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => basculer(k)}
                                aria-pressed={estOuverte}
                                title={
                                  roulement
                                    ? estOuverte
                                      ? 'Roulement + ouverte chaque semaine aux remplaçants — cliquer pour fermer'
                                      : 'Le roulement ouvrira ses gardes ici à leur semaine du cycle — cliquer pour ouvrir aussi chaque semaine'
                                    : j.weekday === 7
                                      ? estOuverte
                                        ? 'Ouverte les jours fériés — cliquer pour fermer'
                                        : 'Fermée les jours fériés — cliquer pour ouvrir'
                                      : estOuverte ? 'Ouverte — cliquer pour fermer'
                                                   : 'Fermée — cliquer pour ouvrir'
                                }
                                className={`flex h-7 w-full items-center justify-center gap-0.5 rounded-pill text-caption transition-colors ${
                                  estOuverte
                                    ? roulement
                                      ? 'bg-canard/25 text-canard hover:bg-canard/35'
                                      : 'bg-canard/10 text-canard hover:bg-canard/20'
                                    : 'bg-fond text-faint hover:bg-border'
                                }`}
                              >
                                {roulement && <Repeat className="h-3 w-3" />}
                                {!roulement && estOuverte ? '●' : ''}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption">
                <span className="flex items-center gap-1">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-pill bg-canard/25">
                    <Repeat className="h-2.5 w-2.5 text-canard" />
                  </span>
                  Roulement — ses gardes s'ouvrent à leur semaine du cycle, quoi qu'il arrive
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-pill bg-canard/10 text-canard">●</span>
                  Ouverte chaque semaine — libre si le roulement n'y place personne
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-4 w-4 rounded-pill bg-fond" />
                  Fermée
                </span>
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

            {rapport && rapport.feries.length > 0 && (
              <div className="rounded-input border border-ocre/30 bg-ocre/10 p-3">
                <div className="mb-1 flex items-center gap-2">
                  <PartyPopper className="h-4 w-4 flex-shrink-0 text-ocre-fonce" />
                  <span className="text-body-m font-semibold text-ocre-fonce">
                    {rapport.feries.length} jour{rapport.feries.length > 1 ? 's' : ''} férié
                    {rapport.feries.length > 1 ? 's' : ''} dans la période
                  </span>
                </div>
                <p className="text-body-m text-ink">
                  {rapport.feries.map((f) => `${f.nom} (${formatDate(f.jour)})`).join(', ')}.
                </p>
                <p className="mt-1 text-caption">
                  Ces journées passent en garde de week-end : les créneaux du dimanche
                  s'ouvrent, les consultations restent fermées. Elles sont laissées{' '}
                  <strong>sans affectation</strong> — le roulement ne couvre pas les jours
                  fériés.
                </p>
              </div>
            )}

            <div className="rounded-input border border-border bg-fond p-3">
              <label className="mb-2 block text-field-label">
                Enregistrer cette grille comme semaine type
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={nomAEnregistrer}
                  onChange={(e) => setNomAEnregistrer(e.target.value)}
                  placeholder="Ex : Semaine type été"
                  className={`${fieldClass} flex-1`}
                />
                <button
                  onClick={enregistrer}
                  disabled={!nomAEnregistrer.trim() || enregistrement}
                  className="flex items-center gap-2 rounded-input border border-border bg-carte px-4 py-2 text-button text-marine transition-colors hover:bg-fond disabled:opacity-50"
                >
                  {enregistrement ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Enregistrer
                </button>
              </div>
            </div>
          </>
        )}

        <div className="rounded-input border border-marine/20 bg-marine/5 p-3 text-body-m text-ink">
          L'ouverture ne se fait que sur un calendrier vide. Les gardes déjà créées ne sont
          jamais modifiées.
        </div>
      </div>
    </BottomSheet>
  );
}
