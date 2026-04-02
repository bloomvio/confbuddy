import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: conference_id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Forward the auth cookie so sub-requests to /api/company-intel are authenticated
  const cookieHeader = req.headers.get('cookie') ?? ''

  // ── Source 1: conference attendees (prioritise targets) ───────────────────
  const { data: attendees } = await supabase
    .from('cb_conference_attendees')
    .select('id, company, contact_id')
    .eq('conference_id', conference_id)
    .eq('user_id', user.id)
    .eq('intel_cached', false)
    .not('company', 'is', null)
    .order('is_target', { ascending: false })
    .limit(20)

  type CompanyJob = { company: string; contact_id: string | null; attendee_id: string | null }

  const jobs: CompanyJob[] = []
  const seen = new Set<string>()

  for (const a of attendees ?? []) {
    const key = a.company!.toLowerCase()
    if (!seen.has(key)) { seen.add(key); jobs.push({ company: a.company!, contact_id: a.contact_id ?? null, attendee_id: a.id }) }
  }

  // ── Source 2: fall back to CRM data when no attendees ────────────────────
  if (jobs.length === 0) {
    const { data: crmRows } = await supabase
      .from('cb_crm_data')
      .select('company, contact_id')
      .eq('user_id', user.id)
      .not('company', 'is', null)
      .limit(20)

    for (const r of crmRows ?? []) {
      const key = (r.company as string).toLowerCase()
      if (!seen.has(key)) { seen.add(key); jobs.push({ company: r.company as string, contact_id: r.contact_id ?? null, attendee_id: null }) }
    }
  }

  if (jobs.length === 0) {
    return NextResponse.json({ success: true, cached: 0, message: 'No companies found. Upload an attendee list or CRM export first.' })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  let cached   = 0

  // Process in batches of 3 to avoid rate limits
  for (let i = 0; i < jobs.length; i += 3) {
    const batch = jobs.slice(i, i + 3)
    await Promise.all(batch.map(async job => {
      try {
        const res = await fetch(`${appUrl}/api/company-intel`, {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': cookieHeader,           // forward auth so the sub-request is authenticated
          },
          body: JSON.stringify({
            contact_id:    job.contact_id,
            company:       job.company,
            conference_id,
          }),
        })
        if (res.ok) {
          // Mark attendee as cached if sourced from attendees table
          if (job.attendee_id) {
            await supabase
              .from('cb_conference_attendees')
              .update({ intel_cached: true })
              .eq('id', job.attendee_id)
          }
          cached++
        } else {
          console.error(`Intel precache failed for ${job.company}: HTTP ${res.status}`)
        }
      } catch (e) {
        console.error(`Intel precache error for ${job.company}:`, e)
      }
    }))
  }

  return NextResponse.json({ success: true, cached, total: jobs.length })
}
