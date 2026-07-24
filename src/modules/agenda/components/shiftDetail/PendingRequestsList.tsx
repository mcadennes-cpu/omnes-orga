import { Users, Check, Clock, RotateCcw } from 'lucide-react';
import StatusBadge from '../ui/StatusBadge';

type PendingRequest = {
  id: string;
  doctor_id: string;
  requested_at: string;
  status: string;
  doctor: {
    id: string;
    full_name: string;
    email: string;
  };
};

type PendingRequestsListProps = {
  pendingRequests: PendingRequest[];
  shiftStatus: string;
  hideValidation: boolean;
  loading: boolean;
  onApprove: (requestId: string, doctorId: string) => void;
  onSetOnHold: (requestId: string, doctorId: string) => void;
  onRemovePrevalidation: (requestId: string) => void;
};

// Liste des demandes (avec actions de validation) ou simple resume si
// hideValidation (la validation se fait alors depuis l'onglet Demandes).
export default function PendingRequestsList({
  pendingRequests,
  shiftStatus,
  hideValidation,
  loading,
  onApprove,
  onSetOnHold,
  onRemovePrevalidation,
}: PendingRequestsListProps) {
  if (pendingRequests.length === 0) return null;

  if (hideValidation) {
    const pendingCount = pendingRequests.filter(r => r.status === 'pending').length;
    const onHoldCount = pendingRequests.filter(r => r.status === 'on_hold').length;
    return (
      <div className="mt-6 border-t border-border pt-6">
        <div className="flex items-start gap-3 rounded-card border border-ocre/30 bg-ocre/10 p-4">
          <Users className="mt-0.5 h-5 w-5 flex-shrink-0 text-ocre-fonce" />
          <div>
            <div className="text-body-m font-semibold text-ocre-fonce">
              {pendingCount} {pendingCount === 1 ? 'demande en attente de validation' : 'demandes en attente de validation'}
              {onHoldCount > 0 && <>, {onHoldCount} en pré-validation</>}
            </div>
            <div className="mt-1 text-body-m text-ocre-fonce/80">
              Pour valider ou refuser les demandes, utilisez l'onglet « Demandes »
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 border-t border-border pt-6">
      <div className="mb-4 flex items-center gap-2">
        <Users className="h-5 w-5 text-ocre-fonce" />
        <h3 className="text-h2 text-ink">
          {shiftStatus === 'assigned'
            ? `Autres demandes (${pendingRequests.length})`
            : `Demandes (${pendingRequests.length})`}
        </h3>
      </div>
      {shiftStatus === 'assigned' && (
        <p className="mb-4 text-body-m text-muted">
          Vous pouvez remplacer le médecin actuellement assigné en validant ou pré-validant une autre demande.
        </p>
      )}

      <div className="space-y-3">
        {pendingRequests.map((request) => {
          const isOnHold = request.status === 'on_hold';
          const cardClass = isOnHold ? 'border-marine/20 bg-marine/5' : 'border-ocre/30 bg-ocre/5';

          return (
            <div key={request.id} className={`rounded-card border p-4 ${cardClass}`}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-semibold text-ink">{request.doctor.full_name}</div>
                    <StatusBadge
                      status={isOnHold ? 'prevalide' : 'demandes'}
                      label={isOnHold ? 'Pré-validation' : 'En attente de validation'}
                    />
                  </div>
                  <div className="text-body-m text-muted">{request.doctor.email}</div>
                  <div className="mt-1 text-caption">
                    Demandé le {new Date(request.requested_at).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => onApprove(request.id, request.doctor_id)}
                  disabled={loading}
                  className="flex items-center gap-2 rounded-input bg-green-600 px-4 py-2 text-body-m font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  Valider
                </button>
                {isOnHold ? (
                  <button
                    onClick={() => onRemovePrevalidation(request.id)}
                    disabled={loading}
                    className="flex items-center gap-2 rounded-input border border-ocre/40 bg-ocre/10 px-4 py-2 text-body-m font-semibold text-ocre-fonce transition-colors hover:bg-ocre/20 disabled:opacity-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Retirer la pré-validation
                  </button>
                ) : (
                  <button
                    onClick={() => onSetOnHold(request.id, request.doctor_id)}
                    disabled={loading}
                    className="flex items-center gap-2 rounded-input bg-marine px-4 py-2 text-body-m font-semibold text-white transition-colors hover:bg-marine/90 disabled:opacity-50"
                  >
                    <Clock className="h-4 w-4" />
                    Pré-validation
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
