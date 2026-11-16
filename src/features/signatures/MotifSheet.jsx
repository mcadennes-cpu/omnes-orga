// src/features/signatures/MotifSheet.jsx
// Saisie d'un motif obligatoire : refus de signer, ou annulation d'une
// demande. Le motif est inscrit au journal (et sur le certificat).

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import Feuille, { CLASSE_BOUTON_DANGER, CLASSE_BOUTON_SECONDAIRE, CLASSE_CHAMP, CLASSE_LABEL } from './Feuille'

// Le contenu n'est monte qu'a l'ouverture : son etat repart ainsi de zero a
// chaque fois, sans reinitialisation dans un effet.
export default function MotifSheet(props) {
  if (!props.open) return null
  return <MotifSheetContenu {...props} />
}

function MotifSheetContenu({ open, onClose, titre, explication, libelleAction, onSubmit }) {
  const [motif, setMotif] = useState('')
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState(null)

  const possible = motif.trim().length >= 3 && !occupe

  async function valider() {
    if (!possible) return
    setOccupe(true)
    setErreur(null)
    try {
      await onSubmit(motif.trim())
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
      titre={titre}
      pied={
        <>
          <button type="button" onClick={onClose} disabled={occupe} className={CLASSE_BOUTON_SECONDAIRE}>
            Retour
          </button>
          <button type="button" onClick={valider} disabled={!possible} className={CLASSE_BOUTON_DANGER}>
            {occupe && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.2} />}
            {libelleAction}
          </button>
        </>
      }
    >
      <p className="text-marine text-sm">{explication}</p>
      <div>
        <label className={CLASSE_LABEL}>
          Motif <span className="text-brique">*</span>
        </label>
        <textarea
          value={motif}
          onChange={(e) => setMotif(e.target.value.slice(0, 1000))}
          rows={3}
          className={`${CLASSE_CHAMP} resize-none`}
          autoFocus
        />
      </div>
      {erreur && <div className="px-3 py-2 rounded-input bg-brique/10 text-brique text-sm">{erreur}</div>}
    </Feuille>
  )
}
