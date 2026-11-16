// src/features/signatures/DemandeFormModal.jsx
// Creation (ou modification) d'un brouillon : titre, nature, description,
// ordre de signature.

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import Feuille, {
  CLASSE_BOUTON_PRIMAIRE,
  CLASSE_BOUTON_SECONDAIRE,
  CLASSE_CHAMP,
  CLASSE_LABEL,
} from './Feuille'
import { TYPES } from './signaturesLabels'

const TITRE_MAX = 200

function Interrupteur({ checked, onChange, titre, aide }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-3 text-left"
    >
      <span>
        <span className="block text-marine text-sm font-semibold">{titre}</span>
        <span className="block text-faint text-[12px] mt-0.5">{aide}</span>
      </span>
      <span className={`shrink-0 w-11 h-6 rounded-full p-0.5 transition-colors ${checked ? 'bg-marine' : 'bg-marine/15'}`}>
        <span
          className={`block w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </span>
    </button>
  )
}

// Le contenu n'est monte qu'a l'ouverture : son etat repart ainsi de zero a
// chaque fois, sans reinitialisation dans un effet.
export default function DemandeFormModal(props) {
  if (!props.open) return null
  return <DemandeFormModalContenu {...props} />
}

function DemandeFormModalContenu({ open, onClose, initial = null, onSubmit }) {
  const [titre, setTitre] = useState(initial?.titre ?? '')
  const [type, setType] = useState(initial?.type ?? 'avenant')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [ordreImpose, setOrdreImpose] = useState(Boolean(initial?.ordre_impose))
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState(null)

  const possible = titre.trim().length > 0 && !occupe

  async function valider() {
    if (!possible) return
    setOccupe(true)
    setErreur(null)
    try {
      await onSubmit({
        titre: titre.trim(),
        type,
        description: description.trim() || null,
        ordre_impose: ordreImpose,
      })
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
      titre={initial ? 'Modifier la demande' : 'Nouvelle demande de signature'}
      pied={
        <>
          <button type="button" onClick={onClose} disabled={occupe} className={CLASSE_BOUTON_SECONDAIRE}>
            Annuler
          </button>
          <button type="button" onClick={valider} disabled={!possible} className={CLASSE_BOUTON_PRIMAIRE}>
            {occupe && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.2} />}
            {initial ? 'Enregistrer' : 'Créer le brouillon'}
          </button>
        </>
      }
    >
      <div>
        <label className={CLASSE_LABEL}>
          Titre <span className="text-brique">*</span>
        </label>
        <input
          type="text"
          value={titre}
          onChange={(e) => setTitre(e.target.value.slice(0, TITRE_MAX))}
          placeholder="Ex. Avenant n°3 au contrat d'exercice en commun"
          className={CLASSE_CHAMP}
        />
      </div>

      <div>
        <label className={CLASSE_LABEL}>Nature du document</label>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setType(t.key)}
              className={`px-3 h-9 rounded-pill text-sm font-semibold transition-colors ${
                type === t.key ? 'bg-marine text-white' : 'bg-fond border border-border text-muted'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={CLASSE_LABEL}>
          Message aux signataires <span className="text-faint normal-case font-normal">(optionnel)</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
          rows={3}
          placeholder="Contexte, points à vérifier…"
          className={`${CLASSE_CHAMP} resize-none`}
        />
      </div>

      <Interrupteur
        checked={ordreImpose}
        onChange={setOrdreImpose}
        titre="Imposer l'ordre de signature"
        aide="Sinon, tous les signataires peuvent signer en même temps."
      />

      <p className="text-faint text-[12px]">
        Le brouillon n'est visible que par vous. Vous déposerez ensuite le PDF et choisirez les
        signataires avant l'envoi.
      </p>

      {erreur && <div className="px-3 py-2 rounded-input bg-brique/10 text-brique text-sm">{erreur}</div>}
    </Feuille>
  )
}
