import { useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  BellRing,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  FileCheck2,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import AppLayout from '../components/layout/AppLayout'
import HeaderWatermark from '../components/common/HeaderWatermark'
import Avatar from '../components/common/Avatar'
import Pill from '../components/common/Pill'
import ConfirmDialog from '../components/common/ConfirmDialog'
import { useAuth } from '../hooks/useAuth'
import { useRole } from '../hooks/useRole'
import { canAccessSignatures } from '../lib/permissions'
import { formatName } from '../lib/profileFormat'
import { useSignature } from '../features/signatures/useSignature'
import { ouvrirDocument } from '../features/signatures/signaturesApi'
import DemandeFormModal from '../features/signatures/DemandeFormModal'
import SignatairesSheet from '../features/signatures/SignatairesSheet'
import SignerSheet from '../features/signatures/SignerSheet'
import MotifSheet from '../features/signatures/MotifSheet'
import {
  COULEUR_MODULE,
  EVENEMENTS_JOURNAL,
  STATUTS_DEMANDE,
  STATUTS_SIGNATAIRE,
  dateHeure,
  libelleType,
  signatairesAttendus,
} from '../features/signatures/signaturesLabels'

// ----------------------------------------------------------------------------
// Petits composants
// ----------------------------------------------------------------------------

function Section({ titre, action, children }) {
  return (
    <section className="bg-carte rounded-card shadow-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-muted text-xs uppercase tracking-wider font-semibold">{titre}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Bandeau({ couleur = 'marine', icone: Icone, children }) {
  const fonds = { marine: 'bg-marine/5', brique: 'bg-brique/10', olive: 'bg-olive/10', ocre: 'bg-ocre/15' }
  const textes = { marine: 'text-marine', brique: 'text-brique', olive: 'text-olive', ocre: 'text-ocre-fonce' }
  return (
    <div className={`flex items-start gap-3 rounded-input p-3 ${fonds[couleur]}`}>
      {Icone && <Icone className={`w-5 h-5 shrink-0 mt-0.5 ${textes[couleur]}`} strokeWidth={1.8} />}
      <div className="text-marine text-sm min-w-0 break-words">{children}</div>
    </div>
  )
}

function tailleLisible(octets) {
  if (!octets) return ''
  return octets < 1024 * 1024 ? `${Math.round(octets / 1024)} Ko` : `${(octets / 1024 / 1024).toFixed(1)} Mo`
}

// Qualite modifiable en place (brouillon) : enregistree a la sortie du champ.
function ChampQualite({ valeur, onSave }) {
  const [texte, setTexte] = useState(valeur ?? '')
  return (
    <input
      type="text"
      value={texte}
      onChange={(e) => setTexte(e.target.value.slice(0, 100))}
      onBlur={() => texte !== (valeur ?? '') && onSave(texte)}
      placeholder="Qualité (ex. Associé, Remplaçant)"
      className="mt-1 w-full px-2 py-1 rounded-pill bg-fond border border-border text-marine text-base placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-canard/30"
    />
  )
}

// ----------------------------------------------------------------------------
// Page
// ----------------------------------------------------------------------------

export default function SignatureDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { role, loading: roleLoading } = useRole()
  const s = useSignature(id)
  const { demande, signataires, journal, createur, loading, error } = s

  const fichierRef = useRef(null)
  const [message, setMessage] = useState(null) // { couleur, texte }
  const [occupe, setOccupe] = useState(null) // nom du geste en cours
  const [feuille, setFeuille] = useState(null) // 'modifier' | 'signataires' | 'signer' | 'refus' | 'annulation'
  const [confirmation, setConfirmation] = useState(null) // 'envoyer' | 'supprimer'
  const [historique, setHistorique] = useState(false)

  if (!roleLoading && !canAccessSignatures(role)) return <Navigate to="/" replace />

  const estCreateur = demande?.createur_id === user?.id
  const brouillon = demande?.statut === 'brouillon'
  const enCours = demande?.statut === 'en_cours'
  const monSignataire = signataires.find((x) => x.profil_id === user?.id) ?? null
  const attendus = signatairesAttendus(demande, signataires)
  const monTour = attendus.some((x) => x.profil_id === user?.id)
  const peutGerer = enCours && (estCreateur || role === 'super_admin')
  const refus = signataires.find((x) => x.statut === 'refuse')
  const tousSignes = signataires.length > 0 && signataires.every((x) => x.statut === 'signe')

  async function geste(nom, fn, succes) {
    setOccupe(nom)
    setMessage(null)
    try {
      const r = await fn()
      if (succes) setMessage({ couleur: 'olive', texte: typeof succes === 'function' ? succes(r) : succes })
    } catch (e) {
      setMessage({ couleur: 'brique', texte: e.message })
    } finally {
      setOccupe(null)
    }
  }

  async function ouvrir(final = false) {
    await geste(final ? 'final' : 'source', async () => {
      await ouvrirDocument({ demande, final, marquerConsulte: !final && monTour && !monSignataire?.consulte_at })
      if (!final && monTour) s.refetch()
    })
  }

  // Noms pour l'historique : signataires + createur.
  const noms = new Map(signataires.map((x) => [x.profil_id, x.nom_fige || formatName(x.profil)]))
  if (createur) noms.set(createur.id, formatName(createur))

  // --------------------------------------------------------------------------

  let contenu
  if (loading) {
    contenu = (
      <div className="py-16 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-faint" />
      </div>
    )
  } else if (error || !demande) {
    contenu = (
      <div className="py-16 px-6 text-center">
        <p className="text-muted text-sm">Cette demande n'existe pas ou ne vous est pas accessible.</p>
      </div>
    )
  } else {
    const statut = STATUTS_DEMANDE[demande.statut]
    contenu = (
      <div className="px-4 py-4 space-y-4">
        {/* En-tete de la demande */}
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-muted text-[12px] font-semibold">{libelleType(demande.type)}</span>
            <Pill color={statut.color} size="sm">{statut.label}</Pill>
            {demande.ordre_impose && <span className="text-faint text-[12px]">Ordre imposé</span>}
          </div>
          <h2 className="mt-1 font-display font-extrabold text-marine text-xl leading-tight break-words">
            {demande.titre}
          </h2>
          <p className="mt-1 text-faint text-[12px]">
            Préparée par {createur ? formatName(createur) : '…'}
            {demande.envoyee_at && ` · envoyée le ${dateHeure(demande.envoyee_at)}`}
          </p>
          {demande.description && (
            <p className="mt-3 text-marine text-sm whitespace-pre-wrap break-words">{demande.description}</p>
          )}
        </div>

        {message && <Bandeau couleur={message.couleur}>{message.texte}</Bandeau>}

        {demande.statut === 'annulee' && (
          <Bandeau couleur="brique" icone={AlertTriangle}>
            Demande annulée le {dateHeure(demande.annulee_at)}. Motif : {demande.motif_annulation}
          </Bandeau>
        )}
        {refus && demande.statut !== 'annulee' && (
          <Bandeau couleur="brique" icone={AlertTriangle}>
            {refus.nom_fige} a refusé de signer le {dateHeure(refus.refuse_at)}. Motif : {refus.motif_refus}
            {peutGerer && ' — annulez la demande puis préparez une nouvelle version si besoin.'}
          </Bandeau>
        )}
        {demande.statut === 'terminee' && (
          <Bandeau couleur="olive" icone={ShieldCheck}>
            Signé par tous le {dateHeure(demande.terminee_at)}. Le document scellé contient le certificat de
            signature en dernière page.
          </Bandeau>
        )}

        {/* Document */}
        <Section titre="Document">
          {brouillon && estCreateur && (
            <input
              ref={fichierRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) geste('depot', () => s.deposer(f), 'Document déposé.')
              }}
            />
          )}
          {demande.source_chemin ? (
            <div className="space-y-2">
              {demande.statut === 'terminee' && (
                <button
                  type="button"
                  onClick={() => ouvrir(true)}
                  disabled={!!occupe}
                  className="w-full flex items-center gap-3 p-3 rounded-input bg-olive/10 text-left active:opacity-80 disabled:opacity-50"
                >
                  <FileCheck2 className="w-6 h-6 text-olive shrink-0" strokeWidth={1.8} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-marine text-sm font-semibold">Document signé</span>
                    <span className="block text-muted text-[12px]">Avec le certificat de signature</span>
                  </span>
                  {occupe === 'final' && <Loader2 className="w-4 h-4 animate-spin text-faint" />}
                </button>
              )}
              <button
                type="button"
                onClick={() => ouvrir(false)}
                disabled={!!occupe}
                className="w-full flex items-center gap-3 p-3 rounded-input bg-fond text-left active:opacity-80 disabled:opacity-50"
              >
                <FileText className="w-6 h-6 text-marine shrink-0" strokeWidth={1.8} />
                <span className="flex-1 min-w-0">
                  <span className="block text-marine text-sm font-semibold truncate">{demande.source_nom}</span>
                  <span className="block text-muted text-[12px]">
                    {demande.statut === 'terminee' ? "Document d'origine · " : ''}
                    {tailleLisible(demande.source_taille)}
                  </span>
                </span>
                {occupe === 'source' && <Loader2 className="w-4 h-4 animate-spin text-faint" />}
              </button>
              {brouillon && estCreateur && (
                <button
                  type="button"
                  onClick={() => fichierRef.current?.click()}
                  disabled={!!occupe}
                  className="text-canard text-sm font-semibold"
                >
                  Remplacer le fichier
                </button>
              )}
            </div>
          ) : brouillon && estCreateur ? (
            <button
              type="button"
              onClick={() => fichierRef.current?.click()}
              disabled={!!occupe}
              className="w-full h-24 rounded-input border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted active:bg-fond disabled:opacity-50"
            >
              {occupe === 'depot' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Upload className="w-5 h-5" strokeWidth={1.8} />
              )}
              <span className="text-sm font-semibold">Déposer le PDF à faire signer</span>
              <span className="text-[12px] text-faint">20 Mo maximum</span>
            </button>
          ) : (
            <p className="text-muted text-sm">Aucun document.</p>
          )}
        </Section>

        {/* Mon action de signataire */}
        {monTour && (
          <section className="bg-carte rounded-card shadow-card p-4 space-y-3 border-2 border-marine/15">
            <h2 className="text-marine font-semibold">Votre signature est attendue</h2>
            {!monSignataire?.consulte_at ? (
              <p className="text-muted text-sm">
                Ouvrez d'abord le document ci-dessus et lisez-le : le bouton « Signer » s'activera ensuite.
              </p>
            ) : (
              <p className="text-muted text-sm">
                Document ouvert le {dateHeure(monSignataire.consulte_at)}. Vous pouvez maintenant le signer.
              </p>
            )}
            <button
              type="button"
              onClick={() => setFeuille('signer')}
              disabled={!monSignataire?.consulte_at}
              className="w-full h-12 rounded-input bg-marine text-white font-semibold shadow-button flex items-center justify-center gap-2 disabled:opacity-40 active:opacity-90"
            >
              <ShieldCheck className="w-5 h-5" strokeWidth={2} />
              Signer
            </button>
            <button type="button" onClick={() => setFeuille('refus')} className="w-full text-brique text-sm font-semibold py-1">
              Refuser de signer
            </button>
          </section>
        )}
        {enCours && monSignataire?.statut === 'en_attente' && !monTour && !refus && (
          <Bandeau icone={AlertTriangle}>
            L'ordre de signature est imposé : vous serez prévenu quand ce sera votre tour.
          </Bandeau>
        )}

        {/* Signataires */}
        <Section
          titre={`Signataires${signataires.length ? ` (${signataires.length})` : ''}`}
          action={
            brouillon && estCreateur ? (
              <button
                type="button"
                onClick={() => setFeuille('signataires')}
                className="inline-flex items-center gap-1 text-canard text-sm font-semibold"
              >
                <Plus className="w-4 h-4" strokeWidth={2.2} />
                Ajouter
              </button>
            ) : null
          }
        >
          {signataires.length === 0 ? (
            <p className="text-muted text-sm">Aucun signataire pour l'instant.</p>
          ) : (
            <ul className="divide-y divide-border">
              {signataires.map((x, i) => {
                const st = STATUTS_SIGNATAIRE[x.statut]
                const attendu = attendus.some((a) => a.id === x.id)
                return (
                  <li key={x.id} className="py-2.5 flex items-start gap-3">
                    <span className="w-5 pt-2.5 text-faint text-[12px] font-bold text-right shrink-0">{i + 1}</span>
                    <Avatar profile={x.profil} size={40} />
                    <div className="flex-1 min-w-0">
                      <p className="text-marine text-[15px] font-semibold truncate">
                        {x.nom_fige || formatName(x.profil)}
                        {x.profil_id === user?.id && <span className="text-faint font-normal"> (vous)</span>}
                      </p>
                      {brouillon && estCreateur ? (
                        <ChampQualite
                          valeur={x.qualite}
                          onSave={(q) => geste('qualite', () => s.modifierQualite(x.id, q))}
                        />
                      ) : (
                        <>
                          {x.qualite && <p className="text-muted text-[12px]">{x.qualite}</p>}
                          <div className="mt-1 flex items-center gap-2 flex-wrap">
                            {!brouillon && <Pill color={st.color} size="sm">{st.label}</Pill>}
                            <span className="text-faint text-[12px]">
                              {x.statut === 'signe'
                                ? dateHeure(x.signe_at)
                                : x.statut === 'refuse'
                                  ? dateHeure(x.refuse_at)
                                  : enCours && attendu
                                    ? x.consulte_at
                                      ? 'Document ouvert'
                                      : 'Pas encore ouvert'
                                    : ''}
                            </span>
                          </div>
                          {x.nb_relances > 0 && enCours && x.statut === 'en_attente' && (
                            <p className="text-faint text-[11px] mt-0.5">
                              Relancé {x.nb_relances} fois, dernière le {dateHeure(x.derniere_relance_at)}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                    {brouillon && estCreateur && (
                      <div className="flex items-center shrink-0">
                        {demande.ordre_impose && (
                          <>
                            <button
                              type="button"
                              aria-label="Monter"
                              disabled={i === 0 || !!occupe}
                              onClick={() => geste('ordre', () => s.deplacer(x.id, -1))}
                              className="w-8 h-8 flex items-center justify-center text-muted disabled:opacity-30"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              aria-label="Descendre"
                              disabled={i === signataires.length - 1 || !!occupe}
                              onClick={() => geste('ordre', () => s.deplacer(x.id, 1))}
                              className="w-8 h-8 flex items-center justify-center text-muted disabled:opacity-30"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          aria-label="Retirer"
                          disabled={!!occupe}
                          onClick={() => geste('retrait', () => s.retirerSignataire(x.id))}
                          className="w-8 h-8 flex items-center justify-center text-brique disabled:opacity-30"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Section>

        {/* Gestes du createur : brouillon */}
        {brouillon && estCreateur && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setConfirmation('envoyer')}
              disabled={!demande.source_chemin || signataires.length === 0 || !!occupe}
              className="w-full h-12 rounded-input bg-marine text-white font-semibold shadow-button flex items-center justify-center gap-2 disabled:opacity-40 active:opacity-90"
            >
              <Send className="w-5 h-5" strokeWidth={2} />
              Envoyer en signature
            </button>
            {(!demande.source_chemin || signataires.length === 0) && (
              <p className="text-faint text-[12px] text-center">
                Déposez le PDF et ajoutez au moins un signataire pour pouvoir envoyer.
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFeuille('modifier')}
                className="flex-1 h-11 rounded-input border border-border bg-carte text-marine font-semibold text-sm inline-flex items-center justify-center gap-2 active:bg-fond"
              >
                <Pencil className="w-4 h-4" strokeWidth={1.8} />
                Modifier
              </button>
              <button
                type="button"
                onClick={() => setConfirmation('supprimer')}
                className="flex-1 h-11 rounded-input border border-border bg-carte text-brique font-semibold text-sm inline-flex items-center justify-center gap-2 active:bg-fond"
              >
                <Trash2 className="w-4 h-4" strokeWidth={1.8} />
                Supprimer
              </button>
            </div>
          </div>
        )}

        {/* Gestes du createur : en cours */}
        {peutGerer && (
          <div className="space-y-2">
            {tousSignes && (
              <button
                type="button"
                onClick={() => geste('sceller', () => s.agir('sceller'), 'Document scellé.')}
                disabled={!!occupe}
                className="w-full h-12 rounded-input bg-marine text-white font-semibold shadow-button flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {occupe === 'sceller' && <Loader2 className="w-4 h-4 animate-spin" />}
                Finaliser le document signé
              </button>
            )}
            {!refus && !tousSignes && (
              <button
                type="button"
                onClick={() =>
                  geste('relance', () => s.agir('relancer'), (r) =>
                    `Relance envoyée à ${r.relances} signataire${r.relances > 1 ? 's' : ''}.`,
                  )
                }
                disabled={!!occupe}
                className="w-full h-11 rounded-input border border-border bg-carte text-marine font-semibold text-sm inline-flex items-center justify-center gap-2 active:bg-fond disabled:opacity-50"
              >
                {occupe === 'relance' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <BellRing className="w-4 h-4" strokeWidth={1.8} />
                )}
                Relancer les signataires attendus
              </button>
            )}
            <button
              type="button"
              onClick={() => setFeuille('annulation')}
              className="w-full text-brique text-sm font-semibold py-2"
            >
              Annuler la demande
            </button>
          </div>
        )}

        {/* Historique (journal) */}
        {journal.length > 0 && (
          <section className="bg-carte rounded-card shadow-card">
            <button
              type="button"
              onClick={() => setHistorique((h) => !h)}
              className="w-full p-4 flex items-center justify-between"
            >
              <span className="text-muted text-xs uppercase tracking-wider font-semibold">
                Historique ({journal.length})
              </span>
              {historique ? (
                <ChevronUp className="w-4 h-4 text-muted" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted" />
              )}
            </button>
            {historique && (
              <ul className="px-4 pb-4 space-y-2">
                {journal.map((e) => (
                  <li key={e.id} className="text-[13px]">
                    <span className="text-marine font-semibold">{EVENEMENTS_JOURNAL[e.evenement] ?? e.evenement}</span>
                    {e.acteur_id && noms.get(e.acteur_id) && (
                      <span className="text-muted"> · {noms.get(e.acteur_id)}</span>
                    )}
                    <span className="block text-faint text-[12px]">{dateHeure(e.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    )
  }

  return (
    <AppLayout>
      <div className="flex flex-col">
        <header className="sticky top-0 z-10 bg-fond/95 backdrop-blur-sm border-b border-border relative overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 relative z-10">
            <button
              type="button"
              onClick={() => navigate('/signatures')}
              aria-label="Retour"
              className="h-9 w-9 flex items-center justify-center rounded-full shrink-0"
            >
              <ChevronLeft size={20} strokeWidth={2} className="text-marine" />
            </button>
            <h1 className="flex-1 font-display font-extrabold text-marine text-2xl">Signature</h1>
          </div>
          <HeaderWatermark color={COULEUR_MODULE} fill offsetRight={64} />
        </header>
        {contenu}
      </div>

      {demande && (
        <>
          <DemandeFormModal
            open={feuille === 'modifier'}
            onClose={() => setFeuille(null)}
            initial={demande}
            onSubmit={s.modifier}
          />
          <SignatairesSheet
            open={feuille === 'signataires'}
            onClose={() => setFeuille(null)}
            dejaPresents={signataires.map((x) => x.profil_id)}
            onSubmit={s.ajouterSignataires}
          />
          <SignerSheet
            open={feuille === 'signer'}
            onClose={() => setFeuille(null)}
            agir={s.agir}
            onSigne={(r) =>
              setMessage({
                couleur: 'olive',
                texte: r.termine
                  ? 'Signature enregistrée. Tous ont signé : le document scellé est disponible.'
                  : 'Signature enregistrée. Merci !',
              })
            }
          />
          <MotifSheet
            open={feuille === 'refus'}
            onClose={() => setFeuille(null)}
            titre="Refuser de signer"
            explication="Votre refus bloque la demande : le créateur en sera prévenu et devra préparer une nouvelle version."
            libelleAction="Refuser"
            onSubmit={(motif) => s.agir('refuser', { motif })}
          />
          <MotifSheet
            open={feuille === 'annulation'}
            onClose={() => setFeuille(null)}
            titre="Annuler la demande"
            explication="La demande sera close définitivement ; les signatures déjà données restent inscrites au journal."
            libelleAction="Annuler la demande"
            onSubmit={(motif) => s.agir('annuler', { motif })}
          />
          <ConfirmDialog
            open={confirmation === 'envoyer'}
            title="Envoyer en signature ?"
            message="Le document et la liste des signataires seront figés : plus aucune modification ne sera possible. Chaque signataire sera prévenu par e-mail et par notification."
            confirmLabel="Envoyer"
            submitting={occupe === 'envoi'}
            onCancel={() => setConfirmation(null)}
            onConfirm={async () => {
              await geste('envoi', () => s.agir('envoyer'), 'Demande envoyée aux signataires.')
              setConfirmation(null)
            }}
          />
          <ConfirmDialog
            open={confirmation === 'supprimer'}
            title="Supprimer le brouillon ?"
            message="Le brouillon et son document seront supprimés définitivement."
            confirmLabel="Supprimer"
            confirmVariant="danger"
            submitting={occupe === 'suppression'}
            onCancel={() => setConfirmation(null)}
            onConfirm={async () => {
              setOccupe('suppression')
              try {
                await s.supprimerBrouillon()
                navigate('/signatures')
              } catch (e) {
                setMessage({ couleur: 'brique', texte: e.message })
                setOccupe(null)
                setConfirmation(null)
              }
            }}
          />
        </>
      )}
    </AppLayout>
  )
}
