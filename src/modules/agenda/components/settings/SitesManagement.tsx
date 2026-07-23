import { useState, useEffect } from 'react';
import { supabase, Site, Room } from '../../lib/supabase';
import { Building2, Plus, Edit2, Check, X, DoorOpen, Trash2 } from 'lucide-react';

type SiteWithRoomCount = Site & { roomCount: number };

export default function SitesManagement() {
  const [sites, setSites] = useState<SiteWithRoomCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [managingRoomsSite, setManagingRoomsSite] = useState<SiteWithRoomCount | null>(null);
  const [newSite, setNewSite] = useState({ name: '', color: '#3B82F6', roomCount: 6 });
  const [newRoomCount, setNewRoomCount] = useState(6);
  const [error, setError] = useState('');

  useEffect(() => {
    loadSites();

    const sitesSub = supabase
      .channel('sites_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sites' }, () => {
        loadSites();
      })
      .subscribe();

    const roomsSub = supabase
      .channel('rooms_changes_sites')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => {
        loadSites();
      })
      .subscribe();

    return () => {
      sitesSub.unsubscribe();
      roomsSub.unsubscribe();
    };
  }, []);

  const loadSites = async () => {
    setLoading(true);

    const [sitesResult, roomsResult] = await Promise.all([
      supabase.from('sites').select('*').order('name'),
      supabase.from('rooms').select('site_id')
    ]);

    if (sitesResult.data && roomsResult.data) {
      const roomCounts = roomsResult.data.reduce((acc, room) => {
        acc[room.site_id] = (acc[room.site_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const sitesWithCounts = sitesResult.data.map(site => ({
        ...site,
        roomCount: roomCounts[site.id] || 0
      }));

      setSites(sitesWithCounts);
    }

    setLoading(false);
  };

  const handleCreateSite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const { data: siteData, error: siteError } = await supabase
        .from('sites')
        .insert({
          name: newSite.name,
          color: newSite.color,
          is_active: true
        })
        .select()
        .single();

      if (siteError) throw siteError;

      const roomInserts = [];
      for (let i = 1; i <= newSite.roomCount; i++) {
        roomInserts.push({
          site_id: siteData.id,
          name: `Salle ${i}`,
          is_active: true
        });
      }

      const { error: roomError } = await supabase
        .from('rooms')
        .insert(roomInserts);

      if (roomError) throw roomError;

      setShowCreateModal(false);
      setNewSite({ name: '', color: '#3B82F6', roomCount: 6 });
      loadSites();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdateSite = async (site: Site) => {
    const { error } = await supabase
      .from('sites')
      .update({
        name: site.name,
        color: site.color,
        is_active: site.is_active
      })
      .eq('id', site.id);

    if (!error) {
      setEditingSite(null);
      loadSites();
    }
  };

  const handleToggleActive = async (site: Site) => {
    const { error } = await supabase
      .from('sites')
      .update({ is_active: !site.is_active })
      .eq('id', site.id);

    if (!error) {
      loadSites();
    }
  };

  const handleDelete = async (site: SiteWithRoomCount) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer le site "${site.name}" ?\n\nCette action supprimera également toutes les salles (${site.roomCount}) et les gardes associées à ce site.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('sites')
        .delete()
        .eq('id', site.id);

      if (error) throw error;
      loadSites();
    } catch (err: any) {
      alert('Erreur lors de la suppression: ' + err.message);
    }
  };

  const handleAdjustRoomCount = async () => {
    if (!managingRoomsSite) return;

    setError('');
    const currentCount = managingRoomsSite.roomCount;
    const targetCount = newRoomCount;

    try {
      if (targetCount > currentCount) {
        const roomsToAdd = targetCount - currentCount;
        const roomInserts = [];

        for (let i = currentCount + 1; i <= currentCount + roomsToAdd; i++) {
          roomInserts.push({
            site_id: managingRoomsSite.id,
            name: `Salle ${i}`,
            is_active: true
          });
        }

        const { error: insertError } = await supabase
          .from('rooms')
          .insert(roomInserts);

        if (insertError) throw insertError;
      } else if (targetCount < currentCount) {
        const { data: rooms } = await supabase
          .from('rooms')
          .select('id')
          .eq('site_id', managingRoomsSite.id)
          .order('created_at', { ascending: false })
          .limit(currentCount - targetCount);

        if (rooms && rooms.length > 0) {
          for (const room of rooms) {
            const { data: shiftsData } = await supabase
              .from('shifts')
              .select('id')
              .eq('room_id', room.id)
              .limit(1);

            if (shiftsData && shiftsData.length > 0) {
              throw new Error('Impossible de supprimer des salles qui contiennent des gardes assignées.');
            }
          }

          const { error: deleteError } = await supabase
            .from('rooms')
            .delete()
            .in('id', rooms.map(r => r.id));

          if (deleteError) throw deleteError;
        }
      }

      setManagingRoomsSite(null);
      setNewRoomCount(6);
      loadSites();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Building2 className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-teal-900">Gestion des Sites</h2>
              <p className="text-sm text-gray-600">Gérez les sites et leurs salles de consultation</p>
            </div>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-pink-500 hover:bg-pink-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Nouveau Site
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Chargement...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b-2 border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Nom</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Couleur</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Nombre de salles</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Statut</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Créé le</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sites.map((site) => (
                  <tr key={site.id} className="hover:bg-gray-50">
                    {editingSite?.id === site.id ? (
                      <>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={editingSite.name}
                            onChange={(e) => setEditingSite({ ...editingSite, name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="color"
                            value={editingSite.color || '#3B82F6'}
                            onChange={(e) => setEditingSite({ ...editingSite, color: e.target.value })}
                            className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-3 text-gray-700">{site.roomCount} salle{site.roomCount > 1 ? 's' : ''}</td>
                        <td className="px-4 py-3">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={editingSite.is_active}
                              onChange={(e) => setEditingSite({ ...editingSite, is_active: e.target.checked })}
                              className="w-4 h-4 text-pink-500 rounded focus:ring-pink-500"
                            />
                            <span className="text-sm">Actif</span>
                          </label>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-sm">
                          {new Date(site.created_at).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleUpdateSite(editingSite)}
                              className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            >
                              <Check className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => setEditingSite(null)}
                              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-medium text-gray-900">{site.name}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-8 h-8 rounded border border-gray-300"
                              style={{ backgroundColor: site.color || '#3B82F6' }}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => {
                              setManagingRoomsSite(site);
                              setNewRoomCount(site.roomCount);
                            }}
                            className="flex items-center gap-2 text-teal-600 hover:text-teal-700 font-medium"
                          >
                            <DoorOpen className="w-4 h-4" />
                            {site.roomCount} salle{site.roomCount > 1 ? 's' : ''}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleToggleActive(site)}
                            className={`px-3 py-1 rounded-full text-xs font-semibold ${
                              site.is_active
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {site.is_active ? 'Actif' : 'Inactif'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-sm">
                          {new Date(site.created_at).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setEditingSite(site)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Modifier"
                            >
                              <Edit2 className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleDelete(site)}
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
            <h3 className="text-xl font-bold text-gray-900 mb-4">Créer un nouveau site</h3>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateSite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nom du site *
                </label>
                <input
                  type="text"
                  required
                  value={newSite.name}
                  onChange={(e) => setNewSite({ ...newSite, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  placeholder="Ex: Paris, Lyon..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Couleur (optionnel)
                </label>
                <input
                  type="color"
                  value={newSite.color}
                  onChange={(e) => setNewSite({ ...newSite, color: e.target.value })}
                  className="w-full h-12 border border-gray-300 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre de salles (1-10) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  max="10"
                  value={newSite.roomCount}
                  onChange={(e) => setNewSite({ ...newSite, roomCount: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Les salles seront nommées automatiquement (Salle 1, Salle 2, etc.)
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewSite({ name: '', color: '#3B82F6', roomCount: 6 });
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

      {managingRoomsSite && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Gérer les salles de {managingRoomsSite.name}
            </h3>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre actuel de salles: {managingRoomsSite.roomCount}
                </label>
                <label className="block text-sm font-medium text-gray-700 mb-2 mt-4">
                  Nouveau nombre de salles (1-10) *
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={newRoomCount}
                  onChange={(e) => setNewRoomCount(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                />
                {newRoomCount > managingRoomsSite.roomCount && (
                  <p className="text-xs text-green-600 mt-1">
                    {newRoomCount - managingRoomsSite.roomCount} salle{newRoomCount - managingRoomsSite.roomCount > 1 ? 's' : ''} sera{newRoomCount - managingRoomsSite.roomCount > 1 ? 'ont' : ''} ajoutée{newRoomCount - managingRoomsSite.roomCount > 1 ? 's' : ''}
                  </p>
                )}
                {newRoomCount < managingRoomsSite.roomCount && (
                  <p className="text-xs text-red-600 mt-1">
                    {managingRoomsSite.roomCount - newRoomCount} salle{managingRoomsSite.roomCount - newRoomCount > 1 ? 's' : ''} sera{managingRoomsSite.roomCount - newRoomCount > 1 ? 'ont' : ''} supprimée{managingRoomsSite.roomCount - newRoomCount > 1 ? 's' : ''} (si aucune garde n'est assignée)
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setManagingRoomsSite(null);
                    setNewRoomCount(6);
                    setError('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleAdjustRoomCount}
                  disabled={newRoomCount === managingRoomsSite.roomCount}
                  className="flex-1 px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Appliquer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
