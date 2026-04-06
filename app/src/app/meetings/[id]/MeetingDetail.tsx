'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Meeting, MeetingNotes, ActionItem, MeetingOutcome } from '@/types/database'

interface Props {
  meeting: Meeting & { contact?: { full_name: string; company: string; title: string } }
  notes: MeetingNotes | null
  actionItems: ActionItem[]
}

const OUTCOMES: { value: MeetingOutcome; label: string; bg: string; text: string }[] = [
  { value: 'hot',            label: '🔥 Hot',           bg: 'bg-red-100',    text: 'text-red-700'    },
  { value: 'follow_up',      label: '📅 Follow-up',     bg: 'bg-blue-100',   text: 'text-blue-700'   },
  { value: 'intro_needed',   label: '🤝 Intro needed',  bg: 'bg-purple-100', text: 'text-purple-700' },
  { value: 'not_interested', label: '👎 Not interested', bg: 'bg-gray-100',  text: 'text-gray-600'   },
  { value: 'closed',         label: '✅ Closed',         bg: 'bg-green-100', text: 'text-green-700'  },
]

function outcomeStyle(o?: string | null) {
  return OUTCOMES.find(x => x.value === o) ?? null
}

export default function MeetingDetail({ meeting, notes, actionItems }: Props) {
  const [activeTab, setActiveTab] = useState<'summary' | 'actions' | 'raw'>('summary')
  const [editedNotes, setEditedNotes] = useState(notes)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [exportingDocx, setExportingDocx] = useState(false)
  const [emailSending, setEmailSending] = useState(false)
  const [draftingFollowup, setDraftingFollowup] = useState(false)
  const [followupDraft, setFollowupDraft] = useState<{ subject: string; body: string; to_email?: string } | null>(null)
  const [showFollowup, setShowFollowup] = useState(false)
  const [copied, setCopied] = useState(false)
  const [outcome, setOutcome] = useState<MeetingOutcome | null>(meeting.outcome ?? null)
  const [showOutcomePicker, setShowOutcomePicker] = useState(false)
  const [savingOutcome, setSavingOutcome] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function generateNotes() {
    setGenerating(true)
    await fetch('/api/generate-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meeting_id: meeting.id }),
    })
    setGenerating(false)
    router.refresh()
  }

  async function saveOutcome(newOutcome: MeetingOutcome) {
    setSavingOutcome(true)
    setOutcome(newOutcome)
    setShowOutcomePicker(false)
    await supabase.from('cb_meetings').update({ outcome: newOutcome }).eq('id', meeting.id)
    setSavingOutcome(false)
  }

  async function exportDocx() {
    setExportingDocx(true)
    const res = await fetch('/api/meetings/export-docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meeting_id: meeting.id }),
    })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `MoM_${meeting.contact?.full_name ?? 'Meeting'}_${new Date(meeting.meeting_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.docx`
    a.click()
    setExportingDocx(false)
  }

  async function draftFollowup() {
    setDraftingFollowup(true)
    const res = await fetch('/api/meetings/draft-followup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meeting_id: meeting.id }),
    })
    const data = await res.json()
    setDraftingFollowup(false)
    if (data.draft) {
      setFollowupDraft({ ...data.draft, to_email: data.to_email })
      setShowFollowup(true)
    }
  }

  async function sendEmail() {
    setEmailSending(true)
    await fetch('/api/meetings/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meeting_id: meeting.id }),
    })
    setEmailSending(false)
    alert('Notes emailed successfully!')
  }

  const isProcessing = meeting.status === 'processing' || meeting.transcription_status === 'processing'
  const outcomeInfo = outcomeStyle(outcome)

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <header className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500">←</button>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-gray-900">{meeting.contact?.full_name ?? 'Meeting Notes'}</h1>
          <p className="text-xs text-gray-500">
            {meeting.contact?.company} · {new Date(meeting.meeting_date).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Outcome badge — tap to change */}
          <button
            onClick={() => setShowOutcomePicker(true)}
            className={`text-xs font-medium px-2 py-1 rounded-full transition-colors ${
              outcomeInfo
                ? `${outcomeInfo.bg} ${outcomeInfo.text}`
                : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
            }`}
          >
            {savingOutcome ? '...' : outcomeInfo ? outcomeInfo.label : '+ Outcome'}
          </button>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            meeting.status === 'notes_ready' ? 'bg-green-100 text-green-700' :
            isProcessing ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
          }`}>{meeting.status.replace('_', ' ')}</span>
        </div>
      </header>

      <div className="px-4 py-5 max-w-lg mx-auto space-y-4">
        {/* Processing state */}
        {isProcessing && (
          <div className="card text-center py-8">
            <div className="text-3xl mb-3 animate-spin">⚙️</div>
            <p className="font-medium text-gray-700">Generating your notes...</p>
            <p className="text-sm text-gray-400 mt-1">AI is processing the transcript</p>
            <button onClick={() => router.refresh()} className="btn-secondary mt-4 text-sm py-2">Refresh</button>
          </div>
        )}

        {/* Generate notes if not done */}
        {!notes && !isProcessing && (
          <div className="card text-center py-8">
            <div className="text-3xl mb-3">📝</div>
            <p className="font-medium text-gray-700">Notes not generated yet</p>
            <button onClick={generateNotes} disabled={generating} className="btn-primary mt-4">
              {generating ? 'Generating...' : 'Generate AI Notes'}
            </button>
          </div>
        )}

        {/* Notes content */}
        {notes && (
          <>
            {/* Tab bar */}
            <div className="flex bg-gray-100 rounded-xl p-1">
              {[
                { key: 'summary', label: '📋 Summary' },
                { key: 'actions', label: '✅ Actions' },
                { key: 'raw', label: '📝 Raw Notes' },
              ].map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key as typeof activeTab)}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${activeTab === t.key ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {activeTab === 'summary' && (
              <div className="space-y-4">
                <div className="card">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Bottom Line Summary</p>
                  <div className="text-sm text-gray-700 whitespace-pre-line">{notes.bottom_line_summary}</div>
                </div>
                <div className="card">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Meeting Intent</p>
                  <p className="text-sm text-gray-700">{notes.intent}</p>
                </div>
              </div>
            )}

            {activeTab === 'actions' && (
              <div className="space-y-2">
                {actionItems.length === 0 && (
                  <div className="card text-center py-6 text-gray-400 text-sm">No action items identified</div>
                )}
                {actionItems.map(a => (
                  <div key={a.id} className="card flex gap-3">
                    <div className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 ${a.is_complete ? 'bg-green-500 border-green-500' : 'border-gray-300'}`} />
                    <div>
                      <p className="text-sm text-gray-800">{a.description}</p>
                      <div className="flex gap-2 mt-1">
                        {a.owner && <span className="text-xs text-indigo-600">👤 {a.owner}</span>}
                        {a.due_date && <span className="text-xs text-gray-400">📅 {a.due_date}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'raw' && (
              <div className="card">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Raw Notes</p>
                <textarea
                  className="w-full text-sm text-gray-700 bg-transparent outline-none resize-none"
                  rows={20}
                  value={editedNotes?.raw_notes ?? ''}
                  onChange={e => setEditedNotes(n => n ? { ...n, raw_notes: e.target.value } : n)}
                />
              </div>
            )}
          </>
        )}

        {/* Export actions */}
        {notes && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-3">
            <div className="max-w-lg mx-auto flex gap-2">
              <button onClick={draftFollowup} disabled={draftingFollowup} className="btn-primary flex-1 text-sm py-2.5">
                {draftingFollowup ? '⏳' : '✉️'} Follow-up
              </button>
              <button onClick={exportDocx} disabled={exportingDocx} className="btn-secondary flex-1 text-sm py-2.5">
                {exportingDocx ? '⏳' : '📄'} Word Doc
              </button>
              <button onClick={sendEmail} disabled={emailSending} className="btn-secondary flex-1 text-sm py-2.5">
                {emailSending ? '⏳' : '📧'} Email
              </button>
            </div>
          </div>
        )}

        {/* Follow-up draft modal */}
        {showFollowup && followupDraft && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-0">
            <div className="bg-white rounded-t-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">✉️ Follow-up Draft</h3>
                <button onClick={() => setShowFollowup(false)} className="text-gray-400 text-xl">✕</button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <div>
                  <p className="text-xs text-gray-400 mb-1">To</p>
                  <p className="text-sm text-gray-700">{followupDraft.to_email ?? meeting.contact?.full_name ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Subject</p>
                  <p className="text-sm font-medium text-gray-900">{followupDraft.subject}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Body</p>
                  <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                    {followupDraft.body}
                  </div>
                </div>
              </div>
              <div className="px-4 py-3 border-t border-gray-100 flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`Subject: ${followupDraft.subject}\n\n${followupDraft.body}`)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}
                  className="btn-secondary flex-1 text-sm py-2.5"
                >
                  {copied ? '✓ Copied!' : '📋 Copy'}
                </button>
                {followupDraft.to_email && (
                  <a
                    href={`mailto:${followupDraft.to_email}?subject=${encodeURIComponent(followupDraft.subject)}&body=${encodeURIComponent(followupDraft.body)}`}
                    className="btn-primary flex-1 text-sm py-2.5 text-center"
                  >
                    📨 Open in Mail
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Outcome picker modal */}
        {showOutcomePicker && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center">
            <div className="bg-white rounded-t-2xl w-full max-w-lg">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h3 className="font-semibold text-gray-900">Set Meeting Outcome</h3>
                <button onClick={() => setShowOutcomePicker(false)} className="text-gray-400 text-xl">✕</button>
              </div>
              <div className="p-4 space-y-2 pb-8">
                {OUTCOMES.map(o => (
                  <button
                    key={o.value}
                    onClick={() => saveOutcome(o.value)}
                    className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                      outcome === o.value
                        ? `${o.bg} ${o.text} border-transparent`
                        : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
