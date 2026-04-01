'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type RecordingState = 'idle' | 'recording' | 'paused' | 'done'

export default function NewMeetingPage() {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [typedNotes, setTypedNotes] = useState('')
  const [duration, setDuration] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [contactId, setContactId] = useState<string | null>(null)
  const [contactName, setContactName] = useState('')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const router = useRouter()
  const params = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    const cid = params.get('contact_id')
    const cname = params.get('contact_name')
    if (cid) setContactId(cid)
    if (cname) setContactName(decodeURIComponent(cname))
  }, [params])

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    mediaRecorderRef.current = mediaRecorder
    chunksRef.current = []
    mediaRecorder.ondataavailable = e => chunksRef.current.push(e.data)
    mediaRecorder.start(1000)
    setRecordingState('recording')
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
  }

  function pauseRecording() {
    mediaRecorderRef.current?.pause()
    timerRef.current && clearInterval(timerRef.current)
    setRecordingState('paused')
  }

  function resumeRecording() {
    mediaRecorderRef.current?.resume()
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
    setRecordingState('recording')
  }

  async function stopAndSave() {
    mediaRecorderRef.current?.stop()
    timerRef.current && clearInterval(timerRef.current)
    setRecordingState('done')

    // Small delay for final chunk
    await new Promise(r => setTimeout(r, 500))
    const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' })
    await saveMeeting(audioBlob)
  }

  async function saveMeeting(audioBlob?: Blob) {
    setSaving(true)
    setSaveError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    let recordingUrl = null

    // Upload audio to Supabase Storage
    if (audioBlob && audioBlob.size > 0) {
      const filename = `recordings/${user.id}/${Date.now()}.webm`
      const { data: uploadData } = await supabase.storage
        .from('confbuddy-recordings')
        .upload(filename, audioBlob)
      recordingUrl = uploadData?.path ?? null
    }

    // Create meeting record
    const { data: meeting, error } = await supabase
      .from('cb_meetings')
      .insert({
        user_id: user.id,
        contact_id: contactId,
        meeting_date: new Date().toISOString(),
        typed_notes: typedNotes || null,
        recording_url: recordingUrl,
        transcription_status: recordingUrl ? 'pending' : 'done',
        status: 'processing',
      })
      .select()
      .single()

    if (error) {
      console.error('Meeting save error:', error)
      setSaveError(`Could not save meeting: ${error.message}`)
      setSaving(false)
      return
    }

    if (meeting) {
      // Kick off transcription if we have audio
      if (recordingUrl) {
        fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ meeting_id: meeting.id, recording_url: recordingUrl }),
        })
      }
      router.push(`/meetings/${meeting.id}`)
    }
    setSaving(false)
  }

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500">←</button>
        <div>
          <h1 className="font-semibold text-gray-900">Record Meeting</h1>
          {contactName && <p className="text-xs text-gray-500">with {contactName}</p>}
        </div>
      </header>

      <div className="px-4 py-6 max-w-lg mx-auto space-y-5">
        {/* Recording widget */}
        <div className="card text-center py-8 space-y-4">
          <div className={`text-6xl ${recordingState === 'recording' ? 'animate-pulse' : ''}`}>
            {recordingState === 'idle' ? '🎙️' : recordingState === 'recording' ? '🔴' : recordingState === 'paused' ? '⏸️' : '✅'}
          </div>
          {recordingState !== 'idle' && (
            <div className="font-mono text-2xl font-bold text-gray-800">{formatTime(duration)}</div>
          )}
          <p className="text-sm text-gray-500">
            {recordingState === 'idle' ? 'Tap to start recording the conversation' :
             recordingState === 'recording' ? 'Recording in progress...' :
             recordingState === 'paused' ? 'Recording paused' : 'Recording complete'}
          </p>

          <div className="flex gap-2 justify-center">
            {recordingState === 'idle' && (
              <button onClick={startRecording} className="btn-primary px-8">Start Recording</button>
            )}
            {recordingState === 'recording' && (
              <>
                <button onClick={pauseRecording} className="btn-secondary">⏸ Pause</button>
                <button onClick={stopAndSave} className="btn-primary">⏹ Stop & Save</button>
              </>
            )}
            {recordingState === 'paused' && (
              <>
                <button onClick={resumeRecording} className="btn-primary">▶ Resume</button>
                <button onClick={stopAndSave} className="btn-secondary">⏹ Stop & Save</button>
              </>
            )}
          </div>
        </div>

        {/* Typed notes */}
        <div className="card space-y-2">
          <label className="text-sm font-semibold text-gray-700">📝 Notes (optional)</label>
          <textarea
            className="input resize-none"
            rows={8}
            placeholder="Add notes while recording, or type them after the meeting..."
            value={typedNotes}
            onChange={e => setTypedNotes(e.target.value)}
          />
        </div>

        {/* Save without recording */}
        {recordingState === 'idle' && typedNotes.length > 10 && (
          <button onClick={() => saveMeeting()} disabled={saving} className="btn-secondary w-full">
            {saving ? 'Saving...' : 'Save Notes Only (no recording)'}
          </button>
        )}

        {saveError && (
          <div className="bg-red-50 text-red-600 text-sm rounded-xl p-3">{saveError}</div>
        )}
      </div>
    </div>
  )
}
