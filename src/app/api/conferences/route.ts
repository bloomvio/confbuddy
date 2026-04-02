import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no ambiguous chars (0,O,1,I)
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Return conferences the user owns + conferences they've joined as a member
  const [{ data: owned }, { data: memberships }] = await Promise.all([
    supabase
      .from('cb_conferences')
      .select('*, join_code')
      .eq('user_id', user.id)
      .order('start_date', { ascending: false }),

    supabase
      .from('cb_conference_members')
      .select('role, conference:cb_conferences(*, join_code)')
      .eq('user_id', user.id)
      .eq('role', 'member'),
  ])

  const ownedIds = new Set((owned ?? []).map(c => c.id))
  const joined   = (memberships ?? [])
    .map(m => m.conference)
    .filter(Boolean)
    .filter(c => !ownedIds.has((c as { id: string }).id))

  const conferences = [
    ...(owned ?? []).map(c => ({ ...c, member_role: 'owner' })),
    ...(joined as Array<Record<string, unknown>>).map(c => ({ ...c, member_role: 'member' })),
  ].sort((a, b) => {
    const da = a.start_date ? new Date(a.start_date as string).getTime() : 0
    const db = b.start_date ? new Date(b.start_date as string).getTime() : 0
    return db - da
  })

  return NextResponse.json({ conferences })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, location, start_date, end_date, description, set_active } = body

  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  // ── Duplicate name check (only among this user's own conferences) ─────────
  // We can't easily search other users' conferences via RLS, so we just check own
  // The join page handles cross-user discovery via join codes
  const { data: existing } = await supabase
    .from('cb_conferences')
    .select('id')
    .ilike('name', name.trim())
    .neq('user_id', user.id)
    .limit(1)
    .single()

  if (existing) {
    return NextResponse.json({
      error:   'duplicate_name',
      message: `A conference named "${name.trim()}" already exists. If it's the same event, ask the organizer for the join code instead of creating a duplicate.`,
    }, { status: 409 })
  }

  // ── Generate unique join code ─────────────────────────────────────────────
  let join_code = generateJoinCode()
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: clash } = await supabase
      .from('cb_conferences')
      .select('id')
      .eq('join_code', join_code)
      .single()
    if (!clash) break
    join_code = generateJoinCode()
  }

  if (set_active) {
    await supabase.from('cb_conferences').update({ is_active: false }).eq('user_id', user.id)
  }

  const { data, error } = await supabase
    .from('cb_conferences')
    .insert({
      user_id:     user.id,
      name:        name.trim(),
      location:    location?.trim()    || null,
      start_date:  start_date          || null,
      end_date:    end_date            || null,
      description: description?.trim() || null,
      is_active:   set_active ?? true,
      join_code,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ conference: data })
}
