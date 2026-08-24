import BottomSheet from '../ui/BottomSheet';

type CancelAssignmentModalProps = {
  hasRotationRule: boolean;
  rotationCancelCount?: number | null;
  seriesCancelCount?: number | null;
  doctorName?: string | null;
  isPartOfSeries: boolean;
  loading: boolean;
  onSingle: () => void;
  onSeries: () => void;
  onRotation: () => void;
  onClose: () => void;
};

// Sous-modale « liberer la garde » : portee simple, serie, ou regle de
// roulement selon le contexte de la garde.
//
// VOCABULAIRE (MOD2-F) : « annuler » est reserve a DEFAIRE UNE ACTION, geste
// du bandeau ephemere. Retirer un medecin d'une garde, c'est « liberer ».
export default function CancelAssignmentModal({
  hasRotationRule,
  rotationCancelCount,
  seriesCancelCount,
  doctorName,
  isPartOfSeries,
  loading,
  onSingle,
  onSeries,
  onRotation,
  onClose,
}: CancelAssignmentModalProps) {
  const gardes = (n: number) => `${n} garde${n > 1 ? 's' : ''}`;

  const countLabel =
    rotationCancelCount != null
      ? `${gardes(rotationCancelCount)} future${rotationCancelCount > 1 ? 's' : ''}`
      : null;

  return (
    <BottomSheet title="Libérer la garde" onClose={onClose} busy={loading}>
      <p className="mb-4 text-body-m text-ink">
        {hasRotationRule
          ? "Cette attribution vient du roulement. Que souhaitez-vous faire ?"
          : "Souhaitez-vous libérer uniquement cette date, ou toute la série ?"}
      </p>

      {!hasRotationRule && isPartOfSeries && seriesCancelCount != null && (
        <div className="mb-4 rounded-input border border-brique/20 bg-brique/10 px-4 py-3 text-body-m text-brique">
          « Libérer toute la série » rendra libres <strong>{gardes(seriesCancelCount)}</strong>
          {doctorName ? <> attribuées à <strong>{doctorName}</strong></> : null}, à partir
          d'aujourd'hui. Les gardes des autres médecins et les gardes déjà passées ne sont
          pas touchées.
        </div>
      )}

      {hasRotationRule && countLabel && (
        <div className="mb-4 rounded-input border border-brique/20 bg-brique/10 px-4 py-3 text-body-m text-brique">
          Cette action libérera <strong>{countLabel}</strong> placées sur cette même case du roulement — même médecin, même jour de la semaine, même semaine de cycle. Les autres gardes de ce créneau ne sont pas touchées. Cette action est irréversible.
          <span className="mt-2 block">
            Le roulement n'est pas modifié : une garde recréée sur cette case retrouvera le même médecin.
          </span>
        </div>
      )}
      <div className="space-y-3">
        <button
          onClick={onSingle}
          disabled={loading}
          className="w-full rounded-input border border-ocre/40 bg-ocre/10 px-4 py-3 text-button text-ocre-fonce transition-colors hover:bg-ocre/20 disabled:opacity-50"
        >
          {hasRotationRule ? 'Libérer uniquement cette garde' : 'Libérer uniquement cette date'}
        </button>
        {hasRotationRule ? (
          <button
            onClick={onRotation}
            disabled={loading}
            className="w-full rounded-input bg-brique px-4 py-3 text-button text-white shadow-button transition-colors hover:bg-brique/90 disabled:opacity-50"
          >
            Libérer les gardes de cette case
          </button>
        ) : isPartOfSeries && (
          <button
            onClick={onSeries}
            disabled={loading}
            className="w-full rounded-input bg-brique px-4 py-3 text-button text-white shadow-button transition-colors hover:bg-brique/90 disabled:opacity-50"
          >
            Libérer toute la série
          </button>
        )}
        <button
          onClick={onClose}
          disabled={loading}
          className="w-full rounded-input border border-border px-4 py-3 text-button text-marine transition-colors hover:bg-fond disabled:opacity-50"
        >
          Retour
        </button>
      </div>
    </BottomSheet>
  );
}
