import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { code } = await req.json()
  if (!code?.trim()) return NextResponse.json({ error: 'Join code is required' }, { status: 400 })

  // Find conference by join code (case-insensitive)
  const { data: conference } = await supabase
    .from('cb_conferences')
    .select('id, name, user_id, is_active, location, start_date')
    .ilike('join_code', code.trim())
    .single()

  if (!conference) {
    return NextResponse.json({ error: 'Invalid code — check with the conference organizer' }, { status: 404 })
  }

  // Don't let the owner "join" their own conference
  if (conference.user_id === user.id) {
    return NextResponse.json({ conference, already_member: true })
  }

  // Add as member (upsert — idempotent)
  const { error } = await supabase
    .from('cb_conference_members')
    .upsert(
      { conference_id: conference.id, user_id: user.id, role: 'member' },
      { onConflict: 'conference_id,user_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ conference, joined: true })
}
