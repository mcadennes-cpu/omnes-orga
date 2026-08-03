import { useState, useEffect } from 'react';
import { NotebookPen, Loader2 } from 'lucide-react';
import BottomSheet from '../ui/BottomSheet';
import { supabase } from '../../lib/supabase';

// ---------------------------------------------------------------------------
// Signaler une modification souhaitee du roulement (MOD-1, etape 6G).
//
// LA CONTREPARTIE DU VERROU. Depuis 6B, l'application n'ecrit plus jamais le
// plan : c'est le fichier qui fait foi. Le principe ne tient au quotidien que
// si Charlotte dispose d'un chemin de retour vers le fichier -- sans lui, le
// moindre ajustement permanent demanderait de rouvrir Numbers seance tenante,
// et le verrou finirait contourne.
//
// ⚠ RIEN ICI NE MODIFIE LE ROULEMENT, ni maintenant ni apres report. C'est un
// carnet de notes structure : la seule facon de changer le plan reste le
// fichier, puis l'import. Le texte de l'ecran le dit sans detour, sinon on
// croira le changement applique.
//
// La traduction « garde du 18/01/2027 » -> « S3 · lundi · J3 Dijon » est faite
// PAR LA BASE : c'est le calcul qui a produit les defauts les plus subtils de
// MOD-1, on ne l'ecrit pas une fois de plus ici.
// ---------------------------------------------------------------------------

type Doctor = { id: string; full_name: string };

type RotationChangeModalProps = {
  shiftId: string;
  shiftLabel: string;
  doctorActuelNom: string | null;
  onClose: () => void;
  onSaved?: () => void;
};

const fieldClass =
  'w-full rounded-input border border-border bg-carte px-3 py-2 text-body-m text-ink ' +
  'focus:border-canard focus:outline-none focus:ring-2 focus:ring-canard/30';

export default function RotationChangeModal({
  shiftId, shiftLabel, doctorActuelNom, onClose, onSaved,
}: RotationChangeModalProps) {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [souhaiteId, setSouhaiteId] = useState<string>('');
  const [note, setNote] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState('');
  const [fait, setFait] = useState<{ semaine: number; jour: string } | null>(null);

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('is_active', true)
      .order('full_name')
      .then(({ data, error }) => {
        if (error) setErreur(error.message);
        else setDoctors((data ?? []) as Doctor[]);
      });
  }, []);

  const enregistrer = async () => {
    setEnregistrement(true);
    setErreur('');
    try {
      const { data, error } = await supabase.rpc('enregistrer_modification_souhaitee', {
        p_shift_id: shiftId,
        // Chaine vide = « personne » : la case sort du roulement.
        p_doctor_souhaite_id: souhaiteId || null,
        p_note: note.trim() || null,
      });
      if (error) throw error;
      const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
      setFait({ semaine: data.case.semaine, jour: JOURS[data.case.weekday] });
      onSaved?.();
    } catch (err: any) {
      setErreur(err.message);
    } finally {
      setEnregistrement(false);
    }
  };

  if (fait) {
    return (
      <BottomSheet title="Modification notée" onClose={onClose}>
        <div className="space-y-3">
          <div className="rounded-input border border-canard/30 bg-canard/5 p-4">
            <p className="text-body-m text-ink">
              Notée sur la case <strong>S{fait.semaine} · {fait.jour}</strong> du roulement.
            </p>
            <p className="mt-2 text-caption">
              Le roulement n'a pas changé : cette note attend d'être reportée dans le
              fichier. Le récapitulatif se trouve dans <strong>Paramètres → Roulement</strong>,
              et l'import du fichier mis à jour la rendra effective.
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-12 w-full rounded-input bg-marine text-button text-white shadow-button transition-colors hover:bg-marine/90"
          >
            Fermer
          </button>
        </div>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      title="Signaler un changement permanent"
      onClose={onClose}
      busy={enregistrement}
      footer={
        <>
          <button
            onClick={onClose}
            disabled={enregistrement}
            className="h-12 flex-1 rounded-input border border-border text-button text-marine disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={enregistrer}
            disabled={enregistrement}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-input bg-marine text-button text-white shadow-button transition-colors hover:bg-marine/90 disabled:opacity-50"
          >
            {enregistrement ? <Loader2 className="h-4 w-4 animate-spin" /> : <NotebookPen className="h-4 w-4" />}
            Noter
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-input border border-marine/20 bg-marine/5 p-3 text-body-m text-ink">
          Pour un changement <strong>durable du roulement</strong>, pas pour cette garde
          seule.
          <span className="mt-2 block text-caption">
            Rien ne sera modifié ici : le roulement vient du fichier. Cette note sera
            reprise dans un récapitulatif, à reporter dans le fichier avant le prochain
            import.
          </span>
        </div>

        <div>
          <p className="text-field-label mb-1">Case concernée</p>
          <p className="text-body-m text-ink">{shiftLabel}</p>
          <p className="text-caption">
            Au roulement aujourd'hui : {doctorActuelNom ?? 'personne'}
          </p>
        </div>

        <div>
          <label className="mb-2 block text-field-label">Qui devrait y être</label>
          <select
            value={souhaiteId}
            onChange={(e) => setSouhaiteId(e.target.value)}
            className={fieldClass}
          >
            <option value="">Personne — retirer cette case du roulement</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>{d.full_name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-field-label">Motif (facultatif)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Ex : Airelle passe à Beaune le lundi"
            className={fieldClass}
          />
        </div>

        {erreur && (
          <div className="rounded-input border border-brique/20 bg-brique/10 p-3 text-body-m text-brique">
            {erreur}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
