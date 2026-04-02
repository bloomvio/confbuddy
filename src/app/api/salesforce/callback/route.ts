import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const settingsUrl = new URL('/settings', req.url)

  if (error || !code) {
    settingsUrl.searchParams.set('sf', 'error')
    settingsUrl.searchParams.set('sf_msg', error ?? 'Authorization cancelled')
    return NextResponse.redirect(settingsUrl)
  }

  // CSRF check
  const storedState = req.cookies.get('sf_oauth_state')?.value
  if (!state || state !== storedState) {
    settingsUrl.searchParams.set('sf', 'error')
    settingsUrl.searchParams.set('sf_msg', 'State mismatch — please try again')
    return NextResponse.redirect(settingsUrl)
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://login.salesforce.com/services/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'authorization_code',
      client_id:     process.env.SALESFORCE_CLIENT_ID!,
      client_secret: process.env.SALESFORCE_CLIENT_SECRET!,
      redirect_uri:  `${process.env.NEXT_PUBLIC_APP_URL}/api/salesforce/callback`,
      code,
    }),
  })

  const tokens = await tokenRes.json()

  if (!tokens.access_token) {
    settingsUrl.searchParams.set('sf', 'error')
    settingsUrl.searchParams.set('sf_msg', tokens.error_description ?? 'Token exchange failed')
    return NextResponse.redirect(settingsUrl)
  }

  // Identify the logged-in user (session cookie is still valid)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/auth/login', req.url))

  // Persist tokens — stored as JSON in vault_secret_id (Vault proper in production)
  const serviceClient = await createServiceClient()
  await serviceClient.from('cb_user_integrations').upsert({
    user_id:       user.id,
    service_name:  'salesforce',
    auth_type:     'oauth',
    vault_secret_id: JSON.stringify({
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      instance_url:  tokens.instance_url,
    }),
    display_label: 'Salesforce',
    is_active:     true,
  }, { onConflict: 'user_id,service_name' })

  settingsUrl.searchParams.set('sf', 'connected')
  const response = NextResponse.redirect(settingsUrl)
  response.cookies.delete('sf_oauth_state')
  return response
}
