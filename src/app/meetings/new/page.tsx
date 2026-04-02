'use client'
import { useState, useRef, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type RecordingState = 'idle' | 'recording' | 'paused' | 'done' | 'processing'

function NewMeetingContent() {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [typedNotes, setTypedNotes] = useState('')
  const [transcript, setTranscript] = useState('')
  const [duration, setDuration] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [contactId, setContactId] = useState<string | null>(null)
  const [contactName, setContactName] = useState('')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const finalTranscriptRef = useRef('')
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

    // Start audio recording
    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    mediaRecorderRef.current = mediaRecorder
    chunksRef.current = []
    mediaRecorder.ondataavailable = e => chunksRef.current.push(e.data)
    mediaRecorder.start(1000)

    // Start live speech recognition
    const SpeechRecognitionAPI =
      (window as unknown as { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition

    if (SpeechRecognitionAPI) {
      const recognition = new SpeechRecognitionAPI()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'
      finalTranscriptRef.current = ''

      recognition.onresult = (event) => {
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          if (result.isFinal) {
            finalTranscriptRef.current += result[0].transcript + ' '
          } else {
            interim += result[0].transcript
          }
        }
        setTranscript(finalTranscriptRef.current + interim)
      }

      recognition.onerror = (e) => {
        if (e.error !== 'no-speech') console.error('Speech recognition error:', e.error)
      }

      // Restart recognition on end to keep it going for long recordings
      recognition.onend = () => {
        if (recognitionRef.current === recognition && recordingState !== 'done') {
          try { recognition.start() } catch {}
        }
      }

      recognitionRef.current = recognition
      recognition.start()
    }

    setRecordingState('recording')
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
  }

  function pauseRecording() {
    mediaRecorderRef.current?.pause()
    recognitionRef.current?.stop()
    timerRef.current && clearInterval(timerRef.current)
    setRecordingState('paused')
  }

  function resumeRecording() {
    mediaRecorderRef.current?.resume()
    try { recognitionRef.current?.start() } catch {}
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000)
    setRecordingState('recording')
  }

  async function stopAndSave() {
    mediaRecorderRef.current?.stop()
    recognitionRef.current?.stop()
    recognitionRef.current = null
    timerRef.current && clearInterval(timerRef.current)
    setRecordingState('done')

    // Small delay for final chunk + recognition result
    await new Promise(r => setTimeout(r, 800))
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

    const liveTranscript = finalTranscriptRef.current.trim() || transcript.trim()

    // Create meeting record — transcript already captured from browser
    const { data: meeting, error } = await supabase
      .from('cb_meetings')
      .insert({
        user_id: user.id,
        contact_id: contactId,
        meeting_date: new Date().toISOString(),
        typed_notes: typedNotes || null,
        recording_url: recordingUrl,
        transcript_raw: liveTranscript || null,
        transcription_status: 'done',
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
      // Generate notes immediately and await — transcript is already in the DB row
      setRecordingState('processing')
      try {
        await fetch('/api/generate-notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ meeting_id: meeting.id }),
        })
      } catch (e) {
        console.error('Note generation failed:', e)
      }
      router.push(`/meetings/${meeting.id}`)
    }
    setSaving(false)
  }

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  if (recordingState === 'processing') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="card text-center py-12 px-8 space-y-4 max-w-sm w-full mx-4">
          <div className="text-4xl animate-bounce">🧠</div>
          <h2 className="font-semibold text-gray-900">Generating notes...</h2>
          <p className="text-sm text-gray-500">Analysing the conversation. This takes about 10 seconds.</p>
        </div>
      </div>
    )
  }

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

        {/* Live transcript */}
        {transcript && (
          <div className="card space-y-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Live Transcript</p>
            <p className="text-sm text-gray-600 leading-relaxed max-h-32 overflow-y-auto">{transcript}</p>
          </div>
        )}

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

export default function NewMeetingPage() {
  return (
    <Suspense>
      <NewMeetingContent />
    </Suspense>
  )
}
