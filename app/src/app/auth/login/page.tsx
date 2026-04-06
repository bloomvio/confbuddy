'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: { preventDefault(): void; currentTarget: HTMLFormElement }) {
    e.preventDefault()
    // Read directly from DOM to capture browser-autofilled values that may not have triggered onChange
    const form = e.currentTarget
    const emailValue    = (form.elements.namedItem('email')    as HTMLInputElement).value
    const passwordValue = (form.elements.namedItem('password') as HTMLInputElement).value
    setLoading(true)
    setError('')
    const { data, error } = await supabase.auth.signInWithPassword({ email: emailValue, password: passwordValue })
    if (error) {
      // Provide a clearer message when the email hasn't been confirmed yet
      if (error.message.toLowerCase().includes('email not confirmed') || error.message.toLowerCase().includes('email_not_confirmed')) {
        setError('Please check your inbox and confirm your email address before signing in.')
      } else {
        setError(error.message)
      }
      setLoading(false)
    } else if (!data.session) {
      // signInWithPassword returned no error but also no session — credentials may be wrong
      setError('Sign in failed — please check your credentials and try again.')
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-white px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🤝</div>
          <h1 className="text-2xl font-bold text-gray-900">ConfBuddy</h1>
          <p className="text-gray-500 text-sm mt-1">Conference Intelligence Platform</p>
        </div>
        <div className="card">
          <h2 className="text-lg font-semibold mb-5">Sign in</h2>
          {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@company.com" autoComplete="email" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" autoComplete="current-password" />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
          <p className="text-center text-sm text-gray-500 mt-4">
            No account? <Link href="/auth/signup" className="text-indigo-600 font-medium">Sign up</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
