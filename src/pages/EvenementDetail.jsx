import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ChevronLeft,
  MoreVertical,
  CalendarDays,
  MapPin,
  Pencil,
  Trash2,
} from 'lucide-react'
import AppLayout from '../components/layout/AppLayout'
import ConfirmDialog from '../components/common/ConfirmDialog'
import EvenementFormModal from '../features/evenements/EvenementFormModal'
import EvenementDocuments from '../features/evenements/EvenementDocuments'
import PollSection from '../features/evenements/PollSection'
import { useEvenement } from '../features/evenements/useEvenement'
import { useAuth } from '../hooks/useAuth'
import { useRole } from '../hooks/useRole'
import { canEditEvenement, canDeleteEvenement } from '../lib/permissions'
import { getEventColorClasses } from '../features/evenements/eventColors'
import { formatDateLong } from '../features/evenements/eventDate'
import HeaderWatermark from '../components/common/HeaderWatermark'

// "Prenom N." a partir de l'auteur joint ({ prenom, nom }).
function formatAuteurCourt(auteur) {
  if (!auteur) return null
  const prenom = (auteur.prenom ?? '').trim()
  const nom = (auteur.nom ?? '').trim()
  if (!prenom && !nom) return null
  if (prenom && nom) return `${prenom} ${nom[0].toUpperCase()}.`
  return prenom || nom
}

// ----------------------------------------------------------------------------
// Sous-composant : menu trois-points
// ----------------------------------------------------------------------------

/**
 * Menu trois-points du header de l'evenement. Rendu en bottom-sheet via
 * Portal (sort du header en overflow-hidden qui rognait l'ancien dropdown
 * CSS depuis l'ajout du filigrane).
 */
