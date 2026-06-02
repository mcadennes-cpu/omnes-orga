import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Phone, Mail, User, Calendar, Pencil } from 'lucide-react'
import AppLayout from '../components/layout/AppLayout'
import EntreeAnnuaireForm from '../components/annuaire/EntreeAnnuaireForm'
import Pill from '../components/common/Pill'
import ConfirmDialog from '../components/common/ConfirmDialog'
import { supabase } from '../lib/supabaseClient'
import { useEntreeAnnuaire } from '../hooks/useEntreeAnnuaire'
import { useEntreesAnnuaire } from '../hooks/useEntreesAnnuaire'
import { useRole } from '../hooks/useRole'
import { useAuth } from '../hooks/useAuth'
import {
  canEditEntreeAnnuaire,
  canDeleteEntreeAnnuaire,
} from '../lib/permissions'
import HeaderWatermark from '../components/common/HeaderWatermark'

function formatDateFR(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

function formatAuteur(auteur) {
  if (!auteur) return null
  const parts = [auteur.prenom, auteur.nom].filter(Boolean)
  return parts.length ? parts.join(' ') : null
}

function entryInitial(nom) {
  if (!nom) return '?'
  for (const c of nom) {
    if (/[A-Za-zÀ-ÿ]/.test(c)) return c.toUpperCase()
  }
  return '?'
}

export default function EntreeAnnuaireDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { role } = useRole()
  const { entree, loading, error, refetch } = useEntreeAnnuaire(id)
  const { entrees: allEntrees } = useEntreesAnnuaire()

  const [mode, setMode] = useState('view')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)

  const existingCategories = useMemo(() => {
    const set = new Set(
      allEntrees
        .map((e) => e.categorie)
        .filter((c) => c && c.trim() !== '')
    )
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'))
  }, [allEntrees])

  const canEdit = canEditEntreeAnnuaire({
    role,
    currentUserId: user?.id,
    auteurId: entree?.auteur_id,
  })
  const canDelete = canDeleteEntreeAnnuaire({
    role,
    currentUserId: user?.id,
    auteurId: entree?.auteur_id,
  })

  const auteurNom = formatAuteur(entree?.auteur)
  const dateCreation = formatDateFR(entree?.created_at)

  function handleCancel() {
    setMode('view')
    setSubmitError(null)
  }

  async function handleSubmit(values) {
    if (!entree?.id) return
    setSubmitting(true)
    setSubmitError(null)
    const { error: updateError } = await supabase
      .from('annuaire')
      .update(values)
      .eq('id', entree.id)
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

  async function handleDelete() {
    if (!entree?.id) return
    setDeleteSubmitting(true)
    const { error: deleteError } = await supabase
      .from('annuaire')
      .delete()
      .eq('id', entree.id)
    setDeleteSubmitting(false)
    setConfirmDeleteOpen(false)
    if (!deleteError) {
      navigate('/annuaire')
    }
  }

  const hasContact = entree?.telephone || entree?.email

  return (
    <AppLayout>
      {/* Header sticky DS */}
      <header className="sticky top-0 z-10 bg-fond/95 backdrop-blur-sm border-b border-border relative overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 relative z-10">
          <button
            type="button"
            onClick={() => {
              if (mode === 'edit') {
                handleCancel()
                return
              }
              navigate('/annuaire')
            }}
            aria-label={mode === 'edit' ? 'Annuler la modification' : "Retour à l'annuaire"}
            className="h-9 w-9 flex items-center justify-center rounded-full shrink-0"
          >
            <ChevronLeft size={20} strokeWidth={2} className="text-marine" />
          </button>
          <h1 className="flex-1 text-h1 text-marine truncate">
            {loading
              ? 'Chargement…'
              : mode === 'edit'
              ? "Modifier l'entrée"
              : entree?.nom || 'Fiche entrée'}
          </h1>
        </div>
        <HeaderWatermark color="ocre" />
      </header>

      <div className="px-4 pt-6 pb-8">
        {loading && (
          <p className="text-center text-muted py-12">Chargement…</p>
        )}

        {!loading && error && (
          <p className="text-center text-brique py-12">
            Impossible de charger la fiche.
          </p>
        )}

        {!loading && !error && !entree && (
          <p className="text-center text-muted py-12">
            Entrée introuvable.
          </p>
        )}

        {/* Edit mode : formulaire (refondu en lot d) */}
        {!loading && !error && entree && mode === 'edit' && (
          <EntreeAnnuaireForm
            initialValues={entree}
            existingCategories={existingCategories}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            submitting={submitting}
            error={submitError}
            canDelete={canDelete}
            onDelete={() => setConfirmDeleteOpen(true)}
          />
        )}

        {/* View mode : nouvelle UI variante A */}
        {!loading && !error && entree && mode === 'view' && (
          <div className="flex flex-col gap-6">
            {/* Identite centree : tile ocre + nom + categorie */}
            <div className="flex flex-col items-center gap-3 pt-2">
              <div
                className="h-[108px] w-[108px] rounded-tile bg-ocre text-white font-display font-extrabold text-[44px] flex items-center justify-center shadow-tile"
                aria-hidden="true"
              >
                {entryInitial(entree.nom)}
              </div>
              <div className="text-center">
                <h2 className="font-display font-extrabold text-marine text-[22px] tracking-[-0.01em] break-words">
                  {entree.nom}
                </h2>
                {entree.categorie && (
                  <div className="mt-2">
                    <Pill color="ocre" variant="soft" size="sm">
                      {entree.categorie}
                    </Pill>
                  </div>
                )}
              </div>
            </div>

            {/* Section Contact */}
            {hasContact && (
              <Section title="Contact">
                <div className="bg-carte border border-border rounded-card shadow-card overflow-hidden">
                  {entree.telephone && (
                    <ContactRow
                      icon={Phone}
                      label="Téléphone"
                      value={entree.telephone}
                      href={`tel:${entree.telephone.replace(/\s/g, '')}`}
                    />
                  )}
                  {entree.telephone && entree.email && (
                    <div className="h-px bg-border ml-[62px]" />
                  )}
                  {entree.email && (
                    <ContactRow
                      icon={Mail}
                      label="E-mail"
                      value={entree.email}
                      href={`mailto:${entree.email}`}
                      multiline
                    />
                  )}
                </div>
              </Section>
            )}

            {/* Section Note */}
            {entree.note && entree.note.trim() !== '' && (
              <Section title="Note">
                <div
                  className="rounded-card px-4 py-3.5 text-body-m italic text-marine leading-relaxed whitespace-pre-wrap break-words"
                  style={{ backgroundColor: 'rgba(28,61,82,0.04)' }}
                >
                  {entree.note}
                </div>
              </Section>
            )}

            {/* Cas extreme : ni contact ni note */}
            {!hasContact && (!entree.note || entree.note.trim() === '') && (
              <div
                className="rounded-card px-4 py-5 text-center text-body-m text-muted leading-relaxed"
                style={{ backgroundColor: 'rgba(28,61,82,0.04)' }}
              >
                Aucune information de contact ni note pour cette entrée.
              </div>
            )}

            {/* Meta footer : auteur + date */}
            {(auteurNom || dateCreation) && (
              <div className="flex items-center gap-1.5 text-caption text-faint flex-wrap pt-2">
                {auteurNom && (
                  <span className="inline-flex items-center gap-1.5">
                    <User size={12} strokeWidth={1.8} />
                    Créée par <span className="text-muted font-medium">{auteurNom}</span>
                  </span>
                )}
                {auteurNom && dateCreation && (
                  <span className="text-faint">·</span>
                )}
                {dateCreation && (
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar size={12} strokeWidth={1.8} />
                    Le {dateCreation}
                  </span>
                )}
              </div>
            )}

            {/* Action bar : seulement Modifier (Supprimer dans le formulaire en lot d) */}
            {canEdit && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setMode('edit')}
                  className="w-full h-12 rounded-input bg-marine text-white text-button shadow-button flex items-center justify-center gap-2"
                >
                  <Pencil size={16} strokeWidth={2} />
                  Modifier
                </button>
              </div>
            )}

            {/* Note : pas droit de modifier */}
            {!canEdit && (
              <div
                className="rounded-input px-4 py-3 text-center text-caption text-muted leading-relaxed"
                style={{ backgroundColor: 'rgba(28,61,82,0.05)' }}
              >
                Lecture seule — seul l'auteur de l'entrée ou un associé gérant peut la modifier.
              </div>
            )}
          </div>
        )}
      </div>

      {entree && (
        <ConfirmDialog
          open={confirmDeleteOpen}
          title="Supprimer cette entrée ?"
          message="Cette action est irréversible. L'entrée sera supprimée de l'annuaire pour tous les utilisateurs."
          confirmLabel="Supprimer"
          confirmVariant="danger"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDeleteOpen(false)}
          submitting={deleteSubmitting}
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
