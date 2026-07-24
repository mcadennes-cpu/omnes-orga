import { useState, useEffect } from 'react';
import { supabase, Room, Site } from '../../lib/supabase';
import { DoorOpen, Plus, Edit2, Trash2, Check, X, AlertCircle } from 'lucide-react';
import BottomSheet from '../ui/BottomSheet';

const fieldClass =
  'w-full rounded-input border border-border bg-carte px-3 py-2 text-body-m text-ink ' +
  'focus:border-canard focus:outline-none focus:ring-2 focus:ring-canard/30';

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
      <div className="rounded-card border border-border bg-carte p-6 shadow-card">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-pill bg-canard/10 p-2">
              <DoorOpen className="h-6 w-6 text-canard" />
            </div>
            <div>
              <h2 className="text-h2 text-ink">Gestion des salles</h2>
              <p className="text-caption">Gérez les salles de consultation par site</p>
            </div>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 rounded-input bg-marine px-4 py-2 text-button text-white shadow-button transition-colors hover:bg-marine/90"
          >
            <Plus className="h-5 w-5" />
            Nouvelle salle
          </button>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {sites.filter(s => s.is_active).map((site) => {
            const roomCount = getRoomCount(site.id);
            return (
              <div key={site.id} className="rounded-card border border-border bg-fond p-4">
                <div className="mb-2 flex items-center gap-2">
                  <div
                    className="h-4 w-4 rounded-pill"
                    style={{ backgroundColor: site.color || '#3B82F6' }}
                  />
                  <h3 className="font-semibold text-ink">{site.name}</h3>
                </div>
                <p className="text-h1 text-canard">{roomCount}</p>
                <p className="text-caption">salle{roomCount > 1 ? 's' : ''} active{roomCount > 1 ? 's' : ''}</p>
              </div>
            );
          })}
        </div>

        <div className="mb-4 flex items-center gap-2">
          <label className="text-field-label">Filtrer par site :</label>
          <select
            value={filterSite}
            onChange={(e) => setFilterSite(e.target.value)}
            className="rounded-input border border-border bg-carte px-3 py-2 text-body-m text-ink focus:border-canard focus:outline-none focus:ring-2 focus:ring-canard/30"
          >
            <option value="all">Tous les sites</option>
            {sites.filter(s => s.is_active).map((site) => (
              <option key={site.id} value={site.id}>{site.name}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="py-12 text-center text-muted">Chargement…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border bg-fond">
                <tr>
                  <th className="px-4 py-3 text-left text-field-label">Site</th>
                  <th className="px-4 py-3 text-left text-field-label">Nom de la salle</th>
                  <th className="px-4 py-3 text-left text-field-label">Statut</th>
                  <th className="px-4 py-3 text-left text-field-label">Créée le</th>
                  <th className="px-4 py-3 text-right text-field-label">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRooms.map((room) => (
                  <tr key={room.id} className="hover:bg-fond">
                    {editingRoom?.id === room.id ? (
                      <>
                        <td className="px-4 py-3 text-body-m text-muted">
                          {room.site?.name}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={editingRoom.name}
                            onChange={(e) => setEditingRoom({ ...editingRoom, name: e.target.value })}
                            className={fieldClass}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={editingRoom.is_active}
                              onChange={(e) => setEditingRoom({ ...editingRoom, is_active: e.target.checked })}
                              className="h-4 w-4 accent-canard"
                            />
                            <span className="text-body-m text-ink">Actif</span>
                          </label>
                        </td>
                        <td className="px-4 py-3 text-caption">
                          {new Date(room.created_at).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleUpdateRoom(editingRoom)}
                              className="rounded-pill p-2 text-green-600 transition-colors hover:bg-green-50"
                            >
                              <Check className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => setEditingRoom(null)}
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
                          <div className="flex items-center gap-2">
                            <div
                              className="h-3 w-3 rounded-pill"
                              style={{ backgroundColor: room.site?.color || '#3B82F6' }}
                            />
                            <span className="font-medium text-ink">{room.site?.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium text-ink">{room.name}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleToggleActive(room)}
                            className={`rounded-pill px-3 py-1 text-xs font-semibold ${
                              room.is_active
                                ? 'bg-green-100 text-green-800'
                                : 'bg-fond text-muted'
                            }`}
                          >
                            {room.is_active ? 'Actif' : 'Inactif'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-caption">
                          {new Date(room.created_at).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setEditingRoom(room)}
                              className="rounded-pill p-2 text-canard transition-colors hover:bg-canard/10"
                            >
                              <Edit2 className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteRoom(room)}
                              className="rounded-pill p-2 text-brique transition-colors hover:bg-brique/10"
                            >
                              <Trash2 className="h-5 w-5" />
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
          title="Créer une nouvelle salle"
          onClose={() => {
            setShowCreateModal(false);
            setNewRoom({ siteId: '', name: '' });
            setError('');
          }}
          footer={
            <>
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setNewRoom({ siteId: '', name: '' });
                  setError('');
                }}
                className="h-12 flex-1 rounded-input border border-border text-button text-marine"
              >
                Annuler
              </button>
              <button
                type="submit"
                form="create-room-form"
                className="h-12 flex-1 rounded-input bg-marine text-button text-white shadow-button transition-colors hover:bg-marine/90"
              >
                Créer
              </button>
            </>
          }
        >
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-input border border-brique/20 bg-brique/10 px-4 py-3 text-body-m text-brique">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form id="create-room-form" onSubmit={handleCreateRoom} className="space-y-4">
            <div>
              <label className="mb-2 block text-field-label">Site *</label>
              <select
                required
                value={newRoom.siteId}
                onChange={(e) => setNewRoom({ ...newRoom, siteId: e.target.value })}
                className={fieldClass}
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
              <label className="mb-2 block text-field-label">Nom de la salle *</label>
              <input
                type="text"
                required
                value={newRoom.name}
                onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })}
                className={fieldClass}
                placeholder="Ex : Salle 1, Cabinet A…"
              />
            </div>
          </form>
        </BottomSheet>
      )}
    </div>
  );
}
