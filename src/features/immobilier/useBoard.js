// src/features/immobilier/useBoard.js
// Hook de la vue tableau /immobilier/:boardId.
// - Charge le tableau (existence, droits implicites via RLS SELECT)
// - Charge les membres avec leur role_in_board (pour les avatars
//   et pour calculer ownerIds utilises par les helpers permissions)
// - Charge les cartes du tableau
// - Realtime sur immobilier_cards pour rafraichir la liste
//
// Renvoie { board, members, ownerIds, cards, loading, error, refetch,
//          notMember, notFound }.
// notMember = true si la RLS SELECT bloque (board pas trouve via cet
// id alors que la requete a abouti). On distingue notFound (mauvais
// id, jamais existe) de notMember (existe mais je suis pas membre).
// En pratique, du point de vue de la page, les deux mene a une
// redirection vers /immobilier.

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

export function useBoard(boardId) {
  const [board, setBoard] = useState(null);
  const [members, setMembers] = useState([]);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const refetch = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    if (!boardId) return;
    let active = true;

    async function fetchAll() {
      setLoading(true);
      setError(null);

      // Chargement parallele : board + membres + cartes
      const [resBoard, resMembers, resCards] = await Promise.all([
        supabase
          .from('immobilier_boards')
          .select('id, titre, description, couleur, archive, auteur_id, last_activity_at')
          .eq('id', boardId)
          .maybeSingle(),
        supabase
          .from('immobilier_board_members')
          .select(`
            user_id,
            role_in_board,
            last_read_at,
            profile:profiles!user_id (id, prenom, nom, specialite, photo_url)
          `)
          .eq('board_id', boardId),
        supabase
          .from('immobilier_cards')
          .select('id, board_id, titre, description, statut, archive, auteur_id, last_activity_at, created_at')
          .eq('board_id', boardId)
          .eq('archive', false)
          .order('last_activity_at', { ascending: false }),
      ]);

      if (!active) return;

      if (resBoard.error) {
        setError(resBoard.error);
        setBoard(null);
        setMembers([]);
        setCards([]);
        setLoading(false);
        return;
      }

      setBoard(resBoard.data || null);
      setMembers(resMembers.data || []);
      setCards(resCards.data || []);
      setLoading(false);
    }

    fetchAll();

    // Realtime cartes
    const channel = supabase
      .channel(`immobilier_board_${boardId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'immobilier_cards',
          filter: `board_id=eq.${boardId}`,
        },
        () => {
          if (active) refetch();
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [boardId, reloadKey]);

  // Liste des owners (pour les helpers de permissions cote UI).
  const ownerIds = members
    .filter((m) => m.role_in_board === 'owner')
    .map((m) => m.user_id);

  // notMember : la requete board a abouti sans erreur mais aucun
  // resultat renvoye (RLS a bloque ou id inexistant).
  const notMember = !loading && !error && board === null;

  return {
    board,
    members,
    ownerIds,
    cards,
    loading,
    error,
    refetch,
    notMember,
  };
}
