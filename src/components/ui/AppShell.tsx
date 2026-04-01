'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const nav = [
  { href: '/dashboard',     icon: '🏠', label: 'Dashboard'  },
  { href: '/contacts',      icon: '👥', label: 'Contacts'   },
  { href: '/contacts/scan', icon: '📷', label: 'Scan Badge' },
  { href: '/meetings',      icon: '🎙️', label: 'Meetings'   },
  { href: '/action-items',  icon: '✅', label: 'Actions'    },
  { href: '/settings',      icon: '⚙️', label: 'Settings'   },
]

// Mobile shows 5 items — drop Settings from bottom nav, keep in sidebar
const mobileNav = nav.filter(n => n.href !== '/settings')

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar — desktop only */}
      <aside className="hidden md:flex flex-col w-60 bg-white border-r border-gray-100 flex-shrink-0">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🤝</span>
            <div>
              <p className="font-bold text-gray-900 text-sm">ConfBuddy</p>
              <p className="text-xs text-gray-400">Conference Intelligence</p>
            </div>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {nav.map(n => {
            const active =
              pathname === n.href ||
              (n.href !== '/dashboard' &&
               n.href !== '/contacts/scan' &&
               pathname.startsWith(n.href))
            return (
              <Link key={n.href} href={n.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}>
                <span className="text-base">{n.icon}</span>
                {n.label}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100">
          <p className="text-xs text-gray-400">Powered by Claude AI</p>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          {children}
        </main>
      </div>

      {/* Bottom nav — mobile only (5 items) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex z-50">
        {mobileNav.map(n => {
          const active = pathname === n.href || pathname.startsWith(n.href + '/')
          return (
            <Link key={n.href} href={n.href}
              className={`flex-1 flex flex-col items-center py-2.5 transition-colors ${
                active ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'
              }`}>
              <span className="text-xl">{n.icon}</span>
              <span className="text-[10px] mt-0.5 font-medium">{n.label.split(' ')[0]}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
