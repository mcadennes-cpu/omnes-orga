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

      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const userId = currentUser?.id;

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

      // Enrichissement des cartes : last message + unread count.
      const baseCards = resCards.data || [];
      if (baseCards.length === 0 || !userId) {
        setCards(baseCards);
        setLoading(false);
        return;
      }

      const cardIds = baseCards.map((c) => c.id);

      // Reads de l'utilisateur courant pour ces cartes
      const { data: readsData } = await supabase
        .from('immobilier_card_reads')
        .select('card_id, last_read_at')
        .eq('user_id', userId)
        .in('card_id', cardIds);

      const readsByCard = new Map(
        (readsData || []).map((r) => [r.card_id, r.last_read_at])
      );

      // Tous les messages de ces cartes, pour calculer compteurs + dernier
      const { data: messagesData } = await supabase
        .from('immobilier_messages')
        .select(`
          id,
          card_id,
          contenu,
          auteur_id,
          created_at,
          auteur:profiles!auteur_id (id, prenom, nom)
        `)
        .in('card_id', cardIds)
        .order('created_at', { ascending: false });

      // Group by card_id
      const messagesByCard = new Map();
      for (const m of messagesData || []) {
        if (!messagesByCard.has(m.card_id)) messagesByCard.set(m.card_id, []);
        messagesByCard.get(m.card_id).push(m);
      }

      const enrichedCards = baseCards.map((c) => {
        const cardMessages = messagesByCard.get(c.id) || [];
        const lastMessage = cardMessages[0] || null;
        const lastReadAt = readsByCard.get(c.id);
        const unreadCount = lastReadAt
          ? cardMessages.filter(
              (m) => new Date(m.created_at) > new Date(lastReadAt)
                  && m.auteur_id !== userId
            ).length
          : cardMessages.filter((m) => m.auteur_id !== userId).length;
        return {
          ...c,
          lastMessage,
          unreadCount,
          messagesCount: cardMessages.length,
        };
      });

      if (!active) return;
      setCards(enrichedCards);
      setLoading(false);
    }

    fetchAll();

    // Realtime : cartes du tableau
    const cardsChannel = supabase
      .channel(`immobilier_board_${boardId}_cards`)
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

    // Realtime : messages (pour refresh des compteurs / snippet sur les tiles).
    // On ne peut pas filtrer par board_id ici (pas dans la table messages),
    // donc on ecoute large et on filtre cote client via refetch.
    const messagesChannel = supabase
      .channel(`immobilier_board_${boardId}_messages`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'immobilier_messages',
        },
        () => {
          if (active) refetch();
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(cardsChannel);
      supabase.removeChannel(messagesChannel);
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

// Hook minimaliste : juste les owners d'un tableau.
// Utile pour les pages qui ont besoin des droits sur les actions
// de tableau/carte sans payer le cout d'un fetch complet + Realtime.
// Pas de Realtime ici : si la composition d'owners change, l'utilisateur
// rechargera ou naviguera.
export function useBoardOwnerIds(boardId) {
  const [ownerIds, setOwnerIds] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!boardId) return;
    let active = true;

    async function fetchOwners() {
      setLoading(true);
      const { data } = await supabase
        .from('immobilier_board_members')
        .select('user_id')
        .eq('board_id', boardId)
        .eq('role_in_board', 'owner');

      if (!active) return;
      setOwnerIds((data || []).map((row) => row.user_id));
      setLoading(false);
    }

    fetchOwners();
    return () => { active = false; };
  }, [boardId]);

  return { ownerIds, loading };
}
