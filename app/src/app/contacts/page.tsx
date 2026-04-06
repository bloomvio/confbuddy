import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AppShell from '@/components/ui/AppShell'
import ContactsClient from './ContactsClient'

export default async function ContactsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: contacts } = await supabase
    .from('cb_contacts')
    .select('id, full_name, title, company, email, crm_relationship, crm_temperature, pipeline_stage, deal_size, event_name, created_at')
    .order('created_at', { ascending: false })

  return (
    <AppShell>
      <div className="flex flex-col h-full">
        <header className="bg-white border-b border-gray-100 px-4 py-4 flex items-center justify-between flex-shrink-0">
          <h1 className="font-semibold text-gray-900">👥 Contacts</h1>
          <Link href="/contacts/scan" className="btn-primary text-sm py-2 px-4">+ Scan Badge</Link>
        </header>
        <ContactsClient contacts={contacts ?? []} />
      </div>
    </AppShell>
  )
}
