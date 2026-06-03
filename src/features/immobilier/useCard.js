// src/features/immobilier/useCard.js
// Hook de la vue carte /immobilier/:boardId/:cardId.
// - Charge la carte + le board parent (pour la couleur, le titre court,
//   le statut clos eventuellement)
// - Charge les messages avec leur auteur (jointure profiles)
// - Realtime sur immobilier_messages pour le fil en direct
// - Marque la carte lue a l'ouverture (upsert immobilier_card_reads)
//   + RPC mark_immobilier_board_read pour le tracking tableau
//
// Renvoie aussi sendMessage / editMessage / deleteMessage pour le composer.

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { deleteAttachment } from './immobilierStorage';

export function useCard(cardId) {
  const [card, setCard] = useState(null);
  const [board, setBoard] = useState(null);
  const [messages, setMessages] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!cardId) return;
    let active = true;

    async function fetchAll() {
      setLoading(true);
      setError(null);
      setNotFound(false);

      // 1) Charger la carte
      const { data: cardData, error: cardErr } = await supabase
        .from('immobilier_cards')
        .select('id, board_id, titre, description, statut, archive, auteur_id, last_activity_at, created_at')
        .eq('id', cardId)
        .maybeSingle();

      if (!active) return;
      if (cardErr) {
        setError(cardErr);
        setLoading(false);
        return;
      }
      if (!cardData) {
        // Carte introuvable ou RLS qui bloque (non-membre du tableau)
        setNotFound(true);
        setLoading(false);
        return;
      }
      setCard(cardData);

      // 2) En parallele : board parent + messages
      const [resBoard, resMessages, resAttachments] = await Promise.all([
        supabase
          .from('immobilier_boards')
          .select('id, titre, couleur, archive')
          .eq('id', cardData.board_id)
          .maybeSingle(),
        supabase
          .from('immobilier_messages')
          .select(`
            id,
            card_id,
            auteur_id,
            contenu,
            edited,
            created_at,
            auteur:profiles!auteur_id (id, prenom, nom, photo_url)
          `)
          .eq('card_id', cardId)
          .order('created_at', { ascending: true }),
        supabase
          .from('immobilier_attachments')
          .select('id, card_id, nom, taille_octets, mime_type, auteur_id, created_at')
          .eq('card_id', cardId)
          .order('created_at', { ascending: true }),
      ]);

      if (!active) return;

      if (resBoard.data) setBoard(resBoard.data);
      if (resMessages.data) setMessages(resMessages.data);
      if (resAttachments.data) setAttachments(resAttachments.data);
      setLoading(false);
    }

    fetchAll();

    // Realtime sur les messages de cette carte
    const messagesChannel = supabase
      .channel(`immobilier_card_${cardId}_messages`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'immobilier_messages',
          filter: `card_id=eq.${cardId}`,
        },
        () => {
          if (active) refetch();
        }
      )
      .subscribe();

    // Realtime sur les pieces jointes de cette carte
    const attachmentsChannel = supabase
      .channel(`immobilier_card_${cardId}_attachments`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'immobilier_attachments',
          filter: `card_id=eq.${cardId}`,
        },
        () => {
          if (active) refetch();
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(attachmentsChannel);
    };
  }, [cardId, reloadKey, refetch]);

  // ----- Marquage lu -----
  // Appelle apres le 1er chargement pour mettre a jour :
  // - immobilier_card_reads (compteur numerique par carte)
  // - immobilier_board_members.last_read_at via RPC (point coloré tableau)
  const markRead = useCallback(async () => {
    if (!card) return;
    // Upsert immobilier_card_reads pour cet user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from('immobilier_card_reads')
      .upsert(
        {
          card_id: card.id,
          user_id: user.id,
          last_read_at: new Date().toISOString(),
        },
        { onConflict: 'card_id,user_id' }
      );
    // RPC pour le tableau
    await supabase.rpc('mark_immobilier_board_read', {
      p_board_id: card.board_id,
    });
  }, [card]);

  // ----- Changement de statut de la carte (ouvert <-> clos) -----
  // Mise a jour optimiste : on update le state local immediatement pour
  // que le composer / la RLS coté UI reflete le bon statut sans attendre
  // que Realtime relaie l'UPDATE.
  const setCardStatus = useCallback(async (nouveauStatut) => {
    if (!card) return { error: new Error('Carte non chargee') };
    if (nouveauStatut !== 'ouvert' && nouveauStatut !== 'clos') {
      return { error: new Error('Statut invalide') };
    }
    const ancienStatut = card.statut;
    // Optimiste : on update le state local d'abord
    setCard((prev) => (prev ? { ...prev, statut: nouveauStatut } : prev));
    const { error: err } = await supabase
      .from('immobilier_cards')
      .update({ statut: nouveauStatut })
      .eq('id', card.id);
    if (err) {
      // Rollback en cas d'echec
      setCard((prev) => (prev ? { ...prev, statut: ancienStatut } : prev));
    }
    return { error: err };
  }, [card]);

  // ----- Envoi / edition / suppression de message -----
  const sendMessage = useCallback(
    async (contenu) => {
      if (!card || !contenu?.trim()) return { error: new Error('Contenu vide') };
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { error: new Error('Non connecte') };
      const id = crypto.randomUUID();
      const { error: err } = await supabase
        .from('immobilier_messages')
        .insert({
          id,
          card_id: card.id,
          auteur_id: user.id,
          contenu: contenu.trim(),
        });
      return { error: err, id };
    },
    [card]
  );

  const editMessage = useCallback(async (messageId, nouveauContenu) => {
    if (!nouveauContenu?.trim()) return { error: new Error('Contenu vide') };
    const contenu = nouveauContenu.trim();
    const { error: err } = await supabase
      .from('immobilier_messages')
      .update({ contenu, edited: true })
      .eq('id', messageId);
    if (!err) {
      // Mise a jour optimiste
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, contenu, edited: true } : m
        )
      );
    }
    return { error: err };
  }, []);

  const deleteMessage = useCallback(async (messageId) => {
    const { error: err } = await supabase
      .from('immobilier_messages')
      .delete()
      .eq('id', messageId);
    if (!err) {
      // Mise a jour optimiste : on retire localement sans attendre Realtime
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    }
    return { error: err };
  }, []);

  const deleteAttachmentFn = useCallback(async (attachmentId) => {
    const result = await deleteAttachment(attachmentId);
    if (!result.error) {
      // Mise a jour optimiste
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    }
    return result;
  }, []);

  return {
    card,
    board,
    messages,
    attachments,
    loading,
    error,
    notFound,
    refetch,
    markRead,
    sendMessage,
    editMessage,
    deleteMessage,
    deleteAttachment: deleteAttachmentFn,
    setCardStatus,
  };
}
