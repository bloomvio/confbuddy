import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateCompanyIntelRaw } from '@/lib/generate-company-intel'
import Anthropic from '@anthropic-ai/sdk'

// Allow up to 5 min on Vercel Pro for the after() background work
export const maxDuration = 300

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: conference_id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Build company list ────────────────────────────────────────────────────
  const { data: attendees } = await supabase
    .from('cb_conference_attendees')
    .select('id, company, contact_id')
    .eq('conference_id', conference_id)
    .not('company', 'is', null)
    .order('is_target', { ascending: false })
    .limit(50)

  type CompanyJob = { company: string; contact_id: string | null }
  const jobs: CompanyJob[] = []
  const seen = new Set<string>()

  for (const a of attendees ?? []) {
    const key = a.company!.toLowerCase()
    if (!seen.has(key)) { seen.add(key); jobs.push({ company: a.company!, contact_id: a.contact_id ?? null }) }
  }

  // Fall back to CRM data when no attendees
  if (jobs.length === 0) {
    const { data: crmRows } = await supabase
      .from('cb_crm_data')
      .select('company')
      .eq('user_id', user.id)
      .not('company', 'is', null)
      .limit(50)

    for (const r of crmRows ?? []) {
      const key = (r.company as string).toLowerCase()
      if (!seen.has(key)) { seen.add(key); jobs.push({ company: r.company as string, contact_id: null }) }
    }
  }

  if (jobs.length === 0) {
    return NextResponse.json({
      error: 'No companies found. Upload an attendee list or CRM export first.',
    }, { status: 400 })
  }

  // ── Create "processing" notification ─────────────────────────────────────
  const { data: notification } = await supabase
    .from('cb_notifications')
    .insert({
      user_id: user.id,
      type:    'processing',
      title:   `Generating intel for ${jobs.length} companies`,
      body:    'Starting… this runs in the background.',
      read:    false,
    })
    .select()
    .single()

  const notification_id = notification?.id
  const user_id = user.id

  // ── Return immediately — background work via after() ─────────────────────
  after(async () => {
    const admin    = createAdminClient()
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    let done = 0

    for (let i = 0; i < jobs.length; i += 2) {
      const batch = jobs.slice(i, i + 2)

      await Promise.all(batch.map(async ({ company, contact_id }) => {
        try {
          const intel = await generateCompanyIntelRaw({
            company,
            contact_id,
            conference_id,
            user_id,
            supabase: admin,
            anthropic,
          })

          // Replace cached entry
          await admin.from('cb_company_intel').delete()
            .eq('user_id', user_id).ilike('company_name', company)
          await admin.from('cb_company_intel').insert({
            user_id,
            contact_id:   contact_id ?? null,
            company_name: company,
            intel,
            generated_at: new Date().toISOString(),
            is_fresh:     true,
          })
          done++
        } catch (e) {
          console.error(`Precache failed for ${company}:`, e)
        }
      }))

      // Update notification progress
      if (notification_id) {
        await admin.from('cb_notifications').update({
          body: `Generated ${done} of ${jobs.length} companies…`,
        }).eq('id', notification_id)
      }
    }

    // Mark notification done
    if (notification_id) {
      await admin.from('cb_notifications').update({
        type:  done > 0 ? 'success' : 'error',
        title: done > 0
          ? `Intel ready — ${done} company brief${done > 1 ? 's' : ''} generated`
          : 'Intel generation failed',
        body: done > 0
          ? `Pre-generated briefs are ready for ${conference_id ? 'this conference' : 'your accounts'}.`
          : 'No briefs were generated. Check logs.',
        read: false,
      }).eq('id', notification_id)
    }
  })

  return NextResponse.json({
    started:         true,
    total:           jobs.length,
    notification_id,
  })
}
