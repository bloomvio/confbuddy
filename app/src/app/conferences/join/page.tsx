'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function JoinConferencePage() {
  const [code, setCode]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')
  const router = useRouter()

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    setLoading(true)
    setError('')

    const res  = await fetch('/api/conferences/join', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ code: code.trim().toUpperCase() }),
    })
    const data = await res.json()
    setLoading(false)

    if (data.error) { setError(data.error); return }

    // Store as active conference
    localStorage.setItem('active_conference_id',   data.conference.id)
    localStorage.setItem('active_conference_name', data.conference.name)

    router.push(`/conferences/${data.conference.id}`)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500">←</button>
        <h1 className="font-semibold text-gray-900">Join a Conference</h1>
      </header>

      <form onSubmit={handleJoin} className="px-4 py-8 max-w-sm mx-auto space-y-5">
        <div className="card text-center space-y-3 py-8">
          <div className="text-5xl">🔑</div>
          <h2 className="font-bold text-gray-900">Enter Join Code</h2>
          <p className="text-sm text-gray-500">
            Ask the person who set up the conference for the 6-letter code.
          </p>
        </div>

        <div className="space-y-2">
          <input
            className="input w-full text-center text-2xl font-bold tracking-[0.4em] uppercase"
            placeholder="ABC123"
            maxLength={6}
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            autoFocus
          />
          <p className="text-xs text-gray-400 text-center">6-character code, letters and numbers</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm rounded-xl p-3 text-center">{error}</div>
        )}

        <button
          type="submit"
          disabled={loading || code.length < 4}
          className="btn-primary w-full"
        >
          {loading ? 'Joining...' : 'Join Conference'}
        </button>

        <p className="text-center text-xs text-gray-400">
          Want to set up a new conference?{' '}
          <button type="button" onClick={() => router.push('/conferences/new')} className="text-indigo-500 underline">
            Create one
          </button>
        </p>
      </form>
    </div>
  )
}
