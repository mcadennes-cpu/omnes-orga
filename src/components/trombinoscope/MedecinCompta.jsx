import { useState } from 'react'
import { Landmark, Pencil, Trash2, Copy, Check } from 'lucide-react'
import ConfirmDialog from '../common/ConfirmDialog'
import { supabase } from '../../lib/supabaseClient'
import { useProfilCompta } from '../../hooks/useProfilCompta'
import { canEditCompta } from '../../lib/permissions'

// ----------------------------------------------------------------------------
// Validation IBAN : format + checksum mod-97 (ISO 13616 / ISO 7064 MOD-97-10).
// Sans dependance externe. Teste sur IBAN officiels FR/DE/GB.
// ----------------------------------------------------------------------------
function normalizeIban(raw) {
  return (raw ?? '').replace(/\s+/g, '').toUpperCase()
}

export function isValidIban(raw) {
  const iban = normalizeIban(raw)
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(iban)) return false
  if (iban.length < 15 || iban.length > 34) return false
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  let numeric = ''
  for (const ch of rearranged) {
    if (ch >= '0' && ch <= '9') numeric += ch
    else numeric += (ch.charCodeAt(0) - 55).toString()
  }
  let remainder = 0
  for (let i = 0; i < numeric.length; i += 7) {
    remainder = Number(String(remainder) + numeric.slice(i, i + 7)) % 97
  }
  return remainder === 1
}

// Affichage groupe par 4 pour lisibilite (FR14 2004 1010 ...)
function formatIbanDisplay(raw) {
  return normalizeIban(raw).replace(/(.{4})/g, '$1 ').trim()
}

/**
 * Section RIB d'une fiche medecin.
 *
 * Visibilite pilotee par l'appelant (MedecinDetail ne monte ce composant que
 * si canViewCompta(role) est vrai). Ici on gere uniquement la distinction
 * lecture seule / edition, via canEditCompta(role) (super_admin uniquement).
 *
 * La verite de fond reste la RLS : un non-super_admin qui tenterait un upsert
 * verrait sa requete refusee cote Postgres.
 *
 * @param {{ medecinId: string, role: string }} props
 */
