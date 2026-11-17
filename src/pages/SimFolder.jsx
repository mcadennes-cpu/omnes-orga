import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useState } from 'react'
import AppLayout from '../components/layout/AppLayout'
import DrivePage from '../features/sim/DrivePage'
import NewFolderModal from '../features/sim/NewFolderModal'
import UploadModal from '../features/sim/UploadModal'
import { useSimGestes } from '../features/sim/useSimGestes'
import { useSimFolder, filterByTerm } from '../features/sim/useSim'
import { useRole } from '../hooks/useRole'
import { canAccessContrats, canVoirDossiersSim } from '../lib/permissions'

// Module Contrats : vue d'un dossier du Drive. Un associe n'y arrive que pour
// un dossier ouvert aux associes : pour les autres, la RLS ne renvoie rien et
// la page retombe sur la racine (notFound).
export default function SimFolder() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { role, loading: roleLoading } = useRole()
  const { folder, folders, files, loading: dataLoading, error, notFound, refetch } =
    useSimFolder(id)
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

  if (!canAccessContrats(role)) return <Navigate to="/" replace />
  if (!canVoirDossiersSim(role)) return <Navigate to="/sim/mes-contrats" replace />

  // Dossier introuvable, supprime, ou non visible : retour a la racine.
  if (notFound) return <Navigate to="/sim" replace />

  if (error || !folder) {
    return (
      <AppLayout>
        <p className="text-center text-brique py-12 px-5">
          Impossible de charger ce dossier.
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
        // Fil d'Ariane a 2 segments : « Contrats > NomDossier ».
        trail={['Contrats', folder.name]}
        // Accent = couleur du dossier courant (icone et CTA « Importer »).
        accent={folder.accent}
        folders={decoratedFolders}
        files={decoratedFiles}
        search={search}
        onSearchChange={setSearch}
        isSearching={search.trim().length > 0}
        canWrite={gestes.canWrite}
        compact={false}
        onBack={() => navigate('/sim')}
        onCrumb={(i) => { if (i === 0) navigate('/sim') }}
        onOpenFolder={(childId) => navigate(`/sim/${childId}`)}
        onOpenFile={gestes.handleFileOpen}
        onDownloadFile={gestes.handleFileDownload}
        onMenuFolder={(childId) => gestes.ouvrirMenuDossier(decoratedFolders.find((x) => x.id === childId))}
        onMenuFile={(childId) => gestes.ouvrirMenuFichier(decoratedFiles.find((x) => x.id === childId))}
        onUpload={() => setUploadOpen(true)}
        onNewFolder={() => setNewFolderOpen(true)}
      />
      {isNewFolderOpen && (
        <NewFolderModal
          parentId={folder.id}
          onClose={() => setNewFolderOpen(false)}
          onCreated={() => { setNewFolderOpen(false); refetch() }}
        />
      )}
      {isUploadOpen && (
        <UploadModal
          dossierId={folder.id}
          dossierName={folder.name}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => { setUploadOpen(false); refetch() }}
        />
      )}
      {gestes.modales}
    </AppLayout>
  )
}
