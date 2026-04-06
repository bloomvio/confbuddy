import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: conference_id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get all companies from attendees for this conference
  const { data: attendees } = await supabase
    .from('cb_conference_attendees')
    .select('company')
    .eq('conference_id', conference_id)
    .not('company', 'is', null)

  // Fall back to CRM data if no attendees
  let companies: string[] = [...new Set((attendees ?? []).map(a => a.company as string).filter(Boolean))]

  if (companies.length === 0) {
    const { data: crmRows } = await supabase
      .from('cb_crm_data')
      .select('company')
      .eq('user_id', user.id)
      .not('company', 'is', null)
    companies = [...new Set((crmRows ?? []).map(r => r.company as string).filter(Boolean))]
  }

  if (companies.length === 0) return NextResponse.json({ intel: [] })

  // Fetch all intel for this user and filter by conference companies
  const { data: allIntel } = await supabase
    .from('cb_company_intel')
    .select('id, company_name, intel, generated_at')
    .eq('user_id', user.id)
    .order('generated_at', { ascending: false })

  const companySet = new Set(companies.map(c => c.toLowerCase()))

  // Deduplicate — keep most recent per company
  const seen = new Set<string>()
  const filtered = (allIntel ?? []).filter(row => {
    const key = (row.company_name as string).toLowerCase()
    if (!companySet.has(key)) return false
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // Sort: customers first, then hot prospects, then alpha
  filtered.sort((a, b) => {
    const statusOrder = (intel: Record<string, unknown>) => {
      const s = (intel?.internal_brief as Record<string, unknown>)?.account_status as string
      if (s === 'customer')  return 0
      if (s === 'prospect')  return 1
      if (s === 'partner')   return 2
      return 3
    }
    const tempOrder = (intel: Record<string, unknown>) => {
      const t = (intel?.internal_brief as Record<string, unknown>)?.temperature as string
      if (t === 'hot')  return 0
      if (t === 'warm') return 1
      return 2
    }
    const ao = statusOrder(a.intel as Record<string, unknown>) - statusOrder(b.intel as Record<string, unknown>)
    if (ao !== 0) return ao
    const to = tempOrder(a.intel as Record<string, unknown>) - tempOrder(b.intel as Record<string, unknown>)
    if (to !== 0) return to
    return (a.company_name as string).localeCompare(b.company_name as string)
  })

  return NextResponse.json({ intel: filtered, total_companies: companies.length })
}
