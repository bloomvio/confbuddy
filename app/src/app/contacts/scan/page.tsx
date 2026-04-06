'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import BadgeCapture from '@/components/badge-capture/BadgeCapture'
import { Contact } from '@/types/database'
import { createClient } from '@/lib/supabase/client'

type Stage = 'capture' | 'enriching' | 'review'

export default function ScanPage() {
  const [stage, setStage]       = useState<Stage>('capture')
  const [contact, setContact]   = useState<Partial<Contact> | null>(null)
  const [enriched, setEnriched] = useState<Partial<Contact> | null>(null)
  const [saving, setSaving]     = useState(false)
  const [saveError, setSaveError] = useState('')
  const [eventName, setEventName] = useState('')
  const [activeConf, setActiveConf] = useState<{ id: string; name: string } | null>(null)
  const router  = useRouter()
  const supabase = createClient()

  // Pick up active conference from localStorage
  useEffect(() => {
    const id   = localStorage.getItem('active_conference_id')
    const name = localStorage.getItem('active_conference_name')
    if (id && name) {
      setActiveConf({ id, name })
      setEventName(name)
    }
  }, [])

  async function handleCapture(parsed: Partial<Contact>) {
    setContact(parsed)
    setStage('enriching')
    try {
      const res = await fetch('/api/enrich', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: parsed.full_name, company: parsed.company, email: parsed.email }),
      })
      const data = await res.json()
      setEnriched({ ...parsed, ...data.enriched })
    } catch {
      setEnriched(parsed)
    }
    setStage('review')
  }

  async function doSave() {
    const finalContact = enriched ?? contact
    if (!finalContact) return null

    if (!finalContact.full_name?.trim()) {
      setSaveError('Name is required — please fill it in before saving.')
      return null
    }

    setSaving(true)
    setSaveError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return null }

    // Check for an existing contact with the same email (if provided) to avoid duplicates
    if (finalContact.email?.trim()) {
      const { data: existing } = await supabase
        .from('cb_contacts')
        .select('id, full_name')
        .eq('user_id', user.id)
        .eq('email', finalContact.email.trim().toLowerCase())
        .maybeSingle()

      if (existing) {
        setSaving(false)
        setSaveError(`A contact with this email already exists: ${existing.full_name}. Tap Save to update their record instead.`)
        // Return the existing contact so the caller can still navigate
        return existing as { id: string; full_name: string }
      }
    }

    // Fallback dedup by name + company when no email is available
    if (!finalContact.email?.trim() && finalContact.full_name?.trim() && finalContact.company?.trim()) {
      const { data: nameMatch } = await supabase
        .from('cb_contacts')
        .select('id, full_name')
        .eq('user_id', user.id)
        .ilike('full_name', finalContact.full_name.trim())
        .ilike('company', finalContact.company.trim())
        .maybeSingle()

      if (nameMatch) {
        setSaving(false)
        setSaveError(`${nameMatch.full_name} from this company is already in your contacts. Tap Save to navigate to their record.`)
        return nameMatch as { id: string; full_name: string }
      }
    }

    const { data, error } = await supabase
      .from('cb_contacts')
      .insert({
        ...finalContact,
        email:         finalContact.email?.trim().toLowerCase() ?? null,
        user_id:       user.id,
        conference_id: activeConf?.id ?? null,
        event_name:    eventName.trim() || null,
      })
      .select()
      .single()

    setSaving(false)

    if (error) {
      console.error('Contact save error:', error)
      setSaveError(`Save failed: ${error.message}`)
      return null
    }

    // Fire intel generation immediately in background
    if (data?.company) {
      fetch('/api/company-intel', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          contact_id:    data.id,
          company:       data.company,
          conference_id: activeConf?.id ?? null,
        }),
      }).catch(() => {})
    }

    return data ?? null
  }

  async function handleSave() {
    const data = await doSave()
    if (data) router.push(`/contacts/${data.id}`)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500">←</button>
        <h1 className="font-semibold text-gray-900">
          {stage === 'capture'   ? 'Scan Badge'            :
           stage === 'enriching' ? 'Enriching Profile...'  :
           'Review Contact'}
        </h1>
      </header>

      <div className="px-4 py-6 max-w-lg mx-auto">
        {/* Conference context */}
        <div className="card mb-4 space-y-1">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {activeConf ? '🎪 Active Conference' : '📍 Conference / Event'}
          </label>
          {activeConf ? (
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-indigo-700">{activeConf.name}</p>
              <button
                onClick={() => { setActiveConf(null); setEventName('') }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Change
              </button>
            </div>
          ) : (
            <input
              className="input text-sm"
              placeholder="e.g. Salesforce World Tour 2026"
              value={eventName}
              onChange={e => setEventName(e.target.value)}
            />
          )}
        </div>

        {stage === 'capture' && <BadgeCapture onCapture={handleCapture} />}

        {stage === 'enriching' && (
          <div className="card text-center py-12 space-y-4">
            <div className="text-4xl animate-bounce">🔍</div>
            <h2 className="font-semibold text-gray-900">Looking up {contact?.full_name}</h2>
            <div className="space-y-2 text-sm text-gray-500">
              <p>✓ Badge captured</p>
              <p className="animate-pulse">⟳ Checking CRM &amp; Salesforce...</p>
              <p className="text-gray-300">⟳ Building profile...</p>
            </div>
          </div>
        )}

        {stage === 'review' && enriched && (
          <div className="space-y-4">
            {/* Contact header */}
            <div className="card flex items-center gap-4">
              <div className="w-14 h-14 bg-indigo-100 rounded-full flex items-center justify-center text-2xl font-bold text-indigo-600">
                {enriched.full_name?.[0] ?? '?'}
              </div>
              <div>
                <h2 className="font-bold text-lg">{enriched.full_name}</h2>
                <p className="text-gray-500 text-sm">{enriched.title}</p>
                <p className="text-gray-500 text-sm">{enriched.company}</p>
              </div>
            </div>

            {/* CRM context */}
            {enriched.crm_relationship && enriched.crm_relationship !== 'unknown' && (
              <div className="card bg-indigo-50 border-indigo-100">
                <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wide mb-2">CRM Context</p>
                <div className="flex gap-2 mb-2">
                  <span className={`badge-${enriched.crm_relationship}`}>{enriched.crm_relationship}</span>
                  {enriched.crm_temperature && enriched.crm_temperature !== 'unknown' && (
                    <span className={`badge-${enriched.crm_temperature}`}>{enriched.crm_temperature}</span>
                  )}
                </div>
                {enriched.crm_notes && <p className="text-sm text-gray-600">{enriched.crm_notes}</p>}
              </div>
            )}

            {/* Company summary */}
            {enriched.company_summary && (
              <div className="card">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Company Intel</p>
                <p className="text-sm text-gray-600">{enriched.company_summary}</p>
              </div>
            )}

            {/* Systems landscape */}
            {enriched.systems_landscape && (
              <div className="card">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Systems &amp; Tools</p>
                <div className="flex flex-wrap gap-1">
                  {(enriched.systems_landscape as string[]).map((tool: string) => (
                    <span key={tool} className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{tool}</span>
                  ))}
                </div>
              </div>
            )}

            {saveError && (
              <div className="bg-red-50 text-red-600 text-sm rounded-xl p-3">{saveError}</div>
            )}

            <button onClick={handleSave} disabled={saving} className="btn-primary w-full">
              {saving ? 'Saving...' : '✓ Save Contact'}
            </button>

            <button
              onClick={async () => {
                const data = await doSave()
                if (data) router.push(`/meetings/new?contact_id=${data.id}&contact_name=${encodeURIComponent(data.full_name ?? '')}`)
              }}
              disabled={saving}
              className="btn-secondary w-full"
            >
              {saving ? 'Saving...' : '🎙️ Save & Start Meeting'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
