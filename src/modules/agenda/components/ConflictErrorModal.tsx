import { AlertCircle } from 'lucide-react';
import BottomSheet from './ui/BottomSheet';

type ConflictErrorModalProps = {
  onClose: () => void;
  errorMessage: string;
};

export default function ConflictErrorModal({ onClose, errorMessage }: ConflictErrorModalProps) {
  return (
    <BottomSheet
      title="Conflit détecté"
      onClose={onClose}
      footer={
        <button
          onClick={onClose}
          className="h-12 flex-1 rounded-input bg-marine text-button text-white shadow-button transition-colors hover:bg-marine/90"
        >
          Compris
        </button>
      }
    >
      <div className="flex items-start gap-3 rounded-card border border-brique/20 bg-brique/10 p-4">
        <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-brique" />
        <p className="whitespace-pre-line text-body-m leading-relaxed text-ink">
          {errorMessage}
        </p>
      </div>
    </BottomSheet>
  );
}
