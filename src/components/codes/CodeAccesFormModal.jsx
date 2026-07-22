import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../hooks/useAuth'
import { useMedecins } from '../../hooks/useMedecins'
import ConfirmDialog from '../common/ConfirmDialog'

// Bottom-sheet d'ajout / edition d'un code d'acces (pattern DS : Portal,
// animate-slide-up, Escape, scroll-lock — calque sur CreateCardModal).
//
// - Segmente "Commun / Personnel" : pilote titulaire_id (null = code commun
//   du lieu, sinon l'id du medecin choisi — par defaut moi).
// - En edition (code fourni), zone danger "Supprimer ce code" + ConfirmDialog.
export default function CodeAccesFormModal({
  open,
  onClose,
  lieuId,
  code = null, // null = creation, sinon la ligne codes_acces a editer
  onSaved, // callback apres insert/update/delete reussi (refetch cote parent)
}) {
  const { user } = useAuth()
  const { medecins } = useMedecins()
  const isEdit = Boolean(code?.id)

  const [type, setType] = useState('commun')
  const [titulaireId, setTitulaireId] = useState('')
  const [label, setLabel] = useState('')
  const [identifiant, setIdentifiant] = useState('')
  const [codeValue, setCodeValue] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  // (Re)initialisation a chaque ouverture, depuis le code edite ou vierge.
  useEffect(() => {
    if (!open) return
    setType(code?.titulaire_id ? 'personnel' : 'commun')
    setTitulaireId(code?.titulaire_id || user?.id || '')
    setLabel(code?.label || '')
    setIdentifiant(code?.identifiant || '')
    setCodeValue(code?.code || '')
    setNote(code?.note || '')
    setSubmitting(false)
    setError(null)
    setConfirmDeleteOpen(false)
  }, [open, code, user?.id])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e) {
      if (e.key === 'Escape' && !submitting && !confirmDeleteOpen) onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prev
    }
  }, [open, onClose, submitting, confirmDeleteOpen])

  if (!open) return null

  const canSubmit =
    label.trim() !== '' &&
    codeValue.trim() !== '' &&
    (type === 'commun' || titulaireId !== '') &&
    !submitting &&
    Boolean(user)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)

    const values = {
      titulaire_id: type === 'personnel' ? titulaireId : null,
      label: label.trim(),
      identifiant: identifiant.trim() || null,
      code: codeValue.trim(),
      note: note.trim() || null,
    }

    let dbError
    if (isEdit) {
      const { error: err } = await supabase
        .from('codes_acces')
        .update(values)
        .eq('id', code.id)
      dbError = err
    } else {
      // auteur_id = moi : la RLS (codes_acces_insert_writer) le verifie
      // cote serveur, et rejette de toute facon un remplacant.
      const { error: err } = await supabase
        .from('codes_acces')
        .insert({ ...values, lieu_id: lieuId, auteur_id: user.id })
      dbError = err
    }

    setSubmitting(false)
    if (dbError) {
      setError(dbError.message ? `Erreur : ${dbError.message}` : 'Enregistrement impossible.')
      return
    }
    onSaved?.()
    onClose()
  }

  async function handleDelete() {
    setSubmitting(true)
    const { error: err } = await supabase
      .from('codes_acces')
      .delete()
      .eq('id', code.id)
    setSubmitting(false)
    setConfirmDeleteOpen(false)
    if (err) {
      setError(err.message ? `Erreur : ${err.message}` : 'Suppression impossible.')
      return
    }
    onSaved?.()
    onClose()
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget && !submitting) onClose()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-overlay"
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="code-form-title"
    >
      <div className="w-full max-w-lg bg-carte rounded-t-card shadow-card animate-slide-up max-h-[92vh] overflow-y-auto">
        {/* Header sticky de la feuille */}
        <div className="sticky top-0 z-10 bg-carte border-b border-border px-4 py-3 flex items-center justify-between">
          <h2 id="code-form-title" className="text-h2 text-ink">
            {isEdit ? 'Modifier le code' : 'Nouveau code'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-1 text-muted hover:text-ink disabled:opacity-50"
            aria-label="Fermer"
          >
            <X size={22} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="px-4 py-4 flex flex-col gap-4">
          {/* Segmente Commun / Personnel */}
          <div>
            <p className="text-field-label mb-1.5">Type de code</p>
            <div className="grid grid-cols-2 gap-1 p-1 rounded-input bg-fond border border-border">
              <SegmentButton
                active={type === 'commun'}
                onClick={() => setType('commun')}
                disabled={submitting}
              >
                Commun
              </SegmentButton>
              <SegmentButton
                active={type === 'personnel'}
                onClick={() => setType('personnel')}
                disabled={submitting}
              >
                Personnel
              </SegmentButton>
            </div>
            <p className="text-caption text-faint mt-1.5 leading-relaxed">
              {type === 'commun'
                ? 'Code du lieu, partagé par tous (digicode, wifi, boîte à clés…).'
                : 'Identifiants propres à un médecin (session, logiciel patient…).'}
            </p>
          </div>

          {/* Selecteur de medecin (uniquement si personnel) */}
          {type === 'personnel' && (
            <div>
              <label htmlFor="code-titulaire" className="text-field-label block mb-1">
                Médecin titulaire <span className="text-brique">*</span>
              </label>
              <select
                id="code-titulaire"
                value={titulaireId}
                onChange={(e) => setTitulaireId(e.target.value)}
                disabled={submitting}
                className="h-11 w-full px-3 rounded-input bg-fond text-marine text-body-m font-medium border border-border focus:outline-none focus:border-canard focus:ring-1 focus:ring-canard disabled:opacity-60"
              >
                {medecins.map((m) => (
                  <option key={m.id} value={m.id}>
                    {[m.prenom, m.nom].filter(Boolean).join(' ')}
                    {m.id === user?.id ? ' (moi)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="code-label" className="text-field-label block mb-1">
              Libellé <span className="text-brique">*</span>
            </label>
            <input
              id="code-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={submitting}
              placeholder="Ex. Session Windows, NetSoins, Digicode entrée…"
              autoFocus={!isEdit}
              className="h-11 w-full px-3.5 rounded-input bg-fond text-marine text-body-l font-medium border border-border focus:outline-none focus:border-canard focus:ring-1 focus:ring-canard disabled:opacity-60"
            />
          </div>

          <div>
            <label htmlFor="code-identifiant" className="text-field-label block mb-1">
              Identifiant / login
            </label>
            <input
              id="code-identifiant"
              type="text"
              value={identifiant}
              onChange={(e) => setIdentifiant(e.target.value)}
              disabled={submitting}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="Ex. dr.dupont"
              className="h-11 w-full px-3.5 rounded-input bg-fond text-marine text-body-l font-medium font-mono tracking-tight border border-border focus:outline-none focus:border-canard focus:ring-1 focus:ring-canard disabled:opacity-60"
            />
          </div>

          <div>
            <label htmlFor="code-valeur" className="text-field-label block mb-1">
              Code / mot de passe <span className="text-brique">*</span>
            </label>
            <input
              id="code-valeur"
              type="text"
              value={codeValue}
              onChange={(e) => setCodeValue(e.target.value)}
              disabled={submitting}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="Ex. 1234B, azerty12…"
              className="h-11 w-full px-3.5 rounded-input bg-fond text-marine text-body-l font-medium font-mono tracking-tight border border-border focus:outline-none focus:border-canard focus:ring-1 focus:ring-canard disabled:opacity-60"
            />
          </div>

          <div>
            <label htmlFor="code-note" className="text-field-label block mb-1">
              Note
            </label>
            <textarea
              id="code-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={submitting}
              placeholder="Ex. poste de la salle de soins, demander à l'accueil…"
              className="w-full min-h-[72px] px-3.5 py-3 rounded-input bg-fond text-marine text-body-m border border-border focus:outline-none focus:border-canard focus:ring-1 focus:ring-canard resize-y disabled:opacity-60"
            />
          </div>

          {error && (
            <p
              className="text-brique text-body-m font-medium rounded-input px-3 py-2"
              style={{ backgroundColor: 'rgba(212,80,58,0.10)' }}
            >
              {error}
            </p>
          )}

          {/* Zone danger : edition uniquement */}
          {isEdit && (
            <button
              type="button"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={submitting}
              className="w-full h-11 rounded-input bg-carte text-brique text-button flex items-center justify-center gap-2 border disabled:opacity-60"
              style={{
                borderColor: 'rgba(212,80,58,0.25)',
                backgroundColor: 'rgba(212,80,58,0.04)',
              }}
            >
              <Trash2 size={15} strokeWidth={1.8} />
              Supprimer ce code
            </button>
          )}

          {/* Boutons */}
          <div className="flex gap-2.5 pb-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 h-12 rounded-input bg-carte border border-border text-marine text-button disabled:opacity-60"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-[1.6] h-12 rounded-input bg-marine text-white text-button shadow-button disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Supprimer ce code ?"
        message="Cette action est irréversible. Le code sera supprimé pour toute l'équipe."
        confirmLabel="Supprimer"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
        submitting={submitting}
      />
    </div>,
    document.body
  )
}

// ----------------------------------------------------------------------------
// Sous-composant : bouton du segmente Commun / Personnel
// ----------------------------------------------------------------------------

function SegmentButton({ active, onClick, disabled, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-9 rounded-[10px] text-button transition-colors ${
        active ? 'bg-marine text-white shadow-button' : 'text-muted'
      } disabled:opacity-60`}
    >
      {children}
    </button>
  )
}
