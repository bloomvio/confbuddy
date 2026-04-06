import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AppShell from '@/components/ui/AppShell'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const today = new Date().toISOString().split('T')[0]
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [
    { data: contacts },
    { data: meetings },
    { data: actionItemsDue },
    { data: atRiskContacts },
    { data: hotProspects },
    { data: renewalsDue },
    { data: pipelineContacts },
  ] = await Promise.all([
    supabase.from('cb_contacts').select('id').eq('user_id', user.id),

    supabase
      .from('cb_meetings')
      .select('*, contact:cb_contacts(full_name, company)')
      .order('meeting_date', { ascending: false })
      .limit(4),

    // Action items due today or overdue
    supabase
      .from('cb_action_items')
      .select('*, meeting:cb_meetings(id, contact:cb_contacts(full_name))')
      .eq('user_id', user.id)
      .eq('is_complete', false)
      .lte('due_date', today)
      .order('due_date', { ascending: true })
      .limit(5),

    // At-risk: customers with cold temp or red crm indicator
    supabase
      .from('cb_contacts')
      .select('id, full_name, company, crm_temperature, crm_relationship, crm_notes')
      .eq('user_id', user.id)
      .eq('crm_relationship', 'customer')
      .in('crm_temperature', ['cold', 'unknown'])
      .limit(4),

    // Hot prospects
    supabase
      .from('cb_contacts')
      .select('id, full_name, company, title, pipeline_stage, deal_size, event_name')
      .eq('user_id', user.id)
      .eq('crm_relationship', 'prospect')
      .eq('crm_temperature', 'hot')
      .order('created_at', { ascending: false })
      .limit(4),

    // Renewals coming up in 30 days from crm data
    supabase
      .from('cb_crm_data')
      .select('full_name, company, renewal_date, arr, account_owner')
      .eq('user_id', user.id)
      .gte('renewal_date', today)
      .lte('renewal_date', in30Days)
      .order('renewal_date', { ascending: true })
      .limit(4),

    // Active pipeline
    supabase
      .from('cb_contacts')
      .select('id, full_name, company, pipeline_stage, deal_size, crm_temperature')
      .eq('user_id', user.id)
      .not('pipeline_stage', 'is', null)
      .not('pipeline_stage', 'in', '("closed_won","closed_lost")')
      .order('deal_size', { ascending: false })
      .limit(5),
  ])

  const totalContacts = contacts?.length ?? 0
  const totalMeetings = meetings?.length ?? 0
  const notesReady = meetings?.filter(m => m.status === 'notes_ready').length ?? 0
  const pipelineValue = pipelineContacts?.reduce((sum, c) => sum + (c.deal_size ?? 0), 0) ?? 0

  const stageLabel: Record<string, string> = {
    prospect: 'Prospect',
    qualified: 'Qualified',
    proposal: 'Proposal',
    negotiation: 'Negotiation',
    closed_won: 'Closed Won',
    closed_lost: 'Closed Lost',
  }
  const stageColor: Record<string, string> = {
    prospect: 'bg-gray-100 text-gray-600',
    qualified: 'bg-blue-100 text-blue-700',
    proposal: 'bg-indigo-100 text-indigo-700',
    negotiation: 'bg-amber-100 text-amber-700',
    closed_won: 'bg-green-100 text-green-700',
    closed_lost: 'bg-red-100 text-red-600',
  }

  return (
    <AppShell>
      <div className="px-4 md:px-8 py-5 max-w-4xl mx-auto space-y-6">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Sales Cockpit</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <Link href="/settings"
            className="w-9 h-9 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {user.email?.[0].toUpperCase()}
          </Link>
        </div>

        {/* ── Quick actions ────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { href: '/contacts/scan', icon: '📷', label: 'Scan Badge', sub: 'Capture contact', bg: 'bg-indigo-50' },
            { href: '/meetings/new',  icon: '🎙️', label: 'Record',     sub: 'Start meeting',  bg: 'bg-purple-50' },
            { href: '/action-items',  icon: '✅', label: 'Actions',    sub: `${actionItemsDue?.length ?? 0} due`, bg: (actionItemsDue?.length ?? 0) > 0 ? 'bg-red-50' : 'bg-gray-50' },
          ].map(a => (
            <Link key={a.href} href={a.href}
              className={`${a.bg} rounded-2xl p-3 flex flex-col items-center text-center hover:opacity-80 transition-opacity`}>
              <span className="text-2xl mb-1">{a.icon}</span>
              <p className="text-xs font-semibold text-gray-800">{a.label}</p>
              <p className="text-xs text-gray-500">{a.sub}</p>
            </Link>
          ))}
        </div>

        {/* ── KPI strip ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Contacts',  value: totalContacts,  icon: '👥', color: 'text-indigo-600' },
            { label: 'Meetings',  value: totalMeetings,  icon: '🗓️', color: 'text-purple-600' },
            { label: 'Notes',     value: notesReady,     icon: '📄', color: 'text-emerald-600' },
            { label: 'Pipeline',  value: pipelineValue > 0 ? `$${(pipelineValue / 1000).toFixed(0)}K` : '—', icon: '💰', color: 'text-amber-600' },
          ].map(s => (
            <div key={s.label} className="card text-center py-3 px-1">
              <div className="text-lg mb-0.5">{s.icon}</div>
              <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-400">{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Overdue action items alert ───────────────────────────────── */}
        {actionItemsDue && actionItemsDue.length > 0 && (
          <div className="card border-red-200 bg-red-50">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-red-500 uppercase tracking-wide">⚠️ Overdue Action Items</p>
              <Link href="/action-items" className="text-xs text-red-500 font-medium hover:underline">View all →</Link>
            </div>
            <div className="space-y-1.5">
              {actionItemsDue.map(a => (
                <div key={a.id} className="flex items-start gap-2">
                  <span className="text-red-400 mt-0.5 flex-shrink-0">!</span>
                  <div className="min-w-0">
                    <p className="text-sm text-red-800 leading-snug">{a.description}</p>
                    <p className="text-xs text-red-400">
                      {(a.meeting as { contact?: { full_name: string } })?.contact?.full_name} · due {a.due_date}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Hot prospects ────────────────────────────────────────────── */}
        {hotProspects && hotProspects.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-gray-900">🔥 Hot Prospects</h2>
              <Link href="/contacts?filter=hot" className="text-xs text-indigo-600 font-medium hover:underline">View all →</Link>
            </div>
            <div className="space-y-2">
              {hotProspects.map(c => (
                <Link key={c.id} href={`/contacts/${c.id}`}
                  className="card-hover flex items-center gap-3">
                  <div className="w-9 h-9 bg-red-100 rounded-full flex items-center justify-center text-red-700 font-bold text-sm flex-shrink-0">
                    {c.full_name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-900 truncate">{c.full_name}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {c.company}{c.event_name ? ` · ${c.event_name}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0 items-center">
                    {c.deal_size && (
                      <span className="text-xs font-semibold text-green-700">
                        ${(c.deal_size / 1000).toFixed(0)}K
                      </span>
                    )}
                    {c.pipeline_stage && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stageColor[c.pipeline_stage] ?? 'bg-gray-100 text-gray-600'}`}>
                        {stageLabel[c.pipeline_stage] ?? c.pipeline_stage}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── At-risk customers ────────────────────────────────────────── */}
        {atRiskContacts && atRiskContacts.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-gray-900">🚨 At-Risk Customers</h2>
              <Link href="/contacts?filter=customer" className="text-xs text-indigo-600 font-medium hover:underline">View all →</Link>
            </div>
            <div className="space-y-2">
              {atRiskContacts.map(c => (
                <Link key={c.id} href={`/contacts/${c.id}`}
                  className="card-hover flex items-center gap-3 border-l-4 border-l-red-300">
                  <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 font-bold text-sm flex-shrink-0">
                    {c.full_name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-900 truncate">{c.full_name}</p>
                    <p className="text-xs text-gray-400 truncate">{c.company}</p>
                  </div>
                  <span className="badge-cold flex-shrink-0">cold</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Upcoming renewals ────────────────────────────────────────── */}
        {renewalsDue && renewalsDue.length > 0 && (
          <div>
            <h2 className="font-semibold text-gray-900 mb-2">📅 Renewals in 30 Days</h2>
            <div className="space-y-2">
              {renewalsDue.map((r, i) => (
                <div key={i} className="card flex items-center gap-3">
                  <div className="w-9 h-9 bg-amber-100 rounded-full flex items-center justify-center text-amber-700 font-bold text-sm flex-shrink-0">
                    {r.company?.[0] ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-900 truncate">{r.full_name ?? r.company}</p>
                    <p className="text-xs text-gray-400 truncate">{r.company}{r.arr ? ` · $${(r.arr / 1000).toFixed(0)}K ARR` : ''}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-semibold text-amber-600">
                      {new Date(r.renewal_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                    {r.account_owner && <p className="text-xs text-gray-400">{r.account_owner}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Active pipeline ──────────────────────────────────────────── */}
        {pipelineContacts && pipelineContacts.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-gray-900">💼 Active Pipeline</h2>
              <Link href="/contacts?filter=pipeline" className="text-xs text-indigo-600 font-medium hover:underline">View all →</Link>
            </div>
            <div className="space-y-2">
              {pipelineContacts.map(c => (
                <Link key={c.id} href={`/contacts/${c.id}`}
                  className="card-hover flex items-center gap-3">
                  <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold text-sm flex-shrink-0">
                    {c.full_name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-900 truncate">{c.full_name}</p>
                    <p className="text-xs text-gray-400 truncate">{c.company}</p>
                  </div>
                  <div className="flex gap-1 items-center flex-shrink-0">
                    {c.deal_size && (
                      <span className="text-xs font-bold text-gray-800">
                        ${(c.deal_size / 1000).toFixed(0)}K
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stageColor[c.pipeline_stage!] ?? 'bg-gray-100 text-gray-600'}`}>
                      {stageLabel[c.pipeline_stage!] ?? c.pipeline_stage}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Recent meetings ──────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-gray-900">🗓️ Recent Meetings</h2>
            <Link href="/meetings" className="text-xs text-indigo-600 font-medium hover:underline">View all →</Link>
          </div>
          <div className="space-y-2">
            {!meetings?.length && (
              <div className="card text-center py-8">
                <p className="text-2xl mb-1">🎙️</p>
                <p className="text-sm text-gray-400">No meetings yet</p>
              </div>
            )}
            {meetings?.map(m => (
              <Link key={m.id} href={`/meetings/${m.id}`} className="card-hover flex items-center gap-3">
                <div className="w-9 h-9 bg-purple-100 rounded-full flex items-center justify-center text-xl flex-shrink-0">🗓️</div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">
                    {(m.contact as { full_name: string })?.full_name ?? 'Unknown'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {(m.contact as { company: string })?.company} · {new Date(m.meeting_date).toLocaleDateString()}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                  m.status === 'notes_ready' ? 'bg-emerald-100 text-emerald-700' :
                  m.status === 'processing'  ? 'bg-amber-100 text-amber-700' :
                  'bg-gray-100 text-gray-500'
                }`}>{m.status.replace('_', ' ')}</span>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </AppShell>
  )
}
