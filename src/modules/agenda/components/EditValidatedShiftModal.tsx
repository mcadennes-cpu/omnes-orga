import { AlertTriangle } from 'lucide-react';
import BottomSheet from './ui/BottomSheet';

type EditValidatedShiftModalProps = {
  onConfirm: () => void;
  onCancel: () => void;
};

export default function EditValidatedShiftModal({ onConfirm, onCancel }: EditValidatedShiftModalProps) {
  return (
    <BottomSheet
      title="Garde déjà validée"
      onClose={onCancel}
      footer={
        <>
          <button
            onClick={onCancel}
            className="h-12 flex-1 rounded-input border border-border text-button text-marine"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className="h-12 flex-1 rounded-input bg-marine text-button text-white shadow-button transition-colors hover:bg-marine/90"
          >
            Confirmer la modification
          </button>
        </>
      }
    >
      <div className="flex items-start gap-3 rounded-card border border-ocre/30 bg-ocre/10 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-ocre-fonce" />
        <p className="text-body-m text-ink">
          Cette garde a déjà été validée. Êtes-vous sûr de vouloir la modifier ?
        </p>
      </div>
    </BottomSheet>
  );
}
