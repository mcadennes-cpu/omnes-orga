// src/features/signatures/SignatairesSheet.jsx
// Choix des signataires d'un brouillon : comptes actifs des quatre roles
// medecins (meme liste blanche que la base, 24A-1 : poste_bureau exclu).

import { useEffect, useMemo, useState } from 'react'
import { Check, Loader2, Search } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { ROLE_LABELS } from '../../lib/modules'
import { formatName, normalizeForSearch } from '../../lib/profileFormat'
import Avatar from '../../components/common/Avatar'
import Feuille, { CLASSE_BOUTON_PRIMAIRE, CLASSE_BOUTON_SECONDAIRE, CLASSE_CHAMP } from './Feuille'

const ROLES_SIGNATAIRES = ['super_admin', 'associe_gerant', 'associe', 'remplacant']

// Le contenu n'est monte qu'a l'ouverture : son etat repart ainsi de zero a
// chaque fois, sans reinitialisation dans un effet.
export default function SignatairesSheet(props) {
  if (!props.open) return null
  return <SignatairesSheetContenu {...props} />
}

function SignatairesSheetContenu({ open, onClose, dejaPresents = [], onSubmit }) {
  const [profils, setProfils] = useState([])
  const [chargement, setChargement] = useState(true)
  const [recherche, setRecherche] = useState('')
  const [choix, setChoix] = useState([])
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState(null)

  useEffect(() => {
    let actif = true
    supabase
      .from('profiles')
      .select('id, prenom, nom, role, photo_url, updated_at')
      .eq('actif', true)
      .in('role', ROLES_SIGNATAIRES)
      .order('nom')
      .then(({ data }) => {
        if (!actif) return
        setProfils(data ?? [])
        setChargement(false)
      })
    return () => {
      actif = false
    }
  }, [])

  const liste = useMemo(() => {
    const q = normalizeForSearch(recherche).trim()
    return profils
      .filter((p) => !dejaPresents.includes(p.id))
      .filter((p) => !q || normalizeForSearch(formatName(p)).includes(q))
  }, [profils, dejaPresents, recherche])

  function basculer(id) {
    // L'ordre de selection devient l'ordre de signature.
    setChoix((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))
  }

  async function valider() {
    if (!choix.length) return
    setOccupe(true)
    setErreur(null)
    try {
      await onSubmit(choix)
      onClose()
    } catch (e) {
      setErreur(e?.message || 'Une erreur est survenue.')
      setOccupe(false)
    }
  }

  return (
    <Feuille
      open={open}
      onClose={onClose}
      occupe={occupe}
      titre="Ajouter des signataires"
      pied={
        <>
          <button type="button" onClick={onClose} disabled={occupe} className={CLASSE_BOUTON_SECONDAIRE}>
            Annuler
          </button>
          <button type="button" onClick={valider} disabled={!choix.length || occupe} className={CLASSE_BOUTON_PRIMAIRE}>
            {occupe && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.2} />}
            Ajouter{choix.length ? ` (${choix.length})` : ''}
          </button>
        </>
      }
    >
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none"
          strokeWidth={1.8}
        />
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un médecin…"
          className={`${CLASSE_CHAMP} pl-9`}
        />
      </div>
      <p className="text-faint text-[12px] -mt-3">
        L'ordre dans lequel vous les choisissez sera l'ordre de signature.
      </p>

      {chargement ? (
        <div className="py-8 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-faint" />
        </div>
      ) : liste.length === 0 ? (
        <p className="py-6 text-center text-muted text-sm">Aucun médecin à ajouter.</p>
      ) : (
        <ul className="-mx-1">
          {liste.map((p) => {
            const rang = choix.indexOf(p.id)
            const choisi = rang >= 0
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => basculer(p.id)}
                  className={`w-full flex items-center gap-3 px-1 py-2 rounded-input text-left transition-colors ${
                    choisi ? 'bg-marine/5' : 'active:bg-fond'
                  }`}
                >
                  <Avatar profile={p} size={40} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-marine text-[15px] font-semibold truncate">{formatName(p)}</span>
                    <span className="block text-muted text-[12px]">{ROLE_LABELS[p.role]}</span>
                  </span>
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold ${
                      choisi ? 'bg-marine text-white' : 'border border-border text-transparent'
                    }`}
                  >
                    {choisi ? rang + 1 : <Check className="w-4 h-4" />}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {erreur && <div className="px-3 py-2 rounded-input bg-brique/10 text-brique text-sm">{erreur}</div>}
    </Feuille>
  )
}
