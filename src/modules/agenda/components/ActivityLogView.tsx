import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, History, Undo2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import Avatar from '../../../components/common/Avatar';
import BottomSheet from './ui/BottomSheet';
import {
  Conflit,
  EntreeJournal,
  LigneGarde,
  Nature,
  RapportRestauration,
  STYLE_NATURE,
  formaterJour,
  lireConflit,
  lireEntree,
} from '../lib/activityLabels';

// ---------------------------------------------------------------------------
// Journal d'activité (MOD2-C) — lecture seule.
//
// Répond à la question qui a coûté des heures le 29/07 : « qu'est-il arrivé à
// cette garde ? ». On regarde le journal vivre avant de lui donner des boutons ;
// la restauration est l'objet de MOD2-D.
//
// Regroupement par TRANSACTION : une action de l'utilisateur peut produire
// plusieurs écritures (demander une garde écrit dans « requests », ce qui
// réveille le déclencheur métier qui écrit dans « shifts »). Les entrées d'une
// même transaction sont donc présentées ensemble — et TOUTES affichées, sans
// tenter de deviner laquelle serait « la principale » : l'ordre des écritures
// d'une transaction ne reflète pas l'intention (la cascade précède parfois
// l'action d'origine).
// ---------------------------------------------------------------------------

type Profil = {
  id: string;
  full_name: string | null;
  photo_url: string | null;
  updated_at: string | null;
};

type Groupe = {
  txid: number;
  premiereId: number;
  quand: Date;
  auteurId: string | null;
  auteurNom: string | null;
  entrees: EntreeJournal[];
};

const PAR_PAGE = 60;

