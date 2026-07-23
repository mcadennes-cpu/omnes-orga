import { useState, useEffect } from 'react';
import { X, Copy, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Template = {
  id: string;
  name: string;
  created_at: string;
};

type DuplicateWeekTemplateModalProps = {
  onClose: () => void;
  onDuplicate: (templateId: string, startDate: string, endDate: string) => Promise<void>;
};

export default function DuplicateWeekTemplateModal({
  onClose,
  onDuplicate
}: DuplicateWeekTemplateModalProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [duplicating, setDuplicating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('opening_week_templates')
        .select('id, name, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (err) {
      console.error('Error loading templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const validateDates = (): string | null => {
    if (!selectedTemplateId) {
      return 'Veuillez sélectionner un modèle';
    }
    if (!startDate || !endDate) {
      return 'Veuillez sélectionner les dates de début et fin';
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start.getDay() !== 1) {
      return 'La date de début DOIT être un LUNDI. Veuillez choisir un lundi comme premier jour.';
    }

    if (end < start) {
      return 'La date de fin doit être après la date de début';
    }

    return null;
  };

  const handleDuplicate = async () => {
    const validationError = validateDates();
    if (validationError) {
      setError(validationError);
      return;
    }

    setDuplicating(true);
    setError('');

    try {
      await onDuplicate(selectedTemplateId, startDate, endDate);
      onClose();
    } catch (err: any) {
      console.error('[WeekTemplate] Duplication error:', err);
      setError(err.message || 'Erreur lors de la duplication');
    } finally {
      setDuplicating(false);
    }
  };

  const getWeekdayName = (dateStr: string) => {
    const date = new Date(dateStr);
    const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    return days[date.getDay()];
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Dupliquer un modèle de semaine</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {loading ? (
            <div className="text-center py-4 text-gray-500">Chargement des modèles...</div>
          ) : templates.length === 0 ? (
            <div className="text-center py-4 text-gray-500">
              Aucun modèle disponible. Créez d'abord un modèle depuis la vue semaine.
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Modèle à dupliquer
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                >
                  <option value="">Sélectionner un modèle</option>
                  {templates.map(template => (
                    <option key={template.id} value={template.id}>
                      {template.name} ({new Date(template.created_at).toLocaleDateString('fr-FR')})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date de début (DOIT être un lundi)
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
                {startDate && (
                  <p className={`text-xs mt-1 ${
                    new Date(startDate).getDay() === 1
                      ? 'text-green-600'
                      : 'text-red-600 font-semibold'
                  }`}>
                    {getWeekdayName(startDate)}
                    {new Date(startDate).getDay() !== 1 && ' ⚠️ Ce n\'est pas un lundi!'}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date de fin
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <p className="font-semibold mb-1">⚠️ Restrictions importantes :</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Le début doit être un LUNDI</li>
                  <li>La période doit être VIDE (aucune garde existante)</li>
                  <li>Les règles de rotation seront automatiquement appliquées</li>
                </ul>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            disabled={duplicating}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium"
          >
            Annuler
          </button>
          <button
            onClick={handleDuplicate}
            disabled={duplicating || loading || templates.length === 0}
            className="px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white rounded-lg transition-colors font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            <Copy className="w-4 h-4" />
            {duplicating ? 'Duplication...' : 'Dupliquer'}
          </button>
        </div>
      </div>
    </div>
  );
}
