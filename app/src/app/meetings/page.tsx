import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AppShell from '@/components/ui/AppShell'

export default async function MeetingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: meetings } = await supabase
    .from('cb_meetings')
    .select('*, contact:cb_contacts(full_name, company, title)')
    .order('meeting_date', { ascending: false })

  return (
    <AppShell>
    <div className="min-h-screen bg-gray-50 pb-24">
      <header className="bg-white border-b border-gray-100 px-4 py-4 flex items-center justify-between">
        <h1 className="font-semibold text-gray-900">🎙️ Meetings</h1>
        <Link href="/meetings/new" className="btn-primary text-sm py-2 px-4">+ Record</Link>
      </header>

      <div className="px-4 py-5 max-w-lg mx-auto space-y-2">
        {meetings?.length === 0 && (
          <div className="card text-center py-12">
            <div className="text-4xl mb-3">🎙️</div>
            <p className="font-medium text-gray-700">No meetings yet</p>
            <p className="text-sm text-gray-400 mt-1">Record your first conversation</p>
            <Link href="/meetings/new" className="btn-primary inline-block mt-4 text-sm py-2 px-6">
              🎙️ New Meeting
            </Link>
          </div>
        )}

        {meetings?.map((m: {
          id: string
          meeting_date: string
          status: string
          conference_name?: string
          contact?: { full_name: string; company: string; title: string }
        }) => (
          <Link key={m.id} href={`/meetings/${m.id}`}
            className="card flex items-center gap-3 hover:border-indigo-200 transition-colors">
            <div className="w-11 h-11 bg-purple-100 rounded-full flex items-center justify-center text-xl flex-shrink-0">
              🗓️
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{m.contact?.full_name ?? 'Unknown contact'}</p>
              <p className="text-xs text-gray-500 truncate">
                {m.contact?.company} · {new Date(m.meeting_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
              {m.conference_name && (
                <p className="text-xs text-gray-400 truncate">{m.conference_name}</p>
              )}
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
              m.status === 'notes_ready' ? 'bg-green-100 text-green-700' :
              m.status === 'processing' ? 'bg-amber-100 text-amber-700' :
              m.status === 'exported' ? 'bg-blue-100 text-blue-700' :
              'bg-gray-100 text-gray-500'
            }`}>{m.status.replace('_', ' ')}</span>
          </Link>
        ))}
      </div>
    </div>
    </AppShell>
  )
}
