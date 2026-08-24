import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Undo2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Conflit, RapportRestauration, lireConflit } from '../../lib/activityLabels';

// ---------------------------------------------------------------------------
// Bandeau éphémère (MOD2-E) — remplace le bouton « Annuler dernière action ».
//
// CE QU'IL CORRIGE
// L'ancien bouton lisait un tampon d'une seule action, sans péremption : le
// coordinateur pouvait défaire, sans s'en rendre compte, un geste vieux de
// trois jours — pendant lesquels des médecins avaient pu demander ou obtenir
// les gardes concernées. C'était « le risque le plus sérieux du dispositif ».
// Un bandeau qui disparaît supprime ce risque par construction : passé le délai,
// il n'y a plus rien à cliquer.
//
// Il remplace aussi le sondage réseau toutes les 2 secondes : l'état vit ici,
// côté client, et n'interroge la base que si l'on clique.
//
// L'ANNULATION PASSE PAR LA MÊME PORTE QUE LE JOURNAL
// « Annuler » appelle restaurer_action, donc hérite du garde-fou de cohérence :
// si la situation a changé entre l'action et le clic, le bandeau le dit et
// n'écrit rien. Il n'y a pas de chemin d'annulation privilégié.
// ---------------------------------------------------------------------------

const DELAI_SECONDES = 12;

type Ton = 'info' | 'succes' | 'erreur';

type Bandeau = {
  cle: number;
  texte: string;
  ton: Ton;
  txid?: number;
  /** Compte à rebours restant, en secondes. Absent = bandeau non annulable. */
  restant?: number;
};

type ToastApi = {
  /** Message simple, sans possibilité d'annuler. */
  signaler: (texte: string, ton?: Ton) => void;
  /**
   * Message suivi d'un « Annuler » si l'écriture qui vient d'avoir lieu est
   * retrouvée dans le journal. À appeler juste après l'action réussie.
   */
  signalerAction: (texte: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/** Renvoie l'API du bandeau. Sans fournisseur, les appels sont sans effet. */
export function useToast(): ToastApi {
  return (
    useContext(ToastContext) ?? {
      signaler: () => {},
      signalerAction: () => {},
    }
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [bandeau, setBandeau] = useState<Bandeau | null>(null);
  const [travail, setTravail] = useState(false);
  const compteur = useRef(0);

  const fermer = useCallback(() => setBandeau(null), []);

  const signaler = useCallback((texte: string, ton: Ton = 'info') => {
    compteur.current += 1;
    setBandeau({ cle: compteur.current, texte, ton, restant: DELAI_SECONDES });
  }, []);

  const signalerAction = useCallback((texte: string) => {
    compteur.current += 1;
    const cle = compteur.current;
    setBandeau({ cle, texte, ton: 'succes', restant: DELAI_SECONDES });

    // Le txid arrive après coup : le bandeau s'affiche tout de suite, le bouton
    // « Annuler » apparaît dès que l'écriture est retrouvée dans le journal.
    (async () => {
      const { data } = await supabase.rpc('derniere_action', { p_secondes: 20 });
      if (!data?.txid) return;
      setBandeau((actuel) =>
        actuel && actuel.cle === cle ? { ...actuel, txid: data.txid } : actuel
      );
    })();
  }, []);

  // Un seul intervalle pour tout le compte à rebours, remonté à chaque
  // changement de bandeau. À zéro, la feuille disparaît d'elle-même.
  useEffect(() => {
    if (!bandeau || bandeau.restant === undefined || travail) return;
    if (bandeau.restant <= 0) {
      setBandeau(null);
      return;
    }
    const minuteur = setTimeout(() => {
      setBandeau((actuel) =>
        actuel && actuel.cle === bandeau.cle && actuel.restant !== undefined
          ? { ...actuel, restant: actuel.restant - 1 }
          : actuel
      );
    }, 1000);
    return () => clearTimeout(minuteur);
  }, [bandeau, travail]);

  const annuler = async () => {
    if (!bandeau?.txid) return;
    setTravail(true);
    try {
      const { data, error } = await supabase.rpc('restaurer_action', {
        p_txid: bandeau.txid,
        p_verifier_seulement: false,
      });
      if (error) throw error;
      const rapport = data as RapportRestauration;

      if (rapport.ok) {
        compteur.current += 1;
        setBandeau({
          cle: compteur.current,
          texte: 'Action annulée.',
          ton: 'succes',
          restant: 5,
        });
        // Les vues rechargent leurs données : plus simple et plus sûr que de
        // faire remonter un rappel à travers tout le module.
        window.dispatchEvent(new CustomEvent('agenda:rafraichir'));
      } else {
        const detail = (rapport.conflits ?? [])
          .slice(0, 2)
          .map((c: Conflit) => lireConflit(c, () => 'un autre médecin'))
          .join(' · ');
        compteur.current += 1;
        setBandeau({
          cle: compteur.current,
          texte: `Annulation impossible : la situation a changé. ${detail}`,
          ton: 'erreur',
          restant: 12,
        });
      }
    } catch (err: any) {
      compteur.current += 1;
      setBandeau({
        cle: compteur.current,
        texte: err.message ?? "Erreur pendant l'annulation.",
        ton: 'erreur',
        restant: 12,
      });
    } finally {
      setTravail(false);
    }
  };

  const styles: Record<Ton, { bord: string; icone: ReactNode }> = {
    info: { bord: 'border-border', icone: null },
    succes: {
      bord: 'border-canard/30',
      icone: <Check size={18} strokeWidth={2} className="shrink-0 text-canard" />,
    },
    erreur: {
      bord: 'border-brique/40',
      icone: <AlertTriangle size={18} strokeWidth={2} className="shrink-0 text-brique" />,
    },
  };

  return (
    <ToastContext.Provider value={{ signaler, signalerAction }}>
      {children}
      {bandeau &&
        createPortal(
          <div
            role="status"
            aria-live="polite"
            className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          >
            <div
              className={`animate-slide-up flex w-full max-w-xl items-center gap-3 rounded-card border ${styles[bandeau.ton].bord} bg-carte px-4 py-3 shadow-card`}
            >
              {styles[bandeau.ton].icone}
              <p className="min-w-0 flex-1 text-body-m text-ink">{bandeau.texte}</p>

              {bandeau.txid !== undefined && (
                <button
                  onClick={annuler}
                  disabled={travail}
                  className="flex shrink-0 items-center gap-1.5 rounded-pill border border-marine/25 px-3 py-1.5 text-button text-marine transition-colors hover:bg-marine/5 disabled:opacity-50"
                >
                  <Undo2 size={15} strokeWidth={2} />
                  {travail ? 'Annulation…' : 'Annuler'}
                  {bandeau.restant !== undefined && !travail && (
                    <span className="tabular-nums text-muted">{bandeau.restant}</span>
                  )}
                </button>
              )}

              <button
                onClick={fermer}
                aria-label="Fermer"
                className="shrink-0 rounded-pill p-1 text-muted transition-colors hover:bg-fond hover:text-marine"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}
