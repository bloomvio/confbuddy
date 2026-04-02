import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CACHE_TTL_HOURS = 24

export async function POST(req: NextRequest) {
  const { contact_id, company, force_refresh } = await req.json()
  if (!company) return NextResponse.json({ error: 'company is required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── 1. Return cached intel if fresh ─────────────────────────────────────
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

  // ── 2. Pull ALL data sources in parallel ────────────────────────────────
  const [
    { data: crmRows },
    contactResult,
    meetingNotesResult,
  ] = await Promise.all([
    // Source 1: CRM data (CSV uploads + Salesforce sync — both land in cb_crm_data)
    supabase
      .from('cb_crm_data')
      .select('*')
      .ilike('company', `%${company}%`)
      .limit(20),

    // Source 2: Contact being met (name, title, relationship, products, notes)
    contact_id
      ? supabase
          .from('cb_contacts')
          .select('full_name, title, company, email, crm_relationship, crm_temperature, crm_notes, crm_products_implemented, systems_landscape')
          .eq('id', contact_id)
          .single()
      : Promise.resolve({ data: null }),

    // Source 3: Past meeting notes with people from this company
    contact_id
      ? supabase
          .from('cb_meetings')
          .select('meeting_date, cb_meeting_notes(bottom_line_summary, intent, raw_notes)')
          .eq('contact_id', contact_id)
          .eq('status', 'notes_ready')
          .order('meeting_date', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: null }),
  ])

  const contactInfo = contactResult.data ?? null
  const pastMeetings = (meetingNotesResult.data ?? []) as Array<{
    meeting_date: string
    cb_meeting_notes: Array<{ bottom_line_summary: string; intent: string; raw_notes: string }>
  }>

  // ── 3. Summarise CRM data ────────────────────────────────────────────────
  const crmSummary = crmRows && crmRows.length > 0 ? crmRows.map(r => ({
    name:                 r.full_name,
    relationship:         r.relationship,
    temperature:          r.temperature,
    products:             r.products_implemented,
    arr:                  r.arr,
    contract_value:       r.contract_value,
    outstanding_invoices: r.outstanding_invoices,
    outstanding_amount:   r.outstanding_amount,
    open_issues:          r.open_issues,
    health_score:         r.health_score,
    renewal_date:         r.renewal_date,
    account_owner:        r.account_owner,
    last_contact:         r.last_contact_date,
    notes:                r.notes,
    extra:                r.raw_row,
  })) : null

  // ── 4. Summarise past meetings ────────────────────────────────────────────
  const meetingHistory = pastMeetings.length > 0
    ? pastMeetings.map(m => {
        const note = m.cb_meeting_notes?.[0]
        return {
          date: m.meeting_date?.split('T')[0],
          summary: note?.bottom_line_summary ?? null,
          intent:  note?.intent ?? null,
        }
      }).filter(m => m.summary || m.intent)
    : null

  // ── 5. Build the prompt ──────────────────────────────────────────────────
  const prompt = `You are a senior B2B sales intelligence analyst. A sales professional is about to meet someone from "${company}". Build the most comprehensive, actionable intelligence brief possible using ALL available sources below.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SOURCE 1: INTERNAL CRM DATA
(From CSV/Excel uploads and Salesforce sync — treat as ground truth)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${crmSummary ? JSON.stringify(crmSummary, null, 2) : 'No CRM records found for this company.'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SOURCE 2: CONTACT BEING MET
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${contactInfo ? JSON.stringify(contactInfo, null, 2) : 'Unknown'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SOURCE 3: PAST MEETING HISTORY
(Notes from previous meetings with this contact — use to identify progress, open items, relationship context)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${meetingHistory && meetingHistory.length > 0 ? JSON.stringify(meetingHistory, null, 2) : 'No previous meetings recorded.'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SOURCE 4: PUBLIC / MARKET KNOWLEDGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use your training knowledge for: company background, industry, financials, leadership, news, tech stack, competitors.

INSTRUCTIONS:
- For CRM fields — use exactly what is in the data. Do not invent or estimate CRM values.
- For public fields — use your knowledge. Mark estimates with (~).
- For meeting history — surface any open threads, prior commitments, or relationship signals.
- Be specific, not vague. Prioritise actionability.

Return ONLY valid JSON in this exact structure:

{
  "snapshot": "One crisp sentence: what they do and who they sell to",
  "industry": "...",
  "hq": "City, Country",
  "founded": "YYYY",
  "size": "X,000 employees (~)",
  "public_or_private": "Public (TICKER) | Private",

  "financials": {
    "revenue_estimate": "$XXM (~)",
    "arr_estimate": "$XXM (~) | from CRM: $XX",
    "growth_rate": "~XX% YoY",
    "funding": "Series X, $XXM (YYYY) | Bootstrapped | Public",
    "valuation": "$XXM (~)",
    "gross_margin": "~XX%"
  },

  "our_account": {
    "status": "customer | prospect | partner | churned | unknown",
    "temperature": "hot | warm | cold | unknown",
    "arr": "from CRM or null",
    "contract_value": "from CRM or null",
    "products_in_use": ["list from CRM"],
    "account_owner": "from CRM or null",
    "last_contact": "from CRM or null",
    "renewal_date": "from CRM or null",
    "outstanding_invoices": 0,
    "outstanding_amount": "from CRM or null",
    "open_issues": ["from CRM"],
    "health": "green | yellow | red | unknown",
    "notes": "combined CRM notes + any open threads from past meetings"
  },

  "relationship_history": "1-2 sentences summarising prior meetings, any open commitments or next steps from previous conversations",

  "leadership": [
    {
      "name": "Full Name",
      "role": "CEO | CFO | CTO | CPO",
      "since": "YYYY",
      "background": "1 sentence",
      "priorities": ["stated priority 1", "stated priority 2"]
    }
  ],

  "strategic_priorities": [
    "Priority 1 — why it matters to us",
    "Priority 2",
    "Priority 3"
  ],

  "growth_signals": [
    "Signal 1 (source/date if known)",
    "Signal 2"
  ],

  "pain_points": [
    "Pain point 1",
    "Pain point 2"
  ],

  "tech_stack": ["Tool1", "Tool2", "Tool3"],

  "recent_news": [
    { "headline": "...", "date": "Mon YYYY", "why_it_matters": "1 sentence for sales" }
  ],

  "competitive_context": "1-2 sentences on key competitors and where they sit",

  "opportunities": [
    { "title": "Short title", "angle": "Why this is an opening for us right now" }
  ],

  "talking_points": [
    "Opener 1 — tie to their stated priority or prior meeting context",
    "Opener 2 — reference growth signal",
    "Opener 3 — reference pain point or CRM context"
  ],

  "risks": [
    "Risk 1 (budget freeze, competitor, open invoice, etc.)",
    "Risk 2"
  ]
}
`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Could not parse AI response')

    const intel = JSON.parse(jsonMatch[0])

    // ── 6. Cache the result ────────────────────────────────────────────────
    const serviceClient = await createServiceClient()

    await serviceClient
      .from('cb_company_intel')
      .delete()
      .eq('user_id', user.id)
      .ilike('company_name', company)

    await serviceClient.from('cb_company_intel').insert({
      user_id:      user.id,
      contact_id:   contact_id ?? null,
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
