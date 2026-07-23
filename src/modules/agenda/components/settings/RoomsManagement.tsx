import { useState, useEffect } from 'react';
import { supabase, Room, Site } from '../../lib/supabase';
import { DoorOpen, Plus, Edit2, Trash2, Check, X, AlertCircle } from 'lucide-react';

export default function RoomsManagement() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [newRoom, setNewRoom] = useState({ siteId: '', name: '' });
  const [error, setError] = useState('');
  const [filterSite, setFilterSite] = useState<string>('all');

  useEffect(() => {
    loadData();

    const roomsSub = supabase
      .channel('rooms_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => {
        loadData();
      })
      .subscribe();

    const sitesSub = supabase
      .channel('sites_changes_rooms')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sites' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      roomsSub.unsubscribe();
      sitesSub.unsubscribe();
    };
  }, []);

  const loadData = async () => {
    setLoading(true);

    const [roomsResult, sitesResult] = await Promise.all([
      supabase
        .from('rooms')
        .select('*, site:sites(*)')
        .order('name'),
      supabase
        .from('sites')
        .select('*')
        .order('name')
    ]);

    if (!roomsResult.error && roomsResult.data) {
      setRooms(roomsResult.data);
    }

    if (!sitesResult.error && sitesResult.data) {
      setSites(sitesResult.data);
    }

    setLoading(false);
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const { error: createError } = await supabase
        .from('rooms')
        .insert({
          site_id: newRoom.siteId,
          name: newRoom.name,
          is_active: true
        });

      if (createError) throw createError;

      setShowCreateModal(false);
      setNewRoom({ siteId: '', name: '' });
      loadData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdateRoom = async (room: Room) => {
    const { error } = await supabase
      .from('rooms')
      .update({
        name: room.name,
        is_active: room.is_active
      })
      .eq('id', room.id);

    if (!error) {
      setEditingRoom(null);
      loadData();
    }
  };

  const handleDeleteRoom = async (room: Room) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer la salle "${room.name}" ?`)) {
      return;
    }

    const { data: shiftsData } = await supabase
      .from('shifts')
      .select('id')
      .eq('room_id', room.id)
      .limit(1);

    if (shiftsData && shiftsData.length > 0) {
      alert('Impossible de supprimer cette salle car elle contient des gardes assignées.');
      return;
    }

    const { error } = await supabase
      .from('rooms')
      .delete()
      .eq('id', room.id);

    if (!error) {
      loadData();
    } else {
      alert('Erreur lors de la suppression: ' + error.message);
    }
  };

  const handleToggleActive = async (room: Room) => {
    const { error } = await supabase
      .from('rooms')
      .update({ is_active: !room.is_active })
      .eq('id', room.id);

    if (!error) {
      loadData();
    }
  };

  const getRoomCount = (siteId: string) => {
    return rooms.filter(r => r.site_id === siteId && r.is_active).length;
  };

  const filteredRooms = filterSite === 'all'
    ? rooms
    : rooms.filter(r => r.site_id === filterSite);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <DoorOpen className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-teal-900">Gestion des Salles</h2>
              <p className="text-sm text-gray-600">Gérez les salles de consultation par site</p>
            </div>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-pink-500 hover:bg-pink-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Nouvelle Salle
          </button>
        </div>

        <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {sites.filter(s => s.is_active).map((site) => {
            const roomCount = getRoomCount(site.id);
            return (
              <div key={site.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: site.color || '#3B82F6' }}
                  />
                  <h3 className="font-semibold text-gray-900">{site.name}</h3>
                </div>
                <p className="text-2xl font-bold text-teal-700">{roomCount}</p>
                <p className="text-xs text-gray-600">salle{roomCount > 1 ? 's' : ''} active{roomCount > 1 ? 's' : ''}</p>
              </div>
            );
          })}
        </div>

        <div className="mb-4 flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Filtrer par site:</label>
          <select
            value={filterSite}
            onChange={(e) => setFilterSite(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
          >
            <option value="all">Tous les sites</option>
            {sites.filter(s => s.is_active).map((site) => (
              <option key={site.id} value={site.id}>{site.name}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Chargement...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b-2 border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Site</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Nom de la salle</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Statut</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Créée le</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredRooms.map((room) => (
                  <tr key={room.id} className="hover:bg-gray-50">
                    {editingRoom?.id === room.id ? (
                      <>
                        <td className="px-4 py-3 text-gray-600">
                          {room.site?.name}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={editingRoom.name}
                            onChange={(e) => setEditingRoom({ ...editingRoom, name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={editingRoom.is_active}
                              onChange={(e) => setEditingRoom({ ...editingRoom, is_active: e.target.checked })}
                              className="w-4 h-4 text-pink-500 rounded focus:ring-pink-500"
                            />
                            <span className="text-sm">Actif</span>
                          </label>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-sm">
                          {new Date(room.created_at).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleUpdateRoom(editingRoom)}
                              className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            >
                              <Check className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => setEditingRoom(null)}
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
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded"
                              style={{ backgroundColor: room.site?.color || '#3B82F6' }}
                            />
                            <span className="font-medium text-gray-900">{room.site?.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{room.name}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleToggleActive(room)}
                            className={`px-3 py-1 rounded-full text-xs font-semibold ${
                              room.is_active
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {room.is_active ? 'Actif' : 'Inactif'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-sm">
                          {new Date(room.created_at).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setEditingRoom(room)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                              <Edit2 className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteRoom(room)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-5 h-5" />
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
            <h3 className="text-xl font-bold text-gray-900 mb-4">Créer une nouvelle salle</h3>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm flex items-start gap-2">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Site *
                </label>
                <select
                  required
                  value={newRoom.siteId}
                  onChange={(e) => setNewRoom({ ...newRoom, siteId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                >
                  <option value="">Sélectionnez un site</option>
                  {sites.filter(s => s.is_active).map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name} ({getRoomCount(site.id)}/10 salles)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nom de la salle *
                </label>
                <input
                  type="text"
                  required
                  value={newRoom.name}
                  onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  placeholder="Ex: Salle 1, Cabinet A..."
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewRoom({ siteId: '', name: '' });
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
