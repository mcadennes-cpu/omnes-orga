import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Calendar, Repeat } from 'lucide-react';
import { applyRotationRulesToShifts } from '../lib/rotationUtils';

type EditSeriesModalProps = {
  seriesId: string;
  onClose: () => void;
  onSuccess: () => void;
};

const WEEKDAYS = [
  { value: 0, label: 'Lun', fullLabel: 'Lundi' },
  { value: 1, label: 'Mar', fullLabel: 'Mardi' },
  { value: 2, label: 'Mer', fullLabel: 'Mercredi' },
  { value: 3, label: 'Jeu', fullLabel: 'Jeudi' },
  { value: 4, label: 'Ven', fullLabel: 'Vendredi' },
  { value: 5, label: 'Sam', fullLabel: 'Samedi' },
  { value: 6, label: 'Dim', fullLabel: 'Dimanche' }
];

export default function EditSeriesModal({ seriesId, onClose, onSuccess }: EditSeriesModalProps) {
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState('');

  const [seriesName, setSeriesName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([]);
  const [currentShifts, setCurrentShifts] = useState<any[]>([]);

  useEffect(() => {
    loadSeriesData();
  }, [seriesId]);

  const loadSeriesData = async () => {
    setDataLoading(true);
    try {
      const { data: seriesData, error: seriesError } = await supabase
        .from('fixed_duty_series')
        .select('*')
        .eq('id', seriesId)
        .single();

      if (seriesError) throw seriesError;

      if (seriesData) {
        setSeriesName(seriesData.name);
        setStartDate(seriesData.start_date);
        setEndDate(seriesData.end_date || '');
      }

      const { data: shiftsData, error: shiftsError } = await supabase
        .from('shifts')
        .select('*')
        .eq('series_id', seriesId)
        .order('date');

      if (shiftsError) throw shiftsError;

      if (shiftsData && shiftsData.length > 0) {
        setCurrentShifts(shiftsData);

        const weekdaysSet = new Set<number>();
        shiftsData.forEach(shift => {
          const date = new Date(shift.date);
          const dayOfWeek = (date.getDay() + 6) % 7;
          weekdaysSet.add(dayOfWeek);
        });
        setSelectedWeekdays(Array.from(weekdaysSet).sort());
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDataLoading(false);
    }
  };

  const toggleWeekday = (weekday: number) => {
    setSelectedWeekdays(prev =>
      prev.includes(weekday)
        ? prev.filter(d => d !== weekday)
        : [...prev, weekday].sort()
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (selectedWeekdays.length === 0) {
        throw new Error('Veuillez sélectionner au moins un jour de la semaine');
      }
      if (!endDate) {
        throw new Error('Veuillez sélectionner une date de fin');
      }

      const start = new Date(startDate);
      const end = new Date(endDate);

      if (end <= start) {
        throw new Error('La date de fin doit être après la date de début');
      }

      const { error: updateError } = await supabase
        .from('fixed_duty_series')
        .update({
          name: seriesName,
          end_date: endDate,
          updated_at: new Date().toISOString()
        })
        .eq('id', seriesId);

      if (updateError) throw updateError;

      const existingShifts = currentShifts;
      const firstShift = existingShifts[0];

      const shiftsToCreate = [];
      const shiftsToKeep = new Set<string>();
      let currentDate = new Date(start);

      while (currentDate <= end) {
        const dayOfWeek = (currentDate.getDay() + 6) % 7;
        const dateStr = currentDate.toISOString().split('T')[0];

        if (selectedWeekdays.includes(dayOfWeek)) {
          const existingShift = existingShifts.find(s => s.date === dateStr);

          if (existingShift) {
            shiftsToKeep.add(existingShift.id);
          } else {
            shiftsToCreate.push({
              date: dateStr,
              location: firstShift.location,
              room: firstShift.room,
              shift_type: firstShift.shift_type,
              site_id: firstShift.site_id,
              room_id: firstShift.room_id,
              shift_type_id: firstShift.shift_type_id,
              status: 'free',
              created_by: firstShift.created_by,
              series_id: seriesId,
              series_instance_date: dateStr
            });
          }
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      const shiftsToDelete = existingShifts
        .filter(s => !shiftsToKeep.has(s.id))
        .map(s => s.id);

      if (shiftsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('shifts')
          .delete()
          .in('id', shiftsToDelete);

        if (deleteError) throw deleteError;
      }

      if (shiftsToCreate.length > 0) {
        const shiftsWithRules = await applyRotationRulesToShifts(shiftsToCreate);

        const { error: insertError } = await supabase
          .from('shifts')
          .insert(shiftsWithRules);

        if (insertError) throw insertError;
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (dataLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8">
          <div className="text-center py-8 text-gray-500">Chargement...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Repeat className="w-6 h-6 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-teal-900">Modifier la série</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              Nom de la série
            </label>
            <input
              type="text"
              value={seriesName}
              onChange={(e) => setSeriesName(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <Calendar className="w-4 h-4" />
              Date de début
            </label>
            <input
              type="date"
              value={startDate}
              disabled
              className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-gray-500">La date de début ne peut pas être modifiée</p>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
              <Calendar className="w-4 h-4" />
              Jours de la semaine <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-7 gap-2">
              {WEEKDAYS.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => toggleWeekday(day.value)}
                  className={`py-3 px-2 rounded-lg font-medium text-sm transition-all ${
                    selectedWeekdays.includes(day.value)
                      ? 'bg-teal-500 text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  title={day.fullLabel}
                >
                  {day.label}
                </button>
              ))}
            </div>
            {selectedWeekdays.length > 0 && (
              <p className="mt-2 text-sm text-gray-600">
                {selectedWeekdays.length} jour{selectedWeekdays.length > 1 ? 's' : ''} sélectionné{selectedWeekdays.length > 1 ? 's' : ''}
              </p>
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <Calendar className="w-4 h-4" />
              Date de fin <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
              min={startDate}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900 font-medium mb-1">À propos de la modification</p>
            <p className="text-sm text-blue-700">
              Les gardes qui ne correspondent plus aux nouveaux critères seront supprimées.
              De nouvelles gardes seront créées pour les dates manquantes.
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3 bg-pink-500 hover:bg-pink-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Modification...' : 'Modifier la série'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
