import { ReactNode } from 'react';
import { Calendar, Clock, MapPin, User, Repeat, Edit2 } from 'lucide-react';
import { Shift } from '../../lib/supabase';
import StatusBadge from '../ui/StatusBadge';
import { AgendaStatusKey } from '../../lib/statusStyles';

type ShiftInfoRowsProps = {
  shift: Shift;
  rotationInfo: { week: number; total: number } | null;
  isPartOfSeries: boolean;
  hideSeriesInfo: boolean;
  readOnlyMode: boolean;
  loading: boolean;
  onEditSeries: () => void;
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

// Statut de la garde -> cle statusStyles + libelle (wording d'origine conserve).
function statusFor(status: string): { key: AgendaStatusKey; label: string } {
  if (status === 'free') return { key: 'libre', label: 'Libre' };
  if (status === 'assigned') return { key: 'assigne', label: 'Assigné' };
  if (status === 'pending') return { key: 'demandes', label: 'En attente de validation' };
  return { key: 'demandes', label: status };
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      {icon}
      <div className="flex-1">
        <div className="text-field-label">{label}</div>
        <div className="mt-0.5 text-body-m font-medium text-ink">{children}</div>
      </div>
    </div>
  );
}

// Bloc d'informations d'une garde (date, horaire, lieu, medecin, statut) +
// encarts roulement / serie. Purement presentationnel.
export default function ShiftInfoRows({
  shift,
  rotationInfo,
  isPartOfSeries,
  hideSeriesInfo,
  readOnlyMode,
  loading,
  onEditSeries,
}: ShiftInfoRowsProps) {
  const status = statusFor(shift.status);
  const iconClass = 'mt-0.5 h-5 w-5 flex-shrink-0 text-muted';

  return (
    <div className="space-y-4">
      <Row icon={<Calendar className={iconClass} />} label="Date">
        <span className="capitalize">{formatDate(shift.date)}</span>
      </Row>

      <Row icon={<Clock className={iconClass} />} label="Horaire">
        {shift.shift_type}
      </Row>

      <Row icon={<MapPin className={iconClass} />} label="Lieu">
        {shift.location} - {shift.room}
      </Row>

      <Row icon={<User className={iconClass} />} label="Médecin assigné">
        {shift.assigned_doctor?.full_name || 'Non assigné'}
      </Row>

      <div className="flex items-start gap-3">
        <div className={iconClass} />
        <div>
          <div className="text-field-label">Statut</div>
          <div className="mt-1">
            <StatusBadge status={status.key} label={status.label} />
          </div>
        </div>
      </div>

      {rotationInfo && (
        <div className="flex items-center gap-2 rounded-card border border-marine/20 bg-marine/5 p-3">
          <Repeat className="h-5 w-5 flex-shrink-0 text-marine" />
          <div className="text-body-m font-semibold text-marine">
            Semaine de roulement n°{rotationInfo.week} / {rotationInfo.total}
          </div>
        </div>
      )}

      {isPartOfSeries && !hideSeriesInfo && (
        <div className="rounded-card border border-marine/20 bg-marine/5 p-4">
          <div className="flex items-start gap-3">
            <Repeat className="mt-0.5 h-5 w-5 flex-shrink-0 text-marine" />
            <div>
              <div className="text-body-m font-semibold text-marine">Série récurrente</div>
              <div className="text-body-m text-muted">Cette garde fait partie d'une série</div>
            </div>
          </div>
          {!readOnlyMode && (
            <button
              onClick={onEditSeries}
              disabled={loading}
              className="mt-3 flex items-center gap-2 rounded-input bg-marine px-4 py-2 text-body-m font-semibold text-white transition-colors hover:bg-marine/90 disabled:opacity-50"
            >
              <Edit2 className="h-4 w-4" />
              Modifier la récurrence
            </button>
          )}
        </div>
      )}
    </div>
  );
}
