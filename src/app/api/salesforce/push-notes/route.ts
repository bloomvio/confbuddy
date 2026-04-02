import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface SfTokens {
  access_token: string
  refresh_token: string
  instance_url: string
}

async function getValidTokens(tokens: SfTokens): Promise<SfTokens> {
  const res = await fetch('https://login.salesforce.com/services/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     process.env.SALESFORCE_CLIENT_ID!,
      client_secret: process.env.SALESFORCE_CLIENT_SECRET!,
      refresh_token: tokens.refresh_token,
    }),
  })
  const refreshed = await res.json()
  if (refreshed.access_token) return { ...tokens, access_token: refreshed.access_token }
  return tokens
}

export async function POST(req: NextRequest) {
  const { meeting_id } = await req.json()
  if (!meeting_id) return NextResponse.json({ error: 'Missing meeting_id' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Load Salesforce integration
  const { data: integration } = await supabase
    .from('cb_user_integrations')
    .select('*')
    .eq('user_id', user.id)
    .eq('service_name', 'salesforce')
    .eq('is_active', true)
    .single()

  if (!integration?.vault_secret_id) {
    return NextResponse.json({ error: 'Salesforce not connected' }, { status: 400 })
  }

  let tokens: SfTokens
  try {
    tokens = JSON.parse(integration.vault_secret_id)
  } catch {
    return NextResponse.json({ error: 'Invalid stored credentials' }, { status: 400 })
  }

  tokens = await getValidTokens(tokens)

  // Load meeting + notes + contact
  const [{ data: meeting }, { data: notes }] = await Promise.all([
    supabase
      .from('cb_meetings')
      .select('*, contact:cb_contacts(*)')
      .eq('id', meeting_id)
      .single(),
    supabase
      .from('cb_meeting_notes')
      .select('*')
      .eq('meeting_id', meeting_id)
      .single(),
  ])

  if (!meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })

  const contact = meeting.contact as Record<string, string> | null
  const contactEmail = contact?.email

  // ── Find Salesforce Contact or Lead by email ─────────────────────────────
  let sfWhoId: string | null = null

  if (contactEmail) {
    // Try Contact first
    const contactSearch = await fetch(
      `${tokens.instance_url}/services/data/v59.0/query?q=${encodeURIComponent(
        `SELECT Id FROM Contact WHERE Email = '${contactEmail.replace(/'/g, "\\'")}' LIMIT 1`
      )}`,
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    )
    const contactData = await contactSearch.json()
    sfWhoId = contactData.records?.[0]?.Id ?? null

    // Fall back to Lead
    if (!sfWhoId) {
      const leadSearch = await fetch(
        `${tokens.instance_url}/services/data/v59.0/query?q=${encodeURIComponent(
          `SELECT Id FROM Lead WHERE Email = '${contactEmail.replace(/'/g, "\\'")}' AND IsConverted = false LIMIT 1`
        )}`,
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      )
      const leadData = await leadSearch.json()
      sfWhoId = leadData.records?.[0]?.Id ?? null
    }
  }

  // ── Build Task description ───────────────────────────────────────────────
  const meetingDate = new Date(meeting.meeting_date).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  const summary = notes?.bottom_line_summary ?? meeting.typed_notes ?? 'No notes available'

  const actionItems = await supabase
    .from('cb_action_items')
    .select('description, owner, due_date')
    .eq('meeting_id', meeting_id)
    .order('created_at')

  const actionList = (actionItems.data ?? [])
    .map((a, i) => `${i + 1}. ${a.description}${a.owner ? ` (${a.owner})` : ''}${a.due_date ? ` — due ${a.due_date}` : ''}`)
    .join('\n')

  const description = [
    `Meeting Date: ${meetingDate}`,
    `Contact: ${contact?.full_name ?? 'Unknown'}${contact?.company ? ` · ${contact.company}` : ''}`,
    '',
    'Summary:',
    summary,
    ...(actionList ? ['', 'Action Items:', actionList] : []),
    '',
    'Logged by ConfBuddy',
  ].join('\n')

  // ── Create Salesforce Task ───────────────────────────────────────────────
  const taskPayload: Record<string, unknown> = {
    Subject:        `Meeting: ${contact?.full_name ?? 'Conference Contact'} — ${meetingDate}`,
    Description:    description,
    Status:         'Completed',
    Priority:       'Normal',
    ActivityDate:   meeting.meeting_date.split('T')[0],
    Type:           'Meeting',
  }
  if (sfWhoId) taskPayload.WhoId = sfWhoId

  const taskRes = await fetch(
    `${tokens.instance_url}/services/data/v59.0/sobjects/Task`,
    {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(taskPayload),
    }
  )

  const taskData = await taskRes.json()

  if (!taskRes.ok) {
    return NextResponse.json(
      { error: taskData[0]?.message ?? 'Failed to create Salesforce Task' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    task_id: taskData.id,
    linked_to_contact: !!sfWhoId,
  })
}
