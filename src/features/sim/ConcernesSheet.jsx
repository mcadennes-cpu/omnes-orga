// src/features/sim/ConcernesSheet.jsx
//
// Etape 25 : « Personnes concernées » d'un fichier du module Contrats.
// Une personne concernee voit ce fichier dans « Mes contrats », meme si elle
// n'est pas membre SIM (contrat d'exercice, contrat de remplacement...).
// Reserve au super_admin (policies sim_concernes_ajout / _retrait, 25A-2).
//
// Liste : les quatre roles medecins, comptes actifs d'abord ; les inactifs
// restent proposes (rattacher un ancien contrat), signales comme tels.

import { useEffect, useMemo, useState } from 'react'
import { Check, Loader2, Search } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { ROLE_LABELS } from '../../lib/modules'
import { formatName, normalizeForSearch } from '../../lib/profileFormat'
import Avatar from '../../components/common/Avatar'
import Feuille, {
  CLASSE_BOUTON_PRIMAIRE,
  CLASSE_BOUTON_SECONDAIRE,
  CLASSE_CHAMP,
} from '../signatures/Feuille'

const ROLES_MEDECINS = ['super_admin', 'associe_gerant', 'associe', 'remplacant']

// Contenu monte a l'ouverture seulement : etat remis a zero sans effet.
export default function ConcernesSheet(props) {
  if (!props.open) return null
  return <ConcernesSheetContenu {...props} />
}

function ConcernesSheetContenu({ open, onClose, fichier, onSaved }) {
  const [profils, setProfils] = useState([])
  const [initiaux, setInitiaux] = useState([])
  const [choix, setChoix] = useState([])
  const [chargement, setChargement] = useState(true)
  const [recherche, setRecherche] = useState('')
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState(null)

  useEffect(() => {
    let vivant = true
    Promise.all([
      supabase
        .from('profiles')
        .select('id, prenom, nom, role, actif, photo_url, updated_at')
        .in('role', ROLES_MEDECINS)
        .order('nom'),
      supabase.from('sim_fichiers_concernes').select('profil_id').eq('fichier_id', fichier.id),
    ]).then(([p, c]) => {
      if (!vivant) return
      if (p.error || c.error) {
        setErreur('Impossible de charger la liste.')
        setChargement(false)
        return
      }
      const deja = (c.data ?? []).map((x) => x.profil_id)
      setProfils(p.data ?? [])
      setInitiaux(deja)
      setChoix(deja)
      setChargement(false)
    })
    return () => { vivant = false }
  }, [fichier.id])

  const liste = useMemo(() => {
    const q = normalizeForSearch(recherche).trim()
    return profils
      .filter((p) => !q || normalizeForSearch(formatName(p)).includes(q))
      // Concernes d'abord, puis comptes actifs, puis inactifs.
      .sort((a, b) => {
        const rang = (p) => (choix.includes(p.id) ? 0 : p.actif ? 1 : 2)
        return rang(a) - rang(b)
      })
  }, [profils, recherche, choix])

  const ajouts = choix.filter((id) => !initiaux.includes(id))
  const retraits = initiaux.filter((id) => !choix.includes(id))
  const modifie = ajouts.length > 0 || retraits.length > 0

  function basculer(id) {
    setChoix((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))
  }

  async function valider() {
    if (!modifie) return
    setOccupe(true)
    setErreur(null)
    try {
      if (ajouts.length) {
        const { error } = await supabase
          .from('sim_fichiers_concernes')
          .insert(ajouts.map((profil_id) => ({ fichier_id: fichier.id, profil_id })))
        if (error) throw error
      }
      if (retraits.length) {
        const { error } = await supabase
          .from('sim_fichiers_concernes')
          .delete()
          .eq('fichier_id', fichier.id)
          .in('profil_id', retraits)
        if (error) throw error
      }
      onSaved?.()
      onClose()
    } catch (e) {
      console.error('Personnes concernees', e)
      setErreur("L'enregistrement a échoué. Réessayez.")
      setOccupe(false)
    }
  }

  return (
    <Feuille
      open={open}
      onClose={onClose}
      occupe={occupe}
      titre="Personnes concernées"
      pied={
        <>
          <button type="button" onClick={onClose} disabled={occupe} className={CLASSE_BOUTON_SECONDAIRE}>
            Annuler
          </button>
          <button type="button" onClick={valider} disabled={!modifie || occupe} className={CLASSE_BOUTON_PRIMAIRE}>
            {occupe && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.2} />}
            Enregistrer
          </button>
        </>
      }
    >
      <p className="text-muted text-sm -mt-1">
        <span className="font-semibold text-marine break-words">{fichier.name}</span>
        <br />
        Les personnes cochées retrouvent ce document dans « Mes contrats », sans voir le reste des
        dossiers.
      </p>

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

      {chargement ? (
        <div className="py-8 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-faint" />
        </div>
      ) : liste.length === 0 ? (
        <p className="py-6 text-center text-muted text-sm">Aucun médecin trouvé.</p>
      ) : (
        <ul className="-mx-1">
          {liste.map((p) => {
            const choisi = choix.includes(p.id)
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => basculer(p.id)}
                  className={`w-full flex items-center gap-3 px-1 py-2 rounded-input text-left transition-colors ${
                    choisi ? 'bg-olive/10' : 'active:bg-fond'
                  }`}
                >
                  <Avatar profile={p} size={40} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-marine text-[15px] font-semibold truncate">{formatName(p)}</span>
                    <span className="block text-muted text-[12px]">
                      {ROLE_LABELS[p.role]}
                      {!p.actif && ' · compte désactivé'}
                    </span>
                  </span>
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center ${
                      choisi ? 'bg-olive text-white' : 'border border-border text-transparent'
                    }`}
                  >
                    <Check className="w-4 h-4" strokeWidth={2.4} />
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
