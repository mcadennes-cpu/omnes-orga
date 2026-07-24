import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Repeat, Save } from 'lucide-react';
import { clearRotationCache } from '../../lib/rotationUtils';

type RotationSettings = {
  id: string;
  start_date: string;
  cycle_length_weeks: number;
};

const fieldClass =
  'w-full rounded-input border border-border bg-carte px-4 py-2 text-body-m text-ink ' +
  'focus:border-canard focus:outline-none focus:ring-2 focus:ring-canard/30';

export default function RotationManagement() {
  const [settings, setSettings] = useState<RotationSettings | null>(null);
  const [startDate, setStartDate] = useState('');
  const [cycleLength, setCycleLength] = useState(8);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('rotation_settings')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setSettings(data);
        setStartDate(data.start_date);
        setCycleLength(data.cycle_length_weeks);
      } else {
        const mondayDate = getNextMonday(new Date());
        setStartDate(mondayDate.toISOString().split('T')[0]);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getNextMonday = (date: Date): Date => {
    const result = new Date(date);
    const day = result.getDay();
    const diff = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
    result.setDate(result.getDate() + diff);
    return result;
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié');

      const settingsData = {
        start_date: startDate,
        cycle_length_weeks: cycleLength,
        updated_at: new Date().toISOString(),
        updated_by: user.id
      };

      if (settings) {
        const { error: updateError } = await supabase
          .from('rotation_settings')
          .update(settingsData)
          .eq('id', settings.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('rotation_settings')
          .insert([settingsData]);

        if (insertError) throw insertError;
      }

      setSuccess('Paramètres du roulement enregistrés avec succès');
      clearRotationCache();
      setTimeout(() => setSuccess(''), 3000);
      loadSettings();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-card border border-border bg-carte p-6 shadow-card">
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-pill bg-canard/10 p-2">
          <Repeat className="h-6 w-6 text-canard" />
        </div>
        <div>
          <h2 className="text-h2 text-ink">Paramètres du roulement</h2>
          <p className="text-caption">Configuration du cycle de rotation des gardes</p>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <label className="mb-2 block text-field-label">Début du roulement</label>
          <p className="mb-2 text-caption">
            Date de début de la semaine 1 du roulement (de préférence un lundi)
          </p>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={fieldClass}
          />
        </div>

        <div>
          <label className="mb-2 block text-field-label">Durée du roulement (en semaines)</label>
          <p className="mb-2 text-caption">
            Nombre de semaines dans un cycle complet de rotation (entre 1 et 52)
          </p>
          <input
            type="number"
            min="1"
            max="52"
            value={cycleLength}
            onChange={(e) => setCycleLength(parseInt(e.target.value) || 1)}
            className={fieldClass}
          />
        </div>

        {error && (
          <div className="rounded-input border border-brique/20 bg-brique/10 px-4 py-3 text-body-m text-brique">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-input border border-green-300 bg-green-100 px-4 py-3 text-body-m text-green-800">
            {success}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={loading || !startDate || cycleLength < 1 || cycleLength > 52}
          className="flex items-center gap-2 rounded-input bg-marine px-6 py-3 text-button text-white shadow-button transition-colors hover:bg-marine/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {loading ? 'Enregistrement…' : 'Enregistrer les paramètres'}
        </button>
      </div>
    </div>
  );
}
