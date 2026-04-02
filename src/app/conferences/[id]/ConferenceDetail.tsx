'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Conference, ConferenceDocument, ConferenceAttendee } from '@/types/database'

type MeetingRow  = { id: string; meeting_date: string; status: string; outcome: string | null; contact?: { full_name: string; company: string } }
type MemberRow   = { user_id: string; role: string; joined_at: string }
type Tab         = 'overview' | 'attendees' | 'documents' | 'meetings' | 'intel'
type IntelSubTab = 'internal' | 'public'

interface IntelRow {
  id: string
  company_name: string
  generated_at: string
  intel: Record<string, unknown>
}

const FILE_TYPE_LABELS: Record<string, string> = {
  attendee_list: '👥 Attendee List', crm_export: '📊 CRM Export',
  battlecard: '⚔️ Battlecard', product_sheet: '📄 Product Sheet',
  competitor_intel: '🔍 Competitor Intel', other: '📎 Document',
}

const OUTCOME_CONFIG: Record<string, { label: string; color: string }> = {
  hot:            { label: '🔥 Hot',           color: 'bg-red-100 text-red-700'    },
  follow_up:      { label: '📅 Follow Up',      color: 'bg-amber-100 text-amber-700' },
  not_interested: { label: '❌ Not Interested', color: 'bg-gray-100 text-gray-500'  },
  intro_needed:   { label: '🤝 Intro Needed',   color: 'bg-blue-100 text-blue-700'  },
  closed:         { label: '✅ Closed',          color: 'bg-green-100 text-green-700' },
}

function statusChip(s?: string) {
  if (s === 'customer')  return 'bg-green-100 text-green-700'
  if (s === 'prospect')  return 'bg-blue-100 text-blue-700'
  if (s === 'partner')   return 'bg-purple-100 text-purple-700'
  if (s === 'churned')   return 'bg-red-100 text-red-500'
  return 'bg-gray-100 text-gray-500'
}
function tempChip(t?: string) {
  if (t === 'hot')  return 'bg-red-100 text-red-600'
  if (t === 'warm') return 'bg-amber-100 text-amber-700'
  if (t === 'cold') return 'bg-indigo-100 text-indigo-600'
  return ''
}
function healthBorder(h?: string) {
  if (h === 'green')  return 'border-l-green-400'
  if (h === 'red')    return 'border-l-red-400'
  if (h === 'yellow' || h === 'amber') return 'border-l-amber-400'
  return 'border-l-gray-200'
}

interface Props {
  conference: Conference & { join_code?: string }
  documents:  ConferenceDocument[]
  attendees:  ConferenceAttendee[]
  meetings:   MeetingRow[]
  members:    MemberRow[]
  isOwner:    boolean
}

