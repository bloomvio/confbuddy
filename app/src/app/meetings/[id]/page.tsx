import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import MeetingDetail from './MeetingDetail'

export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ data: meeting }, { data: notes }, { data: actionItems }] = await Promise.all([
    supabase.from('cb_meetings').select('*, contact:cb_contacts(*)').eq('id', id).single(),
    supabase.from('cb_meeting_notes').select('*').eq('meeting_id', id).single(),
    supabase.from('cb_action_items').select('*').eq('meeting_id', id).order('created_at'),
  ])

  if (!meeting) notFound()

  return <MeetingDetail meeting={meeting} notes={notes} actionItems={actionItems ?? []} />
}
