import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { NotebookPen, Check, X, Copy, ChevronDown, ChevronRight } from 'lucide-react';

// ---------------------------------------------------------------------------
// Recapitulatif des modifications souhaitees du roulement (MOD-1, etape 6G).
//
// C'est l'ecran qui rend le verrou de 6B tenable : Charlotte y retrouve tout
// ce qu'elle a note depuis les gardes, sous la forme ou le FICHIER l'attend
// (« S3 · Lundi · J3 · Dijon : AS -> MY »), le reporte, puis marque la ligne
// comme reportee. L'import du fichier mis a jour la rend effective.
//
// Le bouton « Copier » existe parce que le report se fait dans Numbers, hors
// de l'application : recopier a l'ecran une liste de quinze lignes est une
// source d'erreur qu'un presse-papier supprime.
// ---------------------------------------------------------------------------

type Modification = {
  id: string;
  plan_nom: string;
  rotation_week: number;
  weekday: number;
  jour_nom: string;
  site_nom: string;
  creneau_code: string;
  actuel_nom: string | null;
  souhaite_nom: string | null;
  note: string | null;
  status: string;
  cree_le: string;
  cree_par: string | null;
};

// « Imane EL GARI » -> « IEG ». Meme regle que la grille du roulement : c'est
// en initiales que le fichier s'ecrit.
function initiales(nom: string | null): string {
  if (!nom) return '—';
  return nom.split(/\s+/).filter(Boolean).map((m) => m[0]?.toUpperCase() ?? '').join('');
}

function ligneTexte(m: Modification): string {
  return `S${m.rotation_week} · ${m.jour_nom} · ${m.creneau_code} ${m.site_nom} : `
    + `${initiales(m.actuel_nom)} → ${initiales(m.souhaite_nom)}`
    + (m.note ? `  (${m.note})` : '');
}

export default function RotationChangesList() {
  const [modifications, setModifications] = useState<Modification[]>([]);
  const [reportees, setReportees] = useState<Modification[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState('');
  const [historiqueDeplie, setHistoriqueDeplie] = useState(false);
  const [copie, setCopie] = useState(false);

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      const [attente, faites] = await Promise.all([
        supabase.rpc('modifications_souhaitees', { p_status: 'pending' }),
        supabase.rpc('modifications_souhaitees', { p_status: 'reported' }),
      ]);
      if (attente.error) throw attente.error;
      if (faites.error) throw faites.error;
      setModifications((attente.data ?? []) as Modification[]);
      setReportees((faites.data ?? []) as Modification[]);
    } catch (err: any) {
      setErreur(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const changerStatut = async (id: string, status: 'reported' | 'abandoned') => {
    setErreur('');
    try {
      const { error } = await supabase
        .from('rotation_plan_changes')
        .update(
          status === 'reported'
            ? { status, reported_at: new Date().toISOString() }
            : { status },
        )
        .eq('id', id);
      if (error) throw error;
      await charger();
    } catch (err: any) {
      setErreur(err.message);
    }
  };

  const copier = async () => {
    const texte = modifications.map(ligneTexte).join('\n');
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      setErreur("Copie impossible — sélectionner le texte à la main.");
    }
  };

  if (loading) return <p className="text-caption">Chargement…</p>;

  return (
    <div className="rounded-card border border-border bg-carte p-6 shadow-card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-pill bg-ocre/10 p-2">
            <NotebookPen className="h-6 w-6 text-ocre-fonce" />
          </div>
          <div>
            <h2 className="text-h2 text-ink">Modifications souhaitées</h2>
            <p className="text-caption">À reporter dans le fichier de roulement</p>
          </div>
        </div>
        {modifications.length > 0 && (
          <button
            onClick={copier}
            className="flex items-center gap-2 rounded-input border border-border px-4 py-2.5 text-button text-marine transition-colors hover:bg-fond"
          >
            <Copy size={17} strokeWidth={2} />
            {copie ? 'Copié' : 'Copier la liste'}
          </button>
        )}
      </div>

      {erreur && (
        <div className="mb-4 rounded-input border border-brique/20 bg-brique/10 px-4 py-3 text-body-m text-brique">
          {erreur}
        </div>
      )}

      {modifications.length === 0 ? (
        <p className="text-body-m text-ink">
          Aucune modification en attente.
          <span className="mt-1 block text-caption">
            Depuis une garde, « Signaler un changement permanent » note ici ce qui devra
            être reporté dans le fichier.
          </span>
        </p>
      ) : (
        <>
          <div className="mb-4 rounded-card border border-marine/20 bg-marine/5 p-4 text-body-m text-ink">
            Ces {modifications.length}{' '}
            {modifications.length > 1 ? 'modifications ne sont pas appliquées' : 'modification n\'est pas appliquée'} :
            le roulement vient du fichier. Les reporter dans le fichier, puis l'importer —
            c'est l'import qui les rendra effectives.
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {['Semaine', 'Jour', 'Créneau', 'Site', 'Au roulement', 'Souhaité', 'Motif', ''].map((t) => (
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
                {modifications.map((m) => (
                  <tr key={m.id}>
                    <td className="border border-border px-2 py-1.5 text-body-m text-ink">S{m.rotation_week}</td>
                    <td className="border border-border px-2 py-1.5 text-body-m text-ink">{m.jour_nom}</td>
                    <td className="border border-border px-2 py-1.5 text-body-m font-semibold text-ink">{m.creneau_code}</td>
                    <td className="border border-border px-2 py-1.5 text-body-m text-ink">{m.site_nom}</td>
                    <td className="border border-border px-2 py-1.5 text-body-m text-muted" title={m.actuel_nom ?? ''}>
                      {initiales(m.actuel_nom)}
                    </td>
                    <td className="border border-border px-2 py-1.5 text-body-m font-semibold text-ink" title={m.souhaite_nom ?? 'Personne'}>
                      {initiales(m.souhaite_nom)}
                    </td>
                    <td className="border border-border px-2 py-1.5 text-caption">{m.note ?? '—'}</td>
                    <td className="border border-border px-2 py-1.5 whitespace-nowrap">
                      <div className="flex gap-1">
                        <button
                          onClick={() => changerStatut(m.id, 'reported')}
                          title="Reportée dans le fichier"
                          className="rounded-pill p-1.5 text-canard transition-colors hover:bg-canard/10"
                        >
                          <Check size={17} strokeWidth={2} />
                        </button>
                        <button
                          onClick={() => changerStatut(m.id, 'abandoned')}
                          title="Abandonner"
                          className="rounded-pill p-1.5 text-brique transition-colors hover:bg-brique/10"
                        >
                          <X size={17} strokeWidth={2} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {reportees.length > 0 && (
        <div className="mt-5">
          <button
            onClick={() => setHistoriqueDeplie(!historiqueDeplie)}
            aria-expanded={historiqueDeplie}
            className="flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-button text-canard transition-colors hover:bg-canard/10"
          >
            {historiqueDeplie ? <ChevronDown size={17} strokeWidth={2} /> : <ChevronRight size={17} strokeWidth={2} />}
            {reportees.length} déjà {reportees.length > 1 ? 'reportées' : 'reportée'} dans le fichier
          </button>
          {historiqueDeplie && (
            <ul className="mt-2 space-y-1">
              {reportees.map((m) => (
                <li key={m.id} className="text-caption">{ligneTexte(m)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
