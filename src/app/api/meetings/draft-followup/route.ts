import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { meeting_id } = await req.json()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: meeting }, { data: notes }, { data: actionItems }] = await Promise.all([
    supabase.from('cb_meetings').select('*, contact:cb_contacts(*)').eq('id', meeting_id).single(),
    supabase.from('cb_meeting_notes').select('*').eq('meeting_id', meeting_id).single(),
    supabase.from('cb_action_items').select('*').eq('meeting_id', meeting_id).order('created_at'),
  ])

  if (!meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })

  const contact = meeting.contact as Record<string, string> | null
  const meetingDate = new Date(meeting.meeting_date).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  const actionList = (actionItems ?? [])
    .map((a, i) => `${i + 1}. ${a.description}${a.owner ? ` (Owner: ${a.owner})` : ''}${a.due_date ? ` — due ${a.due_date}` : ''}`)
    .join('\n')

  const prompt = `You are writing a professional follow-up email on behalf of a sales representative after a business meeting.

MEETING DATE: ${meetingDate}
CONTACT: ${contact?.full_name ?? 'the contact'}, ${contact?.title ?? ''} at ${contact?.company ?? 'their company'}
RELATIONSHIP: ${contact?.crm_relationship ?? 'unknown'} (${contact?.crm_temperature ?? 'unknown'} temperature)

MEETING SUMMARY:
${notes?.bottom_line_summary ?? meeting.typed_notes ?? 'No notes available'}

MEETING INTENT:
${notes?.intent ?? ''}

ACTION ITEMS AGREED:
${actionList || 'No specific action items captured'}

Write a concise, warm, professional follow-up email. It should:
- Open with a genuine personal reference to something discussed (not generic)
- Briefly recap the key points agreed
- List action items clearly (if any)
- Have a clear, low-friction next step
- Sound human and confident — not template-y or salesy
- Be SHORT (under 200 words body)

Return JSON only:
{
  "subject": "...",
  "to_name": "${contact?.full_name ?? ''}",
  "body": "Full email body with line breaks as \\n"
}`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Could not parse response')

    const draft = JSON.parse(jsonMatch[0])
    return NextResponse.json({
      draft,
      to_email: contact?.email ?? null,
    })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Draft generation failed' },
      { status: 500 }
    )
  }
}
