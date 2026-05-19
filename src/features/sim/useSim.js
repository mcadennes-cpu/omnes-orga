import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'

// ─── Normalisation pour recherche : minuscules + sans accents ──────────────
export function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// ─── Mapping couleur DB -> hex de la palette Omnes ─────────────────────────
// Identique a useCabinet.js (meme set de 6 couleurs symboliques).
const COULEUR_TO_HEX = {
  bleu:   '#2A8FA8', // canard
  gris:   '#1C3D52', // marine (defaut)
  jaune:  '#E8A135', // ocre
  orange: '#D94F7E', // fuchsia
  rouge:  '#D4503A', // brique
  vert:   '#6B7A3A', // olive
}

export function couleurToHex(couleur) {
  return COULEUR_TO_HEX[couleur] || COULEUR_TO_HEX.gris
}

export const COULEURS = [
  { key: 'bleu',   label: 'Bleu',   hex: '#2A8FA8' },
  { key: 'gris',   label: 'Gris',   hex: '#1C3D52' },
  { key: 'jaune',  label: 'Jaune',  hex: '#E8A135' },
  { key: 'orange', label: 'Orange', hex: '#D94F7E' },
  { key: 'rouge',  label: 'Rouge',  hex: '#D4503A' },
  { key: 'vert',   label: 'Vert',   hex: '#6B7A3A' },
]

// ─── Format relatif francais court ─────────────────────────────────────────
export function formatRelative(isoDate) {
  if (!isoDate) return ''
  const date = new Date(isoDate)
  const diffMs = Date.now() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays <= 0) return "aujourd'hui"
  if (diffDays === 1) return 'hier'
  if (diffDays < 7) return `il y a ${diffDays} j`
  if (diffDays < 30) {
    const w = Math.floor(diffDays / 7)
    return `il y a ${w} sem.`
  }
  if (diffDays < 365) {
    const m = Math.floor(diffDays / 30)
    return `il y a ${m} mois`
  }
  const y = Math.floor(diffDays / 365)
  return `il y a ${y} ${y > 1 ? 'ans' : 'an'}`
}

function authorName(auteur) {
  if (!auteur) return ''
  return [auteur.prenom, auteur.nom].filter(Boolean).join(' ')
}

// ─── Mapping shape DB -> shape UI ──────────────────────────────────────────
// On conserve auteurId : les helpers canEditSim / canDeleteSim en ont besoin
// pour la logique "auteur" (different de Cabinet pratique, droits par role pur).
function toFolderRow(d) {
  return {
    id: d.id,
    name: d.nom,
    couleur: d.couleur,
    accent: couleurToHex(d.couleur),
    auteurId: d.auteur_id,
  }
}

function toFileRow(f) {
  return {
    id: f.id,
    name: f.nom,
    author: authorName(f.auteur),
    when: formatRelative(f.created_at),
    mimeType: f.mime_type,
    tailleOctets: f.taille_octets,
    auteurId: f.auteur_id,
  }
}

// ─── Hook racine : dossiers + fichiers ou parent_id/dossier_id IS NULL ─────
export function useSimRoot() {
  const { user, loading: authLoading } = useAuth()
  const [folders, setFolders] = useState([])
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const refetch = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let active = true

    if (authLoading) { setLoading(true); return }
    if (!user) {
      setFolders([]); setFiles([]); setLoading(false); setError(null)
      return
    }

    setLoading(true); setError(null)

    Promise.all([
      supabase
        .from('sim_dossiers')
        .select('id, nom, couleur, auteur_id')
        .is('parent_id', null)
        .order('nom', { ascending: true }),
      supabase
        .from('sim_fichiers')
        .select('id, nom, mime_type, taille_octets, created_at, auteur_id, auteur:auteur_id(prenom, nom)')
        .is('dossier_id', null)
        .order('nom', { ascending: true }),
    ]).then(([foldersRes, filesRes]) => {
      if (!active) return
      if (foldersRes.error) { setError(foldersRes.error); setLoading(false); return }
      if (filesRes.error)   { setError(filesRes.error);   setLoading(false); return }
      setFolders((foldersRes.data ?? []).map(toFolderRow))
      setFiles((filesRes.data ?? []).map(toFileRow))
      setLoading(false)
    })

    return () => { active = false }
  }, [user, authLoading, reloadKey])

  return { folders, files, loading, error, refetch }
}

// ─── Hook sous-dossier : le dossier + ses enfants ──────────────────────────
export function useSimFolder(id) {
  const { user, loading: authLoading } = useAuth()
  const [folder, setFolder] = useState(null)
  const [folders, setFolders] = useState([])
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const refetch = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let active = true

    if (authLoading) { setLoading(true); return }
    if (!user) {
      setFolder(null); setFolders([]); setFiles([])
      setLoading(false); setError(null); setNotFound(false)
      return
    }
    if (!id) {
      setFolder(null); setFolders([]); setFiles([])
      setLoading(false); setError(null); setNotFound(true)
      return
    }

    setLoading(true); setError(null); setNotFound(false)

    async function load() {
      try {
        const folderRes = await supabase
          .from('sim_dossiers')
          .select('id, nom, couleur, auteur_id')
          .eq('id', id)
          .maybeSingle()

        if (folderRes.error) throw folderRes.error
        if (!folderRes.data) {
          if (!active) return
          setNotFound(true); setLoading(false)
          return
        }

        const [childFoldersRes, childFilesRes] = await Promise.all([
          supabase
            .from('sim_dossiers')
            .select('id, nom, couleur, auteur_id')
            .eq('parent_id', id)
            .order('nom', { ascending: true }),
          supabase
            .from('sim_fichiers')
            .select('id, nom, mime_type, taille_octets, created_at, auteur_id, auteur:auteur_id(prenom, nom)')
            .eq('dossier_id', id)
            .order('nom', { ascending: true }),
        ])

        if (childFoldersRes.error) throw childFoldersRes.error
        if (childFilesRes.error)   throw childFilesRes.error

        if (!active) return

        setFolder({
          id: folderRes.data.id,
          name: folderRes.data.nom,
          couleur: folderRes.data.couleur,
          accent: couleurToHex(folderRes.data.couleur),
          auteurId: folderRes.data.auteur_id,
        })
        setFolders((childFoldersRes.data ?? []).map(toFolderRow))
        setFiles((childFilesRes.data ?? []).map(toFileRow))
        setLoading(false)
      } catch (e) {
        if (!active) return
        setError(e); setFolder(null); setFolders([]); setFiles([])
        setLoading(false)
      }
    }

    load()
    return () => { active = false }
  }, [user, authLoading, id, reloadKey])

  return { folder, folders, files, loading, error, notFound, refetch }
}

// ─── Hook recherche scopee au dossier courant ──────────────────────────────
// Conformement a l'arbitrage de l'etape 9 : recherche SCOPEE au dossier affiche
// (et non globale comme Cabinet pratique). Le filtrage se fait en memoire sur
// les listes deja chargees par useSimRoot / useSimFolder — pas de requete
// supplementaire. Ce "hook" est donc un simple helper de filtrage.
export function filterByTerm(items, term) {
  const norm = normalize((term || '').trim())
  if (!norm) return items
  return items.filter((it) => normalize(it.name).includes(norm))
}
