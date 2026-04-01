import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { image } = await req.json()
  if (!image) return NextResponse.json({ error: 'No image provided' }, { status: 400 })

  // Strip data URL prefix if present
  const base64 = image.replace(/^data:image\/\w+;base64,/, '')

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
          },
          {
            type: 'text',
            text: `This is a photo of a conference name badge. Extract the contact information and return ONLY valid JSON with these fields:
{
  "full_name": "...",
  "first_name": "...",
  "last_name": "...",
  "title": "...",
  "company": "...",
  "email": "...",
  "phone": "...",
  "capture_method": "ocr",
  "ocr_confidence": 0.0-1.0
}
Use null for fields not visible. Be precise with name spelling.`,
          }
        ]
      }]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Could not parse badge')

    const contact = JSON.parse(jsonMatch[0])
    return NextResponse.json({ contact })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'OCR failed' }, { status: 500 })
  }
}