function ActionsMenu({ canEdit, canDelete, onEdit, onDelete }) {
  const [open, setOpen] = useState(false)

  // Escape + scroll lock pendant l'ouverture
  useEffect(() => {
    if (!open) return undefined
    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prev
    }
  }, [open])

  if (!canEdit && !canDelete) return null

  const items = []
  if (canEdit) {
    items.push({
      key: 'edit',
      label: "Modifier l'événement",
      icon: Pencil,
      onClick: onEdit,
    })
  }
  if (canDelete) {
    items.push({
      key: 'delete',
      label: "Supprimer l'événement",
      icon: Trash2,
      onClick: onDelete,
      danger: true,
    })
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Actions de l'événement"
        aria-haspopup="true"
        aria-expanded={open}
        className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full text-marine hover:bg-marine/5 active:bg-marine/10 transition-colors"
      >
        <MoreVertical className="w-5 h-5" strokeWidth={2} />
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-marine/40 backdrop-blur-sm"
          onClick={handleBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label="Actions de l'événement"
        >
          <div className="bg-carte rounded-t-2xl shadow-2xl animate-slide-up">
            <div className="pt-3 pb-1 flex justify-center">
              <div className="w-9 h-1 rounded-full bg-marine/18" />
            </div>
            <div className="px-2 py-2">
              {items.map((it) => {
                const Icon = it.icon
                return (
                  <button
                    key={it.key}
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      it.onClick?.()
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-input text-left text-body-m ${
                      it.danger
                        ? 'text-brique hover:bg-brique/10'
                        : 'text-ink hover:bg-fond'
                    }`}
                  >
                    <Icon size={20} aria-hidden="true" />
                    <span>{it.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

// ----------------------------------------------------------------------------
// Page principale
// ----------------------------------------------------------------------------

export default function EvenementDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { role } = useRole()
  const { evenement, loading, error, updateEvenement, deleteEvenement } =
    useEvenement(id)

  const [editOpen, setEditOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const canEdit = canEditEvenement({
    role,
    currentUserId: user?.id,
    auteurId: evenement?.auteur_id,
  })
  const canDelete = canDeleteEvenement({
    role,
    currentUserId: user?.id,
    auteurId: evenement?.auteur_id,
  })

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteEvenement()
      navigate('/evenements')
    } catch (err) {
      console.error('[EvenementDetail] delete error:', err)
      setDeleting(false)
      setConfirmOpen(false)
    }
  }

  const colors = getEventColorClasses(evenement?.couleur)
  const auteurCourt = formatAuteurCourt(evenement?.auteur)

  return (
    <AppLayout>
      {/* Header */}
      <header className="px-3 pt-5 pb-2 relative overflow-hidden">
        <div className="flex items-center gap-1 relative z-10">
          <button
            type="button"
            onClick={() => navigate('/evenements')}
            aria-label="Retour aux événements"
            className="w-10 h-10 flex items-center justify-center rounded-full text-marine hover:bg-marine/5 active:bg-marine/10 transition-colors shrink-0"
          >
            <ChevronLeft className="w-6 h-6" strokeWidth={2} />
          </button>
          <h1 className="flex-1 min-w-0 text-center font-display font-extrabold text-marine text-[16px] truncate px-1">
            {loading ? 'Chargement…' : evenement?.titre || 'Événement'}
          </h1>
          {!loading && evenement ? (
            <ActionsMenu
              canEdit={canEdit}
              canDelete={canDelete}
              onEdit={() => setEditOpen(true)}
              onDelete={() => setConfirmOpen(true)}
            />
          ) : (
            <div className="w-10 shrink-0" />
          )}
        </div>
        <HeaderWatermark color="fuchsia" fill offsetRight={64} />
      </header>

      {/* Contenu */}
      <div className="px-4 pb-8">
        {loading && (
          <p className="text-center text-muted py-12 text-sm">Chargement…</p>
        )}

        {!loading && error && (
          <p className="text-center text-brique py-12 text-sm">
            Impossible de charger l'événement.
          </p>
        )}

        {!loading && !error && !evenement && (
          <p className="text-center text-muted py-12 text-sm">
            Événement introuvable.
          </p>
        )}

        {!loading && !error && evenement && (
          <div className="space-y-4">
            {/* Bloc resume */}
            <div className="bg-carte rounded-card shadow-card overflow-hidden">
              <div className="flex items-center gap-3 p-4">
                <div
                  className={`w-12 h-12 rounded-input flex items-center justify-center shrink-0 ${colors.soft}`}
                >
                  <CalendarDays
                    className={`w-5 h-5 ${colors.softText}`}
                    strokeWidth={1.8}
                  />
                </div>
                <p className="text-marine font-semibold text-[15px]">
                  {formatDateLong(evenement.date_debut, evenement.date_fin)}
                </p>
              </div>

              {evenement.lieu && (
                <div className="flex items-center gap-3 p-4 border-t border-border">
                  <div className="w-12 h-12 rounded-input bg-marine/5 flex items-center justify-center shrink-0">
                    <MapPin className="w-5 h-5 text-muted" strokeWidth={1.8} />
                  </div>
                  <p className="text-marine text-[15px] min-w-0 break-words">
                    {evenement.lieu}
                  </p>
                </div>
              )}

              {auteurCourt && (
                <div className="px-4 py-3 border-t border-border">
                  <p className="text-[13px] text-muted">
                    Ajouté par{' '}
                    <span className="text-marine font-medium">
                      {auteurCourt}
                    </span>
                  </p>
                </div>
              )}
            </div>

            {/* Description */}
            {evenement.description && (
              <div>
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint mb-2">
                  Description
                </h2>
                <p className="text-marine text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                  {evenement.description}
                </p>
              </div>
            )}

            {/* Sondage de presence */}
            {evenement.sondage_actif && (
              <PollSection
                evenementId={evenement.id}
                couleur={evenement.couleur}
              />
            )}

            {/* Documents */}
            <EvenementDocuments evenementId={evenement.id} canEdit={canEdit} />
          </div>
        )}
      </div>

      {/* Modale d'edition */}
      <EvenementFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        mode="edit"
        initialValues={evenement}
        onSubmit={updateEvenement}
      />

      {/* Confirmation de suppression */}
      <ConfirmDialog
        open={confirmOpen}
        title="Supprimer cet événement ?"
        message="Cette action est définitive. L'événement, ses documents et les réponses au sondage seront supprimés pour tous les utilisateurs."
        confirmLabel="Supprimer"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
        submitting={deleting}
      />
    </AppLayout>
  )
}
