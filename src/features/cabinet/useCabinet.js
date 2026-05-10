import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'

// ─── Normalisation pour recherche : minuscules + sans accents ──────────────
export function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// ─── Mapping couleur DB -> hex de la palette Omnes ─────────────────────────
const COULEUR_TO_HEX = {
  bleu:   '#2A8FA8', // canard
  gris:   '#1C3D52', // marine (defaut)
  jaune:  '#E8A135', // ocre
  orange: '#D94F7E', // fuchsia (a confirmer avec Mat)
  rouge:  '#D4503A', // brique
  vert:   '#6B7A3A', // olive
}

export function couleurToHex(couleur) {
  return COULEUR_TO_HEX[couleur] || COULEUR_TO_HEX.gris
}

// Liste ordonnee des couleurs pour les pickers UI (label + hex resolue depuis la palette).
export const COULEURS = [
  { key: 'bleu',   label: 'Bleu',   hex: '#2A8FA8' },
  { key: 'gris',   label: 'Gris',   hex: '#1C3D52' },
  { key: 'jaune',  label: 'Jaune',  hex: '#E8A135' },
  { key: 'orange', label: 'Orange', hex: '#D94F7E' },
  { key: 'rouge',  label: 'Rouge',  hex: '#D4503A' },
  { key: 'vert',   label: 'Vert',   hex: '#6B7A3A' },
]

// ─── Format relatif francais court ─────────────────────────────────────────
// "aujourd'hui", "hier", "il y a 3 j", "il y a 2 sem.", "il y a 5 mois", "il y a 2 ans"
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
function toFolderRow(d) {
  return {
    id: d.id,
    name: d.nom,
    accent: couleurToHex(d.couleur),
    count: 0, // non affiche en racine (compact); pour les sous-dossiers, a calculer plus tard
  }
}

function toFileRow(f) {
  return {
    id: f.id,
    name: f.nom,
    author: authorName(f.auteur),
    when: formatRelative(f.created_at),
    mimeType: f.mime_type,
  }
}

// ─── Hook racine : dossiers + fichiers ou parent_id/dossier_id IS NULL ─────
export function useCabinetRoot() {
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
        .from('cabinet_dossiers')
        .select('id, nom, couleur')
        .is('parent_id', null)
        .order('nom', { ascending: true }),
      supabase
        .from('cabinet_fichiers')
        .select('id, nom, mime_type, taille_octets, created_at, auteur:auteur_id(prenom, nom)')
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
export function useCabinetFolder(id) {
  const { user, loading: authLoading } = useAuth()
  const [folder, setFolder] = useState(null) // { id, name, accent }
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
          .from('cabinet_dossiers')
          .select('id, nom, couleur')
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
            .from('cabinet_dossiers')
            .select('id, nom, couleur')
            .eq('parent_id', id)
            .order('nom', { ascending: true }),
          supabase
            .from('cabinet_fichiers')
            .select('id, nom, mime_type, taille_octets, created_at, auteur:auteur_id(prenom, nom)')
            .eq('dossier_id', id)
            .order('nom', { ascending: true }),
        ])

        if (childFoldersRes.error) throw childFoldersRes.error
        if (childFilesRes.error)   throw childFilesRes.error

        if (!active) return

        setFolder({
          id: folderRes.data.id,
          name: folderRes.data.nom,
          accent: couleurToHex(folderRes.data.couleur),
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

// ─── Hook recherche globale dans tout le cabinet ───────────────────────────
// N'effectue les SELECT que quand le terme est non vide ; expose un champ meta
// par resultat ("dans <dossier parent>" ou "a la racine") pour orienter
// l'utilisateur sur l'emplacement de chaque match.
export function useCabinetSearch(term) {
  const { user, loading: authLoading } = useAuth()
  const [allFolders, setAllFolders] = useState([])
  const [allFiles, setAllFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const isActive = (term || '').trim().length > 0

  const refetch = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false

    if (authLoading) return
    if (!user || !isActive) {
      setAllFolders([])
      setAllFiles([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    Promise.all([
      supabase
        .from('cabinet_dossiers')
        .select('id, nom, couleur, parent_id'),
      supabase
        .from('cabinet_fichiers')
        .select('id, nom, mime_type, taille_octets, created_at, dossier_id, auteur:auteur_id(prenom, nom)'),
    ]).then(([fRes, fiRes]) => {
      if (cancelled) return
      if (fRes.error)  { setError(fRes.error);  setLoading(false); return }
      if (fiRes.error) { setError(fiRes.error); setLoading(false); return }
      setAllFolders(fRes.data ?? [])
      setAllFiles(fiRes.data ?? [])
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [user, authLoading, isActive, reloadKey])

  // Lookup table pour resoudre le nom du dossier parent
  const folderById = new Map(allFolders.map((d) => [d.id, d]))

  function locationOf(parentId) {
    if (!parentId) return 'à la racine'
    const parent = folderById.get(parentId)
    return parent ? `dans ${parent.nom}` : 'dans un dossier inconnu'
  }

  const norm = normalize(term.trim())

  const folders = isActive
    ? allFolders
        .filter((d) => normalize(d.nom).includes(norm))
        .map((d) => ({
          id: d.id,
          name: d.nom,
          accent: couleurToHex(d.couleur),
          meta: locationOf(d.parent_id),
        }))
    : []

  const files = isActive
    ? allFiles
        .filter((f) => normalize(f.nom).includes(norm))
        .map((f) => ({
          id: f.id,
          name: f.nom,
          mimeType: f.mime_type,
          meta: locationOf(f.dossier_id),
        }))
    : []

  return { folders, files, loading, error, isActive, refetch }
}