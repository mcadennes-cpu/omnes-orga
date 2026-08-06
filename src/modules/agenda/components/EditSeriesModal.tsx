import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Calendar } from 'lucide-react';
import { applyRotationRulesToShifts } from '../lib/rotationUtils';
import BottomSheet from './ui/BottomSheet';

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

const fieldClass =
  'w-full rounded-input border border-border bg-carte px-4 py-3 text-body-m text-ink ' +
  'focus:border-canard focus:outline-none focus:ring-2 focus:ring-canard/30';

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
        // Suppression douce (MOD2-B) : reduire l'etendue d'une serie ne
        // detruit plus les gardes qui en sortent.
        const { error: deleteError } = await supabase
          .rpc('supprimer_gardes', { p_shift_ids: shiftsToDelete });

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
      <BottomSheet title="Modifier la série" onClose={onClose}>
        <div className="py-8 text-center text-muted">Chargement…</div>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      title="Modifier la série"
      onClose={onClose}
      busy={loading}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="h-12 flex-1 rounded-input border border-border text-button text-marine disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="submit"
            form="edit-series-form"
            disabled={loading}
            className="h-12 flex-1 rounded-input bg-marine text-button text-white shadow-button transition-colors hover:bg-marine/90 disabled:opacity-50"
          >
            {loading ? 'Modification…' : 'Modifier la série'}
          </button>
        </>
      }
    >
      <form id="edit-series-form" onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-2 block text-field-label">Nom de la série</label>
          <input
            type="text"
            value={seriesName}
            onChange={(e) => setSeriesName(e.target.value)}
            required
            className={fieldClass}
          />
        </div>

        <div>
          <label className="mb-2 flex items-center gap-2 text-field-label">
            <Calendar className="h-4 w-4 text-muted" />
            Date de début
          </label>
          <input
            type="date"
            value={startDate}
            disabled
            className="w-full cursor-not-allowed rounded-input border border-border bg-fond px-4 py-3 text-body-m text-muted"
          />
          <p className="mt-1 text-caption">La date de début ne peut pas être modifiée</p>
        </div>

        <div>
          <label className="mb-3 flex items-center gap-2 text-field-label">
            <Calendar className="h-4 w-4 text-muted" />
            Jours de la semaine <span className="text-brique">*</span>
          </label>
          <div className="grid grid-cols-7 gap-2">
            {WEEKDAYS.map((day) => (
              <button
                key={day.value}
                type="button"
                onClick={() => toggleWeekday(day.value)}
                className={`rounded-pill px-2 py-3 text-sm font-medium transition-all ${
                  selectedWeekdays.includes(day.value)
                    ? 'bg-canard text-white shadow-card'
                    : 'bg-fond text-muted hover:bg-border/40'
                }`}
                title={day.fullLabel}
              >
                {day.label}
              </button>
            ))}
          </div>
          {selectedWeekdays.length > 0 && (
            <p className="mt-2 text-caption">
              {selectedWeekdays.length} jour{selectedWeekdays.length > 1 ? 's' : ''} sélectionné{selectedWeekdays.length > 1 ? 's' : ''}
            </p>
          )}
        </div>

        <div>
          <label className="mb-2 flex items-center gap-2 text-field-label">
            <Calendar className="h-4 w-4 text-muted" />
            Date de fin <span className="text-brique">*</span>
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
            min={startDate}
            className={fieldClass}
          />
        </div>

        {error && (
          <div className="rounded-input border border-brique/20 bg-brique/10 px-4 py-3 text-body-m text-brique">
            {error}
          </div>
        )}

        <div className="rounded-card border border-marine/20 bg-marine/5 p-4">
          <p className="mb-1 font-medium text-ink">À propos de la modification</p>
          <p className="text-body-m text-muted">
            Les gardes qui ne correspondent plus aux nouveaux critères seront supprimées.
            De nouvelles gardes seront créées pour les dates manquantes.
          </p>
        </div>
      </form>
    </BottomSheet>
  );
}
