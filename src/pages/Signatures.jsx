import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, Signature } from 'lucide-react'
import AppLayout from '../components/layout/AppLayout'
import HeaderWatermark from '../components/common/HeaderWatermark'
import Pill from '../components/common/Pill'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { useRole } from '../hooks/useRole'
import { canAccessSignatures, canCreateSignature } from '../lib/permissions'
import { useSignatures } from '../features/signatures/useSignatures'
import DemandeFormModal from '../features/signatures/DemandeFormModal'
import {
  COULEUR_MODULE,
  STATUTS_DEMANDE,
  dateCourte,
  libelleType,
} from '../features/signatures/signaturesLabels'

const ONGLETS = [
  { key: 'a_signer', label: 'À signer' },
  { key: 'en_cours', label: 'En cours' },
  { key: 'terminees', label: 'Terminées' },
]

const VIDES = {
  a_signer: 'Aucun document ne vous attend.',
  en_cours: 'Aucune demande en cours.',
  terminees: 'Aucune demande terminée.',
}

function DemandeTile({ demande, onClick }) {
  const statut = STATUTS_DEMANDE[demande.statut]
  const total = demande.signataires.length
  const date =
    demande.statut === 'terminee'
      ? `Signé le ${dateCourte(demande.terminee_at)}`
      : demande.statut === 'annulee'
        ? `Annulée le ${dateCourte(demande.annulee_at)}`
        : demande.statut === 'en_cours'
          ? `Envoyée le ${dateCourte(demande.envoyee_at)}`
          : `Créée le ${dateCourte(demande.created_at)}`
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-carte rounded-card shadow-card p-4 flex items-center gap-3 active:opacity-90 transition-opacity"
    >
      <div className="w-11 h-11 rounded-pill bg-marine/10 flex items-center justify-center shrink-0">
        <Signature className="w-5 h-5 text-marine" strokeWidth={1.8} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-muted text-[12px] font-semibold">{libelleType(demande.type)}</p>
        <h3 className="text-marine font-semibold text-[15px] leading-snug truncate">{demande.titre}</h3>
        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
          {demande.aSigner ? (
            <Pill color="brique" size="sm">À signer</Pill>
          ) : (
            <Pill color={statut.color} size="sm">{statut.label}</Pill>
          )}
          {total > 0 && demande.statut !== 'brouillon' && (
            <span className="text-muted text-[12px]">
              {demande.nbSignes}/{total} signature{total > 1 ? 's' : ''}
            </span>
          )}
          <span className="text-faint text-[12px]">{date}</span>
        </div>
      </div>
      <ChevronRight className="w-5 h-5 text-faint shrink-0" strokeWidth={1.8} />
    </button>
  )
}

function Squelette() {
  return (
    <div className="space-y-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-carte rounded-card shadow-card p-4 flex gap-3 items-center animate-pulse">
          <div className="w-11 h-11 rounded-pill bg-border shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-2.5 bg-border/60 rounded-full w-1/4" />
            <div className="h-3.5 bg-border rounded-full w-2/3" />
            <div className="h-2.5 bg-border/60 rounded-full w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Signatures() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { role, loading: roleLoading } = useRole()
  const { parOnglet, loading, error } = useSignatures()
  const [onglet, setOnglet] = useState(null)
  const [creation, setCreation] = useState(false)

  if (!roleLoading && !canAccessSignatures(role)) return <Navigate to="/" replace />

  // Onglet d'ouverture : « À signer » s'il y a quelque chose a signer.
  const ongletActif = onglet ?? (parOnglet.a_signer.length ? 'a_signer' : 'en_cours')
  const liste = parOnglet[ongletActif]

  async function creer(valeurs) {
    const { data, error: err } = await supabase
      .from('signature_demandes')
      .insert({ ...valeurs, createur_id: user.id })
      .select('id')
      .single()
    if (err) throw new Error("La demande n'a pas pu être créée.")
    navigate(`/signatures/${data.id}`)
  }

  return (
    <AppLayout>
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 bg-fond/95 backdrop-blur-sm border-b border-border relative overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 relative z-10">
            <button
              type="button"
              onClick={() => navigate('/')}
              aria-label="Retour"
              className="h-9 w-9 flex items-center justify-center rounded-full shrink-0"
            >
              <ChevronLeft size={20} strokeWidth={2} className="text-marine" />
            </button>
            <h1 className="flex-1 font-display font-extrabold text-marine text-2xl">Signatures</h1>
          </div>
          <HeaderWatermark color={COULEUR_MODULE} fill offsetRight={64} />
        </header>

        <div className="px-4 pt-3 space-y-3">
          <div className="flex gap-1 p-1 rounded-input bg-carte border border-border">
            {ONGLETS.map((o) => {
              const actif = ongletActif === o.key
              const n = parOnglet[o.key].length
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setOnglet(o.key)}
                  className={`flex-1 h-10 rounded-pill text-sm font-semibold transition-colors ${
                    actif ? 'bg-marine text-white shadow-sm' : 'text-muted'
                  }`}
                >
                  {o.label}
                  {o.key === 'a_signer' && n > 0 && (
                    <span
                      className={`ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] ${
                        actif ? 'bg-white text-marine' : 'bg-brique text-white'
                      }`}
                    >
                      {n}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {canCreateSignature(role) && (
            <button
              type="button"
              onClick={() => setCreation(true)}
              className="w-full h-12 rounded-input bg-marine text-white font-semibold shadow-button flex items-center justify-center gap-2 active:opacity-90 transition-opacity"
            >
              <Plus className="w-5 h-5" strokeWidth={2.2} />
              Nouvelle demande
            </button>
          )}
        </div>

        <div className="flex-1 px-4 py-4">
          {error ? (
            <div className="py-8 text-center">
              <p className="text-muted text-sm mb-2">Impossible de charger les signatures.</p>
              <p className="text-faint text-xs">{error.message}</p>
            </div>
          ) : loading ? (
            <Squelette />
          ) : liste.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-16 h-16 rounded-full bg-marine/5 flex items-center justify-center mb-4">
                <Signature className="w-7 h-7 text-faint" strokeWidth={1.8} />
              </div>
              <p className="text-muted text-sm">{VIDES[ongletActif]}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {liste.map((d) => (
                <DemandeTile key={d.id} demande={d} onClick={() => navigate(`/signatures/${d.id}`)} />
              ))}
            </div>
          )}
        </div>
      </div>

      <DemandeFormModal open={creation} onClose={() => setCreation(false)} onSubmit={creer} />
    </AppLayout>
  )
}
