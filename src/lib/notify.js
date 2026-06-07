// src/lib/notify.js
// Helper transverse pour declencher une notification push via l'Edge Function
// send-notification. Appel "fire-and-forget" : on n'attend pas le resultat, et
// un echec n'interrompt jamais l'action en cours (poster un message, etc.).

import { supabase } from './supabaseClient'

/**
 * Envoie une notification push a une liste d'utilisateurs.
 * @param {Object} params
 * @param {string[]} params.userIds - destinataires (ids profiles). Les vides sont ignores.
 * @param {string} params.title - titre de la notification.
 * @param {string} params.body - corps de la notification.
 * @param {string} [params.url] - page a ouvrir au clic (defaut '/').
 */
export async function notifyUsers({ userIds, title, body, url = '/' }) {
  const recipients = (userIds || []).filter(
    (id) => typeof id === 'string' && id.length > 0,
  )
  if (recipients.length === 0) return

  try {
    await supabase.functions.invoke('send-notification', {
      body: { userIds: recipients, title, body, url },
    })
  } catch (err) {
    // Une notif ratee ne doit jamais casser l'action principale.
    console.error('[notify] echec envoi notification', err)
  }
}
