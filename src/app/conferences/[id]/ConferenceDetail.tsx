'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Conference, ConferenceDocument, ConferenceAttendee } from '@/types/database'

type MeetingRow = { id: string; meeting_date: string; status: string; outcome: string | null; contact?: { full_name: string; company: string } }
type Tab = 'overview' | 'attendees' | 'documents' | 'meetings'

const FILE_TYPE_LABELS: Record<string, string> = {
  attendee_list:    '👥 Attendee List',
  crm_export:       '📊 CRM Export',
  battlecard:       '⚔️ Battlecard',
  product_sheet:    '📄 Product Sheet',
  competitor_intel: '🔍 Competitor Intel',
  other:            '📎 Document',
}

const OUTCOME_CONFIG: Record<string, { label: string; color: string }> = {
  hot:              { label: '🔥 Hot',           color: 'bg-red-100 text-red-700'    },
  follow_up:        { label: '📅 Follow Up',      color: 'bg-amber-100 text-amber-700' },
  not_interested:   { label: '❌ Not Interested', color: 'bg-gray-100 text-gray-500'  },
  intro_needed:     { label: '🤝 Intro Needed',   color: 'bg-blue-100 text-blue-700'  },
  closed:           { label: '✅ Closed',          color: 'bg-green-100 text-green-700' },
}

interface Props {
  conference: Conference
  documents:  ConferenceDocument[]
  attendees:  ConferenceAttendee[]
  meetings:   MeetingRow[]
}

