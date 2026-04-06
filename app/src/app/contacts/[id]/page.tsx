import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import AppShell from '@/components/ui/AppShell'
import ContactDetail from './ContactDetail'

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [
    { data: contact },
    { data: meetings },
  ] = await Promise.all([
    supabase.from('cb_contacts').select('*').eq('id', id).single(),
    supabase
      .from('cb_meetings')
      .select('*, cb_meeting_notes(bottom_line_summary)')
      .eq('contact_id', id)
      .order('meeting_date', { ascending: false }),
  ])

  if (!contact) notFound()

  // Check cache for THIS company specifically (not just "most recent")
  const { data: cachedIntel } = contact.company
    ? await supabase
        .from('cb_company_intel')
        .select('intel, generated_at')
        .eq('user_id', user.id)
        .ilike('company_name', contact.company)
        .order('generated_at', { ascending: false })
        .limit(1)
        .single()
    : { data: null }

  const intelAgeHours = cachedIntel
    ? (Date.now() - new Date(cachedIntel.generated_at).getTime()) / 3_600_000
    : Infinity

  const freshIntel = intelAgeHours < 24 ? (cachedIntel?.intel ?? null) : null

  // Tell the client to auto-generate if no fresh cache and we have a company name
  const shouldAutoGenerate = !freshIntel && !!contact.company

  return (
    <AppShell>
      <ContactDetail
        contact={contact}
        meetings={meetings ?? []}
        cachedIntel={freshIntel}
        shouldAutoGenerate={shouldAutoGenerate}
      />
    </AppShell>
  )
}
