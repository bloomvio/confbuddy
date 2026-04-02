'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SettingsPage() {
  const [apolloKey, setApolloKey]       = useState('')
  const [savingKey, setSavingKey]       = useState(false)
  const [uploading, setUploading]       = useState(false)
  const [uploadResult, setUploadResult] = useState<{ imported?: number; error?: string } | null>(null)

  // Salesforce state
  const [sfConnected, setSfConnected]   = useState<boolean | null>(null)  // null = loading
  const [sfLastSync, setSfLastSync]     = useState<string | null>(null)
  const [sfSyncing, setSfSyncing]       = useState(false)
  const [sfSyncResult, setSfSyncResult] = useState<{ imported?: number; contacts?: number; leads?: number; error?: string } | null>(null)
  const [sfDisconnecting, setSfDisconnecting] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  // Load Salesforce connection status + handle redirect params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sfParam = params.get('sf')
    if (sfParam === 'connected') setSfSyncResult(null)  // clear old result on reconnect
    if (sfParam === 'error') {
      setSfSyncResult({ error: params.get('sf_msg') ?? 'Salesforce connection failed' })
    }
    // Clean URL
    if (sfParam) window.history.replaceState({}, '', '/settings')

    async function loadSfStatus() {
      const { data } = await supabase
        .from('cb_user_integrations')
        .select('is_active, last_synced_at')
        .eq('service_name', 'salesforce')
        .single()
      setSfConnected(data?.is_active ?? false)
      setSfLastSync(data?.last_synced_at ?? null)
    }
    loadSfStatus()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveApolloKey() {
    if (!apolloKey.trim()) return
    setSavingKey(true)
    const res = await fetch('/api/settings/integration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_name: 'apollo', api_key: apolloKey }),
    })
    setSavingKey(false)
    if (res.ok) { setApolloKey(''); alert('Apollo.io key saved securely!') }
  }

  async function handleCrmUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadResult(null)
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch('/api/crm-upload', { method: 'POST', body: formData })
    const data = await res.json()
    setUploadResult(data)
    setUploading(false)
  }

  async function handleSfSync() {
    setSfSyncing(true)
    setSfSyncResult(null)
    const res = await fetch('/api/salesforce/sync', { method: 'POST' })
    const data = await res.json()
    setSfSyncing(false)
    setSfSyncResult(data)
    if (!data.error) setSfLastSync(new Date().toISOString())
  }

  async function handleSfDisconnect() {
    setSfDisconnecting(true)
    await supabase
      .from('cb_user_integrations')
      .update({ is_active: false })
      .eq('service_name', 'salesforce')
    setSfConnected(false)
    setSfLastSync(null)
    setSfSyncResult(null)
    setSfDisconnecting(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <header className="bg-white border-b border-gray-100 px-4 py-4">
        <h1 className="font-semibold text-gray-900">⚙️ Settings</h1>
      </header>

      <div className="px-4 py-6 max-w-lg mx-auto space-y-5">

        {/* CRM Data Upload */}
        <div className="card space-y-3">
          <h2 className="font-semibold text-gray-900">📊 CRM Data</h2>
          <p className="text-sm text-gray-500">
            Upload an Excel or CSV export from your CRM. ConfBuddy will match contacts automatically when you scan badges.
          </p>
          <div
            className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-indigo-300 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="text-3xl mb-2">📁</div>
            <p className="text-sm font-medium text-gray-600">Drop your CRM export here</p>
            <p className="text-xs text-gray-400 mt-1">Supports .xlsx and .csv</p>
          </div>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleCrmUpload} />
          {uploading && <p className="text-sm text-indigo-600 text-center animate-pulse">Importing data...</p>}
          {uploadResult?.imported != null && (
            <div className="bg-green-50 text-green-700 text-sm rounded-lg p-3">
              ✓ Imported {uploadResult.imported} contacts from your CRM
            </div>
          )}
          {uploadResult?.error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3">{uploadResult.error}</div>
          )}
        </div>

        {/* Salesforce Integration */}
        <div className="card space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-gray-900">☁️ Salesforce</h2>
            {sfConnected === true && (
              <span className="text-xs bg-green-100 text-green-700 font-medium px-2 py-0.5 rounded-full">Connected</span>
            )}
          </div>

          {sfConnected === null && (
            <p className="text-sm text-gray-400 animate-pulse">Checking connection...</p>
          )}

          {sfConnected === false && sfConnected !== null && (
            <>
              <p className="text-sm text-gray-500">
                Connect Salesforce to sync your Contacts and Leads, and automatically log meeting notes as Salesforce Tasks.
              </p>
              <a href="/api/salesforce/connect" className="btn-primary w-full text-center block">
                Connect Salesforce
              </a>
            </>
          )}

          {sfConnected === true && (
            <>
              <p className="text-sm text-gray-500">
                Your Salesforce Contacts and Leads sync into ConfBuddy. Meeting notes are logged as Tasks in Salesforce.
              </p>

              {sfLastSync && (
                <p className="text-xs text-gray-400">
                  Last synced: {new Date(sfLastSync).toLocaleString()}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleSfSync}
                  disabled={sfSyncing}
                  className="btn-primary flex-1"
                >
                  {sfSyncing ? 'Syncing...' : '🔄 Sync Now'}
                </button>
                <button
                  onClick={handleSfDisconnect}
                  disabled={sfDisconnecting}
                  className="btn-secondary px-4 text-red-500 hover:text-red-600"
                >
                  Disconnect
                </button>
              </div>

              {sfSyncResult?.imported != null && (
                <div className="bg-green-50 text-green-700 text-sm rounded-lg p-3">
                  ✓ Synced {sfSyncResult.imported} records ({sfSyncResult.contacts} contacts, {sfSyncResult.leads} leads)
                </div>
              )}
            </>
          )}

          {sfSyncResult?.error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3">{sfSyncResult.error}</div>
          )}

          <p className="text-xs text-gray-400">
            Requires a Connected App in Salesforce with OAuth enabled.{' '}
            Add <code className="bg-gray-100 px-1 rounded">SALESFORCE_CLIENT_ID</code> and{' '}
            <code className="bg-gray-100 px-1 rounded">SALESFORCE_CLIENT_SECRET</code> to your environment variables.
          </p>
        </div>

        {/* Apollo.io Integration */}
        <div className="card space-y-3">
          <h2 className="font-semibold text-gray-900">🔍 Apollo.io Integration</h2>
          <p className="text-sm text-gray-500">
            Add your Apollo.io API key to enable automatic LinkedIn enrichment and company intelligence.
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              className="input flex-1"
              placeholder="Enter Apollo API key..."
              value={apolloKey}
              onChange={e => setApolloKey(e.target.value)}
            />
            <button
              onClick={saveApolloKey}
              disabled={savingKey || !apolloKey.trim()}
              className="btn-primary px-4 py-2 text-sm"
            >
              {savingKey ? '...' : 'Save'}
            </button>
          </div>
          <p className="text-xs text-gray-400">Keys are stored encrypted — never exposed to the browser after saving.</p>
        </div>

        {/* About */}
        <div className="card space-y-1 text-sm text-gray-500">
          <h2 className="font-semibold text-gray-900 mb-2">About ConfBuddy</h2>
          <p>Version 0.1.0 · Built by HighRadians</p>
          <p>AI powered by Claude (Anthropic)</p>
          <p>Transcription via Web Speech API</p>
        </div>

        <button onClick={handleSignOut} className="w-full py-3 text-sm font-medium text-red-500 hover:text-red-600 transition-colors">
          Sign out
        </button>
      </div>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex">
        {[
          { href: '/dashboard', icon: '🏠', label: 'Home' },
          { href: '/contacts',  icon: '👥', label: 'Contacts' },
          { href: '/contacts/scan', icon: '📷', label: 'Scan' },
          { href: '/meetings',  icon: '🎙️', label: 'Meetings' },
          { href: '/settings',  icon: '⚙️', label: 'Settings' },
        ].map(n => (
          <a key={n.href} href={n.href} className="flex-1 flex flex-col items-center py-3 text-gray-400 hover:text-indigo-600 transition-colors">
            <span className="text-xl">{n.icon}</span>
            <span className="text-xs mt-0.5">{n.label}</span>
          </a>
        ))}
      </nav>
    </div>
  )
}
