import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AppShell from '@/components/ui/AppShell'

export default async function ConferencesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: conferences } = await supabase
    .from('cb_conferences')
    .select('*')
    .eq('user_id', user.id)
    .order('start_date', { ascending: false })

  return (
    <AppShell>
      <div className="px-4 md:px-8 py-5 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Conferences</h1>
            <p className="text-xs text-gray-500 mt-0.5">Set up a conference to get started</p>
          </div>
          <Link href="/conferences/new" className="btn-primary text-sm py-2 px-4">
            + New
          </Link>
        </div>

        {!conferences?.length ? (
          <div className="card text-center py-16 space-y-3">
            <div className="text-5xl">🎪</div>
            <h2 className="font-semibold text-gray-800">No conferences yet</h2>
            <p className="text-sm text-gray-400 max-w-xs mx-auto">
              Create your first conference to start uploading documents, attendee lists and capturing meetings.
            </p>
            <Link href="/conferences/new" className="btn-primary inline-block mt-2">
              Create Conference
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {conferences.map(c => (
              <Link key={c.id} href={`/conferences/${c.id}`}
                className="card-hover flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 ${
                  c.is_active ? 'bg-indigo-600 text-white' : 'bg-gray-100'
                }`}>
                  🎪
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 truncate">{c.name}</p>
                    {c.is_active && (
                      <span className="text-xs bg-indigo-100 text-indigo-700 font-medium px-2 py-0.5 rounded-full flex-shrink-0">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {[c.location, c.start_date && new Date(c.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })]
                      .filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className="text-gray-400 text-lg flex-shrink-0">→</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
