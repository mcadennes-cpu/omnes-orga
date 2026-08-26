import { useState, useEffect } from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import BottomSheet from './ui/BottomSheet';
import { useToast } from './ui/ActionToast';

type WeekTemplate = {
  id: string;
  name: string;
  created_at: string;
};

type DeleteWeekTemplateModalProps = {
  onClose: () => void;
  onSuccess: () => void;
};

const fieldClass =
  'w-full rounded-input border border-border bg-carte px-4 py-3 text-body-m text-ink ' +
  'focus:border-canard focus:outline-none focus:ring-2 focus:ring-canard/30';

export default function DeleteWeekTemplateModal({ onClose, onSuccess }: DeleteWeekTemplateModalProps) {
  const [templates, setTemplates] = useState<WeekTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { signaler } = useToast();

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    const { data, error } = await supabase
      .from('opening_week_templates')
      .select('id, name, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading templates:', error);
      setError('Erreur lors du chargement des modèles');
      return;
    }

    setTemplates(data || []);
  };

  const handleDelete = async () => {
    if (!selectedTemplateId) {
      setError('Veuillez sélectionner un modèle à supprimer.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

      const { error: itemsError } = await supabase
        .from('opening_week_template_items')
        .delete()
        .eq('template_id', selectedTemplateId);

      if (itemsError) throw itemsError;

      const { error: templateError } = await supabase
        .from('opening_week_templates')
        .delete()
        .eq('id', selectedTemplateId);

      if (templateError) throw templateError;

      signaler(`Modèle « ${selectedTemplate?.name} » supprimé.`, 'succes');
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  return (
    <BottomSheet
      title="Supprimer un modèle de semaine"
      onClose={onClose}
      busy={loading}
      maxWidthClass="max-w-2xl"
      footer={
        <>
          <button
            onClick={onClose}
            disabled={loading}
            className="h-12 flex-1 rounded-input border border-border text-button text-marine disabled:opacity-50"
          >
            Annuler
          </button>
          {templates.length > 0 && (
            <button
              onClick={handleDelete}
              disabled={loading || !selectedTemplateId}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-input bg-brique text-button text-white shadow-button transition-colors hover:bg-brique/90 disabled:opacity-50"
            >
              <Trash2 className="h-5 w-5" />
              Supprimer le modèle
            </button>
          )}
        </>
      }
    >
      {templates.length === 0 ? (
        <div className="py-8 text-center">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-faint" />
          <p className="text-body-l text-muted">
            Aucun modèle n'est disponible pour suppression.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-field-label">Sélectionner un modèle</label>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className={fieldClass}
              disabled={loading}
            >
              <option value="">Sélectionner un modèle</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} ({formatDate(template.created_at)})
                </option>
              ))}
            </select>
          </div>

          {selectedTemplate && (
            <div className="rounded-card border border-brique/20 bg-brique/10 p-4">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-brique" />
                <div className="flex-1">
                  <p className="mb-1 font-medium text-brique">
                    Êtes-vous sûr de vouloir supprimer le modèle « {selectedTemplate.name} ({formatDate(selectedTemplate.created_at)}) » ?
                  </p>
                  <p className="text-body-m text-brique/80">
                    Cette action est définitive et ne supprimera PAS les gardes déjà créées à partir de ce modèle.
                  </p>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-input border border-brique/20 bg-brique/10 px-4 py-3 text-body-m text-brique">
              {error}
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
