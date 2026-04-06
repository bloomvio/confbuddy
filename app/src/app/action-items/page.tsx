import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AppShell from '@/components/ui/AppShell'
import ActionItemsClient from './ActionItemsClient'

export default async function ActionItemsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const today = new Date().toISOString().split('T')[0]

  const [{ data: overdue }, { data: upcoming }, { data: completed }] = await Promise.all([
    supabase
      .from('cb_action_items')
      .select('*, meeting:cb_meetings(id, meeting_date, contact:cb_contacts(full_name, company))')
      .eq('user_id', user.id)
      .eq('is_complete', false)
      .lt('due_date', today)
      .order('due_date', { ascending: true })
      .limit(20),

    supabase
      .from('cb_action_items')
      .select('*, meeting:cb_meetings(id, meeting_date, contact:cb_contacts(full_name, company))')
      .eq('user_id', user.id)
      .eq('is_complete', false)
      .gte('due_date', today)
      .order('due_date', { ascending: true })
      .limit(30),

    supabase
      .from('cb_action_items')
      .select('*, meeting:cb_meetings(id, meeting_date, contact:cb_contacts(full_name, company))')
      .eq('user_id', user.id)
      .eq('is_complete', true)
      .order('updated_at', { ascending: false })
      .limit(10),
  ])

  // Also pull items with no due date
  const { data: noDueDate } = await supabase
    .from('cb_action_items')
    .select('*, meeting:cb_meetings(id, meeting_date, contact:cb_contacts(full_name, company))')
    .eq('user_id', user.id)
    .eq('is_complete', false)
    .is('due_date', null)
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <AppShell>
      <div className="px-4 md:px-8 py-5 max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-gray-900">✅ Action Items</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {(overdue?.length ?? 0) + (upcoming?.length ?? 0) + (noDueDate?.length ?? 0)} open ·{' '}
              {overdue?.length ?? 0} overdue
            </p>
          </div>
          <Link href="/dashboard" className="text-xs text-indigo-600 font-medium hover:underline">
            ← Dashboard
          </Link>
        </div>

        <ActionItemsClient
          overdue={overdue ?? []}
          upcoming={upcoming ?? []}
          noDueDate={noDueDate ?? []}
          completed={completed ?? []}
        />
      </div>
    </AppShell>
  )
}
