import { useState, useEffect } from 'react';
import { Copy, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import BottomSheet from './ui/BottomSheet';

type Template = {
  id: string;
  name: string;
  created_at: string;
};

type DuplicateWeekTemplateModalProps = {
  onClose: () => void;
  onDuplicate: (templateId: string, startDate: string, endDate: string) => Promise<void>;
};

const fieldClass =
  'w-full rounded-input border border-border bg-carte px-3 py-2 text-body-m text-ink ' +
  'focus:border-canard focus:outline-none focus:ring-2 focus:ring-canard/30';

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
    <BottomSheet
      title="Dupliquer un modèle de semaine"
      onClose={onClose}
      busy={duplicating}
      footer={
        <>
          <button
            onClick={onClose}
            disabled={duplicating}
            className="h-12 flex-1 rounded-input border border-border text-button text-marine disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={handleDuplicate}
            disabled={duplicating || loading || templates.length === 0}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-input bg-marine text-button text-white shadow-button transition-colors hover:bg-marine/90 disabled:opacity-50"
          >
            <Copy className="h-4 w-4" />
            {duplicating ? 'Duplication…' : 'Dupliquer'}
          </button>
        </>
      }
    >
      {loading ? (
        <div className="py-4 text-center text-muted">Chargement des modèles…</div>
      ) : templates.length === 0 ? (
        <div className="py-4 text-center text-muted">
          Aucun modèle disponible. Créez d'abord un modèle depuis la vue semaine.
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-field-label">Modèle à dupliquer</label>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className={fieldClass}
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
            <label className="mb-2 block text-field-label">Date de début (DOIT être un lundi)</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={fieldClass}
            />
            {startDate && (
              <p className={`mt-1 text-xs ${
                new Date(startDate).getDay() === 1
                  ? 'text-green-600'
                  : 'font-semibold text-brique'
              }`}>
                {getWeekdayName(startDate)}
                {new Date(startDate).getDay() !== 1 && ' ⚠️ Ce n\'est pas un lundi !'}
              </p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-field-label">Date de fin</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={fieldClass}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-input border border-brique/20 bg-brique/10 p-3 text-body-m text-brique">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="rounded-input border border-ocre/30 bg-ocre/10 p-3 text-body-m text-ocre-fonce">
            <p className="mb-1 font-semibold">⚠️ Restrictions importantes :</p>
            <ul className="list-inside list-disc space-y-1">
              <li>Le début doit être un LUNDI</li>
              <li>La période doit être VIDE (aucune garde existante)</li>
              <li>Les règles de rotation seront automatiquement appliquées</li>
            </ul>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
