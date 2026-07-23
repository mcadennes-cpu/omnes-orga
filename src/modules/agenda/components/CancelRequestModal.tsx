import BottomSheet from './ui/BottomSheet';

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
    <BottomSheet
      open={isOpen}
      title="Retirer cette demande ?"
      onClose={onClose}
      footer={
        <>
          <button
            onClick={onClose}
            className="h-12 flex-1 rounded-input border border-border text-button text-marine"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className="h-12 flex-1 rounded-input bg-brique text-button text-white shadow-button transition-colors hover:bg-brique/90"
          >
            Retirer la demande
          </button>
        </>
      }
    >
      <p className="mb-4 text-body-m text-ink">
        Voulez-vous retirer votre demande pour cette garde ?
      </p>

      <div className="rounded-card bg-fond p-4">
        <p className="mb-1 text-caption">Date</p>
        <p className="mb-3 font-semibold text-ink">{formatDate(shiftDate)}</p>
        <p className="mb-1 text-caption">Horaire</p>
        <p className="font-semibold text-ink">{shiftType}</p>
      </div>
    </BottomSheet>
  );
}
