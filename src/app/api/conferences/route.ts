import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('cb_conferences')
    .select('*')
    .eq('user_id', user.id)
    .order('start_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ conferences: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, location, start_date, end_date, description, set_active } = body

  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  // If setting as active, deactivate all others first
  if (set_active) {
    await supabase
      .from('cb_conferences')
      .update({ is_active: false })
      .eq('user_id', user.id)
  }

  const { data, error } = await supabase
    .from('cb_conferences')
    .insert({
      user_id:    user.id,
      name:       name.trim(),
      location:   location?.trim() || null,
      start_date: start_date || null,
      end_date:   end_date   || null,
      description: description?.trim() || null,
      is_active:  set_active ?? true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ conference: data })
}
