import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CACHE_TTL_HOURS = 24

export async function POST(req: NextRequest) {
  const { contact_id, company, force_refresh, conference_id } = await req.json()
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
    conferenceDocs,
  ] = await Promise.all([
    // Source 1: CRM data (CSV/Excel uploads + Salesforce sync)
    supabase
      .from('cb_crm_data')
      .select('*')
      .ilike('company', `%${company}%`)
      .limit(20),

    // Source 2: Contact being met
    contact_id
      ? supabase
          .from('cb_contacts')
          .select('full_name, title, company, email, crm_relationship, crm_temperature, crm_notes, crm_products_implemented, systems_landscape')
          .eq('id', contact_id)
          .single()
      : Promise.resolve({ data: null }),

    // Source 3: Past meeting notes
    contact_id
      ? supabase
          .from('cb_meetings')
          .select('meeting_date, cb_meeting_notes(bottom_line_summary, intent)')
          .eq('contact_id', contact_id)
          .eq('status', 'notes_ready')
          .order('meeting_date', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: null }),

    // Source 4: Conference documents (battlecards, product sheets, competitor intel)
    conference_id
      ? supabase
          .from('cb_conference_documents')
          .select('filename, file_type, extracted_text')
          .eq('conference_id', conference_id)
          .not('extracted_text', 'is', null)
          .not('file_type', 'in', '("attendee_list","crm_export")')
          .limit(5)
      : Promise.resolve({ data: null }),
  ])

  const contactInfo = contactResult.data ?? null
  const pastMeetings = (meetingNotesResult.data ?? []) as Array<{
    meeting_date: string
    cb_meeting_notes: Array<{ bottom_line_summary: string; intent: string }>
  }>
  const docs = (conferenceDocs.data ?? []) as Array<{
    filename: string; file_type: string; extracted_text: string
  }>

  // ── 3. Format data sources ───────────────────────────────────────────────
  const crmSummary = crmRows?.length ? crmRows.map(r => ({
    name: r.full_name, relationship: r.relationship, temperature: r.temperature,
    products: r.products_implemented, arr: r.arr, contract_value: r.contract_value,
    outstanding_invoices: r.outstanding_invoices, outstanding_amount: r.outstanding_amount,
    open_issues: r.open_issues, health_score: r.health_score, renewal_date: r.renewal_date,
    account_owner: r.account_owner, last_contact: r.last_contact_date, notes: r.notes,
    extra: r.raw_row,
  })) : null

  const meetingHistory = pastMeetings
    .map(m => ({
      date: m.meeting_date?.split('T')[0],
      summary: m.cb_meeting_notes?.[0]?.bottom_line_summary ?? null,
      intent:  m.cb_meeting_notes?.[0]?.intent ?? null,
    }))
    .filter(m => m.summary || m.intent)

  const docsContext = docs.length > 0
    ? docs.map(d => `[${d.file_type.toUpperCase()} — ${d.filename}]\n${(d.extracted_text ?? '').substring(0, 3000)}`).join('\n\n---\n\n')
    : null

  // ── 4. Build prompt ──────────────────────────────────────────────────────
  const prompt = `You are a senior B2B sales intelligence analyst. Build the most actionable brief possible for a sales professional about to meet someone from "${company}".

━━━ SOURCE 1: INTERNAL CRM (ground truth — do not estimate or overwrite) ━━━
${crmSummary ? JSON.stringify(crmSummary, null, 2) : 'No CRM records.'}

━━━ SOURCE 2: CONTACT BEING MET ━━━
${contactInfo ? JSON.stringify(contactInfo, null, 2) : 'Unknown'}

━━━ SOURCE 3: PAST MEETING HISTORY ━━━
${meetingHistory.length > 0 ? JSON.stringify(meetingHistory, null, 2) : 'No prior meetings.'}

━━━ SOURCE 4: CONFERENCE DOCUMENTS (battlecards, product sheets, etc.) ━━━
${docsContext ?? 'No conference documents uploaded.'}

━━━ SOURCE 5: PUBLIC / MARKET KNOWLEDGE ━━━
Use your training knowledge for company background, financials, leadership, news, tech stack, competitors. Mark estimates with (~).

INSTRUCTIONS:
- internal_brief: Combine CRM + Salesforce + past meetings + doc context. Use exact CRM values — never estimate these.
- public_brief: Use your training knowledge for market context. Mark estimates.
- talking_points: Must reference BOTH internal signals AND public context.
- If a past meeting had open action items or next steps, surface them in relationship_history.

Return ONLY valid JSON:
{
  "snapshot": "One crisp sentence: what they do and who they serve",
  "industry": "...",
  "hq": "City, Country",
  "founded": "YYYY",
  "size": "~X,000 employees",
  "public_or_private": "Public (TICKER) | Private",

  "internal_brief": {
    "account_status":   "customer | prospect | partner | churned | unknown",
    "temperature":      "hot | warm | cold | unknown",
    "arr":              "from CRM or null",
    "contract_value":   "from CRM or null",
    "products_in_use":  ["from CRM"],
    "account_owner":    "from CRM or null",
    "last_contact":     "from CRM or null",
    "renewal_date":     "from CRM or null",
    "outstanding_invoices": 0,
    "outstanding_amount":   "from CRM or null",
    "open_issues":      ["from CRM"],
    "health":           "green | yellow | red | unknown",
    "crm_notes":        "key context from CRM notes",
    "relationship_history": "Summary of prior meetings, open threads, prior commitments. null if no history.",
    "doc_highlights":   "Key relevant points from conference documents (battlecards, product sheets). null if no docs."
  },

  "public_brief": {
    "financials": {
      "revenue_estimate": "$XXM (~)",
      "growth_rate":      "~XX% YoY",
      "funding":          "Series X, $XXM | Bootstrapped | Public",
      "valuation":        "$XXM (~)"
    },
    "leadership": [
      { "name": "...", "role": "CEO|CFO|CTO", "background": "1 sentence", "priorities": ["priority 1"] }
    ],
    "strategic_priorities": ["Priority 1 — relevance to us", "Priority 2"],
    "growth_signals":       ["Signal 1", "Signal 2"],
    "pain_points":          ["Pain 1", "Pain 2"],
    "tech_stack":           ["Tool1", "Tool2"],
    "recent_news": [
      { "headline": "...", "date": "Mon YYYY", "why_it_matters": "1 sentence" }
    ],
    "competitive_context": "1-2 sentences"
  },

  "talking_points": [
    "Point referencing internal signal (CRM/meeting history) + external hook",
    "Point referencing their strategic priority",
    "Point referencing growth signal or pain point"
  ],
  "opportunities": [
    { "title": "Short title", "angle": "Why this is an opening right now" }
  ],
  "risks": [
    "Risk 1 (open invoice, competitor, budget freeze, etc.)"
  ]
}
`

  try {
    const response = await anthropic.messages.create({
      model:      'claude-opus-4-6',
      max_tokens: 4000,
      messages:   [{ role: 'user', content: prompt }],
    })

    const text      = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Could not parse AI response')

    const intel = JSON.parse(jsonMatch[0])

    // ── 5. Cache the result ────────────────────────────────────────────────
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
