import { useState } from 'react';
import { FileText, Edit2, Save } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type CoordinatorNoteEditorProps = {
  shiftId: string;
  initialNote: string;
  onSaved: () => void;
};

// Editeur autonome de la note coordinateur : gere son propre etat d'edition et
// l'ecriture Supabase, previent le parent via onSaved (pour recharger la liste).
export default function CoordinatorNoteEditor({ shiftId, initialNote, onSaved }: CoordinatorNoteEditorProps) {
  const [note, setNote] = useState(initialNote || '');
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('shifts')
      .update({
        coordinator_note: note.trim() || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', shiftId);
    setSaving(false);
    if (!error) {
      setIsEditing(false);
      onSaved();
    }
  };

  return (
    <div className="flex items-start gap-3">
      <FileText className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted" />
      <div className="flex-1">
        <div className="mb-1 text-field-label">Note coordinateur</div>
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ajouter une note (ex : Remplacement Dr X)"
              rows={2}
              className="w-full resize-none rounded-input border border-border bg-carte px-3 py-2 text-body-m text-ink focus:border-canard focus:outline-none focus:ring-2 focus:ring-canard/30"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1 rounded-input bg-marine px-3 py-1.5 text-body-m font-medium text-white transition-colors hover:bg-marine/90 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              <button
                onClick={() => {
                  setNote(initialNote || '');
                  setIsEditing(false);
                }}
                disabled={saving}
                className="rounded-input border border-border px-3 py-1.5 text-body-m font-medium text-marine transition-colors hover:bg-fond disabled:opacity-50"
              >
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            {note ? (
              <p className="text-body-m text-ink">{note}</p>
            ) : (
              <p className="text-body-m italic text-faint">Aucune note</p>
            )}
            <button
              onClick={() => setIsEditing(true)}
              className="flex-shrink-0 rounded p-1 transition-colors hover:bg-fond"
              title="Modifier la note"
            >
              <Edit2 className="h-4 w-4 text-muted" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
