'use client'
import { useState } from 'react'
import Link from 'next/link'
import CompanyIntel from '@/components/company-intel/CompanyIntel'
import type { CompanyIntelData } from '@/components/company-intel/CompanyIntel'

async function pushMeetingToSalesforce(meetingId: string): Promise<{ success?: boolean; error?: string; linked_to_contact?: boolean }> {
  const res = await fetch('/api/salesforce/push-notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ meeting_id: meetingId }),
  })
  return res.json()
}

interface Contact {
  id: string
  full_name: string
  title?: string
  company?: string
  email?: string
  phone?: string
  linkedin_url?: string
  company_summary?: string
  systems_landscape?: string[]
  crm_relationship?: string
  crm_temperature?: string
  crm_notes?: string
}

interface Meeting {
  id: string
  meeting_date: string
  status: string
  cb_meeting_notes?: Array<{ bottom_line_summary: string }>
}

interface Props {
  contact: Contact
  meetings: Meeting[]
  cachedIntel?: CompanyIntelData | null
  shouldAutoGenerate?: boolean
}

type Tab = 'profile' | 'intelligence' | 'meetings'

export default function ContactDetail({ contact, meetings, cachedIntel, shouldAutoGenerate = false }: Props) {
  const [tab, setTab] = useState<Tab>('profile')
  const [sfPushState, setSfPushState] = useState<Record<string, 'idle' | 'pushing' | 'done' | 'error'>>({})
  const [sfPushMsg, setSfPushMsg] = useState<Record<string, string>>({})

  async function handleSfPush(meetingId: string) {
    setSfPushState(s => ({ ...s, [meetingId]: 'pushing' }))
    const result = await pushMeetingToSalesforce(meetingId)
    if (result.success) {
      setSfPushState(s => ({ ...s, [meetingId]: 'done' }))
      setSfPushMsg(m => ({ ...m, [meetingId]: result.linked_to_contact ? 'Logged to Salesforce contact' : 'Logged to Salesforce (no matching contact found)' }))
    } else {
      setSfPushState(s => ({ ...s, [meetingId]: 'error' }))
      setSfPushMsg(m => ({ ...m, [meetingId]: result.error ?? 'Push failed' }))
    }
  }

  const systems = contact.systems_landscape as string[] | null

  return (
    <div className="min-h-screen bg-gray-50 pb-6">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <Link href="/contacts" className="text-gray-500 text-lg">←</Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-gray-900 truncate">{contact.full_name}</h1>
          {contact.company && <p className="text-xs text-gray-500 truncate">{contact.title ? `${contact.title} · ` : ''}{contact.company}</p>}
        </div>
        <Link
          href={`/meetings/new?contact_id=${contact.id}&contact_name=${encodeURIComponent(contact.full_name)}`}
          className="btn-primary text-sm py-2 px-4 flex-shrink-0"
        >
          🎙️ Meet
        </Link>
      </header>

      {/* Identity card — always visible */}
      <div className="px-4 pt-4 max-w-lg mx-auto">
        <div className="card flex items-center gap-4 mb-4">
          <div className="w-14 h-14 bg-indigo-100 rounded-full flex items-center justify-center text-2xl font-bold text-indigo-600 flex-shrink-0">
            {contact.full_name[0]}
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-base text-gray-900">{contact.full_name}</h2>
            {contact.title    && <p className="text-sm text-gray-500">{contact.title}</p>}
            {contact.company  && <p className="text-sm text-gray-500">{contact.company}</p>}
            {contact.email    && <p className="text-xs text-indigo-500 mt-0.5 truncate">{contact.email}</p>}
            {contact.phone    && <p className="text-xs text-gray-400">{contact.phone}</p>}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex bg-gray-100 rounded-xl p-1 mb-4">
          {([
            { key: 'profile',       label: '👤 Profile' },
            { key: 'intelligence',  label: '🔭 Intel' },
            { key: 'meetings',      label: `🎙️ Meetings${meetings.length > 0 ? ` (${meetings.length})` : ''}` },
          ] as { key: Tab; label: string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                tab === t.key ? 'bg-white shadow text-indigo-600' : 'text-gray-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Profile tab ──────────────────────────────────────────────── */}
        {tab === 'profile' && (
          <div className="space-y-4">
            {/* CRM Context */}
            {contact.crm_relationship && contact.crm_relationship !== 'unknown' && (
              <div className="card bg-indigo-50 border-indigo-100">
                <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wide mb-2">CRM Context</p>
                <div className="flex gap-2 mb-2 flex-wrap">
                  <span className={`badge-${contact.crm_relationship}`}>{contact.crm_relationship}</span>
                  {contact.crm_temperature && contact.crm_temperature !== 'unknown' && (
                    <span className={`badge-${contact.crm_temperature}`}>{contact.crm_temperature}</span>
                  )}
                </div>
                {contact.crm_notes && <p className="text-sm text-gray-600">{contact.crm_notes}</p>}
              </div>
            )}

            {/* Company snapshot (from badge enrich) */}
            {contact.company_summary && (
              <div className="card">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">🏢 Company Snapshot</p>
                <p className="text-sm text-gray-600 leading-relaxed">{contact.company_summary}</p>
                {contact.company && (
                  <button
                    onClick={() => setTab('intelligence')}
                    className="mt-3 text-xs text-indigo-500 font-medium hover:text-indigo-700 transition-colors"
                  >
                    View full intelligence brief →
                  </button>
                )}
              </div>
            )}

            {/* Systems */}
            {systems && systems.length > 0 && (
              <div className="card">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">🖥️ Systems & Tools</p>
                <div className="flex flex-wrap gap-2">
                  {systems.map((tool: string) => (
                    <span key={tool} className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">{tool}</span>
                  ))}
                </div>
              </div>
            )}

            {/* LinkedIn */}
            {contact.linkedin_url && (
              <a
                href={contact.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="card flex items-center gap-2 hover:border-indigo-200 transition-colors"
              >
                <span className="text-xl">💼</span>
                <span className="text-sm text-indigo-600 font-medium">View LinkedIn Profile</span>
              </a>
            )}

            {/* Intel preview card — shows on Profile tab */}
            {contact.company && (
              <div className="card">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">🔭 Intelligence Brief</p>
                  <button
                    onClick={() => setTab('intelligence')}
                    className="text-xs text-indigo-500 font-medium hover:text-indigo-700 transition-colors"
                  >
                    Full brief →
                  </button>
                </div>

                {cachedIntel ? (
                  <div className="space-y-2">
                    {cachedIntel.snapshot && (
                      <p className="text-sm text-gray-700 leading-snug">{cachedIntel.snapshot}</p>
                    )}
                    {cachedIntel.talking_points && cachedIntel.talking_points.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-gray-400 mb-1">Top talking point</p>
                        <p className="text-sm text-indigo-700 font-medium leading-snug">
                          {cachedIntel.talking_points[0]}
                        </p>
                      </div>
                    )}
                    {cachedIntel.risks && cachedIntel.risks.length > 0 && (
                      <div className="bg-amber-50 rounded-lg px-3 py-2 mt-1">
                        <p className="text-xs text-amber-700">
                          ⚠️ {cachedIntel.risks[0]}
                        </p>
                      </div>
                    )}
                  </div>
                ) : shouldAutoGenerate ? (
                  <div className="flex items-center gap-2 py-2">
                    <div className="text-lg animate-pulse">🔍</div>
                    <div>
                      <p className="text-sm text-gray-600 font-medium">Generating intel brief...</p>
                      <p className="text-xs text-gray-400">Using CRM data, Salesforce &amp; public sources</p>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setTab('intelligence')}
                    className="text-sm text-indigo-500 font-medium"
                  >
                    Generate intel for {contact.company} →
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Intelligence tab ─────────────────────────────────────────── */}
        {tab === 'intelligence' && contact.company && (
          <CompanyIntel
            company={contact.company}
            contactId={contact.id}
            initialIntel={cachedIntel}
            autoFetch={shouldAutoGenerate}
          />
        )}
        {tab === 'intelligence' && !contact.company && (
          <div className="card text-center py-8 text-gray-400 text-sm">
            No company on file — scan a badge or add company name to the contact to enable intelligence.
          </div>
        )}

        {/* ── Meetings tab ─────────────────────────────────────────────── */}
        {tab === 'meetings' && (
          <div className="space-y-2">
            <Link
              href={`/meetings/new?contact_id=${contact.id}&contact_name=${encodeURIComponent(contact.full_name)}`}
              className="card flex items-center gap-3 border-dashed border-indigo-200 hover:border-indigo-400 transition-colors"
            >
              <span className="text-2xl">➕</span>
              <span className="text-sm font-medium text-indigo-600">Record a new meeting</span>
            </Link>

            {meetings.length === 0 && (
              <div className="card text-center py-8 text-gray-400 text-sm">No meetings yet</div>
            )}

            {meetings.map(m => (
              <div key={m.id} className="card space-y-2">
                <Link
                  href={`/meetings/${m.id}`}
                  className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                >
                  <span className="text-2xl">🗓️</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {new Date(m.meeting_date).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </p>
                    {m.cb_meeting_notes?.[0]?.bottom_line_summary && (
                      <p className="text-xs text-gray-400 truncate">
                        {m.cb_meeting_notes[0].bottom_line_summary.split('\n')[0]}
                      </p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                    m.status === 'notes_ready' ? 'bg-green-100 text-green-700' :
                    m.status === 'processing'  ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {m.status.replace('_', ' ')}
                  </span>
                </Link>

                {/* Push to Salesforce */}
                {m.status === 'notes_ready' && (
                  <div className="flex items-center gap-2 pt-1 border-t border-gray-50">
                    {sfPushState[m.id] === 'done' ? (
                      <p className="text-xs text-green-600">✓ {sfPushMsg[m.id]}</p>
                    ) : sfPushState[m.id] === 'error' ? (
                      <p className="text-xs text-red-500">{sfPushMsg[m.id]}</p>
                    ) : (
                      <button
                        onClick={() => handleSfPush(m.id)}
                        disabled={sfPushState[m.id] === 'pushing'}
                        className="text-xs text-gray-400 hover:text-indigo-600 transition-colors font-medium"
                      >
                        {sfPushState[m.id] === 'pushing' ? 'Logging...' : '☁️ Log to Salesforce'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
