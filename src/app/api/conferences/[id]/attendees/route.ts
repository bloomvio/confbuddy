import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: conference_id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file     = formData.get('file') as File
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const buffer   = Buffer.from(await file.arrayBuffer())
  const filename = file.name
  let rows: Record<string, string>[] = []

  if (filename.endsWith('.csv')) {
    const result = Papa.parse<Record<string, string>>(buffer.toString('utf-8'), { header: true, skipEmptyLines: true })
    rows = result.data
  } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
    const wb    = XLSX.read(buffer, { type: 'buffer' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet)
  } else {
    return NextResponse.json({ error: 'Unsupported format — use .csv or .xlsx' }, { status: 400 })
  }

  if (rows.length === 0) return NextResponse.json({ error: 'File is empty' }, { status: 400 })

  // ── Flexible column finder ───────────────────────────────────────────────────
  const col = (row: Record<string, string>, ...candidates: string[]) => {
    const keys = Object.keys(row)
    const key  = keys.find(k =>
      candidates.some(c => k.toLowerCase().replace(/[^a-z0-9]/g, '').includes(c.toLowerCase().replace(/[^a-z0-9]/g, '')))
    )
    return key ? (row[key] ?? '').toString().trim() || null : null
  }

  const normalised = rows.map(r => ({
    conference_id,
    user_id:   user.id,
    full_name: col(r, 'name', 'fullname', 'full_name', 'attendee', 'contact', 'person'),
    company:   col(r, 'company', 'organization', 'account', 'employer', 'org'),
    title:     col(r, 'title', 'jobtitle', 'job_title', 'position', 'role'),
    email:     col(r, 'email', 'mail', 'emailaddress'),
    phone:     col(r, 'phone', 'mobile', 'tel', 'telephone'),
    source:    'attendee_list',
  })).filter(r => r.full_name || r.email)

  if (normalised.length === 0) {
    return NextResponse.json({ error: 'No valid rows found — ensure file has name or email columns' }, { status: 400 })
  }

  // ── Cross-reference CRM data for each attendee ────────────────────────────────
  const emails   = normalised.map(a => a.email).filter(Boolean) as string[]
  const names    = normalised.map(a => a.full_name).filter(Boolean) as string[]

  const [{ data: crmByEmail }, { data: crmByName }, { data: contactsByEmail }] = await Promise.all([
    emails.length > 0
      ? supabase.from('cb_crm_data').select('id, email, relationship, temperature').eq('user_id', user.id).in('email', emails)
      : Promise.resolve({ data: [] }),
    names.length > 0
      ? supabase.from('cb_crm_data').select('id, full_name, relationship, temperature').eq('user_id', user.id)
      : Promise.resolve({ data: [] }),
    emails.length > 0
      ? supabase.from('cb_contacts').select('id, email').eq('user_id', user.id).in('email', emails)
      : Promise.resolve({ data: [] }),
  ])

  const crmEmailMap  = new Map((crmByEmail ?? []).map(r => [r.email?.toLowerCase(), r]))
  const crmNameMap   = new Map((crmByName  ?? []).map(r => [r.full_name?.toLowerCase(), r]))
  const contactMap   = new Map((contactsByEmail ?? []).map(r => [r.email?.toLowerCase(), r.id]))

  // ── Enrich + determine is_target ──────────────────────────────────────────────
  const enriched = normalised.map(a => {
    const crmRow = (a.email ? crmEmailMap.get(a.email.toLowerCase()) : null)
                ?? (a.full_name ? crmNameMap.get(a.full_name.toLowerCase()) : null)

    const is_target = crmRow
      ? (crmRow.relationship === 'customer' || (crmRow.relationship === 'prospect' && crmRow.temperature === 'hot'))
      : false

    return {
      ...a,
      crm_match_id: crmRow?.id ?? null,
      contact_id:   a.email ? (contactMap.get(a.email.toLowerCase()) ?? null) : null,
      is_target,
    }
  })

  // ── Delete existing attendees for this conference, insert fresh ────────────────
  const serviceClient = await createServiceClient()

  await serviceClient
    .from('cb_conference_attendees')
    .delete()
    .eq('conference_id', conference_id)
    .eq('user_id', user.id)

  const { error } = await serviceClient
    .from('cb_conference_attendees')
    .insert(enriched)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const targets   = enriched.filter(a => a.is_target).length
  const crmMatched = enriched.filter(a => a.crm_match_id).length

  return NextResponse.json({
    success: true,
    total:       enriched.length,
    crm_matched: crmMatched,
    targets,
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: conference_id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { attendee_id, is_target } = await req.json()

  const { error } = await supabase
    .from('cb_conference_attendees')
    .update({ is_target })
    .eq('id', attendee_id)
    .eq('conference_id', conference_id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
