import { Repeat } from 'lucide-react';
import BottomSheet from '../ui/BottomSheet';

type ApplyToRotationWeekModalProps = {
  doctorName: string;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ApplyToRotationWeekModal({
  doctorName,
  loading,
  onConfirm,
  onCancel,
}: ApplyToRotationWeekModalProps) {
  return (
    <BottomSheet
      title="Appliquer au roulement"
      onClose={onCancel}
      busy={loading}
      footer={
        <>
          <button
            onClick={onCancel}
            disabled={loading}
            className="h-12 flex-1 rounded-input border border-border text-button text-marine disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="h-12 flex-1 rounded-input bg-marine text-button text-white shadow-button transition-colors hover:bg-marine/90 disabled:opacity-50"
          >
            Confirmer
          </button>
        </>
      }
    >
      <div className="flex items-start gap-3 rounded-card border border-marine/20 bg-marine/5 p-4">
        <Repeat className="mt-0.5 h-5 w-5 flex-shrink-0 text-marine" />
        <p className="text-body-m text-ink">
          Vous allez assigner <strong>{doctorName}</strong> à toutes les gardes de la même
          semaine de roulement, avec le même site, la même salle et le même horaire. Continuer ?
        </p>
      </div>
    </BottomSheet>
  );
}
