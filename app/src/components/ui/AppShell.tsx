'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const nav = [
  { href: '/dashboard',     icon: '🏠', label: 'Dashboard'   },
  { href: '/conferences',   icon: '🎪', label: 'Conferences' },
  { href: '/contacts',      icon: '👥', label: 'Contacts'    },
  { href: '/contacts/scan', icon: '📷', label: 'Scan Badge'  },
  { href: '/meetings',      icon: '🎙️', label: 'Meetings'    },
  { href: '/action-items',  icon: '✅', label: 'Actions'     },
  { href: '/settings',      icon: '⚙️', label: 'Settings'    },
]

const mobileNav = nav.filter(n => n.href !== '/settings' && n.href !== '/action-items')

interface Notification {
  id: string
  type: 'processing' | 'success' | 'error' | 'info'
  title: string
  body: string | null
  read: boolean
  created_at: string
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [activeConf, setActiveConf]       = useState<{ id: string; name: string } | null>(null)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [showNotifs, setShowNotifs]       = useState(false)
  const notifRef = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter(n => !n.read).length

  useEffect(() => {
    const id   = localStorage.getItem('active_conference_id')
    const name = localStorage.getItem('active_conference_name')
    if (id && name) setActiveConf({ id, name })

    const handler = () => {
      const id2   = localStorage.getItem('active_conference_id')
      const name2 = localStorage.getItem('active_conference_name')
      setActiveConf(id2 && name2 ? { id: id2, name: name2 } : null)
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  // Fetch notifications on mount + every 30s
  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30_000)
    return () => clearInterval(interval)
  }, [])

  // Close notification panel when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifs(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function fetchNotifications() {
    try {
      const res  = await fetch('/api/notifications')
      const data = await res.json()
      if (data.notifications) setNotifications(data.notifications)
    } catch {}
  }

  async function markAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  }

  function openNotifs() {
    setShowNotifs(v => !v)
    if (!showNotifs && unreadCount > 0) markAllRead()
  }

  function notifIcon(type: Notification['type']) {
    if (type === 'processing') return '⟳'
    if (type === 'success')    return '✅'
    if (type === 'error')      return '❌'
    return 'ℹ️'
  }

  function notifAge(ts: string) {
    const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60_000)
    if (mins < 1)  return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24)  return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar — desktop only */}
      <aside className="hidden md:flex flex-col w-60 bg-white border-r border-gray-100 flex-shrink-0">
        {/* Logo + bell */}
        <div className="px-5 py-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🤝</span>
            <div>
              <p className="font-bold text-gray-900 text-sm">ConfBuddy</p>
              <p className="text-xs text-gray-400">Conference Intelligence</p>
            </div>
          </div>
          {/* Bell */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={openNotifs}
              className="relative text-gray-400 hover:text-gray-700 transition-colors p-1"
              aria-label="Notifications"
            >
              <span className="text-xl">🔔</span>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notification panel */}
            {showNotifs && (
              <div className="absolute right-0 top-10 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <p className="font-semibold text-sm text-gray-900">Notifications</p>
                  {unreadCount > 0 && (
                    <button onClick={markAllRead} className="text-xs text-indigo-500 hover:text-indigo-700">
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-gray-400">No notifications yet</div>
                  ) : (
                    notifications.map(n => (
                      <div key={n.id} className={`px-4 py-3 ${!n.read ? 'bg-indigo-50' : ''}`}>
                        <div className="flex items-start gap-2">
                          <span className={`text-base mt-0.5 flex-shrink-0 ${n.type === 'processing' ? 'animate-spin' : ''}`}>
                            {notifIcon(n.type)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 leading-snug">{n.title}</p>
                            {n.body && <p className="text-xs text-gray-500 mt-0.5 leading-snug">{n.body}</p>}
                            <p className="text-xs text-gray-400 mt-1">{notifAge(n.created_at)}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Active conference pill */}
        {activeConf && (
          <Link href={`/conferences/${activeConf.id}`}
            className="mx-3 mt-3 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center gap-2 hover:bg-indigo-100 transition-colors">
            <span className="text-sm">🎪</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-indigo-700 truncate">{activeConf.name}</p>
              <p className="text-xs text-indigo-400">Active conference</p>
            </div>
          </Link>
        )}

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {nav.map(n => {
            const active =
              pathname === n.href ||
              (n.href !== '/dashboard' && n.href !== '/contacts/scan' && pathname.startsWith(n.href))
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

        <div className="px-5 py-4 border-t border-gray-100">
          <p className="text-xs text-gray-400">Powered by Claude AI</p>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar: active conference + bell */}
        <div className="md:hidden flex items-center bg-white border-b border-gray-100">
          {activeConf ? (
            <Link href={`/conferences/${activeConf.id}`}
              className="flex-1 flex items-center gap-2 bg-indigo-600 text-white px-4 py-1.5 text-xs font-medium">
              <span>🎪</span>
              <span className="truncate">{activeConf.name}</span>
              <span className="ml-auto opacity-70">→</span>
            </Link>
          ) : <div className="flex-1" />}

          {/* Mobile bell */}
          <div className="relative px-3 py-2" ref={notifRef}>
            <button onClick={openNotifs} className="relative text-gray-500">
              <span className="text-xl">🔔</span>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {showNotifs && (
              <div className="absolute right-0 top-10 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <p className="font-semibold text-sm text-gray-900">Notifications</p>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-gray-400">No notifications yet</div>
                  ) : (
                    notifications.map(n => (
                      <div key={n.id} className={`px-4 py-3 ${!n.read ? 'bg-indigo-50' : ''}`}>
                        <div className="flex items-start gap-2">
                          <span className={`text-base mt-0.5 flex-shrink-0 ${n.type === 'processing' ? 'animate-spin' : ''}`}>
                            {notifIcon(n.type)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 leading-snug">{n.title}</p>
                            {n.body && <p className="text-xs text-gray-500 mt-0.5">{n.body}</p>}
                            <p className="text-xs text-gray-400 mt-1">{notifAge(n.created_at)}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          {children}
        </main>
      </div>

      {/* Bottom nav — mobile only */}
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
