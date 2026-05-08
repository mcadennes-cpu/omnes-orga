import { useNavigate } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'
import DrivePage from '../features/cabinet/DrivePage'
import { useState } from 'react'
import NewFolderModal from '../features/cabinet/NewFolderModal'
import { useCabinetRoot } from '../features/cabinet/useCabinet'
import { useRole } from '../hooks/useRole'
import { canEditCabinet } from '../lib/permissions'

export default function Cabinet() {
  const navigate = useNavigate()
  const { role, loading: roleLoading } = useRole()
  const { folders, files, loading: dataLoading, error, refetch } = useCabinetRoot()
  const [isNewFolderOpen, setNewFolderOpen] = useState(false)

  const loading = roleLoading || dataLoading

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-fond">
        <p className="text-muted">Chargement…</p>
      </div>
    )
  }

  if (error) {
    return (
      <AppLayout>
        <p className="text-center text-brique py-12 px-5">
          Impossible de charger le contenu du cabinet.
        </p>
      </AppLayout>
    )
  }

  const canWrite = canEditCabinet(role)

  return (
    <AppLayout>
      <DrivePage
        trail={['Cabinet pratique']}
        accent="#1C3D52"
        folders={folders}
        files={files}
        canWrite={canWrite}
        compact
        onBack={() => navigate('/')}
        onOpenFolder={(id) => navigate(`/cabinet/${id}`)}
        onUpload={() => alert('Upload : à venir')}
        onNewFolder={() => setNewFolderOpen(true)}
      />
      {isNewFolderOpen && (
        <NewFolderModal
          parentId={null}
          onClose={() => setNewFolderOpen(false)}
          onCreated={() => { setNewFolderOpen(false); refetch() }}
        />
      )}
    </AppLayout>
  )
}