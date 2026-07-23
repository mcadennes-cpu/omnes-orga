import { X } from 'lucide-react';

type CancelRequestModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  shiftDate: string;
  shiftType: string;
};

export default function CancelRequestModal({
  isOpen,
  onClose,
  onConfirm,
  shiftDate,
  shiftType
}: CancelRequestModalProps) {
  if (!isOpen) return null;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Retirer cette demande ?</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-gray-700 mb-4">
            Voulez-vous retirer votre demande pour cette garde ?
          </p>

          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-600 mb-1">Date</p>
            <p className="font-semibold text-gray-900 mb-3">{formatDate(shiftDate)}</p>
            <p className="text-sm text-gray-600 mb-1">Horaire</p>
            <p className="font-semibold text-gray-900">{shiftType}</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Annuler
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
            >
              Retirer la demande
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
