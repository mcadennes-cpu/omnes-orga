import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Inbox,
  ShieldCheck,
} from 'lucide-react'
import AppLayout from '../components/layout/AppLayout'
import ContratsEntete from '../features/sim/ContratsEntete'
import { useMesContrats } from '../features/sim/useSim'
import { downloadSimFile, openSimFile } from '../features/sim/simStorage'
import { dateCourte } from '../features/signatures/signaturesLabels'
import { useRole } from '../hooks/useRole'
import { canVoirMesContrats } from '../lib/permissions'

// Module Contrats, onglet « Mes contrats » (etape 25) : les documents ou je
// suis « concerne » -- contrats de remplacement, contrat d'exercice... --
// a plat, sans le dossier ou ils sont ranges (un non-membre SIM ne voit
// jamais l'arborescence). Archivage PERSONNEL : je range un contrat termine
// sans rien changer pour les autres.

function LigneContrat({ item, onOuvrir, onTelecharger, onArchiver, occupe }) {
  return (
    <li className="bg-carte rounded-card shadow-card p-3 flex items-center gap-3">
      <button
        type="button"
        onClick={onOuvrir}
        className="flex-1 min-w-0 flex items-center gap-3 text-left active:opacity-80"
      >
        <div className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center bg-olive/10">
          <FileText size={20} strokeWidth={1.8} className="text-olive" />
        </div>
        <div className="min-w-0">
          <p className="text-marine text-[14.5px] font-semibold truncate">{item.name}</p>
          <p className="text-muted text-[12px] flex items-center gap-1.5 flex-wrap">
            {item.signe && (
              <span className="inline-flex items-center gap-1 text-olive font-semibold">
                <ShieldCheck size={12} strokeWidth={2} />
                Signé
              </span>
            )}
            <span>{dateCourte(item.creeLe)}</span>
          </p>
        </div>
      </button>
      <button
        type="button"
        onClick={onTelecharger}
        aria-label="Télécharger"
        className="h-9 w-9 flex items-center justify-center rounded-full shrink-0"
      >
        <Download size={18} className="text-canard" />
      </button>
      <button
        type="button"
        onClick={onArchiver}
        disabled={occupe}
        aria-label={item.archiveAt ? 'Désarchiver' : 'Archiver'}
        className="h-9 w-9 flex items-center justify-center rounded-full shrink-0 disabled:opacity-40"
      >
        {item.archiveAt
          ? <ArchiveRestore size={18} className="text-muted" />
          : <Archive size={18} className="text-muted" />}
      </button>
    </li>
  )
}

export default function MesContrats() {
  const { role, loading: roleLoading } = useRole()
  const { items, loading, error, archiver } = useMesContrats()
  const [voirArchives, setVoirArchives] = useState(false)
  const [occupe, setOccupe] = useState(null)

  if (!roleLoading && !canVoirMesContrats(role)) {
    return <Navigate to={role ? '/sim' : '/'} replace />
  }

  const actifs = items.filter((i) => !i.archiveAt)
  const archives = items.filter((i) => i.archiveAt)

  async function ouvrir(item) {
    try {
      await openSimFile(item.id, item.name, item.mimeType)
    } catch (e) {
      console.error('Ouverture echouee', e)
      alert("Erreur lors de l'ouverture du fichier.")
    }
  }

  async function telecharger(item) {
    try {
      await downloadSimFile(item.id, item.name)
    } catch (e) {
      console.error('Telechargement echoue', e)
      alert('Erreur lors du téléchargement.')
    }
  }

  async function basculerArchive(item) {
    setOccupe(item.id)
    try {
      await archiver(item.id, !item.archiveAt)
    } catch (e) {
      alert(e.message)
    } finally {
      setOccupe(null)
    }
  }

  const ligne = (item) => (
    <LigneContrat
      key={item.id}
      item={item}
      occupe={occupe === item.id}
      onOuvrir={() => ouvrir(item)}
      onTelecharger={() => telecharger(item)}
      onArchiver={() => basculerArchive(item)}
    />
  )

  return (
    <AppLayout>
      <ContratsEntete actif="mes-contrats" />
      <div className="px-4 py-4">
        {error ? (
          <p className="py-8 text-center text-muted text-sm">Impossible de charger vos contrats.</p>
        ) : loading || roleLoading ? (
          <div className="space-y-3" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-carte rounded-card shadow-card p-3 flex gap-3 items-center animate-pulse">
                <div className="w-10 h-10 rounded-xl bg-border shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-border rounded-full w-2/3" />
                  <div className="h-2.5 bg-border/60 rounded-full w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {actifs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
                <div className="w-16 h-16 rounded-full bg-olive/10 flex items-center justify-center mb-4">
                  <Inbox className="w-7 h-7 text-olive" strokeWidth={1.8} />
                </div>
                <p className="text-muted text-sm max-w-[280px]">
                  {archives.length
                    ? 'Tous vos contrats sont archivés.'
                    : 'Vos contrats apparaîtront ici dès qu’ils seront signés ou rangés pour vous.'}
                </p>
              </div>
            ) : (
              <ul className="space-y-3">{actifs.map(ligne)}</ul>
            )}

            {archives.length > 0 && (
              <section className="mt-6">
                <button
                  type="button"
                  onClick={() => setVoirArchives((v) => !v)}
                  className="w-full flex items-center justify-between py-2"
                >
                  <span className="text-faint text-[11px] font-semibold uppercase tracking-[0.16em]">
                    Archivés · {archives.length}
                  </span>
                  {voirArchives
                    ? <ChevronUp className="w-4 h-4 text-muted" />
                    : <ChevronDown className="w-4 h-4 text-muted" />}
                </button>
                {voirArchives && <ul className="space-y-3 mt-2">{archives.map(ligne)}</ul>}
              </section>
            )}
          </>
        )}
      </div>
    </AppLayout>
  )
}
