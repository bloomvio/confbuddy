import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// This endpoint just returns the list of companies to process.
// The client calls /api/company-intel for each one directly — avoids server-to-server
// auth issues and Vercel's per-request timeout.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: conference_id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Source 1: conference attendees (targets first) ────────────────────────
  const { data: attendees } = await supabase
    .from('cb_conference_attendees')
    .select('id, company, contact_id')
    .eq('conference_id', conference_id)
    .eq('user_id', user.id)
    .not('company', 'is', null)
    .order('is_target', { ascending: false })
    .limit(30)

  type CompanyJob = { company: string; contact_id: string | null }

  const jobs: CompanyJob[] = []
  const seen = new Set<string>()

  for (const a of attendees ?? []) {
    const key = a.company!.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      jobs.push({ company: a.company!, contact_id: a.contact_id ?? null })
    }
  }

  // ── Source 2: CRM data when no attendees ──────────────────────────────────
  if (jobs.length === 0) {
    const { data: crmRows } = await supabase
      .from('cb_crm_data')
      .select('company')
      .eq('user_id', user.id)
      .not('company', 'is', null)
      .limit(30)

    for (const r of crmRows ?? []) {
      const key = (r.company as string).toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        jobs.push({ company: r.company as string, contact_id: null })
      }
    }
  }

  // Return the company list to the client — it calls /api/company-intel directly
  return NextResponse.json({ companies: jobs, conference_id })
}
