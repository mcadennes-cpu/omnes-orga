import { useState, useEffect } from 'react';
import { supabase, supabaseOrga, Site } from '../../lib/supabase';
import { Building2, Plus, Edit2, Check, X, DoorOpen } from 'lucide-react';
import BottomSheet from '../ui/BottomSheet';

type SiteWithRoomCount = Site & { roomCount: number };

const fieldClass =
  'w-full rounded-input border border-border bg-carte px-3 py-2 text-body-m text-ink ' +
  'focus:border-canard focus:outline-none focus:ring-2 focus:ring-canard/30';

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

    const sitesSub = supabaseOrga
      .channel('sites_changes')
      .on('postgres_changes', { event: '*', schema: 'agenda', table: 'sites' }, () => {
        loadSites();
      })
      .subscribe();

    const roomsSub = supabaseOrga
      .channel('rooms_changes_sites')
      .on('postgres_changes', { event: '*', schema: 'agenda', table: 'rooms' }, () => {
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

  const roomDelta = managingRoomsSite ? newRoomCount - managingRoomsSite.roomCount : 0;

  return (
    <div className="space-y-6">
      <div className="rounded-card border border-border bg-carte p-6 shadow-card">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-pill bg-canard/10 p-2">
              <Building2 className="h-6 w-6 text-canard" />
            </div>
            <div>
              <h2 className="text-h2 text-ink">Gestion des sites</h2>
              <p className="text-caption">Gérez les sites et leurs salles de consultation</p>
            </div>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 rounded-input bg-marine px-4 py-2 text-button text-white shadow-button transition-colors hover:bg-marine/90"
          >
            <Plus className="h-5 w-5" />
            Nouveau site
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-muted">Chargement…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border bg-fond">
                <tr>
                  <th className="px-4 py-3 text-left text-field-label">Nom</th>
                  <th className="px-4 py-3 text-left text-field-label">Couleur</th>
                  <th className="px-4 py-3 text-left text-field-label">Nombre de salles</th>
                  <th className="px-4 py-3 text-left text-field-label">Statut</th>
                  <th className="px-4 py-3 text-left text-field-label">Créé le</th>
                  <th className="px-4 py-3 text-right text-field-label">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sites.map((site) => (
                  <tr key={site.id} className="hover:bg-fond">
                    {editingSite?.id === site.id ? (
                      <>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={editingSite.name}
                            onChange={(e) => setEditingSite({ ...editingSite, name: e.target.value })}
                            className={fieldClass}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="color"
                            value={editingSite.color || '#3B82F6'}
                            onChange={(e) => setEditingSite({ ...editingSite, color: e.target.value })}
                            className="h-10 w-16 cursor-pointer rounded-input border border-border"
                          />
                        </td>
                        <td className="px-4 py-3 text-body-m text-muted">{site.roomCount} salle{site.roomCount > 1 ? 's' : ''}</td>
                        <td className="px-4 py-3">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={editingSite.is_active}
                              onChange={(e) => setEditingSite({ ...editingSite, is_active: e.target.checked })}
                              className="h-4 w-4 accent-canard"
                            />
                            <span className="text-body-m text-ink">Actif</span>
                          </label>
                        </td>
                        <td className="px-4 py-3 text-caption">
                          {new Date(site.created_at).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleUpdateSite(editingSite)}
                              className="rounded-pill p-2 text-green-600 transition-colors hover:bg-green-50"
                            >
                              <Check className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => setEditingSite(null)}
                              className="rounded-pill p-2 text-muted transition-colors hover:bg-fond"
                            >
                              <X className="h-5 w-5" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-medium text-ink">{site.name}</td>
                        <td className="px-4 py-3">
                          <div
                            className="h-8 w-8 rounded-pill border border-border"
                            style={{ backgroundColor: site.color || '#3B82F6' }}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => {
                              setManagingRoomsSite(site);
                              setNewRoomCount(site.roomCount);
                            }}
                            className="flex items-center gap-2 font-medium text-canard hover:text-canard/80"
                          >
                            <DoorOpen className="h-4 w-4" />
                            {site.roomCount} salle{site.roomCount > 1 ? 's' : ''}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleToggleActive(site)}
                            className={`rounded-pill px-3 py-1 text-xs font-semibold ${
                              site.is_active
                                ? 'bg-green-100 text-green-800'
                                : 'bg-fond text-muted'
                            }`}
                          >
                            {site.is_active ? 'Actif' : 'Inactif'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-caption">
                          {new Date(site.created_at).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setEditingSite(site)}
                              className="rounded-pill p-2 text-canard transition-colors hover:bg-canard/10"
                              title="Modifier"
                            >
                              <Edit2 className="h-5 w-5" />
                            </button>
                            <button
                              onClick={() => handleDelete(site)}
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
          title="Créer un nouveau site"
          onClose={() => {
            setShowCreateModal(false);
            setNewSite({ name: '', color: '#3B82F6', roomCount: 6 });
            setError('');
          }}
          footer={
            <>
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setNewSite({ name: '', color: '#3B82F6', roomCount: 6 });
                  setError('');
                }}
                className="h-12 flex-1 rounded-input border border-border text-button text-marine"
              >
                Annuler
              </button>
              <button
                type="submit"
                form="create-site-form"
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

          <form id="create-site-form" onSubmit={handleCreateSite} className="space-y-4">
            <div>
              <label className="mb-2 block text-field-label">Nom du site *</label>
              <input
                type="text"
                required
                value={newSite.name}
                onChange={(e) => setNewSite({ ...newSite, name: e.target.value })}
                className={fieldClass}
                placeholder="Ex : Paris, Lyon…"
              />
            </div>

            <div>
              <label className="mb-2 block text-field-label">Couleur (optionnel)</label>
              <input
                type="color"
                value={newSite.color}
                onChange={(e) => setNewSite({ ...newSite, color: e.target.value })}
                className="h-12 w-full cursor-pointer rounded-input border border-border"
              />
            </div>

            <div>
              <label className="mb-2 block text-field-label">Nombre de salles (1-10) *</label>
              <input
                type="number"
                required
                min="1"
                max="10"
                value={newSite.roomCount}
                onChange={(e) => setNewSite({ ...newSite, roomCount: parseInt(e.target.value) })}
                className={fieldClass}
              />
              <p className="mt-1 text-caption">
                Les salles seront nommées automatiquement (Salle 1, Salle 2, etc.)
              </p>
            </div>
          </form>
        </BottomSheet>
      )}

      {managingRoomsSite && (
        <BottomSheet
          title={`Gérer les salles de ${managingRoomsSite.name}`}
          onClose={() => {
            setManagingRoomsSite(null);
            setNewRoomCount(6);
            setError('');
          }}
          footer={
            <>
              <button
                onClick={() => {
                  setManagingRoomsSite(null);
                  setNewRoomCount(6);
                  setError('');
                }}
                className="h-12 flex-1 rounded-input border border-border text-button text-marine"
              >
                Annuler
              </button>
              <button
                onClick={handleAdjustRoomCount}
                disabled={newRoomCount === managingRoomsSite.roomCount}
                className="h-12 flex-1 rounded-input bg-marine text-button text-white shadow-button transition-colors hover:bg-marine/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Appliquer
              </button>
            </>
          }
        >
          {error && (
            <div className="mb-4 rounded-input border border-brique/20 bg-brique/10 px-4 py-3 text-body-m text-brique">
              {error}
            </div>
          )}

          <div>
            <p className="mb-2 text-body-m text-ink">
              Nombre actuel de salles : {managingRoomsSite.roomCount}
            </p>
            <label className="mb-2 mt-4 block text-field-label">Nouveau nombre de salles (1-10) *</label>
            <input
              type="number"
              min="1"
              max="10"
              value={newRoomCount}
              onChange={(e) => setNewRoomCount(parseInt(e.target.value))}
              className={fieldClass}
            />
            {roomDelta > 0 && (
              <p className="mt-1 text-xs text-green-600">
                {roomDelta} salle{roomDelta > 1 ? 's' : ''} sera{roomDelta > 1 ? 'ont' : ''} ajoutée{roomDelta > 1 ? 's' : ''}
              </p>
            )}
            {roomDelta < 0 && (
              <p className="mt-1 text-xs text-brique">
                {-roomDelta} salle{-roomDelta > 1 ? 's' : ''} sera{-roomDelta > 1 ? 'ont' : ''} supprimée{-roomDelta > 1 ? 's' : ''} (si aucune garde n'est assignée)
              </p>
            )}
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
