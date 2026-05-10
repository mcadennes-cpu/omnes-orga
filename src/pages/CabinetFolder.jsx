import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useState } from 'react'
import AppLayout from '../components/layout/AppLayout'
import DrivePage from '../features/cabinet/DrivePage'
import NewFolderModal from '../features/cabinet/NewFolderModal'
import UploadModal from '../features/cabinet/UploadModal'
import { downloadCabinetFile } from '../features/cabinet/cabinetStorage'
import { useCabinetFolder } from '../features/cabinet/useCabinet'
import { useRole } from '../hooks/useRole'
import { canEditCabinet } from '../lib/permissions'

export default function CabinetFolder() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { role, loading: roleLoading } = useRole()
  const { folder, folders, files, loading: dataLoading, error, notFound, refetch } =
    useCabinetFolder(id)
  const [isNewFolderOpen, setNewFolderOpen] = useState(false)
  const [isUploadOpen, setUploadOpen] = useState(false)

  const loading = roleLoading || dataLoading

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-fond">
        <p className="text-muted">Chargement…</p>
      </div>
    )
  }

  if (notFound) {
    return <Navigate to="/cabinet" replace />
  }

  if (error || !folder) {
    return (
      <AppLayout>
        <p className="text-center text-brique py-12 px-5">
          Impossible de charger ce dossier.
        </p>
      </AppLayout>
    )
  }

  const canWrite = canEditCabinet(role)

  const handleFileDownload = async (id, nom) => {
    try {
      await downloadCabinetFile(id, nom)
    } catch (e) {
      console.error('Telechargement echoue', e)
      alert('Erreur lors du téléchargement.')
    }
  }

  return (
    <AppLayout>
      <DrivePage
        trail={['Cabinet pratique', folder.name]}
        accent={folder.accent}
        folders={folders}
        files={files}
        canWrite={canWrite}
        compact={false}
        onBack={() => navigate('/cabinet')}
        onCrumb={(i) => { if (i === 0) navigate('/cabinet') }}
        onOpenFolder={(childId) => navigate(`/cabinet/${childId}`)}
        onOpenFile={handleFileDownload}
        onDownloadFile={handleFileDownload}
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
    </AppLayout>
  )
}
