import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronDown,
  Phone,
  MapPin,
  User,
  Calendar,
  Plus,
  KeyRound,
} from 'lucide-react'
import AppLayout from '../components/layout/AppLayout'
import Pill from '../components/common/Pill'
import Avatar from '../components/common/Avatar'
import CodeRow from '../components/codes/CodeRow'
import CodeAccesFormModal from '../components/codes/CodeAccesFormModal'
import { useLieu } from '../hooks/useLieu'
import { useRole } from '../hooks/useRole'
import { useAuth } from '../hooks/useAuth'
import { canWriteCodes } from '../lib/permissions'
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

function formatNom(profil) {
  if (!profil) return null
  const parts = [profil.prenom, profil.nom].filter(Boolean)
  return parts.length ? parts.join(' ') : null
}

function sortByLabel(codes) {
  return [...codes].sort((a, b) => (a.label || '').localeCompare(b.label || '', 'fr'))
}

export default function LieuDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { role } = useRole()
  const { lieu, loading, error, refetch } = useLieu(id)

  // Groupes de collegues deplies (replies par defaut).
  const [expandedIds, setExpandedIds] = useState(() => new Set())
  // Modale code : { open, code } — code null = creation.
  const [modal, setModal] = useState({ open: false, code: null })

  const canWrite = canWriteCodes(role)

  // Partition des codes en 3 groupes : communs / les miens / par collegue.
  const { communs, miens, collegues } = useMemo(() => {
    const codes = lieu?.codes ?? []
    const communs = sortByLabel(codes.filter((c) => !c.titulaire_id))
    const miens = sortByLabel(codes.filter((c) => c.titulaire_id === user?.id))
    const parCollegue = new Map()
    for (const c of codes) {
      if (!c.titulaire_id || c.titulaire_id === user?.id) continue
      if (!parCollegue.has(c.titulaire_id)) {
        parCollegue.set(c.titulaire_id, { titulaire: c.titulaire, codes: [] })
      }
      parCollegue.get(c.titulaire_id).codes.push(c)
    }
    const collegues = Array.from(parCollegue.values())
      .map((g) => ({ ...g, codes: sortByLabel(g.codes) }))
      .sort((a, b) =>
        (formatNom(a.titulaire) || '').localeCompare(formatNom(b.titulaire) || '', 'fr')
      )
    return { communs, miens, collegues }
  }, [lieu, user?.id])

  const totalCodes = lieu?.codes?.length ?? 0
  const auteurNom = formatNom(lieu?.auteur)
  const dateCreation = formatDateFR(lieu?.created_at)

  function toggleCollegue(titulaireId) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(titulaireId)) next.delete(titulaireId)
      else next.add(titulaireId)
      return next
    })
  }

  return (
    <AppLayout>
      {/* Header sticky DS */}
      <header className="sticky top-0 z-10 bg-fond/95 backdrop-blur-sm border-b border-border relative overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 relative z-10">
          <button
            type="button"
            onClick={() => navigate('/codes')}
            aria-label="Retour aux codes d'accès"
            className="h-9 w-9 flex items-center justify-center rounded-full shrink-0"
          >
            <ChevronLeft size={20} strokeWidth={2} className="text-marine" />
          </button>
          <h1 className="flex-1 text-h1 text-marine truncate">
            {loading ? 'Chargement…' : lieu?.nom || 'Fiche lieu'}
          </h1>
        </div>
        <HeaderWatermark color="olive" />
      </header>

      <div className="px-4 pt-6 pb-8">
        {loading && <p className="text-center text-muted py-12">Chargement…</p>}

        {!loading && error && (
          <p className="text-center text-brique py-12">
            Impossible de charger la fiche.
          </p>
        )}

        {!loading && !error && !lieu && (
          <p className="text-center text-muted py-12">Lieu introuvable.</p>
        )}

        {!loading && !error && lieu && (
          <div className="flex flex-col gap-6">
            {/* Identite : tuile olive + nom + categorie */}
            <div className="flex flex-col items-center gap-3 pt-2">
              <div
                className="h-[88px] w-[88px] rounded-tile bg-olive text-white flex items-center justify-center shadow-tile"
                aria-hidden="true"
              >
                <KeyRound size={38} strokeWidth={1.8} />
              </div>
              <div className="text-center">
                <h2 className="font-display font-extrabold text-marine text-[22px] tracking-[-0.01em] break-words">
                  {lieu.nom}
                </h2>
                {lieu.categorie && (
                  <div className="mt-2">
                    <Pill color="olive" variant="soft" size="sm">
                      {lieu.categorie}
                    </Pill>
                  </div>
                )}
              </div>
            </div>

            {/* Infos pratiques du lieu */}
            {(lieu.adresse || lieu.telephone) && (
              <Section title="Infos pratiques">
                <div className="bg-carte border border-border rounded-card shadow-card overflow-hidden">
                  {lieu.adresse && (
                    <InfoRow icon={MapPin} label="Adresse" value={lieu.adresse} />
                  )}
                  {lieu.adresse && lieu.telephone && (
                    <div className="h-px bg-border ml-[62px]" />
                  )}
                  {lieu.telephone && (
                    <InfoRow
                      icon={Phone}
                      label="Téléphone"
                      value={lieu.telephone}
                      href={`tel:${lieu.telephone.replace(/\s/g, '')}`}
                    />
                  )}
                </div>
              </Section>
            )}

            {lieu.note && lieu.note.trim() !== '' && (
              <Section title="Note">
                <div
                  className="rounded-card px-4 py-3.5 text-body-m italic text-marine leading-relaxed whitespace-pre-wrap break-words"
                  style={{ backgroundColor: 'rgba(28,61,82,0.04)' }}
                >
                  {lieu.note}
                </div>
              </Section>
            )}

            {/* Aucun code : etat vide + CTA */}
            {totalCodes === 0 && (
              <div className="bg-carte border border-border rounded-card shadow-card text-center py-8 px-5">
                <div className="inline-flex h-12 w-12 rounded-full items-center justify-center mb-3 bg-olive/15">
                  <KeyRound size={22} strokeWidth={1.8} className="text-olive" />
                </div>
                <p className="font-display font-extrabold text-marine text-base mb-1">
                  Aucun code pour l'instant
                </p>
                <p className="text-body-m text-muted">
                  Ajoutez le premier code de ce lieu : digicode, wifi, session…
                </p>
              </div>
            )}

            {/* Codes communs */}
            {communs.length > 0 && (
              <Section title="Codes communs">
                <CodesCard>
                  {communs.map((c, idx) => (
                    <div key={c.id}>
                      {idx > 0 && <div className="h-px bg-border ml-4" />}
                      <CodeRow
                        code={c}
                        canWrite={canWrite}
                        onEdit={(code) => setModal({ open: true, code })}
                      />
                    </div>
                  ))}
                </CodesCard>
              </Section>
            )}

            {/* Mes codes */}
            {miens.length > 0 && (
              <Section title="Mes codes">
                <CodesCard>
                  {miens.map((c, idx) => (
                    <div key={c.id}>
                      {idx > 0 && <div className="h-px bg-border ml-4" />}
                      <CodeRow
                        code={c}
                        canWrite={canWrite}
                        onEdit={(code) => setModal({ open: true, code })}
                      />
                    </div>
                  ))}
                </CodesCard>
              </Section>
            )}

            {/* Codes des collegues : groupes replies par defaut */}
            {collegues.length > 0 && (
              <Section title="Codes des collègues">
                <div className="flex flex-col gap-2.5">
                  {collegues.map((g) => {
                    const tid = g.titulaire?.id
                    const expanded = expandedIds.has(tid)
                    return (
                      <div
                        key={tid}
                        className="bg-carte border border-border rounded-card shadow-card overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => toggleCollegue(tid)}
                          aria-expanded={expanded}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-fond transition-colors"
                        >
                          <Avatar profile={g.titulaire} size={36} />
                          <span className="flex-1 min-w-0 text-body-m font-semibold text-marine truncate">
                            {formatNom(g.titulaire) || 'Médecin'}
                          </span>
                          <span className="text-caption text-faint shrink-0">
                            {g.codes.length} code{g.codes.length > 1 ? 's' : ''}
                          </span>
                          <ChevronDown
                            size={18}
                            strokeWidth={1.8}
                            className={`text-faint shrink-0 transition-transform ${
                              expanded ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                        {expanded && (
                          <div className="border-t border-border">
                            {g.codes.map((c, idx) => (
                              <div key={c.id}>
                                {idx > 0 && <div className="h-px bg-border ml-4" />}
                                <CodeRow
                                  code={c}
                                  canWrite={canWrite}
                                  onEdit={(code) => setModal({ open: true, code })}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </Section>
            )}

            {/* CTA ajouter un code */}
            {canWrite && (
              <button
                type="button"
                onClick={() => setModal({ open: true, code: null })}
                className="w-full h-12 rounded-input bg-olive text-white text-button shadow-button flex items-center justify-center gap-2"
              >
                <Plus size={18} strokeWidth={2.2} />
                Ajouter un code
              </button>
            )}

            {/* Meta footer : auteur + date */}
            {(auteurNom || dateCreation) && (
              <div className="flex items-center gap-1.5 text-caption text-faint flex-wrap pt-2">
                {auteurNom && (
                  <span className="inline-flex items-center gap-1.5">
                    <User size={12} strokeWidth={1.8} />
                    Créé par <span className="text-muted font-medium">{auteurNom}</span>
                  </span>
                )}
                {auteurNom && dateCreation && <span className="text-faint">·</span>}
                {dateCreation && (
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar size={12} strokeWidth={1.8} />
                    Le {dateCreation}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {lieu && (
        <CodeAccesFormModal
          open={modal.open}
          onClose={() => setModal({ open: false, code: null })}
          lieuId={lieu.id}
          code={modal.code}
          onSaved={refetch}
        />
      )}
    </AppLayout>
  )
}

// ----------------------------------------------------------------------------
// Sous-composants locaux
// ----------------------------------------------------------------------------

function Section({ title, children }) {
  return (
    <section>
      <p className="text-field-label mb-2 px-1">{title}</p>
      {children}
    </section>
  )
}

function CodesCard({ children }) {
  return (
    <div className="bg-carte border border-border rounded-card shadow-card overflow-hidden">
      {children}
    </div>
  )
}

function InfoRow({ icon: Icon, label, value, href }) {
  const content = (
    <>
      <span className="h-9 w-9 rounded-pill flex items-center justify-center shrink-0 bg-olive/10">
        <Icon size={18} strokeWidth={1.8} className="text-olive" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-field-label">{label}</p>
        <p className="text-body-l font-medium text-marine mt-0.5 break-words">
          {value}
        </p>
      </div>
    </>
  )
  if (href) {
    return (
      <a href={href} className="flex items-center gap-3.5 px-4 py-3.5">
        {content}
      </a>
    )
  }
  return <div className="flex items-center gap-3.5 px-4 py-3.5">{content}</div>
}
