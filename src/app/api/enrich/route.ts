import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { name, company, email } = await req.json()
  if (!name && !company) return NextResponse.json({ enriched: {} })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 1. Check CRM data for a match
  let crmMatch = null
  if (name || email) {
    const { data: crmRows } = await supabase
      .from('cb_crm_data')
      .select('*')
      .or(email ? `email.eq.${email},full_name.ilike.%${name}%` : `full_name.ilike.%${name}%`)
      .limit(1)
    crmMatch = crmRows?.[0] ?? null
  }

  // 2. Get Apollo API key from user integrations (Vault)
  let apolloData = null
  const { data: integration } = await supabase
    .from('cb_user_integrations')
    .select('*')
    .eq('service_name', 'apollo')
    .eq('is_active', true)
    .single()

  if (integration?.vault_secret_id) {
    // In production, retrieve from Vault and call Apollo API
    // For now, we'll use Claude to generate a company briefing
  }

  // 3. Generate company briefing with Claude
  const companySummaryPrompt = `You are a business intelligence assistant. Generate a brief company profile for "${company}" that would be useful for a sales professional about to meet someone from this company at a conference.

Include:
- What the company does (2-3 sentences)
- Key industries/verticals they serve
- Company size estimate
- 3-5 likely technology systems they use

Return JSON only:
{
  "company_summary": "...",
  "systems_landscape": ["tool1", "tool2", ...],
  "reporting_hierarchy": null
}`

  let companySummary = null
  let systemsLandscape = null

  try {
    const claudeRes = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 600,
      messages: [{ role: 'user', content: companySummaryPrompt }]
    })
    const text = claudeRes.content[0].type === 'text' ? claudeRes.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      companySummary = parsed.company_summary
      systemsLandscape = parsed.systems_landscape
    }
  } catch {}

  // 4. Build enriched contact
  const enriched: Record<string, unknown> = {
    company_summary: companySummary,
    systems_landscape: systemsLandscape,
    apollo_data: apolloData,
    enriched_at: new Date().toISOString(),
    crm_relationship: crmMatch?.relationship ?? 'unknown',
    crm_temperature: crmMatch?.temperature ?? 'unknown',
    crm_products_implemented: crmMatch?.products_implemented ?? null,
    crm_notes: crmMatch?.notes ?? null,
    crm_match_id: crmMatch?.id ?? null,
  }

  return NextResponse.json({ enriched })
}
