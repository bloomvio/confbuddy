import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { meeting_id } = await req.json()
  if (!meeting_id) return NextResponse.json({ error: 'Missing meeting_id' }, { status: 400 })

  const supabase = await createServiceClient()

  // Fetch meeting + contact
  const { data: meeting } = await supabase
    .from('cb_meetings')
    .select('*, contact:cb_contacts(*)')
    .eq('id', meeting_id)
    .single()

  if (!meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })

  const contact = meeting.contact
  const transcript = meeting.transcript_raw ?? meeting.typed_notes ?? ''

  if (!transcript) {
    await supabase.from('cb_meetings').update({ status: 'notes_ready' }).eq('id', meeting_id)
    return NextResponse.json({ skipped: 'No content to process' })
  }

  const prompt = `You are an expert business meeting analyst. Analyze this meeting transcript/notes and produce structured output.

CONTACT INFO:
- Name: ${contact?.full_name ?? 'Unknown'}
- Title: ${contact?.title ?? 'Unknown'}
- Company: ${contact?.company ?? 'Unknown'}
- Relationship: ${contact?.crm_relationship ?? 'unknown'} (${contact?.crm_temperature ?? 'unknown'} temperature)
- Products implemented: ${JSON.stringify(contact?.crm_products_implemented ?? [])}
- CRM context: ${contact?.crm_notes ?? 'None'}

MEETING TRANSCRIPT / NOTES:
${transcript}

Also classify this meeting into exactly one of two interaction types:
- "meaningful_interaction": the conversation went beyond surface-level. It qualifies if ANY of these are present: the rep learned real details about what the prospect/customer is doing in their IT landscape (systems, tools, architecture, integrations, pain points, initiatives); a decision maker (or someone who influences the buying decision) was in the loop; there was a clear intent to set up a follow-up meeting or next step; or a genuine business need, budget, or timeline was discussed.
- "interaction": a brief, generic, or surface-level exchange — introductions, small talk, booth chatter, or a hand-off with none of the depth above.
When in doubt, and none of the "meaningful_interaction" signals are clearly present, classify it as "interaction".

Produce this JSON (no markdown, just JSON):
{
  "bottom_line_summary": "3-5 bullet points as a single string, each bullet starting with •",
  "intent": "1-2 sentences on what this meeting was about and what was achieved",
  "interaction_type": "interaction" or "meaningful_interaction",
  "interaction_rationale": "1 sentence explaining why this classification was chosen, citing the specific signal(s)",
  "raw_notes": "Clean, lightly edited version of the transcript preserving key details",
  "action_items": [
    { "description": "...", "owner": "...", "due_date": "YYYY-MM-DD or null" }
  ]
}`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Could not parse AI response')

    const notes = JSON.parse(jsonMatch[0])

    // Normalize the interaction classification; default to 'interaction'
    const interactionType =
      notes.interaction_type === 'meaningful_interaction' ? 'meaningful_interaction' : 'interaction'

    // Save meeting notes
    const { data: savedNotes } = await supabase
      .from('cb_meeting_notes')
      .insert({
        meeting_id,
        user_id: meeting.user_id,
        bottom_line_summary: notes.bottom_line_summary,
        intent: notes.intent,
        interaction_type: interactionType,
        interaction_rationale: notes.interaction_rationale ?? null,
        raw_notes: notes.raw_notes,
        generated_at: new Date().toISOString(),
      })
      .select()
      .single()

    // Save action items
    if (notes.action_items?.length > 0) {
      await supabase.from('cb_action_items').insert(
        notes.action_items.map((a: { description: string; owner: string; due_date: string }) => ({
          meeting_id,
          user_id: meeting.user_id,
          description: a.description,
          owner: a.owner,
          due_date: a.due_date,
        }))
      )
    }

    // Update meeting status
    await supabase.from('cb_meetings').update({ status: 'notes_ready' }).eq('id', meeting_id)

    return NextResponse.json({ success: true, notes_id: savedNotes?.id })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Note generation failed' }, { status: 500 })
  }
}
