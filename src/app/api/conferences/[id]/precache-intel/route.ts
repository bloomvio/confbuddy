import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: conference_id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get attendees that have a company and haven't been cached yet
  // Prioritise targets, then CRM-matched, then others
  const { data: attendees } = await supabase
    .from('cb_conference_attendees')
    .select('id, company, contact_id')
    .eq('conference_id', conference_id)
    .eq('user_id', user.id)
    .eq('intel_cached', false)
    .not('company', 'is', null)
    .order('is_target', { ascending: false })
    .limit(15)

  if (!attendees?.length) return NextResponse.json({ success: true, cached: 0 })

  // Deduplicate by company
  const seen      = new Set<string>()
  const unique    = attendees.filter(a => {
    const key = a.company!.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? ''
  let cached    = 0

  // Process in batches of 3 to avoid rate limits
  for (let i = 0; i < unique.length; i += 3) {
    const batch = unique.slice(i, i + 3)
    await Promise.all(batch.map(async a => {
      try {
        const res = await fetch(`${appUrl}/api/company-intel`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            contact_id:    a.contact_id ?? null,
            company:       a.company,
            conference_id,
          }),
        })
        if (res.ok) {
          await supabase
            .from('cb_conference_attendees')
            .update({ intel_cached: true })
            .eq('id', a.id)
          cached++
        }
      } catch (e) {
        console.error(`Intel precache failed for ${a.company}:`, e)
      }
    }))
  }

  return NextResponse.json({ success: true, cached, total: unique.length })
}
