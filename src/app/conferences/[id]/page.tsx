import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import AppShell from '@/components/ui/AppShell'
import ConferenceDetail from './ConferenceDetail'

export default async function ConferencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [
    { data: conference },
    { data: documents },
    { data: attendees },
    { data: meetings },
  ] = await Promise.all([
    supabase.from('cb_conferences').select('*').eq('id', id).eq('user_id', user.id).single(),
    supabase.from('cb_conference_documents').select('*').eq('conference_id', id).order('created_at', { ascending: false }),
    supabase.from('cb_conference_attendees').select('*').eq('conference_id', id).order('is_target', { ascending: false }),
    supabase
      .from('cb_meetings')
      .select('*, contact:cb_contacts(full_name, company)')
      .eq('conference_id', id)
      .order('meeting_date', { ascending: false }),
  ])

  if (!conference) notFound()

  return (
    <AppShell>
      <ConferenceDetail
        conference={conference}
        documents={documents ?? []}
        attendees={attendees ?? []}
        meetings={meetings ?? []}
      />
    </AppShell>
  )
}