export default function ConferenceDetail({ conference, documents: initialDocs, attendees: initialAttendees, meetings, members, isOwner }: Props) {
  const [tab, setTab]             = useState<Tab>('overview')
  const [docs, setDocs]           = useState(initialDocs)
  const [attendees, setAttendees] = useState(initialAttendees)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [uploadingAtt, setUploadingAtt] = useState(false)
  const [docFileType, setDocFileType]   = useState<string>('other')
  const [uploadMsg, setUploadMsg]       = useState<string | null>(null)
  const [precaching, setPrecaching]     = useState(false)
  const [copied, setCopied]             = useState(false)
  const [isActive, setIsActive]         = useState(conference.is_active)

  // Attendees search
  const [attSearch, setAttSearch] = useState('')

  // Intel tab state
  const [intelRows, setIntelRows]       = useState<IntelRow[]>([])
  const [intelLoading, setIntelLoading] = useState(false)
  const [intelLoaded, setIntelLoaded]   = useState(false)
  const [intelSearch, setIntelSearch]   = useState('')
  const [expanded, setExpanded]         = useState<string | null>(null)   // company_name
  const [intelSubTab, setIntelSubTab]   = useState<IntelSubTab>('internal')
  const [totalCompanies, setTotalCompanies] = useState(0)

  const docFileRef = useRef<HTMLInputElement>(null)
  const attFileRef = useRef<HTMLInputElement>(null)
  const router     = useRouter()

  // ── Helpers ───────────────────────────────────────────────────────────────
  async function setActive() {
    await fetch(`/api/conferences/${conference.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: true }),
    })
    setIsActive(true)
    localStorage.setItem('active_conference_id',   conference.id)
    localStorage.setItem('active_conference_name', conference.name)
  }

  async function handleDocUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setUploadingDoc(true); setUploadMsg(null)
    const fd = new FormData(); fd.append('file', file); fd.append('file_type', docFileType)
    const res  = await fetch(`/api/conferences/${conference.id}/documents`, { method: 'POST', body: fd })
    const data = await res.json()
    setUploadingDoc(false)
    if (data.document) {
      setDocs(prev => [data.document, ...prev])
      setUploadMsg(`✓ ${file.name} uploaded and processed`)
      if (docFileType === 'attendee_list') handleAttendeeUpload(file)
    } else {
      setUploadMsg(`Error: ${data.error}`)
    }
    if (docFileRef.current) docFileRef.current.value = ''
  }

  async function handleAttendeeUpload(file: File) {
    setUploadingAtt(true)
    const fd = new FormData(); fd.append('file', file)
    const res  = await fetch(`/api/conferences/${conference.id}/attendees`, { method: 'POST', body: fd })
    const data = await res.json()
    setUploadingAtt(false)
    if (data.total) {
      setUploadMsg(`✓ Imported ${data.total} attendees · ${data.crm_matched} matched in CRM · ${data.targets} targets flagged`)
      const r2 = await fetch(`/api/conferences/${conference.id}`)
      const d2 = await r2.json()
      if (d2.attendees) setAttendees(d2.attendees)
    }
  }

  async function handlePrecache() {
    setPrecaching(true); setUploadMsg('Queuing intel generation...')
    const res  = await fetch(`/api/conferences/${conference.id}/precache-intel`, { method: 'POST' })
    const data = await res.json()
    setPrecaching(false)
    if (data.error) { setUploadMsg(`Error: ${data.error}`); return }
    setUploadMsg(`🔔 Generating intel for ${data.total} companies in the background — check the bell for updates.`)
  }

  async function fetchIntel() {
    if (intelLoaded) return
    setIntelLoading(true)
    const res  = await fetch(`/api/conferences/${conference.id}/intel`)
    const data = await res.json()
    setIntelLoading(false)
    setIntelLoaded(true)
    if (data.intel) { setIntelRows(data.intel); setTotalCompanies(data.total_companies ?? data.intel.length) }
  }

  function openIntelTab(company?: string) {
    setTab('intel')
    if (company) { setIntelSearch(company); setExpanded(company) }
    fetchIntel()
  }

  async function deleteDoc(docId: string) {
    await fetch(`/api/conferences/${conference.id}/documents?doc_id=${docId}`, { method: 'DELETE' })
    setDocs(prev => prev.filter(d => d.id !== docId))
  }

  async function toggleTarget(id: string, current: boolean) {
    await fetch(`/api/conferences/${conference.id}/attendees`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendee_id: id, is_target: !current }),
    })
    setAttendees(prev => prev.map(a => a.id === id ? { ...a, is_target: !current } : a))
  }

  const targets    = attendees.filter(a => a.is_target).length
  const crmMatched = attendees.filter(a => a.crm_match_id).length
  const hotMeetings = meetings.filter(m => m.outcome === 'hot').length

  const filteredAttendees = attSearch.trim()
    ? attendees.filter(a =>
        (a.full_name ?? '').toLowerCase().includes(attSearch.toLowerCase()) ||
        (a.company   ?? '').toLowerCase().includes(attSearch.toLowerCase()) ||
        (a.title     ?? '').toLowerCase().includes(attSearch.toLowerCase())
      )
    : attendees

  const filteredIntel = intelSearch.trim()
    ? intelRows.filter(r => r.company_name.toLowerCase().includes(intelSearch.toLowerCase()))
    : intelRows

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 pb-6">
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
        {/* Tab bar — two rows on mobile */}
        <div className="grid grid-cols-5 bg-gray-100 rounded-xl p-1 mb-4 gap-0.5">
          {([
            { key: 'overview',   label: '📊', full: 'Overview'  },
            { key: 'attendees',  label: '👥', full: `Attendees${attendees.length > 0 ? ` (${attendees.length})` : ''}` },
            { key: 'intel',      label: '🧠', full: `Intel${intelRows.length > 0 ? ` (${intelRows.length})` : ''}` },
            { key: 'documents',  label: '📁', full: `Docs${docs.length > 0 ? ` (${docs.length})` : ''}` },
            { key: 'meetings',   label: '🎙️', full: `Meetings${meetings.length > 0 ? ` (${meetings.length})` : ''}` },
          ] as { key: Tab; label: string; full: string }[]).map(t => (
            <button key={t.key}
              onClick={() => { setTab(t.key); if (t.key === 'intel') fetchIntel() }}
              className={`py-2 rounded-lg text-xs font-medium transition-colors ${tab === t.key ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}>
              <span className="md:hidden">{t.label}</span>
              <span className="hidden md:inline truncate">{t.full}</span>
            </button>
          ))}
        </div>

        {/* Flash message */}
        {uploadMsg && (
          <div className={`text-sm rounded-xl p-3 mb-4 ${uploadMsg.startsWith('Error') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
            {uploadMsg}
          </div>
        )}

        {/* ── Overview ──────────────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div className="space-y-4">
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

            {conference.description && (
              <div className="card">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Goals & Notes</p>
                <p className="text-sm text-gray-700">{conference.description}</p>
              </div>
            )}

            {conference.join_code && (
              <div className="card flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Team Join Code</p>
                  <p className="text-2xl font-bold tracking-[0.3em] text-indigo-700">{conference.join_code}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Share with your team to collaborate</p>
                </div>
                <button onClick={() => { navigator.clipboard.writeText(conference.join_code!); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                  className="btn-secondary text-sm flex-shrink-0">
                  {copied ? '✓ Copied' : '📋 Copy'}
                </button>
              </div>
            )}

            {members.length > 1 && (
              <div className="card">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Team ({members.length})</p>
                <div className="flex flex-wrap gap-2">
                  {members.map(m => (
                    <span key={m.user_id} className={`text-xs px-2 py-1 rounded-full font-medium ${m.role === 'owner' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>
                      {m.role === 'owner' ? '👑' : '👤'} {m.role}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="card space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Quick Actions</p>
              <div className="space-y-1">
                <button onClick={() => { setTab('intel'); fetchIntel() }} className="w-full text-left flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                  <span className="text-xl">🧠</span>
                  <div><p className="text-sm font-medium text-gray-800">Browse Intel</p><p className="text-xs text-gray-400">View pre-generated briefs for all companies</p></div>
                </button>
                <button onClick={handlePrecache} disabled={precaching} className="w-full text-left flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
                  <span className={`text-xl ${precaching ? 'animate-spin' : ''}`}>{precaching ? '⟳' : '⚡'}</span>
                  <div><p className="text-sm font-medium text-gray-800">{precaching ? 'Queuing...' : 'Pre-generate Intel'}</p><p className="text-xs text-gray-400">Cache briefs for all companies in background</p></div>
                </button>
                <button onClick={() => setTab('documents')} className="w-full text-left flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                  <span className="text-xl">📁</span>
                  <div><p className="text-sm font-medium text-gray-800">Upload Documents</p><p className="text-xs text-gray-400">Battlecards, product sheets, attendee lists</p></div>
                </button>
                <Link href="/contacts/scan" className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                  <span className="text-xl">📷</span>
                  <div><p className="text-sm font-medium text-gray-800">Scan Badge</p><p className="text-xs text-gray-400">Capture a new contact</p></div>
                </Link>
              </div>
            </div>

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

        {/* ── Attendees ─────────────────────────────────────────────────── */}
        {tab === 'attendees' && (
          <div className="space-y-3">
            <div className="card space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Upload Attendee List</p>
              <p className="text-sm text-gray-500">CSV or Excel from the conference organiser. Auto-matched against your CRM.</p>
              <button onClick={() => attFileRef.current?.click()} disabled={uploadingAtt} className="btn-secondary w-full">
                {uploadingAtt ? 'Processing...' : '📋 Upload Attendee List'}
              </button>
              <input ref={attFileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleAttendeeUpload(f) }} />
            </div>

            {attendees.length > 0 && (
              <input
                className="input w-full text-sm"
                placeholder={`Search ${attendees.length} attendees by name, company, title...`}
                value={attSearch}
                onChange={e => setAttSearch(e.target.value)}
              />
            )}

            {attendees.length === 0 ? (
              <div className="card text-center py-10 text-gray-400 text-sm">No attendees yet — upload the conference attendee list</div>
            ) : filteredAttendees.length === 0 ? (
              <div className="card text-center py-6 text-gray-400 text-sm">No attendees match &ldquo;{attSearch}&rdquo;</div>
            ) : (
              <div className="space-y-2">
                {filteredAttendees.map(a => (
                  <div key={a.id} className={`card flex items-center gap-3 ${a.is_target ? 'border-indigo-200 bg-indigo-50' : ''}`}>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${a.is_target ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                      {a.full_name?.[0] ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{a.full_name ?? a.email ?? '—'}</p>
                      <p className="text-xs text-gray-400 truncate">{[a.title, a.company].filter(Boolean).join(' · ')}</p>
                      {a.crm_match_id && <p className="text-xs text-indigo-500 font-medium">✓ In CRM</p>}
                    </div>
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      {a.company && (
                        <button onClick={() => openIntelTab(a.company!)}
                          className="text-xs font-medium px-2 py-1 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors">
                          🧠 Intel
                        </button>
                      )}
                      <button onClick={() => toggleTarget(a.id, a.is_target)}
                        className={`text-xs font-medium px-2 py-1 rounded-lg transition-colors ${a.is_target ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                        {a.is_target ? '🎯' : '+ Target'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Intel ─────────────────────────────────────────────────────── */}
        {tab === 'intel' && (
          <div className="space-y-3">
            {/* Search */}
            <input
              className="input w-full text-sm"
              placeholder={`Search ${totalCompanies} companies...`}
              value={intelSearch}
              onChange={e => setIntelSearch(e.target.value)}
            />

            {intelLoading && (
              <div className="card text-center py-10 space-y-2">
                <div className="text-3xl animate-pulse">🧠</div>
                <p className="text-sm text-gray-500">Loading intel briefs...</p>
              </div>
            )}

            {!intelLoading && intelLoaded && intelRows.length === 0 && (
              <div className="card text-center py-10 space-y-3">
                <div className="text-4xl">🔭</div>
                <p className="font-medium text-gray-700">No intel cached yet</p>
                <p className="text-sm text-gray-400">Run Pre-generate Intel from the Overview tab first</p>
                <button onClick={() => setTab('overview')} className="btn-secondary">← Back to Overview</button>
              </div>
            )}

            {!intelLoading && filteredIntel.length === 0 && intelRows.length > 0 && (
              <div className="card text-center py-6 text-gray-400 text-sm">No companies match &ldquo;{intelSearch}&rdquo;</div>
            )}

            {filteredIntel.map(row => {
              const intel = row.intel as Record<string, unknown>
              const ib    = intel.internal_brief as Record<string, unknown> | undefined
              const pb    = intel.public_brief   as Record<string, unknown> | undefined
              const isExp = expanded === row.company_name
              const fin   = pb?.financials as Record<string, unknown> | undefined

              return (
                <div key={row.id} className={`card border-l-4 ${healthBorder(ib?.health as string)} overflow-hidden`}>
                  {/* Company header — always visible */}
                  <button className="w-full text-left" onClick={() => { setExpanded(isExp ? null : row.company_name); setIntelSubTab('internal') }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 truncate">{row.company_name}</p>
                        {intel.snapshot && <p className="text-xs text-gray-500 leading-snug mt-0.5 line-clamp-2">{intel.snapshot as string}</p>}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {ib?.account_status && ib.account_status !== 'unknown' && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase ${statusChip(ib.account_status as string)}`}>
                            {ib.account_status as string}
                          </span>
                        )}
                        {ib?.temperature && ib.temperature !== 'unknown' && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tempChip(ib.temperature as string)}`}>
                            {ib.temperature as string}
                          </span>
                        )}
                        <span className="text-gray-400 text-xs ml-1">{isExp ? '▲' : '▼'}</span>
                      </div>
                    </div>

                    {/* Key metrics row — always visible */}
                    {(ib?.arr || ib?.renewal_date || (intel.industry as string) || (intel.size as string)) && (
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2">
                        {ib?.arr && <span className="text-xs text-gray-600">💰 ARR: <strong>{ib.arr as string}</strong></span>}
                        {ib?.renewal_date && <span className="text-xs text-amber-600">📅 Renewal: <strong>{ib.renewal_date as string}</strong></span>}
                        {intel.size && <span className="text-xs text-gray-400">{intel.size as string}</span>}
                        {intel.industry && <span className="text-xs text-gray-400">{intel.industry as string}</span>}
                      </div>
                    )}
                  </button>

                  {/* Expanded detail */}
                  {isExp && (
                    <div className="mt-4 border-t border-gray-100 pt-4">
                      {/* Talking points — always at top */}
                      {(intel.talking_points as string[] | undefined)?.length && (
                        <div className="bg-indigo-50 rounded-xl p-3 mb-4">
                          <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wide mb-2">🎯 Talking Points</p>
                          <ol className="space-y-1.5">
                            {(intel.talking_points as string[]).map((tp, i) => (
                              <li key={i} className="text-sm text-indigo-800 flex gap-2 leading-snug">
                                <span className="font-bold text-indigo-400 flex-shrink-0">{i + 1}.</span><span>{tp}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}

                      {/* Opportunities */}
                      {(intel.opportunities as Array<{title:string;angle:string}> | undefined)?.length && (
                        <div className="mb-4 space-y-1.5">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">💡 Opportunities</p>
                          {(intel.opportunities as Array<{title:string;angle:string}>).map((o, i) => (
                            <div key={i} className="bg-green-50 border border-green-100 rounded-xl px-3 py-2">
                              <p className="text-sm font-semibold text-green-800">{o.title}</p>
                              <p className="text-xs text-green-700 mt-0.5">{o.angle}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Internal / Public sub-tabs */}
                      <div className="flex bg-gray-100 rounded-xl p-1 mb-4">
                        <button onClick={() => setIntelSubTab('internal')}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${intelSubTab === 'internal' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}>
                          🏢 Internal
                        </button>
                        <button onClick={() => setIntelSubTab('public')}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${intelSubTab === 'public' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}>
                          🌐 Public
                        </button>
                      </div>

                      {/* ── INTERNAL ───────────────────────────────────────── */}
                      {intelSubTab === 'internal' && ib && (
                        <div className="space-y-3">
                          {/* Status + health row */}
                          <div className="flex flex-wrap gap-1.5">
                            {ib.account_status && ib.account_status !== 'unknown' && (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusChip(ib.account_status as string)}`}>{ib.account_status as string}</span>
                            )}
                            {ib.temperature && ib.temperature !== 'unknown' && (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tempChip(ib.temperature as string)}`}>{ib.temperature as string}</span>
                            )}
                            {ib.health && ib.health !== 'unknown' && (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                ib.health === 'green' ? 'bg-green-100 text-green-700' :
                                ib.health === 'red'   ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'
                              }`}>{ib.health as string} health</span>
                            )}
                          </div>

                          {/* Key financials grid */}
                          <div className="grid grid-cols-2 gap-3">
                            {ib.arr && (
                              <div className="bg-gray-50 rounded-xl p-3">
                                <p className="text-xs text-gray-400">ARR</p>
                                <p className="font-bold text-gray-900 text-sm">{ib.arr as string}</p>
                              </div>
                            )}
                            {ib.contract_value && (
                              <div className="bg-gray-50 rounded-xl p-3">
                                <p className="text-xs text-gray-400">Contract Value</p>
                                <p className="font-bold text-gray-900 text-sm">{ib.contract_value as string}</p>
                              </div>
                            )}
                            {ib.renewal_date && (
                              <div className="bg-amber-50 rounded-xl p-3">
                                <p className="text-xs text-amber-500">Renewal Date</p>
                                <p className="font-bold text-amber-700 text-sm">{ib.renewal_date as string}</p>
                              </div>
                            )}
                            {ib.last_contact && (
                              <div className="bg-gray-50 rounded-xl p-3">
                                <p className="text-xs text-gray-400">Last Contact</p>
                                <p className="font-medium text-gray-700 text-sm">{ib.last_contact as string}</p>
                              </div>
                            )}
                          </div>

                          {/* Products in use */}
                          {(ib.products_in_use as string[] | undefined)?.length && (
                            <div>
                              <p className="text-xs text-gray-400 mb-1">Products in use</p>
                              <div className="flex flex-wrap gap-1">
                                {(ib.products_in_use as string[]).map(p => (
                                  <span key={p} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">{p}</span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Outstanding invoices alert */}
                          {(ib.outstanding_invoices as number) > 0 && (
                            <div className="flex items-center gap-2 bg-red-50 rounded-xl px-3 py-2">
                              <span>⚠️</span>
                              <p className="text-xs text-red-600 font-medium">
                                {ib.outstanding_invoices as number} outstanding invoice{(ib.outstanding_invoices as number) > 1 ? 's' : ''}
                                {ib.outstanding_amount ? ` · ${ib.outstanding_amount}` : ''}
                              </p>
                            </div>
                          )}

                          {/* Open issues */}
                          {(ib.open_issues as string[] | undefined)?.length && (
                            <div>
                              <p className="text-xs text-gray-400 mb-1">Open Issues</p>
                              <ul className="space-y-1">
                                {(ib.open_issues as string[]).map((issue, i) => (
                                  <li key={i} className="text-xs text-gray-600 flex gap-1.5">
                                    <span className="text-amber-500">!</span>{issue}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Account owner */}
                          {ib.account_owner && (
                            <p className="text-xs text-gray-500">👤 Account owner: <strong>{ib.account_owner as string}</strong></p>
                          )}

                          {/* CRM notes */}
                          {ib.crm_notes && (
                            <div className="bg-gray-50 rounded-xl p-3">
                              <p className="text-xs text-gray-400 mb-1">CRM Notes</p>
                              <p className="text-sm text-gray-700 leading-relaxed">{ib.crm_notes as string}</p>
                            </div>
                          )}

                          {/* Relationship / meeting history */}
                          {ib.relationship_history && (
                            <div className="border-l-4 border-l-indigo-200 pl-3">
                              <p className="text-xs text-gray-400 mb-1">Meeting History</p>
                              <p className="text-sm text-gray-700 leading-relaxed">{ib.relationship_history as string}</p>
                            </div>
                          )}

                          {/* Doc highlights */}
                          {ib.doc_highlights && (
                            <div className="border-l-4 border-l-purple-200 pl-3">
                              <p className="text-xs text-gray-400 mb-1">From Conference Docs</p>
                              <p className="text-sm text-gray-700 leading-relaxed">{ib.doc_highlights as string}</p>
                            </div>
                          )}

                          {!ib.arr && !ib.crm_notes && !ib.relationship_history && ib.account_status === 'unknown' && (
                            <p className="text-sm text-gray-400 text-center py-4">No CRM data found for this company</p>
                          )}
                        </div>
                      )}

                      {/* ── PUBLIC ─────────────────────────────────────────── */}
                      {intelSubTab === 'public' && pb && (
                        <div className="space-y-3">
                          {/* Company basics */}
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            {intel.hq       && <div className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-400">HQ</p><p className="font-medium text-gray-800">{intel.hq as string}</p></div>}
                            {intel.founded  && <div className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-400">Founded</p><p className="font-medium text-gray-800">{intel.founded as string}</p></div>}
                            {intel.size     && <div className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-400">Size</p><p className="font-medium text-gray-800">{intel.size as string}</p></div>}
                            {intel.public_or_private && <div className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-400">Status</p><p className="font-medium text-gray-800">{intel.public_or_private as string}</p></div>}
                          </div>

                          {/* Financials */}
                          {fin && (
                            <div>
                              <p className="text-xs text-gray-400 mb-2">💰 Financials</p>
                              <div className="grid grid-cols-2 gap-2">
                                {fin.revenue_estimate && <div className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-400">Revenue</p><p className="font-semibold text-gray-800">{fin.revenue_estimate as string}</p></div>}
                                {fin.growth_rate      && <div className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-400">Growth</p><p className="font-semibold text-green-700">{fin.growth_rate as string}</p></div>}
                                {fin.valuation        && <div className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-400">Valuation</p><p className="font-semibold text-gray-800">{fin.valuation as string}</p></div>}
                                {fin.funding          && <div className="bg-gray-50 rounded-xl p-3 col-span-2"><p className="text-xs text-gray-400">Funding</p><p className="font-medium text-gray-800">{fin.funding as string}</p></div>}
                              </div>
                            </div>
                          )}

                          {/* Leadership */}
                          {(pb.leadership as Array<{name:string;role:string;background?:string;priorities?:string[]}> | undefined)?.length && (
                            <div>
                              <p className="text-xs text-gray-400 mb-2">👔 Leadership</p>
                              <div className="space-y-2">
                                {(pb.leadership as Array<{name:string;role:string;background?:string;priorities?:string[]}>).map((l, i) => (
                                  <div key={i} className="bg-gray-50 rounded-xl p-3">
                                    <div className="flex items-baseline gap-2">
                                      <span className="font-semibold text-sm text-gray-900">{l.name}</span>
                                      <span className="text-xs text-indigo-600 font-medium">{l.role}</span>
                                    </div>
                                    {l.background && <p className="text-xs text-gray-500 mt-0.5">{l.background}</p>}
                                    {l.priorities?.map((p, j) => <p key={j} className="text-xs text-gray-600 mt-0.5">▸ {p}</p>)}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Strategic priorities */}
                          {(pb.strategic_priorities as string[] | undefined)?.length && (
                            <div>
                              <p className="text-xs text-gray-400 mb-1">🚀 Strategic Priorities</p>
                              <ul className="space-y-1">
                                {(pb.strategic_priorities as string[]).map((p, i) => (
                                  <li key={i} className="text-sm text-gray-700 flex gap-2"><span className="text-indigo-400">•</span>{p}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Growth signals */}
                          {(pb.growth_signals as string[] | undefined)?.length && (
                            <div>
                              <p className="text-xs text-gray-400 mb-1">📈 Growth Signals</p>
                              <ul className="space-y-1">
                                {(pb.growth_signals as string[]).map((s, i) => (
                                  <li key={i} className="text-sm text-gray-700 flex gap-2"><span className="text-green-400">↑</span>{s}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Pain points */}
                          {(pb.pain_points as string[] | undefined)?.length && (
                            <div>
                              <p className="text-xs text-gray-400 mb-1">🩹 Pain Points</p>
                              <ul className="space-y-1">
                                {(pb.pain_points as string[]).map((p, i) => (
                                  <li key={i} className="text-sm text-gray-700 flex gap-2"><span className="text-red-400">•</span>{p}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Recent news */}
                          {(pb.recent_news as Array<{headline:string;date?:string;why_it_matters?:string}> | undefined)?.length && (
                            <div>
                              <p className="text-xs text-gray-400 mb-2">📰 Recent News</p>
                              <div className="space-y-2">
                                {(pb.recent_news as Array<{headline:string;date?:string;why_it_matters?:string}>).map((n, i) => (
                                  <div key={i} className="border-l-2 border-gray-200 pl-3">
                                    <p className="text-sm text-gray-800 font-medium leading-snug">{n.headline}</p>
                                    {n.date && <span className="text-xs text-gray-400">{n.date}</span>}
                                    {n.why_it_matters && <p className="text-xs text-indigo-600 mt-0.5">{n.why_it_matters}</p>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Tech stack */}
                          {(pb.tech_stack as string[] | undefined)?.length && (
                            <div>
                              <p className="text-xs text-gray-400 mb-1">🖥️ Tech Stack</p>
                              <div className="flex flex-wrap gap-1">
                                {(pb.tech_stack as string[]).map(t => (
                                  <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t}</span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Competitive context */}
                          {pb.competitive_context && (
                            <div>
                              <p className="text-xs text-gray-400 mb-1">⚔️ Competitive Landscape</p>
                              <p className="text-sm text-gray-700">{pb.competitive_context as string}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Risks */}
                      {(intel.risks as string[] | undefined)?.length && (
                        <div className="mt-4 pt-3 border-t border-gray-100">
                          <p className="text-xs text-gray-400 mb-1">⚠️ Watch Out For</p>
                          <ul className="space-y-1">
                            {(intel.risks as string[]).map((r, i) => (
                              <li key={i} className="text-sm text-amber-700 flex gap-2"><span>▲</span>{r}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <p className="text-xs text-gray-400 mt-3">
                        Generated {new Date(row.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── Documents ─────────────────────────────────────────────────── */}
        {tab === 'documents' && (
          <div className="space-y-3">
            <div className="card space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Upload Document</p>
              <div className="space-y-2">
                <select value={docFileType} onChange={e => setDocFileType(e.target.value)} className="input w-full text-sm">
                  <option value="attendee_list">👥 Attendee List (auto-imports contacts)</option>
                  <option value="crm_export">📊 CRM Export</option>
                  <option value="battlecard">⚔️ Battlecard</option>
                  <option value="product_sheet">📄 Product Sheet</option>
                  <option value="competitor_intel">🔍 Competitor Intelligence</option>
                  <option value="other">📎 Other Document</option>
                </select>
                <button onClick={() => docFileRef.current?.click()} disabled={uploadingDoc} className="btn-secondary w-full">
                  {uploadingDoc ? 'Processing...' : '📁 Upload File'}
                </button>
              </div>
              <input ref={docFileRef} type="file" accept=".csv,.xlsx,.xls,.pdf,.txt,.md,.docx" className="hidden" onChange={handleDocUpload} />
              <p className="text-xs text-gray-400">Supports CSV, Excel, PDF, TXT. Used as context when generating intelligence briefs.</p>
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
                    <button onClick={() => deleteDoc(d.id)} className="text-gray-300 hover:text-red-400 transition-colors text-lg flex-shrink-0">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Meetings ──────────────────────────────────────────────────── */}
        {tab === 'meetings' && (
          <div className="space-y-2">
            <Link href="/meetings/new" className="card flex items-center gap-3 border-dashed border-indigo-200 hover:border-indigo-400 transition-colors">
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
                    <p className="text-xs text-gray-400 truncate">{m.contact?.company} · {new Date(m.meeting_date).toLocaleDateString()}</p>
                  </div>
                  {outcome && <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${outcome.color}`}>{outcome.label}</span>}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
