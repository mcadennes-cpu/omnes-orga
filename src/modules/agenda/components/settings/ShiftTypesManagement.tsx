import { useState, useEffect } from 'react';
import { supabase, ShiftType } from '../../lib/supabase';
import { Clock, Plus, Edit2, Check, X, MoveUp, MoveDown, Trash2 } from 'lucide-react';

export default function ShiftTypesManagement() {
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingShiftType, setEditingShiftType] = useState<ShiftType | null>(null);
  const [newShiftType, setNewShiftType] = useState({ name: '', timeRange: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    loadShiftTypes();

    const subscription = supabase
      .channel('shift_types_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_types' }, () => {
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

  const handleDelete = async (shiftType: ShiftType) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer "${shiftType.name}" ?\n\nCette action est irréversible et supprimera également toutes les gardes associées à cet horaire.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('shift_types')
        .delete()
        .eq('id', shiftType.id);

      if (error) throw error;
      loadShiftTypes();
    } catch (err: any) {
      alert('Erreur lors de la suppression: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Clock className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-teal-900">Gestion des Horaires</h2>
              <p className="text-sm text-gray-600">Gérez les types de gardes disponibles</p>
            </div>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-pink-500 hover:bg-pink-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Nouvel Horaire
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Chargement...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b-2 border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Ordre</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Nom</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Horaire</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Statut</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Créé le</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {shiftTypes.map((shiftType, index) => (
                  <tr key={shiftType.id} className="hover:bg-gray-50">
                    {editingShiftType?.id === shiftType.id ? (
                      <>
                        <td className="px-4 py-3 text-gray-600 text-sm">{index + 1}</td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={editingShiftType.name}
                            onChange={(e) => setEditingShiftType({ ...editingShiftType, name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={editingShiftType.time_range}
                            onChange={(e) => setEditingShiftType({ ...editingShiftType, time_range: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                            placeholder="08:00-14:00"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={editingShiftType.is_active}
                              onChange={(e) => setEditingShiftType({ ...editingShiftType, is_active: e.target.checked })}
                              className="w-4 h-4 text-pink-500 rounded focus:ring-pink-500"
                            />
                            <span className="text-sm">Actif</span>
                          </label>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-sm">
                          {new Date(shiftType.created_at).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleUpdateShiftType(editingShiftType)}
                              className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            >
                              <Check className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => setEditingShiftType(null)}
                              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                              <X className="w-5 h-5" />
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
                              className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <MoveUp className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleReorder(shiftType, 'down')}
                              disabled={index === shiftTypes.length - 1}
                              className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <MoveDown className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{shiftType.name}</td>
                        <td className="px-4 py-3 text-gray-700 font-mono">{shiftType.time_range}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleToggleActive(shiftType)}
                            className={`px-3 py-1 rounded-full text-xs font-semibold ${
                              shiftType.is_active
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {shiftType.is_active ? 'Actif' : 'Inactif'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-sm">
                          {new Date(shiftType.created_at).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setEditingShiftType(shiftType)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Modifier"
                            >
                              <Edit2 className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleDelete(shiftType)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Supprimer"
                            >
                              <X className="w-5 h-5" />
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Créer un nouvel horaire</h3>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateShiftType} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nom *
                </label>
                <input
                  type="text"
                  required
                  value={newShiftType.name}
                  onChange={(e) => setNewShiftType({ ...newShiftType, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  placeholder="Ex: 08h-14h, Matinée..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Horaire (format HH:MM-HH:MM) *
                </label>
                <input
                  type="text"
                  required
                  value={newShiftType.timeRange}
                  onChange={(e) => setNewShiftType({ ...newShiftType, timeRange: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent font-mono"
                  placeholder="08:00-14:00"
                  pattern="[0-2][0-9]:[0-5][0-9]-[0-2][0-9]:[0-5][0-9]"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Format: HH:MM-HH:MM (exemple: 08:00-14:00)
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewShiftType({ name: '', timeRange: '' });
                    setError('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 font-medium transition-colors"
                >
                  Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
