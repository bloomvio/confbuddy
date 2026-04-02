import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/auth/login', req.url))

  const state = crypto.randomUUID()

  const authUrl = new URL('https://login.salesforce.com/services/oauth2/authorize')
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', process.env.SALESFORCE_CLIENT_ID!)
  authUrl.searchParams.set('redirect_uri', `${process.env.NEXT_PUBLIC_APP_URL}/api/salesforce/callback`)
  authUrl.searchParams.set('scope', 'api refresh_token offline_access')
  authUrl.searchParams.set('state', state)

  const response = NextResponse.redirect(authUrl)
  response.cookies.set('sf_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
    sameSite: 'lax',
  })
  return response
}
