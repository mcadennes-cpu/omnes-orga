import { useState } from 'react';
import { supabase, Shift } from '../lib/supabase';
import { X, Calendar, MapPin, Clock } from 'lucide-react';

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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-teal-900">Demander cette garde</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        <div className="space-y-4 mb-6">
          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
            <Calendar className="w-5 h-5 text-cyan-600 mt-0.5" />
            <div>
              <p className="text-xs text-gray-600 mb-1">Date</p>
              <p className="font-semibold text-gray-900">{formatDate(shift.date)}</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
            <MapPin className="w-5 h-5 text-cyan-600 mt-0.5" />
            <div>
              <p className="text-xs text-gray-600 mb-1">Lieu et Salle</p>
              <p className="font-semibold text-gray-900">{shift.location} • {shift.room}</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
            <Clock className="w-5 h-5 text-cyan-600 mt-0.5" />
            <div>
              <p className="text-xs text-gray-600 mb-1">Horaire</p>
              <p className="font-semibold text-gray-900">{shift.shift_type}</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 px-6 py-3 bg-pink-500 hover:bg-pink-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Envoi...' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
}
