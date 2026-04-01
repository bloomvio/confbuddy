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
    { data: cachedIntel },
  ] = await Promise.all([
    supabase.from('cb_contacts').select('*').eq('id', id).single(),

    supabase
      .from('cb_meetings')
      .select('*, cb_meeting_notes(bottom_line_summary)')
      .eq('contact_id', id)
      .order('meeting_date', { ascending: false }),

    // Pre-load any cached company intel (avoids client-side fetch on first render)
    supabase
      .from('cb_company_intel')
      .select('intel, generated_at')
      .eq('user_id', user.id)
      .order('generated_at', { ascending: false })
      .limit(1)
      .single(),
  ])

  if (!contact) notFound()

  // Only pass intel if it's fresh (< 24 h)
  const intelAge = cachedIntel
    ? (Date.now() - new Date(cachedIntel.generated_at).getTime()) / 3_600_000
    : Infinity
  const freshIntel = intelAge < 24 ? cachedIntel?.intel ?? null : null

  return (
    <AppShell>
      <ContactDetail
        contact={contact}
        meetings={meetings ?? []}
        cachedIntel={freshIntel}
      />
    </AppShell>
  )
}
