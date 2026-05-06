import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Phone, Mail, Tag, User, Calendar } from 'lucide-react'
import AppLayout from '../components/layout/AppLayout'
import EntreeAnnuaireForm from '../components/annuaire/EntreeAnnuaireForm'
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

function formatDateFR(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
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
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)

  // Categories existantes pour l'auto-complete du formulaire en mode edit.
  // On les calcule a partir de la liste complete (memoized pour eviter des
  // recalculs inutiles a chaque render).
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
    setConfirmOpen(false)
    if (!deleteError) {
      navigate('/annuaire')
    }
  }

  return (
    <AppLayout>
      <header className="flex items-center gap-3 px-5 pt-6 pb-4">
        <button
          type="button"
          onClick={() => {
            if (mode === 'edit') {
              handleCancel()
              return
            }
            navigate('/annuaire')
          }}
          aria-label={
            mode === 'edit'
              ? 'Annuler la modification'
              : "Retour à l'annuaire"
          }
          className="h-10 w-10 flex items-center justify-center rounded-full text-marine hover:bg-marine/5"
        >
          <ArrowLeft size={22} strokeWidth={2} />
        </button>
        <h1 className="font-display font-extrabold text-2xl text-marine truncate">
          {loading
            ? 'Chargement…'
            : mode === 'edit'
            ? "Modifier l'entrée"
            : entree?.nom || 'Fiche entrée'}
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

        {!loading && !error && !entree && (
          <p className="text-center text-muted py-12">
            Entrée introuvable.
          </p>
        )}

        {!loading && !error && entree && mode === 'edit' && (
          <EntreeAnnuaireForm
            initialValues={entree}
            existingCategories={existingCategories}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            submitting={submitting}
            error={submitError}
          />
        )}

        {!loading && !error && entree && mode === 'view' && (
          <article className="bg-carte border border-border rounded-card p-5 flex flex-col gap-4">
            <div>
              <h2 className="font-display font-bold text-xl text-marine break-words">
                {entree.nom}
              </h2>
              {entree.categorie && (
                <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-marine bg-marine/10 px-2 py-0.5 rounded-full">
                  <Tag size={11} strokeWidth={2} />
                  {entree.categorie}
                </p>
              )}
            </div>

            {(entree.telephone || entree.email) && (
              <div className="flex flex-col gap-2 border-t border-border pt-4">
                {entree.telephone && (
                  <a
                    href={`tel:${entree.telephone.replace(/\s/g, '')}`}
                    className="text-sm text-ink flex items-center gap-2 hover:text-canard transition-colors"
                  >
                    <Phone size={14} strokeWidth={1.8} className="text-canard flex-shrink-0" />
                    <span>{entree.telephone}</span>
                  </a>
                )}
                {entree.email && (
                  <a
                    href={`mailto:${entree.email}`}
                    className="text-sm text-ink flex items-center gap-2 hover:text-canard transition-colors"
                  >
                    <Mail size={14} strokeWidth={1.8} className="text-canard flex-shrink-0" />
                    <span className="break-all">{entree.email}</span>
                  </a>
                )}
              </div>
            )}

            {entree.note && entree.note.trim() !== '' && (
              <div className="border-t border-border pt-4">
                <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">
                  Note
                </p>
                <p className="text-sm italic text-ink bg-marine/5 rounded-lg p-3 break-words whitespace-pre-wrap">
                  {entree.note}
                </p>
              </div>
            )}

            {(auteurNom || dateCreation) && (
              <div className="border-t border-border pt-4 flex flex-col gap-1 text-xs text-muted">
                {auteurNom && (
                  <p className="flex items-center gap-2">
                    <User size={12} strokeWidth={1.8} className="flex-shrink-0" />
                    <span>Créé par {auteurNom}</span>
                  </p>
                )}
                {dateCreation && (
                  <p className="flex items-center gap-2">
                    <Calendar size={12} strokeWidth={1.8} className="flex-shrink-0" />
                    <span>Le {dateCreation}</span>
                  </p>
                )}
              </div>
            )}

            {(canEdit || canDelete) && (
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
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => setConfirmOpen(true)}
                    className="h-12 w-full rounded-input bg-brique/10 text-brique font-semibold hover:bg-brique/20 transition-colors"
                  >
                    Supprimer
                  </button>
                )}
              </div>
            )}
          </article>
        )}
      </div>

      {entree && (
        <ConfirmDialog
          open={confirmOpen}
          title="Supprimer cette entrée ?"
          message="Cette action est définitive. L'entrée sera supprimée de l'annuaire pour tous les utilisateurs."
          confirmLabel="Supprimer"
          confirmVariant="danger"
          onConfirm={handleDelete}
          onCancel={() => setConfirmOpen(false)}
          submitting={deleteSubmitting}
        />
      )}
    </AppLayout>
  )
}
