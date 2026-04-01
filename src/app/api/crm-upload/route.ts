import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const filename = file.name
  const buffer = Buffer.from(await file.arrayBuffer())
  let rows: Record<string, string>[] = []

  if (filename.endsWith('.csv')) {
    const text = buffer.toString('utf-8')
    const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })
    rows = result.data
  } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet)
  } else {
    return NextResponse.json({ error: 'Unsupported file type. Use .csv or .xlsx' }, { status: 400 })
  }

  // Helper: case-insensitive column finder
  const findCol = (row: Record<string, string>, ...candidates: string[]) => {
    const keys = Object.keys(row)
    return keys.find(k => candidates.some(c => k.toLowerCase().replace(/[^a-z0-9]/g, '').includes(c.toLowerCase().replace(/[^a-z0-9]/g, '')))) ?? null
  }

  // Helper: parse numeric value (strips $, commas, K/M suffixes)
  const parseNumeric = (val: string | undefined): number | null => {
    if (!val) return null
    const cleaned = String(val).replace(/[$,\s]/g, '')
    if (/[kK]$/.test(cleaned)) return parseFloat(cleaned) * 1_000
    if (/[mM]$/.test(cleaned)) return parseFloat(cleaned) * 1_000_000
    const n = parseFloat(cleaned)
    return isNaN(n) ? null : n
  }

  // Helper: parse integer
  const parseInteger = (val: string | undefined): number | null => {
    if (!val) return null
    const n = parseInt(String(val).replace(/[^0-9]/g, ''), 10)
    return isNaN(n) ? null : n
  }

  // Helper: parse date
  const parseDate = (val: string | undefined): string | null => {
    if (!val) return null
    const d = new Date(val)
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
  }

  // Helper: parse array (comma or semicolon delimited)
  const parseArray = (val: string | undefined): string[] | null => {
    if (!val || String(val).trim() === '') return null
    return String(val).split(/[,;|]/).map(s => s.trim()).filter(Boolean)
  }

  const normalize = (row: Record<string, string>) => {
    const f = (...c: string[]) => { const k = findCol(row, ...c); return k ? row[k] : undefined }

    return {
      user_id:    user.id,
      source_file: filename,

      // Identity
      full_name:  f('name', 'full_name', 'contact', 'person') ?? null,
      company:    f('company', 'account', 'organization', 'org') ?? null,
      email:      f('email') ?? null,
      phone:      f('phone', 'mobile', 'tel') ?? null,
      industry:   f('industry', 'vertical', 'sector') ?? null,
      employee_count: f('employees', 'headcount', 'size', 'employee') ?? null,

      // Relationship
      relationship: f('relationship', 'type', 'status', 'customer') ?? null,
      temperature:  f('temperature', 'priority', 'hot', 'warm', 'cold', 'tier') ?? null,
      account_owner: f('owner', 'rep', 'salesperson', 'ae', 'csm', 'am') ?? null,
      last_contact_date: parseDate(f('last_contact', 'last_touch', 'last_activity', 'lastcontact')),

      // Financial
      arr:             parseNumeric(f('arr', 'annual recurring', 'annual revenue')),
      contract_value:  parseNumeric(f('contract', 'deal', 'contract value', 'tcv', 'acv')),
      outstanding_invoices: parseInteger(f('outstanding invoices', 'open invoices', 'unpaid invoices', 'invoices')),
      outstanding_amount:   parseNumeric(f('outstanding amount', 'overdue', 'unpaid amount', 'balance')),
      renewal_date:    parseDate(f('renewal', 'renewal date', 'expiry', 'contract end')),

      // Service health
      health_score:   f('health', 'health score', 'nps', 'csat', 'satisfaction') ?? null,
      open_issues:    parseArray(f('issues', 'open issues', 'tickets', 'cases', 'problems')),
      products_implemented: parseArray(f('products', 'product', 'modules', 'solutions', 'services')),

      notes: f('notes', 'comments', 'description', 'remarks') ?? null,

      raw_row: row,
    }
  }

  const normalized = rows.map(normalize).filter(r => r.full_name || r.email)

  if (normalized.length === 0) {
    return NextResponse.json({ error: 'No valid contact rows found' }, { status: 400 })
  }

  // Delete existing data from this file, then insert fresh
  await supabase.from('cb_crm_data').delete().eq('user_id', user.id).eq('source_file', filename)
  const { error } = await supabase.from('cb_crm_data').insert(normalized)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, imported: normalized.length, filename })
}
