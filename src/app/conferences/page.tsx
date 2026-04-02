import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AppShell from '@/components/ui/AppShell'

export default async function ConferencesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: owned } = await supabase
    .from('cb_conferences')
    .select('*, join_code')
    .eq('user_id', user.id)
    .order('start_date', { ascending: false })

  const { data: memberships } = await supabase
    .from('cb_conference_members')
    .select('conference:cb_conferences(*, join_code)')
    .eq('user_id', user.id)
    .eq('role', 'member')

  const ownedIds = new Set((owned ?? []).map(c => c.id))
  const joined   = (memberships ?? [])
    .map(m => m.conference)
    .filter(Boolean)
    .filter(c => !ownedIds.has((c as { id: string }).id)) as Array<Record<string, unknown>>

  const conferences = [
    ...(owned ?? []).map(c => ({ ...c, member_role: 'owner' as const })),
    ...joined.map(c => ({ ...c, member_role: 'member' as const })),
  ]

  return (
    <AppShell>
      <div className="px-4 md:px-8 py-5 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Conferences</h1>
            <p className="text-xs text-gray-500 mt-0.5">Set up or join a conference</p>
          </div>
          <div className="flex gap-2">
            <Link href="/conferences/join" className="btn-secondary text-sm py-2 px-3">🔑 Join</Link>
            <Link href="/conferences/new"  className="btn-primary  text-sm py-2 px-4">+ New</Link>
          </div>
        </div>

        {!conferences.length ? (
          <div className="card text-center py-16 space-y-4">
            <div className="text-5xl">🎪</div>
            <h2 className="font-semibold text-gray-800">No conferences yet</h2>
            <p className="text-sm text-gray-400 max-w-xs mx-auto">
              Create your first conference, or join one your colleague set up with their join code.
            </p>
            <div className="flex gap-3 justify-center">
              <Link href="/conferences/join" className="btn-secondary inline-block">🔑 Join with Code</Link>
              <Link href="/conferences/new"  className="btn-primary  inline-block">Create Conference</Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {conferences.map(c => (
              <Link key={c.id as string} href={`/conferences/${c.id as string}`}
                className="card-hover flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 ${
                  c.is_active ? 'bg-indigo-600 text-white' : 'bg-gray-100'
                }`}>🎪</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 truncate">{c.name as string}</p>
                    {c.is_active && (
                      <span className="text-xs bg-indigo-100 text-indigo-700 font-medium px-2 py-0.5 rounded-full">Active</span>
                    )}
                    {c.member_role === 'member' && (
                      <span className="text-xs bg-gray-100 text-gray-500 font-medium px-2 py-0.5 rounded-full">Joined</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {[c.location, c.start_date && new Date(c.start_date as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })]
                      .filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className="text-gray-400 text-lg">→</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
