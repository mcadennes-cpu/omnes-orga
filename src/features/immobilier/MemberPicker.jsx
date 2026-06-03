// src/features/immobilier/MemberPicker.jsx
// Multi-selection des profils a inviter dans un tableau Immobilier.
// - Charge profiles ou actif=true et role IN (super_admin, associe_gerant, associe)
//   (donc PAS de remplacant : garde-fou cote UI, en plus de la RLS).
// - Exclut l'utilisateur courant (il est ajoute automatiquement en owner).
// - Recherche locale par prenom/nom/specialite, insensible accents+casse.
// - Toggle de selection par tap.

import { useEffect, useMemo, useState } from 'react';
import { Search, Check } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { normalizeForSearch, formatName } from '../../lib/profileFormat';
import Avatar from '../../components/common/Avatar';

const EMPTY_ARRAY = [];

export default function MemberPicker({ currentUserId, selectedIds, onChange, excludeIds = EMPTY_ARRAY }) {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    let active = true;

    async function fetchProfiles() {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('profiles')
        .select('id, prenom, nom, specialite, photo_url, role')
        .eq('actif', true)
        .in('role', ['super_admin', 'associe_gerant', 'associe'])
        .order('nom', { ascending: true });

      if (!active) return;

      if (err) {
        setError(err);
        setProfiles([]);
      } else {
        // Exclure l'utilisateur courant (gere par l'appelant) et tout id
        // explicite via excludeIds (utile pour ne pas reproposer des
        // membres deja invites en gestion de membres).
        const excluded = new Set([currentUserId, ...excludeIds]);
        setProfiles((data || []).filter((p) => !excluded.has(p.id)));
      }
      setLoading(false);
    }

    fetchProfiles();
    return () => { active = false; };
  }, [currentUserId, excludeIds]);

  const filteredProfiles = useMemo(() => {
    if (!searchTerm.trim()) return profiles;
    const needle = normalizeForSearch(searchTerm);
    return profiles.filter((p) => {
      const hay = normalizeForSearch(
        `${p.prenom || ''} ${p.nom || ''} ${p.specialite || ''}`
      );
      return hay.includes(needle);
    });
  }, [profiles, searchTerm]);

  function toggle(id) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  return (
    <div>
      {/* Barre de recherche */}
      <div className="relative mb-3">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"
          aria-hidden="true"
        />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Rechercher un participant..."
          className="w-full pl-9 pr-3 py-2 bg-carte border border-border
                     rounded-input text-body-m text-ink
                     placeholder:text-faint
                     focus:outline-none focus:ring-2 focus:ring-canard"
        />
      </div>

      {/* Etats */}
      {loading && (
        <p className="text-body-m text-muted">Chargement...</p>
      )}
      {error && (
        <p className="text-body-m text-brique">
          Erreur : {error.message}
        </p>
      )}

      {/* Liste */}
      {!loading && !error && (
        <div className="max-h-64 overflow-y-auto space-y-1">
          {filteredProfiles.length === 0 ? (
            <p className="text-body-m text-muted text-center py-4">
              Aucun participant trouve.
            </p>
          ) : (
            filteredProfiles.map((p) => {
              const isSelected = selectedIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2
                              rounded-input transition-colors
                              ${isSelected ? 'bg-canard/10' : 'hover:bg-fond'}`}
                >
                  {/* Avatar : photo de profil ou initiales sur palette */}
                  <Avatar profile={p} size={36} className="flex-shrink-0" />

                  {/* Nom + specialite */}
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-body-m text-ink truncate">
                      {formatName(p)}
                    </p>
                    {p.specialite && (
                      <p className="text-caption text-muted truncate">
                        {p.specialite}
                      </p>
                    )}
                  </div>

                  {/* Coche si selectionne */}
                  {isSelected && (
                    <Check
                      size={20}
                      className="text-canard flex-shrink-0"
                      aria-label="Selectionne"
                    />
                  )}
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Compteur */}
      {selectedIds.length > 0 && (
        <p className="text-caption text-muted mt-2">
          {selectedIds.length} participant{selectedIds.length > 1 ? 's' : ''} selectionne{selectedIds.length > 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
