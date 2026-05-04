import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Phone, Calendar, Mail } from 'lucide-react'
import AppLayout from '../components/layout/AppLayout'
import MedecinForm from '../components/trombinoscope/MedecinForm'
import ConfirmDialog from '../components/common/ConfirmDialog'
import { supabase } from '../lib/supabaseClient'
import { useMedecin } from '../hooks/useMedecin'
import { useRole } from '../hooks/useRole'
import { useAuth } from '../hooks/useAuth'
import { ROLE_LABELS } from '../lib/modules'
import {
  canEditMedecin,
  canEditPrivilegedFields,
  canToggleActif,
  canViewSensitiveFields,
} from '../lib/permissions'

function getInitials(prenom, nom) {
  const p = (prenom ?? '').trim().charAt(0).toUpperCase()
  const n = (nom ?? '').trim().charAt(0).toUpperCase()
  return `${p}${n}` || '?'
}

export default function MedecinDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { role } = useRole()
  const { medecin, loading, error, refetch } = useMedecin(id)

  const [mode, setMode] = useState('view')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [toggleActifSubmitting, setToggleActifSubmitting] = useState(false)

  const fullName = medecin
    ? [medecin.prenom, medecin.nom].filter(Boolean).join(' ').trim()
    : ''
  const initials = medecin ? getInitials(medecin.prenom, medecin.nom) : '?'

  const canEdit = canEditMedecin({
    role,
    currentUserId: user?.id,
    medecinId: medecin?.id,
  })
  const canEditPrivileged = canEditPrivilegedFields(role)
  const canToggle = canToggleActif(role)
  const showSensitive = canViewSensitiveFields(role)

  function handleCancel() {
    setMode('view')
    setSubmitError(null)
  }

  async function handleSubmit(values) {
    if (!medecin?.id) return

    const safeValues = canEditPrivileged
      ? values
      : {
          nom: values.nom,
          prenom: values.prenom,
          telephone: values.telephone,
          specialite: values.specialite,
          jours_disponibles: values.jours_disponibles,
        }

    setSubmitting(true)
    setSubmitError(null)

    const { error: updateError } = await supabase
      .from('profiles')
      .update(safeValues)
      .eq('id', medecin.id)

    setSubmitting(false)

    if (updateError) {
      setSubmitError(
        updateError.message
          ? `Erreur : ${updateError.message}`
          : 'Impossible d\'enregistrer les modifications.'
      )
      return
    }

    refetch()
    setMode('view')
  }

  async function handleToggleActif() {
    if (!medecin?.id) return
    setToggleActifSubmitting(true)
    const newActif = !medecin.actif
    const { error: toggleError } = await supabase
      .from('profiles')
      .update({ actif: newActif })
      .eq('id', medecin.id)
    setToggleActifSubmitting(false)
    setConfirmOpen(false)
    if (!toggleError) refetch()
  }

  return (
    <AppLayout activeTab={null}>
      <header className="flex items-center gap-3 px-5 pt-6 pb-4">
        <button
          type="button"
          onClick={() => {
            if (mode === 'edit') {
              handleCancel()
              return
            }
            navigate('/trombinoscope')
          }}
          aria-label={mode === 'edit' ? 'Annuler la modification' : 'Retour au trombinoscope'}
          className="h-10 w-10 flex items-center justify-center rounded-full text-marine hover:bg-marine/5"
        >
          <ArrowLeft size={22} strokeWidth={2} />
        </button>
        <h1 className="font-display font-extrabold text-2xl text-marine truncate">
          {loading
            ? 'Chargement…'
            : mode === 'edit'
            ? 'Modifier la fiche'
            : fullName || 'Fiche médecin'}
        </h1>
      </header>

      <div className="px-5 pt-2">
        {loading && (
          <p className="text-center text-muted py-12">Chargement…</p>
        )}

        {!loading && error && (
          <p className="text-center text-brique py-12">
            Impossible de charger la fiche.
          </p>
        )}

        {!loading && !error && !medecin && (
          <p className="text-center text-muted py-12">
            Médecin introuvable.
          </p>
        )}

        {!loading && !error && medecin && mode === 'edit' && (
          <MedecinForm
            initialValues={medecin}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            canEditPrivilegedFields={canEditPrivileged}
            submitting={submitting}
            error={submitError}
          />
        )}

        {!loading && !error && medecin && mode === 'view' && (
          <article className="bg-carte border border-border rounded-card p-5 flex flex-col gap-4">
            <div className="flex items-start gap-4">
              {medecin.photo_url ? (
                <img
                  src={medecin.photo_url}
                  alt={fullName}
                  className="h-20 w-20 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="h-20 w-20 rounded-full bg-canard text-white font-bold text-2xl flex items-center justify-center flex-shrink-0"
                >
                  {initials}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <h2 className="font-display font-bold text-xl text-marine break-words">
                  {fullName}
                </h2>
                {medecin.specialite && (
                  <p className="text-sm text-muted break-words mt-0.5">
                    {medecin.specialite}
                  </p>
                )}
                {medecin.role && (
                  <p className="mt-2 inline-block text-xs font-semibold text-marine bg-marine/10 px-2 py-0.5 rounded-full">
                    {ROLE_LABELS[medecin.role] ?? medecin.role}
                  </p>
                )}
                {!medecin.actif && (
                  <p className="mt-2 ml-2 inline-block text-xs font-semibold text-brique bg-brique/10 px-2 py-0.5 rounded-full">
                    Désactivé
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-border pt-4">
              {medecin.email && (
                <p className="text-sm text-ink flex items-center gap-2 break-words">
                  <Mail size={14} strokeWidth={1.8} className="text-canard flex-shrink-0" />
                  <span className="break-all">{medecin.email}</span>
                </p>
              )}
              {medecin.telephone && (
                <a
                  href={`tel:${medecin.telephone.replace(/\s/g, '')}`}
                  className="text-sm text-ink flex items-center gap-2 hover:text-canard transition-colors"
                >
                  <Phone size={14} strokeWidth={1.8} className="text-canard flex-shrink-0" />
                  <span>{medecin.telephone}</span>
                </a>
              )}
              {showSensitive && medecin.jours_disponibles && (
                <p className="text-sm text-ink flex items-center gap-2">
                  <Calendar size={14} strokeWidth={1.8} className="text-canard flex-shrink-0" />
                  <span className="break-words">{medecin.jours_disponibles}</span>
                </p>
              )}
            </div>

            {showSensitive && medecin.notes_internes && medecin.notes_internes.trim() !== '' && (
              <div className="border-t border-border pt-4">
                <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">
                  Notes internes
                </p>
                <p className="text-sm italic text-ink bg-marine/5 rounded-lg p-3 break-words">
                  {medecin.notes_internes}
                </p>
              </div>
            )}

            {(canEdit || canToggle) && (
              <div className="border-t border-border pt-4 flex flex-col gap-2">
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setMode('edit')}
                    className="h-12 w-full rounded-input bg-marine font-semibold text-white hover:bg-marine/90 transition-colors"
                  >
                    Modifier
                  </button>
                )}
                {canToggle && (
                  <button
                    type="button"
                    onClick={() => setConfirmOpen(true)}
                    className={`h-12 w-full rounded-input font-semibold transition-colors ${
                      medecin.actif
                        ? 'bg-brique/10 text-brique hover:bg-brique/20'
                        : 'bg-olive/10 text-olive hover:bg-olive/20'
                    }`}
                  >
                    {medecin.actif ? 'Désactiver' : 'Réactiver'}
                  </button>
                )}
              </div>
            )}
          </article>
        )}
      </div>

      {medecin && (
        <ConfirmDialog
          open={confirmOpen}
          title={medecin.actif ? 'Désactiver ce médecin ?' : 'Réactiver ce médecin ?'}
          message={
            medecin.actif
              ? 'Cette fiche sera masquée du trombinoscope mais pas supprimée. Vous pourrez la réactiver plus tard.'
              : 'Cette fiche réapparaîtra dans le trombinoscope. Vous pourrez la désactiver à nouveau si besoin.'
          }
          confirmLabel={medecin.actif ? 'Désactiver' : 'Réactiver'}
          confirmVariant={medecin.actif ? 'danger' : 'primary'}
          onConfirm={handleToggleActif}
          onCancel={() => setConfirmOpen(false)}
          submitting={toggleActifSubmitting}
        />
      )}
    </AppLayout>
  )
}
