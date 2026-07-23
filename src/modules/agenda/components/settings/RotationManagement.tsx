import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Repeat, Save } from 'lucide-react';
import { clearRotationCache } from '../../lib/rotationUtils';

type RotationSettings = {
  id: string;
  start_date: string;
  cycle_length_weeks: number;
};

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
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-100 rounded-lg">
          <Repeat className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Paramètres du roulement</h2>
          <p className="text-sm text-gray-600">Configuration du cycle de rotation des gardes</p>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Début du roulement
          </label>
          <p className="text-xs text-gray-600 mb-2">
            Date de début de la semaine 1 du roulement (de préférence un lundi)
          </p>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Durée du roulement (en semaines)
          </label>
          <p className="text-xs text-gray-600 mb-2">
            Nombre de semaines dans un cycle complet de rotation (entre 1 et 52)
          </p>
          <input
            type="number"
            min="1"
            max="52"
            value={cycleLength}
            onChange={(e) => setCycleLength(parseInt(e.target.value) || 1)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
            {success}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={loading || !startDate || cycleLength < 1 || cycleLength > 52}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" />
          {loading ? 'Enregistrement...' : 'Enregistrer les paramètres'}
        </button>
      </div>
    </div>
  );
}
