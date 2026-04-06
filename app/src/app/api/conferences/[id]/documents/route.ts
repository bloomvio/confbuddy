import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('cb_conference_documents')
    .select('*')
    .eq('conference_id', id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ documents: data ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: conference_id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file      = formData.get('file')      as File
  const file_type = (formData.get('file_type') as string) ?? 'other'

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const filename = file.name
  const buffer   = Buffer.from(await file.arrayBuffer())

  let extracted_text: string | null = null
  let row_count: number | null = null

  // ── Extract text based on file type ─────────────────────────────────────────
  if (filename.endsWith('.csv')) {
    const text   = buffer.toString('utf-8')
    const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })
    row_count     = result.data.length
    // Convert CSV to readable text for AI context
    extracted_text = csvToText(result.data as Record<string, string>[], filename)

  } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheet    = workbook.Sheets[workbook.SheetNames[0]]
    const rows     = XLSX.utils.sheet_to_json<Record<string, string>>(sheet)
    row_count      = rows.length
    extracted_text = csvToText(rows, filename)

  } else if (filename.endsWith('.txt') || filename.endsWith('.md')) {
    extracted_text = buffer.toString('utf-8').substring(0, 20000)

  } else if (filename.endsWith('.pdf')) {
    // Use Claude's PDF support to extract text
    try {
      const base64 = buffer.toString('base64')
      const response = await anthropic.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64 },
            } as { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } },
            {
              type: 'text',
              text: 'Extract all meaningful text from this document. Preserve structure. Return plain text only.',
            },
          ],
        }],
      })
      extracted_text = response.content[0].type === 'text' ? response.content[0].text : null
    } catch (e) {
      console.error('PDF extraction failed:', e)
      extracted_text = `[PDF document: ${filename} — text extraction failed]`
    }
  }

  // ── Upload file to Supabase Storage ──────────────────────────────────────────
  const serviceClient  = await createServiceClient()
  const storage_path   = `documents/${user.id}/${conference_id}/${Date.now()}_${filename}`

  const { error: uploadError } = await serviceClient.storage
    .from('confbuddy-documents')
    .upload(storage_path, buffer, { contentType: file.type || 'application/octet-stream' })

  if (uploadError) {
    console.error('Storage upload failed:', uploadError)
    // Still continue — extracted text is what matters for intel
  }

  // ── Save document record ──────────────────────────────────────────────────────
  const { data: doc, error } = await serviceClient
    .from('cb_conference_documents')
    .insert({
      conference_id,
      user_id:        user.id,
      filename,
      file_type,
      storage_path:   uploadError ? null : storage_path,
      extracted_text,
      row_count,
      processed_at:   new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ document: doc })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: conference_id } = await params
  const { searchParams } = new URL(req.url)
  const doc_id = searchParams.get('doc_id')
  if (!doc_id) return NextResponse.json({ error: 'doc_id required' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await supabase
    .from('cb_conference_documents')
    .delete()
    .eq('id', doc_id)
    .eq('conference_id', conference_id)
    .eq('user_id', user.id)

  return NextResponse.json({ success: true })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function csvToText(rows: Record<string, string>[], filename: string): string {
  if (rows.length === 0) return `[Empty file: ${filename}]`
  const headers = Object.keys(rows[0])
  const lines = rows.slice(0, 200).map(r =>
    headers.map(h => `${h}: ${r[h] ?? ''}`).join(' | ')
  )
  return `File: ${filename}\nColumns: ${headers.join(', ')}\nRows (${rows.length} total):\n${lines.join('\n')}`
}
