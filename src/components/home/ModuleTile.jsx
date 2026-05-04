const COLOR_BG = {
  marine: 'bg-marine',
  canard: 'bg-canard',
  ocre: 'bg-ocre',
  olive: 'bg-olive',
  brique: 'bg-brique',
  fuchsia: 'bg-fuchsia',
}

const COLOR_TEXT = {
  marine: 'text-marine',
  canard: 'text-canard',
  ocre: 'text-ocre',
  olive: 'text-olive',
  brique: 'text-brique',
  fuchsia: 'text-fuchsia',
}

export default function ModuleTile({
  label,
  icon: Icon,
  color = 'canard',
  badge,
  onClick,
}) {
  const bgClass = COLOR_BG[color] ?? COLOR_BG.canard
  const textClass = COLOR_TEXT[color] ?? COLOR_TEXT.canard

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative aspect-square w-full rounded-tile p-[14px] text-left transition-opacity hover:opacity-95 active:opacity-90 ${bgClass}`}
    >
      <div
        className="flex h-[30px] w-[30px] items-center justify-center rounded-[10px]"
        style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}
      >
        {Icon && <Icon size={18} className="text-white" strokeWidth={2} />}
      </div>

      {typeof badge === 'number' && badge > 0 && (
        <div
          className={`absolute right-[14px] top-[14px] flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-bold ${textClass}`}
        >
          {badge}
        </div>
      )}

      <span className="absolute bottom-[14px] left-[14px] right-[14px] text-[12px] font-semibold leading-tight text-white">
        {label}
      </span>
    </button>
  )
}
