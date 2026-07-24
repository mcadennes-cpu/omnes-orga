import { AlertTriangle } from 'lucide-react';
import BottomSheet from '../ui/BottomSheet';

type DeletionBlockedModalProps = {
  onClose: () => void;
};

export default function DeletionBlockedModal({ onClose }: DeletionBlockedModalProps) {
  return (
    <BottomSheet
      title="Suppression impossible"
      onClose={onClose}
      footer={
        <button
          onClick={onClose}
          className="h-12 flex-1 rounded-input bg-marine text-button text-white shadow-button transition-colors hover:bg-marine/90"
        >
          OK
        </button>
      }
    >
      <div className="flex items-start gap-3 rounded-card border border-brique/20 bg-brique/10 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-brique" />
        <p className="text-body-m text-ink">
          Cette plage comprend des plages d'ouvertures validées ou en attente, vous devez les
          supprimer avant de supprimer cette plage d'ouverture.
        </p>
      </div>
    </BottomSheet>
  );
}
