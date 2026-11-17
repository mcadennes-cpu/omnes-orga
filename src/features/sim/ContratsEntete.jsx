// src/features/sim/ContratsEntete.jsx
//
// En-tete du module Contrats (etape 25 : fusion SIM + Signatures) : titre,
// retour a l'accueil, filigrane olive, et onglets selon le role.
//
//   super_admin, associe_gerant : Dossiers · Signatures
//   associe                     : Dossiers · Mes contrats · Signatures
//   remplacant                  : Mes contrats · Signatures
//
// Chaque onglet est une route (/sim, /sim/mes-contrats, /sim/signatures) :
// le bouton retour du telephone et les liens des mails restent justes.
// La pastille de l'onglet Signatures vient du meme socle que la tuile de
// l'accueil (get_mon_activite, branche « signatures » de 24F-1).

import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import HeaderWatermark from '../../components/common/HeaderWatermark'
import { useRole } from '../../hooks/useRole'
import { useMonActivite } from '../../hooks/useMonActivite'
import { canVoirDossiersSim, canVoirMesContrats } from '../../lib/permissions'

function ongletsContrats(role) {
  const onglets = []
  if (canVoirDossiersSim(role)) onglets.push({ key: 'dossiers', label: 'Dossiers', to: '/sim' })
  if (canVoirMesContrats(role)) onglets.push({ key: 'mes-contrats', label: 'Mes contrats', to: '/sim/mes-contrats' })
  onglets.push({ key: 'signatures', label: 'Signatures', to: '/sim/signatures' })
  return onglets
}

export default function ContratsEntete({ actif, children }) {
  const navigate = useNavigate()
  const { role } = useRole()
  const { parModule } = useMonActivite()
  const aSigner = parModule.signatures.total
  const onglets = ongletsContrats(role)

  return (
    <header className="sticky top-0 z-10 bg-fond/95 backdrop-blur-sm border-b border-border relative overflow-hidden">
      <div className="relative z-10">
        <div className="flex items-center gap-2 px-4 pt-3 pb-2">
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label="Retour"
            className="h-9 w-9 flex items-center justify-center rounded-full shrink-0"
          >
            <ChevronLeft size={20} strokeWidth={2} className="text-marine" />
          </button>
          <h1 className="flex-1 font-display font-extrabold text-marine text-2xl">Contrats</h1>
        </div>
        <nav aria-label="Sections du module Contrats" className="px-4 pb-3">
          <div className="flex gap-1 p-1 rounded-input bg-carte border border-border">
            {onglets.map((o) => {
              const estActif = o.key === actif
              return (
                <button
                  key={o.key}
                  type="button"
                  aria-current={estActif ? 'page' : undefined}
                  onClick={() => !estActif && navigate(o.to)}
                  className={`flex-1 h-9 rounded-pill text-sm font-semibold transition-colors ${
                    estActif ? 'bg-olive text-white shadow-sm' : 'text-muted'
                  }`}
                >
                  {o.label}
                  {o.key === 'signatures' && aSigner > 0 && (
                    <span
                      className={`ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] ${
                        estActif ? 'bg-white text-olive' : 'bg-brique text-white'
                      }`}
                    >
                      {aSigner}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </nav>
        {children}
      </div>
      <HeaderWatermark color="olive" fill offsetRight={64} />
    </header>
  )
}
