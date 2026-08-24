import { useState, useEffect } from 'react';
import { supabase, supabaseOrga, ShiftType } from '../../lib/supabase';
import { Clock, Plus, Edit2, Check, X, MoveUp, MoveDown } from 'lucide-react';
import BottomSheet from '../ui/BottomSheet';
import ConfirmSheet from '../ui/ConfirmSheet';
import { useToast } from '../ui/ActionToast';

const fieldClass =
  'w-full rounded-input border border-border bg-carte px-3 py-2 text-body-m text-ink ' +
  'focus:border-canard focus:outline-none focus:ring-2 focus:ring-canard/30';

export default function ShiftTypesManagement() {
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingShiftType, setEditingShiftType] = useState<ShiftType | null>(null);
  const [newShiftType, setNewShiftType] = useState({ name: '', timeRange: '' });
  const [error, setError] = useState('');
  const [shiftTypeToDelete, setShiftTypeToDelete] = useState<ShiftType | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { signaler } = useToast();

  useEffect(() => {
    loadShiftTypes();

    const subscription = supabaseOrga
      .channel('shift_types_changes')
      .on('postgres_changes', { event: '*', schema: 'agenda', table: 'shift_types' }, () => {
        loadShiftTypes();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadShiftTypes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('shift_types')
      .select('*')
      .order('sort_order');

    if (!error && data) {
      setShiftTypes(data);
    }
    setLoading(false);
  };

  const handleCreateShiftType = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const maxSortOrder = Math.max(...shiftTypes.map(st => st.sort_order), 0);

      const { error: createError } = await supabase
        .from('shift_types')
        .insert({
          name: newShiftType.name,
          time_range: newShiftType.timeRange,
          is_active: true,
          sort_order: maxSortOrder + 1
        });

      if (createError) throw createError;

      setShowCreateModal(false);
      setNewShiftType({ name: '', timeRange: '' });
      loadShiftTypes();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdateShiftType = async (shiftType: ShiftType) => {
    const { error } = await supabase
      .from('shift_types')
      .update({
        name: shiftType.name,
        time_range: shiftType.time_range,
        is_active: shiftType.is_active
      })
      .eq('id', shiftType.id);

    if (!error) {
      setEditingShiftType(null);
      loadShiftTypes();
    }
  };

  const handleToggleActive = async (shiftType: ShiftType) => {
    const { error } = await supabase
      .from('shift_types')
      .update({ is_active: !shiftType.is_active })
      .eq('id', shiftType.id);

    if (!error) {
      loadShiftTypes();
    }
  };

  const handleReorder = async (shiftType: ShiftType, direction: 'up' | 'down') => {
    const currentIndex = shiftTypes.findIndex(st => st.id === shiftType.id);
    if (
      (direction === 'up' && currentIndex === 0) ||
      (direction === 'down' && currentIndex === shiftTypes.length - 1)
    ) {
      return;
    }

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const swapShiftType = shiftTypes[newIndex];

    await Promise.all([
      supabase
        .from('shift_types')
        .update({ sort_order: swapShiftType.sort_order })
        .eq('id', shiftType.id),
      supabase
        .from('shift_types')
        .update({ sort_order: shiftType.sort_order })
        .eq('id', swapShiftType.id)
    ]);

    loadShiftTypes();
  };

  // Deux verrous invisibles depuis le module : la policy RLS « supprime un
  // creneau sans garde », et la cle etrangere rotation_plan_rules.shift_type_id
  // en RESTRICT -- un creneau cite par un plan de roulement ne part pas.
  // Controles avant la question, pour ne pas la poser en vain.
  const handleDeleteClick = async (shiftType: ShiftType) => {
    const [gardes, regles] = await Promise.all([
      supabase
        .from('shifts')
        .select('id', { count: 'exact', head: true })
        .eq('shift_type_id', shiftType.id),
      supabase
        .from('rotation_plan_rules')
        .select('id', { count: 'exact', head: true })
        .eq('shift_type_id', shiftType.id),
    ]);

    if (gardes.count) {
      signaler(
        `Impossible de supprimer « ${shiftType.name} » : ${gardes.count} garde${gardes.count > 1 ? 's utilisent' : ' utilise'} cet horaire.`,
        'erreur'
      );
      return;
    }

    if (regles.count) {
      signaler(
        `Impossible de supprimer « ${shiftType.name} » : cet horaire est utilisé par le roulement.`,
        'erreur'
      );
      return;
    }

    setShiftTypeToDelete(shiftType);
  };

  const handleDelete = async () => {
    if (!shiftTypeToDelete) return;
    setDeleting(true);

    try {
      // .select() : une policy RLS qui refuse ne leve pas d'erreur, elle
      // supprime zero ligne. Le retour est le seul moyen de le savoir.
      const { data, error } = await supabase
        .from('shift_types')
        .delete()
        .eq('id', shiftTypeToDelete.id)
        .select('id');

      if (error) throw error;

      if (!data || data.length === 0) {
        signaler(
          `Suppression refusée : « ${shiftTypeToDelete.name} » est encore utilisé quelque part.`,
          'erreur'
        );
        return;
      }

      signaler(`Horaire « ${shiftTypeToDelete.name} » supprimé.`, 'succes');
      setShiftTypeToDelete(null);
      loadShiftTypes();
    } catch (err: any) {
      signaler('Suppression impossible : ' + err.message, 'erreur');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-card border border-border bg-carte p-6 shadow-card">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-pill bg-canard/10 p-2">
              <Clock className="h-6 w-6 text-canard" />
            </div>
            <div>
              <h2 className="text-h2 text-ink">Gestion des horaires</h2>
              <p className="text-caption">Gérez les types de gardes disponibles</p>
            </div>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 rounded-input bg-marine px-4 py-2 text-button text-white shadow-button transition-colors hover:bg-marine/90"
          >
            <Plus className="h-5 w-5" />
            Nouvel horaire
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-muted">Chargement…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border bg-fond">
                <tr>
                  <th className="px-4 py-3 text-left text-field-label">Ordre</th>
                  <th className="px-4 py-3 text-left text-field-label">Nom</th>
                  <th className="px-4 py-3 text-left text-field-label">Horaire</th>
                  <th className="px-4 py-3 text-left text-field-label">Statut</th>
                  <th className="px-4 py-3 text-left text-field-label">Créé le</th>
                  <th className="px-4 py-3 text-right text-field-label">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {shiftTypes.map((shiftType, index) => (
                  <tr key={shiftType.id} className="hover:bg-fond">
                    {editingShiftType?.id === shiftType.id ? (
                      <>
                        <td className="px-4 py-3 text-caption">{index + 1}</td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={editingShiftType.name}
                            onChange={(e) => setEditingShiftType({ ...editingShiftType, name: e.target.value })}
                            className={fieldClass}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={editingShiftType.time_range}
                            onChange={(e) => setEditingShiftType({ ...editingShiftType, time_range: e.target.value })}
                            className={fieldClass}
                            placeholder="08:00-14:00"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={editingShiftType.is_active}
                              onChange={(e) => setEditingShiftType({ ...editingShiftType, is_active: e.target.checked })}
                              className="h-4 w-4 accent-canard"
                            />
                            <span className="text-body-m text-ink">Actif</span>
                          </label>
                        </td>
                        <td className="px-4 py-3 text-caption">
                          {new Date(shiftType.created_at).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleUpdateShiftType(editingShiftType)}
                              className="rounded-pill p-2 text-green-600 transition-colors hover:bg-green-50"
                            >
                              <Check className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => setEditingShiftType(null)}
                              className="rounded-pill p-2 text-muted transition-colors hover:bg-fond"
                            >
                              <X className="h-5 w-5" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleReorder(shiftType, 'up')}
                              disabled={index === 0}
                              className="p-1 text-faint transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <MoveUp className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleReorder(shiftType, 'down')}
                              disabled={index === shiftTypes.length - 1}
                              className="p-1 text-faint transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <MoveDown className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium text-ink">{shiftType.name}</td>
                        <td className="px-4 py-3 font-mono text-ink">{shiftType.time_range}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleToggleActive(shiftType)}
                            className={`rounded-pill px-3 py-1 text-xs font-semibold ${
                              shiftType.is_active
                                ? 'bg-green-100 text-green-800'
                                : 'bg-fond text-muted'
                            }`}
                          >
                            {shiftType.is_active ? 'Actif' : 'Inactif'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-caption">
                          {new Date(shiftType.created_at).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setEditingShiftType(shiftType)}
                              className="rounded-pill p-2 text-canard transition-colors hover:bg-canard/10"
                              title="Modifier"
                            >
                              <Edit2 className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteClick(shiftType)}
                              className="rounded-pill p-2 text-brique transition-colors hover:bg-brique/10"
                              title="Supprimer"
                            >
                              <X className="h-5 w-5" />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreateModal && (
        <BottomSheet
          title="Créer un nouvel horaire"
          onClose={() => {
            setShowCreateModal(false);
            setNewShiftType({ name: '', timeRange: '' });
            setError('');
          }}
          footer={
            <>
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setNewShiftType({ name: '', timeRange: '' });
                  setError('');
                }}
                className="h-12 flex-1 rounded-input border border-border text-button text-marine"
              >
                Annuler
              </button>
              <button
                type="submit"
                form="create-shift-type-form"
                className="h-12 flex-1 rounded-input bg-marine text-button text-white shadow-button transition-colors hover:bg-marine/90"
              >
                Créer
              </button>
            </>
          }
        >
          {error && (
            <div className="mb-4 rounded-input border border-brique/20 bg-brique/10 px-4 py-3 text-body-m text-brique">
              {error}
            </div>
          )}

          <form id="create-shift-type-form" onSubmit={handleCreateShiftType} className="space-y-4">
            <div>
              <label className="mb-2 block text-field-label">Nom *</label>
              <input
                type="text"
                required
                value={newShiftType.name}
                onChange={(e) => setNewShiftType({ ...newShiftType, name: e.target.value })}
                className={fieldClass}
                placeholder="Ex : 08h-14h, Matinée…"
              />
            </div>

            <div>
              <label className="mb-2 block text-field-label">Horaire (format HH:MM-HH:MM) *</label>
              <input
                type="text"
                required
                value={newShiftType.timeRange}
                onChange={(e) => setNewShiftType({ ...newShiftType, timeRange: e.target.value })}
                className={`${fieldClass} font-mono`}
                placeholder="08:00-14:00"
                pattern="[0-2][0-9]:[0-5][0-9]-[0-2][0-9]:[0-5][0-9]"
              />
              <p className="mt-1 text-caption">
                Format : HH:MM-HH:MM (exemple : 08:00-14:00)
              </p>
            </div>
          </form>
        </BottomSheet>
      )}

      {shiftTypeToDelete && (
        <ConfirmSheet
          title="Supprimer cet horaire ?"
          confirmLabel="Supprimer l'horaire"
          danger
          busy={deleting}
          onConfirm={handleDelete}
          onClose={() => setShiftTypeToDelete(null)}
        >
          L'horaire <strong>{shiftTypeToDelete.name}</strong> ({shiftTypeToDelete.time_range})
          sera supprimé définitivement. Aucune garde ni aucune règle de roulement ne
          l'utilise.
        </ConfirmSheet>
      )}
    </div>
  );
}
