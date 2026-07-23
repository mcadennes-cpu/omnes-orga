import { useState, useEffect } from 'react';
import { X, Trash2, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

type WeekTemplate = {
  id: string;
  name: string;
  created_at: string;
};

type DeleteWeekTemplateModalProps = {
  onClose: () => void;
  onSuccess: () => void;
};

export default function DeleteWeekTemplateModal({ onClose, onSuccess }: DeleteWeekTemplateModalProps) {
  const [templates, setTemplates] = useState<WeekTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

      alert(`Le modèle « ${selectedTemplate?.name} » a été supprimé.`);
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Supprimer un modèle de semaine</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          {templates.length === 0 ? (
            <div className="text-center py-8">
              <AlertTriangle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 text-lg">
                Aucun modèle n'est disponible pour suppression.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Sélectionner un modèle
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
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
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                  <div className="flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-red-900 font-medium mb-1">
                        Êtes-vous sûr de vouloir supprimer le modèle « {selectedTemplate.name} ({formatDate(selectedTemplate.created_at)}) » ?
                      </p>
                      <p className="text-red-700 text-sm">
                        Cette action est définitive et ne supprimera PAS les gardes déjà créées à partir de ce modèle.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 flex gap-3 justify-end border-t border-gray-200">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-6 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            Annuler
          </button>
          {templates.length > 0 && (
            <button
              onClick={handleDelete}
              disabled={loading || !selectedTemplateId}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <Trash2 className="w-5 h-5" />
              Supprimer le modèle
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
