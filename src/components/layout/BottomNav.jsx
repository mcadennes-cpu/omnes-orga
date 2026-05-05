import { NavLink } from 'react-router-dom'
import { Home, Search, User } from 'lucide-react'

const TABS = [
  { to: '/', label: 'Accueil', icon: Home, end: true },
  { to: '/recherche', label: 'Rechercher', icon: Search },
  { to: '/profil', label: 'Profil', icon: User },
]

export default function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 border-t border-border z-20"
      style={{
        backgroundColor: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        paddingBottom: 'env(safe-area-inset-bottom, 28px)',
      }}
    >
      <ul className="flex items-stretch justify-around h-[62px]">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              aria-label={label}
              className="w-full h-full flex flex-col items-center justify-center gap-1"
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={22}
                    strokeWidth={isActive ? 2.2 : 1.8}
                    className={isActive ? 'text-marine' : 'text-faint'}
                  />
                  <span
                    className={
                      isActive
                        ? 'text-[11px] text-marine font-semibold'
                        : 'text-[11px] text-faint font-medium'
                    }
                  >
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
