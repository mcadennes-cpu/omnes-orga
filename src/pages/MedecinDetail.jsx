import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Phone, Mail, Calendar, Pencil, ShieldOff, ShieldCheck } from 'lucide-react'
import AppLayout from '../components/layout/AppLayout'
import MedecinForm from '../components/trombinoscope/MedecinForm'
import MedecinCompta from '../components/trombinoscope/MedecinCompta'
import ConfirmDialog from '../components/common/ConfirmDialog'
import Pill from '../components/common/Pill'
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
  canViewCompta,
  canEditRole,
} from '../lib/permissions'
import { getAvatarPalette } from '../lib/avatarColor'

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
  const avatar = getAvatarPalette(
    medecin ? `${medecin.prenom} ${medecin.nom}` : null
  )

  const canEdit = canEditMedecin({
    role,
    currentUserId: user?.id,
    medecinId: medecin?.id,
  })
  const canEditPrivileged = canEditPrivilegedFields(role)
  const canEditRoleField = canEditRole(role)
  const canToggle = canToggleActif(role)
  const showSensitive = canViewSensitiveFields(role)
  const showCompta = canViewCompta(role)

  function handleCancel() {
    setMode('view')
    setSubmitError(null)
  }

  async function handleSubmit(values) {
    if (!medecin?.id) return

    // Champs de base, toujours autorisés (édition de sa propre fiche incluse)
    const safeValues = {
      nom: values.nom,
      prenom: values.prenom,
      telephone: values.telephone,
      specialite: values.specialite,
      jours_disponibles: values.jours_disponibles,
    }
    // notes_internes : super_admin + associe_gerant
    if (canEditPrivileged && 'notes_internes' in values) {
      safeValues.notes_internes = values.notes_internes
    }
    // role + actif : super_admin uniquement (jamais poussés sinon)
    if (canEditRoleField) {
      if ('role' in values) safeValues.role = values.role
      if ('actif' in values) safeValues.actif = values.actif
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
          : "Impossible d'enregistrer les modifications."
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

  const roleLabel = medecin?.role ? ROLE_LABELS[medecin.role] ?? medecin.role : null

  return (
    <AppLayout>
      {/* Header sticky */}
      <header className="sticky top-0 z-10 bg-fond/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-2 px-4 py-3">
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
            className="h-9 w-9 flex items-center justify-center rounded-full shrink-0"
          >
            <ChevronLeft size={20} strokeWidth={2} className="text-marine" />
          </button>
          <h1 className="flex-1 text-h1 text-marine truncate">
            {loading
              ? 'Chargement…'
              : mode === 'edit'
              ? 'Modifier la fiche'
              : fullName || 'Fiche médecin'}
          </h1>
        </div>
      </header>

      <div className="px-4 pt-6 pb-8">
        {/* Loading */}
        {loading && (
          <p className="text-center text-muted py-12">Chargement…</p>
        )}

        {/* Error */}
        {!loading && error && (
          <p className="text-center text-brique py-12">
            Impossible de charger la fiche.
          </p>
        )}

        {/* Not found */}
        {!loading && !error && !medecin && (
          <p className="text-center text-muted py-12">
            Médecin introuvable.
          </p>
        )}

        {/* Edit mode : passe au formulaire (geometrie inchangee, sera refondu en trombi-d) */}
        {!loading && !error && medecin && mode === 'edit' && (
          <MedecinForm
            initialValues={medecin}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            canEditPrivilegedFields={canEditPrivileged}
            canEditRole={canEditRoleField}
            submitting={submitting}
            error={submitError}
          />
        )}

        {/* View mode : nouvelle UI variante A */}
        {!loading && !error && medecin && mode === 'view' && (
          <div className="flex flex-col gap-6">
            {/* Identite centree : photo + nom + role + statut */}
            <div className="flex flex-col items-center gap-3 pt-2">
              {medecin.photo_url ? (
                <img
                  src={medecin.photo_url}
                  alt={fullName}
                  className="h-[108px] w-[108px] rounded-full object-cover"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className={`h-[108px] w-[108px] rounded-full ${avatar.bg} ${avatar.text} font-display font-extrabold text-[38px] flex items-center justify-center`}
                >
                  {initials}
                </div>
              )}
              <div className="text-center">
                <h2 className="font-display font-extrabold text-marine text-[22px] tracking-[-0.01em] break-words">
                  {fullName}
                </h2>
                {medecin.specialite && (
                  <p className="mt-1 text-body-m text-muted break-words">
                    {medecin.specialite}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap justify-center">
                {roleLabel && (
                  <Pill color="canard" variant="soft" size="sm">
                    {roleLabel}
                  </Pill>
                )}
                {!medecin.actif && (
                  <Pill color="brique" variant="soft" size="sm">
                    Désactivé
                  </Pill>
                )}
              </div>
            </div>

            {/* Section Contact */}
            <Section title="Contact">
              <div className="bg-carte border border-border rounded-card shadow-card overflow-hidden">
                {medecin.telephone && (
                  <>
                    <ContactRow
                      icon={Phone}
                      label="Téléphone"
                      value={medecin.telephone}
                      href={`tel:${medecin.telephone.replace(/\s/g, '')}`}
                    />
                    {medecin.email && (
                      <div className="h-px bg-border ml-[62px]" />
                    )}
                  </>
                )}
                {medecin.email && (
                  <ContactRow
                    icon={Mail}
                    label="E-mail"
                    value={medecin.email}
                    href={`mailto:${medecin.email}`}
                    multiline
                  />
                )}
              </div>
            </Section>

            {/* Section Disponibilites */}
            {showSensitive && medecin.jours_disponibles && (
              <Section title="Disponibilités">
                <div className="bg-carte border border-border rounded-card shadow-card px-4 py-3.5 flex items-center gap-3">
                  <span
                    className="h-9 w-9 rounded-pill flex items-center justify-center shrink-0"
                    style={{ backgroundColor: 'rgba(42,143,168,0.10)' }}
                  >
                    <Calendar size={18} strokeWidth={1.8} className="text-canard" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-field-label">Jours présents</p>
                    <p className="text-body-l font-medium text-marine mt-0.5 break-words">
                      {medecin.jours_disponibles}
                    </p>
                  </div>
                </div>
              </Section>
            )}

            {/* Section Notes internes */}
            {showSensitive &&
              medecin.notes_internes &&
              medecin.notes_internes.trim() !== '' && (
                <Section title="Notes internes">
                  <div
                    className="rounded-card px-4 py-3.5 text-body-m italic text-marine leading-relaxed break-words"
                    style={{ backgroundColor: 'rgba(28,61,82,0.04)' }}
                  >
                    {medecin.notes_internes}
                  </div>
                </Section>
              )}

            {/* Section RIB — visible super_admin / associe_gerant / associe */}
            {showCompta && medecin && (
              <MedecinCompta medecinId={medecin.id} role={role} />
            )}

            {/* Actions bar */}
            {(canEdit || canToggle) && (
              <div className="flex gap-2.5 pt-2">
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setMode('edit')}
                    className="flex-1 h-12 rounded-input bg-marine text-white text-button shadow-button flex items-center justify-center gap-2"
                  >
                    <Pencil size={16} strokeWidth={2} />
                    Modifier
                  </button>
                )}
                {canToggle && (
                  <button
                    type="button"
                    onClick={() => setConfirmOpen(true)}
                    className={`flex-1 h-12 rounded-input bg-carte border border-border text-button flex items-center justify-center gap-2 ${
                      medecin.actif ? 'text-brique' : 'text-olive'
                    }`}
                  >
                    {medecin.actif ? (
                      <>
                        <ShieldOff size={16} strokeWidth={2} />
                        Désactiver
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={16} strokeWidth={2} />
                        Réactiver
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
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

// ----------------------------------------------------------------------------
// Sous-composants locaux : Section, ContactRow
// ----------------------------------------------------------------------------

function Section({ title, children }) {
  return (
    <section>
      <p className="text-field-label mb-2 px-1">{title}</p>
      {children}
    </section>
  )
}

function ContactRow({ icon: Icon, label, value, href, multiline = false }) {
  return (
    <a href={href} className="flex items-center gap-3.5 px-4 py-3.5">
      <span
        className="h-9 w-9 rounded-pill flex items-center justify-center shrink-0"
        style={{ backgroundColor: 'rgba(42,143,168,0.10)' }}
      >
        <Icon size={18} strokeWidth={1.8} className="text-canard" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-field-label">{label}</p>
        <p
          className={`text-body-l font-medium text-marine mt-0.5 ${
            multiline ? 'break-words' : 'truncate'
          }`}
        >
          {value}
        </p>
      </div>
    </a>
  )
}
