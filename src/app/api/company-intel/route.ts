import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { generateCompanyIntelRaw } from '@/lib/generate-company-intel'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CACHE_TTL_HOURS = 24

export async function POST(req: NextRequest) {
  const { contact_id, company, force_refresh, conference_id } = await req.json()
  if (!company) return NextResponse.json({ error: 'company is required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── 1. Return cached intel if fresh ──────────────────────────────────────
  if (!force_refresh) {
    const { data: cached } = await supabase
      .from('cb_company_intel')
      .select('*')
      .eq('user_id', user.id)
      .ilike('company_name', company)
      .order('generated_at', { ascending: false })
      .limit(1)
      .single()

    if (cached) {
      const ageHours = (Date.now() - new Date(cached.generated_at).getTime()) / 3_600_000
      if (ageHours < CACHE_TTL_HOURS) {
        return NextResponse.json({ intel: cached.intel, cached: true })
      }
    }
  }

  // ── 2. Generate fresh intel ───────────────────────────────────────────────
  try {
    const intel = await generateCompanyIntelRaw({
      company,
      contact_id:    contact_id    ?? null,
      conference_id: conference_id ?? null,
      user_id:       user.id,
      supabase,
      anthropic,
    })

    // ── 3. Cache the result ─────────────────────────────────────────────────
    const serviceClient = await createServiceClient()

    await serviceClient
      .from('cb_company_intel')
      .delete()
      .eq('user_id', user.id)
      .ilike('company_name', company)

    await serviceClient.from('cb_company_intel').insert({
      user_id:      user.id,
      contact_id:   contact_id   ?? null,
      company_name: company,
      intel,
      generated_at: new Date().toISOString(),
      is_fresh:     true,
    })

    return NextResponse.json({ intel, cached: false })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Intelligence generation failed' },
      { status: 500 }
    )
  }
}
