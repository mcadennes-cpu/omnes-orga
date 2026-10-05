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

/**
 * Nom de l'expediteur affiche dans une notification : le prenom seul, ou
 * "Prenom N." si un autre medecin actif porte le meme prenom.
 * Renvoie null en cas d'echec : la notification part alors sans nom.
 * @param {string} userId - id profiles de l'auteur du geste.
 */
export async function nomExpediteur(userId) {
  if (!userId) return null
  try {
    const { data: moi } = await supabase
      .from('profiles')
      .select('prenom, nom')
      .eq('id', userId)
      .maybeSingle()
    const prenom = (moi?.prenom || '').trim()
    if (!prenom) return null

    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('actif', true)
      .ilike('prenom', prenom)
      .neq('id', userId)
    const initiale = (moi.nom || '').trim()[0]
    return count > 0 && initiale ? `${prenom} ${initiale.toUpperCase()}.` : prenom
  } catch (err) {
    console.error('[notify] nom expediteur introuvable', err)
    return null
  }
}

/** Titre "Tableau · Carte" (les morceaux vides sont ignores). */
export function titreNotif(...morceaux) {
  return morceaux.map((m) => (m || '').trim()).filter(Boolean).join(' · ')
}

/** Texte "Charlotte : message", ou le message seul si le nom manque. */
export function texteNotif(nom, texte) {
  return (nom ? `${nom} : ${texte}` : texte).slice(0, 140)
}
