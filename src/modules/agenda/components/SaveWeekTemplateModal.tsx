import { useState } from 'react';
import { Save } from 'lucide-react';
import BottomSheet from './ui/BottomSheet';

type SaveWeekTemplateModalProps = {
  onClose: () => void;
  onSave: (templateName: string) => Promise<void>;
};

const fieldClass =
  'w-full rounded-input border border-border bg-carte px-3 py-2 text-body-m text-ink ' +
  'focus:border-canard focus:outline-none focus:ring-2 focus:ring-canard/30';

export default function SaveWeekTemplateModal({
  onClose,
  onSave
}: SaveWeekTemplateModalProps) {
  const [templateName, setTemplateName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!templateName.trim()) {
      setError('Veuillez saisir un nom pour la semaine type');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await onSave(templateName.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      title="Enregistrer la semaine affichée comme semaine type"
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <button
            onClick={onClose}
            disabled={saving}
            className="h-12 flex-1 rounded-input border border-border text-button text-marine disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-input bg-marine text-button text-white shadow-button transition-colors hover:bg-marine/90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-field-label">Nom de la semaine type</label>
          <input
            type="text"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Ex : Semaine type janvier"
            className={fieldClass}
            autoFocus
          />
        </div>

        {error && (
          <div className="rounded-input border border-brique/20 bg-brique/10 p-3 text-body-m text-brique">
            {error}
          </div>
        )}

        <div className="rounded-input border border-marine/20 bg-marine/5 p-3 text-body-m text-ink">
          Les créneaux ouverts dans la semaine affichée seront enregistrés (sites et
          horaires), sans les affectations ni les demandes. Cette semaine type sera
          proposée dans « Ouvrir des semaines ».
        </div>
      </div>
    </BottomSheet>
  );
}
