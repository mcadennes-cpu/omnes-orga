import { useEffect, useState } from 'react'

// Clé localStorage pour mémoriser le "Plus tard"
const STORAGE_KEY = 'installPrompt:dismissedAt'

// Durée du délai "Plus tard" : 7 jours en millisecondes
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Détecte la plateforme courante.
 *
 * Retourne :
 * - 'ios' : iPhone / iPad sur Safari (la PWA s'installe via Partager → Écran d'accueil)
 * - 'android' : Chrome Android (la PWA s'installe via beforeinstallprompt)
 * - 'desktop' : Mac/PC, on n'affiche pas de prompt
 * - 'other' : autre (Firefox Android, navigateurs in-app, etc.) — on n'affiche rien
 */
function detectPlatform() {
  if (typeof window === 'undefined') return 'other'

  const ua = window.navigator.userAgent.toLowerCase()
  const isIOS = /iphone|ipad|ipod/.test(ua)
  // Détection iPad récent qui se déclare comme desktop (UA Mac + écran tactile)
  const isIPadDesktop =
    ua.includes('macintosh') && navigator.maxTouchPoints > 1

  if (isIOS || isIPadDesktop) {
    // On vérifie qu'on est dans Safari et pas dans Chrome iOS / Firefox iOS / app in-app
    // (sur iOS, seul Safari peut installer une PWA)
    const isSafari =
      /safari/.test(ua) && !/crios|fxios|edgios|fbav|instagram|line/.test(ua)
    return isSafari ? 'ios' : 'other'
  }

  const isAndroid = /android/.test(ua)
  if (isAndroid) {
    // Sur Android, Chrome et Edge supportent beforeinstallprompt
    const isChromeOrEdge = /chrome|edg/.test(ua) && !/samsungbrowser/.test(ua)
    return isChromeOrEdge ? 'android' : 'other'
  }

  return 'desktop'
}

/**
 * Détecte si l'app est déjà installée (lancée en mode PWA standalone).
 *
 * - sur iOS : `navigator.standalone === true`
 * - sur Android / desktop Chrome : `matchMedia('(display-mode: standalone)')`
 */
function detectInstalled() {
  if (typeof window === 'undefined') return false

  // iOS Safari
  if (window.navigator.standalone === true) return true

  // Chrome / Edge / autres
  if (window.matchMedia('(display-mode: standalone)').matches) return true

  return false
}

/**
 * Vérifie si l'utilisateur a cliqué "Plus tard" il y a moins de 7 jours.
 */
function isDismissedRecently() {
  try {
    const dismissedAt = localStorage.getItem(STORAGE_KEY)
    if (!dismissedAt) return false

    const elapsed = Date.now() - Number(dismissedAt)
    return elapsed < DISMISS_DURATION_MS
  } catch {
    // localStorage indisponible (mode privé, etc.) — on traite comme "pas dismissé"
    return false
  }
}

/**
 * Hook principal d'installation PWA.
 *
 * Retourne :
 * - `platform` : 'ios' | 'android' | 'desktop' | 'other'
 * - `isInstalled` : bool
 * - `canShowPrompt` : bool — true si on doit afficher la modale (= mobile + pas installé + pas dismissé récemment)
 * - `triggerInstall()` : déclenche l'install natif (Android uniquement, no-op ailleurs)
 * - `dismiss()` : enregistre "Plus tard" en localStorage (cache la modale pour 7 jours)
 */
export default function useInstallPrompt() {
  const [platform] = useState(() => detectPlatform())
  const [isInstalled, setIsInstalled] = useState(() => detectInstalled())
  const [dismissedRecently, setDismissedRecently] = useState(() =>
    isDismissedRecently()
  )

  // Référence à l'événement Android beforeinstallprompt
  // Stocké dans un state pour pouvoir l'appeler depuis triggerInstall()
  const [deferredPrompt, setDeferredPrompt] = useState(null)

  useEffect(() => {
    // Android Chrome : capter beforeinstallprompt
    // Cet événement est émis quand le navigateur juge la PWA "installable"
    // (manifest valide + service worker + HTTPS + critères d'engagement)
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault() // empêche Chrome d'afficher son mini-banner natif
      setDeferredPrompt(e)
    }

    // Événement émis quand l'app vient d'être installée (toutes plateformes)
    const handleAppInstalled = () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  // Déclenche le prompt d'installation natif (Android uniquement)
  // Sur iOS, c'est un no-op : on ne peut pas déclencher l'install, on affiche juste les instructions
  const triggerInstall = async () => {
    if (!deferredPrompt) return { outcome: 'unavailable' }

    deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    setDeferredPrompt(null)

    if (choice.outcome === 'accepted') {
      setIsInstalled(true)
    }
    return choice
  }

  // L'utilisateur clique "Plus tard" : on enregistre l'horodatage en localStorage
  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()))
      setDismissedRecently(true)
    } catch {
      // localStorage indisponible — on cache au moins pendant la session
      setDismissedRecently(true)
    }
  }

  // Conditions pour afficher la modale au login
  // - on est sur mobile (iOS ou Android)
  // - l'app n'est pas déjà installée
  // - l'utilisateur n'a pas dit "Plus tard" récemment
  // - sur Android : on peut afficher même sans deferredPrompt (on montre quand même les infos)
  const canShowPrompt =
    (platform === 'ios' || platform === 'android') &&
    !isInstalled &&
    !dismissedRecently

  return {
    platform,
    isInstalled,
    canShowPrompt,
    deferredPrompt, // exposé pour savoir si l'install native est disponible
    triggerInstall,
    dismiss,
  }
}