export default function MedecinCompta({ medecinId, role }) {
  const { compta, loading, error, refetch } = useProfilCompta(medecinId)
  const canEdit = canEditCompta(role)

  const [mode, setMode] = useState('view') // 'view' | 'edit'
  const [iban, setIban] = useState('')
  const [bic, setBic] = useState('')
  const [titulaire, setTitulaire] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function openEdit() {
    setIban(compta?.iban ?? '')
    setBic(compta?.bic ?? '')
    setTitulaire(compta?.nom_titulaire_compte ?? '')
    setFormError(null)
    setMode('edit')
  }

  function cancelEdit() {
    setMode('view')
    setFormError(null)
  }

  async function handleSave() {
    if (submitting) return

    const ibanTrim = iban.trim()
    const bicTrim = bic.trim()
    const titulaireTrim = titulaire.trim()

    if (!ibanTrim && !bicTrim && !titulaireTrim) {
      setFormError('Renseignez au moins un champ, ou supprimez le RIB.')
      return
    }
    if (ibanTrim && !isValidIban(ibanTrim)) {
      setFormError("L'IBAN saisi n'est pas valide (format ou clé de contrôle).")
      return
    }

    setSubmitting(true)
    setFormError(null)

    // Upsert sur la PK `id` (= medecinId, FK profiles). Une ligne par medecin.
    const { error: upsertError } = await supabase
      .from('profiles_compta')
      .upsert(
        {
          id: medecinId,
          iban: ibanTrim ? normalizeIban(ibanTrim) : null,
          bic: bicTrim ? bicTrim.toUpperCase() : null,
          nom_titulaire_compte: titulaireTrim || null,
        },
        { onConflict: 'id' }
      )

    setSubmitting(false)

    if (upsertError) {
      setFormError(
        upsertError.message
          ? `Erreur : ${upsertError.message}`
          : "Impossible d'enregistrer le RIB."
      )
      return
    }

    refetch()
    setMode('view')
  }

  async function handleDelete() {
    if (deleting) return
    setDeleting(true)
    const { error: deleteError } = await supabase
      .from('profiles_compta')
      .delete()
      .eq('id', medecinId)
    setDeleting(false)
    setConfirmDeleteOpen(false)
    if (!deleteError) {
      refetch()
      setMode('view')
    }
  }

  const hasRib = Boolean(
    compta && (compta.iban || compta.bic || compta.nom_titulaire_compte)
  )

  return (
    <section>
      <p className="text-field-label mb-2 px-1">Coordonnées bancaires (RIB)</p>

      {loading && (
        <div className="bg-carte border border-border rounded-card shadow-card px-4 py-4">
          <p className="text-body-m text-muted">Chargement…</p>
        </div>
      )}

      {!loading && error && (
        <div className="bg-carte border border-border rounded-card shadow-card px-4 py-4">
          <p className="text-body-m text-brique">Impossible de charger le RIB.</p>
        </div>
      )}

      {/* ----- Mode lecture ----- */}
      {!loading && !error && mode === 'view' && (
        <div className="bg-carte border border-border rounded-card shadow-card overflow-hidden">
          {hasRib ? (
            <div className="divide-y divide-border">
              <RibRow label="IBAN" value={compta.iban ? formatIbanDisplay(compta.iban) : '—'} mono copyText={compta.iban || null} />
              <RibRow label="BIC" value={compta.bic || '—'} mono copyText={compta.bic || null} />
              <RibRow label="Titulaire du compte" value={compta.nom_titulaire_compte || '—'} copyText={compta.nom_titulaire_compte || null} />
            </div>
          ) : (
            <div className="px-4 py-4 flex items-center gap-3">
              <span
                className="h-9 w-9 rounded-pill flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'rgba(42,143,168,0.10)' }}
              >
                <Landmark size={18} strokeWidth={1.8} className="text-canard" />
              </span>
              <p className="text-body-m text-muted">Aucun RIB renseigné.</p>
            </div>
          )}

          {canEdit && (
            <div className="border-t border-border px-3 py-3 flex gap-2.5">
              <button
                type="button"
                onClick={openEdit}
                className="flex-1 h-11 rounded-input bg-marine text-white text-button shadow-button flex items-center justify-center gap-2"
              >
                <Pencil size={15} strokeWidth={2} />
                {hasRib ? 'Modifier le RIB' : 'Ajouter un RIB'}
              </button>
              {hasRib && (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteOpen(true)}
                  aria-label="Supprimer le RIB"
                  className="h-11 w-11 rounded-input bg-carte border border-border text-brique flex items-center justify-center shrink-0"
                >
                  <Trash2 size={16} strokeWidth={2} />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ----- Mode edition (super_admin uniquement) ----- */}
      {!loading && !error && mode === 'edit' && canEdit && (
        <div className="bg-carte border border-border rounded-card shadow-card p-4 flex flex-col gap-3.5">
          <RibField label="IBAN">
            <RibInput
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              disabled={submitting}
              placeholder="FR76 ...."
              autoCapitalize="characters"
              spellCheck={false}
            />
          </RibField>

          <RibField label="BIC">
            <RibInput
              value={bic}
              onChange={(e) => setBic(e.target.value)}
              disabled={submitting}
              placeholder="Ex. AGRIFRPP"
              autoCapitalize="characters"
              spellCheck={false}
            />
          </RibField>

          <RibField label="Titulaire du compte">
            <RibInput
              value={titulaire}
              onChange={(e) => setTitulaire(e.target.value)}
              disabled={submitting}
              placeholder="Nom du titulaire"
            />
          </RibField>

          {formError && (
            <p
              className="text-brique text-body-m font-medium rounded-input px-3 py-2"
              style={{ backgroundColor: 'rgba(212,80,58,0.10)' }}
            >
              {formError}
            </p>
          )}

          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={cancelEdit}
              disabled={submitting}
              className="flex-1 h-12 rounded-input bg-carte border border-border text-marine text-button disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={submitting}
              className="flex-[1.6] h-12 rounded-input bg-marine text-white text-button shadow-button disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Supprimer le RIB ?"
        message="Les coordonnées bancaires de ce médecin seront définitivement effacées."
        confirmLabel="Supprimer"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
        submitting={deleting}
      />
    </section>
  )
}

// ----------------------------------------------------------------------------
// Sous-composants locaux
// ----------------------------------------------------------------------------

function RibRow({ label, value, mono = false, copyText = null }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    if (!copyText) return
    try {
      await navigator.clipboard.writeText(copyText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Presse-papiers indisponible (contexte non securise) : on ignore.
    }
  }

  return (
    <div className="px-4 py-3.5 flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-field-label">{label}</p>
        <p
          className={`text-body-l font-medium text-marine mt-0.5 break-all ${
            mono ? 'font-mono tracking-tight' : ''
          }`}
        >
          {value}
        </p>
      </div>
      {copyText && (
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? `${label} copié` : `Copier ${label}`}
          className={`h-9 w-9 rounded-pill flex items-center justify-center shrink-0 transition-colors ${
            copied ? 'bg-olive/10 text-olive' : 'bg-canard/10 text-canard'
          }`}
        >
          {copied ? (
            <Check size={16} strokeWidth={2.2} />
          ) : (
            <Copy size={16} strokeWidth={1.8} />
          )}
        </button>
      )}
    </div>
  )
}

function RibField({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-field-label">{label}</label>
      {children}
    </div>
  )
}

function RibInput(props) {
  return (
    <input
      type="text"
      {...props}
      className="h-11 w-full px-3.5 rounded-input bg-fond text-marine text-body-l font-medium border border-border focus:outline-none focus:border-canard focus:ring-1 focus:ring-canard disabled:opacity-60 disabled:cursor-not-allowed"
    />
  )
}