export default function ActivityLogView() {
  const [entrees, setEntrees] = useState<EntreeJournal[]>([]);
  const [profils, setProfils] = useState<Record<string, Profil>>({});
  const [chargement, setChargement] = useState(true);
  const [chargementSuite, setChargementSuite] = useState(false);
  const [erreur, setErreur] = useState('');
  const [fin, setFin] = useState(false);
  const [filtre, setFiltre] = useState<Nature | 'tout'>('tout');
  const [deplies, setDeplies] = useState<Set<number>>(new Set());
  const [eligibles, setEligibles] = useState<Record<number, boolean>>({});
  const [confirmation, setConfirmation] = useState<{
    txid: number;
    resume: string;
    rapport: RapportRestauration | null;
  } | null>(null);
  const [travail, setTravail] = useState(false);

  const charger = useCallback(async (avantId: number | null) => {
    const { data, error } = await supabase.rpc('journal_activite', {
      p_limite: PAR_PAGE,
      p_avant_id: avantId,
    });
    if (error) throw error;
    const lot = (data ?? []) as EntreeJournal[];
    setFin(lot.length < PAR_PAGE);
    return lot;
  }, []);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const [lot, listeProfils] = await Promise.all([
          charger(null),
          supabase.from('profiles').select('id, full_name, photo_url, updated_at'),
        ]);
        if (annule) return;
        if (listeProfils.error) throw listeProfils.error;
        const carte: Record<string, Profil> = {};
        for (const p of (listeProfils.data ?? []) as Profil[]) carte[p.id] = p;
        setProfils(carte);
        setEntrees(lot);
      } catch (err: any) {
        if (!annule) setErreur(err.message);
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => { annule = true; };
  }, [charger]);

  const chargerLaSuite = async () => {
    if (entrees.length === 0) return;
    setChargementSuite(true);
    setErreur('');
    try {
      const lot = await charger(entrees[entrees.length - 1].id);
      setEntrees((precedentes) => [...precedentes, ...lot]);
    } catch (err: any) {
      setErreur(err.message);
    } finally {
      setChargementSuite(false);
    }
  };

  // Les entrées arrivent déjà triées du plus récent au plus ancien : le
  // regroupement conserve cet ordre sans avoir à retrier.
  const groupes = useMemo<Groupe[]>(() => {
    const parTx = new Map<number, Groupe>();
    for (const e of entrees) {
      const existant = parTx.get(e.txid);
      if (existant) {
        existant.entrees.push(e);
        existant.auteurId ??= e.actor_id;
        existant.auteurNom ??= e.actor_nom;
      } else {
        parTx.set(e.txid, {
          txid: e.txid,
          premiereId: e.id,
          quand: new Date(e.occurred_at),
          auteurId: e.actor_id,
          auteurNom: e.actor_nom,
          entrees: [e],
        });
      }
    }
    return [...parTx.values()];
  }, [entrees]);

  const groupesFiltres = useMemo(
    () =>
      filtre === 'tout'
        ? groupes
        : groupes.filter((g) => g.entrees.some((e) => lireEntree(e).nature === filtre)),
    [groupes, filtre]
  );

  const naturesPresentes = useMemo(() => {
    const vues = new Set<Nature>();
    for (const g of groupes) for (const e of g.entrees) vues.add(lireEntree(e).nature);
    return [...vues];
  }, [groupes]);

  // Découpage par jour, pour un fil lisible plutôt qu'une liste continue.
  const parJour = useMemo(() => {
    const jours: { libelle: string; groupes: Groupe[] }[] = [];
    for (const g of groupesFiltres) {
      const libelle = libelleJour(g.quand);
      const dernier = jours[jours.length - 1];
      if (dernier && dernier.libelle === libelle) dernier.groupes.push(g);
      else jours.push({ libelle, groupes: [g] });
    }
    return jours;
  }, [groupesFiltres]);

  // Éligibilité en un seul appel pour toute la liste : demander la
  // vérification complète de chaque action à l'affichage ferait autant
  // d'allers-retours que d'entrées. La cohérence, elle, se vérifie au clic —
  // elle dépend de l'état au moment où l'on agit, pas au chargement.
  useEffect(() => {
    const txids = [...new Set(entrees.map((e) => e.txid))];
    if (txids.length === 0) return;
    let annule = false;
    (async () => {
      const { data, error } = await supabase.rpc('actions_restaurables', { p_txids: txids });
      if (annule || error) return;
      const carte: Record<number, boolean> = {};
      for (const ligne of data ?? []) carte[ligne.txid] = ligne.restaurable;
      setEligibles(carte);
    })();
    return () => { annule = true; };
  }, [entrees]);

  const demanderRestauration = async (g: Groupe) => {
    const resume = g.entrees.map((e) => lireEntree(e).texte).join(', puis ');
    setConfirmation({ txid: g.txid, resume, rapport: null });
    setTravail(true);
    try {
      // Mode vérification : la fonction n'écrit rien et rend son rapport.
      const { data, error } = await supabase.rpc('restaurer_action', {
        p_txid: g.txid,
        p_verifier_seulement: true,
      });
      if (error) throw error;
      setConfirmation({ txid: g.txid, resume, rapport: data as RapportRestauration });
    } catch (err: any) {
      setConfirmation(null);
      setErreur(err.message);
    } finally {
      setTravail(false);
    }
  };

  const confirmerRestauration = async () => {
    if (!confirmation) return;
    setTravail(true);
    setErreur('');
    try {
      const { data, error } = await supabase.rpc('restaurer_action', {
        p_txid: confirmation.txid,
        p_verifier_seulement: false,
      });
      if (error) throw error;
      const rapport = data as RapportRestauration;
      // La fonction peut encore refuser ici : l'état a pu changer entre la
      // vérification et le clic. On réaffiche alors le rapport, sans fermer.
      if (!rapport.ok) {
        setConfirmation({ ...confirmation, rapport });
        return;
      }
      setConfirmation(null);
      setChargement(true);
      setEntrees(await charger(null));
    } catch (err: any) {
      setErreur(err.message);
      setConfirmation(null);
    } finally {
      setTravail(false);
      setChargement(false);
    }
  };

  const basculer = (txid: number) =>
    setDeplies((precedents) => {
      const suivants = new Set(precedents);
      if (suivants.has(txid)) suivants.delete(txid);
      else suivants.add(txid);
      return suivants;
    });

  const nomMedecin = (id?: string | null) =>
    (id && profils[id]?.full_name) || (id ? 'Médecin inconnu' : 'personne');

  if (chargement) return <p className="text-caption">Chargement…</p>;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-5 flex items-center gap-3">
        <div className="rounded-pill bg-canard/10 p-2">
          <History className="h-6 w-6 text-canard" strokeWidth={2} />
        </div>
        <div>
          <h2 className="text-h2 text-ink">Journal d'activité</h2>
          <p className="text-caption">Qui a fait quoi, et quand</p>
        </div>
      </div>

      {erreur && (
        <p className="mb-4 rounded-input border border-brique/30 bg-brique/10 p-3 text-body-m text-brique">
          {erreur}
        </p>
      )}

      {naturesPresentes.length > 1 && (
        <div className="mb-5 flex gap-2 overflow-x-auto hide-scrollbar">
          <Chip actif={filtre === 'tout'} onClick={() => setFiltre('tout')} libelle="Tout" />
          {naturesPresentes.map((nature) => (
            <Chip
              key={nature}
              actif={filtre === nature}
              onClick={() => setFiltre(nature)}
              libelle={STYLE_NATURE[nature].libelle}
            />
          ))}
        </div>
      )}

      {parJour.length === 0 ? (
        <div className="rounded-card border border-border bg-carte p-8 text-center shadow-card">
          <p className="text-body-m text-muted">
            {groupes.length === 0
              ? "Aucune activité enregistrée pour l'instant."
              : 'Aucune action de ce type.'}
          </p>
        </div>
      ) : (
        parJour.map(({ libelle, groupes: duJour }) => (
          <section key={libelle} className="mb-6">
            <h3 className="text-eyebrow mb-2 px-1 text-muted">{libelle}</h3>
            <div className="space-y-2">
              {duJour.map((g) => {
                const deplie = deplies.has(g.txid);
                const detaillable = g.entrees.some(
                  (e) => !e.payload_truncated && (e.avant || e.apres)
                );
                const annulee = g.entrees.find((e) => e.undone_at);
                const restaurable = eligibles[g.txid] === true;
                return (
                  <article
                    key={g.txid}
                    className={`rounded-card border border-border bg-carte shadow-card ${
                      annulee ? 'opacity-70' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3 p-4">
                      <Avatar
                        profile={g.auteurId ? profils[g.auteurId] : null}
                        size={40}
                        alt={g.auteurNom ?? 'Hors application'}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-body-m text-ink">
                          <span className="font-semibold">
                            {g.auteurNom ?? 'Hors application'}
                          </span>{' '}
                          {g.entrees.map((e, i) => {
                            const lu = lireEntree(e);
                            return (
                              <span key={e.id}>
                                {i > 0 && <span className="text-muted">, puis </span>}
                                <span className={STYLE_NATURE[lu.nature].texte}>{lu.texte}</span>
                              </span>
                            );
                          })}
                        </p>
                        {g.entrees.map((e) => {
                          const lu = lireEntree(e);
                          return lu.precision ? (
                            <p key={e.id} className="text-caption mt-0.5">
                              {lu.precision}
                            </p>
                          ) : null;
                        })}
                        {annulee && (
                          <p className="text-caption mt-1 text-olive">
                            Action annulée
                            {annulee.undone_par ? ` par ${annulee.undone_par}` : ''}
                          </p>
                        )}
                        {restaurable && !annulee && (
                          <button
                            onClick={() => demanderRestauration(g)}
                            className="mt-2 inline-flex items-center gap-1.5 rounded-pill border border-border px-3 py-1 text-button text-marine transition-colors hover:border-canard hover:text-canard"
                          >
                            <Undo2 size={14} strokeWidth={2} />
                            Restaurer
                          </button>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-caption tabular-nums">
                          {g.quand.toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {detaillable && (
                          <button
                            onClick={() => basculer(g.txid)}
                            aria-label={deplie ? 'Masquer le détail' : 'Voir le détail'}
                            className="rounded-pill p-1 text-muted transition-colors hover:bg-fond hover:text-canard"
                          >
                            {deplie ? (
                              <ChevronDown size={18} strokeWidth={2} />
                            ) : (
                              <ChevronRight size={18} strokeWidth={2} />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {deplie && (
                      <div className="border-t border-border px-4 py-3">
                        {g.entrees.map((e) => (
                          <Detail key={e.id} entree={e} nomMedecin={nomMedecin} />
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        ))
      )}

      {confirmation && (
        <BottomSheet
          title="Restaurer cette action"
          onClose={() => setConfirmation(null)}
          busy={travail}
          footer={
            <>
              <button
                onClick={() => setConfirmation(null)}
                disabled={travail}
                className="h-12 flex-1 rounded-input border border-border text-button text-marine disabled:opacity-50"
              >
                {confirmation.rapport && !confirmation.rapport.ok ? 'Fermer' : 'Annuler'}
              </button>
              {confirmation.rapport?.ok && (
                <button
                  onClick={confirmerRestauration}
                  disabled={travail}
                  className="h-12 flex-1 rounded-input bg-marine text-button text-white shadow-button transition-colors hover:bg-marine/90 disabled:opacity-50"
                >
                  {travail ? 'Restauration…' : 'Restaurer'}
                </button>
              )}
            </>
          }
        >
          <p className="mb-3 text-body-m text-ink">
            <span className="font-semibold">Action :</span> {confirmation.resume}
          </p>

          {!confirmation.rapport ? (
            <p className="text-body-m text-muted">Vérification de l'état actuel…</p>
          ) : confirmation.rapport.ok ? (
            <p className="rounded-input border border-olive/30 bg-olive/10 p-3 text-body-m text-ink">
              Rien n'a changé depuis. {confirmation.rapport.lignes}{' '}
              {confirmation.rapport.lignes > 1 ? 'lignes seront rétablies' : 'ligne sera rétablie'}{' '}
              dans leur état précédent.
            </p>
          ) : (
            <div className="rounded-input border border-brique/30 bg-brique/10 p-3">
              <p className="mb-2 text-body-m font-semibold text-brique">
                Restauration impossible : la situation a changé depuis.
              </p>
              <ul className="space-y-1">
                {confirmation.rapport.conflits.slice(0, 8).map((c: Conflit, i) => (
                  <li key={i} className="text-caption text-ink">
                    {lireConflit(c, nomMedecin)}
                  </li>
                ))}
              </ul>
              {confirmation.rapport.conflits.length > 8 && (
                <p className="text-caption mt-2 text-muted">
                  … et {confirmation.rapport.conflits.length - 8} autres écarts
                </p>
              )}
              <p className="text-caption mt-3 text-muted">
                Rien n'a été modifié. Reprenez ces gardes une à une depuis le calendrier si
                vous voulez revenir en arrière.
              </p>
            </div>
          )}
        </BottomSheet>
      )}

      {!fin && groupes.length > 0 && (
        <button
          onClick={chargerLaSuite}
          disabled={chargementSuite}
          className="mx-auto mt-2 block rounded-input border border-border px-5 py-2.5 text-button text-marine transition-colors hover:bg-carte disabled:opacity-50"
        >
          {chargementSuite ? 'Chargement…' : 'Afficher les actions plus anciennes'}
        </button>
      )}
    </div>
  );
}

function Chip({ actif, onClick, libelle }: {
  actif: boolean; onClick: () => void; libelle: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-pill px-3.5 py-1.5 text-button transition-colors ${
        actif ? 'bg-canard text-white' : 'text-muted hover:bg-canard/10 hover:text-canard'
      }`}
    >
      {libelle}
    </button>
  );
}

/** Le détail ligne à ligne d'une écriture, apparié par identifiant. */
function Detail({ entree, nomMedecin }: {
  entree: EntreeJournal;
  nomMedecin: (id?: string | null) => string;
}) {
  if (entree.payload_truncated) {
    return <p className="text-caption">Détail non conservé ({entree.row_count} lignes).</p>;
  }
  if (entree.table_name !== 'shifts') {
    return (
      <p className="text-caption">
        {entree.row_count} ligne(s) — {entree.table_name}
      </p>
    );
  }

  const ids = Object.keys(entree.apres ?? entree.avant ?? {});
  const lignes = ids.slice(0, 40);

  return (
    <>
      <ul className="space-y-1">
        {lignes.map((id) => {
          const a = (entree.avant ?? {})[id] as LigneGarde | undefined;
          const b = (entree.apres ?? {})[id] as LigneGarde | undefined;
          const ref = b ?? a;
          const medAvant = a?.medecin ?? null;
          const medApres = b?.medecin ?? null;
          const change =
            !a || !b
              ? null
              : medAvant !== medApres
                ? `${nomMedecin(medAvant)} → ${nomMedecin(medApres)}`
                : a.statut !== b.statut
                  ? `${a.statut} → ${b.statut}`
                  : !a.supprimee && b.supprimee
                    ? 'supprimée'
                    : a.supprimee && !b.supprimee
                      ? 'restaurée'
                      : 'inchangée';
          return (
            <li key={id} className="text-caption flex flex-wrap gap-x-2">
              <span className="text-ink">{formaterJour(ref?.jour)}</span>
              <span>{ref?.creneau}</span>
              <span>{ref?.site}</span>
              {change && (
                <span className={change === 'inchangée' ? 'text-faint' : 'text-marine'}>
                  {change}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {ids.length > lignes.length && (
        <p className="text-caption mt-2 text-faint">
          … et {ids.length - lignes.length} autres
        </p>
      )}
    </>
  );
}

function libelleJour(d: Date): string {
  const aujourdhui = new Date();
  const hier = new Date();
  hier.setDate(hier.getDate() - 1);
  const memeJour = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (memeJour(d, aujourdhui)) return "Aujourd'hui";
  if (memeJour(d, hier)) return 'Hier';
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: d.getFullYear() === aujourdhui.getFullYear() ? undefined : 'numeric',
  });
}
