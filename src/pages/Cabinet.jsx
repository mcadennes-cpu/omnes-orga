import { useNavigate } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, FolderPlus, Upload, Download,
  Folder, FileText, FileImage, FileSpreadsheet, File, MoreVertical,
} from 'lucide-react'
import AppLayout from '../components/layout/AppLayout'
import { useRole } from '../hooks/useRole'
import { canEditCabinet } from '../lib/permissions'

// Donnees racine — calquees sur le standalone Claude Design.
// A cabler sur Supabase en 6E-3+.
const ROOT_FOLDERS = [
  { name: 'Protocoles',    count: 12, accent: '#D4503A' }, // brique
  { name: 'Administratif', count: 8,  accent: '#2A8FA8' }, // canard
  { name: 'RH',            count: 5,  accent: '#E8A135' }, // ocre
  { name: 'Hygiène',       count: 7,  accent: '#6B7A3A' }, // olive
]
const ROOT_FILES = [
  { name: 'Charte-cabinet.pdf',           author: 'Léa Martin',     when: 'il y a 3 j' },
  { name: 'Reglement-interieur-2024.pdf', author: 'Camille Dubois', when: 'le 12 mars' },
]

// Mapping extension -> icone + couleur de la palette Omnes (aucune nouvelle couleur).
function fileTypeMeta(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase()
  if (ext === 'pdf')                                   return { Icon: FileText,        color: '#D4503A', label: 'PDF' }
  if (['doc', 'docx', 'txt', 'md'].includes(ext))      return { Icon: FileText,        color: '#1C3D52', label: ext.toUpperCase() }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return { Icon: FileImage,    color: '#D94F7E', label: ext.toUpperCase() }
  if (['xls', 'xlsx', 'csv'].includes(ext))            return { Icon: FileSpreadsheet, color: '#6B7A3A', label: ext.toUpperCase() }
  return { Icon: File, color: 'rgba(28,61,82,0.55)', label: ext.toUpperCase() || 'FICHIER' }
}

// ─── Breadcrumb sticky (verre + backdrop-blur) ─────────────────────────────
function Breadcrumb({ trail, onBack }) {
  return (
    <header
      className="sticky top-0 z-10 px-4 pt-3.5 pb-3 border-b border-border"
      style={{
        background: 'rgba(245,247,249,0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onBack}
          aria-label="Retour"
          className="h-9 w-9 flex items-center justify-center rounded-full shrink-0"
        >
          <ChevronLeft size={20} strokeWidth={2} className="text-marine" />
        </button>
        <nav
          aria-label="Fil d'Ariane"
          className="min-w-0 flex-1 flex items-center gap-2 flex-nowrap overflow-hidden"
        >
          {trail.map((seg, i) => {
            const last = i === trail.length - 1
            return (
              <span key={i} className="flex items-center gap-2 min-w-0">
                {i > 0 && <ChevronRight size={14} className="text-faint shrink-0" />}
                <span
                  className={
                    last
                      ? 'px-1 truncate font-display font-extrabold text-lg text-marine tracking-[-0.01em]'
                      : 'px-1 truncate font-sans font-medium text-sm text-muted'
                  }
                >
                  {seg}
                </span>
              </span>
            )
          })}
        </nav>
      </div>
    </header>
  )
}

// ─── Toolbar (Nouveau dossier / Uploader, ou label lecture seule) ──────────
function DriveActions({ canWrite, onNewFolder, onUpload }) {
  if (!canWrite) {
    return (
      <div className="px-4 pt-3.5 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-faint text-[11px] font-semibold uppercase tracking-[0.16em]">
          <Download size={12} /> Lecture &amp; téléchargement
        </span>
      </div>
    )
  }
  return (
    <div className="px-4 pt-3.5 flex gap-2">
      <button
        type="button"
        onClick={onNewFolder}
        className="flex-1 h-10 px-3.5 rounded-xl bg-carte border border-border text-marine text-sm font-semibold inline-flex items-center justify-center gap-1.5"
      >
        <FolderPlus size={15} strokeWidth={2} className="text-marine" />
        Nouveau dossier
      </button>
      <button
        type="button"
        onClick={onUpload}
        className="flex-1 h-10 px-3.5 rounded-xl bg-marine text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5"
      >
        <Upload size={15} strokeWidth={2} />
        Uploader
      </button>
    </div>
  )
}

// ─── Eyebrow de section ────────────────────────────────────────────────────
function SectionHeader({ children, count }) {
  return (
    <div className="flex items-baseline gap-2 px-4 pt-5 pb-2">
      <span className="text-faint text-[11px] font-semibold uppercase tracking-[0.16em]">
        {children}
      </span>
      {count != null && (
        <span className="text-faint text-[11px] font-medium">· {count}</span>
      )}
    </div>
  )
}

// ─── Ligne dossier (chip teinte selon accent) ──────────────────────────────
function FolderRow({ name, count, accent = '#1C3D52', canWrite, showMeta = false }) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="flex items-center gap-3 px-4 py-3 bg-carte border-t border-border cursor-pointer select-none"
    >
      <div
        className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center"
        style={{ backgroundColor: accent + '1F' /* ~12% */ }}
      >
        <Folder size={20} fill={accent} stroke="none" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-sans font-semibold text-[14.5px] text-marine truncate">{name}</div>
        {showMeta && (
          <div className="font-sans text-xs text-muted truncate mt-0.5">
            {count} {count > 1 ? 'éléments' : 'élément'}
          </div>
        )}
      </div>
      {canWrite ? (
        <button
          type="button"
          aria-label="Actions"
          onClick={(e) => e.stopPropagation()}
          className="h-9 w-9 flex items-center justify-center rounded-full shrink-0"
        >
          <MoreVertical size={18} className="text-muted" />
        </button>
      ) : (
        <ChevronRight size={18} className="text-faint" />
      )}
    </div>
  )
}

