// src/features/immobilier/useImmobilier.js
// Hook racine du module Immobilier.
// - Liste les tableaux ou je suis membre via INNER JOIN sur board_members.
// - Filtre actifs / archives via showArchived.
// - Realtime sur immobilier_boards : si un membre cree ou archive un
//   tableau ou si une activite remonte un tableau, on refetch.
// - Cleanup classique avec drapeau "active" + unsubscribe du channel.

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

export function useImmobilier({ showArchived = false } = {}) {
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const refetch = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let active = true;

    async function fetchBoards() {
      setLoading(true);
      setError(null);

      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const userId = currentUser?.id;

      const { data, error: err } = await supabase
        .from('immobilier_boards')
        .select(`
          id,
          titre,
          description,
          couleur,
          archive,
          auteur_id,
          last_activity_at,
          created_at,
          updated_at,
          members:immobilier_board_members!board_id(user_id, last_read_at)
        `)
        .eq('archive', showArchived)
        .order('last_activity_at', { ascending: false });

      if (!active) return;

      if (err) {
        setError(err);
        setBoards([]);
      } else {
        // Enrichissement : hasUnread = last_activity > my last_read_at
        const enriched = (data || []).map((b) => {
          const myMembership = (b.members || []).find((m) => m.user_id === userId);
          const lastReadAt = myMembership?.last_read_at;
          const hasUnread = lastReadAt
            ? new Date(b.last_activity_at) > new Date(lastReadAt)
            : true; // membre sans last_read_at -> considere comme non-lu
          return { ...b, hasUnread };
        });
        setBoards(enriched);
      }
      setLoading(false);
    }

    fetchBoards();

    // Realtime : on rafraichit a chaque changement sur immobilier_boards.
    // Simple et suffisant pour V1 ; on pourra affiner si besoin.
    const channel = supabase
      .channel('immobilier_boards_list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'immobilier_boards' },
        () => {
          if (active) refetch();
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [showArchived, reloadKey]);

  return { boards, loading, error, refetch };
}
