import { useState } from 'react';
import { supabase, Shift } from '../lib/supabase';
import { Calendar, MapPin, Clock } from 'lucide-react';
import BottomSheet from './ui/BottomSheet';

type ShiftRequestModalProps = {
  shift: Shift;
  doctorId: string;
  onClose: () => void;
  onSuccess: () => void;
};

export default function ShiftRequestModal({ shift, doctorId, onClose, onSuccess }: ShiftRequestModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(date);
  };

  const handleConfirm = async () => {
    setError('');
    setLoading(true);

    try {
      const { error: insertError } = await supabase
        .from('requests')
        .insert({
          shift_id: shift.id,
          doctor_id: doctorId,
          status: 'pending'
        });

      if (insertError) throw insertError;

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const infoRow = (icon: JSX.Element, label: string, value: string) => (
    <div className="flex items-start gap-3 rounded-card bg-fond p-4">
      {icon}
      <div>
        <p className="mb-1 text-caption">{label}</p>
        <p className="font-semibold text-ink">{value}</p>
      </div>
    </div>
  );

  return (
    <BottomSheet
      title="Demander cette garde"
      onClose={onClose}
      busy={loading}
      footer={
        <>
          <button
            onClick={onClose}
            disabled={loading}
            className="h-12 flex-1 rounded-input border border-border text-button text-marine disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="h-12 flex-1 rounded-input bg-marine text-button text-white shadow-button transition-colors hover:bg-marine/90 disabled:opacity-50"
          >
            {loading ? 'Envoi…' : 'Confirmer'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {infoRow(
          <Calendar className="mt-0.5 h-5 w-5 text-canard" />,
          'Date',
          formatDate(shift.date),
        )}
        {infoRow(
          <MapPin className="mt-0.5 h-5 w-5 text-canard" />,
          'Lieu et salle',
          `${shift.location} • ${shift.room}`,
        )}
        {infoRow(
          <Clock className="mt-0.5 h-5 w-5 text-canard" />,
          'Horaire',
          shift.shift_type,
        )}

        {error && (
          <div className="rounded-input border border-brique/20 bg-brique/10 px-3 py-2 text-body-m font-medium text-brique">
            {error}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
