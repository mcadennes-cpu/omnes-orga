import { Navigate, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import AppLayout from '../components/layout/AppLayout'
import DrivePage from '../features/sim/DrivePage'
import NewFolderModal from '../features/sim/NewFolderModal'
import UploadModal from '../features/sim/UploadModal'
import ContratsEntete from '../features/sim/ContratsEntete'
import { useSimGestes } from '../features/sim/useSimGestes'
import { useSimRoot, filterByTerm } from '../features/sim/useSim'
import { useRole } from '../hooks/useRole'
import { canAccessContrats, canVoirDossiersSim } from '../lib/permissions'

// Module Contrats (ex-SIM), onglet « Dossiers » : racine du Drive.
// Membres SIM : tout le Drive. Associe : les dossiers ouverts aux associes,
// en lecture seule (la RLS ne lui renvoie que ceux-la, 25A-2).
// Remplacant : pas d'onglet Dossiers -> « Mes contrats ».
export default function Sim() {
  const navigate = useNavigate()
  const { role, loading: roleLoading } = useRole()
  const { folders, files, loading: dataLoading, error, refetch } = useSimRoot()
  const gestes = useSimGestes({ role, refetch })
  const [search, setSearch] = useState('')
  const [isNewFolderOpen, setNewFolderOpen] = useState(false)
  const [isUploadOpen, setUploadOpen] = useState(false)

  if (roleLoading || (dataLoading && canVoirDossiersSim(role))) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-fond">
        <p className="text-muted">Chargement…</p>
      </div>
    )
  }

  if (!canAccessContrats(role)) {
    return (
      <AppLayout>
        <div className="px-5 py-12 text-center">
          <p className="text-marine font-semibold mb-1">Accès restreint</p>
          <p className="text-muted text-sm mb-4">Cet espace est réservé aux médecins.</p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-canard text-sm font-semibold underline"
          >
            Retour à l'accueil
          </button>
        </div>
      </AppLayout>
    )
  }

  if (!canVoirDossiersSim(role)) return <Navigate to="/sim/mes-contrats" replace />

  if (error) {
    return (
      <AppLayout>
        <ContratsEntete actif="dossiers" />
        <p className="text-center text-brique py-12 px-5">
          Impossible de charger les dossiers.
        </p>
      </AppLayout>
    )
  }

  const { folders: decoratedFolders, files: decoratedFiles } = gestes.decorer(
    filterByTerm(folders, search),
    filterByTerm(files, search),
  )

  return (
    <AppLayout>
      <DrivePage
        header={<ContratsEntete actif="dossiers" />}
        trail={['Contrats']}
        accent="#6B7A3A"
        folders={decoratedFolders}
        files={decoratedFiles}
        search={search}
        onSearchChange={setSearch}
        isSearching={search.trim().length > 0}
        canWrite={gestes.canWrite}
        compact
        onBack={() => navigate('/')}
        onOpenFolder={(id) => navigate(`/sim/${id}`)}
        onOpenFile={gestes.handleFileOpen}
        onDownloadFile={gestes.handleFileDownload}
        onMenuFolder={(id) => gestes.ouvrirMenuDossier(decoratedFolders.find((x) => x.id === id))}
        onMenuFile={(id) => gestes.ouvrirMenuFichier(decoratedFiles.find((x) => x.id === id))}
        onUpload={() => setUploadOpen(true)}
        onNewFolder={() => setNewFolderOpen(true)}
      />
      {isNewFolderOpen && (
        <NewFolderModal
          parentId={null}
          onClose={() => setNewFolderOpen(false)}
          onCreated={() => { setNewFolderOpen(false); refetch() }}
        />
      )}
      {isUploadOpen && (
        <UploadModal
          dossierId={null}
          dossierName={null}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => { setUploadOpen(false); refetch() }}
        />
      )}
      {gestes.modales}
    </AppLayout>
  )
}
