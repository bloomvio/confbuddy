import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

interface SfTokens {
  access_token: string
  refresh_token: string
  instance_url: string
}

async function getValidTokens(tokens: SfTokens): Promise<SfTokens> {
  // Try refresh to get a fresh access token
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
  if (refreshed.access_token) {
    return { ...tokens, access_token: refreshed.access_token }
  }
  return tokens
}

async function sfQuery(tokens: SfTokens, soql: string) {
  const res = await fetch(
    `${tokens.instance_url}/services/data/v59.0/query?q=${encodeURIComponent(soql)}`,
    { headers: { Authorization: `Bearer ${tokens.access_token}` } }
  )
  if (!res.ok) throw new Error(`Salesforce query failed: ${res.status} ${await res.text()}`)
  return res.json()
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Load integration
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

  // ── Query Contacts (existing customers / known contacts) ─────────────────
  const contactSoql = `
    SELECT Id, FirstName, LastName, Title, Email, Phone,
           Account.Name, Account.Industry, Account.AnnualRevenue,
           Account.NumberOfEmployees, Account.BillingCity,
           Account.BillingCountry, OwnerId, Owner.Name,
           LastActivityDate, Description
    FROM Contact
    ORDER BY LastActivityDate DESC NULLS LAST
    LIMIT 500
  `.trim().replace(/\s+/g, ' ')

  // ── Query Leads (prospects not yet converted) ────────────────────────────
  const leadSoql = `
    SELECT Id, FirstName, LastName, Title, Email, Phone,
           Company, Industry, AnnualRevenue, NumberOfEmployees,
           City, Country, OwnerId, Owner.Name,
           LastActivityDate, Description, Status, LeadSource
    FROM Lead
    WHERE IsConverted = false
    ORDER BY LastActivityDate DESC NULLS LAST
    LIMIT 500
  `.trim().replace(/\s+/g, ' ')

  const [contactsResult, leadsResult] = await Promise.all([
    sfQuery(tokens, contactSoql).catch(() => ({ records: [] })),
    sfQuery(tokens, leadSoql).catch(() => ({ records: [] })),
  ])

  const contacts = contactsResult.records ?? []
  const leads    = leadsResult.records    ?? []

  // ── Map to cb_crm_data ───────────────────────────────────────────────────
  const rows = [
    ...contacts.map((c: Record<string, unknown>) => {
      const account = c.Account as Record<string, unknown> | null
      const owner = c.Owner as Record<string, unknown> | null
      return {
        user_id:      user.id,
        source_file:  'salesforce',
        full_name:    [c.FirstName, c.LastName].filter(Boolean).join(' ') || null,
        company:      (account?.Name as string) ?? null,
        email:        (c.Email as string) ?? null,
        phone:        (c.Phone as string) ?? null,
        relationship: 'customer',
        temperature:  null,
        account_owner: (owner?.Name as string) ?? null,
        last_contact_date: (c.LastActivityDate as string) ?? null,
        notes:        (c.Description as string) ?? null,
        raw_row: {
          sf_id:           c.Id,
          sf_type:         'Contact',
          title:           c.Title,
          industry:        account?.Industry,
          annual_revenue:  account?.AnnualRevenue,
          employee_count:  account?.NumberOfEmployees,
          city:            account?.BillingCity,
          country:         account?.BillingCountry,
        },
      }
    }),

    ...leads.map((l: Record<string, unknown>) => {
      const owner = l.Owner as Record<string, unknown> | null
      return {
        user_id:      user.id,
        source_file:  'salesforce',
        full_name:    [l.FirstName, l.LastName].filter(Boolean).join(' ') || null,
        company:      (l.Company as string) ?? null,
        email:        (l.Email as string) ?? null,
        phone:        (l.Phone as string) ?? null,
        relationship: 'prospect',
        temperature:  leadTempFromStatus(l.Status as string),
        account_owner: (owner?.Name as string) ?? null,
        last_contact_date: (l.LastActivityDate as string) ?? null,
        notes:        (l.Description as string) ?? null,
        raw_row: {
          sf_id:          l.Id,
          sf_type:        'Lead',
          title:          l.Title,
          industry:       l.Industry,
          annual_revenue: l.AnnualRevenue,
          employee_count: l.NumberOfEmployees,
          city:           l.City,
          country:        l.Country,
          status:         l.Status,
          lead_source:    l.LeadSource,
        },
      }
    }),
  ]

  // ── Upsert: replace previous Salesforce import ───────────────────────────
  const serviceClient = await createServiceClient()

  await serviceClient
    .from('cb_crm_data')
    .delete()
    .eq('user_id', user.id)
    .eq('source_file', 'salesforce')

  if (rows.length > 0) {
    const { error } = await serviceClient.from('cb_crm_data').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update last_synced_at and persist refreshed token
  await serviceClient.from('cb_user_integrations').update({
    last_synced_at: new Date().toISOString(),
    vault_secret_id: JSON.stringify(tokens),
  }).eq('user_id', user.id).eq('service_name', 'salesforce')

  return NextResponse.json({
    success: true,
    imported: rows.length,
    contacts: contacts.length,
    leads: leads.length,
  })
}

function leadTempFromStatus(status: string | undefined): string {
  if (!status) return 'unknown'
  const s = status.toLowerCase()
  if (s.includes('hot') || s.includes('working') || s.includes('qualified')) return 'hot'
  if (s.includes('warm') || s.includes('contacted') || s.includes('open')) return 'warm'
  if (s.includes('cold') || s.includes('unqualified') || s.includes('closed')) return 'cold'
  return 'warm'
}
