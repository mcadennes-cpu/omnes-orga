import { ReactNode } from 'react';
import BottomSheet from './BottomSheet';

// ---------------------------------------------------------------------------
// Confirmation d'une action sensible (MOD2-F).
//
// POURQUOI UN COMPOSANT DE PLUS
// Le module remplacait ses confirmations par confirm() : une boite du
// navigateur, qui bloque l'onglet, ignore la charte et se lit mal sur mobile.
// Trois ecrans de parametres et la fiche garde posaient la meme question de la
// meme facon -- autant l'ecrire une fois.
//
// POURQUOI PAS LE ConfirmModal DE L'APPLI PRINCIPALE
// Il est en feuille du bas pure (justify-end), sans variante ordinateur. Or
// les ecrans concernes sont ceux du coordinateur, qui travaille sur ordinateur
// (decision de l'etape 4). En s'appuyant sur BottomSheet, on herite de la
// presentation responsive du module : feuille sur mobile, dialogue centre
// au-dela de md.
//
// Purement presentationnel : l'etat d'envoi appartient a l'appelant, comme
// dans CancelAssignmentModal.
// ---------------------------------------------------------------------------

type ConfirmSheetProps = {
  open?: boolean;
  title: string;
  /** Corps du message. Du texte, ou du JSX pour mettre en avant un nom. */
  children: ReactNode;
  /** Libelle du bouton d'action. Doit nommer l'acte : « Supprimer la salle ». */
  confirmLabel: string;
  /** Teinte l'action en brique. A poser des que l'action detruit ou libere. */
  danger?: boolean;
  /** Envoi en cours : boutons neutralises, fermeture bloquee. */
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export default function ConfirmSheet({
  open,
  title,
  children,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: ConfirmSheetProps) {
  return (
    <BottomSheet
      open={open}
      title={title}
      onClose={onClose}
      busy={busy}
      footer={
        <>
          <button
            onClick={onClose}
            disabled={busy}
            className="h-12 flex-1 rounded-input border border-border text-button text-marine transition-colors hover:bg-fond disabled:opacity-50"
          >
            {/* « Annuler » reste le mot des pieds de dialogue : il abandonne la
                saisie en cours, il ne defait pas une action passee. */}
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`h-12 flex-1 rounded-input text-button text-white shadow-button transition-colors disabled:opacity-50 ${
              danger ? 'bg-brique hover:bg-brique/90' : 'bg-marine hover:bg-marine/90'
            }`}
          >
            {busy ? 'En cours…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-body-m text-ink">{children}</div>
    </BottomSheet>
  );
}
