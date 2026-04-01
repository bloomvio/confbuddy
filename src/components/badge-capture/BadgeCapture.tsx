'use client'
import { useState, useRef, useCallback } from 'react'
import Webcam from 'react-webcam'
import { Contact } from '@/types/database'

type ParsedContact = Partial<Contact> & { raw_text?: string }
type Mode = 'camera' | 'manual'

interface BadgeCaptureProps {
  onCapture: (contact: ParsedContact) => void
}

export default function BadgeCapture({ onCapture }: BadgeCaptureProps) {
  const [mode, setMode] = useState<Mode>('camera')
  const [capturing, setCapturing] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedContact | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const webcamRef = useRef<Webcam>(null)

  // Manual form state
  const [manual, setManual] = useState({ full_name: '', company: '', title: '', email: '', phone: '' })

  const capture = useCallback(async () => {
    const imageSrc = webcamRef.current?.getScreenshot()
    if (!imageSrc) return
    setPreview(imageSrc)
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/contacts/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageSrc }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setParsed(data.contact)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'OCR failed — please try again or enter manually')
    } finally {
      setLoading(false)
    }
  }, [])

  function handleConfirm() {
    if (parsed) onCapture(parsed)
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault()
    onCapture({ ...manual, capture_method: 'manual' })
  }

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex bg-gray-100 rounded-xl p-1">
        {(['camera', 'manual'] as Mode[]).map(m => (
          <button key={m} onClick={() => { setMode(m); setPreview(null); setParsed(null) }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === m ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}>
            {m === 'camera' ? '📷 Scan Badge' : '✏️ Enter Manually'}
          </button>
        ))}
      </div>

      {mode === 'camera' && (
        <div className="space-y-3">
          {!preview ? (
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3]">
              <Webcam ref={webcamRef} screenshotFormat="image/jpeg" className="w-full h-full object-cover"
                videoConstraints={{ facingMode: { ideal: 'environment' } }} />
              {/* Badge guide overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="border-2 border-white/60 rounded-xl w-4/5 h-3/5" />
              </div>
              <p className="absolute bottom-3 left-0 right-0 text-center text-white/80 text-xs">
                Align badge within the frame
              </p>
            </div>
          ) : (
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3]">
              <img src={preview} alt="Badge" className="w-full h-full object-cover" />
            </div>
          )}

          {!preview && (
            <button onClick={capture} disabled={capturing} className="btn-primary w-full">
              📷 Capture Badge
            </button>
          )}

          {loading && (
            <div className="card text-center py-6">
              <div className="text-2xl mb-2 animate-pulse">🔍</div>
              <p className="text-sm text-gray-500">Reading badge with AI...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-xl p-3">
              {error}
              <button onClick={() => { setPreview(null); setError('') }} className="block mt-2 text-indigo-600 font-medium">Try again</button>
            </div>
          )}

          {parsed && !loading && (
            <div className="card space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Review & confirm</p>
              {[
                { key: 'full_name', label: 'Name' },
                { key: 'title', label: 'Title' },
                { key: 'company', label: 'Company' },
                { key: 'email', label: 'Email' },
                { key: 'phone', label: 'Phone' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-xs text-gray-500 mb-0.5">{label}</label>
                  <input className="input text-sm" value={(parsed as Record<string, string>)[key] ?? ''}
                    onChange={e => setParsed(p => ({ ...p, [key]: e.target.value }))} />
                </div>
              ))}
              <div className="flex gap-2">
                <button onClick={() => { setPreview(null); setParsed(null) }} className="btn-secondary flex-1 py-2 text-sm">Retake</button>
                <button onClick={handleConfirm} className="btn-primary flex-1 py-2 text-sm">Confirm ✓</button>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'manual' && (
        <form onSubmit={handleManualSubmit} className="card space-y-3">
          {[
            { key: 'full_name', label: 'Full Name *', required: true, placeholder: 'John Smith' },
            { key: 'company', label: 'Company *', required: true, placeholder: 'Accenture' },
            { key: 'title', label: 'Title', required: false, placeholder: 'VP of Sales' },
            { key: 'email', label: 'Email', required: false, placeholder: 'john@accenture.com' },
            { key: 'phone', label: 'Phone', required: false, placeholder: '+1 312 555 0100' },
          ].map(({ key, label, required, placeholder }) => (
            <div key={key}>
              <label className="block text-xs text-gray-500 mb-0.5">{label}</label>
              <input className="input text-sm" required={required} placeholder={placeholder}
                value={manual[key as keyof typeof manual]}
                onChange={e => setManual(m => ({ ...m, [key]: e.target.value }))} />
            </div>
          ))}
          <button type="submit" className="btn-primary w-full">Save Contact →</button>
        </form>
      )}
    </div>
  )
}