export default function ConferenceDetail({ conference, documents: initialDocs, attendees: initialAttendees, meetings }: Props) {
  const [tab, setTab]             = useState<Tab>('overview')
  const [docs, setDocs]           = useState(initialDocs)
  const [attendees, setAttendees] = useState(initialAttendees)
  const [uploadingDoc, setUploadingDoc]   = useState(false)
  const [uploadingAtt, setUploadingAtt]   = useState(false)
  const [docFileType, setDocFileType]     = useState<string>('other')
  const [uploadMsg, setUploadMsg]         = useState<string | null>(null)
  const [precaching, setPrecaching]       = useState(false)
  const [isActive, setIsActive]           = useState(conference.is_active)
  const docFileRef = useRef<HTMLInputElement>(null)
  const attFileRef = useRef<HTMLInputElement>(null)
  const router     = useRouter()

  // ── Set as active conference ──────────────────────────────────────────────────
  async function setActive() {
    await fetch(`/api/conferences/${conference.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ is_active: true }),
    })
    setIsActive(true)
    // Store in localStorage so AppShell and other pages can read it
    localStorage.setItem('active_conference_id',   conference.id)
    localStorage.setItem('active_conference_name', conference.name)
  }

  // ── Upload document ───────────────────────────────────────────────────────────
  async function handleDocUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingDoc(true)
    setUploadMsg(null)

    const fd = new FormData()
    fd.append('file',      file)
    fd.append('file_type', docFileType)

    const res  = await fetch(`/api/conferences/${conference.id}/documents`, { method: 'POST', body: fd })
    const data = await res.json()
    setUploadingDoc(false)

    if (data.document) {
      setDocs(prev => [data.document, ...prev])
      setUploadMsg(`✓ ${file.name} uploaded and processed`)
      // If it was an attendee list, also process as attendees
      if (docFileType === 'attendee_list') handleAttendeeUpload(file)
    } else {
      setUploadMsg(`Error: ${data.error}`)
    }
    if (docFileRef.current) docFileRef.current.value = ''
  }

  // ── Upload attendee list ──────────────────────────────────────────────────────
  async function handleAttendeeUpload(file: File) {
    setUploadingAtt(true)
    const fd = new FormData()
    fd.append('file', file)

    const res  = await fetch(`/api/conferences/${conference.id}/attendees`, { method: 'POST', body: fd })
    const data = await res.json()
    setUploadingAtt(false)

    if (data.total) {
      setUploadMsg(`✓ Imported ${data.total} attendees · ${data.crm_matched} matched in CRM · ${data.targets} targets flagged`)
      // Refresh attendee list
      const r2 = await fetch(`/api/conferences/${conference.id}`)
      const d2 = await r2.json()
      if (d2.attendees) setAttendees(d2.attendees)
    }
  }

  // ── Pre-cache intel ───────────────────────────────────────────────────────────
  async function handlePrecache() {
    setPrecaching(true)
    setUploadMsg('Generating intel for your top accounts... this takes ~1 min')
    const res  = await fetch(`/api/conferences/${conference.id}/precache-intel`, { method: 'POST' })
    const data = await res.json()
    setPrecaching(false)
    setUploadMsg(`✓ Intel cached for ${data.cached} companies`)
  }

  // ── Delete document ───────────────────────────────────────────────────────────
  async function deleteDoc(docId: string) {
    await fetch(`/api/conferences/${conference.id}/documents?doc_id=${docId}`, { method: 'DELETE' })
    setDocs(prev => prev.filter(d => d.id !== docId))
  }

  // ── Toggle target ─────────────────────────────────────────────────────────────
  async function toggleTarget(attendeeId: string, current: boolean) {
    await fetch(`/api/conferences/${conference.id}/attendees`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ attendee_id: attendeeId, is_target: !current }),
    })
    setAttendees(prev => prev.map(a => a.id === attendeeId ? { ...a, is_target: !current } : a))
  }

  const targets      = attendees.filter(a => a.is_target).length
  const crmMatched   = attendees.filter(a => a.crm_match_id).length
  const hotMeetings  = meetings.filter(m => m.outcome === 'hot').length

  return (
    <div className="min-h-screen bg-gray-50 pb-6">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-start gap-3">
          <Link href="/conferences" className="text-gray-500 mt-0.5">←</Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-bold text-gray-900 truncate">{conference.name}</h1>
              {isActive
                ? <span className="text-xs bg-indigo-100 text-indigo-700 font-medium px-2 py-0.5 rounded-full">Active</span>
                : <button onClick={setActive} className="text-xs text-indigo-500 font-medium hover:underline">Set as active</button>
              }
            </div>
            {conference.location && (
              <p className="text-xs text-gray-400 mt-0.5">
                {conference.location}{conference.start_date ? ` · ${new Date(conference.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
              </p>
            )}
          </div>
          <Link href="/contacts/scan" className="btn-primary text-sm py-1.5 px-3 flex-shrink-0">📷 Scan</Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {/* Tab bar */}
        <div className="flex bg-gray-100 rounded-xl p-1 mb-4">
          {([
            { key: 'overview',   label: '📊 Overview'  },
            { key: 'attendees',  label: `👥 Attendees${attendees.length > 0 ? ` (${attendees.length})` : ''}` },
            { key: 'documents',  label: `📁 Docs${docs.length > 0 ? ` (${docs.length})` : ''}` },
            { key: 'meetings',   label: `🎙️ Meetings${meetings.length > 0 ? ` (${meetings.length})` : ''}` },
          ] as { key: Tab; label: string }[]).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors truncate ${tab === t.key ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Flash message */}
        {uploadMsg && (
          <div className={`text-sm rounded-xl p-3 mb-4 ${uploadMsg.startsWith('Error') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
            {uploadMsg}
          </div>
        )}

        {/* ── Overview ──────────────────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div className="space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Attendees', value: attendees.length, icon: '👥' },
                { label: 'Targets',   value: targets,          icon: '🎯' },
                { label: 'Meetings',  value: meetings.length,  icon: '🎙️' },
                { label: 'Hot Leads', value: hotMeetings,      icon: '🔥' },
              ].map(k => (
                <div key={k.label} className="card text-center py-3">
                  <div className="text-lg">{k.icon}</div>
                  <div className="text-lg font-bold text-indigo-600">{k.value}</div>
                  <div className="text-xs text-gray-400">{k.label}</div>
                </div>
              ))}
            </div>

            {/* Description */}
            {conference.description && (
              <div className="card">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Goals & Notes</p>
                <p className="text-sm text-gray-700">{conference.description}</p>
              </div>
            )}

            {/* Quick actions */}
            <div className="card space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Quick Actions</p>
              <div className="space-y-2">
                <button onClick={() => setTab('documents')} className="w-full text-left flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                  <span className="text-xl">📁</span>
                  <div>
                    <p className="text-sm font-medium text-gray-800">Upload Documents</p>
                    <p className="text-xs text-gray-400">Attendee lists, battlecards, product sheets</p>
                  </div>
                </button>
                <button onClick={handlePrecache} disabled={precaching || attendees.length === 0} className="w-full text-left flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
                  <span className="text-xl">{precaching ? '⟳' : '🧠'}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{precaching ? 'Generating intel...' : 'Pre-generate Intel'}</p>
                    <p className="text-xs text-gray-400">Cache briefs for all target companies now</p>
                  </div>
                </button>
                <Link href="/contacts/scan" className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                  <span className="text-xl">📷</span>
                  <div>
                    <p className="text-sm font-medium text-gray-800">Scan Badge</p>
                    <p className="text-xs text-gray-400">Capture a new contact</p>
                  </div>
                </Link>
              </div>
            </div>

            {/* CRM match summary */}
            {attendees.length > 0 && (
              <div className="card bg-indigo-50 border-indigo-100">
                <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wide mb-2">CRM Cross-reference</p>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div><p className="font-bold text-indigo-700">{crmMatched}</p><p className="text-xs text-indigo-500">CRM matched</p></div>
                  <div><p className="font-bold text-indigo-700">{targets}</p><p className="text-xs text-indigo-500">targets</p></div>
                  <div><p className="font-bold text-indigo-700">{attendees.length - crmMatched}</p><p className="text-xs text-indigo-500">unknown</p></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Attendees ─────────────────────────────────────────────────────── */}
        {tab === 'attendees' && (
          <div className="space-y-3">
            {/* Upload attendee list */}
            <div className="card space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Upload Attendee List</p>
              <p className="text-sm text-gray-500">CSV or Excel from the conference organiser. ConfBuddy auto-matches against your CRM.</p>
              <button
                onClick={() => attFileRef.current?.click()}
                disabled={uploadingAtt}
                className="btn-secondary w-full"
              >
                {uploadingAtt ? 'Processing...' : '📋 Upload Attendee List'}
              </button>
              <input ref={attFileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleAttendeeUpload(f) }} />
            </div>

            {attendees.length === 0 ? (
              <div className="card text-center py-10 text-gray-400 text-sm">No attendees yet — upload the conference attendee list</div>
            ) : (
              <div className="space-y-2">
                {/* Targets first */}
                {targets > 0 && (
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">🎯 Targets ({targets})</p>
                )}
                {attendees.map(a => (
                  <div key={a.id} className={`card flex items-center gap-3 ${a.is_target ? 'border-indigo-200 bg-indigo-50' : ''}`}>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                      a.is_target ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {a.full_name?.[0] ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{a.full_name ?? a.email ?? '—'}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {[a.title, a.company].filter(Boolean).join(' · ')}
                      </p>
                      {a.crm_match_id && <p className="text-xs text-indigo-500 font-medium">✓ In CRM</p>}
                    </div>
                    <button
                      onClick={() => toggleTarget(a.id, a.is_target)}
                      className={`text-xs font-medium px-2 py-1 rounded-lg flex-shrink-0 transition-colors ${
                        a.is_target
                          ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {a.is_target ? '🎯 Target' : 'Set target'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Documents ─────────────────────────────────────────────────────── */}
        {tab === 'documents' && (
          <div className="space-y-3">
            {/* Upload form */}
            <div className="card space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Upload Document</p>
              <div className="space-y-2">
                <select
                  value={docFileType}
                  onChange={e => setDocFileType(e.target.value)}
                  className="input w-full text-sm"
                >
                  <option value="attendee_list">👥 Attendee List (auto-imports contacts)</option>
                  <option value="crm_export">📊 CRM Export</option>
                  <option value="battlecard">⚔️ Battlecard</option>
                  <option value="product_sheet">📄 Product Sheet</option>
                  <option value="competitor_intel">🔍 Competitor Intelligence</option>
                  <option value="other">📎 Other Document</option>
                </select>
                <button
                  onClick={() => docFileRef.current?.click()}
                  disabled={uploadingDoc}
                  className="btn-secondary w-full"
                >
                  {uploadingDoc ? 'Processing...' : '📁 Upload File'}
                </button>
              </div>
              <input ref={docFileRef} type="file" accept=".csv,.xlsx,.xls,.pdf,.txt,.md,.docx" className="hidden" onChange={handleDocUpload} />
              <p className="text-xs text-gray-400">Supports CSV, Excel, PDF, TXT. These documents are used as context when generating intelligence briefs.</p>
            </div>

            {docs.length === 0 ? (
              <div className="card text-center py-10 text-gray-400 text-sm">No documents yet</div>
            ) : (
              <div className="space-y-2">
                {docs.map(d => (
                  <div key={d.id} className="card flex items-center gap-3">
                    <div className="text-2xl flex-shrink-0">📄</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{d.filename}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-400">{FILE_TYPE_LABELS[d.file_type] ?? d.file_type}</span>
                        {d.row_count != null && <span className="text-xs text-gray-400">{d.row_count} rows</span>}
                        {d.processed_at && <span className="text-xs text-green-600">✓ Processed</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteDoc(d.id)}
                      className="text-gray-300 hover:text-red-400 transition-colors text-lg flex-shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Meetings ──────────────────────────────────────────────────────── */}
        {tab === 'meetings' && (
          <div className="space-y-2">
            <Link href={`/meetings/new`} className="card flex items-center gap-3 border-dashed border-indigo-200 hover:border-indigo-400 transition-colors">
              <span className="text-2xl">➕</span>
              <span className="text-sm font-medium text-indigo-600">Record a new meeting</span>
            </Link>

            {meetings.length === 0 && (
              <div className="card text-center py-10 text-gray-400 text-sm">No meetings at this conference yet</div>
            )}

            {meetings.map(m => {
              const outcome = m.outcome ? OUTCOME_CONFIG[m.outcome] : null
              return (
                <Link key={m.id} href={`/meetings/${m.id}`} className="card-hover flex items-center gap-3">
                  <div className="w-9 h-9 bg-purple-100 rounded-full flex items-center justify-center text-xl flex-shrink-0">🎙️</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{m.contact?.full_name ?? 'Unknown'}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {m.contact?.company} · {new Date(m.meeting_date).toLocaleDateString()}
                    </p>
                  </div>
                  {outcome && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${outcome.color}`}>
                      {outcome.label}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
