// src/features/signatures/SignerSheet.jsx
//
// Signature en deux temps :
//   1. lire le texte de consentement (fourni par le serveur, qui en garde la
//      version) et cocher la case, puis recevoir un code par e-mail ;
//   2. saisir le code a 6 chiffres -> l'Edge Function verifie le code,
//      recalcule l'empreinte du PDF et enregistre la signature.

import { useEffect, useState } from 'react'
import { Loader2, MailCheck } from 'lucide-react'
import Feuille, { CLASSE_BOUTON_PRIMAIRE, CLASSE_BOUTON_SECONDAIRE } from './Feuille'
import { codeEnCours, memoriserCodeEnvoye, oublierCode } from './signaturesApi'

// Le contenu n'est monte qu'a l'ouverture : son etat repart ainsi de zero a
// chaque fois, sans reinitialisation dans un effet.
export default function SignerSheet(props) {
  if (!props.open) return null
  return <SignerSheetContenu {...props} />
}

function SignerSheetContenu({ open, onClose, demandeId, agir, onSigne }) {
  // Code deja envoye il y a moins de 10 min (page rechargee au retour de
  // Mail) : on reprend directement a la saisie du code.
  const [enCours] = useState(() => codeEnCours(demandeId))
  const [etape, setEtape] = useState(enCours ? 'code' : 'consentement') // 'consentement' | 'code'
  const [texte, setTexte] = useState('')
  const [version, setVersion] = useState(null)
  const [coche, setCoche] = useState(Boolean(enCours))
  const [email, setEmail] = useState(enCours?.email ?? '')
  const [code, setCode] = useState('')
  const [occupe, setOccupe] = useState(true) // chargement du texte de consentement
  const [erreur, setErreur] = useState(null)

  useEffect(() => {
    agir('consentement')
      .then((r) => {
        setTexte(r.texte)
        setVersion(r.version)
      })
      .catch((e) => setErreur(e.message))
      .finally(() => setOccupe(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function demanderCode() {
    setOccupe(true)
    setErreur(null)
    try {
      const r = await agir('demander_code')
      setEmail(r.email)
      memoriserCodeEnvoye(demandeId, r.email)
      setEtape('code')
      setCode('')
    } catch (e) {
      setErreur(e.message)
    } finally {
      setOccupe(false)
    }
  }

  async function signer() {
    setOccupe(true)
    setErreur(null)
    try {
      const r = await agir('signer', { code, consentement: coche, consentementVersion: version })
      oublierCode(demandeId)
      onClose()
      onSigne?.(r)
    } catch (e) {
      setErreur(e.message)
      setOccupe(false)
    }
  }

  const codeComplet = /^\d{6}$/.test(code)

  function fermer() {
    oublierCode(demandeId)
    onClose()
  }

  return (
    <Feuille
      open={open}
      onClose={fermer}
      occupe={occupe}
      titre="Signer le document"
      pied={
        etape === 'consentement' ? (
          <>
            <button type="button" onClick={fermer} disabled={occupe} className={CLASSE_BOUTON_SECONDAIRE}>
              Annuler
            </button>
            <button
              type="button"
              onClick={demanderCode}
              disabled={!coche || !version || occupe}
              className={CLASSE_BOUTON_PRIMAIRE}
            >
              {occupe && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.2} />}
              Recevoir mon code
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={demanderCode} disabled={occupe} className={CLASSE_BOUTON_SECONDAIRE}>
              Nouveau code
            </button>
            <button type="button" onClick={signer} disabled={!codeComplet || occupe} className={CLASSE_BOUTON_PRIMAIRE}>
              {occupe && <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.2} />}
              Signer
            </button>
          </>
        )
      }
    >
      {etape === 'consentement' ? (
        <>
          <div className="rounded-input bg-fond border border-border p-3">
            {texte ? (
              <p className="text-marine text-sm leading-relaxed break-words">{texte}</p>
            ) : (
              <div className="py-4 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-faint" />
              </div>
            )}
          </div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={coche}
              onChange={(e) => setCoche(e.target.checked)}
              disabled={!texte}
              className="mt-0.5 w-5 h-5 rounded accent-marine shrink-0"
            />
            <span className="text-marine text-sm font-semibold">
              J'ai lu le document et j'accepte de le signer électroniquement.
            </span>
          </label>
          <p className="text-faint text-[12px]">
            Un code à usage unique, valable 10 minutes, va vous être envoyé par e-mail pour confirmer
            votre identité.
          </p>
        </>
      ) : (
        <>
          <div className="flex items-start gap-3 rounded-input bg-olive/10 p-3">
            <MailCheck className="w-5 h-5 text-olive shrink-0 mt-0.5" strokeWidth={1.8} />
            <p className="text-marine text-sm">
              Code envoyé à <span className="font-semibold">{email}</span>. Il est valable 10 minutes.
            </p>
          </div>
          <div>
            <label htmlFor="code-signature" className="block text-muted text-xs uppercase tracking-wider font-semibold mb-2">
              Code reçu par e-mail
            </label>
            <input
              id="code-signature"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              className="w-full h-14 rounded-input bg-fond border border-border text-marine text-2xl font-bold tracking-[0.5em] text-center placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-canard/30"
              autoFocus
            />
          </div>
          <p className="text-faint text-[12px]">
            Astuce : le code figure aussi dans l'objet du mail, lisible dans la notification sans quitter
            cette page. Pas reçu ? Vérifiez vos courriers indésirables, puis demandez un nouveau code.
          </p>
        </>
      )}

      {erreur && <div className="px-3 py-2 rounded-input bg-brique/10 text-brique text-sm">{erreur}</div>}
    </Feuille>
  )
}