// ─── Ligne fichier (icone + badge type colore) ─────────────────────────────
function FileRow({ name, author, when, canWrite, showMeta = true }) {
  const { Icon, color, label } = fileTypeMeta(name)
  return (
    <div
      role="button"
      tabIndex={0}
      className="flex items-center gap-3 px-4 py-3 bg-carte border-t border-border cursor-pointer select-none"
    >
      <div
        className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center relative"
        style={{ backgroundColor: color + '14' /* ~8% */ }}
      >
        <Icon size={20} strokeWidth={1.8} style={{ color }} />
        <span
          className="absolute -bottom-1 -right-1 text-white text-[8px] font-bold tracking-wider px-1 py-0.5 rounded leading-none border-[1.5px] border-fond"
          style={{ backgroundColor: color }}
        >
          {label}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-sans font-semibold text-[14.5px] text-marine truncate">{name}</div>
        {showMeta && (
          <div className="font-sans text-xs text-muted truncate mt-0.5">
            {author} · {when}
          </div>
        )}
      </div>
      {canWrite ? (
        <button
          type="button"
          aria-label="Actions"
          onClick={(e) => e.stopPropagation()}
          className="h-9 w-9 flex items-center justify-center rounded-full shrink-0"
        >
          <MoreVertical size={18} className="text-muted" />
        </button>
      ) : (
        <button
          type="button"
          aria-label="Télécharger"
          onClick={(e) => e.stopPropagation()}
          className="h-9 w-9 flex items-center justify-center rounded-full shrink-0"
        >
          <Download size={18} className="text-canard" />
        </button>
      )}
    </div>
  )
}

// ─── Page racine /cabinet ──────────────────────────────────────────────────
export default function Cabinet() {
  const navigate = useNavigate()
  const { role, loading } = useRole()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-fond">
        <p className="text-muted">Chargement…</p>
      </div>
    )
  }

  const canWrite = canEditCabinet(role)

  return (
    <AppLayout>
      <Breadcrumb trail={['Cabinet pratique']} onBack={() => navigate('/')} />

      <DriveActions
        canWrite={canWrite}
        onNewFolder={() => alert('Nouveau dossier — à venir en 6E-2')}
        onUpload={() => alert('Upload — a venir en 6E-2')}
      />

      <SectionHeader count={ROOT_FOLDERS.length}>Dossiers</SectionHeader>
      <div className="border-b border-border">
        {ROOT_FOLDERS.map((f) => (
          <FolderRow key={f.name} {...f} canWrite={canWrite} showMeta={false} />
        ))}
      </div>

      <SectionHeader count={ROOT_FILES.length}>Fichiers</SectionHeader>
      <div className="border-b border-border">
        {ROOT_FILES.map((f) => (
          <FileRow key={f.name} {...f} canWrite={canWrite} showMeta={false} />
        ))}
      </div>

      <div className="h-6" />
    </AppLayout>
  )
}