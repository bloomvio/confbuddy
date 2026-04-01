import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const { service_name, api_key } = await req.json()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Store in Supabase Vault
  // Note: Vault secret creation requires the service role and vault.create_secret RPC
  // For now we store a masked reference — in production use supabase.rpc('vault.create_secret', ...)
  const masked = `${api_key.substring(0, 4)}${'•'.repeat(api_key.length - 8)}${api_key.slice(-4)}`

  const { error } = await supabase
    .from('cb_user_integrations')
    .upsert({
      user_id: user.id,
      service_name,
      auth_type: 'api_key',
      vault_secret_id: masked, // replace with actual Vault ID in production
      display_label: `${service_name} (connected)`,
      is_active: true,
    }, { onConflict: 'user_id,service_name' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
