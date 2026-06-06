// src/hooks/useNotifications.js
// Gere l'activation des notifications push : demande la permission, recupere le
// token FCM, et le stocke dans profiles.fcm_token pour l'utilisateur courant.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'
import { notificationsSupported, requestNotificationToken } from '../lib/firebase'

export function useNotifications() {
  const { user } = useAuth()
  const [supported, setSupported] = useState(null) // null = detection en cours
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  )
  const [enabling, setEnabling] = useState(false)
  const [error, setError] = useState(null)

  // Teste une seule fois si le navigateur supporte le push.
  useEffect(() => {
    let cancelled = false
    notificationsSupported().then((ok) => {
      if (!cancelled) setSupported(ok)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Action a declencher par un geste utilisateur (un bouton) -- requis sur iOS.
  const enableNotifications = useCallback(async () => {
    setError(null)
    setEnabling(true)
    try {
      const token = await requestNotificationToken()

      if (typeof Notification !== 'undefined') {
        setPermission(Notification.permission)
      }

      if (!token) {
        setError('Notifications non activées (permission refusée ou non supportée).')
        return false
      }

      if (!user?.id) {
        setError('Utilisateur non connecté.')
        return false
      }

      const { error: dbError } = await supabase
        .from('profiles')
        .update({ fcm_token: token })
        .eq('id', user.id)

      if (dbError) {
        setError('Token obtenu mais non enregistré. Réessayez.')
        return false
      }

      return true
    } catch {
      setError("Une erreur est survenue lors de l'activation.")
      return false
    } finally {
      setEnabling(false)
    }
  }, [user?.id])

  return {
    supported,            // true / false / null (detection en cours)
    permission,           // 'default' | 'granted' | 'denied'
    enabling,             // true pendant l'activation
    error,                // message d'erreur (UI) ou null
    enableNotifications,  // fonction a brancher sur un bouton
  }
}
