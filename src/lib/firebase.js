// src/lib/firebase.js
// Initialisation Firebase (cote APPLICATION) + helpers notifications push.
// Sert a : demander la permission, recuperer le token FCM, et recevoir les
// messages quand l'app est au premier plan. L'arriere-plan est gere dans src/sw.js.
// Les valeurs VITE_FIREBASE_* ne sont pas sensibles (elles vivent cote client).

import { initializeApp } from 'firebase/app'
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY

const app = initializeApp(firebaseConfig)

// getMessaging() plante dans un environnement qui ne supporte pas le push
// (vieux navigateur, iOS non installe...). On passe donc toujours par isSupported().
// La promesse est memoisee pour ne tester qu'une fois.
let messagingPromise = null
function getMessagingIfSupported() {
  if (!messagingPromise) {
    messagingPromise = isSupported().then((ok) => (ok ? getMessaging(app) : null))
  }
  return messagingPromise
}

// Indique si le navigateur courant supporte les notifications push.
export async function notificationsSupported() {
  const messaging = await getMessagingIfSupported()
  return messaging !== null
}

// Demande la permission a l'utilisateur, puis recupere le token FCM.
// IMPORTANT : sur iOS, cet appel DOIT etre declenche par un geste utilisateur (un tap).
// Retourne le token (string) ou null si non supporte / permission refusee.
export async function requestNotificationToken() {
  const messaging = await getMessagingIfSupported()
  if (!messaging) return null

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null

  // On reutilise NOTRE service worker (sw.js) deja enregistre par vite-plugin-pwa,
  // au lieu de laisser Firebase chercher un firebase-messaging-sw.js a la racine.
  const registration = await navigator.serviceWorker.ready

  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  })
  return token || null
}

// Ecoute les messages recus quand l'app est au PREMIER PLAN (onglet actif).
// Retourne une fonction de desabonnement.
export async function onForegroundMessage(callback) {
  const messaging = await getMessagingIfSupported()
  if (!messaging) return () => {}
  return onMessage(messaging, callback)
}
