import {
  ChevronLeft, ChevronRight, FolderPlus, Upload, Download,
  Folder, FileText, FileImage, FileSpreadsheet, File, MoreVertical, Inbox,
} from 'lucide-react'

// Mapping extension -> icone + couleur de la palette Omnes.
function fileTypeMeta(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase()
  if (ext === 'pdf')                                       return { Icon: FileText,        color: '#D4503A', label: 'PDF' }
  if (['doc', 'docx', 'txt', 'md'].includes(ext))          return { Icon: FileText,        color: '#1C3D52', label: ext.toUpperCase() }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return { Icon: FileImage,       color: '#D94F7E', label: ext.toUpperCase() }
  if (['xls', 'xlsx', 'csv'].includes(ext))                return { Icon: FileSpreadsheet, color: '#6B7A3A', label: ext.toUpperCase() }
  return { Icon: File, color: 'rgba(28,61,82,0.55)', label: ext.toUpperCase() || 'FICHIER' }
}

// ─── Breadcrumb sticky (verre + backdrop-blur) ─────────────────────────────
function Breadcrumb({ trail, onBack, onCrumb }) {
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
            const clickable = !last && typeof onCrumb === 'function'
            return (
              <span key={i} className="flex items-center gap-2 min-w-0">
                {i > 0 && <ChevronRight size={14} className="text-faint shrink-0" />}
                {clickable ? (
                  <button
                    type="button"
                    onClick={() => onCrumb(i)}
                    className="px-1 truncate font-sans font-medium text-sm text-muted bg-transparent border-none cursor-pointer"
                  >
                    {seg}
                  </button>
                ) : (
                  <span
                    className={
                      last
                        ? 'px-1 truncate font-display font-extrabold text-lg text-marine tracking-[-0.01em]'
                        : 'px-1 truncate font-sans font-medium text-sm text-muted'
                    }
                  >
                    {seg}
                  </span>
                )}
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

// ─── Ligne dossier ──────────────────────────────────────────────────────────
function FolderRow({ name, count, accent = '#1C3D52', canWrite, showMeta = true, onOpen, onMenu }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      className="flex items-center gap-3 px-4 py-3 bg-carte border-t border-border cursor-pointer select-none"
    >
      <div
        className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center"
        style={{ backgroundColor: accent + '1F' }}
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
          onClick={(e) => { e.stopPropagation(); onMenu && onMenu() }}
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

// ─── Ligne fichier ──────────────────────────────────────────────────────────
function FileRow({ name, author, when, canWrite, showMeta = true, onOpen, onMenu, onDownload }) {
  const { Icon, color, label } = fileTypeMeta(name)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      className="flex items-center gap-3 px-4 py-3 bg-carte border-t border-border cursor-pointer select-none"
    >
      <div
        className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center relative"
        style={{ backgroundColor: color + '14' }}
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
          onClick={(e) => { e.stopPropagation(); onMenu && onMenu() }}
          className="h-9 w-9 flex items-center justify-center rounded-full shrink-0"
        >
          <MoreVertical size={18} className="text-muted" />
        </button>
      ) : (
        <button
          type="button"
          aria-label="Télécharger"
          onClick={(e) => { e.stopPropagation(); onDownload && onDownload() }}
          className="h-9 w-9 flex items-center justify-center rounded-full shrink-0"
        >
          <Download size={18} className="text-canard" />
        </button>
      )}
    </div>
  )
}

// ─── Etat dossier vide ──────────────────────────────────────────────────────
function DriveEmpty({ canWrite, onUpload }) {
  return (
    <div className="mx-4 mt-6 px-5 py-9 bg-carte border-[1.5px] border-dashed border-border rounded-card text-center">
      <div
        className="w-14 h-14 rounded-full mx-auto mb-3.5 flex items-center justify-center"
        style={{ backgroundColor: 'rgba(28,61,82,0.06)' }}
      >
        <Inbox size={26} strokeWidth={1.6} className="text-marine" />
      </div>
      <h2 className="font-display font-extrabold text-[17px] text-marine mb-1.5">Dossier vide</h2>
      <p className="font-sans text-[13.5px] text-muted mx-auto max-w-[260px] leading-snug">
        {canWrite
          ? 'Glissez un fichier ici ou utilisez le bouton ci-dessous pour ajouter le premier document.'
          : "Aucun fichier dans ce dossier pour l'instant."}
      </p>
      {canWrite && onUpload && (
        <button
          type="button"
          onClick={onUpload}
          className="mt-4 h-10 px-3.5 rounded-xl bg-marine text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5"
        >
          <Upload size={15} strokeWidth={2} />
          Uploader un fichier
        </button>
      )}
    </div>
  )
}

// ─── Composite : la page Drive complete ─────────────────────────────────────
export default function DrivePage({
  trail,
  folders = [],
  files = [],
  canWrite = false,
  compact = false,
  onBack,
  onCrumb,
  onOpenFolder,
  onOpenFile,
  onUpload,
  onNewFolder,
}) {
  const isEmpty = folders.length === 0 && files.length === 0

  return (
    <>
      <Breadcrumb trail={trail} onBack={onBack} onCrumb={onCrumb} />
      <DriveActions canWrite={canWrite} onNewFolder={onNewFolder} onUpload={onUpload} />

      {isEmpty ? (
        <DriveEmpty canWrite={canWrite} onUpload={onUpload} />
      ) : (
        <>
          {folders.length > 0 && (
            <>
              <SectionHeader count={folders.length}>Dossiers</SectionHeader>
              <div className="border-b border-border">
                {folders.map((f) => (
                  <FolderRow
                    key={f.slug || f.name}
                    {...f}
                    canWrite={canWrite}
                    showMeta={!compact}
                    onOpen={() => onOpenFolder && onOpenFolder(f.slug || f.name)}
                  />
                ))}
              </div>
            </>
          )}
          {files.length > 0 && (
            <>
              <SectionHeader count={files.length}>Fichiers</SectionHeader>
              <div className="border-b border-border">
                {files.map((f) => (
                  <FileRow
                    key={f.name}
                    {...f}
                    canWrite={canWrite}
                    showMeta={!compact}
                    onOpen={() => onOpenFile && onOpenFile(f.name)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <div className="h-6" />
    </>
  )
}
