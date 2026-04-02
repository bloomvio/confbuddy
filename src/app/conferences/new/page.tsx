'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function NewConferencePage() {
  const [name, setName]               = useState('')
  const [location, setLocation]       = useState('')
  const [startDate, setStartDate]     = useState('')
  const [endDate, setEndDate]         = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')
  const [duplicateWarning, setDuplicateWarning] = useState('')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Conference name is required'); return }

    setSaving(true)
    setError('')
    setDuplicateWarning('')

    const res = await fetch('/api/conferences', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        name, location: location || null, start_date: startDate || null,
        end_date: endDate || null, description: description || null, set_active: true,
      }),
    })

    const data = await res.json()
    setSaving(false)

    if (data.error === 'duplicate_name') { setDuplicateWarning(data.message); return }
    if (data.error) { setError(data.error); return }

    localStorage.setItem('active_conference_id',   data.conference.id)
    localStorage.setItem('active_conference_name', data.conference.name)
    router.push(`/conferences/${data.conference.id}`)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500">←</button>
        <h1 className="font-semibold text-gray-900">New Conference</h1>
      </header>

      <form onSubmit={handleSubmit} className="px-4 py-6 max-w-lg mx-auto space-y-4">
        <div className="card space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">Conference Name *</label>
            <input
              className="input w-full"
              placeholder="e.g. Dreamforce 2026"
              value={name}
              onChange={e => { setName(e.target.value); setDuplicateWarning('') }}
              required
            />
            {duplicateWarning && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                <p className="text-sm text-amber-800">{duplicateWarning}</p>
                <button type="button" onClick={() => router.push('/conferences/join')}
                  className="text-sm font-semibold text-indigo-600 underline">
                  Enter join code instead →
                </button>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">Location</label>
            <input className="input w-full" placeholder="e.g. San Francisco, CA"
              value={location} onChange={e => setLocation(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700">Start Date</label>
              <input type="date" className="input w-full" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold text-gray-700">End Date</label>
              <input type="date" className="input w-full" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-gray-700">Notes (optional)</label>
            <textarea className="input w-full resize-none" rows={3}
              placeholder="Goals, target accounts, talking themes..."
              value={description} onChange={e => setDescription(e.target.value)} />
          </div>
        </div>

        <div className="card bg-indigo-50 border-indigo-100 text-sm text-indigo-700 space-y-1">
          <p className="font-semibold">What happens next</p>
          <ul className="space-y-0.5 text-indigo-600">
            <li>→ You&apos;ll get a 6-letter join code to share with your team</li>
            <li>→ Upload attendee list &amp; documents on the next screen</li>
            <li>→ Pre-generate intel for target companies in the background</li>
          </ul>
        </div>

        {error && <div className="bg-red-50 text-red-600 text-sm rounded-xl p-3">{error}</div>}

        <button type="submit" disabled={saving || !name.trim() || !!duplicateWarning} className="btn-primary w-full">
          {saving ? 'Creating...' : '🎪 Create Conference'}
        </button>

        <p className="text-center text-sm text-gray-400">
          Joining a colleague&apos;s conference?{' '}
          <button type="button" onClick={() => router.push('/conferences/join')}
            className="text-indigo-500 underline">Use a join code</button>
        </p>
      </form>
    </div>
  )
}
