import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [
    { data: conference },
    { data: documents },
    { data: attendees },
    { count: meetingCount },
    { data: members },
  ] = await Promise.all([
    // RLS allows owner + members to read (after v2 migration)
    supabase.from('cb_conferences').select('*, join_code').eq('id', id).single(),
    supabase.from('cb_conference_documents').select('*').eq('conference_id', id).order('created_at', { ascending: false }),
    supabase.from('cb_conference_attendees').select('*').eq('conference_id', id).order('is_target', { ascending: false }),
    supabase.from('cb_meetings').select('*', { count: 'exact', head: true }).eq('conference_id', id),
    supabase.from('cb_conference_members').select('user_id, role, joined_at').eq('conference_id', id),
  ])

  if (!conference) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isOwner = conference.user_id === user.id

  return NextResponse.json({
    conference,
    documents:     documents    ?? [],
    attendees:     attendees    ?? [],
    members:       members      ?? [],
    meeting_count: meetingCount ?? 0,
    is_owner:      isOwner,
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  if (body.is_active === true) {
    await supabase.from('cb_conferences').update({ is_active: false }).eq('user_id', user.id)
  }

  const { data, error } = await supabase
    .from('cb_conferences')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)   // only owner can patch
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ conference: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('cb_conferences')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)   // only owner can delete

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
